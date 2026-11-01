<template>
  <main class="flex min-h-screen min-w-0 flex-col gap-4 p-4">
    <h1 class="text-lg font-semibold">ArtTable 固定列身份验收</h1>
    <div class="flex flex-wrap gap-2">
      <ElButton @click="validate">校验固定列</ElButton>
      <ElButton @click="events = []">清空事件</ElButton>
    </div>
    <section aria-label="普通固定列" class="min-w-0">
      <h2 class="mb-2 text-sm font-medium">普通 ArtTable</h2>
      <div style="width: min(100%, 860px); height: 220px">
        <ArtTable
          ref="nativeTable"
          :data="rows"
          :columns="columns"
          :show-table-header="false"
          :pagination="false"
          :cell-class-name="cellClass"
          :cell-style="cellStyle"
          :row-class-name="rowClass"
          :selected-row-keys="[1]"
          :edit-config="{ trigger: 'dblclick', mode: 'cell' }"
          row-key="id"
          v-bind="handlers('native')"
        />
      </div>
    </section>
    <section aria-label="虚拟固定列" class="min-w-0">
      <h2 class="mb-2 text-sm font-medium">虚拟 ArtTable</h2>
      <div style="width: min(100%, 860px); height: 220px">
        <ArtTable
          ref="virtualTable"
          :data="rows"
          :columns="columns"
          :virtual-scroll="true"
          :show-table-header="false"
          :pagination="false"
          :cell-class-name="cellClass"
          :cell-style="cellStyle"
          :row-class-name="rowClass"
          :selected-row-keys="[1]"
          :edit-config="{ trigger: 'dblclick', mode: 'cell' }"
          row-key="id"
          v-bind="handlers('virtual')"
        />
      </div>
    </section>
    <pre class="whitespace-pre-wrap break-all text-xs" aria-label="事件记录">{{
      JSON.stringify(events)
    }}</pre>
    <pre class="whitespace-pre-wrap break-all text-xs" aria-label="虚拟固定布局">{{
      JSON.stringify(layout)
    }}</pre>
    <pre class="whitespace-pre-wrap break-all text-xs" role="status">{{ validation }}</pre>
  </main>
</template>
<script setup lang="ts">
  import { h, ref, shallowRef, type CSSProperties } from 'vue'
  import ArtTable, { type ArtTableExpose } from '@/components/core/tables/art-table/index.vue'
  import type { ColumnOption, TableColumnLayout } from '@/types'
  import { toObjectRecord } from '@/utils/record'
  import { useTableStore } from '@/store/modules/table'
  import { TableSizeEnum } from '@/enums/form-enum'

  interface Row {
    id: number
    before: string
    after: string
    leftThird: string
    center: string
    right: string
  }
  interface ProbeEvent {
    table: string
    kind: string
    property: string
    id: string
  }
  type ProbeStyle = CSSProperties & { '--probe-column': string; '--probe-index': string }
  const tableStore = useTableStore()
  tableStore.setTableSize(TableSizeEnum.DEFAULT)
  tableStore.setIsBorder(true)
  const nativeTable = ref<ArtTableExpose<Row>>()
  const virtualTable = ref<ArtTableExpose<Row>>()
  const events = ref<ProbeEvent[]>([])
  const layout = shallowRef<TableColumnLayout | null>(null)
  const validation = ref('尚未校验')
  const rows: Row[] = [
    { id: 1, before: '首列值', after: '第二列值', leftThird: '', center: '中间值', right: '' },
    {
      id: 2,
      before: '首列第二行',
      after: '第二列第二行',
      leftThird: '左侧值',
      center: '中间第二行',
      right: '右侧值'
    }
  ]
  const columns: ColumnOption<Row>[] = [
    { prop: 'before', label: '首列', width: 220, className: 'column-before' },
    { prop: 'after', label: '第二列', width: 220, className: 'column-after' },
    {
      prop: 'leftThird',
      label: '第三列左固定',
      width: 180,
      fixed: 'left',
      className: 'column-leftThird',
      required: true,
      editRender: { name: 'input' }
    },
    {
      prop: 'center',
      label: '中间列',
      width: 260,
      className: 'column-center',
      renderHeader: () =>
        h('span', { class: 'art-icon-label' }, [
          h('span', '中间列'),
          h(
            'button',
            {
              type: 'button',
              class: 'text-primary',
              onClick: (event: MouseEvent) => event.stopPropagation()
            },
            '表头子按钮'
          )
        ])
    },
    {
      prop: 'right',
      label: '右固定',
      width: 180,
      fixed: 'right',
      sortable: true,
      className: 'column-right',
      required: true,
      editRender: { name: 'input' }
    }
  ]
  if (new URLSearchParams(location.search).get('controls') === '1')
    columns.push({ type: 'selection', width: 48, fixed: 'left' })
  const property = (value: unknown): string => {
    const column = toObjectRecord(value)
    return String(column.property || column.prop || '')
  }
  const cellClass = (value: unknown): string => {
    const scope = toObjectRecord(value)
    return `callback-${property(scope.column)}-index-${scope.columnIndex}`
  }
  const cellStyle = (value: unknown): ProbeStyle => {
    const scope = toObjectRecord(value)
    return { '--probe-column': property(scope.column), '--probe-index': String(scope.columnIndex) }
  }
  const rowClass = ({ rowIndex }: { rowIndex: number }): string => `probe-row-${rowIndex}`
  const record = (table: string, kind: string, column: unknown, event: MouseEvent): void => {
    event.preventDefault()
    events.value.push({
      table,
      kind,
      property: property(column),
      id: String(toObjectRecord(column).id || '')
    })
  }
  const handlers = (table: string) => ({
    onColumnLayout: (value: TableColumnLayout) => {
      if (table === 'virtual') layout.value = value
    },
    onHeaderClick: (column: unknown, event: MouseEvent) =>
      record(table, 'header-click', column, event),
    onSortChange: (value: unknown) => {
      const sort = toObjectRecord(value)
      events.value.push({
        table,
        kind: 'sort',
        property: String(sort.prop || ''),
        id: String(toObjectRecord(sort.column).id || '')
      })
    },
    onHeaderContextmenu: (column: unknown, event: MouseEvent) =>
      record(table, 'header', column, event),
    onCellContextmenu: (_row: unknown, column: unknown, _cell: unknown, event: MouseEvent) =>
      record(table, 'cell', column, event),
    onRowContextmenu: (_row: unknown, column: unknown, event: MouseEvent) =>
      record(table, 'row', column, event)
  })
  const validate = async (): Promise<void> => {
    const results = await Promise.all([
      nativeTable.value?.validate({ focus: false }),
      virtualTable.value?.validate({ focus: false })
    ])
    validation.value = JSON.stringify(
      results.map((result) =>
        result?.errors.map((error) => ({ prop: error.prop, rowIndex: error.rowIndex }))
      )
    )
  }
</script>
