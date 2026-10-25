import { useSupabase } from '@/hooks/core/useSupabase'
import { WRITE_PERMISSION_DENIED_MESSAGE } from '@/hooks/core/useSupabase'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { getDocumentNumberPeriodKey, renderDocumentNumber } from '@/utils/document-number'
import { applyFilters } from '@/utils/supabase'
import { buildOrIlikeFilter } from '@/utils/supabase/search'
import {
  areTenantCreateTargetsInScope,
  resolveTenantReadTargetId
} from '@/utils/tenant-scope-access-policy'

const { supabase, keysToSnakeDeep, responseHandle } = useSupabase()

type NumberRule = Api.SystemManage.DocumentNumberRuleItem
type SearchParams = Api.SystemManage.DocumentNumberRuleSearchParams
type UpdatePayload = Api.SystemManage.DocumentNumberRuleUpdatePayload
type CreatePayload = Api.SystemManage.DocumentNumberRuleCreatePayload
type NumberScene = Api.SystemManage.DocumentNumberSceneItem

const resolveRuleReadTenantId = (requestedTenantId?: string): string | null | undefined => {
  const tenantScopeStore = useTenantScopeStore()
  return resolveTenantReadTargetId({
    effectiveTenantId: tenantScopeStore.effectiveTenantId,
    requestedTenantId,
    isPlatformSuper: tenantScopeStore.isPlatformScope
  })
}

const emptyRuleStats = (): Api.SystemManage.DocumentNumberRuleStats => ({
  total: 0,
  automatic: 0,
  manual: 0,
  tenantCount: 0,
  categoryCounts: { business_document: 0, master_data: 0, vehicle: 0 }
})

const ruleSelect = `
  *,
  tenant:sys_tenant!sys_document_number_rule_tenant_id_fkey(tenant_code, tenant_name),
  scene:sys_document_number_scene!sys_document_number_rule_scene_key_fkey(
    rule_key, rule_name, field_label, category, menu_id, target_table, target_column,
    default_template, default_reset_cycle, manual_required, enabled, remark,
    menu:sys_menu!sys_document_number_scene_menu_id_fkey(id, name, path, component, parent_id, meta)
  ),
  counters:sys_document_number_counter(id, rule_id, tenant_id, rule_version, period_key, current_value, update_time)
`

const enhanceRule = (rule: NumberRule): NumberRule => {
  const currentPeriodKey = getDocumentNumberPeriodKey(rule.resetCycle, rule.timezone)
  const currentCounter = (rule.counters ?? []).find(
    (counter) => counter.ruleVersion === rule.ruleVersion && counter.periodKey === currentPeriodKey
  )
  const nextValue = currentCounter ? currentCounter.currentValue + 1 : rule.sequenceStart

  return {
    ...rule,
    currentValue: currentCounter?.currentValue ?? null,
    currentPeriodKey,
    nextValue,
    preview: renderDocumentNumber(rule.template, nextValue, rule.timezone)
  }
}

export async function fetchDocumentNumberRuleList(params: SearchParams = {}) {
  const { keyword = '', tenantId, category, autoEnabled, ruleKeys, from = 0, to = 19 } = params
  const readTenantId = resolveRuleReadTenantId(tenantId)
  if (readTenantId === undefined) return { data: [] as NumberRule[], total: 0, error: null }

  let query = supabase
    .from('sys_document_number_rule')
    .select(ruleSelect, { count: 'exact' })
    .order('category', { ascending: true })
    .order('rule_name', { ascending: true })
    .range(from, to)

  query = applyFilters(
    query,
    [
      { col: 'tenant_id', op: 'eq', val: readTenantId },
      { col: 'category', op: 'eq', val: category },
      { col: 'auto_enabled', op: 'eq', val: autoEnabled }
    ],
    { skipEmpty: true, camelToSnake: false }
  )

  const normalizedKeyword = keyword.trim()
  if (normalizedKeyword) {
    query = query.or(
      buildOrIlikeFilter(['rule_name', 'rule_key', 'target_table'], normalizedKeyword)
    )
  }

  if (ruleKeys?.length) {
    query = query.in('rule_key', ruleKeys)
  }

  const result = await responseHandle<NumberRule[]>(() => query, {
    showErrorMessage: true
  })
  return { ...result, data: (result.data ?? []).map(enhanceRule) }
}

export async function fetchDocumentNumberRulesByKeys(ruleKeys: string[], tenantId?: string) {
  if (!ruleKeys.length) return { data: [] as NumberRule[], error: null }
  const readTenantId = resolveRuleReadTenantId(tenantId)
  if (!readTenantId) return { data: [] as NumberRule[], error: null }

  const query = supabase
    .from('sys_document_number_rule')
    .select(ruleSelect)
    .in('rule_key', ruleKeys)
    .eq('enabled', true)
    .eq('tenant_id', readTenantId)
  const result = await responseHandle<NumberRule[]>(() => query, {
    showErrorMessage: false
  })
  return { ...result, data: (result.data ?? []).map(enhanceRule) }
}

export async function fetchDocumentNumberRuleStats(tenantId?: string): Promise<{
  data: Api.SystemManage.DocumentNumberRuleStats
  error: unknown | null
}> {
  const readTenantId = resolveRuleReadTenantId(tenantId)
  if (readTenantId === undefined) return { data: emptyRuleStats(), error: null }

  let query = supabase
    .from('sys_document_number_rule')
    .select('id, tenant_id, category, auto_enabled, update_time')
  if (readTenantId) query = query.eq('tenant_id', readTenantId)

  const { data, error } = await responseHandle<NumberRule[]>(() => query, {
    showErrorMessage: true
  })
  const rows = data ?? []
  const stats = emptyRuleStats()
  rows.forEach((row) => {
    stats.categoryCounts[row.category] += 1
  })

  return {
    data: {
      ...stats,
      total: rows.length,
      automatic: rows.filter((row) => row.autoEnabled).length,
      manual: rows.filter((row) => !row.autoEnabled).length,
      tenantCount: new Set(rows.map((row) => row.tenantId)).size,
      lastUpdateTime: rows
        .map((row) => row.updateTime ?? '')
        .sort()
        .at(-1)
    },
    error
  }
}

export async function editDocumentNumberRule(payload: UpdatePayload) {
  const { id, ...changes } = payload
  return await responseHandle(
    () =>
      supabase
        .from('sys_document_number_rule')
        .update(keysToSnakeDeep(changes), { count: 'exact' })
        .eq('id', id),
    {
      showMessage: true,
      breakReturn: true,
      requireAffected: true,
      noAffectedMessage: WRITE_PERMISSION_DENIED_MESSAGE
    }
  )
}

export async function fetchDocumentNumberSceneList() {
  return await responseHandle<NumberScene[]>(
    () =>
      supabase
        .from('sys_document_number_scene')
        .select(
          `
            *,
            menu:sys_menu!sys_document_number_scene_menu_id_fkey(
              id, name, path, component, parent_id, meta
            )
          `
        )
        .eq('enabled', true)
        .order('category', { ascending: true })
        .order('rule_name', { ascending: true }),
    { showErrorMessage: true }
  )
}

export async function addDocumentNumberRules(payload: CreatePayload) {
  const tenantScopeStore = useTenantScopeStore()
  if (
    !areTenantCreateTargetsInScope({
      effectiveTenantId: tenantScopeStore.effectiveTenantId,
      isAllTenants: tenantScopeStore.isAllTenants,
      isPlatformSuper: tenantScopeStore.isPlatformScope,
      tenantIds: payload.tenantIds
    })
  ) {
    throw new Error('当前范围只能配置所属租户的编号规则')
  }

  return await responseHandle<Api.SystemManage.DocumentNumberRuleBatchResult>(
    () =>
      supabase.rpc('configure_document_number_rule_for_tenants', {
        p_rule_key: payload.scene.ruleKey,
        p_tenant_ids: payload.tenantIds,
        p_auto_enabled: payload.autoEnabled,
        p_template: payload.template,
        p_reset_cycle: payload.resetCycle,
        p_sequence_start: payload.sequenceStart,
        p_timezone: payload.timezone,
        p_remark: payload.remark || null
      }),
    { showErrorMessage: true }
  )
}
