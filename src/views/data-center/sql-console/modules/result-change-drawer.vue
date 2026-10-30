<template>
  <ArtDrawer
    ref="drawer"
    :size="960"
    :show-confirm-button="false"
    cancel-text="返回编辑"
    :show-form-focus-button="false"
    @closed="applyLocate"
  >
    <div class="flex flex-col gap-4">
      <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span class="art-icon-label min-w-0 font-medium"
          ><ArtSvgIcon icon="ri:table-line" /><span class="truncate">{{
            source.table ? `${source.table.tableSchema}.${source.table.tableName}` : '查询结果副本'
          }}</span></span
        >
        <span class="text-g-700"
          >{{ records.changes.length }} 行 · {{ differences.length }} 处修改 · 数据库尚未写入</span
        >
      </div>
      <ElAlert
        v-if="validationMessage"
        type="error"
        :closable="false"
        :title="validationMessage"
        show-icon
      />
      <ElTabs v-model="activeTab">
        <ElTabPane label="字段差异" name="changes">
          <ArtTable
            :data="differences"
            :columns="columns"
            :max-height="440"
            :show-table-header="false"
            empty-text="暂无字段变更"
            empty-description="在结果副本中修改字段后，可在这里核对原值与新值。"
            border
          />
        </ElTabPane>
        <ElTabPane label="更新 SQL" name="sql">
          <ArtEmptyState
            v-if="!sql || validationMessage"
            title="当前不能生成更新 SQL"
            :description="validationMessage || reason"
            size="compact"
          />
          <template v-else>
            <p class="m-0 mb-3 text-xs leading-5 text-g-700"
              >脚本包含完整主键和原值检查，默认以 ROLLBACK
              结束。请核对每条影响行数后，再由有权限的操作者提交。</p
            >
            <PlanCodePreview
              title="更新脚本"
              language="sql"
              :code="sql"
              expanded
              max-height="440px"
            />
          </template>
        </ElTabPane>
      </ElTabs>
    </div>
    <template #footer>
      <div class="flex w-full flex-wrap items-center justify-between gap-2">
        <ElButton :disabled="!differences.length" @click="downloadChanges"
          ><ArtSvgIcon icon="ri:braces-line" />下载变更 JSON</ElButton
        >
        <div class="flex flex-wrap items-center gap-2">
          <ElButton
            :disabled="!sql || Boolean(validationMessage)"
            type="primary"
            @click="downloadSql"
            ><ArtSvgIcon icon="ri:download-2-line" />下载更新 SQL</ElButton
          >
          <ElButton @click="drawer?.handleClose()">返回编辑</ElButton>
        </div>
      </div>
    </template>
  </ArtDrawer>
  <CellContentView ref="cellView" />
</template>
<script setup lang="ts">
  import { computed, h, ref } from 'vue'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import type { ColumnOption, TableEditRecordset } from '@/types'
  import { downloadBlob } from '@/utils/file'
  import type { SqlEditSource, SqlDraftRow } from './result-edit'
  import PlanCodePreview from './plan-code-preview.vue'
  import CellContentView, { type CellContentViewExpose } from './cell-content-view.vue'
  const props = defineProps<{
    source: SqlEditSource
    records: TableEditRecordset<SqlDraftRow>
    sql: string
    reason: string
    validationMessage: string
  }>()
  const emit = defineEmits<{
    locate: [row: SqlDraftRow, field: string]
    revert: [row: SqlDraftRow, field: string]
  }>()
  const drawer = ref<ArtDrawerExpose>()
  const cellView = ref<CellContentViewExpose>()
  const activeTab = ref('changes')
  let pendingLocate: { row: SqlDraftRow; field: string } | undefined
  const differences = computed(() =>
    props.records.changes.flatMap((change) =>
      change.fields.map((field) => ({
        row: change.row,
        rowIndex: change.rowIndex,
        field,
        original: change.original[field],
        value: change.row[field]
      }))
    )
  )
  type Difference = (typeof differences.value)[number]
  const display = (value: unknown) =>
    value === null
      ? 'NULL'
      : value === ''
        ? '（空字符串）'
        : typeof value === 'object'
          ? JSON.stringify(value, null, 2)
          : String(value)
  const valueCell = (row: Difference, original: boolean) =>
    h(
      'button',
      {
        type: 'button',
        class: `block w-full truncate text-left font-mono text-xs ${original ? 'text-g-700' : 'text-primary'}`,
        title: '查看完整值',
        'aria-label': `查看第 ${row.rowIndex + 1} 行 ${row.field}${original ? '原值' : '新值'}`,
        onClick: () =>
          cellView.value?.handleOpen({
            content: display(original ? row.original : row.value),
            columnName: row.field
          })
      },
      display(original ? row.original : row.value)
    )
  const columns: ColumnOption<Difference>[] = [
    { prop: 'rowIndex', label: '行', width: 64, formatter: (row) => row.rowIndex + 1 },
    { prop: 'field', label: '字段', minWidth: 140 },
    {
      prop: 'original',
      label: '原值',
      minWidth: 180,
      showOverflowTooltip: false,
      formatter: (row) => valueCell(row, true)
    },
    {
      prop: 'value',
      label: '新值',
      minWidth: 180,
      showOverflowTooltip: false,
      formatter: (row) => valueCell(row, false)
    },
    {
      prop: 'operation',
      label: '操作',
      width: 100,
      formatter: (row) =>
        h('div', { class: 'flex items-center gap-2' }, [
          h(
            'button',
            {
              type: 'button',
              class: 'text-xs text-primary',
              'aria-label': `定位第 ${row.rowIndex + 1} 行 ${row.field}`,
              onClick: () => {
                pendingLocate = { row: row.row, field: row.field }
                void drawer.value?.handleClose()
              }
            },
            '定位'
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'text-xs text-g-700',
              'aria-label': `还原第 ${row.rowIndex + 1} 行 ${row.field}`,
              onClick: () => emit('revert', row.row, row.field)
            },
            '还原'
          )
        ])
    }
  ]
  const downloadChanges = () =>
    downloadBlob(
      new Blob(
        [
          JSON.stringify(
            {
              target: props.source.table
                ? { schema: props.source.table.tableSchema, table: props.source.table.tableName }
                : null,
              generatedAt: new Date().toISOString(),
              databaseWritten: false,
              changes: differences.value.map(({ row, rowIndex, field, original, value }) => ({
                row: rowIndex + 1,
                keys: Object.fromEntries(props.source.keys.map((key) => [key, row[key]])),
                field,
                original,
                value
              }))
            },
            null,
            2
          )
        ],
        { type: 'application/json;charset=utf-8' }
      ),
      'sql-result-changes.json'
    )
  const downloadSql = () => {
    if (props.sql && !props.validationMessage)
      downloadBlob(
        new Blob([props.sql], { type: 'text/plain;charset=utf-8' }),
        'sql-result-update.sql'
      )
  }
  const applyLocate = () => {
    if (pendingLocate) emit('locate', pendingLocate.row, pendingLocate.field)
    pendingLocate = undefined
  }
  defineExpose({
    open: () => {
      activeTab.value = 'changes'
      return drawer.value?.handleOpen(undefined, {
        title: '结果变更预览',
        subtitle: '核对字段差异，导出变更文件；当前数据库尚未写入',
        headerIcon: 'ri:git-pull-request-line'
      })
    }
  })
</script>
