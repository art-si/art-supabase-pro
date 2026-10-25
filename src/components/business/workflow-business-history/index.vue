<template>
  <section class="workflow-business-history" aria-label="审批历程">
    <ArtAsyncState
      :loading="!externalLoading && state.loading"
      :loading-mode="externalLoading ? 'mask' : 'skeleton'"
      :skeleton-rows="8"
      :error="state.error"
      error-title="审批历程加载失败"
      :empty="!state.instances.length"
      empty-text="暂无审批记录"
      empty-description="业务提交审批后，各轮流程和处理意见会完整保留在这里。"
      :min-height="minHeight"
      @retry="loadHistory"
    >
      <div class="workflow-business-history__content">
        <header class="workflow-business-history__summary art-card-xs">
          <div class="workflow-business-history__summary-copy">
            <span><ArtSvgIcon icon="ri:git-commit-line" /></span>
            <div>
              <small>APPROVAL JOURNEY</small>
              <h2>全流程审批历程</h2>
              <p>按提交轮次保留流程结果、办理人、处理时间和审批意见。</p>
            </div>
          </div>
          <dl>
            <div>
              <dt>提交轮次</dt>
              <dd>{{ summary.total }}</dd>
            </div>
            <div class="is-running">
              <dt>审批中</dt>
              <dd>{{ summary.running }}</dd>
            </div>
            <div class="is-approved">
              <dt>已通过</dt>
              <dd>{{ summary.approved }}</dd>
            </div>
            <div class="is-rejected">
              <dt>已驳回</dt>
              <dd>{{ summary.rejected }}</dd>
            </div>
          </dl>
        </header>

        <ElCollapse v-model="expandedInstances" class="workflow-business-history__rounds">
          <ElCollapseItem
            v-for="(instance, index) in state.instances"
            :key="instance.id"
            :name="instance.id"
          >
            <template #title>
              <div class="workflow-business-history__round-heading">
                <span>第 {{ state.instances.length - index }} 轮</span>
                <div>
                  <strong>{{ instance.definition?.name || instance.businessTitle }}</strong>
                  <small>
                    {{ formatDate(instance.startedAt) }} 发起
                    <template v-if="instance.finishedAt">
                      · {{ formatDuration(instance.startedAt, instance.finishedAt) }}完成
                    </template>
                  </small>
                </div>
                <ArtDictDisplay
                  dict-code="workflowInstanceStatus"
                  :value="instance.status"
                  display="tag"
                />
              </div>
            </template>

            <div class="workflow-business-history__round-body">
              <dl class="workflow-business-history__metadata">
                <div>
                  <dt>发起人</dt>
                  <dd>{{ instance.initiatorNameSnapshot || '--' }}</dd>
                </div>
                <div>
                  <dt>发起时间</dt>
                  <dd>{{ formatDate(instance.startedAt) }}</dd>
                </div>
                <div>
                  <dt>结束时间</dt>
                  <dd>{{ formatDate(instance.finishedAt) }}</dd>
                </div>
                <div>
                  <dt>流程版本</dt>
                  <dd>{{
                    instance.version?.versionNo ? `V${instance.version.versionNo}` : '--'
                  }}</dd>
                </div>
              </dl>

              <div v-if="instance.finishComment" class="workflow-business-history__result-note">
                <ArtSvgIcon icon="ri:chat-quote-line" />
                <div>
                  <strong>本轮结论</strong>
                  <p>{{ instance.finishComment }}</p>
                </div>
              </div>

              <section
                v-if="instance.version?.config?.nodes?.length"
                class="workflow-business-history__flow"
              >
                <ArtSectionTitle>流程全貌</ArtSectionTitle>
                <p>按本轮提交时的流程版本展示，未到达的后续节点标记为待执行。</p>
                <WorkflowFlowMap
                  :nodes="instance.version.config.nodes"
                  :tasks="instance.tasks"
                  :skipped-node-keys="getSkippedNodeKeys(instance.actions)"
                  :current-node-key="instance.currentNodeKey"
                  :instance-status="instance.status"
                  compact
                />
              </section>

              <ArtProcessTimeline
                :items="createWorkflowActionTimelineItems(instance.actions)"
                title="流转记录"
                :summary="`${instance.actions?.length ?? 0} 条不可篡改记录`"
                action-dict-code="workflowActionType"
                empty-title="本轮暂无流转动作"
                empty-description="流程动作生成后会自动展示。"
                max-height="520px"
              />
            </div>
          </ElCollapseItem>
        </ElCollapse>
      </div>
    </ArtAsyncState>
  </section>
</template>

<script setup lang="ts">
  import dayjs from 'dayjs'
  import { ElCollapse, ElCollapseItem } from 'element-plus'
  import { fetchWorkflowBusinessHistory } from '@/api/workflow'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import ArtProcessTimeline from '@/components/core/layouts/art-process-timeline/index.vue'
  import ArtSectionTitle from '@/components/core/surfaces/art-section-title/index.vue'
  import WorkflowFlowMap from '@/components/business/workflow-flow-map/index.vue'
  import { createDateTimeFormatter } from '@/utils/ui/format'
  import {
    createWorkflowActionTimelineItems,
    summarizeWorkflowHistory
  } from '@/utils/workflow-display'
  import type { WorkflowBusinessHistoryExpose } from './types'

  defineOptions({ name: 'WorkflowBusinessHistory' })

  const props = withDefaults(
    defineProps<{
      businessType: string
      businessId: string
      minHeight?: number
      externalLoading?: boolean
    }>(),
    { minHeight: 320, externalLoading: false }
  )

  const state = reactive<{
    loading: boolean
    error: Error | null
    instances: Api.Workflow.WorkflowInstanceRecord[]
  }>({
    loading: false,
    error: null,
    instances: []
  })
  const emit = defineEmits<{ loadingChange: [loading: boolean] }>()
  watch(
    () => state.loading,
    (loading) => emit('loadingChange', loading),
    { immediate: true }
  )
  const expandedInstances = ref<string[]>([])
  let requestId = 0

  const summary = computed(() => summarizeWorkflowHistory(state.instances))

  watch(
    () => [props.businessType, props.businessId] as const,
    ([businessType, businessId]) => {
      if (businessType && businessId) void loadHistory()
    },
    { immediate: true }
  )

  async function loadHistory(): Promise<void> {
    if (!props.businessType || !props.businessId) return

    const currentRequestId = ++requestId
    state.loading = true
    state.error = null
    try {
      const response = await fetchWorkflowBusinessHistory({
        businessType: props.businessType,
        businessId: props.businessId
      })
      if (currentRequestId !== requestId) return
      state.instances = response.data ?? []
      expandedInstances.value = state.instances[0]?.id ? [state.instances[0].id] : []
    } catch (error) {
      if (currentRequestId !== requestId) return
      state.instances = []
      state.error = error instanceof Error ? error : new Error('审批历程加载失败')
    } finally {
      if (currentRequestId === requestId) state.loading = false
    }
  }

  const formatDate = createDateTimeFormatter()

  function formatDuration(startedAt: string, finishedAt: string): string {
    const minutes = Math.max(dayjs(finishedAt).diff(dayjs(startedAt), 'minute'), 0)
    if (minutes < 60) return `${minutes} 分钟`
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    return remainingMinutes ? `${hours} 小时 ${remainingMinutes} 分钟` : `${hours} 小时`
  }

  function getSkippedNodeKeys(actions?: Api.Workflow.WorkflowActionRecord[]): string[] {
    return (actions ?? [])
      .filter((action) => action.action === 'auto_skip' && action.nodeKey)
      .map((action) => String(action.nodeKey))
  }

  defineExpose<WorkflowBusinessHistoryExpose>({ reload: loadHistory })
</script>

<style scoped lang="scss">
  .workflow-business-history {
    min-width: 0;

    &__content {
      display: grid;
      gap: 14px;
      min-width: 0;
    }

    &__summary {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 24px;
      align-items: center;
      padding: 18px;
      background: linear-gradient(
        135deg,
        color-mix(in srgb, var(--theme-color) 7%, var(--el-bg-color)),
        var(--el-bg-color) 68%
      );
    }

    &__summary-copy {
      display: flex;
      gap: 13px;
      align-items: center;
      min-width: 0;

      > span {
        display: grid;
        flex: 0 0 auto;
        place-items: center;
        width: 44px;
        height: 44px;
        font-size: 22px;
        color: var(--theme-color);
        background: color-mix(in srgb, var(--theme-color) 11%, var(--el-bg-color));
        border: 1px solid color-mix(in srgb, var(--theme-color) 18%, transparent);
        border-radius: var(--el-border-radius-base);
      }

      > div {
        min-width: 0;
      }

      small {
        font-size: 10px;
        font-weight: 700;
        color: var(--theme-color);
        letter-spacing: 0.12em;
      }

      h2 {
        margin: 2px 0 0;
        font-size: 17px;
        color: var(--el-text-color-primary);
      }

      p {
        margin: 4px 0 0;
        font-size: 12px;
        line-height: 1.6;
        color: var(--el-text-color-secondary);
      }
    }

    &__summary > dl {
      display: grid;
      grid-template-columns: repeat(4, minmax(68px, auto));
      gap: 8px;
      margin: 0;

      > div {
        display: grid;
        gap: 3px;
        padding: 9px 12px;
        text-align: center;
        background: var(--el-fill-color-extra-light);
        border: 1px solid var(--el-border-color-lighter);
        border-radius: var(--el-border-radius-base);
      }

      dt {
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }

      dd {
        margin: 0;
        font-size: 18px;
        font-weight: 700;
        color: var(--el-text-color-primary);
      }

      .is-running dd {
        color: var(--el-color-primary);
      }

      .is-approved dd {
        color: var(--el-color-success);
      }

      .is-rejected dd {
        color: var(--el-color-danger);
      }
    }

    &__rounds {
      min-width: 0;
      overflow: hidden;
      border: 1px solid var(--el-border-color-lighter);
      border-radius: var(--el-border-radius-base);

      :deep(.el-collapse-item__header) {
        height: auto;
        min-height: 70px;
        padding: 12px 16px;
        background: var(--el-bg-color);
      }

      :deep(.el-collapse-item__wrap) {
        background: var(--el-fill-color-extra-light);
      }

      :deep(.el-collapse-item__content) {
        padding: 0;
      }
    }

    &__round-heading {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 12px;
      align-items: center;
      width: 100%;
      min-width: 0;
      padding-right: 12px;

      > span {
        min-width: 54px;
        padding: 5px 8px;
        font-size: 11px;
        font-weight: 700;
        color: var(--theme-color);
        text-align: center;
        background: color-mix(in srgb, var(--theme-color) 9%, var(--el-bg-color));
        border-radius: 999px;
      }

      > div {
        display: grid;
        gap: 4px;
        min-width: 0;
      }

      strong,
      small {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      strong {
        font-size: 14px;
        color: var(--el-text-color-primary);
      }

      small {
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }
    }

    &__round-body {
      display: grid;
      gap: 16px;
      padding: 16px;
    }

    &__metadata {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
      margin: 0;

      > div {
        min-width: 0;
        padding: 10px 12px;
        background: var(--el-bg-color);
        border: 1px solid var(--el-border-color-lighter);
        border-radius: var(--el-border-radius-small);
      }

      dt {
        margin-bottom: 4px;
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }

      dd {
        margin: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 12px;
        color: var(--el-text-color-primary);
        white-space: nowrap;
      }
    }

    &__result-note {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      padding: 12px;
      color: var(--el-color-danger);
      background: color-mix(in srgb, var(--el-color-danger) 6%, var(--el-bg-color));
      border-left: 3px solid var(--el-color-danger);
      border-radius: var(--el-border-radius-small);

      > div {
        min-width: 0;
      }

      strong {
        font-size: 12px;
      }

      p {
        margin: 3px 0 0;
        font-size: 12px;
        line-height: 1.6;
        color: var(--el-text-color-regular);
        overflow-wrap: anywhere;
      }
    }

    &__flow {
      min-width: 0;
      padding: 16px;
      background: var(--el-bg-color);
      border: 1px solid var(--el-border-color-lighter);
      border-radius: var(--el-border-radius-base);

      > p {
        margin: 6px 0 14px;
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }
    }
  }

  @media (width <= 900px) {
    .workflow-business-history {
      &__summary {
        grid-template-columns: minmax(0, 1fr);
      }

      &__summary > dl,
      &__metadata {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  }

  @media (width <= 560px) {
    .workflow-business-history {
      &__summary-copy > span {
        display: none;
      }

      &__round-heading {
        grid-template-columns: auto minmax(0, 1fr);

        :deep(.el-tag) {
          grid-column: 2;
          justify-self: start;
        }
      }

      &__metadata {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  }
</style>
