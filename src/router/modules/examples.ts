import { AppRouteRecord } from '@/types/router'
import { BUILTIN_ROLE_CODES } from '@/config/builtin-roles'

export const examplesRoutes: AppRouteRecord = {
  path: '/examples',
  name: 'Examples',
  component: '/index/index',
  type: 'folder',
  sort: 5,
  meta: {
    title: '示例中心',
    icon: 'ri:sparkling-line'
  },
  children: [
    {
      path: 'permission',
      name: 'ExamplesPermission',
      component: '',
      type: 'folder',
      sort: 1,
      meta: {
        title: '权限示例',
        icon: 'ri:fingerprint-line'
      },
      children: [
        {
          path: 'switch-role',
          name: 'PermissionSwitchRole',
          component: '/examples/permission/switch-role',
          type: 'menu',
          sort: 1,
          meta: {
            title: '切换角色',
            icon: 'ri:contacts-line',
            keepAlive: true
          }
        },
        {
          path: 'button-auth',
          name: 'PermissionButtonAuth',
          component: '/examples/permission/button-auth',
          type: 'menu',
          sort: 2,
          meta: {
            title: '按钮权限',
            icon: 'ri:mouse-line',
            keepAlive: true,
            authList: [
              { title: '新增', authMark: 'add' },
              { title: '编辑', authMark: 'edit' },
              { title: '删除', authMark: 'delete' },
              { title: '导出', authMark: 'export' },
              { title: '查看', authMark: 'view' },
              { title: '发布', authMark: 'publish' },
              { title: '配置', authMark: 'config' },
              { title: '管理', authMark: 'manage' }
            ]
          }
        },
        {
          path: 'page-visibility',
          name: 'PermissionPageVisibility',
          component: '/examples/permission/page-visibility',
          type: 'menu',
          sort: 3,
          meta: {
            title: '页面可见性',
            icon: 'ri:user-3-line',
            keepAlive: true,
            roles: [BUILTIN_ROLE_CODES.PLATFORM_SUPER]
          }
        }
      ]
    },
    {
      path: 'tabs',
      name: 'TabsExample',
      component: '/examples/tabs',
      type: 'menu',
      sort: 2,
      meta: {
        title: '标签页操作',
        icon: 'ri:price-tag-line',
        keepAlive: true
      }
    },
    {
      path: 'tables/basic',
      name: 'TablesBasic',
      component: '/examples/tables/basic',
      type: 'menu',
      sort: 3,
      meta: {
        title: '基础表格',
        icon: 'ri:layout-grid-line',
        keepAlive: true
      }
    },
    {
      path: 'tables',
      name: 'Tables',
      component: '/examples/tables',
      type: 'menu',
      sort: 4,
      meta: {
        title: '高级表格',
        icon: 'ri:table-3',
        keepAlive: true
      }
    },
    {
      path: 'forms',
      name: 'Forms',
      component: '/examples/forms',
      type: 'menu',
      sort: 5,
      meta: {
        title: '表单组件',
        icon: 'ri:table-view',
        keepAlive: true
      }
    },
    {
      path: 'form/search-bar',
      name: 'SearchBar',
      component: '/examples/form/search-bar',
      type: 'menu',
      sort: 6,
      meta: {
        title: '搜索表单',
        icon: 'ri:table-line',
        keepAlive: true
      }
    },
    {
      path: 'socket-chat',
      name: 'SocketChat',
      component: '/examples/socket-chat',
      type: 'menu',
      sort: 7,
      meta: {
        title: 'Socket 聊天',
        icon: 'ri:shake-hands-line',
        keepAlive: true
      }
    }
  ]
}
