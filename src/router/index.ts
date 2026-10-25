import type { App } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import { staticRoutes } from './routes/static-routes'
import { configureNProgress } from '@/utils/router'
import { setupBeforeEachGuard } from './guards/before-each'
import { setupAfterEachGuard } from './guards/after-each'
import { setupRouteErrorRecovery } from './guards/error-recovery'
import { normalizeHashRouterBase } from './hash-history'

// 创建路由实例
export const router = createRouter({
  // 显式使用部署基路径，避免从非标准业务 URL 启动时把当前 pathname 误识别为 Hash base。
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: staticRoutes // 静态路由
})

// 初始化路由
export function initRouter(
  app: App<Element>,
  loadHostedApplications?: () => Promise<unknown>
): void {
  normalizeHashRouterBase(import.meta.env.BASE_URL)
  configureNProgress() // 顶部进度条
  setupBeforeEachGuard(router, loadHostedApplications) // 路由前置守卫
  setupAfterEachGuard(router) // 路由后置守卫
  setupRouteErrorRecovery(router)
  app.use(router)
}

// 主页路径，默认使用菜单第一个有效路径，配置后使用此路径
export const HOME_PAGE_PATH = ''
