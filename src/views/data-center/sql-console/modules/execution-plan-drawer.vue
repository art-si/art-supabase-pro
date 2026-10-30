<template>
  <ArtDrawer
    ref="drawerRef"
    :size="720"
    :show-confirm-button="false"
    :show-form-focus-button="false"
    cancel-text="关闭"
    @closed="applyPendingTable"
  >
    <div class="flex min-w-0 flex-col gap-5">
      <p class="m-0 text-sm leading-6 text-g-600"
        >预估执行路径与数据量，保留当前查询结果。成本为优化器估算值，实际耗时以查询结果为准。</p
      >
      <PlanCodePreview title="本次分析的 SQL" language="sql" :code="query" />
      <ArtAsyncState
        :loading="loading"
        :error="error"
        :empty="!steps.length"
        empty-text="暂无执行计划"
        empty-description="选择一条查询语句后重新分析"
        @retry="emit('retry')"
      >
        <div class="grid grid-cols-2 gap-3">
          <div class="rounded-lg bg-g-100 p-4"
            ><span class="block text-xs text-g-600">预估总成本</span
            ><strong class="mt-1 block text-xl font-medium tabular-nums">{{
              data?.estimatedCost ?? steps[0]?.totalCost ?? '—'
            }}</strong></div
          >
          <div class="rounded-lg bg-g-100 p-4"
            ><span class="block text-xs text-g-600">预估返回行数</span
            ><strong class="mt-1 block text-xl font-medium tabular-nums">{{
              data?.estimatedRows ?? steps[0]?.planRows ?? '—'
            }}</strong></div
          >
        </div>
        <div class="mt-5 flex items-center justify-between gap-3"
          ><h3 class="m-0 text-sm font-medium">执行路径</h3
          ><span class="text-xs text-g-600">{{ steps.length }} 个节点</span></div
        >
        <ol class="plan-steps">
          <li
            v-for="step in steps"
            :key="step.id"
            class="plan-step"
            :style="{ '--plan-depth': Math.min(step.depth, 6) }"
          >
            <div class="flex min-w-0 items-center justify-between gap-3"
              ><strong class="min-w-0 break-words text-sm font-medium">{{ step.nodeType }}</strong
              ><span class="shrink-0 text-xs text-g-600">{{ step.planRows ?? '—' }} 行</span></div
            >
            <div
              v-if="step.relationName || step.indexName"
              class="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-xs text-g-600"
            >
              <ElButton
                v-if="step.relationName"
                link
                type="primary"
                class="h-auto! max-w-full min-w-0 whitespace-normal! break-all text-left font-mono"
                :aria-label="`查看表结构 ${[step.schema, step.relationName].filter(Boolean).join('.')}`"
                @click="locateTable(step.schema, step.relationName)"
                >{{ [step.schema, step.relationName].filter(Boolean).join('.') }}</ElButton
              >
              <span v-if="step.indexName" class="break-all font-mono">{{ step.indexName }}</span>
            </div>
            <p v-if="step.filter" class="m-0 mt-2 break-all font-mono text-xs text-g-600"
              >过滤：{{ step.filter }}</p
            >
            <div class="mt-2 text-xs text-g-600"
              >成本 {{ step.startupCost ?? '—' }} → {{ step.totalCost ?? '—' }}</div
            >
          </li>
        </ol>
        <p
          v-if="steps.some((step) => step.nodeType.includes('Seq Scan'))"
          class="m-0 rounded-lg bg-g-100 p-3 text-xs leading-5 text-g-600"
          >计划包含顺序扫描。小表使用顺序扫描通常合理；可结合过滤条件、返回行数和现有索引评估。</p
        >
        <PlanCodePreview
          class="mt-4"
          title="原始 JSON"
          language="json"
          :code="JSON.stringify(data?.rawPlan ?? data?.plan, null, 2) || ''"
        />
      </ArtAsyncState>
    </div>
    <template #footer
      ><div class="flex w-full items-center justify-between gap-3"
        ><ElButton :disabled="loading || !steps.length" @click="copyPlan">复制计划</ElButton
        ><div class="flex items-center gap-2"
          ><ElButton :loading="loading" @click="emit('retry')">重新分析</ElButton
          ><ElButton @click="drawerRef?.handleClose()">关闭</ElButton></div
        ></div
      ></template
    >
  </ArtDrawer>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { ElMessage } from 'element-plus'
  import { copyTextToClipboard } from '@/utils/file/clipboard'
  import PlanCodePreview from './plan-code-preview.vue'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import { flattenSqlPlan } from '@/utils/sql-workbench'

  const props = defineProps<{
    query: string
    loading: boolean
    error: string | null
    data: Api.DataCenter.SqlConsole.SqlExplainResponse | null
    dialect?: 'postgres' | 'mysql' | 'dm'
  }>()
  const emit = defineEmits<{
    retry: []
    'locate-table': [schema: string | undefined, name: string]
  }>()
  let pendingTable: { schema?: string; name: string } | null = null
  const drawerRef = ref<ArtDrawerExpose>()
  const steps = computed(() => flattenSqlPlan(props.data?.plan))
  const copyPlan = async () => {
    try {
      await copyTextToClipboard(
        JSON.stringify(props.data?.rawPlan ?? props.data?.plan, null, 2) || '',
        {
          legacyFallback: true
        }
      )
      ElMessage.success('执行计划已复制')
    } catch {
      ElMessage.error('复制失败，请重试')
    }
  }
  const open = () =>
    drawerRef.value?.handleOpen(undefined, {
      title: '执行计划',
      subtitle: `${props.dialect === 'mysql' ? 'MySQL · ' : props.dialect === 'dm' ? '达梦 DM8 · ' : ''}数据库范围 · EXPLAIN · 仅预估，不执行`,
      headerIcon: 'ri:route-line'
    })
  const locateTable = (schema: string | undefined, name: string) => {
    pendingTable = { schema, name }
    drawerRef.value?.handleClose()
  }
  const applyPendingTable = () => {
    if (pendingTable) emit('locate-table', pendingTable.schema, pendingTable.name)
    pendingTable = null
  }
  const reset = () => {
    pendingTable = null
    drawerRef.value?.handleClose()
  }
  defineExpose({ open, reset })
</script>

<style scoped lang="scss">
  .plan-steps {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 0;
    margin: 12px 0;
    list-style: none;
  }

  .plan-step {
    min-width: 0;
    padding: 12px 14px;
    margin-left: calc(var(--plan-depth) * 14px);
    background: var(--el-fill-color-extra-light);
    border-left: 2px solid var(--el-color-primary-light-5);
    border-radius: 0 var(--el-border-radius-base) var(--el-border-radius-base) 0;
  }
</style>
