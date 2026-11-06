/**
 * v-roles 角色权限指令
 *
 * 根据当前用户角色控制元素是否保留在 DOM 中。
 */

import { useUserStore } from '@/store/modules/user'
import { hasInjectionContext, inject, type App, type Directive, type DirectiveBinding } from 'vue'
import { platformAuthContextKey } from '@/utils/auth-context'

export type RolesDirective = Directive<HTMLElement, string | string[]>

function removeElement(el: HTMLElement): void {
  el.parentNode?.removeChild(el)
}

function checkRolePermission(el: HTMLElement, binding: DirectiveBinding<string | string[]>): void {
  const externalAuth = hasInjectionContext() ? inject(platformAuthContextKey, undefined) : undefined
  if (externalAuth?.hasRole) {
    const requiredRoles = Array.isArray(binding.value) ? binding.value : [binding.value]
    if (!requiredRoles.some(externalAuth.hasRole)) removeElement(el)
    return
  }
  const userStore = useUserStore()
  const userRoles = userStore.getUserInfo.userRoles

  if (!userRoles?.length) {
    removeElement(el)
    return
  }

  const requiredRoles = Array.isArray(binding.value) ? binding.value : [binding.value]
  const hasPermission = requiredRoles.some((role) => userRoles.includes(role))

  if (!hasPermission) {
    removeElement(el)
  }
}

export function setupRolesDirective(app: App): void {
  const check: typeof checkRolePermission = (el, binding) =>
    app.runWithContext(() => checkRolePermission(el, binding))
  app.directive('roles', { mounted: check, updated: check })
}
