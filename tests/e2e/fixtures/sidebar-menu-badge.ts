import { createApp, h } from 'vue'
import { ElMenu } from 'element-plus'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useSettingStore } from '@/store/modules/setting'
import type { AppRouteRecord } from '@/types/router'
import SidebarSubmenu from '@/components/core/layouts/art-menus/art-sidebar-menu/widget/sidebar-submenu.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'
import '@/components/core/layouts/art-menus/art-sidebar-menu/theme.scss'

const routes: AppRouteRecord[] = [
  {
    name: 'LongMenuPreview',
    path: '/preview-long-menu',
    component: '/preview-long-menu',
    meta: {
      title: '企业项目管理与跨部门业务协作综合工作台',
      icon: 'ri:home-line',
      showTextBadge: 'Beta'
    }
  },
  {
    name: 'ShortMenuPreview',
    path: '/preview-short-menu',
    component: '/preview-short-menu',
    meta: { title: '工作台', icon: 'ri:home-line' }
  },
  {
    name: 'NestedMenuPreview',
    path: '/preview-nested',
    component: '',
    meta: { title: '业务分组', icon: 'ri:folder-line' },
    children: [
      {
        name: 'NestedSectionPreview',
        path: '/preview-nested/section',
        component: '',
        meta: { title: '二级分组', icon: 'ri:folder-line' },
        children: [
          {
            name: 'NestedLeafPreview',
            path: '/preview-nested/section/leaf',
            component: '/preview-nested/section/leaf',
            meta: { title: '三级业务页面', icon: 'ri:file-list-line' }
          }
        ]
      }
    ]
  }
]

const app = createApp({
  render: () =>
    h('main', { class: 'layout-sidebar p-2', style: { width: '230px' } }, [
      h(ElMenu, { class: 'el-menu-design', defaultActive: '/preview-long-menu' }, () =>
        h(SidebarSubmenu, { list: routes })
      )
    ])
})
app.use(store)
useSettingStore().menuOpen = true
app.use(language)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { render: () => null } }]
  })
)
app.mount('#menu-preview')
