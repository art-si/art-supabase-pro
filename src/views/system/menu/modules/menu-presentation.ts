import type { TagProps } from 'element-plus'
import type { AppRouteRecord } from '@/types/router'

export function getMenuTypeText(row: AppRouteRecord): string {
  if (row.type === 'button') return '按钮'
  if (row.type === 'folder') return '目录'
  if (row.meta?.link && row.meta?.isIframe) return '内嵌'
  if (row.meta?.link) return '外链'
  if (row.path) return '菜单'
  return '未知'
}

export function getMenuTypeTag(row: AppRouteRecord): TagProps['type'] {
  if (row.type === 'button') return 'danger'
  if (row.meta?.link && row.meta?.isIframe) return 'success'
  if (row.meta?.link) return 'warning'
  if (row.type === 'menu') return 'primary'
  return 'info'
}

export function getMenuTypeIcon(row: AppRouteRecord): string {
  if (row.type === 'button') return 'ri:cursor-line'
  if (row.meta?.link && row.meta?.isIframe) return 'ri:window-line'
  if (row.meta?.link) return 'ri:external-link-line'
  if (row.type === 'folder') return row.meta?.icon || 'ri:folder-3-line'
  return row.meta?.icon || 'ri:file-list-3-line'
}

export function getMenuActionSubject(row: AppRouteRecord): string {
  if (row.type === 'button') return '权限'
  if (row.type === 'folder') return '目录'
  return '菜单'
}

export function getDirectPermissionCount(row: AppRouteRecord): number {
  return (
    row.children?.filter((item) => item.type === 'button' || item.meta?.menuType === 'button')
      .length ?? 0
  )
}
