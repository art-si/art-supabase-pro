import { buildOrIlikeFilter } from '@/utils/supabase/search'
import { buildSupabasePageRange } from '@/utils/supabase/pagination'
import { createTenantScopeReadGuard } from '@/utils/tenant-scope-context'
import { useSupabase } from '@/hooks/core/useSupabase'
import { omit } from 'lodash-es'

const { supabase, keysToSnakeDeep, responseHandle } = useSupabase()

export type AiPromptStatus = 'draft' | 'published' | 'archived'

export interface AiPromptTemplate {
  id: string
  tenantId: string
  feature: string
  version: string
  name: string
  description?: string | null
  systemPrompt: string
  status: AiPromptStatus
  changeNote?: string | null
  publishedAt?: string | null
  publishedBy?: string | null
  metadata: Record<string, unknown>
  createBy?: string | null
  createTime: string
  updateBy?: string | null
  updateTime: string
}

export interface AiPromptSearchParams {
  current: number
  size: number
  tenantId?: string
  feature?: string
  status?: AiPromptStatus | ''
  keyword?: string
}

export interface AiPromptWritePayload {
  id?: string
  feature: string
  version: string
  name: string
  description?: string | null
  systemPrompt: string
  changeNote?: string | null
  status: 'draft'
  metadata?: Record<string, unknown>
}

export interface AiPromptOverview {
  total: number
  published: number
  drafts: number
  archived: number
}

export async function fetchAiPromptOverview(tenantId?: string): Promise<AiPromptOverview> {
  const assertTenantScope = createTenantScopeReadGuard()
  async function fetchCount(status?: AiPromptStatus): Promise<number> {
    let query = supabase.from('ai_prompt_template').select('id', { count: 'exact', head: true })
    if (tenantId) query = query.eq('tenant_id', tenantId)
    if (status) query = query.eq('status', status)
    const { data } = await responseHandle<number>(
      () => query.then((result) => ({ ...result, data: result.count })),
      { breakReturn: true, showErrorMessage: false, errorMessage: '版本概览加载失败，请重新加载' }
    )
    if (typeof data !== 'number' || !Number.isSafeInteger(data) || data < 0) {
      throw new Error('版本统计未完整返回，请重新加载')
    }
    return data
  }
  assertTenantScope()
  const [total, published, drafts, archived] = await Promise.all([
    fetchCount(),
    fetchCount('published'),
    fetchCount('draft'),
    fetchCount('archived')
  ])
  assertTenantScope()
  if (published + drafts + archived !== total) {
    throw new Error('版本统计已变化，请重新加载')
  }
  return { total, published, drafts, archived }
}

export async function fetchAiPromptList(params: AiPromptSearchParams) {
  const { from, to } = buildSupabasePageRange(params)

  let query = supabase
    .from('ai_prompt_template')
    .select('*', { count: 'exact' })
    .order('feature', { ascending: true })
    .order('update_time', { ascending: false })
    .order('id')
    .range(from, to)

  if (params.tenantId) query = query.eq('tenant_id', params.tenantId)
  if (params.feature) query = query.eq('feature', params.feature)
  if (params.status) query = query.eq('status', params.status)
  if (params.keyword?.trim()) {
    const keyword = params.keyword.trim()
    query = query.or(buildOrIlikeFilter(['name', 'version', 'description'], keyword))
  }

  return await responseHandle<AiPromptTemplate[]>(() => query, {
    showErrorMessage: true
  })
}

export async function createAiPromptDraft(params: AiPromptWritePayload): Promise<void> {
  const writeData = omit(params, ['id'])
  await responseHandle(
    () => supabase.from('ai_prompt_template').insert(keysToSnakeDeep(writeData)),
    { breakReturn: true, showMessage: true }
  )
}

export async function updateAiPromptDraft(params: AiPromptWritePayload): Promise<void> {
  const { id, ...writeData } = params
  if (!id) throw new Error('Prompt 草稿 ID 不能为空')
  await responseHandle(
    () =>
      supabase
        .from('ai_prompt_template')
        .update(keysToSnakeDeep(writeData))
        .eq('id', id)
        .eq('status', 'draft'),
    { breakReturn: true, showMessage: true }
  )
}

export async function publishAiPrompt(id: string): Promise<AiPromptTemplate | null> {
  const { data } = await responseHandle<AiPromptTemplate>(
    () => supabase.rpc('publish_ai_prompt_template', { p_prompt_id: id }),
    { breakReturn: true, showErrorMessage: true }
  )
  return data ?? null
}

export async function deleteAiPromptDraft(id: string): Promise<void> {
  if (!id.trim()) throw new Error('草稿记录已变化，请刷新后重试')
  const { data } = await responseHandle<number>(
    () =>
      supabase
        .from('ai_prompt_template')
        .delete({ count: 'exact' })
        .eq('id', id)
        .eq('status', 'draft')
        .then((result) => ({ ...result, data: result.count })),
    {
      breakReturn: true,
      showMessage: false,
      showErrorMessage: false,
      requireAffected: true,
      noAffectedMessage: '草稿未删除，请刷新列表核对权限和版本状态后重试',
      errorMessage: '草稿删除失败，请检查关联记录后重试'
    }
  )
  if (data !== 1) throw new Error('删除结果未能确认，请刷新列表核对版本状态后重试')
}
