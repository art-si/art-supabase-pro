import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { useSettingStore } from '@/store/modules/setting'
import { initializeTheme } from '@/hooks/core/useTheme'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import ContractPage from '@tms/views/basic-data/contract/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const customerId = '11111111-1111-4111-8111-111111111112'
const tenantId = '11111111-1111-4111-8111-111111111111'
const params = new URLSearchParams(location.search)
const embedded = !params.has('standalone')
const actions = params.has('copyOnly')
  ? ['View', 'Copy']
  : ['View', 'Add', 'Edit', 'Delete', 'Import', 'Export', 'Copy', 'Submit', 'Terminate']
const app = createApp({
  render: () =>
    h(
      'main',
      { class: embedded ? undefined : 'art-page-view', style: { '--art-full-height': '100dvh' } },
      h(ElConfigProvider, { locale: zhCn }, () =>
        h(ContractPage, embedded ? { customerId, customerTenantId: tenantId, embedded } : {})
      )
    )
})
app.use(store)
useUserStore(store).setUserInfo({
  userId: 'contract-fixture',
  tenantId,
  platformSuper: false
} as Api.Auth.UserInfo)
useMenuStore(store).setButtonList(
  actions.map((action) => ({
    name: `TmsContract:${action}`,
    path: '',
    type: 'button',
    meta: { title: action }
  }))
)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    {
      path: '/tms/basic-data/contract',
      name: 'TmsContract',
      component: { template: '<div />' }
    }
  ]
})
app.use(router)
app.use(language)
initializeTheme()
document.documentElement.dataset.boxMode = useSettingStore(store).boxBorderMode
  ? 'border-mode'
  : 'shadow-mode'
setupGlobDirectives(app)
if (!embedded) await router.push('/tms/basic-data/contract')
app.mount('#contract-customer-tab')
