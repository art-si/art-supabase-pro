import { useSupabase } from '@/hooks/core/useSupabase'
import { WRITE_PERMISSION_DENIED_MESSAGE } from '@/hooks/core/useSupabase'
import { buildOrIlikeFilter } from '@/utils/supabase/search'
import { applyFilters } from '@/utils/supabase'

type SystemParamItem = Api.SystemManage.SystemParamItem
type SystemParamSearchParams = Api.SystemManage.SystemParamSearchParams

const { supabase, keysToSnakeDeep, responseHandle } = useSupabase()

/** Public login policy is resolved from the platform tenant, independent of the header scope. */
export async function fetchLoginDefaultLanguage() {
  return await responseHandle<unknown>(() => supabase.rpc('get_login_default_language'), {
    showErrorMessage: false
  })
}

export async function fetchSystemParamList(params: SystemParamSearchParams) {
  const { keyword = '', groupCode, paramType, enabled, builtin, from = 0, to = 9 } = params
  const specs = [
    { col: 'group_code', op: 'eq', val: groupCode },
    { col: 'param_type', op: 'eq', val: paramType },
    { col: 'enabled', op: 'eq', val: enabled },
    { col: 'builtin', op: 'eq', val: builtin }
  ]

  let query = supabase
    .from('sys_param')
    .select('*', { count: 'exact' })
    .order('sort', { ascending: true })
    .order('create_time', { ascending: false })
    .range(from, to)

  const trimmedKeyword = keyword.trim()
  if (trimmedKeyword) {
    query = query.or(buildOrIlikeFilter(['param_name', 'param_key', 'remark'], trimmedKeyword))
  }

  query = applyFilters(query, specs, { skipEmpty: true, camelToSnake: false })
  return await responseHandle(() => query, {
    showErrorMessage: true
  })
}

export async function fetchSystemParamStats(): Promise<{
  data: Api.SystemManage.SystemParamStats
  error: unknown | null
}> {
  const query = supabase.from('sys_param').select('id, enabled, builtin, group_code, update_time')
  const { data, error } = await responseHandle<SystemParamItem[]>(() => query, {
    showErrorMessage: true
  })

  const rows = data ?? []
  const latestUpdateTime = rows
    .map((row) => row.updateTime || '')
    .filter(Boolean)
    .sort()
    .at(-1)
  const groupCounts = rows.reduce<Record<string, number>>((counts, row) => {
    if (row.groupCode) {
      counts[row.groupCode] = (counts[row.groupCode] ?? 0) + 1
    }
    return counts
  }, {})

  return {
    data: {
      total: rows.length,
      enabled: rows.filter((row) => row.enabled).length,
      builtin: rows.filter((row) => row.builtin).length,
      groups: Object.keys(groupCounts).length,
      groupCounts,
      lastRefreshTime: latestUpdateTime
    },
    error
  }
}

export async function fetchSystemParamByKey(paramKey: string): Promise<{
  data: SystemParamItem | null
  error: unknown | null
}> {
  return await responseHandle<SystemParamItem | null>(
    () =>
      supabase
        .from('sys_param')
        .select('*')
        .eq('param_key', paramKey)
        .eq('enabled', true)
        .maybeSingle(),
    {
      showErrorMessage: false
    }
  )
}

export async function fetchRegistrationRoleOptions() {
  return await responseHandle<Api.SystemManage.RegistrationRoleOption[]>(
    () => supabase.rpc('get_registration_role_options'),
    {
      showErrorMessage: true
    }
  )
}

export async function addSystemParam(params: SystemParamItem) {
  return await responseHandle(() => supabase.from('sys_param').insert(keysToSnakeDeep(params)), {
    showMessage: true,
    breakReturn: true
  })
}

export async function editSystemParam(params: SystemParamItem) {
  const { id, ...payload } = params
  return await responseHandle(
    () =>
      supabase.from('sys_param').update(keysToSnakeDeep(payload), { count: 'exact' }).eq('id', id),
    {
      showMessage: true,
      breakReturn: true,
      requireAffected: true,
      noAffectedMessage: WRITE_PERMISSION_DENIED_MESSAGE
    }
  )
}

export async function deleteSystemParam(id: string) {
  return await responseHandle(
    () => supabase.from('sys_param').delete({ count: 'exact' }).eq('id', id).eq('builtin', false),
    {
      showMessage: true,
      requireAffected: true,
      noAffectedMessage: '内置参数不允许删除，或当前账号没有删除权限'
    }
  )
}

export async function deleteSystemParamBatch(ids: string[]) {
  return await responseHandle(
    () => supabase.from('sys_param').delete({ count: 'exact' }).in('id', ids).eq('builtin', false),
    {
      showMessage: true,
      requireAffected: true,
      noAffectedMessage: '未删除任何数据，请确认未选择内置参数且当前账号有删除权限'
    }
  )
}
