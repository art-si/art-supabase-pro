import { AppRouteRecord } from '@/types/router'
import { dashboardRoutes } from './dashboard'
import { systemRoutes } from './system'
import { resultRoutes } from './result'
import { exceptionRoutes } from './exception'
import { examplesRoutes } from './examples'
import { widgetsRoutes } from './widgets'

/**
 * 导出所有模块化路由
 */
export const routeModules: AppRouteRecord[] = [
  dashboardRoutes,
  systemRoutes,
  examplesRoutes,
  widgetsRoutes,
  resultRoutes,
  exceptionRoutes
]
