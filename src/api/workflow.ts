import type { ApiFeedbackOptions } from '@/types/api/request'
import { normalizeNullableText } from '@/utils/form/normalize'
import { useSupabase } from '@/hooks/core/useSupabase'
import { createFriendlySupabaseError } from '@/utils/supabase'
import { buildOrIlikeFilter } from '@/utils/supabase/search'
import { loadAllDocumentPages } from '@/utils/business/document-detail-list'
import type { QueryResult } from '@/types/api/response'

const { supabase, responseHandle } = useSupabase()

const DEFINITION_SELECT = `
  *,
  tenant:sys_tenant!wf_definition_tenant_id_fkey(id, tenant_code, tenant_name),
  versions:wf_version!wf_version_definition_id_fkey(*)
`

const TASK_SELECT = `
  *,
  instance:wf_instance!wf_task_instance_id_fkey!inner(
    *,
    definition:wf_definition!wf_instance_definition_id_fkey(id, code, name, business_type),
    version:wf_version!wf_instance_version_id_fkey(id, version_no, config)
  )
`

const INSTANCE_SELECT = `
  *,
  definition:wf_definition!wf_instance_definition_id_fkey(id, code, name, business_type),
  version:wf_version!wf_instance_version_id_fkey(id, version_no, config),
  tasks:wf_task(*),
  actions:wf_action(
    *,
    actor:sys_user!wf_action_actor_user_id_fkey(id, user_name, nick_name, user_email, avatar)
  )
`

const BUSINESS_HISTORY_SELECT = `
  *,
  definition:wf_definition!wf_instance_definition_id_fkey(id, code, name, business_type),
  version:wf_version!wf_instance_version_id_fkey(id, version_no, config),
  tasks:wf_task(*),
  actions:wf_action(
    *,
    actor:sys_user!wf_action_actor_user_id_fkey(id, user_name, nick_name, user_email, avatar)
  )
`

type WorkflowDefinitionListParams = Api.Workflow.WorkflowDefinitionSearchParams & {
  businessTypes?: string[]
}

export async function fetchWorkflowDefinitionList(params: WorkflowDefinitionListParams) {
  const { from = 0, to = 9, keyword, businessType, businessTypes, status, tenantId } = params
  let query = supabase
    .from('wf_definition')
    .select(DEFINITION_SELECT, { count: 'exact' })
    .order('update_time', { ascending: false })
    .range(from, to)

  if (keyword) query = query.or(buildOrIlikeFilter(['code', 'name'], keyword))
  if (businessTypes?.length) query = query.in('business_type', businessTypes)
  else if (businessType) query = query.eq('business_type', businessType)
  if (status) query = query.eq('status', status)
  if (tenantId) query = query.eq('tenant_id', tenantId)

  return await responseHandle<Api.Workflow.WorkflowDefinitionRecord[]>(() => query, {
    showErrorMessage: true
  })
}

export async function fetchWorkflowDefinitionDetail(id: string, options: ApiFeedbackOptions = {}) {
  return await responseHandle<Api.Workflow.WorkflowDefinitionRecord>(
    () => supabase.from('wf_definition').select(DEFINITION_SELECT).eq('id', id).single(),
    { showErrorMessage: options.showErrorMessage ?? true, breakReturn: true }
  )
}

export async function saveWorkflowDefinition(
  payload: Api.Workflow.WorkflowDefinitionSavePayload,
  options: ApiFeedbackOptions = {}
) {
  return await responseHandle<{ definitionId: string; versionId: string; versionNo: number }>(
    // Workflow config is an explicit JSON contract and intentionally keeps camelCase keys.
    () => supabase.rpc('save_workflow_definition', { p_definition: payload }),
    {
      showMessage: options.showMessage ?? true,
      showErrorMessage: options.showErrorMessage ?? true,
      errorMessage: '流程草稿保存失败，请稍后重试',
      breakReturn: true
    }
  )
}

export async function publishWorkflowDefinition(id: string, options: ApiFeedbackOptions = {}) {
  return await responseHandle<{ definitionId: string; versionId: string; versionNo: number }>(
    () => supabase.rpc('publish_workflow_definition', { p_definition_id: id }),
    {
      showMessage: options.showMessage ?? true,
      showErrorMessage: options.showErrorMessage ?? true,
      breakReturn: true,
      errorMessage: '流程发布失败，请稍后重试',
      message: '流程发布成功'
    }
  )
}

export async function setWorkflowDefinitionEnabled(id: string, enabled: boolean) {
  return await responseHandle(
    () =>
      supabase.rpc('set_workflow_definition_enabled', {
        p_definition_id: id,
        p_enabled: enabled
      }),
    { showMessage: true, breakReturn: true }
  )
}

export async function deleteWorkflowDefinition(id: string) {
  return await responseHandle(
    () => supabase.rpc('delete_workflow_definition', { p_definition_id: id }),
    { showMessage: true, breakReturn: true }
  )
}

export async function fetchWorkflowUserOptions(
  params: Api.Workflow.WorkflowOptionSearchParams = {},
  options: ApiFeedbackOptions = {}
) {
  try {
    const data = await loadAllDocumentPages<
      Api.Workflow.WorkflowUserOption,
      { from?: number; to?: number }
    >(({ from = 0, to = 499 }) => {
      let query = supabase
        .from('sys_user')
        .select('id,user_name,nick_name,user_email,avatar', { count: 'exact' })
        .eq('status', '1')
        .is('deleted_at', null)
        .order('user_name')
        .order('id')
        .range(from, to)
      if (params.tenantId) query = query.eq('tenant_id', params.tenantId)
      return responseHandle<Api.Workflow.WorkflowUserOption[]>(() => query, {
        showErrorMessage: options.showErrorMessage ?? true
      })
    }, {})
    return { data, total: data.length, error: null } satisfies QueryResult<
      Api.Workflow.WorkflowUserOption[]
    >
  } catch (error) {
    return { data: null, error } satisfies QueryResult<Api.Workflow.WorkflowUserOption[]>
  }
}

export async function fetchWorkflowRoleOptions(
  params: Api.Workflow.WorkflowOptionSearchParams = {},
  options: ApiFeedbackOptions = {}
) {
  try {
    const data = await loadAllDocumentPages<
      Api.Workflow.WorkflowRoleOption,
      { from?: number; to?: number }
    >(({ from = 0, to = 499 }) => {
      let query = supabase
        .from('sys_role')
        .select('id,role_code,role_name', { count: 'exact' })
        .eq('enabled', true)
        .order('role_name')
        .order('id')
        .range(from, to)
      if (params.tenantId) query = query.eq('tenant_id', params.tenantId)
      return responseHandle<Api.Workflow.WorkflowRoleOption[]>(() => query, {
        showErrorMessage: options.showErrorMessage ?? true
      })
    }, {})
    return { data, total: data.length, error: null } satisfies QueryResult<
      Api.Workflow.WorkflowRoleOption[]
    >
  } catch (error) {
    return { data: null, error } satisfies QueryResult<Api.Workflow.WorkflowRoleOption[]>
  }
}

export async function fetchWorkflowDelegations(userId: string, options: ApiFeedbackOptions = {}) {
  try {
    const data = await loadAllDocumentPages<
      Api.Workflow.WorkflowDelegationRecord,
      { from?: number; to?: number }
    >(
      ({ from = 0, to = 499 }) =>
        responseHandle<Api.Workflow.WorkflowDelegationRecord[]>(
          () =>
            supabase
              .from('wf_delegation')
              .select(
                `*,
          delegator:sys_user!wf_delegation_delegator_user_id_fkey(
            id, user_name, nick_name, user_email, avatar
          ),
          delegate:sys_user!wf_delegation_delegate_user_id_fkey(
            id, user_name, nick_name, user_email, avatar
          )`,
                { count: 'exact' }
              )
              .or(`delegator_user_id.eq.${userId},delegate_user_id.eq.${userId}`)
              .order('create_time', { ascending: false })
              .order('id')
              .range(from, to),
          { showErrorMessage: options.showErrorMessage ?? true }
        ),
      {}
    )
    return { data, total: data.length, error: null } satisfies QueryResult<
      Api.Workflow.WorkflowDelegationRecord[]
    >
  } catch (error) {
    return { data: null, error } satisfies QueryResult<Api.Workflow.WorkflowDelegationRecord[]>
  }
}

export async function createWorkflowDelegation(params: {
  delegateUserId: string
  startsAt: string
  endsAt: string
  reason: string
}) {
  return await responseHandle<string>(
    () =>
      supabase.rpc('create_workflow_delegation', {
        p_delegate_user_id: params.delegateUserId,
        p_starts_at: params.startsAt,
        p_ends_at: params.endsAt,
        p_reason: params.reason
      }),
    {
      showMessage: false,
      showErrorMessage: false,
      breakReturn: true,
      errorMessage: '审批委托创建失败，请核对时间范围后重试'
    }
  )
}

export async function revokeWorkflowDelegation(delegationId: string, reason: string) {
  return await responseHandle<string>(
    () =>
      supabase.rpc('revoke_workflow_delegation', {
        p_delegation_id: delegationId,
        p_reason: reason
      }),
    {
      showMessage: false,
      showErrorMessage: false,
      breakReturn: true,
      errorMessage: '审批委托撤销失败，请刷新记录后重试'
    }
  )
}

export async function transferWorkflowTask(params: {
  taskId: string
  assigneeUserId: string
  reason: string
}) {
  return await responseHandle<string>(
    () =>
      supabase.rpc('transfer_workflow_task', {
        p_task_id: params.taskId,
        p_assignee_user_id: params.assigneeUserId,
        p_reason: params.reason,
        p_idempotency_key: crypto.randomUUID()
      }),
    {
      showMessage: false,
      showErrorMessage: false,
      breakReturn: true,
      errorMessage: '审批转交失败，请刷新待办后重试'
    }
  )
}

export async function fetchPendingWorkflowTasks(params: Api.Workflow.WorkflowTaskSearchParams) {
  const { from = 0, to = 9, keyword, businessType, assigneeUserId, slaStatus } = params
  const now = new Date()
  const dueSoonCutoff = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  let query = supabase
    .from('wf_task')
    .select(TASK_SELECT, { count: 'exact' })
    .eq('assignee_user_id', assigneeUserId)
    .eq('status', 'pending')
    .order('create_time', { ascending: false })
    .range(from, to)
  if (keyword) query = query.ilike('instance.business_title', `%${keyword}%`)
  if (businessType) query = query.eq('instance.business_type', businessType)
  if (slaStatus === 'overdue')
    query = query.not('due_at', 'is', null).lt('due_at', now.toISOString())
  if (slaStatus === 'due_soon')
    query = query
      .not('due_at', 'is', null)
      .gte('due_at', now.toISOString())
      .lte('due_at', dueSoonCutoff.toISOString())
  if (slaStatus === 'normal')
    query = query.or(`due_at.is.null,due_at.gt.${dueSoonCutoff.toISOString()}`)
  return await responseHandle<Api.Workflow.WorkflowTaskRecord[]>(() => query, {
    showErrorMessage: true
  })
}

export async function fetchPlatformGlobalPendingWorkflowTasks(
  params: Api.Workflow.PlatformGlobalWorkflowTaskSearchParams
) {
  const { from = 0, to = 19, keyword, businessType, tenantId } = params
  return await responseHandle<Api.Workflow.WorkflowNodeTaskPage>(
    () =>
      supabase.rpc('search_platform_global_pending_workflow_tasks', {
        p_keyword: normalizeNullableText(keyword),
        p_business_type: businessType || null,
        p_tenant_id: tenantId || null,
        p_from: from,
        p_to: to
      }),
    { showErrorMessage: true, breakReturn: true }
  )
}

export async function fetchHandledWorkflowTasks(params: Api.Workflow.WorkflowTaskSearchParams) {
  const { from = 0, to = 9, keyword, businessType, status, assigneeUserId } = params
  let query = supabase
    .from('wf_task')
    .select(TASK_SELECT, { count: 'exact' })
    .eq('assignee_user_id', assigneeUserId)
    .neq('status', 'pending')
    .order('handled_at', { ascending: false })
    .range(from, to)
  if (keyword) query = query.ilike('instance.business_title', `%${keyword}%`)
  if (businessType) query = query.eq('instance.business_type', businessType)
  if (status) query = query.eq('status', status)
  return await responseHandle<Api.Workflow.WorkflowTaskRecord[]>(() => query, {
    showErrorMessage: true
  })
}

export async function fetchInitiatedWorkflowInstances(
  params: Api.Workflow.WorkflowInstanceSearchParams
) {
  const { from = 0, to = 9, keyword, businessType, status, initiatorUserId } = params
  let query = supabase
    .from('wf_instance')
    .select(
      `*, definition:wf_definition!wf_instance_definition_id_fkey(id, code, name, business_type), version:wf_version!wf_instance_version_id_fkey(id, version_no)`,
      { count: 'exact' }
    )
    .eq('initiator_user_id', initiatorUserId)
    .order('started_at', { ascending: false })
    .range(from, to)
  if (keyword) query = query.ilike('business_title', `%${keyword}%`)
  if (businessType) query = query.eq('business_type', businessType)
  if (status) query = query.eq('status', status)
  return await responseHandle<Api.Workflow.WorkflowInstanceRecord[]>(() => query, {
    showErrorMessage: true
  })
}

export async function fetchWorkflowInstanceDetail(id: string) {
  return await responseHandle<Api.Workflow.WorkflowInstanceRecord>(
    () => supabase.from('wf_instance').select(INSTANCE_SELECT).eq('id', id).single(),
    { showErrorMessage: true, breakReturn: true }
  )
}

export async function fetchWorkflowBusinessHistory(params: {
  businessType: string
  businessId: string
}) {
  return await responseHandle<Api.Workflow.WorkflowInstanceRecord[]>(
    () =>
      supabase
        .from('wf_instance')
        .select(BUSINESS_HISTORY_SELECT)
        .eq('business_type', params.businessType)
        .eq('business_id', params.businessId)
        .order('started_at', { ascending: false }),
    {
      showErrorMessage: false,
      breakReturn: true,
      errorMessage: '审批历程加载失败，请稍后重试'
    }
  )
}

export async function fetchWorkflowBusinessSnapshot(
  instanceId: string,
  options: ApiFeedbackOptions = {}
) {
  return await responseHandle<Api.Workflow.WorkflowBusinessSnapshot>(
    () => supabase.rpc('get_workflow_business_snapshot', { p_instance_id: instanceId }),
    { showErrorMessage: options.showErrorMessage ?? true, breakReturn: true }
  )
}

export async function fetchWorkflowWorkbenchSummary(
  userId: string
): Promise<Api.Workflow.WorkflowWorkbenchSummary> {
  const [pending, handled, initiatedRunning, initiatedCompleted] = await Promise.all([
    supabase
      .from('wf_task')
      .select('id, due_at', { count: 'exact' })
      .eq('assignee_user_id', userId)
      .eq('status', 'pending'),
    supabase
      .from('wf_task')
      .select('id', { count: 'exact', head: true })
      .eq('assignee_user_id', userId)
      .neq('status', 'pending'),
    supabase
      .from('wf_instance')
      .select('id', { count: 'exact', head: true })
      .eq('initiator_user_id', userId)
      .eq('status', 'running'),
    supabase
      .from('wf_instance')
      .select('id', { count: 'exact', head: true })
      .eq('initiator_user_id', userId)
      .neq('status', 'running')
  ])
  const error = pending.error || handled.error || initiatedRunning.error || initiatedCompleted.error
  if (error) throw createFriendlySupabaseError(error, '审批统计加载失败，请稍后重试')
  const now = Date.now()
  const dueSoonCutoff = now + 24 * 60 * 60 * 1000
  return {
    pendingCount: pending.count ?? 0,
    dueSoonPendingCount: (pending.data ?? []).filter((task) => {
      const dueAt = task.due_at ? new Date(task.due_at).getTime() : 0
      return dueAt >= now && dueAt <= dueSoonCutoff
    }).length,
    overduePendingCount: (pending.data ?? []).filter(
      (task) => task.due_at && new Date(task.due_at).getTime() < now
    ).length,
    handledCount: handled.count ?? 0,
    initiatedRunningCount: initiatedRunning.count ?? 0,
    initiatedCompletedCount: initiatedCompleted.count ?? 0
  }
}

export async function fetchWorkflowMonitorList(params: Api.Workflow.WorkflowMonitorSearchParams) {
  const { from = 0, to = 19, keyword, businessType, status, slaStatus } = params
  return await responseHandle<Api.Workflow.WorkflowMonitorPage>(
    () =>
      supabase.rpc('search_workflow_instances_for_monitor', {
        p_keyword: normalizeNullableText(keyword),
        p_business_type: businessType || null,
        p_status: status || null,
        p_sla_status: slaStatus || null,
        p_from: from,
        p_to: to
      }),
    { breakReturn: true }
  )
}

export async function fetchWorkflowMonitorSummary(): Promise<Api.Workflow.WorkflowMonitorSummary> {
  const result = await responseHandle<Api.Workflow.WorkflowMonitorSummary>(
    () => supabase.rpc('get_workflow_monitor_summary'),
    { breakReturn: true }
  )
  if (!result.data) throw new Error('审批运营概览加载失败')
  return result.data
}

export async function fetchWorkflowOperationalAnalytics(
  days = 30
): Promise<Api.Workflow.WorkflowOperationalAnalytics> {
  const result = await responseHandle<Api.Workflow.WorkflowOperationalAnalytics>(
    () => supabase.rpc('get_workflow_operational_analytics', { p_days: days }),
    { breakReturn: true }
  )
  if (!result.data) throw new Error('审批运营分析加载失败')
  return result.data
}

export async function fetchWorkflowBottleneckAnalytics(
  days = 30
): Promise<Api.Workflow.WorkflowBottleneckAnalytics> {
  const result = await responseHandle<Api.Workflow.WorkflowBottleneckAnalytics>(
    () => supabase.rpc('get_workflow_bottleneck_analytics', { p_days: days }),
    { breakReturn: true }
  )
  if (!result.data) throw new Error('审批瓶颈分析加载失败')
  return result.data
}

export async function fetchWorkflowCallbackOutbox(
  status: Api.Workflow.WorkflowCallbackStatus | null = null,
  limit = 50
): Promise<Api.Workflow.WorkflowCallbackOutbox> {
  const result = await responseHandle<Api.Workflow.WorkflowCallbackOutbox>(
    () =>
      supabase.rpc('get_workflow_callback_outbox', {
        p_status: status,
        p_limit: limit
      }),
    { breakReturn: true }
  )
  if (!result.data) throw new Error('业务回调队列加载失败')
  return result.data
}

export async function retryWorkflowBusinessCallback(outboxId: string) {
  return await responseHandle<{ id: string; status: Api.Workflow.WorkflowCallbackStatus }>(
    () => supabase.rpc('retry_workflow_business_callback', { p_outbox_id: outboxId }),
    { showMessage: true, breakReturn: true, message: '已发起人工补偿' }
  )
}

export async function startWorkflow(params: {
  businessType: string
  businessId: string
  businessTitle: string
  context?: Record<string, unknown>
}) {
  return await responseHandle<string>(
    () =>
      supabase.rpc('start_workflow', {
        p_business_type: params.businessType,
        p_business_id: params.businessId,
        p_business_title: params.businessTitle,
        p_context: params.context ?? {},
        p_idempotency_key: crypto.randomUUID()
      }),
    { showMessage: true, breakReturn: true, message: '已提交审批' }
  )
}

export async function actWorkflowTask(params: {
  taskId: string
  action: 'approve' | 'reject'
  comment?: string | null
}) {
  return await responseHandle<string>(
    () =>
      supabase.rpc('act_workflow_task', {
        p_task_id: params.taskId,
        p_action: params.action,
        p_comment: params.comment || null,
        p_idempotency_key: crypto.randomUUID()
      }),
    {
      showMessage: true,
      breakReturn: true,
      message: params.action === 'approve' ? '审批已通过' : '已驳回申请'
    }
  )
}

export async function actWorkflowByBusiness(params: {
  businessType: string
  businessId: string
  action: 'approve' | 'reject'
  comment?: string | null
}) {
  return await responseHandle<string>(
    () =>
      supabase.rpc('act_workflow_by_business', {
        p_business_type: params.businessType,
        p_business_id: params.businessId,
        p_action: params.action,
        p_comment: params.comment || null,
        p_idempotency_key: crypto.randomUUID()
      }),
    { showMessage: true, breakReturn: true }
  )
}

export async function withdrawWorkflow(instanceId: string, comment?: string | null) {
  return await responseHandle(
    () =>
      supabase.rpc('withdraw_workflow', {
        p_instance_id: instanceId,
        p_comment: comment || null
      }),
    { showMessage: true, breakReturn: true, message: '申请已撤回' }
  )
}

export async function cancelWorkflowInstance(instanceId: string, comment: string) {
  return await responseHandle<string>(
    () =>
      supabase.rpc('cancel_workflow_instance', {
        p_instance_id: instanceId,
        p_comment: comment,
        p_idempotency_key: crypto.randomUUID()
      }),
    { showMessage: true, breakReturn: true, message: '流程已终止' }
  )
}
