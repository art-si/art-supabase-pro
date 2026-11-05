import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useMenuStore } from '@/store/modules/menu'
import { useSettingStore } from '@/store/modules/setting'
import { MenuTypeEnum } from '@/enums/app-enum'
import ArtSidebarMenu from '@/components/core/layouts/art-menus/art-sidebar-menu/index.vue'
import ArtApplicationSwitcher from '@/components/core/layouts/art-header-bar/widget/art-application-switcher.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'
import '@/components/core/layouts/art-menus/art-sidebar-menu/theme.scss'

const path = '/wms/inbound-business/purchase-inbound'
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    {
      path: '/scm',
      name: 'ScmRootPreview',
      component: RouterView,
      children: [
        {
          path: '/scm/purchase-management',
          name: 'ScmPurchaseManagementPreview',
          component: RouterView,
          children: [
            {
              path,
              name: 'WmsPurchaseInbound',
              component: { render: () => h('div', '采购入库单页面') }
            }
          ]
        }
      ]
    }
  ]
})

const app = createApp({
  render: () =>
    h('div', { class: 'flex min-h-screen' }, [
      h(ArtSidebarMenu),
      h('main', { class: 'p-8' }, [h(ArtApplicationSwitcher), h(RouterView)])
    ])
})
app.use(store)
app.use(language)
app.use(router)

useSettingStore().menuType = MenuTypeEnum.DUAL_MENU
useSettingStore().menuOpen = true
useMenuStore().setMenuList([
  {
    id: 'scm-root',
    name: 'ScmRootPreview',
    path: '/scm',
    component: '/index/index',
    meta: { title: 'SCM供应链管理', icon: 'ri:links-line' },
    children: [
      {
        id: 'scm-purchase',
        name: 'ScmPurchaseManagementPreview',
        path: '/scm/purchase-management',
        component: '',
        meta: { title: '采购管理', icon: 'ri:shopping-basket-line' },
        children: [
          {
            id: 'purchase-inbound',
            name: 'WmsPurchaseInbound',
            path,
            component: '/wms/inbound-business/purchase-inbound',
            meta: { title: '采购入库单', icon: 'ri:inbox-archive-line' }
          }
        ]
      }
    ]
  },
  {
    id: 'wms-root',
    name: 'WmsRootPreview',
    path: '/wms',
    component: '/index/index',
    meta: { title: 'WMS仓储管理', icon: 'ri:store-3-line' },
    children: []
  }
])

void router
  .push(path)
  .then(() => router.isReady())
  .then(() => app.mount('#menu-moved-route-preview'))
