import type { ApplicationCode } from '@/config/application'
import type { AppRouteRecord } from '@/types/router'
import { RoutesAlias } from '../routes-alias'

/** 菜单 RPC 返回按 sort、id 排序的授权节点；在浏览器中线性构树，避免数据库逐节点递归查询。 */
export function buildApplicationMenuTree(flat: AppRouteRecord[]): AppRouteRecord[] {
  const nodes = new Map<string, AppRouteRecord>()
  flat.forEach((item) => {
    nodes.set(String(item.id), { ...item, children: [] })
  })

  const roots: AppRouteRecord[] = []
  flat.forEach((item) => {
    const node = nodes.get(String(item.id))
    if (!node) return

    const parent = item.parentId ? nodes.get(String(item.parentId)) : undefined
    if (parent && parent !== node) {
      parent.children?.push(node)
    } else {
      roots.push(node)
    }
  })
  return roots
}

/**
 * 独立应用已经通过应用切换器表明自身身份，不再重复显示应用壳目录。
 * 子菜单路径必须先完成规范化，这样提升层级后仍保留 `/vms/...` 等稳定前缀。
 */
export function flattenStandaloneApplicationMenu(
  menuList: AppRouteRecord[],
  applicationCode: ApplicationCode
): AppRouteRecord[] {
  if (applicationCode === 'platform') return menuList

  const applicationRootPath = `/${applicationCode}`
  return menuList.flatMap((item) => {
    const normalizedPath = item.path.replace(/\/$/, '')
    if (normalizedPath !== applicationRootPath || !item.children?.length) {
      return [item]
    }

    return item.children.map((child) => ({
      ...child,
      component: child.component || (child.children?.length ? RoutesAlias.Layout : child.component)
    }))
  })
}
