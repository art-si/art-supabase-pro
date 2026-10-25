<template>
  <div class="art-full-height workflow-monitor business-workspace-page">
    <MasterDeleteProcessingNotice
      :location-ready="false"
      action-hint="请在当前页面核对关联审批记录，处理完成后返回原页面继续删除。"
    />
    <BusinessWorkspaceHeader
      density="compact"
      eyebrow="APPROVAL OPERATIONS"
      title="审批运营监控"
      description="统一观察审批运行、节点时效与异常实例，用可追溯的管理动作保障流程连续性。"
      icon="ri:pulse-line"
      :tags="[
        {
          label: isPlatformSuper ? '平台全局视角' : '本租户只读视角',
          type: isPlatformSuper ? 'primary' : 'info',
          effect: 'plain'
        }
      ]"
      :metrics="metricCards"
      refreshable
      refresh-label="刷新审批监控数据"
      :refresh-loading="overview.loading"
      @refresh="refreshAll"
    >
      <template #actions>
        <BusinessTableWorkspaceActions :table="tableRef" />
        <ElButton type="primary" plain @click="openAnalytics">
          <ArtSvgIcon icon="ri:bar-chart-box-line" />运营分析
        </ElButton>
      </template>
    </BusinessWorkspaceHeader>

    <ElAlert
      v-if="overview.error"
      class="workflow-monitor__alert"
      type="error"
      :closable="false"
      show-icon
      title="审批运营概览加载失败"
    >
      <template #default>
        <span>{{ overview.error.message }}</span>
        <ElButton link type="primary" @click="loadSummary">重新加载</ElButton>
      </template>
    </ElAlert>

    <section
      class="workflow-monitor__callback-health art-card-xs"
      :class="{ 'is-attention': !!callbackHealth.error || callbackIssueCount > 0 }"
      :aria-busy="callbackHealth.loading"
    >
      <ArtOverlayLoading
        v-if="callbackHealth.loading"
        loading
        overlay
        size="compact"
        text="正在检查回调健康度…"
        description=""
      />
      <span
        ><ArtSvgIcon
          :icon="
            callbackHealth.error || callbackIssueCount
              ? 'ri:error-warning-line'
              : 'ri:shield-check-line'
          "
      /></span>
      <div>
        <strong>{{
          callbackHealth.error
            ? '回调健康度暂不可用'
            : callbackHealth.loading
              ? '正在检查回调健康度'
              : callbackIssueCount
                ? '业务回调需要关注'
                : '业务回调运行正常'
        }}</strong>
        <p v-if="callbackHealth.error">{{ callbackHealth.error.message }}</p>
        <p v-else>
          待投递 {{ callbackHealth.data.pending }} · 等待重试 {{ callbackHealth.data.retryWait }} ·
          死信 {{ callbackHealth.data.deadLetter }} · 已成功
          {{ callbackHealth.data.succeeded }}
        </p>
      </div>
      <ElButton
        v-if="callbackHealth.error"
        plain
        :disabled="callbackHealth.loading"
        @click="loadCallbackHealth"
        >重试健康度检查</ElButton
      >
      <ElButton
        :type="callbackIssueCount ? 'danger' : 'primary'"
        plain
        @click="openCallbackOutbox(callbackHealth.data.deadLetter > 0)"
      >
        <ArtSvgIcon icon="ri:inbox-archive-line" />查看回调队列
      </ElButton>
    </section>

    <ArtSectionCard class="workflow-monitor__workspace" preserve-content-structure>
      <template #header>
        <header class="workflow-monitor__workspace-header">
          <div>
            <ArtSectionTitle :show-line="false">流程实例</ArtSectionTitle>
            <p>超时按当前待办节点的截止时间实时计算；终止流程仅允许平台超级管理员操作。</p>
          </div>
          <ElTag :type="isPlatformSuper ? 'warning' : 'info'" effect="plain" round>
            <ArtSvgIcon icon="ri:timer-line" />优先处理超时实例
          </ElTag>
        </header>
      </template>

      <ArtTableQuery
        ref="tableRef"
        focusable
        v-model="table.searchQuery"
        :search-items="table.searchItems"
        :api-fn="fetchTableData"
        :columns-factory="table.columnsFactory"
        :search-bar-props="table.searchBarProps"
        :table-props="table.tableProps"
      />
    </ArtSectionCard>

    <component
      :is="instanceDrawerComponent"
      v-if="instanceDrawerComponent"
      ref="instanceDrawerRef"
    />
    <component
      :is="cancelDialogComponent"
      v-if="cancelDialogComponent"
      ref="cancelDialogRef"
      @success="handleCancelSuccess"
    />
    <component
      :is="callbackOutboxDrawerComponent"
      v-if="callbackOutboxDrawerComponent"
      ref="callbackOutboxDrawerRef"
      @change="loadCallbackHealth"
    />
    <component
      :is="analyticsDialogComponent"
      v-if="analyticsDialogComponent"
      ref="analyticsDialogRef"
    />
  </div>
</template>

<script setup lang="tsx">
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import { createFriendlySupabaseError } from '@/utils/supabase'
  import dayjs from 'dayjs'
  import { ElTag } from 'element-plus'
  import { storeToRefs } from 'pinia'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import type { ComputedRef, UnwrapNestedRefs } from 'vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type { ArtTableQueryExpose } from '@/components/core/tables/art-table-query/index.vue'
  import type { ColumnOption } from '@/types'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric
  } from '@/components/business/business-workspace-header/index.vue'
  import MasterDeleteProcessingNotice from '@/components/business/master-delete-processing-notice/index.vue'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtSectionTitle from '@/components/core/surfaces/art-section-title/index.vue'
  import { useUserStore } from '@/store/modules/user'
  import { useLazyComponent } from '@/hooks/core/useLazyComponent'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import { formatDateTimeValue as formatDate } from '@/utils/ui/format'
  import {
    fetchWorkflowCallbackOutbox,
    fetchWorkflowMonitorList,
    fetchWorkflowMonitorSummary
  } from '@/api/workflow'
  import { getWorkflowBusinessTypeLabel } from '../modules/workflow-business-contracts'

  defineOptions({ name: 'WorkflowMonitor' })

  type MonitorRow = Api.Workflow.WorkflowMonitorRecord
  interface MonitorSearch {
    keyword: string
    businessType: string
    status: Api.Workflow.InstanceStatus | ''
    slaStatus: Api.Workflow.WorkflowSlaStatus | ''
  }
  type MonitorTableParams = MonitorSearch & Pick<Api.Common.PaginationParams, 'current' | 'size'>
  interface MonitorTableGroup {
    searchQuery: MonitorSearch
    searchItems: ComputedRef<SearchFormItem[]>
    columnsFactory: () => ColumnOption<MonitorRow>[]
    searchBarProps: { span: number; labelWidth: number }
    tableProps: { rowKey: string; tableLayout: 'fixed'; emptyText: string }
  }
  interface AnalyticsDialogExpose {
    handleOpen: () => Promise<void>
  }
  interface OverviewGroup {
    loading: boolean
    loaded: boolean
    error: Error | null
    data: Api.Workflow.WorkflowMonitorSummary
  }
  interface CallbackHealthGroup {
    loading: boolean
    error: Error | null
    data: Api.Workflow.WorkflowCallbackSummary
  }
  interface InstanceDrawerExpose {
    handleOpen: (instanceId: string) => Promise<void>
  }
  interface CancelDialogExpose {
    handleOpen: (instance: MonitorRow) => Promise<void>
  }
  interface CallbackOutboxDrawerExpose {
    handleOpen: (data?: { focusFailures?: boolean }) => Promise<void>
  }

  const { isPlatformSuper } = storeToRefs(useUserStore())
  const businessTypeOptions = useDictionaryOptions('workflowBusinessType')
  const instanceStatusOptions = useDictionaryOptions('workflowInstanceStatus')
  const slaStatusOptions = useDictionaryOptions('workflowSlaStatus')
  const tableRef = ref<ArtTableQueryExpose>()
  const route = useRoute()
  const { component: analyticsDialogComponent, load: loadAnalyticsDialog } = useLazyComponent(
    () => import('./modules/workflow-analytics-dialog.vue')
  )
  const { component: instanceDrawerComponent, load: loadInstanceDrawer } = useLazyComponent(
    () => import('../workbench/modules/workflow-instance-drawer.vue')
  )
  const { component: cancelDialogComponent, load: loadCancelDialog } = useLazyComponent(
    () => import('./modules/workflow-cancel-dialog.vue')
  )
  const { component: callbackOutboxDrawerComponent, load: loadCallbackOutboxDrawer } =
    useLazyComponent(() => import('./modules/workflow-callback-outbox-drawer.vue'))
  const analyticsDialogRef = ref<AnalyticsDialogExpose>()
  const instanceDrawerRef = ref<InstanceDrawerExpose>()
  const cancelDialogRef = ref<CancelDialogExpose>()
  const callbackOutboxDrawerRef = ref<CallbackOutboxDrawerExpose>()
  const overview = reactive<OverviewGroup>({
    loading: false,
    loaded: false,
    error: null,
    data: {
      runningCount: 0,
      overdueCount: 0,
      approved30dCount: 0,
      rejected30dCount: 0,
      cancelled30dCount: 0,
      averageDurationHours: 0
    }
  })
  const callbackHealth = reactive<CallbackHealthGroup>({
    loading: false,
    error: null,
    data: { pending: 0, processing: 0, retryWait: 0, succeeded: 0, deadLetter: 0 }
  })

  const formatDuration = (hours: number) => {
    if (hours < 1) return `${Math.max(Math.round(hours * 60), 1)} 分钟`
    if (hours < 24) return `${hours.toFixed(1)} 小时`
    return `${(hours / 24).toFixed(1)} 天`
  }
  async function openAnalytics(): Promise<void> {
    await loadAnalyticsDialog()
    await analyticsDialogRef.value?.handleOpen()
  }
  async function openInstance(id: string): Promise<void> {
    await loadInstanceDrawer()
    await instanceDrawerRef.value?.handleOpen(id)
  }
  watch(
    () => route.query.recordId,
    (id) => {
      if (typeof id === 'string' && route.query.fromMasterDelete === '1') void openInstance(id)
    },
    { immediate: true }
  )
  async function openCancel(row: MonitorRow): Promise<void> {
    await loadCancelDialog()
    await cancelDialogRef.value?.handleOpen(row)
  }

  const createBusinessCell = (row: MonitorRow) => (
    <div class="workflow-monitor__business-cell">
      <strong title={row.businessTitle}>{row.businessTitle}</strong>
      <span class="workflow-monitor__business-meta">
        <span>{getWorkflowBusinessTypeLabel(row.businessType)}</span>
        <i>·</i>
        <span>{row.initiatorNameSnapshot || '--'}</span>
      </span>
      <small>{row.definitionName}</small>
    </div>
  )
  const createDefinitionCell = (row: MonitorRow) => (
    <div class="workflow-monitor__definition-cell">
      <strong>{row.definitionName}</strong>
      <small>
        {row.definitionCode} · V{row.versionNo}
      </small>
      <span class="workflow-monitor__node-name">{row.currentNodeName || '流程已结束'}</span>
    </div>
  )
  const createTimelineCell = (row: MonitorRow) => (
    <div class="workflow-monitor__timeline-cell">
      <strong>{formatDuration(Number(row.durationHours || 0))}</strong>
      <small>{formatDate(row.startedAt)}</small>
    </div>
  )
  const createSlaCell = (row: MonitorRow) => (
    <div class={{ 'workflow-monitor__sla-cell': true, 'is-overdue': row.isOverdue }}>
      <ArtDictDisplay
        dictCode="workflowSlaStatus"
        value={row.isOverdue ? 'overdue' : 'normal'}
        display="tag"
      />
      <small>
        {row.nearestDueAt ? dayjs(row.nearestDueAt).format('MM-DD HH:mm') : '未设置时限'}
      </small>
    </div>
  )

  const table: UnwrapNestedRefs<MonitorTableGroup> = reactive<MonitorTableGroup>({
    searchQuery: { keyword: '', businessType: '', status: '', slaStatus: '' },
    searchItems: computed(() => [
      {
        label: '实例检索',
        key: 'keyword',
        type: 'input',
        props: { placeholder: '业务标题、编号、发起人或流程', clearable: true }
      },
      {
        label: '业务类型',
        key: 'businessType',
        type: 'select',
        props: {
          options: businessTypeOptions,
          placeholder: '全部业务类型',
          clearable: true
        }
      },
      {
        label: '流程状态',
        key: 'status',
        type: 'select',
        props: {
          options: instanceStatusOptions,
          placeholder: '全部流程状态',
          clearable: true
        }
      },
      {
        label: '时效状态',
        key: 'slaStatus',
        type: 'select',
        props: {
          options: slaStatusOptions.filter((item) => item.value !== 'due_soon'),
          placeholder: '全部时效状态',
          clearable: true
        }
      }
    ]),
    columnsFactory: () => [
      {
        prop: 'businessTitle',
        label: '业务单据',
        minWidth: 250,
        fixed: 'left',
        link: { onClick: (row) => openInstance(row.id) },
        formatter: createBusinessCell
      },
      {
        prop: 'definitionName',
        label: '流程与节点',
        minWidth: 220,
        formatter: createDefinitionCell
      },
      {
        prop: 'status',
        label: '流程状态',
        width: 100,
        dict: { code: 'workflowInstanceStatus', display: 'tag' }
      },
      {
        prop: 'isOverdue',
        label: '节点时效',
        minWidth: 145,
        formatter: createSlaCell
      },
      {
        prop: 'durationHours',
        label: '流转时间',
        width: 165,
        formatter: createTimelineCell
      },
      {
        prop: 'operation',
        label: '操作',
        width: isPlatformSuper.value ? 125 : 80,
        fixed: 'right',
        formatter: (row) => (
          <div class="workflow-monitor__actions">
            <ArtButtonTable
              type="view"
              label="查看轨迹"
              onClick={() => void openInstance(row.id)}
            />
            {isPlatformSuper.value && row.status === 'running' ? (
              <ArtButtonTable
                type="delete"
                icon="ri:stop-circle-line"
                label="终止流程"
                onClick={() => void openCancel(row)}
              />
            ) : null}
          </div>
        )
      }
    ],
    searchBarProps: { span: 6, labelWidth: 88 },
    tableProps: { rowKey: 'id', tableLayout: 'fixed', emptyText: '暂无符合条件的审批实例' }
  })

  const completed30dCount = computed(
    () =>
      overview.data.approved30dCount +
      overview.data.rejected30dCount +
      overview.data.cancelled30dCount
  )
  const metricCards = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '运行中实例',
      value: overview.data.runningCount,
      description: '当前仍在流转的审批',
      icon: 'ri:loader-2-line',
      tone: 'primary'
    },
    {
      label: '超时实例',
      value: overview.data.overdueCount,
      description: overview.data.overdueCount ? '需要立即关注或干预' : '当前节点时效正常',
      icon: 'ri:alarm-warning-line',
      tone: overview.data.overdueCount ? 'danger' : 'success'
    },
    {
      label: '近30日结束',
      value: completed30dCount.value,
      description: `通过 ${overview.data.approved30dCount} · 驳回 ${overview.data.rejected30dCount} · 终止 ${overview.data.cancelled30dCount}`,
      icon: 'ri:checkbox-circle-line',
      tone: 'success'
    },
    {
      label: '平均流转耗时',
      value:
        overview.data.averageDurationHours > 0
          ? formatDuration(overview.data.averageDurationHours)
          : '--',
      description: '基于已结束流程计算',
      icon: 'ri:timer-flash-line',
      tone: 'info'
    }
  ])
  const callbackIssueCount = computed(
    () => callbackHealth.data.retryWait + callbackHealth.data.deadLetter
  )

  function fetchTableData(params: MonitorTableParams) {
    const { from, to } = buildSupabasePageRange(params)
    return fetchWorkflowMonitorList({ ...params, from, to })
  }

  let summaryRequestId = 0
  let callbackRequestId = 0

  onBeforeUnmount(() => {
    summaryRequestId += 1
    callbackRequestId += 1
  })

  async function loadSummary(): Promise<void> {
    const requestId = ++summaryRequestId
    overview.loading = true
    overview.error = null
    try {
      const result = await fetchWorkflowMonitorSummary()
      if (requestId !== summaryRequestId) return
      Object.assign(overview.data, result)
      overview.loaded = true
    } catch (error) {
      if (requestId !== summaryRequestId) return
      overview.error = createFriendlySupabaseError(error, '审批运营概览加载失败，请稍后重试')
    } finally {
      if (requestId === summaryRequestId) overview.loading = false
    }
  }

  async function loadCallbackHealth(): Promise<void> {
    const requestId = ++callbackRequestId
    callbackHealth.loading = true
    callbackHealth.error = null
    try {
      const result = await fetchWorkflowCallbackOutbox(null, 1)
      if (requestId !== callbackRequestId) return
      Object.assign(callbackHealth.data, result.summary)
    } catch (error) {
      if (requestId !== callbackRequestId) return
      callbackHealth.error = createFriendlySupabaseError(
        error,
        '业务回调健康度加载失败，请稍后重试'
      )
    } finally {
      if (requestId === callbackRequestId) callbackHealth.loading = false
    }
  }

  async function openCallbackOutbox(focusFailures = false): Promise<void> {
    await loadCallbackOutboxDrawer()
    await callbackOutboxDrawerRef.value?.handleOpen({ focusFailures })
  }

  async function refreshAll(): Promise<void> {
    await Promise.all([loadSummary(), loadCallbackHealth(), tableRef.value?.refreshData()])
  }

  async function handleCancelSuccess(): Promise<void> {
    await Promise.all([loadSummary(), loadCallbackHealth(), tableRef.value?.refreshUpdate()])
  }

  onMounted(() => void Promise.all([loadSummary(), loadCallbackHealth()]))
  onActivated(() => {
    if (overview.loaded) void refreshAll()
  })
</script>

<style scoped lang="scss">
  .workflow-monitor {
    overflow: hidden;

    &__alert {
      flex: 0 0 auto;

      :deep(.el-alert__content) {
        min-width: 0;
      }

      :deep(.el-alert__description) {
        display: flex;
        gap: 8px;
        align-items: center;
        margin-top: 4px;
      }
    }

    &__workspace {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-height: 0;
      padding: 18px;
      overflow: hidden;
    }

    &__callback-health {
      position: relative;
      display: flex;
      flex: 0 0 auto;
      gap: 14px;
      align-items: center;
      min-width: 0;
      padding: 14px 18px;
      border-left: 3px solid var(--el-color-success);

      > span {
        display: grid;
        flex: 0 0 auto;
        place-items: center;
        width: 38px;
        height: 38px;
        font-size: 19px;
        color: var(--el-color-success);
        background: var(--el-color-success-light-9);
        border-radius: var(--el-border-radius-base);
      }

      > div {
        flex: 1;
        min-width: 0;
      }

      strong {
        font-size: 14px;
        color: var(--art-gray-900);
      }

      p {
        margin: 3px 0 0;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 12px;
        color: var(--art-gray-500);
        white-space: nowrap;
      }

      &.is-attention {
        border-left-color: var(--el-color-danger);

        > span {
          color: var(--el-color-danger);
          background: var(--el-color-danger-light-9);
        }
      }
    }

    &__workspace-header {
      display: flex;
      gap: 16px;
      align-items: center;
      justify-content: space-between;
      padding: 0 2px 14px;

      > div {
        min-width: 0;
      }

      p {
        margin: 4px 0 0;
        font-size: 12px;
        color: var(--art-gray-500);
      }
    }

    :deep(.workflow-monitor__business-cell),
    :deep(.workflow-monitor__definition-cell),
    :deep(.workflow-monitor__sla-cell),
    :deep(.workflow-monitor__timeline-cell) {
      display: grid;
      gap: 3px;
      min-width: 0;

      strong,
      small,
      > span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      strong {
        font-weight: 600;
        color: var(--art-gray-900);
      }

      small {
        font-size: 12px;
        color: var(--art-gray-600);
      }
    }

    :deep(.workflow-monitor__business-meta) {
      display: flex;
      gap: 5px;
      align-items: center;
      min-width: 0;
      font-size: 12px;
      color: var(--art-gray-600);

      i {
        flex: 0 0 auto;
        font-style: normal;
        color: var(--art-gray-500);
      }

      > span:last-child {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }

    :deep(.workflow-monitor__node-name) {
      font-size: 12px;
      font-weight: 500;
      color: var(--art-gray-700);
    }

    :deep(.workflow-monitor__timeline-cell strong) {
      font-size: 13px;
    }

    :deep(.workflow-monitor__sla-cell) {
      justify-items: start;

      &.is-overdue small {
        color: var(--el-color-danger);
      }
    }

    :deep(.workflow-monitor__actions) {
      display: flex;
      flex-wrap: wrap;
      gap: 2px 8px;
      align-items: center;
    }

    :deep(.art-table-query) {
      flex: 1 1 auto;
      height: 100%;
      min-height: 0;
      overflow: hidden;
    }

    @media screen and (width <= 760px) {
      height: auto;
      overflow: visible;

      &__workspace-header,
      &__callback-health {
        flex-direction: column;
        align-items: flex-start;
      }

      &__callback-health {
        p {
          white-space: normal;
        }

        .el-button {
          width: 100%;
        }
      }

      &__workspace {
        min-height: 620px;
        padding: 14px;
      }
    }
  }
</style>
