<template>
  <ElScrollbar height="100dvh">
    <main class="flex min-w-0 flex-col gap-4 p-4">
      <h1 class="text-lg font-semibold">ArtTable 列布局事件验收</h1>
      <div class="flex flex-wrap gap-2">
        <ElButton @click="compact = !compact">切换容器宽度</ElButton>
        <ElButton @click="hideField = !hideField">切换字段可见</ElButton>
        <ElButton @click="reverse = !reverse">调整字段顺序</ElButton>
        <ElButton @click="pinned = !pinned">切换固定状态</ElButton>
        <ElButton @click="replaceRows">替换数据行</ElButton>
        <ElButton @click="hidden = !hidden">切换容器显示</ElButton>
      </div>
      <div class="flex flex-wrap gap-4 text-xs">
        <span
          >虚拟事件：<output aria-label="虚拟布局事件数">{{ layoutEvents }}</output></span
        >
        <span
          >原生事件：<output aria-label="原生布局事件数">{{ nativeEvents }}</output></span
        >
        <span
          >已发送零宽度：<output aria-label="零宽度已发送">{{ zeroSeen }}</output></span
        >
      </div>
      <ArtSectionCard title="虚拟表格" :show-scrollbar="false">
        <div v-show="!hidden" :style="viewportStyle" aria-label="虚拟布局区域">
          <ArtTable
            :data="rows"
            :columns="columns"
            :virtual-scroll="true"
            :show-table-header="false"
            :pagination="false"
            row-key="id"
            @column-layout="recordLayout"
          />
        </div>
      </ArtSectionCard>
      <ArtSectionCard title="原生对照表格" :show-scrollbar="false">
        <div v-show="!hidden" :style="viewportStyle" aria-label="原生布局区域">
          <ArtTable
            :data="rows"
            :columns="columns"
            :show-table-header="false"
            :pagination="false"
            row-key="id"
            @column-layout="nativeEvents++"
          />
        </div>
      </ArtSectionCard>
      <pre class="whitespace-pre-wrap break-all text-xs" aria-label="当前布局">{{
        JSON.stringify(layout)
      }}</pre>
    </main>
  </ElScrollbar>
</template>
<script setup lang="ts">
  import { computed, ref, shallowRef } from 'vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import type { ColumnOption, TableColumnLayout } from '@/types'

  interface Row {
    id: number
    fixed: string
    flex1: string
    flex2: string
    tail: string
  }
  const searchParams = new URLSearchParams(location.search)
  const prototypeFields = searchParams.has('prototype-fields')
  const hidden = ref(searchParams.has('initial-hidden'))
  const compact = ref(false)
  const hideField = ref(false)
  const reverse = ref(false)
  const pinned = ref(false)
  const layout = shallowRef<TableColumnLayout | null>(null)
  const layoutEvents = ref(0)
  const nativeEvents = ref(0)
  const zeroSeen = ref(false)
  const rows = shallowRef<Row[]>([
    { id: 1, fixed: 'row-secret-a', flex1: '弹性字段一', flex2: '弹性字段二', tail: '末列' },
    { id: 2, fixed: 'row-secret-b', flex1: '第二行一', flex2: '第二行二', tail: '第二行末列' }
  ])
  const viewportStyle = computed(() => ({
    width: compact.value ? '640px' : '860px',
    maxWidth: '100%',
    height: '240px'
  }))
  const columns = computed<ColumnOption<Row>[]>(() => {
    const all: ColumnOption<Row>[] = [
      { prop: 'fixed', label: '固定宽度', width: 120 },
      { prop: 'flex1', label: '弹性字段一', minWidth: 180 },
      {
        prop: 'flex2',
        label: '弹性字段二',
        minWidth: 140,
        fixed: pinned.value ? 'left' : undefined
      },
      { prop: 'tail', label: '末列', width: 160 }
    ]
    const visible = all.filter((column) => !hideField.value || column.prop !== 'flex1')
    const result = prototypeFields
      ? visible.map((column) => {
          if (column.prop === 'flex1')
            return { ...column, prop: '__proto__', formatter: (row: Row) => row.flex1 }
          if (column.prop === 'flex2')
            return { ...column, prop: 'constructor', formatter: (row: Row) => row.flex2 }
          if (column.prop === 'tail')
            return { ...column, prop: 'hasOwnProperty', formatter: (row: Row) => row.tail }
          return column
        })
      : visible
    return reverse.value ? result.toReversed() : result
  })
  const recordLayout = (value: TableColumnLayout): void => {
    layout.value = value
    layoutEvents.value++
    zeroSeen.value ||= value.viewportWidth === 0
  }
  const replaceRows = (): void => {
    rows.value = rows.value.map((row) => ({ ...row, fixed: `${row.fixed}-replaced` }))
  }
</script>
