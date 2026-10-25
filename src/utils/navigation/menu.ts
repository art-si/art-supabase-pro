import { formatMenuTitle } from '@/utils/router'
import TreeUtils from '@/utils/tree'

export interface MenuLabelSource {
  name?: unknown
  meta?: { title?: unknown } | null
}

/** Resolves the user-facing title shared by menu trees and menu-backed selectors. */
export function resolveMenuLabel(menu: MenuLabelSource, fallback = '未命名菜单'): string {
  const title = String(menu.meta?.title ?? '').trim()
  if (title) return formatMenuTitle(title)

  const name = String(menu.name ?? '').trim()
  return name ? formatMenuTitle(name) : fallback
}

export interface MenuPathResolver {
  resolve(menuId?: string | number | null): string
  resolveMany(menuIds: readonly (string | number)[]): string
}

/** Build once per reactive menu-tree revision; keep menu labels and path separators consistent. */
export function createMenuPathResolver<T extends MenuLabelSource>(tree: T[]): MenuPathResolver {
  const paths = new TreeUtils({ deepClone: false }).getLabelPathIndex(tree, (menu) =>
    resolveMenuLabel(menu)
  )
  const resolve = (menuId?: string | number | null): string =>
    menuId === undefined || menuId === null || menuId === '' ? '' : (paths.get(menuId) ?? '')
  return {
    resolve,
    resolveMany: (menuIds) => menuIds.map(resolve).filter(Boolean).join('；')
  }
}
