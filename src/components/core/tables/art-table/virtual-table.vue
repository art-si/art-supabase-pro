<template>
  <div
    class="art-table-v2 el-table"
    :style="{ '--el-table-header-bg-color': headerBackground }"
    :class="[
      `el-table--${size || 'default'}`,
      { 'el-table--border': border, 'el-table--striped': stripe, 'is-resizing': Boolean(resizing) }
    ]"
  >
    <ElAutoResizer @resize="viewportWidth = $event.width">
      <template #default="{ height, width }">
        <ElTableV2
          v-if="height > 0 && width > 0"
          ref="table"
          fixed
          :columns="v2Columns"
          :data="orderedRows"
          :width="width"
          :height="height"
          :style="{ '--el-table-header-bg-color': headerBackground }"
          row-key="key"
          :row-height="rowHeight"
          :header-height="showHeader ? headerHeight : 0"
          :estimated-row-height="config.estimatedRowHeight"
          :cache="config.cache ?? 3"
          :scrollbar-always-on="scrollbarAlwaysOn"
          :sort-by="sortBy"
          :row-props="rowProps"
          :row-class="rowClass"
          :cell-props="cellProps"
          :header-cell-props="headerCellProps"
          @column-sort="columnSort"
          @scroll="scrollLeft = $event.scrollLeft"
        >
          <template #empty><slot name="empty" /></template>
        </ElTableV2>
      </template>
    </ElAutoResizer>
  </div>
</template>
<script setup lang="ts">
  import {
    computed,
    h,
    markRaw,
    nextTick,
    ref,
    shallowRef,
    watch,
    type CSSProperties,
    type VNode
  } from 'vue'
  import {
    ElCheckbox,
    ElTableV2,
    TableV2SortOrder,
    TableV2FixedDir,
    type Column,
    type SortBy,
    type TableV2Instance,
    type ComponentSize
  } from 'element-plus'
  import { ElAutoResizer } from 'element-plus/es/components/table-v2/index.mjs'
  import { useEventListener } from '@vueuse/core'
  import { get, orderBy } from 'lodash-es'
  import { toObjectRecord } from '@/utils/record'
  import type { ColumnOption, TableVirtualScrollConfig } from '@/types'
  type Row = Record<string, unknown>
  interface Entry {
    key: string
    row: Row
    index: number
  }
  const props = defineProps<{
    data: Row[]
    columns: ColumnOption<Row>[]
    config: TableVirtualScrollConfig
    size: ComponentSize
    editable: boolean
    showHeader: boolean
    border: boolean
    stripe: boolean
    highlightCurrentRow: boolean
    scrollbarAlwaysOn: boolean
    selectedRowKeys: Array<string | number>
    rowIdentity: (row: Row) => string
    renderCell: (column: ColumnOption<Row>, row: Row, index: number) => VNode
    renderHeader: (column: ColumnOption<Row>, index: number) => VNode
    cellClass: (
      row: Row,
      column: ColumnOption<Row>,
      rowIndex: number,
      columnIndex: number
    ) => string
    rowClassName: (scope: { row: Row; rowIndex: number }) => string
    cellStyle: unknown
    headerStyle: unknown
    rowStyle: unknown
    emitEvent: (name: string, ...args: unknown[]) => void
    clearFilters: () => void
  }>()
  const table = ref<TableV2Instance>()
  const cellPadding = computed(() => (props.size === 'small' ? 4 : props.size === 'large' ? 12 : 8))
  const rowHeight = computed(
    () => props.config.rowHeight ?? (props.editable ? 28 : 23) + cellPadding.value * 2 + 1
  )
  const headerHeight = computed(() => props.config.headerHeight ?? 23 + cellPadding.value * 2 + 1)
  const headerBackground = computed(() => {
    const value = toObjectRecord(props.headerStyle).backgroundColor
    return typeof value === 'string' ? value : 'var(--el-bg-color)'
  })
  const viewportWidth = ref(0)
  const widths = ref<Record<string, number>>({})
  const sortBy = ref<SortBy>({ key: '', order: TableV2SortOrder.ASC })
  const selected = shallowRef(new Map<string, Row>())
  const current = shallowRef<Row>()
  const scrollLeft = ref(0)
  const ids = new WeakMap<Row, string>()
  let keySeed = 0
  const key = (row: Row) => {
    const identity = props.rowIdentity(row)
    if (identity) return `key:${identity}`
    if (!ids.has(row)) ids.set(row, `row:${++keySeed}`)
    return ids.get(row)!
  }
  const selectionColumn = computed(() =>
    props.columns.find((column) => column.type === 'selection')
  )
  const reserveSelection = computed(() => Boolean(selectionColumn.value?.reserveSelection))
  const selectable = (row: Row, index: number) =>
    typeof selectionColumn.value?.selectable === 'function'
      ? selectionColumn.value.selectable(row, index) !== false
      : true
  const selectedRows = () => [...selected.value.values()]
  const selectionChanged = () => props.emitEvent('onSelectionChange', selectedRows())
  const toggleRowSelection = (input: unknown, value?: boolean) => {
    const row = props.data.find(
      (row) =>
        row === input ||
        (props.rowIdentity(row) &&
          props.rowIdentity(row) === props.rowIdentity(toObjectRecord(input)))
    )
    if (!row || !selectable(row, props.data.indexOf(row))) return
    const next = new Map(selected.value),
      id = key(row),
      choose = value ?? !next.has(id)
    if (choose) next.set(id, row)
    else next.delete(id)
    selected.value = next
    selectionChanged()
  }
  const clearSelection = () => {
    selected.value = new Map()
    selectionChanged()
  }
  const allSelected = computed(() => {
    const candidates = props.data.filter(selectable)
    return candidates.length > 0 && candidates.every((row) => selected.value.has(key(row)))
  })
  const partiallySelected = computed(
    () => !allSelected.value && props.data.some((row) => selected.value.has(key(row)))
  )
  const toggleAllSelection = () => {
    const choose = !allSelected.value,
      next = new Map(selected.value)
    props.data.forEach((row, index) => {
      if (selectable(row, index)) {
        if (choose) next.set(key(row), row)
        else next.delete(key(row))
      }
    })
    selected.value = next
    selectionChanged()
    props.emitEvent('onSelectAll', selectedRows())
  }
  watch(
    () => props.data,
    (rows) => {
      const next = reserveSelection.value ? new Map(selected.value) : new Map<string, Row>()
      rows.forEach((row) => {
        if (selected.value.has(key(row))) next.set(key(row), row)
      })
      const changed =
        next.size !== selected.value.size ||
        [...next].some(([id, row]) => selected.value.get(id) !== row)
      selected.value = next
      if (changed) selectionChanged()
    }
  )
  const orderedRows = computed<Entry[]>(() => {
    let data = props.data
    const column = props.columns.find((column) => column.prop === sortBy.value.key)
    if (column && column.sortable === true) {
      if (typeof column.sortMethod === 'function')
        data = data.toSorted(
          (a, b) => (column.sortMethod(a, b) as number) * (sortBy.value.order === 'desc' ? -1 : 1)
        )
      else data = orderBy(data, [(row) => get(row, column.prop!)], [sortBy.value.order])
    }
    return data.map((row, index) => markRaw({ key: key(row), row, index }))
  })
  const compatibilityColumn = (column: ColumnOption<Row>, index: number) => ({
    ...column,
    property: column.prop || '',
    id: `art-v2-column-${index}`,
    realWidth: columnWidth(column),
    type: column.type || 'default'
  })
  const setCurrentRow = (value?: unknown) => {
    const next =
      value && typeof value === 'object' ? props.data.find((row) => row === value) : undefined
    const previous = current.value
    current.value = next
    if (previous !== next) props.emitEvent('onCurrentChange', next, previous)
  }
  const entry = (value: unknown): Entry => {
    // Table V2 erases rowData's generic. Only our marked Entry objects reach its renderers.
    return value as Entry
  }
  const eventCell = (
    name: string,
    column: ColumnOption<Row>,
    columnIndex: number,
    item: Entry,
    event: MouseEvent
  ) => {
    const cell = event.currentTarget instanceof HTMLElement ? event.currentTarget : undefined
    props.emitEvent(name, item.row, compatibilityColumn(column, columnIndex), cell, event)
    if (name === 'onCellClick') {
      setCurrentRow(item.row)
      props.emitEvent('onRowClick', item.row, compatibilityColumn(column, columnIndex), event)
    }
    if (name === 'onCellDblclick')
      props.emitEvent('onRowDblclick', item.row, compatibilityColumn(column, columnIndex), event)
    if (name === 'onCellContextmenu')
      props.emitEvent('onRowContextmenu', item.row, compatibilityColumn(column, columnIndex), event)
  }
  const columnWidth = (column: ColumnOption<Row>) =>
    widths.value[String(column.prop || column.type)] ||
    Math.max(
      Number.parseFloat(String(column.minWidth || 0)) || 0,
      Number.parseFloat(String(column.width || 0)) ||
        (column.type === 'selection'
          ? 48
          : column.type === 'index' || column.type === 'globalIndex'
            ? 64
            : 140)
    )
  const v2Columns = computed<Column<unknown>[]>(() => {
    const base = props.columns.map(columnWidth),
      sum = base.reduce((a, b) => a + b, 0)
    const flexible = props.columns.filter(
      (column) => !column.width && !widths.value[String(column.prop || column.type)]
    ).length
    const grow = flexible && viewportWidth.value > sum ? (viewportWidth.value - sum) / flexible : 0
    return props.columns.map((column, columnIndex) => ({
      key: String(column.prop || column.type),
      dataKey: String(column.prop || column.type),
      title: column.label,
      headerClass: 'el-table__cell',
      flexShrink: 0,
      width:
        base[columnIndex] +
        (!column.width && !widths.value[String(column.prop || column.type)] ? grow : 0),
      fixed:
        column.fixed === true || column.fixed === 'left'
          ? TableV2FixedDir.LEFT
          : column.fixed === 'right'
            ? TableV2FixedDir.RIGHT
            : undefined,
      align: column.align,
      sortable: Boolean(column.sortable),
      cellRenderer: (scope) => {
        const item = entry(scope.rowData)
        const value =
          column.type === 'selection'
            ? h(ElCheckbox, {
                modelValue: selected.value.has(item.key),
                disabled: !selectable(item.row, item.index),
                'aria-label': `选择第 ${item.index + 1} 行`,
                'onUpdate:modelValue': () => {
                  toggleRowSelection(item.row)
                  props.emitEvent('onSelect', selectedRows(), item.row)
                },
                onClick: (event: MouseEvent) => event.stopPropagation()
              })
            : props.renderCell(column, item.row, item.index)
        return h(
          'div',
          {
            class: 'cell art-table-v2__content',
            onClick: (event: MouseEvent) =>
              eventCell('onCellClick', column, columnIndex, item, event),
            onDblclick: (event: MouseEvent) =>
              eventCell('onCellDblclick', column, columnIndex, item, event),
            onContextmenu: (event: MouseEvent) =>
              eventCell('onCellContextmenu', column, columnIndex, item, event),
            onMouseenter: (event: MouseEvent) => {
              props.emitEvent(
                'onCellMouseEnter',
                item.row,
                compatibilityColumn(column, columnIndex),
                event.currentTarget,
                event
              )
              selectDragRange(item.index, event)
            }
          },
          [value]
        )
      },
      headerCellRenderer: () =>
        h('div', { class: 'cell art-table-v2__header-content' }, [
          column.type === 'selection'
            ? h(ElCheckbox, {
                modelValue: allSelected.value,
                indeterminate: partiallySelected.value,
                disabled: !props.data.some(selectable),
                'aria-label': '选择当前页全部行',
                'onUpdate:modelValue': toggleAllSelection,
                onClick: (event: MouseEvent) => event.stopPropagation()
              })
            : props.renderHeader(column, columnIndex),
          column.resizable === false
            ? null
            : h('button', {
                type: 'button',
                class: 'art-table-v2__resize',
                title: `调整${column.label || ''}列宽`,
                'aria-label': `调整${column.label || ''}列宽`,
                onPointerdown: (event: PointerEvent) => startResize(event, column, columnIndex),
                onClick: (event: MouseEvent) => event.stopPropagation(),
                onKeydown: (event: KeyboardEvent) => resizeKey(event, column, columnIndex)
              })
        ])
    }))
  })
  const columnSort = (params: { key: string | number | symbol; order: 'asc' | 'desc' }) => {
    sortBy.value = {
      key: params.key,
      order: params.order === 'desc' ? TableV2SortOrder.DESC : TableV2SortOrder.ASC
    }
    const index = props.columns.findIndex((column) => column.prop === params.key)
    if (index >= 0)
      props.emitEvent('onSortChange', {
        column: compatibilityColumn(props.columns[index], index),
        prop: params.key,
        order: params.order === 'asc' ? 'ascending' : 'descending'
      })
  }
  const rowClass = (scope: { rowData: unknown; rowIndex: number }) => {
    const item = entry(scope.rowData)
    return [
      'el-table__row',
      props.rowClassName({ row: item.row, rowIndex: item.index }),
      props.stripe && item.index % 2 ? 'is-striped' : '',
      props.highlightCurrentRow && current.value === item.row ? 'is-current' : ''
    ]
      .filter(Boolean)
      .join(' ')
  }
  const resolveStyle = (
    style: unknown,
    context: Record<string, unknown>
  ): CSSProperties | string | undefined => {
    const value = typeof style === 'function' ? style(context) : style
    return typeof value === 'string'
      ? value
      : value && typeof value === 'object'
        ? (value as CSSProperties)
        : undefined
  }
  const rowProps = (scope: { rowData: unknown; rowIndex: number }) => ({
    style: resolveStyle(props.rowStyle, {
      row: entry(scope.rowData).row,
      rowIndex: entry(scope.rowData).index
    })
  })
  const cellProps = (scope: { rowData: unknown; rowIndex: number; columnIndex: number }) => {
    const item = entry(scope.rowData),
      column = props.columns[scope.columnIndex]
    return {
      class: [
        'el-table__cell',
        column.className,
        props.cellClass(item.row, column, item.index, scope.columnIndex)
      ]
        .filter(Boolean)
        .join(' '),
      style: resolveStyle(props.cellStyle, {
        row: item.row,
        column: compatibilityColumn(column, scope.columnIndex),
        rowIndex: item.index,
        columnIndex: scope.columnIndex
      }),
      onMousedown: (event: MouseEvent) => beginSelectionDrag(item.index, event)
    }
  }
  const headerCellProps = (scope: { columnIndex: number }) => ({
    class: 'el-table__cell',
    style: resolveStyle(props.headerStyle, {
      column: compatibilityColumn(props.columns[scope.columnIndex], scope.columnIndex),
      columnIndex: scope.columnIndex,
      rowIndex: 0
    }),
    onClick: (event: MouseEvent) =>
      props.emitEvent(
        'onHeaderClick',
        compatibilityColumn(props.columns[scope.columnIndex], scope.columnIndex),
        event
      ),
    onContextmenu: (event: MouseEvent) =>
      props.emitEvent(
        'onHeaderContextmenu',
        compatibilityColumn(props.columns[scope.columnIndex], scope.columnIndex),
        event
      )
  })
  const resizing = shallowRef<{
    column: ColumnOption<Row>
    index: number
    start: number
    before: number
  }>()
  const startResize = (event: PointerEvent, column: ColumnOption<Row>, index: number) => {
    event.preventDefault()
    event.stopPropagation()
    resizing.value = { column, index, start: event.clientX, before: v2Columns.value[index].width }
  }
  const setWidth = (column: ColumnOption<Row>, value: number) => {
    widths.value = {
      ...widths.value,
      [String(column.prop || column.type)]: Math.max(
        Number.parseFloat(String(column.minWidth)) || 64,
        Math.min(2000, value)
      )
    }
  }
  const finishResize = (event: Event) => {
    const value = resizing.value
    if (value) {
      props.emitEvent(
        'onHeaderDragend',
        columnWidth(value.column),
        value.before,
        compatibilityColumn(value.column, value.index),
        event
      )
      resizing.value = undefined
    }
  }
  useEventListener(window, 'pointermove', (event: PointerEvent) => {
    if (resizing.value)
      setWidth(resizing.value.column, resizing.value.before + event.clientX - resizing.value.start)
  })
  useEventListener(window, 'pointerup', finishResize)
  useEventListener(window, 'pointercancel', finishResize)
  const resizeKey = (event: KeyboardEvent, column: ColumnOption<Row>, index: number) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return
    event.preventDefault()
    event.stopPropagation()
    const before = v2Columns.value[index].width
    setWidth(column, before + (event.key === 'ArrowRight' ? 16 : -16))
    props.emitEvent(
      'onHeaderDragend',
      columnWidth(column),
      before,
      compatibilityColumn(column, index),
      event
    )
  }
  let dragStart: number | undefined,
    dragChoose = true
  const beginSelectionDrag = (index: number, event: MouseEvent) => {
    if (
      !selectionColumn.value ||
      event.button !== 0 ||
      (event.target instanceof Element &&
        event.target.closest('button,input,textarea,a,[role="switch"],.el-checkbox,.el-select'))
    )
      return
    dragStart = index
    dragChoose = !selected.value.has(orderedRows.value[index].key)
  }
  const selectDragRange = (index: number, event: MouseEvent) => {
    if (dragStart === undefined || !(event.buttons & 1)) return
    const next = new Map(selected.value)
    for (let i = Math.min(index, dragStart); i <= Math.max(index, dragStart); i++) {
      const item = orderedRows.value[i]
      if (item && selectable(item.row, item.index)) {
        if (dragChoose) next.set(item.key, item.row)
        else next.delete(item.key)
      }
    }
    selected.value = next
    selectionChanged()
  }
  useEventListener(window, 'mouseup', () => {
    dragStart = undefined
  })
  const ensureCellVisible = async (row: Row, field: string) => {
    const index = orderedRows.value.findIndex((item) => item.row === row)
    if (index >= 0) table.value?.scrollToRow(index, 'smart')
    const columnIndex = v2Columns.value.findIndex((column) => column.key === field),
      column = v2Columns.value[columnIndex]
    if (column && !column.fixed) {
      const left = v2Columns.value
          .slice(0, columnIndex)
          .reduce((sum, column) => sum + column.width, 0),
        right = left + column.width
      const fixedLeft = v2Columns.value
          .filter((column) => column.fixed === 'left' || column.fixed === true)
          .reduce((sum, column) => sum + column.width, 0),
        fixedRight = v2Columns.value
          .filter((column) => column.fixed === 'right')
          .reduce((sum, column) => sum + column.width, 0)
      if (left < scrollLeft.value + fixedLeft)
        table.value?.scrollToLeft(Math.max(0, left - fixedLeft))
      else if (right > scrollLeft.value + viewportWidth.value - fixedRight)
        table.value?.scrollToLeft(right - viewportWidth.value + fixedRight)
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    await nextTick()
  }
  defineExpose({
    ensureCellVisible,
    clearSelection,
    toggleAllSelection,
    toggleRowSelection,
    setCurrentRow,
    getSelectionRows: selectedRows,
    clearSort: () => {
      sortBy.value = { key: '', order: TableV2SortOrder.ASC }
      props.emitEvent('onSortChange', { column: null, prop: null, order: null })
    },
    sort: (prop: string, order: string) =>
      columnSort({ key: prop, order: order === 'descending' ? 'desc' : 'asc' }),
    clearFilter: props.clearFilters,
    setScrollTop: (value = 0) => table.value?.scrollToTop(value),
    setScrollLeft: (value = 0) => table.value?.scrollToLeft(value),
    doLayout: () => table.value?.$forceUpdate()
  })
</script>
<style scoped lang="scss">
  .art-table-v2 {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
    background: var(--el-table-bg-color);

    &.el-table--border {
      border-top: var(--el-table-border);
      border-bottom: var(--el-table-border);
    }
  }

  .art-table-v2 :deep(.el-table-v2) {
    font-size: inherit;
  }

  .art-table-v2 :deep(.el-table-v2__main),
  .art-table-v2 :deep(.el-table-v2__left),
  .art-table-v2 :deep(.el-table-v2__right) {
    background-color: var(--el-table-bg-color);
  }

  .art-table-v2 :deep(.el-table-v2__row) {
    background-color: var(--el-table-tr-bg-color);
  }

  .art-table-v2 :deep(.art-table-v2__content),
  .art-table-v2 :deep(.art-table-v2__header-content) {
    position: relative;
    display: flex;
    flex: 1 1 0;
    align-items: center;
    justify-content: inherit;
    width: 100%;
    min-width: 0;
    height: 100%;
    text-align: inherit;
  }

  .art-table-v2 :deep(.art-table-v2__resize) {
    position: absolute;
    top: -8px;
    right: -10px;
    bottom: -8px;
    z-index: 1;
    width: 12px;
    cursor: col-resize;
    border-right: 1px solid transparent;
  }

  .art-table-v2 :deep(.art-table-v2__resize:hover),
  .art-table-v2 :deep(.art-table-v2__resize:focus-visible) {
    outline: none;
    border-right-color: var(--el-color-primary);
  }

  .art-table-v2 :deep(.el-table-v2__row-cell),
  .art-table-v2 :deep(.el-table-v2__header-cell) {
    font-size: inherit;
    border-bottom: var(--el-table-border);
  }

  .art-table-v2 :deep(.el-table-v2__row-cell.is-align-center),
  .art-table-v2 :deep(.el-table-v2__header-cell.is-align-center) {
    justify-content: center;
    text-align: center;
  }

  .art-table-v2 :deep(.el-table-v2__row-cell.is-align-right),
  .art-table-v2 :deep(.el-table-v2__header-cell.is-align-right) {
    justify-content: flex-end;
    text-align: right;
  }

  .art-table-v2 :deep(.el-table-v2__header-row),
  .art-table-v2 :deep(.el-table-v2__row) {
    border-bottom: 0;
  }

  .art-table-v2.is-resizing {
    user-select: none;
  }
</style>
