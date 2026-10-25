import { useSupabase } from '@/hooks/core/useSupabase'

const { supabase, responseHandle } = useSupabase()

export async function fetchNotificationReminderWorkspace(tenantId?: string) {
  return await responseHandle<Api.NotificationReminder.Workspace>(
    () =>
      supabase.rpc('get_notification_reminder_workspace', {
        p_tenant_id: tenantId || null
      }),
    {
      showErrorMessage: true,
      errorMessage: '消息提醒工作台加载失败，请稍后重试'
    }
  )
}

export async function saveNotificationRule(rule: Api.NotificationReminder.Rule) {
  return await responseHandle<Api.NotificationReminder.Rule>(
    () => supabase.rpc('save_notification_rule', { p_rule: rule }),
    {
      showMessage: true,
      message: '提醒规则保存成功',
      errorMessage: '提醒规则保存失败，请检查按钮权限后重试',
      breakReturn: true
    }
  )
}

export async function deleteNotificationRule(ruleId: string) {
  return await responseHandle<boolean>(
    () => supabase.rpc('delete_notification_rule', { p_rule_id: ruleId }),
    {
      showMessage: true,
      message: '提醒规则删除成功',
      errorMessage: '提醒规则删除失败，请检查按钮权限后重试',
      breakReturn: true
    }
  )
}

export async function saveNotificationChannel(
  payload: Api.NotificationReminder.SaveChannelPayload
) {
  return await responseHandle<Api.NotificationReminder.ChannelConfig>(
    () =>
      supabase.rpc('save_notification_channel_config', {
        p_tenant_id: payload.tenantId,
        p_channel_code: payload.channelCode,
        p_provider_code: payload.providerCode,
        p_enabled: payload.enabled,
        p_config: payload.config,
        p_secret: payload.secret ?? null
      }),
    {
      showMessage: true,
      message: '通知渠道配置保存成功',
      errorMessage: '通知渠道配置保存失败，请检查按钮权限后重试',
      breakReturn: true
    }
  )
}

export async function testNotificationChannel(tenantId: string, channelCode: string) {
  const result = await responseHandle<string>(
    () =>
      supabase.rpc('test_notification_channel', {
        p_tenant_id: tenantId,
        p_channel_code: channelCode
      }),
    {
      showMessage: false,
      errorMessage: '通知渠道测试提交失败，请检查渠道配置后重试',
      breakReturn: true
    }
  )
  if (channelCode !== 'in_app') {
    await responseHandle<Api.NotificationReminder.DispatchResult>(
      () => supabase.functions.invoke('notification-dispatcher', { body: { limit: 20 } }),
      {
        showErrorMessage: true,
        errorMessage: '通知渠道测试投递失败，请稍后重试'
      }
    )
  }
  return result
}

export async function runNotificationRemindersNow(tenantId: string) {
  const reminderResult = await responseHandle<Api.NotificationReminder.DispatchResult>(
    () => supabase.rpc('run_notification_reminders_now', { p_tenant_id: tenantId }),
    {
      showErrorMessage: true,
      errorMessage: '提醒任务执行失败，请稍后重试'
    }
  )
  const dispatchResult = await responseHandle<Api.NotificationReminder.DispatchResult>(
    () => supabase.functions.invoke('notification-dispatcher', { body: { limit: 100 } }),
    {
      showErrorMessage: true,
      errorMessage: '外部通知投递失败，请稍后重试'
    }
  )
  return {
    data: { ...(reminderResult.data ?? {}), ...(dispatchResult.data ?? {}) },
    error: reminderResult.error ?? dispatchResult.error
  }
}
