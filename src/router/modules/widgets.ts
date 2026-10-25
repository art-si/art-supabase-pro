import { AppRouteRecord } from '@/types/router'

export const widgetsRoutes: AppRouteRecord = {
  path: '/widgets',
  name: 'Widgets',
  component: '/index/index',
  type: 'folder',
  sort: 6,
  meta: {
    title: '组件示例',
    icon: 'ri:apps-2-add-line'
  },
  children: [
    {
      path: 'context-menu',
      name: 'ContextMenu',
      component: '/widgets/context-menu',
      type: 'menu',
      sort: 1,
      meta: {
        title: '右键菜单',
        icon: 'ri:menu-2-line',
        keepAlive: true
      }
    },
    {
      path: 'data-select',
      name: 'DataSelectWidget',
      component: '/widgets/data-select',
      type: 'menu',
      sort: 2,
      meta: {
        title: '数据选择器',
        icon: 'ri:list-check-3',
        keepAlive: true
      }
    },
    {
      path: 'icon-picker',
      name: 'IconPickerWidget',
      component: '/widgets/icon-picker',
      type: 'menu',
      sort: 3,
      meta: {
        title: '图标选择器',
        icon: 'ri:palette-line',
        keepAlive: true
      }
    },
    {
      path: 'resource-picker',
      name: 'ResourcePickerWidget',
      component: '/widgets/resource-picker',
      type: 'menu',
      sort: 4,
      meta: {
        title: '资源选择器',
        icon: 'ri:folder-image-line',
        keepAlive: true
      }
    },
    {
      path: 'table-query',
      name: 'TableQueryWidget',
      component: '/widgets/table-query',
      type: 'menu',
      sort: 5,
      meta: {
        title: '查询表格',
        icon: 'ri:table-3',
        keepAlive: true
      }
    }
  ]
}
