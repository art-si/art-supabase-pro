/**
 * 路由全局前置守卫模块
 *
 * 提供完整的路由导航守卫功能
 *
 * ## 主要功能
 *
 * - 登录状态验证和重定向
 * - 动态路由注册和权限控制
 * - 菜单数据获取和处理（前端/后端模式）
 * - 用户信息获取和缓存
 * - 页面标题设置
 * - 工作标签页管理
 * - 进度条和加载动画控制
 * - 静态路由识别和处理
 * - 错误处理和异常跳转
 *
 * ## 使用场景
 *
 * - 路由跳转前的权限验证
 * - 动态菜单加载和路由注册
 * - 用户登录状态管理
 * - 页面访问控制
 * - 路由级别的加载状态管理
 *
 * ## 工作流程
 *
 * 1. 检查登录状态，未登录跳转到登录页
 * 2. 首次访问时获取用户信息和菜单数据
 * 3. 根据权限动态注册路由
 * 4. 设置页面标题和工作标签页
 * 5. 处理根路径重定向到首页
 * 6. 未匹配路由跳转到 404 页面
 *
 * @module router/guards/before-each
 */
import type {
  NavigationGuardReturn,
  RouteLocationNormalized,
  RouteLocationRaw,
  Router
} from 'vue-router'
import { nextTick } from 'vue'
import NProgress from 'nprogress'
import { useSettingStore } from '@/store/modules/setting'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { RoutesAlias } from '../routes-alias'
import { staticRoutes } from '../routes/static-routes'
import { loadingService } from '@/utils/ui'
import { useCommon } from '@/hooks/core/useCommon'
import { useWorktabStore } from '@/store/modules/worktab'
import { isHttpError } from '@/utils/http/error'
import { isSupabaseAccessFailure, isSupabaseSessionFailure } from '@/utils/supabase'
import { recoverCurrentAuthSession } from '@/api/auth'
import {
  isSupabaseSessionConfirmedExpired,
  notifySupabaseSessionExpired
} from '@/utils/supabase/session'
import { RouteRegistry, MenuProcessor, IframeRouteManager, RoutePermissionValidator } from '../core'
import TreeUtils from '@utils/tree'
import type { AppRouteRecord } from '@/types'
import type { AppRouteRecordRaw } from '@/utils/router'
import { resolveLegacyBusinessPath } from '../business-paths'
import {
  isRouteInitializationAccessError,
  RouteInitializationAccessError,
  resolveRouteInitializationTarget,
  runRouteInitializationStage
} from './route-initialization'

// 路由注册器实例
let routeRegistry: RouteRegistry | null = null

// 菜单处理器实例
const menuProcessor = new MenuProcessor()

// 跟踪是否需要关闭 loading
let pendingLoading = false
let pendingLoadingTimer: ReturnType<typeof setTimeout> | undefined
let pendingLoadingPath: string | undefined

const ROUTE_LOADING_DELAY_MS = 120
const EXCEPTION_ROUTE_NAMES = new Set(['Exception403', 'Exception404', 'Exception500'])

// 路由初始化失败标记，防止错误页与动态路由之间循环跳转。
// 可由异常页的显式重试动作或重新登录重置。
let routeInitFailed = false

// 路由初始化进行中标记，防止并发请求
let routeInitInProgress = false

const treeUtils = new TreeUtils({
  idKey: 'id',
  parentKey: 'parentId',
  childrenKey: 'children',
  deepClone: true
})

/**
 * 获取 pendingLoading 状态
 */
export function getPendingLoading(): boolean {
  return pendingLoading
}

/**
 * 重置 pendingLoading 状态
 */
export function resetPendingLoading(): void {
  if (pendingLoadingTimer) {
    clearTimeout(pendingLoadingTimer)
    pendingLoadingTimer = undefined
  }
  pendingLoading = false
}

/**
 * 结束当前路由加载反馈。导航完成、取消和异常都必须调用，避免遮罩残留。
 */
export function finishPendingLoading(path?: string): void {
  if (path && pendingLoadingPath && path !== pendingLoadingPath) return

  resetPendingLoading()
  pendingLoadingPath = undefined
  loadingService.hideLoading()
}

/**
 * 获取路由初始化失败状态
 */
export function getRouteInitFailed(): boolean {
  return routeInitFailed
}

/**
 * 重置路由初始化状态（用于重新登录场景）
 */
export function resetRouteInitState(): void {
  routeInitFailed = false
  routeInitInProgress = false
}

/**
 * 清理可能已部分装配的动态路由，让异常页重试真正执行完整初始化。
 */
export function resetRouteInitializationForRetry(): void {
  routeRegistry?.unregister()
  IframeRouteManager.getInstance().clear()

  const menuStore = useMenuStore()
  menuStore.clearRemoveRouteFns()
  menuStore.setMenuList([])
  resetRouteInitState()
}

/**
 * 设置路由全局前置守卫
 */
export function setupBeforeEachGuard(
  router: Router,
  loadHostedApplications?: () => Promise<unknown>
): void {
  router.beforeEach(async (to: RouteLocationNormalized, from: RouteLocationNormalized) => {
    if (to.query.resumeMasterDelete === '1' || to.query.resumeCustomerDelete === '1') {
      return { path: to.path, replace: true }
    }

    if (routeRegistry?.isRegistered() && to.path !== from.path) {
      startRouteLoading(to)
    }

    try {
      return await handleRouteGuard(to, router, loadHostedApplications)
    } catch (error) {
      console.error('[RouteGuard] 路由守卫处理失败:', error)
      closeLoading()
      return createInitializationFailureRoute(to)
    }
  })
}

/**
 * 关闭 loading 效果
 */
function closeLoading(): void {
  if (pendingLoading) {
    nextTick(() => {
      finishPendingLoading()
    })
  }
}

/**
 * 延迟显示页面切换反馈，避免快速路由闪烁，同时遮住尚未切换的旧页面。
 */
function startRouteLoading(to: RouteLocationNormalized, immediate = false): void {
  if (pendingLoadingTimer) clearTimeout(pendingLoadingTimer)

  pendingLoading = true
  pendingLoadingPath = to.fullPath
  const title = typeof to.meta.title === 'string' ? to.meta.title.trim() : ''
  const isExceptionRoute = typeof to.name === 'string' && EXCEPTION_ROUTE_NAMES.has(to.name)
  const loadingText = title && !isExceptionRoute ? `正在打开「${title}」` : '页面加载中'
  const showLoading = (): void => {
    pendingLoadingTimer = undefined
    if (pendingLoading) loadingService.showLoading(loadingText)
  }

  if (immediate) {
    showLoading()
    return
  }

  pendingLoadingTimer = setTimeout(showLoading, ROUTE_LOADING_DELAY_MS)
}

/**
 * 处理路由守卫逻辑
 */
async function handleRouteGuard(
  to: RouteLocationNormalized,
  router: Router,
  loadHostedApplications?: () => Promise<unknown>
): Promise<NavigationGuardReturn> {
  const settingStore = useSettingStore()
  const userStore = useUserStore()

  // 启动进度条
  if (settingStore.showNprogress) {
    NProgress.start()
  }

  // 旧业务书签在鉴权和动态路由注册前完成迁移，避免被误判为无权限路径。
  const legacyBusinessPath = resolveLegacyBusinessPath(to.path)
  if (legacyBusinessPath) {
    return {
      path: legacyBusinessPath,
      query: to.query,
      hash: to.hash,
      replace: true
    }
  }

  // 1. 检查登录状态
  const loginRedirect = getLoginRedirect(to, userStore)
  if (loginRedirect) {
    return loginRedirect
  }

  // 2. 检查路由初始化是否已失败（防止死循环）
  if (routeInitFailed) {
    // 静态登录/异常页不依赖动态菜单，可以安全放行。
    if (isStaticRoute(to.path)) {
      return true
    }

    return createInitializationFailureRoute(to)
  }

  // 3. 处理动态路由注册
  if (!routeRegistry?.isRegistered() && userStore.isLogin) {
    // 防止并发请求（快速连续导航场景）
    if (routeInitInProgress) {
      // 正在初始化中，等待完成后重新导航
      return false
    }
    return handleDynamicRoutes(to, router, loadHostedApplications)
  }

  // 4. 处理根路径重定向
  const rootRedirect = getRootPathRedirect(to)
  if (rootRedirect) {
    return rootRedirect
  }

  // 5. 处理已匹配的路由
  if (to.matched.length > 0) {
    return true
  }

  // 6. 未匹配到路由，跳转到 404
  return { name: 'Exception404' }
}

/**
 * 处理登录状态
 * @returns 未登录时的登录页重定向；允许访问时返回 undefined
 */
function getLoginRedirect(
  to: RouteLocationNormalized,
  userStore: ReturnType<typeof useUserStore>
): RouteLocationRaw | undefined {
  // 已登录或访问登录页或静态路由，直接放行
  if (userStore.isLogin || to.path === RoutesAlias.Login || isStaticRoute(to.path)) {
    return undefined
  }

  // 未登录且访问需要权限的页面，跳转到登录页并携带 redirect 参数
  // 此处不能调用会自行导航的 logOut，否则它会和当前守卫的重定向竞争，
  // 并可能把异常页地址覆盖成登录后的回跳目标。
  return {
    name: 'Login',
    query: { redirect: to.fullPath }
  }
}

/**
 * 检查路由是否为静态路由
 */
function isStaticRoute(path: string): boolean {
  const checkRoute = (routes: AppRouteRecordRaw[], targetPath: string): boolean => {
    return routes.some((route) => {
      // 404 catch-all 路由不应视为可匿名访问的静态页，
      // 否则未登录时手动输入任意地址会直接落到 404，无法跳转登录页。
      if (route.name === 'Exception404') {
        return false
      }

      // 处理动态路由参数匹配
      const routePath = route.path
      const pattern = routePath.replace(/:[^/]+/g, '[^/]+').replace(/\*/g, '.*')
      const regex = new RegExp(`^${pattern}$`)

      if (regex.test(targetPath)) {
        return true
      }
      if (route.children && route.children.length > 0) {
        return checkRoute(route.children, targetPath)
      }
      return false
    })
  }

  return checkRoute(staticRoutes, path)
}

/**
 * 处理动态路由注册
 */
async function handleDynamicRoutes(
  to: RouteLocationNormalized,
  router: Router,
  loadHostedApplications?: () => Promise<unknown>
): Promise<NavigationGuardReturn> {
  const userStore = useUserStore()

  // 标记初始化进行中
  routeInitInProgress = true

  // 显示 loading
  startRouteLoading(to, true)

  try {
    // 持久化的登录标记不代表浏览器里的 Supabase 会话仍然有效。
    // 先让 SDK 刷新并校验会话，避免失效凭证被后续资料请求误报为 500。
    const authSession = await runRouteInitializationStage('user-profile', () =>
      recoverCurrentAuthSession()
    )
    if (authSession.status === 'expired') {
      routeInitInProgress = false
      closeLoading()
      await notifySupabaseSessionExpired()
      return false
    }
    userStore.setToken(authSession.accessToken, authSession.refreshToken)

    // 1. 每次应用启动都刷新一次持久化用户资料，确保租户、角色与内置身份变更及时生效
    const hasUserProfile = await runRouteInitializationStage(
      'user-profile',
      userStore.ensureUserInfo
    )
    if (!hasUserProfile) {
      throw new RouteInitializationAccessError('当前账号缺少有效的业务用户资料')
    }

    // 2. 菜单请求与宿主子仓页面表并行加载；公开页面无需下载页面表。
    const [menuList] = await Promise.all([
      runRouteInitializationStage('menu-permissions', (signal) =>
        menuProcessor.getMenuList(signal)
      ),
      loadHostedApplications?.()
    ])

    // 3. 验证菜单数据
    if (!menuProcessor.validateMenuList(menuList)) {
      throw new RouteInitializationAccessError('当前账号未分配可访问的业务菜单')
    }

    // 4. 页面表加载完成后创建注册器，让 ComponentLoader 获取完整的子仓映射。
    routeRegistry ??= new RouteRegistry(router)
    routeRegistry.register(menuList)

    // 5. 装配路由
    const menuStore = useMenuStore()
    menuStore.setMenuList(treeUtils.sortTreeByField(menuList, 'sort') as AppRouteRecord[])
    menuStore.addRemoveRouteFns(routeRegistry?.getRemoveRouteFns() || [])

    // 6. 保存 iframe 路由
    IframeRouteManager.getInstance().save()

    // 7. 验证工作标签页
    useWorktabStore().validateWorktabs(router)

    // 8. 静态路由不依赖菜单权限，初始化后直接恢复目标地址。
    if (isStaticRoute(to.path)) {
      routeInitInProgress = false
      return {
        path: to.path,
        query: to.query,
        hash: to.hash,
        replace: true
      }
    }

    // 8. 验证目标路径权限
    const { homePath } = useCommon()
    const { path: validatedPath, hasPermission } = RoutePermissionValidator.validatePath(
      to.path,
      menuList,
      homePath.value || '/'
    )

    // 初始化成功，重置进行中标记
    routeInitInProgress = false

    // 9. 重新导航到目标路由
    if (!hasPermission) {
      // 无权限访问，跳转到首页
      closeLoading()

      // 输出警告信息
      console.warn(`[RouteGuard] 用户无权限访问路径: ${to.path}，已跳转到首页`)

      // 直接跳转到首页
      return {
        path: validatedPath,
        replace: true
      }
    } else {
      // 有权限，正常导航
      // 动态路由加入后返回完整地址，强制 Vue Router 用新 matcher 重新解析。
      // 返回同 path 的对象在 Vue Router 5 中可能被当作重复导航，导致首屏悬空。
      return to.fullPath
    }
  } catch (error) {
    console.error('[RouteGuard] 动态路由注册失败:', error)

    // 关闭 loading
    closeLoading()

    // 仅在凭证明确失效时退出；普通 401/403 权限拒绝留在当前登录态。
    if (isSupabaseSessionFailure(error) && (await isSupabaseSessionConfirmedExpired())) {
      routeInitInProgress = false
      await notifySupabaseSessionExpired()
      return false
    }

    // 标记初始化失败，防止死循环
    routeInitFailed = true
    routeInitInProgress = false

    // 输出详细错误信息，便于排查
    if (isHttpError(error)) {
      console.error(`[RouteGuard] 错误码: ${error.code}, 消息: ${error.message}`)
    }

    if (isRouteInitializationAccessError(error)) {
      return {
        name: 'Exception403',
        query: { redirect: resolveRouteInitializationTarget(to.fullPath) },
        replace: true
      }
    }

    if (
      isSupabaseAccessFailure(error) ||
      (isHttpError(error) && (error.code === 401 || error.code === 403))
    ) {
      return {
        name: 'Exception403',
        query: { redirect: resolveRouteInitializationTarget(to.fullPath) },
        replace: true
      }
    }

    return createInitializationFailureRoute(to)
  }
}

/**
 * 跳转到可恢复的服务异常页，并保留本次内部导航目标供用户显式重试。
 */
function createInitializationFailureRoute(to: RouteLocationNormalized): RouteLocationRaw {
  const redirectTarget = resolveRouteInitializationTarget(
    to.path === '/500' ? to.query.redirect : to.fullPath
  )

  return {
    name: 'Exception500',
    query: { redirect: redirectTarget },
    replace: true
  }
}

/**
 * 重置路由相关状态
 */
export function resetRouterState(delay: number): void {
  setTimeout(() => {
    resetRouteInitializationForRetry()
  }, delay)
}

/**
 * 处理根路径重定向到首页
 * @returns 根路径需要跳转时的目标地址
 */
function getRootPathRedirect(to: RouteLocationNormalized): RouteLocationRaw | undefined {
  if (to.path !== '/') {
    return undefined
  }

  const { homePath } = useCommon()
  if (homePath.value && homePath.value !== '/') {
    return { path: homePath.value, replace: true }
  }

  return undefined
}
