import { useSupabase } from '@/hooks/core/useSupabase'

const { supabase, responseHandle } = useSupabase()

export async function fetchHeaderNotificationCenter(limit = 20) {
  return await responseHandle<Api.Notification.HeaderNotificationCenter>(
    () => supabase.rpc('get_header_notification_center', { p_limit: limit }),
    { showErrorMessage: false, breakReturn: true }
  )
}

export async function markHeaderNotificationsRead(
  params: Api.Notification.MarkNotificationsReadParams = {}
) {
  return await responseHandle<number>(
    () =>
      supabase.rpc('mark_header_notifications_read', {
        p_category: params.category ?? null,
        p_notification_ids: params.notificationIds ?? null
      }),
    { showErrorMessage: true, breakReturn: true }
  )
}
