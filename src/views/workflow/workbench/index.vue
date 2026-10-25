<template>
  <div class="art-full-height workflow-workbench business-workspace-page">
    <BusinessWorkspaceHeader
      eyebrow="APPROVAL WORKSPACE"
      title="审批工作台"
      description="统一处理跨业务审批任务，跟踪我发起的流程，并通过完整轨迹快速还原每次决策。"
      icon="ri:verified-badge-line"
      :metrics="metricCards"
      refreshable
      refresh-label="刷新审批数据"
      :refresh-loading="summary.loading"
      @metric-click="handleMetricClick"
      @refresh="refreshCurrent"
    >
      <template #actions>
        <ElButton type="primary" plain @click="openDelegation">
          <ArtSvgIcon icon="ri:user-shared-line" />离岗委托
        </ElButton>
      </template>
    </BusinessWorkspaceHeader>

    <ArtSectionCard class="workflow-workbench__workspace" preserve-content-structure>
      <template #header>
        <header class="workflow-workbench__workspace-header">
          <div>
            <ArtSectionTitle :show-line="false">{{ workspaceTitle }}</ArtSectionTitle>
            <p>{{ activeTabDescription }}</p>
          </div>
          <ElTag :type="activeTab === 'global' ? 'warning' : 'primary'" effect="plain" round>
            {{ activeTab === 'global' ? '平台超管全局视角' : '数据按当前租户隔离' }}
          </ElTag>
        </header>
      </template>

      <ElTabs v-model="activeTab" class="workflow-workbench__tabs" @tab-change="handleTabChange">
        <ElTabPane name="pending">
          <template #label
            ><span class="workflow-workbench__tab-label"
              ><ArtSvgIcon icon="ri:inbox-archive-line" />待我审批<ElBadge
                :value="summary.data.pendingCount"
                :max="99" /></span
          ></template>
          <ArtTableQuery
            ref="pendingTableRef"
            focusable
            v-model="pendingTable.searchQuery"
            :search-items="pendingTable.searchItems"
            :api-fn="fetchPendingData"
            :columns-factory="pendingTable.columnsFactory"
            :search-bar-props="searchBarProps"
            :table-props="tableProps"
          />
        </ElTabPane>
        <ElTabPane v-if="isPlatformSuper" name="global">
          <template #label>
            <span class="workflow-workbench__tab-label">
              <ArtSvgIcon icon="ri:global-line" />全局待办
              <ElBadge :value="globalPendingCount" :max="99" />
            </span>
          </template>
          <div class="workflow-workbench__override-guidance">
            <ArtSvgIcon icon="ri:shield-user-line" />
            <span>
              仅用于跨租户应急代办。每次通过或驳回都必须填写干预原因，并记录实际操作人与原审批人。
            </span>
          </div>
          <ArtTableQuery
            ref="globalTableRef"
            focusable
            v-model="globalTable.searchQuery"
            :search-items="globalTable.searchItems"
            :api-fn="fetchGlobalPendingData"
            :columns-factory="globalTable.columnsFactory"
            :search-bar-props="searchBarProps"
            :table-props="tableProps"
          />
        </ElTabPane>
        <ElTabPane name="handled">
          <template #label
            ><span class="workflow-workbench__tab-label"
              ><ArtSvgIcon icon="ri:checkbox-circle-line" />我已处理</span
            ></template
          >
          <ArtTableQuery
            ref="handledTableRef"
            focusable
            v-model="handledTable.searchQuery"
            :search-items="handledTable.searchItems"
            :api-fn="fetchHandledData"
            :columns-factory="handledTable.columnsFactory"
            :search-bar-props="searchBarProps"
            :table-props="tableProps"
          />
        </ElTabPane>
        <ElTabPane name="initiated">
          <template #label
            ><span class="workflow-workbench__tab-label"
              ><ArtSvgIcon icon="ri:send-plane-line" />我发起的</span
            ></template
          >
          <ArtTableQuery
            ref="initiatedTableRef"
            focusable
            v-model="initiatedTable.searchQuery"
            :search-items="initiatedTable.searchItems"
            :api-fn="fetchInitiatedData"
            :columns-factory="initiatedTable.columnsFactory"
            :search-bar-props="searchBarProps"
            :table-props="tableProps"
          />
        </ElTabPane>
      </ElTabs>
    </ArtSectionCard>

    <component
      :is="actionDialogComponent"
      v-if="actionDialogComponent"
      ref="actionDialogRef"
      @success="handleActionSuccess"
    />
    <component
      :is="transferDialogComponent"
      v-if="transferDialogComponent"
      ref="transferDialogRef"
      @success="handleActionSuccess"
    />
    <component
      :is="delegationDialogComponent"
      v-if="delegationDialogComponent"
      ref="delegationDialogRef"
      @success="handleActionSuccess"
    />
    <component
      :is="instanceDrawerComponent"
      v-if="instanceDrawerComponent"
      ref="instanceDrawerRef"
    />
  </div>
</template>

<script setup lang="tsx">
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import dayjs from 'dayjs'
  import { ElMessage, ElTag } from 'element-plus'
  import { useRoute, useRouter } from 'vue-router'
  import type { ComputedRef, UnwrapNestedRefs } from 'vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type { ArtTableQueryExpose } from '@/components/core/tables/art-table-query/index.vue'
  import type { ColumnOption } from '@/types'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric
  } from '@/components/business/business-workspace-header/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtSectionTitle from '@/components/core/surfaces/art-section-title/index.vue'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import { createDateTimeFormatter, formatDateTimeValue as formatDate } from '@/utils/ui/format'
  import { navigateToApplication } from '@/utils/application-navigation'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useLazyComponent } from '@/hooks/core/useLazyComponent'
  import { useUserStore } from '@/store/modules/user'
  import {
    fetchHandledWorkflowTasks,
    fetchInitiatedWorkflowInstances,
    fetchPendingWorkflowTasks,
    fetchPlatformGlobalPendingWorkflowTasks,
    fetchWorkflowWorkbenchSummary,
    withdrawWorkflow
  } from '@/api/workflow'
  import {
    getWorkflowBusinessContract,
    getWorkflowBusinessTypeLabel
  } from '../modules/workflow-business-contracts'

  const formatTableDateTime = createDateTimeFormatter({
    format: 'MM-DD HH:mm',
    emptyText: '--',
    invalidText: '--'
  })

  defineOptions({ name: 'WorkflowWorkbench' })

  type ActiveTab = 'pending' | 'global' | 'handled' | 'initiated'
  type Task = Api.Workflow.WorkflowTaskRecord
  type NodeTask = Api.Workflow.WorkflowNodeTaskRecord
  type Instance = Api.Workflow.WorkflowInstanceRecord
  interface TaskSearch {
    keyword: string
    businessType: string
    status?: Api.Workflow.TaskStatus | ''
    slaStatus?: Api.Workflow.WorkflowSlaStatus | ''
  }
  interface InstanceSearch {
    keyword: string
    businessType: string
    status: Api.Workflow.InstanceStatus | ''
  }
  type TaskTableParams = TaskSearch & Pick<Api.Common.PaginationParams, 'current' | 'size'>
  type InstanceTableParams = InstanceSearch & Pick<Api.Common.PaginationParams, 'current' | 'size'>
  interface ActionDialogExpose {
    handleOpen: (
      task: Task,
      action: 'approve' | 'reject',
      options?: { platformOverride?: boolean }
    ) => Promise<void>
  }
  interface InstanceDrawerExpose {
    handleOpen: (instanceId: string) => Promise<void>
  }
  interface TransferDialogExpose {
    handleOpen: (task: Task) => Promise<void>
  }
  interface DelegationDialogExpose {
    handleOpen: (userId: string, tenantId: string) => Promise<void>
  }
  interface TableGroup<TSearch, TRow> {
    searchQuery: TSearch
    searchItems: ComputedRef<SearchFormItem[]>
    columnsFactory: () => ColumnOption<TRow>[]
  }

  const userStore = useUserStore()
  const { getUserInfo, getDictMap, isPlatformSuper } = storeToRefs(userStore)
  const { confirmAction, promptReason } = useArtFeedback()
  const route = useRoute()
  const router = useRouter()
  const activeTab = ref<ActiveTab>('pending')
  const pendingTableRef = ref<ArtTableQueryExpose>()
  const globalTableRef = ref<ArtTableQueryExpose>()
  const handledTableRef = ref<ArtTableQueryExpose>()
  const initiatedTableRef = ref<ArtTableQueryExpose>()
  const { component: actionDialogComponent, load: loadActionDialog } = useLazyComponent(
    () => import('./modules/workflow-action-dialog.vue')
  )
  const { component: transferDialogComponent, load: loadTransferDialog } = useLazyComponent(
    () => import('./modules/workflow-transfer-dialog.vue')
  )
  const { component: delegationDialogComponent, load: loadDelegationDialog } = useLazyComponent(
    () => import('./modules/workflow-delegation-dialog.vue')
  )
  const { component: instanceDrawerComponent, load: loadInstanceDrawer } = useLazyComponent(
    () => import('./modules/workflow-instance-drawer.vue')
  )
  const actionDialogRef = ref<ActionDialogExpose>()
  const transferDialogRef = ref<TransferDialogExpose>()
  const delegationDialogRef = ref<DelegationDialogExpose>()
  const instanceDrawerRef = ref<InstanceDrawerExpose>()
  const searchBarProps = { span: 8, labelWidth: 88 }
  const tableProps = {
    rowKey: 'id',
    tableLayout: 'fixed' as const,
    emptyText: '当前视图暂无审批记录',
    emptyDescription: '可以调整筛选条件，或切换到“我已处理”“我发起的”继续查看。'
  }

  const summary = reactive({
    loading: false,
    data: {
      pendingCount: 0,
      dueSoonPendingCount: 0,
      overduePendingCount: 0,
      handledCount: 0,
      initiatedRunningCount: 0,
      initiatedCompletedCount: 0
    }
  })
  const currentUserId = computed(() => String(getUserInfo.value.userId || ''))
  const globalPendingCount = ref(0)
  const metricTabs: Record<string, Exclude<ActiveTab, 'global'>> = {
    pending: 'pending',
    handled: 'handled',
    'initiated-running': 'initiated',
    'initiated-completed': 'initiated'
  }
  let openedRouteInstanceId = ''

  const businessTypeSearchItem = (): SearchFormItem => ({
    label: '业务类型',
    key: 'businessType',
    type: 'select',
    props: {
      options: getDictMap.value.workflowBusinessType ?? [],
      placeholder: '全部业务类型',
      clearable: true
    }
  })
  const keywordSearchItem: SearchFormItem = {
    label: '业务标题',
    key: 'keyword',
    type: 'input',
    props: { placeholder: '搜索业务单据', clearable: true }
  }

  async function openInstance(instanceId?: string): Promise<void> {
    if (!instanceId) return
    await loadInstanceDrawer()
    await instanceDrawerRef.value?.handleOpen(instanceId)
  }
  async function openAction(
    task: Task,
    action: 'approve' | 'reject',
    options?: { platformOverride?: boolean }
  ): Promise<void> {
    await loadActionDialog()
    await actionDialogRef.value?.handleOpen(task, action, options)
  }
  async function openTransfer(task: Task): Promise<void> {
    await loadTransferDialog()
    await transferDialogRef.value?.handleOpen(task)
  }

  const createBusinessCell = (instance?: Instance) => {
    const contract = getWorkflowBusinessContract(instance?.businessType || '')
    const routePath =
      instance?.businessId && contract.businessType !== 'generic'
        ? contract.routePath(instance.businessId)
        : ''

    return (
      <div class="workflow-workbench__business-cell">
        {routePath ? (
          <a
            class="workflow-workbench__business-link"
            href={router.resolve(routePath).href}
            title={`查看${instance?.businessTitle || '业务单据'}详情`}
            onClick={(event: MouseEvent) => navigateToBusinessDocument(event, routePath)}
          >
            {instance?.businessTitle || '--'}
          </a>
        ) : (
          <strong>{instance?.businessTitle || '--'}</strong>
        )}
        <small>{instance?.definition?.name || instance?.businessId || '--'}</small>
      </div>
    )
  }

  const navigateToBusinessDocument = (event: MouseEvent, routePath: string): void => {
    event.preventDefault()
    event.stopPropagation()
    if (routePath.startsWith('/vms/')) {
      void navigateToApplication('vms', routePath).catch((error) =>
        ElMessage.error(getFriendlySupabaseErrorMessage(error, 'VMS 应用跳转失败'))
      )
      return
    }
    window.location.assign(router.resolve(routePath).href)
  }

  const pendingTable: UnwrapNestedRefs<TableGroup<TaskSearch, Task>> = reactive<
    TableGroup<TaskSearch, Task>
  >({
    searchQuery: { keyword: '', businessType: '', slaStatus: '' },
    searchItems: computed(() => [
      keywordSearchItem,
      businessTypeSearchItem(),
      {
        label: '时限状态',
        key: 'slaStatus',
        type: 'select',
        props: {
          options: getDictMap.value.workflowSlaStatus ?? [],
          placeholder: '全部时限',
          clearable: true
        }
      }
    ]),
    columnsFactory: () => [
      {
        prop: 'businessTitle',
        label: '业务单据',
        minWidth: 220,
        fixed: 'left',
        formatter: (row) => createBusinessCell(row.instance)
      },
      {
        prop: 'businessType',
        label: '业务类型',
        minWidth: 145,
        formatter: (row) => getWorkflowBusinessTypeLabel(row.instance?.businessType)
      },
      {
        prop: 'nodeName',
        label: '当前节点',
        minWidth: 140,
        link: { disabled: (row) => !row.instanceId, onClick: (row) => openInstance(row.instanceId) }
      },
      {
        prop: 'assignmentSource',
        label: '任务来源',
        width: 118,
        formatter: (row) =>
          row.assignmentSource === 'delegation' ? (
            <ElTag type="warning" effect="light" size="small" round>
              委托给我
            </ElTag>
          ) : row.assignmentSource === 'transfer' ? (
            <ElTag type="info" effect="light" size="small" round>
              转交给我
            </ElTag>
          ) : (
            <span>直接分配</span>
          )
      },
      {
        prop: 'initiator',
        label: '发起人',
        width: 115,
        formatter: (row) => row.instance?.initiatorNameSnapshot || '--'
      },
      {
        prop: 'createTime',
        label: '收到时间',
        width: 165,
        formatter: (row) => formatDate(row.createTime)
      },
      {
        prop: 'dueAt',
        label: '审批时限',
        width: 150,
        formatter: (row) =>
          row.dueAt ? (
            <span
              class={{
                'workflow-workbench__due': true,
                'is-overdue': dayjs(row.dueAt).isBefore(dayjs()),
                'is-due-soon':
                  dayjs(row.dueAt).isAfter(dayjs()) &&
                  dayjs(row.dueAt).diff(dayjs(), 'hour', true) <= 24
              }}
            >
              {dayjs(row.dueAt).isBefore(dayjs())
                ? '已超时 · '
                : dayjs(row.dueAt).diff(dayjs(), 'hour', true) <= 24
                  ? '即将超时 · '
                  : ''}
              {formatTableDateTime(row.dueAt)}
            </span>
          ) : (
            <span>--</span>
          )
      },
      {
        prop: 'operation',
        label: '操作',
        width: 210,
        fixed: 'right',
        formatter: (row) => (
          <div class="workflow-workbench__actions">
            <ArtButtonTable
              type="sign"
              label="通过审批"
              onClick={() => void openAction(row, 'approve')}
            />
            <ArtButtonTable
              type="delete"
              icon="ri:close-line"
              label="驳回申请"
              onClick={() => void openAction(row, 'reject')}
            />
            <ArtButtonTable
              type="edit"
              icon="ri:user-received-2-line"
              label="转交"
              onClick={() => void openTransfer(row)}
            />
            <ArtButtonTable
              type="view"
              label="查看详情"
              onClick={() => openInstance(row.instanceId)}
            />
          </div>
        )
      }
    ]
  })

  const globalTable: UnwrapNestedRefs<TableGroup<TaskSearch, NodeTask>> = reactive<
    TableGroup<TaskSearch, NodeTask>
  >({
    searchQuery: { keyword: '', businessType: '' },
    searchItems: computed(() => [keywordSearchItem, businessTypeSearchItem()]),
    columnsFactory: () => {
      const personalColumns = pendingTable.columnsFactory()
      return [
        personalColumns[0],
        {
          prop: 'tenant',
          label: '所属租户',
          minWidth: 150,
          formatter: (row) => (
            <div class="workflow-workbench__tenant-cell">
              <strong>{row.tenant?.tenantName || '--'}</strong>
              <small>{row.tenant?.tenantCode || '--'}</small>
            </div>
          )
        },
        personalColumns[1],
        {
          prop: 'assigneeNames',
          label: '审批席位',
          minWidth: 170,
          formatter: (row) => (
            <div class="workflow-workbench__assignee-cell">
              <strong>{row.pendingAssigneeCount} 个待处理席位</strong>
              <small>{row.assigneeNames.join('、') || '--'}</small>
            </div>
          )
        },
        ...personalColumns.slice(2, -1),
        {
          prop: 'operation',
          label: '代审批操作',
          width: 220,
          fixed: 'right',
          formatter: (row) => (
            <div class="workflow-workbench__actions">
              <ArtButtonTable
                type="sign"
                label="代为通过"
                onClick={() => void openAction(row, 'approve', { platformOverride: true })}
              />
              <ArtButtonTable
                type="delete"
                icon="ri:close-line"
                label="代为驳回"
                onClick={() => void openAction(row, 'reject', { platformOverride: true })}
              />
              <ArtButtonTable
                type="edit"
                icon="ri:user-received-2-line"
                label="转交"
                onClick={() => void openTransfer(row)}
              />
              <ArtButtonTable
                type="view"
                label="查看详情"
                onClick={() => openInstance(row.instanceId)}
              />
            </div>
          )
        }
      ] as ColumnOption<NodeTask>[]
    }
  })

  const handledTable: UnwrapNestedRefs<TableGroup<TaskSearch, Task>> = reactive<
    TableGroup<TaskSearch, Task>
  >({
    searchQuery: { keyword: '', businessType: '', status: '' },
    searchItems: computed(() => [
      keywordSearchItem,
      businessTypeSearchItem(),
      {
        label: '处理结果',
        key: 'status',
        type: 'select',
        props: {
          options: getDictMap.value.workflowTaskStatus ?? [],
          clearable: true,
          placeholder: '全部结果'
        }
      }
    ]),
    columnsFactory: () => [
      {
        prop: 'businessTitle',
        label: '业务单据',
        minWidth: 220,
        fixed: 'left',
        formatter: (row) => createBusinessCell(row.instance)
      },
      {
        prop: 'nodeName',
        label: '审批节点',
        minWidth: 140,
        link: { disabled: (row) => !row.instanceId, onClick: (row) => openInstance(row.instanceId) }
      },
      {
        prop: 'status',
        label: '处理结果',
        width: 110,
        dict: { code: 'workflowTaskStatus', display: 'tag' }
      },
      {
        prop: 'comment',
        label: '审批意见',
        minWidth: 190,
        showOverflowTooltip: true,
        formatter: (row) => row.comment || '--'
      },
      {
        prop: 'handledAt',
        label: '处理时间',
        width: 165,
        formatter: (row) => formatDate(row.handledAt)
      },
      {
        prop: 'operation',
        label: '操作',
        width: 80,
        fixed: 'right',
        formatter: (row) => (
          <ArtButtonTable
            type="view"
            label="查看详情"
            onClick={() => openInstance(row.instanceId)}
          />
        )
      }
    ]
  })

  const initiatedTable: UnwrapNestedRefs<TableGroup<InstanceSearch, Instance>> = reactive<
    TableGroup<InstanceSearch, Instance>
  >({
    searchQuery: { keyword: '', businessType: '', status: '' },
    searchItems: computed(() => [
      keywordSearchItem,
      businessTypeSearchItem(),
      {
        label: '流程状态',
        key: 'status',
        type: 'select',
        props: {
          options: getDictMap.value.workflowInstanceStatus ?? [],
          clearable: true,
          placeholder: '全部状态'
        }
      }
    ]),
    columnsFactory: () => [
      {
        prop: 'businessTitle',
        label: '业务单据',
        minWidth: 220,
        fixed: 'left',
        formatter: (row) => createBusinessCell(row)
      },
      {
        prop: 'businessType',
        label: '业务类型',
        minWidth: 145,
        formatter: (row) => getWorkflowBusinessTypeLabel(row.businessType)
      },
      {
        prop: 'status',
        label: '流程状态',
        width: 110,
        dict: { code: 'workflowInstanceStatus', display: 'tag' }
      },
      {
        prop: 'currentNodeName',
        label: '当前节点',
        minWidth: 145,
        link: { onClick: (row) => openInstance(row.id) },
        formatter: (row) => row.currentNodeName || '流程已结束'
      },
      {
        prop: 'startedAt',
        label: '发起时间',
        width: 165,
        formatter: (row) => formatDate(row.startedAt)
      },
      {
        prop: 'finishedAt',
        label: '结束时间',
        width: 165,
        formatter: (row) => formatDate(row.finishedAt)
      },
      {
        prop: 'operation',
        label: '操作',
        width: 115,
        fixed: 'right',
        formatter: (row) => (
          <div class="workflow-workbench__actions">
            <ArtButtonTable type="view" label="查看详情" onClick={() => openInstance(row.id)} />
            <ArtButtonTable
              type="delete"
              icon="ri:arrow-go-back-line"
              label="撤回申请"
              disabled={row.status !== 'running'}
              onClick={() => handleWithdraw(row)}
            />
          </div>
        )
      }
    ]
  })

  const metricCards = computed<BusinessWorkspaceMetric[]>(() => [
    {
      key: 'pending',
      label: '待我审批',
      value: summary.data.pendingCount,
      description: '需要及时做出决策',
      icon: 'ri:inbox-archive-line',
      tone: 'primary',
      interactive: true,
      selected: activeTab.value === 'pending',
      loading: summary.loading
    },
    {
      key: 'due-soon',
      label: '24 小时内到期',
      value: summary.data.dueSoonPendingCount,
      description: '优先处理临近时限任务',
      icon: 'ri:timer-flash-line',
      tone: summary.data.dueSoonPendingCount ? 'warning' : 'info',
      interactive: true,
      selected: activeTab.value === 'pending' && pendingTable.searchQuery.slaStatus === 'due_soon',
      loading: summary.loading
    },
    {
      key: 'overdue',
      label: '已超时待办',
      value: summary.data.overduePendingCount,
      description: '已超过节点审批时限',
      icon: 'ri:alarm-warning-line',
      tone: summary.data.overduePendingCount ? 'danger' : 'info',
      interactive: true,
      selected: activeTab.value === 'pending' && pendingTable.searchQuery.slaStatus === 'overdue',
      loading: summary.loading
    },
    {
      key: 'handled',
      label: '我已处理',
      value: summary.data.handledCount,
      description: '历史审批任务累计',
      icon: 'ri:checkbox-circle-line',
      tone: 'success',
      interactive: true,
      selected: activeTab.value === 'handled',
      loading: summary.loading
    },
    {
      key: 'initiated-running',
      label: '进行中的申请',
      value: summary.data.initiatedRunningCount,
      description: '我发起且尚未结束',
      icon: 'ri:loader-2-line',
      tone: 'warning',
      interactive: true,
      selected: activeTab.value === 'initiated',
      loading: summary.loading
    },
    {
      key: 'initiated-completed',
      label: '已结束的申请',
      value: summary.data.initiatedCompletedCount,
      description: '审批、驳回或撤回',
      icon: 'ri:archive-drawer-line',
      tone: 'info',
      interactive: true,
      selected: activeTab.value === 'initiated',
      loading: summary.loading
    }
  ])
  const activeTabDescription = computed(
    () =>
      ({
        pending: '优先处理临近时限和已超时的任务。',
        global: '跨租户查看全部有效待办，并在必要时执行有原因、有审计的代审批。',
        handled: '回顾我做出的审批决定与意见。',
        initiated: '跟踪我发起的所有审批流程。'
      })[activeTab.value]
  )
  const workspaceTitle = computed(() =>
    activeTab.value === 'global' ? '平台全局审批' : '我的审批'
  )

  function requireUserId(): string {
    if (!currentUserId.value) throw new Error('当前用户信息尚未就绪')
    return currentUserId.value
  }
  async function openDelegation(): Promise<void> {
    await loadDelegationDialog()
    await delegationDialogRef.value?.handleOpen(
      requireUserId(),
      String(getUserInfo.value.tenantId || '')
    )
  }
  function fetchPendingData(params: TaskTableParams) {
    const { from, to } = buildSupabasePageRange(params)
    return fetchPendingWorkflowTasks({ ...params, assigneeUserId: requireUserId(), from, to })
  }
  async function fetchGlobalPendingData(params: TaskTableParams) {
    const { from, to } = buildSupabasePageRange(params)
    const response = await fetchPlatformGlobalPendingWorkflowTasks({ ...params, from, to })
    globalPendingCount.value = response.data?.total ?? 0
    return response
  }
  function fetchHandledData(params: TaskTableParams) {
    const { from, to } = buildSupabasePageRange(params)
    return fetchHandledWorkflowTasks({ ...params, assigneeUserId: requireUserId(), from, to })
  }
  function fetchInitiatedData(params: InstanceTableParams) {
    const { from, to } = buildSupabasePageRange(params)
    return fetchInitiatedWorkflowInstances({
      ...params,
      initiatorUserId: requireUserId(),
      from,
      to
    })
  }

  async function loadSummary(): Promise<void> {
    if (!currentUserId.value) return
    summary.loading = true
    try {
      const [personalSummary, globalPending] = await Promise.all([
        fetchWorkflowWorkbenchSummary(currentUserId.value),
        isPlatformSuper.value
          ? fetchPlatformGlobalPendingWorkflowTasks({ from: 0, to: 0 })
          : Promise.resolve(null)
      ])
      Object.assign(summary.data, personalSummary)
      globalPendingCount.value = globalPending?.data?.total ?? 0
    } catch (error) {
      ElMessage.error(getFriendlySupabaseErrorMessage(error, '审批统计加载失败'))
    } finally {
      summary.loading = false
    }
  }

  function getActiveTableRef() {
    if (activeTab.value === 'global') return globalTableRef
    if (activeTab.value === 'handled') return handledTableRef
    if (activeTab.value === 'initiated') return initiatedTableRef
    return pendingTableRef
  }

  async function refreshCurrent(): Promise<void> {
    await Promise.all([loadSummary(), getActiveTableRef().value?.getData()])
  }
  async function handleMetricClick(metric: BusinessWorkspaceMetric): Promise<void> {
    if (metric.key === 'due-soon') {
      activeTab.value = 'pending'
      pendingTable.searchQuery.slaStatus = 'due_soon'
      await router.replace({ query: { ...route.query, tab: 'pending', scope: 'due-soon' } })
      await nextTick()
      await pendingTableRef.value?.getData()
      return
    }
    if (metric.key === 'overdue') {
      activeTab.value = 'pending'
      pendingTable.searchQuery.slaStatus = 'overdue'
      await router.replace({ query: { ...route.query, tab: 'pending', scope: 'overdue' } })
      await nextTick()
      await pendingTableRef.value?.getData()
      return
    }
    const tab = metricTabs[metric.key ?? '']
    if (!tab) return
    if (metric.key === 'pending') pendingTable.searchQuery.slaStatus = ''
    activeTab.value = tab
    await router.replace({ query: { ...route.query, tab, scope: undefined } })
    await nextTick()
    await getActiveTableRef().value?.getData()
  }
  async function handleTabChange(): Promise<void> {
    await router.replace({
      query: {
        ...route.query,
        tab: activeTab.value,
        scope: activeTab.value === 'pending' ? route.query.scope : undefined
      }
    })
    await getActiveTableRef().value?.getData()
  }
  async function handleActionSuccess(): Promise<void> {
    await Promise.all([
      pendingTableRef.value?.getData(),
      isPlatformSuper.value ? globalTableRef.value?.getData() : Promise.resolve(),
      handledTableRef.value?.getData(),
      loadSummary()
    ])
  }
  async function handleWithdraw(row: Instance): Promise<void> {
    await confirmAction(`撤回“${row.businessTitle}”后，当前待办将取消且本次流程不可恢复。`, {
      title: '撤回审批申请',
      confirmButtonText: '继续填写原因',
      type: 'warning'
    })
    const reason = await promptReason('请说明撤回原因，原因将写入审计轨迹。', '撤回原因', {
      maxLength: 200
    })
    await withdrawWorkflow(row.id, reason)
    await Promise.all([initiatedTableRef.value?.getData(), loadSummary()])
  }

  async function syncRouteContext(): Promise<void> {
    const routeTab = String(route.query.tab || '')
    if (
      routeTab === 'pending' ||
      routeTab === 'handled' ||
      routeTab === 'initiated' ||
      (routeTab === 'global' && isPlatformSuper.value)
    ) {
      activeTab.value = routeTab
    }
    pendingTable.searchQuery.slaStatus =
      route.query.scope === 'overdue'
        ? 'overdue'
        : route.query.scope === 'due-soon'
          ? 'due_soon'
          : ''

    const instanceId = String(route.query.instanceId || '')
    if (!instanceId || instanceId === openedRouteInstanceId) return
    openedRouteInstanceId = instanceId
    await nextTick()
    await openInstance(instanceId)
  }

  watch(
    () => route.fullPath,
    () => void syncRouteContext(),
    { flush: 'post' }
  )
  onActivated(() => {
    void loadSummary()
    void syncRouteContext()
  })
  onMounted(() => {
    void userStore.fetchDictList()
    void loadSummary()
    void syncRouteContext()
  })
</script>

<style scoped lang="scss">
  .workflow-workbench {
    &__hero {
      display: flex;
      gap: 24px;
      align-items: center;
      justify-content: space-between;
      padding: 22px 24px;
      background:
        radial-gradient(circle at 88% 10%, rgb(103 88 246 / 14%), transparent 30%),
        var(--default-box-color);
    }

    &__hero-actions {
      display: flex;
      flex: 0 0 auto;
      gap: 8px;
      align-items: center;
    }

    &__welcome {
      display: flex;
      gap: 15px;
      align-items: center;
      min-width: 0;
    }

    &__welcome > span {
      display: grid;
      flex: 0 0 auto;
      place-items: center;
      width: 52px;
      height: 52px;
      font-size: 26px;
      color: #fff;
      background: linear-gradient(145deg, var(--el-color-primary), #7868f8);
      border-radius: calc(var(--el-border-radius-base) + 8px);
      box-shadow: 0 12px 25px rgb(76 91 220 / 23%);
    }

    &__welcome > div > span {
      font-size: 11px;
      font-weight: 700;
      color: var(--el-color-primary);
      letter-spacing: 0.12em;
    }

    &__welcome h1 {
      margin: 4px 0 5px;
      font-size: 24px;
      font-weight: 600;
      color: var(--art-gray-900);
    }

    &__welcome p {
      margin: 0;
      font-size: 13px;
      line-height: 1.55;
      color: var(--art-gray-500);
    }

    &__metrics {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      min-height: 102px;
    }

    &__metrics article {
      display: flex;
      gap: 13px;
      align-items: center;
      min-width: 0;
      padding: 17px;
    }

    &__metrics article > span {
      display: grid;
      flex: 0 0 auto;
      place-items: center;
      width: 43px;
      height: 43px;
      font-size: 21px;
      border-radius: calc(var(--el-border-radius-base) + 5px);
    }

    &__metrics article > span.is-primary {
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
    }

    &__metrics article > span.is-success {
      color: var(--el-color-success);
      background: var(--el-color-success-light-9);
    }

    &__metrics article > span.is-warning {
      color: var(--el-color-warning);
      background: var(--el-color-warning-light-9);
    }

    &__metrics article > span.is-info {
      color: var(--el-color-info);
      background: var(--el-color-info-light-9);
    }

    &__metrics article div {
      display: grid;
      grid-template-columns: 1fr auto;
      column-gap: 8px;
      align-items: baseline;
      min-width: 0;
    }

    &__metrics small {
      font-size: 12px;
      color: var(--art-gray-500);
    }

    &__metrics strong {
      font-size: 25px;
      color: var(--art-gray-900);
    }

    &__metrics p {
      grid-column: 1 / -1;
      margin: 4px 0 0;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 12px;
      color: var(--art-gray-600);
      white-space: nowrap;
    }

    &__workspace {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-height: 540px;
      padding: 18px;
      overflow: hidden;
    }

    &__workspace-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 2px;
    }

    &__workspace-header p {
      margin: 5px 0 0;
      font-size: 12px;
      color: var(--art-gray-500);
    }

    &__tabs {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-height: 0;
    }

    &__tabs :deep(.el-tabs__content) {
      flex: 1;
      min-height: 0;
    }

    &__tabs :deep(.el-tab-pane) {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }

    &__tab-label {
      display: inline-flex;
      gap: 7px;
      align-items: center;
    }

    &__tab-label :deep(.el-badge__content) {
      transform: translateY(-1px) scale(0.82);
    }

    &__override-guidance {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      padding: 10px 12px;
      margin: 2px 0 12px;
      font-size: 12px;
      line-height: 1.55;
      color: var(--el-color-warning-dark-2);
      background: var(--el-color-warning-light-9);
      border: 1px solid var(--el-color-warning-light-7);
      border-radius: var(--el-border-radius-base);
    }

    &__override-guidance svg {
      flex: 0 0 auto;
      margin-top: 2px;
      font-size: 16px;
    }

    :deep(.workflow-workbench__business-cell),
    :deep(.workflow-workbench__tenant-cell),
    :deep(.workflow-workbench__assignee-cell) {
      display: grid;
      gap: 3px;
      min-width: 0;
    }

    :deep(.workflow-workbench__business-cell strong),
    :deep(.workflow-workbench__business-cell small),
    :deep(.workflow-workbench__tenant-cell strong),
    :deep(.workflow-workbench__tenant-cell small),
    :deep(.workflow-workbench__assignee-cell strong),
    :deep(.workflow-workbench__assignee-cell small) {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    :deep(.workflow-workbench__business-cell small),
    :deep(.workflow-workbench__tenant-cell small),
    :deep(.workflow-workbench__assignee-cell small) {
      font-size: 12px;
      color: var(--art-gray-600);
    }

    :deep(.workflow-workbench__business-link) {
      overflow: hidden;
      text-overflow: ellipsis;
      font-weight: 600;
      color: var(--theme-color);
      white-space: nowrap;
      text-decoration: none;

      &:hover {
        text-decoration: underline;
        text-underline-offset: 3px;
      }

      &:focus-visible {
        outline: 2px solid var(--theme-color);
        outline-offset: 2px;
        border-radius: var(--el-border-radius-small);
      }
    }

    :deep(.workflow-workbench__actions) {
      display: flex;
      align-items: center;
    }

    :deep(.workflow-workbench__due.is-overdue) {
      font-weight: 600;
      color: var(--el-color-danger);
    }

    :deep(.workflow-workbench__due.is-due-soon) {
      font-weight: 600;
      color: var(--el-color-warning);
    }

    :deep(.art-table-query) {
      min-width: 0;
    }

    :deep(.art-table-card) {
      border: 1px solid var(--art-gray-200);
    }
  }

  @media (width <= 1100px) {
    .workflow-workbench__metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (width <= 720px) {
    .workflow-workbench__hero {
      align-items: flex-start;
      padding: 18px;
    }

    .workflow-workbench__hero-actions {
      flex-direction: column;
      align-items: stretch;

      > button {
        width: 36px;
        padding: 8px;
        margin: 0;
      }

      > button :deep(span) {
        gap: 0;
        font-size: 0;
      }

      > button :deep(svg) {
        font-size: 16px;
      }
    }

    .workflow-workbench__welcome {
      align-items: flex-start;
    }

    .workflow-workbench__welcome h1 {
      font-size: 20px;
    }

    .workflow-workbench__metrics {
      grid-template-columns: 1fr;
    }

    .workflow-workbench__metrics article {
      padding: 14px;
    }

    .workflow-workbench__workspace {
      padding: 14px;
    }

    .workflow-workbench__workspace-header > .el-tag {
      display: none;
    }
  }
</style>
