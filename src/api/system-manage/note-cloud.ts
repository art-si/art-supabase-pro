import { useSupabase } from '@/hooks/core/useSupabase'
import { isObjectRecord } from '@/utils/record'
import { fetchAllRangePages } from '@/utils/supabase/pagination'
import { isValidDateTimeValue } from '@/utils/time'

export type NoteCloudScope = 'closed' | 'all' | 'tenants' | 'users'

export interface NoteCloudSettings {
  scope: NoteCloudScope
  targetIds: string[]
  updatedAt: string | null
}

interface NoteCloudUser {
  id: string
  userName: string | null
  nickName: string | null
  userEmail: string | null
  avatar: string | null
  status: string
  deletedAt: string | null
  tenant: { tenantName: string } | null
}

const { supabase, responseHandle } = useSupabase()

function isNoteCloudSettings(value: unknown): value is NoteCloudSettings {
  if (!isObjectRecord(value)) return false
  const { scope, targetIds, updatedAt } = value
  return (
    (scope === 'closed' || scope === 'all' || scope === 'tenants' || scope === 'users') &&
    Array.isArray(targetIds) &&
    targetIds.every((id: unknown) => typeof id === 'string') &&
    (updatedAt === null ||
      (typeof updatedAt === 'string' && isValidDateTimeValue(updatedAt, false)))
  )
}

export async function fetchNoteCloudSettings(): Promise<NoteCloudSettings> {
  const { data } = await responseHandle(() => supabase.rpc('get_note_cloud_settings'), {
    breakReturn: true,
    showErrorMessage: false
  })
  if (!isNoteCloudSettings(data)) throw new Error('无法读取云端授权，请刷新后重试')
  return data
}

export async function saveNoteCloudSettings(
  settings: NoteCloudSettings
): Promise<NoteCloudSettings> {
  const { data } = await responseHandle(
    () =>
      supabase.rpc('save_note_cloud_settings', {
        p_scope: settings.scope,
        p_target_ids: settings.targetIds,
        p_expected_updated_at: settings.updatedAt
      }),
    { breakReturn: true, showErrorMessage: false }
  )
  if (!isNoteCloudSettings(data)) throw new Error('无法确认云端授权已保存，请刷新后核对')
  return data
}

export async function fetchNoteCloudUsers(selectedIds: string[]): Promise<NoteCloudUser[]> {
  const columns =
    'id,user_name,nick_name,user_email,avatar,status,deleted_at,tenant:sys_tenant!sys_user_tenant_id_fkey(tenant_name)'
  const { data, error } = await fetchAllRangePages<NoteCloudUser>(({ from, to }) =>
    responseHandle<NoteCloudUser[]>(
      () =>
        supabase
          .from('sys_user')
          .select(columns)
          .eq('status', '1')
          .is('deleted_at', null)
          .not('auth_user_id', 'is', null)
          .order('id')
          .range(from, to),
      { showErrorMessage: false }
    )
  )
  if (error) throw error
  const users = data ?? []
  const missingIds = selectedIds.filter((id) => !users.some((user) => user.id === id))
  if (!missingIds.length) return users
  const previous = await responseHandle<NoteCloudUser[]>(
    () => supabase.from('sys_user').select(columns).in('id', missingIds),
    { breakReturn: true, showErrorMessage: false }
  )
  return [...users, ...(previous.data ?? [])]
}
