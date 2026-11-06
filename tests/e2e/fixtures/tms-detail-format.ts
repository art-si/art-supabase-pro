import { createApp, h, nextTick, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import Customer from '@tms/views/basic-data/customer-price-detail/index.vue'
import CarrierMaster from '@tms/views/basic-data/carrier/modules/carrier-detail-dialog.vue'
import Carrier from '@tms/views/basic-data/carrier-price-detail/index.vue'
import Contract from '@tms/views/basic-data/contract-detail/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const kind = new URLSearchParams(location.search).get('kind')
const component =
  kind === 'carrier-master'
    ? CarrierMaster
    : kind === 'customer'
      ? Customer
      : kind === 'carrier'
        ? Carrier
        : Contract
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/detail/:id', component: { render: () => null } },
    { path: '/:pathMatch(.*)*', component: { render: () => null } }
  ]
})
const carrierMasterRef = ref<InstanceType<typeof CarrierMaster>>()
const app = createApp({ render: () => h(component, { ref: carrierMasterRef }) })
app.use(store)
useUserStore(store).setUserInfo({
  userId: 'format-test',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
})
app.use(language)
app.use(router)
setupGlobDirectives(app)
await router.push('/detail/format-test')
await router.isReady()
app.mount('#app')
if (kind === 'carrier-master') {
  await nextTick()
  await carrierMasterRef.value?.handleOpen('format-test')
}
