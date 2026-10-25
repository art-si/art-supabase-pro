import { AppRouteRecord } from '@/types/router'
import { BUILTIN_ROLE_CODES } from '@/config/builtin-roles'

export const systemRoutes: AppRouteRecord = {
  path: '/system',
  name: 'System',
  component: '/index/index',
  meta: {
    title: 'menus.system.title',
    icon: 'ri:user-3-line',
    roles: [BUILTIN_ROLE_CODES.PLATFORM_SUPER, 'R_ADMIN']
  },
  children: [
    {
      path: 'user',
      name: 'User',
      component: '/system/user',
      meta: {
        title: 'menus.system.user',
        keepAlive: true,
        roles: [BUILTIN_ROLE_CODES.PLATFORM_SUPER, 'R_ADMIN']
      }
    },
    {
      path: 'role',
      name: 'Role',
      component: '/system/role',
      meta: {
        title: 'menus.system.role',
        keepAlive: true,
        roles: [BUILTIN_ROLE_CODES.PLATFORM_SUPER]
      }
    },
    {
      path: 'tenant',
      name: 'Tenant',
      component: '/system/tenant',
      meta: {
        title: '租户管理',
        keepAlive: true,
        roles: [BUILTIN_ROLE_CODES.PLATFORM_SUPER],
        authList: [
          { title: '新增', authMark: 'add' },
          { title: '编辑', authMark: 'edit' },
          { title: '删除', authMark: 'delete' }
        ]
      }
    },
    {
      path: 'system-param',
      name: 'SystemParam',
      component: '/system/system-param',
      meta: {
        title: '参数设置',
        keepAlive: true,
        roles: [BUILTIN_ROLE_CODES.PLATFORM_SUPER],
        authList: [
          { title: '新增', authMark: 'add' },
          { title: '编辑', authMark: 'edit' },
          { title: '删除', authMark: 'delete' }
        ]
      }
    },
    {
      path: 'user-center',
      name: 'UserCenter',
      component: '/system/user-center',
      meta: {
        title: 'menus.system.userCenter',
        isHide: true,
        keepAlive: true,
        isHideTab: true
      }
    },
    {
      path: 'menu',
      name: 'Menus',
      component: '/system/menu',
      meta: {
        title: 'menus.system.menu',
        keepAlive: true,
        roles: [BUILTIN_ROLE_CODES.PLATFORM_SUPER],
        authList: [
          { title: '新增', authMark: 'add' },
          { title: '编辑', authMark: 'edit' },
          { title: '删除', authMark: 'delete' }
        ]
      }
    }
  ]
}
