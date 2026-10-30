<template>
  <main
    class="table-style-parity flex min-h-screen w-full min-w-0 flex-col gap-4 overflow-x-hidden p-4"
  >
    <h1 class="text-lg font-semibold">ArtTable 表头与单元格样式对照</h1>
    <div class="flex flex-wrap items-center gap-2" aria-label="表格样式开关">
      <ElSegmented
        v-model="size"
        aria-label="表格尺寸"
        :options="[
          { label: '紧凑', value: TableSizeEnum.SMALL },
          { label: '默认', value: TableSizeEnum.DEFAULT },
          { label: '宽松', value: TableSizeEnum.LARGE }
        ]"
      />
      <ElSwitch v-model="border" aria-label="表格边框" active-text="边框" />
      <ElSwitch v-model="stripe" aria-label="表格斑马纹" active-text="斑马纹" />
      <ElSwitch v-model="headerBackground" aria-label="表头背景" active-text="表头背景" />
      <ElButton @click="selected = selected.length ? [] : [2]">切换选中行</ElButton>
      <ElButton @click="editing = !editing">切换编辑入口</ElButton>
    </div>
    <div class="grid w-full min-w-0 grid-cols-1 gap-4">
      <section class="min-w-0" aria-label="普通 ArtTable">
        <h2 class="mb-2 text-sm font-medium">普通 ArtTable · ElTable</h2>
        <div class="table-style-parity__table" style="height: 260px">
          <ArtTable
            :data="rows"
            :columns="columns"
            :show-table-header="false"
            :pagination="false"
            :selected-row-keys="selected"
            row-key="id"
            :edit-config="editing ? { trigger: 'dblclick', mode: 'cell' } : undefined"
          />
        </div>
      </section>
      <section class="min-w-0" aria-label="虚拟 ArtTable">
        <h2 class="mb-2 text-sm font-medium">虚拟 ArtTable · ElTableV2</h2>
        <div class="table-style-parity__table" style="height: 260px">
          <ArtTable
            :data="rows"
            :columns="columns"
            :virtual-scroll="true"
            :show-table-header="false"
            :pagination="false"
            :selected-row-keys="selected"
            row-key="id"
            :edit-config="editing ? { trigger: 'dblclick', mode: 'cell' } : undefined"
          />
        </div>
      </section>
    </div>
  </main>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { storeToRefs } from 'pinia'
  import { TableSizeEnum } from '@/enums/form-enum'
  import { useTableStore } from '@/store/modules/table'
  import type { ColumnOption } from '@/types'
  import ArtTable from '@/components/core/tables/art-table/index.vue'

  interface Row {
    id: number
    name: string
    status: string
    description: string
    owner: string
  }

  const tableStore = useTableStore()
  tableStore.setTableSize(TableSizeEnum.DEFAULT)
  tableStore.setIsBorder(false)
  tableStore.setIsZebra(false)
  tableStore.setIsHeaderBackground(true)
  const {
    tableSize: size,
    isBorder: border,
    isZebra: stripe,
    isHeaderBackground: headerBackground
  } = storeToRefs(tableStore)
  const selected = ref<number[]>([2])
  const editing = ref(false)
  const rows: Row[] = Array.from({ length: 12 }, (_, index) => ({
    id: index + 1,
    name: index === 1 ? '已选中的业务记录' : `业务记录 ${index + 1}`,
    status: index % 2 ? '待处理' : '已完成',
    description: index === 1 ? '这是用于核对行高、截断和悬停背景的较长业务说明' : '表格样式对照',
    owner: `负责人 ${index + 1}`
  }))
  const columns = computed<ColumnOption<Row>[]>(() => [
    { prop: 'id', label: '编号', width: 96, align: 'right' },
    { prop: 'name', label: '业务名称', minWidth: 220, editRender: { name: 'input' } },
    { prop: 'status', label: '状态', minWidth: 140 },
    { prop: 'description', label: '说明', minWidth: 290, showOverflowTooltip: true },
    { prop: 'owner', label: '负责人', minWidth: 180 }
  ])
</script>

<style scoped lang="scss">
  .table-style-parity__table {
    width: min(100%, 900px);
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: var(--art-surface-radius);
  }
</style>
