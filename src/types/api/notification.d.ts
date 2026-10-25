declare namespace Api {
  namespace Notification {
    type NotificationCategory = 'notice' | 'message' | 'todo'
    type NotificationSeverity = 'info' | 'success' | 'warning' | 'danger'

    interface HeaderNotificationItem {
      id: string
      category: NotificationCategory
      title: string
      content?: string | null
      severity: NotificationSeverity
      isRead: boolean
      createdAt: string
      routePath: string
      routeQuery: Record<string, string | number | boolean | null>
      instanceId?: string | null
    }

    interface HeaderNotificationCenter {
      notices: HeaderNotificationItem[]
      messages: HeaderNotificationItem[]
      todos: HeaderNotificationItem[]
      unreadNoticeCount: number
      unreadMessageCount: number
      pendingTodoCount: number
      totalUnreadCount: number
    }

    interface MarkNotificationsReadParams {
      category?: Exclude<NotificationCategory, 'todo'> | null
      notificationIds?: string[] | null
    }
  }
}
