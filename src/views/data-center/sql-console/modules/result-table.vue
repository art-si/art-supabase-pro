<template>
  <div class="result-table-container flex h-full min-h-0 flex-col" @keydown="handleDraftKeydown">
    <div
      class="sql-result-tools flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-g-200 px-3 py-2"
    >
      <span class="min-w-0 text-xs text-g-700" role="status">{{
        editMode
          ? `编辑副本 · 已修改 ${records.changes.length} 行 / ${changeCount} 处`
          : `本次已加载 ${data.length} 行 · ${columns.length} 列`
      }}</span>
      <div class="flex flex-wrap items-center gap-2">
        <template v-if="editMode">
          <ElCheckbox v-model="onlyChanged" size="small">仅看修改</ElCheckbox>
          <ArtIconButton
            size="small"
            icon="ri:arrow-go-back-line"
            label="撤销结果修改"
            :disabled="!canUndo"
            @click="tableRef?.undo()"
          />
          <ArtIconButton
            size="small"
            icon="ri:arrow-go-forward-line"
            label="重做结果修改"
            :disabled="!canRedo"
            @click="tableRef?.redo()"
          />
          <ElButton size="small" :disabled="!changeCount" @click="validateDraft(true)"
            ><ArtSvgIcon icon="ri:checkbox-circle-line" />校验</ElButton
          >
          <ElButton size="small" type="primary" :disabled="!changeCount" @click="reviewChanges"
            ><ArtSvgIcon icon="ri:git-pull-request-line" />变更预览</ElButton
          >
          <ArtIconButton
            size="small"
            icon="ri:restart-line"
            label="还原全部结果修改"
            :disabled="!changeCount"
            @click="resetDraft"
          />
          <ElButton size="small" @click="exitEditing">退出编辑</ElButton>
        </template>
        <ElButton
          v-else
          size="small"
          :loading="analyzing"
          :disabled="loading || !data.length"
          @click="startEditing"
          ><ArtSvgIcon icon="ri:edit-line" />编辑副本</ElButton
        >
      </div>
    </div>
    <div
      v-if="editMode"
      class="flex shrink-0 flex-wrap items-center justify-between gap-2 bg-g-100 px-3 py-1.5 text-xs leading-5 text-g-700"
    >
      <span
        >双击或 F2 打开类型编辑器 · Enter / Ctrl+Enter 保留 · Esc
        取消。已识别的主键与租户字段锁定；修改仅在本地。</span
      >
      <span v-if="validationMessage" class="text-danger" role="alert">{{ validationMessage }}</span>
      <span v-else-if="validationPassed" class="text-success" role="status"
        >基础校验通过，业务约束仍需在目标数据库确认</span
      >
    </div>
    <div class="min-h-0 flex-1">
      <ArtTable
        ref="tableRef"
        table-layout="fixed"
        :loading="loading"
        :data="tableData"
        client-pagination
        scrollbar-always-on
        :virtual-scroll="resultVirtualScroll"
        :pagination="{
          current: currentPage,
          size: pageSize,
          total: onlyChanged ? records.updateRecords.length : data.length
        }"
        :pagination-options="{ pageSizes: [20, 50, 100, 200] }"
        :columns="tableColumns"
        :edit-config="
          editMode
            ? { enabled: true, trigger: 'dblclick', mode: 'cell', editor: 'external', onlyChanged }
            : undefined
        "
        :keep-source="editMode"
        :edit-rules="editMode ? editRules : undefined"
        :empty-text="onlyChanged ? '当前副本没有字段修改' : '暂无数据'"
        :cell-class-name="cellClassName"
        :show-table-header="false"
        border
        class="h-full"
        @cell-click="handleCellClick"
        @cell-contextmenu="handleCellContextMenu"
        @edit-change="handleEditChange"
        @edit-activated="openCellEditor"
        @pagination:current-change="currentPage = $event"
        @pagination:size-change="changePageSize"
      />
    </div>

    <!-- Context Menu -->
    <ArtMenuRight
      ref="menuRef"
      :menu-items="menuItems"
      :menu-width="180"
      :submenu-width="140"
      @select="handleMenuSelect"
    />

    <!-- Cell Content Drawer -->
    <CellContentView ref="cellContentViewRef" />
    <SqlCellEditor
      ref="cellEditorRef"
      :column="activeColumn"
      @save="saveCell"
      @cancel="tableRef?.clearEdit()"
    />
    <ResultChangeDrawer
      ref="changesRef"
      :source="editSource"
      :records="records"
      :sql="generated.sql"
      :reason="generated.reason"
      :validation-message="validationMessage"
      @locate="(row, field) => tableRef?.setEditCell(row, field)"
      @revert="(row, field) => tableRef?.revertData(row, field)"
    />
  </div>
</template>

<script setup lang="ts">
  import { ref, shallowRef, computed, nextTick, h, watch, onBeforeUnmount } from 'vue'
  import { useEventListener } from '@vueuse/core'
  import { ElMessage } from 'element-plus'
  import { isObject, isEqual } from 'lodash-es'
  import { useTableStore } from '@/store/modules/table'
  import { TableSizeEnum } from '@/enums/form-enum'
  import ArtTable, { type ArtTableExpose } from '@/components/core/tables/art-table/index.vue'
  import ArtMenuRight, { MenuItemType } from '@/components/core/others/art-menu-right/index.vue'
  import CellContentView, { type CellContentViewExpose } from './cell-content-view.vue'
  import { copyTextToClipboard } from '@/utils/file/clipboard'
  import type {
    ColumnOption,
    TableEditRecordset,
    TableEditRules,
    TableEditContext,
    TableColumnValidationContext
  } from '@/types'
  import type { SqlDialect } from '@/types/sql-connections'
  import type { SqlColumnRef, SqlMetadataRef } from '@/utils/sql-workbench'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import ResultChangeDrawer from './result-change-drawer.vue'
  import SqlCellEditor from './sql-cell-editor.vue'
  import {
    resolveSqlEditSource,
    sqlDraftColumn,
    validateSqlDraftValue,
    isSqlDraftJson,
    prepareSqlDraftRows,
    containsUnsafeSqlNumber,
    buildSqlDraftUpdate,
    type SqlEditSource
  } from './result-edit'

  type SqlResultRow = Record<string, unknown>

  interface SqlMetadataColumn {
    name: string
    property?: string
    type?: string | null
    fullType?: string | null
    nullable?: boolean | null
    enumValues?: string[]
  }

  interface TableCellColumn {
    property: string
  }

  interface MenuExpose {
    show: (event: MouseEvent) => void
  }

  interface Props {
    loading?: boolean
    data?: SqlResultRow[]
    columns?: SqlMetadataColumn[]
    query?: string
    metadata?: SqlMetadataRef | null
    dialect?: SqlDialect
    defaultSchema?: string
  }

  const props = withDefaults(defineProps<Props>(), {
    loading: false,
    data: () => [],
    columns: () => [],
    query: '',
    dialect: 'postgres',
    defaultSchema: ''
  })
  const emit = defineEmits<{ 'draft-state': [dirty: boolean] }>()
  const tableRef = ref<ArtTableExpose>()
  const tableSettings = useTableStore()
  // 摘要单元格为 28px，行和双行类型表头随共享表格密度一起变化。
  const resultVirtualScroll = computed(() =>
    tableSettings.tableSize === TableSizeEnum.SMALL
      ? { rowHeight: 37, headerHeight: 48 }
      : tableSettings.tableSize === TableSizeEnum.LARGE
        ? { rowHeight: 53, headerHeight: 68 }
        : { rowHeight: 45, headerHeight: 60 }
  )
  const cellEditorRef = ref<InstanceType<typeof SqlCellEditor>>()
  const activeColumn = shallowRef<SqlColumnRef>()
  const changesRef = ref<InstanceType<typeof ResultChangeDrawer>>()
  const editMode = ref(false)
  const onlyChanged = ref(false)
  const currentPage = ref(1)
  const pageSize = ref(50)
  const changePageSize = (size: number) => {
    pageSize.value = size
    currentPage.value = 1
  }
  watch(onlyChanged, () => {
    cellEditorRef.value?.flush()
    currentPage.value = 1
  })
  watch(currentPage, () => cellEditorRef.value?.flush())
  const analyzing = ref(false)
  const draftRows = shallowRef<SqlResultRow[]>([])
  const emptyRecords = (): TableEditRecordset => ({
    insertRecords: [],
    removeRecords: [],
    updateRecords: [],
    changes: []
  })
  const records = shallowRef<TableEditRecordset>(emptyRecords())
  const editSource = shallowRef<SqlEditSource>({ mapping: {}, keys: [], reason: '' })
  const validationMessage = ref('')
  const validationPassed = ref(false)
  const feedback = useArtFeedback()
  let generation = 0
  let pendingLeave: Promise<boolean> | undefined
  const changeCount = computed(() =>
    records.value.changes.reduce((total, change) => total + change.fields.length, 0)
  )
  const canUndo = computed(() => {
    void records.value
    return tableRef.value?.canUndo() || false
  })
  const canRedo = computed(() => {
    void records.value
    return tableRef.value?.canRedo() || false
  })
  const columnInfo = (field: string): SqlColumnRef => {
    const column = props.columns.find((column) => column.name === field)
    const example = props.data.find((row) => row[field] != null)?.[field]
    const resolved = sqlDraftColumn(editSource.value, field)
    return {
      ...resolved,
      name: field,
      dataType:
        column?.fullType ||
        resolved?.dataType ||
        column?.type ||
        (typeof example === 'number'
          ? 'numeric'
          : typeof example === 'boolean'
            ? 'boolean'
            : example && typeof example === 'object'
              ? 'json'
              : 'text'),
      isNullable: column?.nullable ?? resolved?.isNullable ?? true,
      enumValues: column?.enumValues ?? resolved?.enumValues
    }
  }
  const isProtected = (field: string) =>
    editSource.value.keys.includes(field) ||
    field.toLowerCase() === 'tenant_id' ||
    editSource.value.mapping[field]?.toLowerCase() === 'tenant_id'
  const editRules = computed<TableEditRules>(() =>
    Object.fromEntries(
      props.columns.map((column) => [
        column.name,
        {
          validator: ({ value, rowIndex }: TableColumnValidationContext) =>
            isEqual(value, draftRows.value[rowIndex]?.[column.name]) ||
            validateSqlDraftValue(value, columnInfo(column.name)) ||
            true
        }
      ])
    )
  )
  const generated = computed(() => {
    if (!editMode.value || !records.value.changes.length)
      return { sql: '', reason: '还没有已修改字段。' }
    void records.value
    return buildSqlDraftUpdate(
      editSource.value,
      records.value,
      tableRef.value?.getTableData() || [],
      props.dialect
    )
  })
  const startEditing = async () => {
    if (analyzing.value || props.loading || !props.data.length) return
    const owner = ++generation
    analyzing.value = true
    try {
      const source = await resolveSqlEditSource({
        query: props.query,
        columns: props.columns.map((column) => column.name),
        metadata: props.metadata,
        dialect: props.dialect,
        defaultSchema: props.defaultSchema
      })
      if (owner !== generation) return
      editSource.value = source
      if (containsUnsafeSqlNumber(props.data))
        editSource.value = {
          ...source,
          reason:
            '结果包含超出 JavaScript 安全精度的数字，请在 SELECT 中将该字段转换为文本后重新查询。'
        }
      draftRows.value = prepareSqlDraftRows(props.data, editSource.value, columnInfo)
      editMode.value = true
      onlyChanged.value = false
      records.value = emptyRecords()
      validationMessage.value = ''
      validationPassed.value = false
    } finally {
      if (owner === generation) analyzing.value = false
    }
  }
  const handleEditChange = (value: TableEditRecordset) => {
    records.value = value
    validationMessage.value = ''
    validationPassed.value = false
    emit('draft-state', value.changes.length > 0)
  }
  const openCellEditor = async (context: TableEditContext) => {
    cellEditorRef.value?.flush()
    activeColumn.value = columnInfo(context.prop)
    await nextTick()
    void cellEditorRef.value?.open(context)
  }
  const saveCell = (context: TableEditContext, value: unknown) => {
    tableRef.value?.setCellValue(context.row, context.prop, value)
    const active = tableRef.value?.getEditRecord()
    if (active?.row === context.row && active.prop === context.prop) tableRef.value?.clearEdit()
    void tableRef.value?.validateField(context.prop, { focus: false })
    context.cell?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
  }
  const validateDraft = async (notify = false): Promise<boolean> => {
    const validation = await tableRef.value?.validate({ focus: notify })
    validationMessage.value = validation?.valid
      ? ''
      : validation?.firstError?.message || '校验未完成，请重试'
    validationPassed.value = Boolean(validation?.valid)
    if (notify && validation?.valid) ElMessage.success('基础字段校验通过')
    return Boolean(validation?.valid)
  }
  const reviewChanges = async () => {
    await validateDraft()
    void changesRef.value?.open()
  }
  const confirmLeave = (): Promise<boolean> => {
    if (!changeCount.value && !cellEditorRef.value?.isDirty()) return Promise.resolve(true)
    if (pendingLeave) return pendingLeave
    pendingLeave = feedback
      .confirm('当前结果副本还有未保留的修改。请先通过变更预览导出文件，或放弃修改继续。', {
        title: '离开结果编辑',
        confirmButtonText: '放弃修改并继续',
        cancelButtonText: '继续编辑',
        closeOnClickModal: false
      })
      .then(() => true)
      .catch(() => false)
      .finally(() => {
        pendingLeave = undefined
      })
    return pendingLeave
  }
  const resetDraft = async () => {
    if (await confirmLeave()) {
      cellEditorRef.value?.cancel()
      tableRef.value?.revertData()
      validationMessage.value = ''
      validationPassed.value = false
    }
  }
  const exitEditing = async () => {
    if (!(await confirmLeave())) return
    cellEditorRef.value?.cancel()
    editMode.value = false
    onlyChanged.value = false
    records.value = emptyRecords()
    emit('draft-state', false)
  }
  const handleDraftKeydown = (event: KeyboardEvent) => {
    if (!editMode.value || !(event.ctrlKey || event.metaKey) || event.isComposing) return
    if (
      event.target instanceof HTMLElement &&
      event.target.closest('input,textarea,[contenteditable="true"],[role="combobox"]')
    )
      return
    if (event.key.toLowerCase() === 'z' || event.key.toLowerCase() === 'y') {
      event.preventDefault()
      event.stopPropagation()
      if (event.key.toLowerCase() === 'y' || event.shiftKey) tableRef.value?.redo()
      else tableRef.value?.undo()
    }
  }
  useEventListener(window, 'beforeunload', (event: BeforeUnloadEvent) => {
    if (changeCount.value) {
      event.preventDefault()
      event.returnValue = ''
    }
  })
  watch(
    () => props.data,
    () => {
      cellEditorRef.value?.cancel()
      generation++
      analyzing.value = false
      editMode.value = false
      currentPage.value = 1
      onlyChanged.value = false
      records.value = emptyRecords()
      selectedCell.value = null
      emit('draft-state', false)
    }
  )
  onBeforeUnmount(() => {
    generation++
    emit('draft-state', false)
  })
  defineExpose({ confirmLeave, hasChanges: () => changeCount.value > 0 })

  const menuRef = ref<MenuExpose>()
  const cellContentViewRef = ref<CellContentViewExpose>()

  // Selected cell info
  const selectedCell = ref<{
    row: SqlResultRow
    column: TableCellColumn
    event: MouseEvent
  } | null>(null)

  // Compute table columns
  const resultColumnWidth = (field: string) => {
    const type = columnInfo(field).dataType
    const preferred = /json|text|clob/i.test(type)
      ? 300
      : /uuid/i.test(type)
        ? 300
        : /timestamp|datetime/i.test(type)
          ? 260
          : /^date/i.test(type)
            ? 160
            : /^time/i.test(type)
              ? 180
              : /bool|^bit/i.test(type)
                ? 112
                : 180
    return Math.max(preferred, Math.min(360, field.length * 8 + 32))
  }
  const tableColumns = computed<ColumnOption<SqlResultRow>[]>(() => {
    if (!props.columns || props.columns.length === 0) {
      return []
    }

    return props.columns.map((column) => ({
      prop: column.name,
      label: column.name,
      minWidth: resultColumnWidth(column.name),
      renderHeader: () =>
        h(
          'span',
          {
            class: 'sql-result-column-header flex min-w-0 flex-col gap-1',
            title: `${column.name} · ${columnInfo(column.name).dataType}`
          },
          [
            h('span', { class: 'truncate' }, column.name),
            h(
              'span',
              { class: 'truncate font-mono text-[11px] font-normal text-g-700' },
              columnInfo(column.name).dataType
            )
          ]
        ),
      showOverflowTooltip: false,
      ...(editMode.value
        ? {
            editRender: {
              enabled: !isProtected(column.name),
              name: isSqlDraftJson(columnInfo(column.name))
                ? ('textarea' as const)
                : columnInfo(column.name).dataType === 'boolean'
                  ? ('select' as const)
                  : ('input' as const),
              nullable: columnInfo(column.name).isNullable,
              options: [
                { label: 'true', value: true },
                { label: 'false', value: false }
              ]
            }
          }
        : {}),
      formatter: (row) => {
        const value = row[column.name]
        if (value === null)
          return h(
            'span',
            { class: 'font-mono italic text-g-600', title: 'SQL NULL（无值）' },
            'NULL'
          )
        if (typeof value === 'boolean') return String(value)
        const content = isObject(value) ? JSON.stringify(value) : String(value ?? '')
        return h(
          'button',
          {
            type: 'button',
            class: 'sql-result-cell',
            title: '查看完整内容',
            'aria-label': `查看 ${column.name} 内容`,
            onClick: () => {
              void cellContentViewRef.value?.handleOpen({ content, columnName: column.name })
            }
          },
          [
            isObject(value)
              ? h('span', { class: 'sql-result-cell__type' }, Array.isArray(value) ? '[]' : '{}')
              : null,
            h('span', { class: 'sql-result-cell__text' }, content)
          ]
        )
      }
    }))
  })

  const tableData = computed(() => (editMode.value ? draftRows.value : props.data))

  const getCellContent = (row: SqlResultRow, property: string) => {
    const value = row[property]
    return isObject(value) ? JSON.stringify(value) : String(value ?? '')
  }

  // Menu Items
  const menuItems = computed((): MenuItemType[] => [
    ...(editMode.value && selectedCell.value && !isProtected(selectedCell.value.column.property)
      ? [
          { key: 'edit', label: '编辑此单元格', icon: 'ri:edit-line' },
          {
            key: 'null',
            label: '设为 NULL',
            icon: 'ri:subtract-line',
            disabled: !columnInfo(selectedCell.value.column.property).isNullable
          },
          {
            key: 'revert',
            label: '还原此单元格',
            icon: 'ri:restart-line',
            disabled: !tableRef.value?.isUpdateByRow(
              selectedCell.value.row,
              selectedCell.value.column.property
            ),
            showLine: true
          }
        ]
      : []),
    {
      key: 'copy',
      label: '复制',
      icon: 'ri-file-copy-line'
    },
    {
      key: 'view',
      label: '查看',
      icon: 'ri-eye-line'
    }
  ])

  // Handle Cell Click (Left Click)
  const handleCellClick = (
    row: SqlResultRow,
    column: TableCellColumn,
    cell: HTMLTableCellElement,
    event: MouseEvent
  ) => {
    void cell
    selectedCell.value = { row, column, event }
  }

  // Handle Cell Context Menu (Right Click)
  const handleCellContextMenu = (
    row: SqlResultRow,
    column: TableCellColumn,
    cell: HTMLTableCellElement,
    event: MouseEvent
  ) => {
    void cell
    // Prevent default browser menu
    event.preventDefault()

    // Update selected cell info
    selectedCell.value = { row, column, event }

    // Show menu
    nextTick(() => {
      menuRef.value?.show(event)
    })
  }

  // Handle Menu Selection
  const handleMenuSelect = async (item: MenuItemType) => {
    if (!selectedCell.value) return

    if (item.key === 'edit') {
      void tableRef.value?.setEditCell(selectedCell.value.row, selectedCell.value.column.property)
      return
    }
    if (item.key === 'null') {
      tableRef.value?.setCellValue(selectedCell.value.row, selectedCell.value.column.property, null)
      return
    }
    if (item.key === 'revert') {
      tableRef.value?.revertData(selectedCell.value.row, selectedCell.value.column.property)
      return
    }

    if (item.key === 'copy') {
      try {
        await copyTextToClipboard(
          getCellContent(selectedCell.value.row, selectedCell.value.column.property)
        )
        ElMessage.success('复制成功')
      } catch {
        ElMessage.warning('复制失败，请打开查看内容后手动复制')
      }
    } else if (item.key === 'view') {
      void openDrawer()
    }
  }

  const openDrawer = async () => {
    if (!selectedCell.value) return

    await cellContentViewRef.value?.handleOpen({
      content: getCellContent(selectedCell.value.row, selectedCell.value.column.property),
      columnName: selectedCell.value.column.property
    })
  }

  const cellClassName = ({ row, column }: { row: SqlResultRow; column: TableCellColumn }) => {
    if (
      selectedCell.value &&
      selectedCell.value.row === row &&
      selectedCell.value.column.property === column.property
    ) {
      return 'selected-cell'
    }
    return ''
  }
</script>

<style scoped lang="scss">
  .result-table-container {
    :deep(.el-table) {
      height: 100%;

      .cell {
        overflow: hidden;
        text-overflow: ellipsis;
        line-height: 1.5;
        white-space: nowrap;
      }

      // Add selection style if needed
      .el-table__cell {
        // cursor: default;
      }

      .selected-cell {
        position: relative;
        z-index: 1;
        box-shadow: inset 0 0 0 2px var(--el-color-primary);
      }
    }

    :deep(.sql-result-cell) {
      display: flex;
      gap: 6px;
      align-items: center;
      width: 100%;
      min-width: 0;
      height: 28px;
      text-align: left;

      &:focus-visible {
        outline: 2px solid var(--el-color-primary);
        outline-offset: -2px;
      }

      .sql-result-cell__type {
        flex-shrink: 0;
        font-family: monospace;
        color: var(--el-color-primary);
      }

      .sql-result-cell__text {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }
  }
</style>
