import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import TransportAgreementPage from '@tms/views/basic-data/transport-agreement/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const userStore = useUserStore(store)
userStore.setUserInfo({
  userId: 'transport-agreement-fixture',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
} as Api.Auth.UserInfo)
userStore.setLoginStatus(true)
userStore.setDictMap({
  vehicleType: [{ code: 'box_truck', value: 'box_truck', label: '厢式货车', status: '1' }],
  tmsTransportAgreementStatus: [
    { code: 'pending_signed', value: 'pending_signed', label: '待签署', status: '1' },
    { code: 'signed', value: 'signed', label: '已签署', status: '1' }
  ],
  tmsTransportAgreementApprovalStatus: [
    { code: 'draft', value: 'draft', label: '草稿', status: '1' },
    { code: 'approved', value: 'approved', label: '已通过', status: '1' }
  ]
})
useMenuStore(store).setButtonList(
  ['View', 'Add', 'Edit', 'Preview', 'Submit', 'Sign', 'Export', 'Delete'].map((action) => ({
    name: `TmsTransportAgreement:${action}`,
    path: '',
    type: 'button',
    meta: { title: action }
  }))
)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ name: 'TmsTransportAgreement', path: '/', component: TransportAgreementPage }]
})
const app = createApp({
  render: () =>
    h('main', { class: 'art-page-view h-screen min-w-0 p-4' }, [h(TransportAgreementPage)])
})
app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)
await router.push('/')
await router.isReady()
const startButton = document.querySelector<HTMLButtonElement>('#start-transport-agreement-upgrade')
startButton?.addEventListener('click', () => {
  app.mount('#transport-agreement-upgrade')
  startButton.remove()
})
if (startButton) startButton.disabled = false
