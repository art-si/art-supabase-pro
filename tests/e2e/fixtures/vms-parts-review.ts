import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const page = {
  name: 'VehiclePartsManage',
  path: '/vms/vehicle-manage/part-manage',
  component: () => import('@vms/views/vehicle-manage/part-manage/index.vue')
}
useUserStore(store).setUserInfo({
  userId: 'vms-parts-review',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
})
useMenuStore(store).setButtonList(
  [
    'VmsPartIssue:View',
    'VmsPartIssue:Add',
    'VmsPartInventory:View',
    'VmsPartInventory:Receipt'
  ].map((name) => ({ name, path: '', type: 'button', meta: { title: name } }))
)
const router = createRouter({ history: createMemoryHistory(), routes: [page] })
const app = createApp({
  render: () =>
    h(ElConfigProvider, { locale: zhCn }, () =>
      h(
        'main',
        { class: 'art-page-view h-screen p-4', style: { background: 'var(--el-bg-color-page)' } },
        [h(RouterView)]
      )
    )
})
app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)
await router.push(page.path)
await router.isReady()
app.mount('#vms-parts-review')
