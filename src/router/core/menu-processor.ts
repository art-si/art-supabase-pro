/**
 * 菜单处理器
 *
 * 负责菜单数据的获取、过滤和处理
 *
 * @module router/core/menu-processor
 */

import type { AppRouteRecord } from '@/types/router'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { useAppMode } from '@/hooks/core/useAppMode'
import {
  fetchAccessibleApplications,
  fetchCurrentUserButtonPermissions,
  fetchCurrentUserMenus
} from '@/api/system-manage/application-access'
import { asyncRoutes } from '../routes/async-routes'
import { fetchBffCatalog } from '@/api/bff'
import { RoutesAlias } from '../routes-alias'
import {
  APPLICATION_CODES,
  currentApplication,
  resolveHostedApplicationCodes
} from '@/config/application'
import {
  buildApplicationMenuTree,
  flattenStandaloneApplicationMenu,
  normalizeApplicationMenuPaths
} from './application-menu'

export class MenuProcessor {
  /**
   * 获取菜单数据
   */
  async getMenuList(signal?: AbortSignal): Promise<AppRouteRecord[]> {
    const { isFrontendMode } = useAppMode()

    let menuList: AppRouteRecord[]
    if (isFrontendMode.value) {
      menuList = await this.processFrontendMenu()
    } else {
      menuList = await this.processBackendMenu(signal)
    }

    // 规范化路径（将相对路径转换为完整路径）
    const normalizedMenuList = normalizeApplicationMenuPaths(menuList)
    const visible = flattenStandaloneApplicationMenu(normalizedMenuList, currentApplication.code)
    if (import.meta.env.VITE_BFF_ENABLED !== 'true' || currentApplication.code !== 'platform')
      return visible
    try {
      // Optional BFF discovery must not delay the native Pro workspace indefinitely.
      await fetchBffCatalog({ signal })
      if (!visible.some((route) => route.path === '/examples/bff-integration'))
        visible.push({
          name: 'BffIntegration',
          path: '/examples/bff-integration',
          component: '/examples/bff-integration/index',
          type: 'menu',
          sort: 900,
          meta: { title: 'BFF 接入中心', icon: 'ri:links-line', isEnable: true }
        })
    } catch (error) {
      console.warn('[BFF] 接入中心目录暂不可用', {
        kind: error instanceof Error ? error.name : 'UnknownError'
      })
    }
    return visible
  }

  /**
   * 处理前端控制模式的菜单
   */
  private async processFrontendMenu(): Promise<AppRouteRecord[]> {
    const userStore = useUserStore()
    const roles = userStore.info?.userRoles

    let menuList = [...asyncRoutes]

    // 根据角色过滤菜单
    if (roles && roles.length > 0) {
      menuList = this.filterMenuByRoles(menuList, roles)
    }

    return this.filterEmptyMenus(menuList)
  }

  /**
   * 处理后端控制模式的菜单
   */
  private async processBackendMenu(signal?: AbortSignal): Promise<AppRouteRecord[]> {
    const menuStore = useMenuStore()
    menuStore.setButtonList([])
    const isPlatform = currentApplication.code === 'platform'
    const [accessibleApplicationsResult, menuResponse, buttonResponse] = await Promise.all([
      isPlatform ? fetchAccessibleApplications(signal) : Promise.resolve(null),
      fetchCurrentUserMenus(
        isPlatform ? [...APPLICATION_CODES] : [currentApplication.code],
        signal
      ),
      fetchCurrentUserButtonPermissions(signal)
    ])
    if (accessibleApplicationsResult?.error) {
      throw new Error('可访问应用范围加载失败', {
        cause: accessibleApplicationsResult.error
      })
    }

    const applicationCodes = resolveHostedApplicationCodes(
      currentApplication.code,
      accessibleApplicationsResult?.data ?? []
    )
    if (menuResponse.error) {
      throw new Error('菜单权限加载失败', { cause: menuResponse.error })
    }
    if (buttonResponse.error || !buttonResponse.data) {
      throw new Error('按钮权限加载失败', { cause: buttonResponse.error })
    }

    const tree = applicationCodes.flatMap((code) =>
      buildApplicationMenuTree(menuResponse.data?.[code] ?? [])
    )

    // 保存按钮数据到 store
    menuStore.setButtonList(buttonResponse.data)
    return this.filterEmptyMenus(tree)
  }

  /**
   * 根据角色过滤菜单
   */
  private filterMenuByRoles(menu: AppRouteRecord[], roles: string[]): AppRouteRecord[] {
    return menu.reduce((acc: AppRouteRecord[], item) => {
      const itemRoles = item.meta?.roles
      const hasPermission = !itemRoles || itemRoles.some((role) => roles?.includes(role))

      if (hasPermission) {
        const filteredItem = { ...item }
        if (filteredItem.children?.length) {
          filteredItem.children = this.filterMenuByRoles(filteredItem.children, roles)
        }
        acc.push(filteredItem)
      }

      return acc
    }, [])
  }

  /**
   * 递归过滤空菜单项
   */
  private filterEmptyMenus(menuList: AppRouteRecord[]): AppRouteRecord[] {
    return menuList
      .map((item) => {
        // 如果有子菜单，先递归过滤子菜单
        if (item.children && item.children.length > 0) {
          const filteredChildren = this.filterEmptyMenus(item.children)
          return {
            ...item,
            children: filteredChildren
          }
        }
        return item
      })
      .filter((item) => {
        // 如果定义了 children 属性（即使是空数组），说明这是一个目录菜单，应该保留
        if ('children' in item && item.type !== 'button') {
          return true
        }

        // 如果有外链或 iframe，保留
        if (item.meta?.isIframe === true || item.meta?.link) {
          return true
        }

        // 如果有有效的 component，保留
        if (item.component && item.component !== '' && item.component !== RoutesAlias.Layout) {
          return true
        }

        // 其他情况过滤掉
        return false
      })
  }

  /**
   * 验证菜单列表是否有效
   */
  validateMenuList(menuList: AppRouteRecord[]): boolean {
    return Array.isArray(menuList) && menuList.length > 0
  }
}
