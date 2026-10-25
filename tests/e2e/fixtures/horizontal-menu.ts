import { createApp, h } from 'vue'
import language from '@/locales'
import { store } from '@/store'
import { router } from '@/router'
import { RouterView } from 'vue-router'
import type { AppRouteRecord } from '@/types/router'
import ArtHorizontalMenu from '@/components/core/layouts/art-menus/art-horizontal-menu/index.vue'
import ArtMixedMenu from '@/components/core/layouts/art-menus/art-mixed-menu/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const hidden: AppRouteRecord = {
  name: 'HiddenPreview',
  path: '/preview-hidden',
  component: '/preview-hidden',
  meta: { title: '隐藏详情', isHide: true }
}
const items: AppRouteRecord[] = [
  {
    name: 'GroupPreview',
    path: '/preview-group',
    component: '',
    meta: { title: '业务分组', icon: 'ri:folder-line' },
    children: [
      {
        name: 'SectionPreview',
        path: '/preview-section',
        component: '',
        meta: { title: '二级分组', icon: 'ri:folder-line' },
        children: [
          {
            name: 'LeafPreview',
            path: '/preview-leaf',
            component: '/preview-leaf',
            meta: { title: '三级业务页面', icon: 'ri:file-list-line', showTextBadge: 'Beta' }
          },
          hidden
        ]
      }
    ]
  },
  {
    name: 'ParentPreview',
    path: '/preview-parent',
    component: '/preview-parent',
    meta: { title: '父级业务页面', icon: 'ri:home-line' },
    children: [hidden]
  },
  {
    name: 'EmptyPreview',
    path: '/preview-empty',
    component: '',
    meta: { title: '空业务目录' },
    children: [hidden]
  }
]
for (const [path, title] of [
  ['/preview-home', '导航预览首页'],
  ['/preview-leaf', '三级页面已打开'],
  ['/preview-parent', '父级页面已打开']
]) {
  router.addRoute({ path, component: { render: () => h('p', title) } })
}
const app = createApp({
  render: () =>
    h('main', { class: 'p-4' }, [
      h(new URLSearchParams(location.search).has('mixed') ? ArtMixedMenu : ArtHorizontalMenu, {
        list: items
      }),
      h(RouterView)
    ])
})
app.use(store)
app.use(language)
await router.replace('/preview-home')
app.use(router)
app.mount('#horizontal-menu-preview')
