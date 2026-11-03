import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import PartsPage from '@vms/views/basic-info/parts/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const userStore = useUserStore(store)
userStore.setUserInfo({
  userId: '00000000-0000-4000-8000-000000000001',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false,
  roles: ['R_USER']
})
userStore.setLoginStatus(true)
userStore.setDictMap({
  status: [
    { value: '1', label: '启用', status: '1' },
    { value: '0', label: '停用', status: '1' }
  ],
  commonBoolean: [
    { value: 'true', label: '是', status: '1' },
    { value: 'false', label: '否', status: '1' }
  ]
})
useMenuStore(store).setButtonList(
  ['Parts:View', 'Parts:Add', 'Parts:Edit', 'Parts:Delete', 'Parts:Import', 'Parts:Export'].map(
    (name) => ({ name, path: '', type: 'button', meta: { title: name } })
  )
)

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    {
      path: '/vms/basic-info/parts',
      component: { render: () => null }
    }
  ]
})
const app = createApp({
  render: () =>
    h(ElConfigProvider, { locale: zhCn }, () =>
      h(
        'main',
        {
          class: 'art-page-view h-screen p-4',
          style: { '--art-full-height': 'calc(100vh - 32px)' }
        },
        [h(PartsPage)]
      )
    )
})
app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)
void router.push('/vms/basic-info/parts')
app.mount('#vms-parts-master')
