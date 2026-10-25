<template>
  <ArtDrawer
    :loading="state.loading"
    loading-text="正在检查回调队列…"
    ref="drawerRef"
    size="min(1240px, 82vw)"
    :show-footer="false"
  >
    <div class="workflow-callback-outbox">
      <section class="workflow-callback-outbox__intro art-card-xs">
        <span><ArtSvgIcon icon="ri:inbox-archive-line" /></span>
        <div>
          <strong>业务状态回写保障</strong>
          <p>审批结果先可靠入队，回写失败自动重试；死信需核对业务单据后人工补偿。</p>
        </div>
        <div class="workflow-callback-outbox__intro-meta">
          <ElTag
            :type="
              state.error
                ? 'danger'
                : state.loading
                  ? 'info'
                  : unresolvedCount
                    ? 'warning'
                    : 'success'
            "
            effect="plain"
            round
          >
            {{
              state.error
                ? '队列状态暂不可用'
                : state.loading
                  ? '正在检查队列'
                  : unresolvedCount
                    ? `${unresolvedCount} 条待处理`
                    : '队列运行正常'
            }}
          </ElTag>
          <small>{{ isPlatformSuper ? '平台全局队列' : '本租户只读' }}</small>
        </div>
      </section>

      <ElAlert
        v-if="state.error"
        type="error"
        :closable="false"
        show-icon
        title="业务回调队列加载失败"
      >
        <template #default>
          <span>{{ state.error.message }}</span>
          <ElButton link type="primary" @click="loadData">重新加载</ElButton>
        </template>
      </ElAlert>

      <section class="workflow-callback-outbox__metrics" :aria-busy="state.loading">
        <button
          v-for="metric in metricCards"
          :key="metric.key"
          type="button"
          class="workflow-callback-outbox__metric art-card-xs"
          :class="[`is-${metric.tone}`, { 'is-active': state.status === metric.filter }]"
          :aria-pressed="state.status === metric.filter"
          :aria-label="`筛选${metric.label}，共 ${metric.value} 条`"
          @click="handleMetricFilter(metric.filter)"
        >
          <span :class="`is-${metric.tone}`"><ArtSvgIcon :icon="metric.icon" /></span>
          <div>
            <small>{{ metric.label }}</small>
            <strong>{{ metric.value }}</strong>
          </div>
          <ArtSvgIcon class="workflow-callback-outbox__metric-arrow" icon="ri:arrow-right-s-line" />
        </button>
      </section>

      <ArtSectionCard class="workflow-callback-outbox__table" preserve-content-structure>
        <template #header>
          <header>
            <div class="workflow-callback-outbox__table-heading">
              <ArtSectionTitle :show-line="false">投递事件</ArtSectionTitle>
              <p>同一审批实例严格按事件顺序回写，失败事件会阻塞后续状态，避免业务状态倒退。</p>
              <small>当前展示 {{ visibleItems.length }} 条，最多加载最近 100 条事件</small>
            </div>
            <div class="workflow-callback-outbox__tools">
              <ArtTooltip content="刷新投递事件" placement="top">
                <ArtIconButton icon="ri:refresh-line" label="刷新投递事件" @click="loadData" />
              </ArtTooltip>
              <ElSelect
                v-model="state.status"
                placeholder="全部状态"
                clearable
                class="workflow-callback-outbox__status-filter"
                @change="loadData"
              >
                <ElOption
                  v-for="option in statusOptions"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                />
              </ElSelect>
            </div>
          </header>
        </template>

        <ArtTable
          :data="visibleItems"
          :columns="columns"
          :pagination="false"
          row-key="id"
          table-layout="fixed"
          height="100%"
          :empty-text="emptyText"
        />
      </ArtSectionCard>
    </div>
  </ArtDrawer>
</template>

<script setup lang="tsx">
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import { createFriendlySupabaseError, getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { storeToRefs } from 'pinia'
  import type { ColumnOption } from '@/types'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtSectionTitle from '@/components/core/surfaces/art-section-title/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import { useUserStore } from '@/store/modules/user'
  import { formatDateTimeValue as formatDate } from '@/utils/ui/format'
  import { fetchWorkflowCallbackOutbox, retryWorkflowBusinessCallback } from '@/api/workflow'

  defineOptions({ name: 'WorkflowCallbackOutboxDrawer' })

  const { confirmAction } = useArtFeedback()

  type CallbackRow = Api.Workflow.WorkflowCallbackRecord
  type CallbackFilter = Api.Workflow.WorkflowCallbackStatus | 'unresolved' | ''
  type CallbackTone = 'success' | 'warning' | 'danger' | 'info'

  interface DrawerOpenData {
    focusFailures?: boolean
  }
  interface CallbackState {
    loading: boolean
    error: Error | null
    status: CallbackFilter
    items: CallbackRow[]
    summary: Api.Workflow.WorkflowCallbackSummary
    retryingId: string
  }

  const emit = defineEmits<{ (event: 'change'): void }>()
  const { getDictMap, isPlatformSuper } = storeToRefs(useUserStore())
  const drawerRef = ref<ArtDrawerExpose<DrawerOpenData>>()
  const state = reactive<CallbackState>({
    loading: false,
    error: null,
    status: '',
    items: [],
    summary: { pending: 0, processing: 0, retryWait: 0, succeeded: 0, deadLetter: 0 },
    retryingId: ''
  })

  const statusOptions = computed(() => [
    { label: '全部处理中', value: 'unresolved' },
    ...(getDictMap.value.workflowCallbackStatus ?? [])
  ])
  const unresolvedCount = computed(
    () => state.summary.pending + state.summary.processing + state.summary.retryWait
  )
  const visibleItems = computed(() =>
    state.status === 'unresolved'
      ? state.items.filter((item) => ['pending', 'processing', 'retry_wait'].includes(item.status))
      : state.items
  )
  const emptyText = computed(() =>
    state.status ? '当前筛选条件下没有回调事件' : '暂时没有业务回调事件'
  )
  const metricCards = computed(() => [
    {
      key: 'unresolved',
      label: '处理中',
      value: unresolvedCount.value,
      icon: 'ri:loader-4-line',
      tone: (unresolvedCount.value ? 'warning' : 'success') as CallbackTone,
      filter: 'unresolved' as const
    },
    {
      key: 'retry',
      label: '等待重试',
      value: state.summary.retryWait,
      icon: 'ri:restart-line',
      tone: (state.summary.retryWait ? 'warning' : 'info') as CallbackTone,
      filter: 'retry_wait' as const
    },
    {
      key: 'dead',
      label: '死信事件',
      value: state.summary.deadLetter,
      icon: 'ri:error-warning-line',
      tone: (state.summary.deadLetter ? 'danger' : 'success') as CallbackTone,
      filter: 'dead_letter' as const
    },
    {
      key: 'success',
      label: '已成功',
      value: state.summary.succeeded,
      icon: 'ri:checkbox-circle-line',
      tone: 'success' as CallbackTone,
      filter: 'succeeded' as const
    }
  ])

  const canRetry = (row: CallbackRow) =>
    isPlatformSuper.value && (row.status === 'retry_wait' || row.status === 'dead_letter')

  const compactIdentifier = (value: string): string =>
    value.length > 20 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value

  const createBusinessCell = (row: CallbackRow) => (
    <div class="workflow-callback-outbox__business-cell">
      <strong>{row.businessTitle}</strong>
      <small title={row.businessId}>
        <span>{compactIdentifier(row.businessId)}</span>
        {row.tenantName ? <span>{row.tenantName}</span> : null}
      </small>
    </div>
  )
  const createStatusCell = (row: CallbackRow) => (
    <div class="workflow-callback-outbox__status-cell">
      <ArtDictDisplay dictCode="workflowCallbackStatus" value={row.status} display="tag" />
      <small>
        目标：
        <ArtDictDisplay dictCode="workflowInstanceStatus" value={row.targetStatus} display="text" />
      </small>
    </div>
  )
  const createDeliveryCell = (row: CallbackRow) => (
    <div class="workflow-callback-outbox__delivery-cell">
      <strong>
        本轮 <em>{row.attemptCount}</em>/{row.maxAttempts}
      </strong>
      <small>
        累计 {row.totalAttempts} 次 · 人工 {row.manualRetryCount} 次
      </small>
      <small>
        {row.status === 'succeeded'
          ? `完成于 ${formatDate(row.processedAt)}`
          : `下次执行 ${formatDate(row.nextAttemptAt)}`}
      </small>
    </div>
  )
  const createErrorCell = (row: CallbackRow) => {
    const message = row.lastError
      ? getFriendlySupabaseErrorMessage(
          { code: row.lastErrorCode, message: row.lastError },
          '业务状态回写未完成，请核查业务单据后重试'
        )
      : '暂无异常信息'
    return (
      <div class={{ 'workflow-callback-outbox__error-cell': true, 'is-empty': !row.lastError }}>
        <strong>
          {row.status === 'succeeded' ? '投递成功' : row.lastError ? '回写未完成' : '等待投递'}
        </strong>
        <small title={message}>{message}</small>
      </div>
    )
  }

  const columns: ColumnOption<CallbackRow>[] = [
    {
      prop: 'businessTitle',
      label: '业务单据',
      minWidth: 270,
      fixed: 'left',
      formatter: createBusinessCell
    },
    {
      prop: 'status',
      label: '状态',
      width: 145,
      formatter: createStatusCell
    },
    {
      prop: 'attemptCount',
      label: '投递进度',
      minWidth: 230,
      formatter: createDeliveryCell
    },
    { prop: 'lastError', label: '最近结果', minWidth: 240, formatter: createErrorCell },
    {
      prop: 'operation',
      label: '操作',
      width: 108,
      fixed: 'right',
      formatter: (row) =>
        !isPlatformSuper.value ? (
          <span class="workflow-callback-outbox__operation-placeholder">—</span>
        ) : canRetry(row) ? (
          <ArtButtonTable
            type="edit"
            icon="ri:restart-line"
            label="人工补偿"
            loading={state.retryingId === row.id}
            onClick={() => handleRetry(row)}
          />
        ) : (
          <span class="workflow-callback-outbox__operation-placeholder">—</span>
        )
    }
  ]

  let requestId = 0
  onBeforeUnmount(() => {
    requestId += 1
  })

  async function loadData(): Promise<void> {
    const currentRequestId = ++requestId
    state.loading = true
    state.error = null
    try {
      const fetchStatus = state.status === 'unresolved' ? null : state.status || null
      const result = await fetchWorkflowCallbackOutbox(fetchStatus, 100)
      if (currentRequestId !== requestId) return
      state.items = result.items
      Object.assign(state.summary, result.summary)
    } catch (error) {
      if (currentRequestId !== requestId) return
      state.error = createFriendlySupabaseError(error, '业务回调队列加载失败，请稍后重试')
    } finally {
      if (currentRequestId === requestId) state.loading = false
    }
  }

  function handleMetricFilter(filter: Exclude<CallbackFilter, ''>): void {
    state.status = state.status === filter ? '' : filter
    void loadData()
  }

  async function handleRetry(row: CallbackRow): Promise<void> {
    if (!isPlatformSuper.value) return

    try {
      await confirmAction(
        `将立即重新回写“${row.businessTitle}”的审批状态。请先确认业务单据仍允许变更。`,
        {
          title: '确认人工补偿',
          type: 'warning',
          confirmButtonText: '确认重试',
          cancelButtonText: '暂不处理'
        }
      )
    } catch {
      return
    }
    state.retryingId = row.id
    try {
      await retryWorkflowBusinessCallback(row.id)
      await loadData()
      emit('change')
    } finally {
      state.retryingId = ''
    }
  }

  async function handleOpen(data: DrawerOpenData = {}): Promise<void> {
    state.status = data.focusFailures ? 'dead_letter' : ''
    await drawerRef.value?.handleOpen(data, {
      title: '业务回调队列',
      contentHeight: 'calc(100vh - 150px)',
      scrollbarAlways: true,
      showFooter: false,
      onOpen: () => void loadData()
    })
  }

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .workflow-callback-outbox {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 100%;

    &__intro {
      display: flex;
      gap: 12px;
      align-items: center;
      padding: 13px 16px;

      > span {
        display: grid;
        flex: 0 0 auto;
        place-items: center;
        width: 40px;
        height: 40px;
        font-size: 20px;
        color: var(--el-color-primary);
        background: var(--el-color-primary-light-9);
        border-radius: var(--el-border-radius-base);
      }

      > div:first-of-type {
        flex: 1;
        min-width: 0;
      }

      strong {
        font-size: 15px;
        color: var(--art-gray-900);
      }

      p {
        margin: 3px 0 0;
        font-size: 12px;
        line-height: 1.6;
        color: var(--art-gray-500);
      }
    }

    &__intro-meta {
      display: grid;
      flex: 0 0 auto;
      gap: 4px;
      justify-items: end;

      small {
        font-size: 10px;
        color: var(--art-gray-400);
      }
    }

    &__metrics {
      position: relative;
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;

      button {
        position: relative;
        display: flex;
        gap: 10px;
        align-items: center;
        width: 100%;
        min-width: 0;
        padding: 11px 13px;
        color: inherit;
        text-align: left;
        cursor: pointer;
        transition:
          background-color 0.18s ease,
          border-color 0.18s ease,
          box-shadow 0.18s ease,
          transform 0.18s ease;

        &:hover {
          background: color-mix(in srgb, var(--theme-color) 6%, var(--default-box-color));
          border-color: color-mix(in srgb, var(--theme-color) 28%, var(--art-card-border));
          box-shadow: var(--art-themed-action-hover-shadow);

          .workflow-callback-outbox__metric-arrow {
            opacity: 1;
            transform: translateX(2px);
          }
        }

        &:focus-visible {
          outline: none;
          border-color: color-mix(in srgb, var(--theme-color) 34%, var(--art-card-border));
          box-shadow: var(--art-themed-action-focus-shadow);
        }

        &.is-active {
          background: color-mix(in srgb, var(--theme-color) 9%, var(--default-box-color));
          border-color: color-mix(in srgb, var(--theme-color) 38%, var(--art-card-border));
          box-shadow: var(--art-themed-action-active-shadow);
        }

        > span {
          display: grid;
          place-items: center;
          width: 36px;
          height: 36px;
          font-size: 18px;
          border-radius: var(--el-border-radius-base);

          &.is-success {
            color: var(--el-color-success);
            background: var(--el-color-success-light-9);
          }

          &.is-warning {
            color: var(--el-color-warning);
            background: var(--el-color-warning-light-9);
          }

          &.is-danger {
            color: var(--el-color-danger);
            background: var(--el-color-danger-light-9);
          }

          &.is-info {
            color: var(--el-color-info);
            background: var(--el-color-info-light-9);
          }
        }

        > div {
          display: grid;
          flex: 1;
          min-width: 0;
        }

        small {
          font-size: 11px;
          color: var(--art-gray-500);
        }

        strong {
          font-size: 19px;
          font-variant-numeric: tabular-nums;
          line-height: 1.3;
          color: var(--art-gray-900);
        }
      }
    }

    &__metric-arrow {
      flex: 0 0 auto;
      font-size: 18px;
      color: var(--theme-color);
      opacity: 0.45;
      transition:
        opacity 0.18s ease,
        transform 0.18s ease;
    }

    &__table {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-height: 420px;
      padding: 16px;

      > header {
        display: flex;
        gap: 16px;
        align-items: center;
        justify-content: space-between;
        padding: 0 2px 14px;

        > div:first-child {
          min-width: 0;
        }

        p {
          margin: 4px 0 0;
          font-size: 12px;
          color: var(--art-gray-500);
        }
      }

      :deep(.art-table) {
        flex: 1;
        min-height: 0;
      }
    }

    &__tools {
      display: flex;
      flex: 0 0 auto;
      gap: 8px;
      align-items: center;
    }

    &__table-heading {
      > small {
        display: block;
        margin-top: 5px;
        font-size: 10px;
        color: var(--art-gray-400);
      }
    }

    &__status-filter {
      width: 150px;
    }

    :deep(.workflow-callback-outbox__business-cell),
    :deep(.workflow-callback-outbox__status-cell),
    :deep(.workflow-callback-outbox__delivery-cell),
    :deep(.workflow-callback-outbox__error-cell) {
      display: grid;
      gap: 3px;
      min-width: 0;
    }

    :deep(.workflow-callback-outbox__business-cell strong),
    :deep(.workflow-callback-outbox__business-cell small),
    :deep(.workflow-callback-outbox__status-cell strong),
    :deep(.workflow-callback-outbox__status-cell small),
    :deep(.workflow-callback-outbox__delivery-cell strong),
    :deep(.workflow-callback-outbox__delivery-cell small),
    :deep(.workflow-callback-outbox__error-cell strong),
    :deep(.workflow-callback-outbox__error-cell small) {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    :deep(.workflow-callback-outbox__business-cell strong),
    :deep(.workflow-callback-outbox__status-cell strong),
    :deep(.workflow-callback-outbox__delivery-cell strong),
    :deep(.workflow-callback-outbox__error-cell strong) {
      font-weight: 600;
      color: var(--art-gray-900);
    }

    :deep(.workflow-callback-outbox__business-cell small),
    :deep(.workflow-callback-outbox__status-cell small),
    :deep(.workflow-callback-outbox__delivery-cell small),
    :deep(.workflow-callback-outbox__error-cell small) {
      font-size: 11px;
      color: var(--art-gray-500);
    }

    :deep(.workflow-callback-outbox__business-cell small) {
      display: flex;
      gap: 7px;
      min-width: 0;
    }

    :deep(.workflow-callback-outbox__business-cell small span) {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;

      &:first-child {
        font-variant-numeric: tabular-nums;
      }
    }

    :deep(.workflow-callback-outbox__business-cell small span + span::before) {
      margin-right: 7px;
      color: var(--art-gray-300);
      content: '·';
    }

    :deep(.workflow-callback-outbox__status-cell) {
      align-content: center;
    }

    :deep(.workflow-callback-outbox__status-cell small) {
      display: flex;
      gap: 2px;
      align-items: center;
    }

    :deep(.workflow-callback-outbox__delivery-cell) {
      font-variant-numeric: tabular-nums;
    }

    :deep(.workflow-callback-outbox__delivery-cell strong) {
      font-size: 12px;
      font-weight: 500;
    }

    :deep(.workflow-callback-outbox__delivery-cell strong em) {
      font-size: 14px;
      font-style: normal;
      font-weight: 700;
      color: var(--theme-color);
    }

    :deep(.workflow-callback-outbox__error-cell strong) {
      font-size: 11px;
      color: var(--el-color-danger);
    }

    :deep(.workflow-callback-outbox__error-cell.is-empty strong) {
      color: var(--el-color-success);
    }

    :deep(.workflow-callback-outbox__operation-placeholder) {
      font-size: 12px;
      color: var(--art-gray-400);
    }

    :deep(.el-table .cell) {
      min-width: 0;
    }

    @media screen and (width <= 900px) {
      &__metrics {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      &__table > header {
        flex-direction: column;
        align-items: flex-start;
      }

      &__tools {
        width: 100%;
      }

      &__status-filter {
        flex: 1;
        min-width: 0;
      }

      &__intro {
        align-items: flex-start;
      }

      &__intro-meta {
        display: none;
      }
    }

    @media screen and (width <= 560px) {
      &__metrics {
        grid-template-columns: 1fr;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      &__metric,
      &__metric-arrow {
        transition: none;
      }
    }
  }

  :global(html[data-box-mode='shadow-mode'] .workflow-callback-outbox__metric:hover),
  :global(html[data-box-mode='shadow-mode'] .workflow-callback-outbox__metric:focus-visible),
  :global(html[data-box-mode='shadow-mode'] .workflow-callback-outbox__metric.is-active) {
    border-color: transparent;
  }
</style>
