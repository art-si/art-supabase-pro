/**
 * 导航跳转工具模块
 *
 * 提供统一的页面跳转和导航功能
 *
 * ## 主要功能
 *
 * - 外部链接打开（新窗口）
 * - 菜单项跳转处理（支持内部路由和外部链接）
 * - iframe 页面跳转支持
 * - 递归查找并跳转到第一个可见的子菜单
 * - 智能判断跳转目标类型（外部链接/内部路由）
 *
 * @module utils/navigation/jump
 */
import { AppRouteRecord } from '@/types/router'
import { router } from '@/router'
import { preloadRouteComponent } from '@/router/core/component-loader'
import { isNavigableMenuItem } from './route'

const findFirstLeafMenu = (items: AppRouteRecord[]): AppRouteRecord | undefined => {
  for (const child of items) {
    if (isNavigableMenuItem(child)) {
      return child.children?.length ? findFirstLeafMenu(child.children) || child : child
    }
  }
  return undefined
}

// 打开外部链接
export const openExternalLink = (link: string): void => {
  window.open(link, '_blank', 'noopener,noreferrer')
}

/**
 * 菜单跳转
 * @param item 菜单项
 * @param jumpToFirst 是否跳转到第一个子菜单
 * @returns
 */
export const handleMenuJump = (item: AppRouteRecord, jumpToFirst: boolean = false) => {
  // 处理外部链接
  const { link, isIframe } = item.meta
  if (link && !isIframe) {
    return openExternalLink(link)
  }

  // 如果不需要跳转到第一个子菜单，或者没有子菜单，直接跳转当前路径
  if (!jumpToFirst || !item.children?.length) {
    return router.push(item.path)
  }

  const firstChild = findFirstLeafMenu(item.children)

  // 如果子菜单都不可见，则回退到父级页面自身。
  if (!firstChild) {
    return router.push(item.path)
  }

  // 如果第一个子菜单是外部链接则打开新窗口
  if (firstChild.meta?.link) {
    return openExternalLink(firstChild.meta.link)
  }

  // 跳转到子菜单路径
  return router.push(firstChild.path)
}

/** 菜单点击是即发即忘操作；路由加载异常由全局恢复器处理，这里消费原导航的拒绝。 */
export const startMenuJump = (item: AppRouteRecord, jumpToFirst = false): void => {
  void Promise.resolve()
    .then(() => handleMenuJump(item, jumpToFirst))
    .catch((error: unknown) => {
      console.error('[MenuNavigation] 页面跳转失败:', error)
    })
}

/**
 * 鼠标悬停或键盘聚焦菜单时预热对应的异步页面组件。
 * 只加载用户正在指向的页面，不在登录后批量下载全部业务模块。
 */
export const preloadMenuRoute = async (
  item: AppRouteRecord,
  jumpToFirst: boolean = false,
  throwOnError: boolean = false
): Promise<void> => {
  if (item.meta.link && !item.meta.isIframe) return

  const target = jumpToFirst && item.children?.length ? findFirstLeafMenu(item.children) : item
  if (!target || (target.meta.link && !target.meta.isIframe)) return

  const matchedRoutes = router.resolve(target.path).matched
  const preloadTasks = matchedRoutes.flatMap((route) =>
    Object.values(route.components ?? {}).map((component) => preloadRouteComponent(component))
  )
  if (throwOnError) {
    await Promise.all(preloadTasks)
  } else {
    await Promise.allSettled(preloadTasks)
  }
}
