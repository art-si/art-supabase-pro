/**
 * useAuth - 权限验证管理
 *
 * 提供统一的权限验证功能，支持前端和后端两种权限模式。
 * 用于控制页面按钮、操作等功能的显示和访问权限。
 *
 * ## 主要功能
 *
 * 1. 权限检查 - 检查用户是否拥有指定的权限标识
 * 2. 双模式支持 - 自动适配前端模式和后端模式的权限验证
 * 3. 前端模式 - 从用户信息中获取按钮权限列表（如 ['add', 'edit', 'delete']）
 * 4. 后端模式 - 从路由 meta 配置中获取权限列表（如 [{ authMark: 'add' }]）
 *
 * ## 使用示例
 *
 * ```typescript
 * const { hasAuth } = useAuth()
 *
 * // 检查是否有新增权限
 * if (hasAuth('add')) {
 *   // 显示新增按钮
 * }
 *
 * // 在模板中使用
 * <el-button v-if="hasAuth('edit')">编辑</el-button>
 * <el-button v-if="hasAuth('delete')">删除</el-button>
 * ```
 *
 * @module useAuth
 */
import { storeToRefs } from 'pinia'
import { useUserStore } from '@/store/modules/user'
import { useAppMode } from '@/hooks/core/useAppMode'
import type { AppRouteRecord } from '@/types/router'
import { useMenuStore } from '@/store/modules/menu'

export const useAuth = () => {
  const { isFrontendMode } = useAppMode()
  const userStore = useUserStore()
  const menuStore = useMenuStore()
  const { info, isPlatformSuper } = storeToRefs(userStore)
  const { buttonList } = storeToRefs(menuStore)
  type UserInfoWithDemoButtons = Partial<Api.Auth.UserInfo> & { buttons?: string[] }

  // 前端按钮权限（例如：['add', 'edit']）
  const getFrontendAuthList = () => (info.value as UserInfoWithDemoButtons).buttons ?? []

  // 后端路由 meta 配置的权限列表（例如：[{ authMark: 'add' }]）
  const getBackendAuthList = (): AppRouteRecord[] =>
    Array.isArray(buttonList.value) ? (buttonList.value as AppRouteRecord[]) : []

  /**
   * 检查是否拥有某权限标识（前后端模式通用）
   * @param auth 权限标识
   * @returns 是否有权限
   */
  const hasAuth = (auth: string): boolean => {
    // 平台超级管理员是统一权限解析器的隐式兜底；真正的写入仍由 RPC / RLS 再校验。
    if (isPlatformSuper.value) return true

    // 前端模式
    if (isFrontendMode.value) {
      return getFrontendAuthList().includes(auth)
    }

    // 后端模式
    return getBackendAuthList().some((item) => item?.name === auth)
  }

  const hasAnyAuth = (authList: string[]): boolean => authList.some(hasAuth)

  const hasAllAuth = (authList: string[]): boolean => authList.every(hasAuth)

  return {
    hasAuth,
    hasAnyAuth,
    hasAllAuth
  }
}
