<template>
  <ArtDrawer
    :loading="state.loading || state.snapshotLoading"
    ref="drawerRef"
    size="xl"
    :show-footer="false"
    show-fullscreen-button
  >
    <template #header>
      <div class="workflow-instance__title">
        <span><ArtSvgIcon icon="ri:file-history-line" /></span>
        <div><strong>审批实例详情</strong><small>流程状态、任务与操作轨迹</small></div>
      </div>
    </template>

    <ArtAsyncState
      :error="state.error"
      :empty="!state.detail"
      empty-text="未找到审批实例"
      empty-description="请返回审批列表重新选择实例，或刷新后重试。"
      :min-height="420"
      @retry="loadDetail"
    >
      <div v-if="state.detail" class="workflow-instance">
        <section class="workflow-instance__hero art-card-xs">
          <div class="workflow-instance__hero-main">
            <span><ArtSvgIcon icon="ri:git-merge-line" /></span>
            <div>
              <small
                >{{ state.detail.definition?.name || '审批流程' }} · V{{
                  state.detail.version?.versionNo || '-'
                }}</small
              >
              <h2>{{ state.detail.businessTitle }}</h2>
              <p
                >{{ businessTypeLabel }} ·
                {{ state.detail.initiatorNameSnapshot || '发起人待确认' }}</p
              >
            </div>
          </div>
          <div class="workflow-instance__hero-status">
            <small>当前状态</small>
            <ArtDictDisplay
              dict-code="workflowInstanceStatus"
              :value="state.detail.status"
              display="tag"
            />
          </div>
        </section>

        <ArtAsyncState
          v-if="state.snapshotError"
          :error="state.snapshotError"
          error-title="业务资料暂时不可用"
          :min-height="132"
          @retry="loadSnapshot"
        />
        <WorkflowBusinessSnapshot v-else-if="state.snapshot" :snapshot="state.snapshot" />

        <ArtSectionCard class="workflow-instance__section" preserve-content-structure>
          <template #header
            ><div class="workflow-instance__section-heading">
              <ArtSectionTitle>实例概览</ArtSectionTitle>
              <span>流程身份与当前进度</span>
            </div></template
          >
          <ArtDescriptions :data="state.detail" :items="descriptionItems" :columns="2" />
        </ArtSectionCard>

        <ArtSectionCard
          v-if="state.detail.version?.config?.nodes?.length"
          class="workflow-instance__section"
          preserve-content-structure
          title="流程图"
        >
          <WorkflowFlowMap
            :nodes="state.detail.version.config.nodes"
            :tasks="state.detail.tasks"
            :skipped-node-keys="skippedNodeKeys"
            :current-node-key="state.detail.currentNodeKey"
            :instance-status="state.detail.status"
          />
        </ArtSectionCard>

        <ArtSectionCard class="workflow-instance__section" preserve-content-structure>
          <template #header
            ><div class="workflow-instance__section-heading">
              <ArtSectionTitle>审批任务</ArtSectionTitle>
              <span>{{ taskNodeCount }} 个节点 · {{ sortedTasks.length }} 位审批人</span>
            </div></template
          >
          <WorkflowTaskBoard :tasks="sortedTasks" />
        </ArtSectionCard>

        <ArtSectionCard class="workflow-instance__section" preserve-content-structure>
          <ArtProcessTimeline
            :items="actionTimelineItems"
            title="流转记录"
            summary="不可篡改审计轨迹"
            action-dict-code="workflowActionType"
            empty-title="暂无流转记录"
            empty-description="流程动作发生后会自动记录在这里。"
          />
        </ArtSectionCard>
      </div>
    </ArtAsyncState>
  </ArtDrawer>
</template>

<script setup lang="ts">
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import { createFriendlySupabaseError } from '@/utils/supabase'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import ArtProcessTimeline from '@/components/core/layouts/art-process-timeline/index.vue'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtSectionTitle from '@/components/core/surfaces/art-section-title/index.vue'
  import WorkflowBusinessSnapshot from '../../modules/workflow-business-snapshot.vue'
  import WorkflowFlowMap from '@/components/business/workflow-flow-map/index.vue'
  import WorkflowTaskBoard from '../../modules/workflow-task-board.vue'
  import { getWorkflowBusinessTypeLabel } from '../../modules/workflow-business-contracts'
  import { formatDateTimeValue as formatDate } from '@/utils/ui/format'
  import { createWorkflowActionTimelineItems } from '@/utils/workflow-display'
  import { fetchWorkflowBusinessSnapshot, fetchWorkflowInstanceDetail } from '@/api/workflow'

  defineOptions({ name: 'WorkflowInstanceDrawer' })

  const drawerRef = ref<ArtDrawerExpose<string>>()
  const state = reactive<{
    instanceId: string
    loading: boolean
    error: Error | null
    detail: Api.Workflow.WorkflowInstanceRecord | null
    snapshot: Api.Workflow.WorkflowBusinessSnapshot | null
    snapshotLoading: boolean
    snapshotError: Error | null
  }>({
    instanceId: '',
    loading: false,
    error: null,
    detail: null,
    snapshot: null,
    snapshotLoading: false,
    snapshotError: null
  })
  let snapshotRequestId = 0

  const sortedTasks = computed(() =>
    [...(state.detail?.tasks || [])].sort(
      (a, b) => a.nodeOrder - b.nodeOrder || a.createTime.localeCompare(b.createTime)
    )
  )
  const taskNodeCount = computed(() => new Set(sortedTasks.value.map((task) => task.nodeKey)).size)
  const sortedActions = computed(() =>
    [...(state.detail?.actions || [])].sort((a, b) => b.createTime.localeCompare(a.createTime))
  )
  const skippedNodeKeys = computed(() =>
    sortedActions.value
      .filter((action) => action.action === 'auto_skip' && action.nodeKey)
      .map((action) => String(action.nodeKey))
  )
  const actionTimelineItems = computed(() =>
    createWorkflowActionTimelineItems(state.detail?.actions)
  )
  const businessTypeLabel = computed(() => getWorkflowBusinessTypeLabel(state.detail?.businessType))

  const descriptionItems = computed<ArtDescriptionItem<Api.Workflow.WorkflowInstanceRecord>[]>(
    () => [
      { key: 'initiator', label: '发起人', field: 'initiatorNameSnapshot' },
      {
        key: 'startedAt',
        label: '发起时间',
        value: (detail: Api.Workflow.WorkflowInstanceRecord) => formatDate(detail.startedAt)
      },
      {
        key: 'currentNode',
        label: '当前节点',
        value: (detail: Api.Workflow.WorkflowInstanceRecord) =>
          detail.currentNodeName || '流程已结束'
      },
      {
        key: 'finishedAt',
        label: '结束时间',
        value: (detail: Api.Workflow.WorkflowInstanceRecord) => formatDate(detail.finishedAt)
      },
      {
        key: 'finishComment',
        label: '结束说明',
        value: (detail: Api.Workflow.WorkflowInstanceRecord) => detail.finishComment || '--',
        span: 2
      }
    ]
  )
  async function loadDetail(): Promise<void> {
    if (!state.instanceId) return
    state.loading = true
    state.error = null
    void loadSnapshot()
    try {
      const detailResponse = await fetchWorkflowInstanceDetail(state.instanceId)
      state.detail = detailResponse.data
    } catch (error) {
      state.error = createFriendlySupabaseError(error, '审批实例加载失败，请稍后重试')
    } finally {
      state.loading = false
    }
  }

  async function loadSnapshot(): Promise<void> {
    const instanceId = state.instanceId
    if (!instanceId) return
    const requestId = ++snapshotRequestId
    state.snapshotLoading = true
    state.snapshotError = null
    try {
      const response = await fetchWorkflowBusinessSnapshot(instanceId, {
        showErrorMessage: false
      })
      if (requestId !== snapshotRequestId || state.instanceId !== instanceId) return
      if (!response.data) throw new Error('业务资料暂时无法加载')
      state.snapshot = response.data
    } catch {
      if (requestId !== snapshotRequestId || state.instanceId !== instanceId) return
      state.snapshot = null
      state.snapshotError = new Error(
        '业务资料暂时无法加载，审批记录与流程图仍可正常查看。请稍后重试。'
      )
    } finally {
      if (requestId === snapshotRequestId) state.snapshotLoading = false
    }
  }

  async function handleOpen(instanceId: string): Promise<void> {
    state.instanceId = instanceId
    state.detail = null
    state.snapshot = null
    state.snapshotLoading = false
    state.snapshotError = null
    state.error = null
    await drawerRef.value?.handleOpen(instanceId, {
      title: '审批实例详情',
      contentHeight: 'calc(100vh - 86px)'
    })
    await loadDetail()
  }

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .workflow-instance__title {
    display: flex;
    gap: 11px;
    align-items: center;

    > span {
      display: grid;
      place-items: center;
      width: 38px;
      height: 38px;
      font-size: 20px;
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
      border-radius: calc(var(--el-border-radius-base) + 3px);
    }

    div {
      display: grid;
      gap: 2px;
    }

    strong {
      color: var(--art-gray-900);
    }

    small {
      font-size: 12px;
      color: var(--art-gray-600);
    }
  }

  .workflow-instance {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 13px;
    width: 100%;
    min-width: 0;
    padding: 2px;

    &__hero {
      display: flex;
      gap: 20px;
      align-items: center;
      justify-content: space-between;
      padding: 20px;
      background: linear-gradient(
        135deg,
        var(--el-color-primary-light-9),
        var(--default-box-color) 70%
      );
    }

    &__hero-main {
      display: flex;
      gap: 13px;
      align-items: center;
      min-width: 0;

      > span {
        display: grid;
        flex: 0 0 auto;
        place-items: center;
        width: 46px;
        height: 46px;
        font-size: 22px;
        color: #fff;
        background: linear-gradient(145deg, var(--el-color-primary), #7467f6);
        border-radius: calc(var(--el-border-radius-base) + 6px);
      }

      div {
        min-width: 0;
      }

      small {
        font-weight: 600;
        color: var(--el-color-primary);
      }

      h2 {
        margin: 4px 0;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 19px;
        color: var(--art-gray-900);
        white-space: nowrap;
      }

      p {
        margin: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 12px;
        color: var(--art-gray-600);
        white-space: nowrap;
      }
    }

    &__hero-status {
      display: grid;
      flex: 0 0 auto;
      gap: 6px;
      justify-items: end;

      > small {
        font-size: 12px;
        color: var(--art-gray-600);
      }
    }

    &__section {
      width: 100%;
      min-width: 0;
      padding: 18px;
    }

    &__section-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 14px;
    }

    &__section-heading > span {
      flex: 0 0 auto;
      font-size: 12px;
      color: var(--art-gray-600);
      white-space: nowrap;
    }
  }

  @media (width <= 720px) {
    .workflow-instance {
      gap: 10px;

      &__hero {
        align-items: flex-start;
        padding: 16px;
      }

      &__hero-main {
        align-items: flex-start;

        h2,
        p {
          overflow-wrap: anywhere;
          white-space: normal;
        }
      }

      &__hero-status {
        justify-items: start;
      }

      &__section {
        padding: 14px;
      }

      &__section-heading {
        flex-wrap: wrap;
        gap: 6px;
      }
    }
  }
</style>
