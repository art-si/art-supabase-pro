import { AppRouteRecord } from '@/types/router'
import { BUILTIN_ROLE_CODES } from '@/config/builtin-roles'

export const dashboardRoutes: AppRouteRecord = {
  name: 'Dashboard',
  path: '/dashboard',
  component: '/index/index',
  meta: {
    title: 'menus.dashboard.title',
    icon: 'ri:pie-chart-line',
    roles: [BUILTIN_ROLE_CODES.PLATFORM_SUPER, 'R_ADMIN']
  },
  children: [
    {
      path: 'console',
      name: 'Console',
      component: '/dashboard/console',
      meta: {
        title: 'menus.dashboard.console',
        keepAlive: false,
        fixedTab: true
      }
    }
  ]
}
