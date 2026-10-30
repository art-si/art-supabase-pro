<template>
  <main class="flex min-h-screen flex-col gap-4 p-4">
    <h1 class="text-lg font-medium">ArtTable 编辑能力验收</h1>
    <div class="flex flex-wrap items-center gap-2">
      <ElSegmented
        v-model="mode"
        aria-label="测试编辑模式"
        :options="[
          { label: '单元格', value: 'cell' },
          { label: '整行', value: 'row' }
        ]"
      />
      <ElButton @click="insert">新增临时行</ElButton>
      <ElButton :disabled="!inserted" @click="removeInserted">移除临时行</ElButton>
      <ElButton @click="table?.undo()">撤销</ElButton>
      <ElButton @click="table?.redo()">重做</ElButton>
      <ElButton @click="validate">校验</ElButton>
      <ElButton @click="table?.setEditCell(data[25], 'name')">定位编辑第 26 行</ElButton>
      <ElButton @click="table?.revertData()">还原全部</ElButton>
      <ElButton v-if="virtual" @click="table?.setEditCell(data[4999], 'name')"
        >定位编辑第 5000 行</ElButton
      >
      <ElButton @click="message = JSON.stringify(table?.getRenderMode())">检查渲染方式</ElButton>
    </div>
    <div class="min-h-0" style="height: 400px">
      <ArtTable
        ref="table"
        :data="data"
        :columns="columns"
        :show-table-header="false"
        :virtual-scroll="true"
        :client-pagination="!virtual"
        :pagination="virtual ? false : { current: page, size: 20, total: data.length }"
        row-key="id"
        @selection-change="message = `已选 ${$event.length} 行`"
        :edit-config="{ mode, trigger: 'dblclick', beforeEditMethod: ({ row }) => row.id !== 2 }"
        :edit-rules="{
          name: [{ required: true, min: 2, message: '名称至少两字' }],
          quantity: [{ type: 'number', min: 1, max: 99, message: '数量应在 1–99 之间' }]
        }"
        @edit-change="records = $event"
        @pagination:current-change="page = $event"
      >
        <template #detail-edit="{ value, update, commit }">
          <ElInput
            aria-label="自定义对象编辑器"
            :model-value="detailText(value)"
            @update:model-value="update({ text: $event })"
            @change="commit"
          />
        </template>
      </ArtTable>
    </div>
    <p role="status"
      >{{ message }} · 更新 {{ records.updateRecords.length }} · 新增
      {{ records.insertRecords.length }} · 移除 {{ records.removeRecords.length }}</p
    >
    <pre aria-label="原始首行" class="whitespace-pre-wrap text-xs">{{
      JSON.stringify(data[0])
    }}</pre>
    <pre aria-label="当前变更" class="whitespace-pre-wrap text-xs">{{
      JSON.stringify(
        records.changes.map(({ rowIndex, fields, row }) => ({ rowIndex, fields, row }))
      )
    }}</pre>
  </main>
</template>
<script setup lang="ts">
  import { ref, shallowRef } from 'vue'
  import type { ColumnOption, TableEditRecordset } from '@/types'
  import ArtTable, { type ArtTableExpose } from '@/components/core/tables/art-table/index.vue'
  import { toObjectRecord } from '@/utils/record'
  interface Row {
    id: number
    name: string
    quantity: number
    active: boolean
    state: string
    date: string
    detail: { text: string }
  }
  const virtual = new URLSearchParams(location.search).get('virtual') === '1'
  const data: Row[] = Array.from({ length: virtual ? 5000 : 42 }, (_, index) => ({
    id: index + 1,
    name: `记录 ${index + 1}`,
    quantity: 3,
    active: true,
    state: 'draft',
    date: '2026-10-30',
    detail: { text: '原始对象' }
  }))
  const table = ref<ArtTableExpose<Row>>()
  const mode = ref<'cell' | 'row'>('cell')
  const page = ref(1)
  const message = ref('就绪')
  const records = shallowRef<TableEditRecordset>({
    insertRecords: [],
    removeRecords: [],
    updateRecords: [],
    changes: []
  })
  const inserted = shallowRef<Row>()
  const groupedColumns: ColumnOption<Row>[] = [
    { prop: 'id', label: '编号', width: 80 },
    { prop: 'name', label: '名称', minWidth: 150, editRender: { name: 'input' } },
    {
      label: '可编辑字段',
      children: [
        {
          prop: 'quantity',
          label: '数量',
          minWidth: 130,
          editRender: { name: 'number', min: 0, max: 999 }
        },
        { prop: 'active', label: '启用', width: 100, editRender: { name: 'switch' } },
        {
          prop: 'state',
          label: '状态',
          minWidth: 140,
          editRender: {
            name: 'select',
            options: [
              { label: '草稿', value: 'draft' },
              { label: '就绪', value: 'ready' }
            ]
          }
        },
        { prop: 'date', label: '日期', minWidth: 170, editRender: { name: 'date' } }
      ]
    },
    {
      prop: 'detail',
      label: '自定义对象',
      minWidth: 180,
      editRender: { slot: 'detail-edit' },
      formatter: (row) => row.detail.text
    }
  ]
  const selectionColumn: ColumnOption<Row> = { type: 'selection', width: 48, fixed: 'left' }
  const columns: ColumnOption<Row>[] = virtual
    ? [selectionColumn, ...groupedColumns.flatMap((column) => column.children || [column])].map(
        (column) => (column.prop === 'name' ? { ...column, sortable: true } : column)
      )
    : groupedColumns
  const insert = () => {
    inserted.value = table.value?.insertAt(
      {
        id: 100,
        name: '临时记录',
        quantity: 1,
        active: false,
        state: 'draft',
        date: '2026-10-30',
        detail: { text: '新对象' }
      },
      -1
    )[0]
  }
  const removeInserted = () => {
    if (inserted.value) table.value?.remove(inserted.value)
  }
  const validate = async () => {
    const result = await table.value?.validate()
    message.value = result?.valid ? '校验通过' : result?.firstError?.message || '校验未完成'
  }
  const detailText = (value: unknown) => {
    const text = toObjectRecord(value).text
    return typeof text === 'string' ? text : ''
  }
</script>
