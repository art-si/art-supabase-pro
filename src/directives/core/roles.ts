/**
 * v-roles 角色权限指令
 *
 * 根据当前用户角色控制元素是否保留在 DOM 中。
 */

import { useUserStore } from '@/store/modules/user'
import type { App, Directive, DirectiveBinding } from 'vue'

export type RolesDirective = Directive<HTMLElement, string | string[]>

function removeElement(el: HTMLElement): void {
  el.parentNode?.removeChild(el)
}

function checkRolePermission(el: HTMLElement, binding: DirectiveBinding<string | string[]>): void {
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

const rolesDirective: RolesDirective = {
  mounted: checkRolePermission,
  updated: checkRolePermission
}

export function setupRolesDirective(app: App): void {
  app.directive('roles', rolesDirective)
}
