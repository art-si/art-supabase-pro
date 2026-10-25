import type { ApiFeedbackOptions } from '@/types/api/request'
import { normalizeNullableText } from '@/utils/form/normalize'
import { AppRouteRecord } from '@/types/router'
import { useSupabase } from '@/hooks/core/useSupabase'
import { WRITE_PERMISSION_DENIED_MESSAGE } from '@/hooks/core/useSupabase'
import { buildSpecsFromMap, applyFilters, fetchAllRangePages, type Op } from '@/utils/supabase'
import { toNextDayStartUTC, toStartOfDayUTC } from '@/utils/time/format'
import { omit } from 'lodash-es'
import TreeUtils from '@/utils/tree'
import { resolveTenantScopeId } from '@/utils/tenant-scope-context'
import { mapWithConcurrency } from '@/utils/async'
const { supabase, keysToSnakeDeep, responseHandle } = useSupabase()

const organizationTreeUtils = new TreeUtils({
  idKey: 'id',
  parentKey: 'parentId',
  childrenKey: 'children'
})

const ORGANIZATION_DETAIL_SELECT = `
  *,
  tenant:sys_tenant!sys_organization_tenant_id_fkey(tenant_code, tenant_name),
  leader:sys_user!sys_organization_leader_user_tenant_fkey(
    id, avatar, user_name, nick_name, user_email
  ),
  members:sys_user!sys_user_organization_id_fkey(
    id, avatar, user_name, nick_name, user_email, status, user_roles
  ),
  roles:sys_role!sys_role_organization_id_fkey(
    id, role_name, role_code, enabled,
    role_menus:sys_role_menu!sys_role_menu_role_id_fkey(
      menu_id,
      menu:sys_menu!sys_role_menu_menu_id_fkey(name, type, meta)
    )
  )
`

type SystemParamItem = Api.SystemManage.SystemParamItem
type GeofenceConfigItem = Api.SystemManage.GeofenceConfigItem
const GEOFENCE_CONFIG_PARAM_KEY = 'tms.geofence.config'
const GEOFENCE_CONFIG_REQUEST_TIMEOUT_MS = 20_000

interface DeleteUserSyncPayload {
  action: 'deactivate'
  id: string
  auth_user_id?: string
}

interface UserEmployeeReference extends NonNullable<Api.SystemManage.UserListItem['hrEmployee']> {
  userId: string
}

interface UserEmployeeReferencePayload {
  records?: UserEmployeeReference[]
}

// 获取用户列表
export async function fetchUserList(params: Api.SystemManage.UserSearchParams) {
  const {
    id,
    tenantId,
    organizationId,
    organizationIds,
    organizationUnassigned,
    accountIdentityType,
    userName,
    userPhone,
    userGender,
    userEmail,
    status,
    from = 0,
    to = 9
  } = params
  // 用户名和邮箱使用不区分大小写的包含匹配，其它字段保持精确匹配。
  // opsMap 使用 snake_case keys（buildSpecsFromMap 会内部 convertKeysToSnake，所以可以用 camelCase）
  const opsMap = {
    userName: 'ilike', // will be mapped to user_name internally
    userEmail: 'ilike'
    // userPhone 默认 eq
  } as Record<string, Op>

  // buildSpecsFromMap 会把 keys 转为 snake_case，并返回 FilterSpec[]
  // 它默认 op 为 'eq'，但会把 opsMap 中指定的替换为对应 op
  const specs = buildSpecsFromMap(
    {
      id,
      userName: userName ? `%${userName}%` : undefined, // 包裹 % 以用于 ilike
      userPhone,
      userEmail: userEmail?.trim() ? `%${userEmail.trim()}%` : undefined,
      userGender,
      status,
      tenantId,
      accountIdentityType,
      organizationId: organizationUnassigned ? undefined : organizationId
    },
    opsMap
  )
  /* const specs = [
        { col: 'user_name', op: 'ilike', val: userName ? `%${userName}%` : undefined },
        { col: 'user_phone', op: 'eq', val: userPhone },
        { col: 'user_email', op: 'eq', val: userEmail }
      ]*/

  // 构建查询
  let query = supabase
    .from('sys_user')
    .select(
      `
        *,
        tenant:sys_tenant!sys_user_tenant_id_fkey(tenant_code, tenant_name, builtin_type),
        organization:mdm_organization!sys_user_organization_id_fkey(
          id,
          organization_code,
          organization_name
        )
      `,
      { count: 'exact' }
    )
    .is('deleted_at', null)
    .order('create_time', { ascending: false }) // 按创建时间倒序
    .range(from, to)

  // applyFilters 支持传入 FilterSpec[]（这里 specs 已为 snake_case）
  query = applyFilters(query, specs, { skipEmpty: true, camelToSnake: false })

  if (organizationUnassigned) {
    query = query.is('organization_id', null)
  } else if (organizationIds?.length) {
    query = query.in('organization_id', organizationIds)
  }

  const response = await responseHandle<Api.SystemManage.UserListItem[]>(() => query, {
    showErrorMessage: true,
    breakReturn: true,
    errorMessage: '用户列表加载失败，请重试'
  })
  const rows = response.data ?? []
  const userIds = rows.map((row) => row.id).filter((id): id is string => Boolean(id))
  if (!userIds.length) return response

  // 员工档案含敏感字段，不能通过 PostgREST 关系查询放大 sys_user 的读取权限。
  // 独立的安全函数仅返回用户页所需引用；引用加载失败时仍保留用户主列表。
  const employeeResponse = await responseHandle<UserEmployeeReferencePayload>(
    () =>
      supabase.rpc('system_list_user_employee_references_secure', {
        p_user_ids: userIds
      }),
    {}
  )
  const employeeByUserId = new Map(
    (employeeResponse.data?.records ?? []).map((employee) => [employee.userId, employee])
  )
  response.data = rows.map((row) => {
    const employee = row.id ? employeeByUserId.get(row.id) : undefined
    if (!employee) return row
    return {
      ...row,
      hrEmployee: employee
    }
  })
  return response
}

export async function fetchOrganizationList(
  params: Api.SystemManage.OrganizationSearchParams = {}
) {
  const { keyword, tenantId, organizationType, status, recordId } = params
  const scopedTenantId = resolveTenantScopeId(tenantId)
  const response = await responseHandle<Api.SystemManage.OrganizationListItem[]>(
    () =>
      supabase.rpc('get_organization_list_secure', {
        p_keyword: keyword?.trim() || undefined,
        p_tenant_id: scopedTenantId,
        p_organization_type: organizationType || undefined,
        p_status: status || undefined,
        p_record_id: recordId || undefined
      }),
    {
      showErrorMessage: true
    }
  )

  return {
    ...response,
    total: response.data?.length ?? 0
  }
}

export async function fetchOrganizationDetail(id: string) {
  return await responseHandle<Api.SystemManage.OrganizationListItem | null>(
    () =>
      supabase
        .from('mdm_organization')
        .select(ORGANIZATION_DETAIL_SELECT)
        .eq('id', id)
        .maybeSingle(),
    {
      showErrorMessage: true
    }
  )
}

export async function fetchOrganizationTree(
  params: Api.SystemManage.OrganizationSearchParams = {}
) {
  const response = await fetchOrganizationList(params)
  const records = response.data ?? []
  return {
    ...response,
    data: organizationTreeUtils.listToTree(records, (a, b) => {
      const sortDiff = (a.sort ?? 0) - (b.sort ?? 0)
      return sortDiff || a.organizationName.localeCompare(b.organizationName, 'zh-CN')
    })
  }
}

/** Organization selectors need hierarchy and identity, not the management page's aggregate counts. */
export async function fetchOrganizationOptionsTree(
  params: Pick<Api.SystemManage.OrganizationSearchParams, 'tenantId' | 'status'> = {},
  options: ApiFeedbackOptions = {}
) {
  const scopedTenantId = resolveTenantScopeId(params.tenantId)
  let query = supabase
    .from('mdm_organization')
    .select(
      `id,tenant_id,parent_id,organization_code,organization_name,organization_type,status,sort,is_system,
       tenant:sys_tenant!sys_organization_tenant_id_fkey(tenant_code,tenant_name)`
    )
    .order('sort')
    .order('organization_name')
  if (scopedTenantId) query = query.eq('tenant_id', scopedTenantId)
  if (params.status) query = query.eq('status', params.status)

  const response = await responseHandle<Api.SystemManage.OrganizationListItem[]>(() => query, {
    showErrorMessage: options.showErrorMessage ?? true
  })
  return {
    ...response,
    data: organizationTreeUtils.listToTree(response.data ?? [], (a, b) => {
      const sortDiff = (a.sort ?? 0) - (b.sort ?? 0)
      return sortDiff || a.organizationName.localeCompare(b.organizationName, 'zh-CN')
    })
  }
}

export async function fetchEnabledOrganizationTree(
  params: {
    tenantId?: string
    excludeId?: string
  } = {}
) {
  if (!params?.tenantId) {
    return { data: [], error: null }
  }

  const response = await fetchOrganizationOptionsTree({
    tenantId: params.tenantId,
    status: '1'
  })
  const data = params.excludeId
    ? organizationTreeUtils.removeNodesByCondition(
        response.data ?? [],
        (node) => node.id === params.excludeId
      ).tree
    : response.data

  return { ...response, data }
}

/** Flat enabled organizations for business forms that select a stock owner. */
export async function fetchEnabledOrganizationOptionsList(tenantId?: string) {
  const response = await fetchOrganizationOptionsTree({ tenantId, status: '1' })
  return {
    ...response,
    data: organizationTreeUtils.treeToList(response.data ?? [])
  }
}

export async function fetchUserOrganizationTree(params: { tenantId?: string } = {}) {
  let query = supabase
    .from('mdm_organization')
    .select(
      `
        id, tenant_id, parent_id, organization_code, organization_name,
        organization_type, status, sort, is_system,
        tenant:sys_tenant!sys_organization_tenant_id_fkey(tenant_code, tenant_name),
        members:sys_user!sys_user_organization_id_fkey(id, status)
      `
    )
    .eq('status', '1')
    .is('members.deleted_at', null)
    .order('sort', { ascending: true })
    .order('organization_name', { ascending: true })

  if (params.tenantId) query = query.eq('tenant_id', params.tenantId)

  const response = await responseHandle<
    Array<Api.SystemManage.OrganizationScopeFilterItem & { members?: Array<{ id: string }> }>
  >(() => query, {
    showErrorMessage: true
  })

  return {
    ...response,
    data: organizationTreeUtils.listToTree(
      (response.data ?? []).map(({ members, ...organization }) => ({
        ...organization,
        scopeCount: members?.length ?? 0
      })),
      (a, b) => {
        const tenantDiff = (a.tenant?.tenantName ?? '').localeCompare(
          b.tenant?.tenantName ?? '',
          'zh-CN'
        )
        const sortDiff = (a.sort ?? 0) - (b.sort ?? 0)
        return (
          tenantDiff || sortDiff || a.organizationName.localeCompare(b.organizationName, 'zh-CN')
        )
      }
    )
  }
}

export async function fetchRoleOrganizationTree(params: { tenantId?: string } = {}) {
  let query = supabase
    .from('mdm_organization')
    .select(
      `
        id, tenant_id, parent_id, organization_code, organization_name,
        organization_type, status, sort, is_system,
        tenant:sys_tenant!sys_organization_tenant_id_fkey(tenant_code, tenant_name),
        roles:sys_role!sys_role_organization_id_fkey(id, enabled)
      `
    )
    .eq('status', '1')
    .order('sort', { ascending: true })
    .order('organization_name', { ascending: true })

  if (params.tenantId) query = query.eq('tenant_id', params.tenantId)

  const response = await responseHandle<
    Array<Api.SystemManage.OrganizationScopeFilterItem & { roles?: Array<{ id: string }> }>
  >(() => query, {
    showErrorMessage: true
  })

  return {
    ...response,
    data: organizationTreeUtils.listToTree(
      (response.data ?? []).map(({ roles, ...organization }) => ({
        ...organization,
        scopeCount: roles?.length ?? 0
      })),
      (a, b) => {
        const tenantDiff = (a.tenant?.tenantName ?? '').localeCompare(
          b.tenant?.tenantName ?? '',
          'zh-CN'
        )
        const sortDiff = (a.sort ?? 0) - (b.sort ?? 0)
        return (
          tenantDiff || sortDiff || a.organizationName.localeCompare(b.organizationName, 'zh-CN')
        )
      }
    )
  }
}

export async function fetchEnabledOrganizationUserList(params: { tenantId?: string } = {}) {
  if (!params?.tenantId) {
    return { data: [], error: null }
  }

  const query = supabase
    .from('sys_user')
    .select(
      `
        id,
        tenant_id,
        organization_id,
        avatar,
        user_name,
        nick_name,
        user_email,
        status,
        organization:mdm_organization!sys_user_organization_id_fkey(
          id,
          organization_code,
          organization_name
        )
      `
    )
    .eq('tenant_id', params.tenantId)
    .eq('status', '1')
    .is('deleted_at', null)
    .order('nick_name', { ascending: true })

  return await responseHandle<Api.SystemManage.OrganizationMember[]>(() => query, {
    showErrorMessage: true
  })
}

export async function addOrganization(params: Api.SystemManage.OrganizationSavePayload) {
  return await responseHandle(
    () => supabase.from('mdm_organization').insert(keysToSnakeDeep(params)),
    {
      showMessage: true,
      breakReturn: true
    }
  )
}

export async function editOrganization(params: Api.SystemManage.OrganizationSavePayload) {
  const { id, ...payload } = params
  return await responseHandle(
    () =>
      supabase
        .from('mdm_organization')
        .update(keysToSnakeDeep(payload), { count: 'exact' })
        .eq('id', id),
    {
      showMessage: true,
      breakReturn: true,
      requireAffected: true,
      noAffectedMessage: WRITE_PERMISSION_DENIED_MESSAGE
    }
  )
}

export async function deleteOrganization(id: string) {
  return await responseHandle(
    () =>
      supabase
        .from('mdm_organization')
        .delete({ count: 'exact' })
        .eq('id', id)
        .eq('is_system', false),
    {
      showMessage: true,
      requireAffected: true,
      noAffectedMessage: '系统预置根组织不可删除，或当前账号没有删除权限'
    }
  )
}

const parseGeofenceConfig = (row: SystemParamItem | null): GeofenceConfigItem | null => {
  if (!row?.paramValue) return null

  try {
    const parsed = JSON.parse(row.paramValue) as Partial<GeofenceConfigItem>
    return {
      id: row.id,
      tenantId: row.tenantId,
      enabled: parsed.enabled !== false,
      loadingRadiusM: Number(parsed.loadingRadiusM) || 1000,
      unloadingRadiusM: Number(parsed.unloadingRadiusM) || 1000,
      loadingAllowOutsideCheckIn: parsed.loadingAllowOutsideCheckIn === true,
      unloadingAllowOutsideCheckIn: parsed.unloadingAllowOutsideCheckIn === true,
      autoConfirmLoading: parsed.autoConfirmLoading === true,
      autoConfirmUnloading: parsed.autoConfirmUnloading === true,
      createBy: row.createBy,
      createTime: row.createTime,
      updateBy: row.updateBy,
      updateTime: row.updateTime
    }
  } catch {
    return null
  }
}

export async function fetchGeofenceConfig(): Promise<{
  data: GeofenceConfigItem | null
  error: unknown | null
}> {
  const { data, error } = await responseHandle<SystemParamItem | null>(
    () =>
      supabase
        .from('sys_param')
        .select('*')
        .eq('param_key', GEOFENCE_CONFIG_PARAM_KEY)
        .eq('enabled', true)
        .abortSignal(AbortSignal.timeout(GEOFENCE_CONFIG_REQUEST_TIMEOUT_MS))
        .maybeSingle(),
    { showErrorMessage: false }
  )
  return { data: parseGeofenceConfig(data), error }
}

export async function saveGeofenceConfig(params: GeofenceConfigItem) {
  const config = omit(params, [
    'id',
    'tenantId',
    'createBy',
    'createTime',
    'updateBy',
    'updateTime'
  ])
  return await responseHandle<GeofenceConfigItem>(
    () => supabase.rpc('tms_save_geofence_config', { p_config: config }),
    { showMessage: true, breakReturn: true }
  )
}

export async function resetUser(params: Api.SystemManage.UserListItem) {
  const { userEmail, password } = params
  const invokeResp = () =>
    supabase.functions.invoke('admin_reset_password', {
      body: {
        email: userEmail,
        password
      }
    })
  await responseHandle(invokeResp, {
    showMessage: true,
    message: '密码初始化成功，重新登录后生效'
  })
}

/*注销用户：保留业务资料，只撤销登录与角色授权。*/
export async function deactivateUser(
  params: Api.SystemManage.UserListItem,
  options: { showMessage?: boolean } = {}
) {
  const { id, authUserId } = params
  if (!id) {
    throw new Error('未找到需要注销的用户')
  }
  const payload: DeleteUserSyncPayload = { action: 'deactivate', id: id }
  if (authUserId) {
    payload.auth_user_id = authUserId
  }
  const invokeResp = () =>
    supabase.functions.invoke('sync-user', {
      body: payload
    })
  await responseHandle(invokeResp, {
    showMessage: options.showMessage ?? true,
    breakReturn: true
  })
}

/*新增用户*/
export async function addUser(params: Api.SystemManage.UserListItem) {
  const { userEmail, password } = params
  const payload = {
    action: 'create',
    email: userEmail,
    password,
    appUserData: params
  }
  const invokeResp = () =>
    supabase.functions.invoke('sync-user', {
      body: JSON.stringify(keysToSnakeDeep(payload))
    })
  await responseHandle(invokeResp, {
    showMessage: true,
    breakReturn: true
  })
}

/*编辑用户*/
export async function editUser(params: Api.SystemManage.UserListItem) {
  const { id, authUserId } = params
  //更新不更新 auth.users表
  const payload = {
    action: 'update',
    id,
    authUserId,
    appUserData: params
  }
  const invokeResp = () =>
    supabase.functions.invoke('sync-user', {
      body: JSON.stringify(keysToSnakeDeep(payload))
    })
  await responseHandle(invokeResp, {
    showMessage: true,
    breakReturn: true
  })
}

/** 员工建档完成后，将既有登录账号与员工档案建立一对一关联。 */
export async function linkUserToEmployee(params: {
  userId: string
  employeeId: string
  tenantId: string
}) {
  const invokeResp = () =>
    supabase.functions.invoke('sync-user', {
      body: JSON.stringify(
        keysToSnakeDeep({
          action: 'update',
          id: params.userId,
          appUserData: {
            tenantId: params.tenantId,
            accountIdentityType: 'employee',
            hrEmployeeId: params.employeeId
          }
        })
      )
    })
  await responseHandle(invokeResp, {
    showMessage: false,
    breakReturn: true
  })
}

/*分配用户角色*/
export async function assignUserRoles(params: {
  id: string
  tenantId: string
  userRoles: string[]
}) {
  const { id, tenantId, userRoles } = params
  const payload = {
    action: 'assign_roles',
    id,
    appUserData: { tenantId, userRoles }
  }
  const invokeResp = () =>
    supabase.functions.invoke('sync-user', {
      body: JSON.stringify(keysToSnakeDeep(payload))
    })
  await responseHandle(invokeResp, {
    showMessage: true,
    breakReturn: true
  })
}

// 获取所有用户可分配的角色
export async function fetchEnabledRoleList(params: { tenantId?: string } = {}) {
  const { tenantId } = params

  if (!tenantId) {
    return { data: [], error: null }
  }

  const query = supabase
    .from('sys_role')
    .select('id, role_name, role_code, enabled, tenant_id, builtin_type')
    .eq('tenant_id', tenantId)
    .eq('enabled', true)
    .order('role_code', { ascending: true })

  return await responseHandle(() => query, {})
}

// 获取角色列表
export async function fetchRoleList(params: Api.SystemManage.RoleSearchParams) {
  const {
    tenantId,
    organizationId,
    organizationIds,
    organizationUnassigned,
    roleName,
    roleCode,
    description,
    enabled,
    startTime = '',
    endTime = '',
    recordId,
    from = 0,
    to = 9
  } = params
  const specs = [
    { col: 'id', op: 'eq', val: recordId },
    { col: 'role_name', op: 'ilike', val: roleName ? `%${roleName}%` : undefined },
    { col: 'role_code', op: 'eq', val: roleCode },
    { col: 'description', op: 'ilike', val: description ? `%${description}%` : undefined },
    { col: 'enabled', op: 'eq', val: enabled },
    { col: 'tenant_id', op: 'eq', val: tenantId },
    {
      col: 'organization_id',
      op: 'eq',
      val: organizationUnassigned ? undefined : organizationId
    },
    { col: 'create_time', op: 'gte', val: toStartOfDayUTC(startTime) },
    { col: 'create_time', op: 'lte', val: toNextDayStartUTC(endTime) }
  ]

  // 构建查询
  let query = supabase
    .from('sys_role')
    .select(
      `
        *,
        tenant:sys_tenant!sys_role_tenant_id_fkey(tenant_code, tenant_name, builtin_type),
        organization:mdm_organization!sys_role_organization_id_fkey(
          id, organization_code, organization_name
        )
      `,
      { count: 'exact' }
    )
    .order('create_time', { ascending: false }) // 按创建时间倒序
    .range(from, to)

  // applyFilters 支持传入 FilterSpec[]（这里 specs 已为 snake_case）
  query = applyFilters(query, specs, { skipEmpty: true, camelToSnake: false })

  if (organizationUnassigned) {
    query = query.is('organization_id', null)
  } else if (organizationIds?.length) {
    query = query.in('organization_id', organizationIds)
  }

  return await responseHandle(() => query, {})
}

/*删除角色*/
export async function deleteRole(params: Api.SystemManage.RoleListItem) {
  const { id } = params
  return await responseHandle(
    () =>
      supabase.from('sys_role').delete({ count: 'exact' }).eq('id', id).is('builtin_type', null),
    {
      showMessage: true,
      breakReturn: true,
      requireAffected: true,
      noAffectedMessage: '系统预置角色不可删除，或当前账号没有删除权限'
    }
  )
}

/*新增角色*/
export async function addRole(params: Api.SystemManage.RoleListItem) {
  return await responseHandle(() => supabase.from('sys_role').insert(keysToSnakeDeep(params)), {
    showMessage: true,
    breakReturn: true
  })
}

/*编辑角色*/
export async function editRole(params: Api.SystemManage.RoleListItem) {
  const { id, ...payload } = params
  return await responseHandle(
    () => supabase.from('sys_role').update(keysToSnakeDeep(payload)).eq('id', id),
    {
      showMessage: true,
      breakReturn: true
    }
  )
}

/*获取当前角色拥有的菜单*/
export async function getCurrentRoleMenus(params: { id: string }) {
  const { id } = params
  return await fetchAllRangePages<{ menuId: string }>(
    ({ from, to }) =>
      responseHandle<Array<{ menuId: string }>>(
        () =>
          supabase
            .from('sys_role_menu')
            .select('menu_id')
            .eq('role_id', id)
            .order('menu_id', { ascending: true })
            .range(from, to),
        {}
      ),
    { pageSize: 500 }
  )
}

// 获取完整菜单目录，供角色授权与业务配置选择使用。
export async function fetchMenuCatalog() {
  return await fetchAllRangePages<AppRouteRecord>(
    ({ from, to }) =>
      responseHandle<AppRouteRecord[]>(
        () =>
          supabase
            .from('sys_menu')
            .select('*')
            .order('sort', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to),
        {}
      ),
    { pageSize: 500 }
  )
}

// 保存角色权限
export async function saveRoleMenuList(params: { p_role_id: string; p_menu_ids: string[] }) {
  return await responseHandle(() => supabase.rpc('set_role_menus', params), {
    showMessage: true,
    breakReturn: true
  })
}

export interface MenuListParams {
  name?: string
  path?: string
  recordId?: string
}

interface MenuRowsQueryOptions {
  parentId?: string
  rootOnly?: boolean
  includeChildState?: boolean
}

async function fetchMenuRows(
  params: MenuListParams,
  options: MenuRowsQueryOptions = {},
  signal?: AbortSignal
) {
  const { name, path, recordId } = params
  const query = supabase.rpc('list_menu_management_nodes', {
    p_name: normalizeNullableText(name),
    p_path: normalizeNullableText(path),
    p_record_id: recordId || null,
    p_parent_id: options.parentId || null,
    p_root_only: Boolean(options.rootOnly),
    p_include_child_state: Boolean(options.includeChildState)
  })

  return await responseHandle<AppRouteRecord[]>(
    () => (signal ? query.abortSignal(signal) : query),
    {}
  )
}

// 菜单管理默认只加载一级节点；搜索和定向定位保留全局查询能力。
export async function fetchMenuList(params: MenuListParams, signal?: AbortSignal) {
  const hasGlobalFilter = Boolean(params.name?.trim() || params.path?.trim() || params.recordId)
  return await fetchMenuRows(
    params,
    {
      rootOnly: !hasGlobalFilter,
      includeChildState: true
    },
    signal
  )
}

// 展开树节点时只查询直属子节点。
export async function fetchMenuChildren(parentId: string) {
  return await fetchMenuRows(
    {},
    {
      parentId,
      includeChildState: true
    }
  )
}

// 排序、编辑和级联删除等低频操作仍需要完整树，按需加载而不是随页面初始化加载。
export async function fetchAllMenuList() {
  return await fetchMenuRows({})
}

/*删除菜单*/
export async function deleteMenu(params: { ids: string[] }) {
  const { ids } = params
  if (!ids.length) throw new Error('未找到需要删除的菜单')

  return await deleteMenuRows(ids)
}

async function deleteMenuRows(ids: string[]) {
  return await responseHandle(
    () => supabase.from('sys_menu').delete({ count: 'exact' }).in('id', ids),
    {
      breakReturn: true,
      requireAffected: true,
      noAffectedMessage: WRITE_PERMISSION_DENIED_MESSAGE
    }
  )
}

/*新增菜单*/
export async function addMenu(params: AppRouteRecord) {
  return await responseHandle(() => supabase.from('sys_menu').insert(keysToSnakeDeep(params)), {
    showMessage: true
  })
}

/*编辑菜单*/
export async function editMenu(params: AppRouteRecord) {
  const { id } = params
  return await responseHandle(
    () =>
      supabase.from('sys_menu').update(keysToSnakeDeep(params), { count: 'exact' }).eq('id', id),
    {
      showMessage: true,
      breakReturn: true,
      requireAffected: true,
      noAffectedMessage: WRITE_PERMISSION_DENIED_MESSAGE
    }
  )
}

export async function saveMenuSort(params: Array<{ id: string; sort: number }>) {
  const results = await mapWithConcurrency(params, 3, async ({ id, ...data }) =>
    supabase.from('sys_menu').update(keysToSnakeDeep(data), { count: 'exact' }).eq('id', id)
  )

  const error = results.find((result) => result.error)?.error
  if (error) throw error

  if (results.some((result) => result.count === 0)) {
    throw new Error(WRITE_PERMISSION_DENIED_MESSAGE)
  }

  return { data: null, error: null }
}

/*原子保存完整菜单树的父级关系和同级顺序*/
export async function saveMenuTreeOrder(
  updates: Array<{ id: string; parentId: string | null; sort: number }>
) {
  return await responseHandle(
    () =>
      supabase.rpc('save_menu_tree_order', {
        p_updates: updates
      }),
    {
      breakReturn: true,
      showMessage: false
    }
  )
}

export * from './system-manage/application-access'
export * from './system-manage/system-param'
export * from './system-manage/tenant'
export * from './system-manage/website-config'
