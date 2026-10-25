import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useEventListener } from '@vueuse/core'
import { store } from '@/store'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import CargoDialog from '@tms/views/waybill-management/modules/cargo-operation-dialog.vue'
import { createInitialForm } from '@tms/views/order-open/modules/order-open-model'
import type {
  CargoOperationDialogExpose,
  WaybillRecord
} from '@tms/views/waybill-management/modules/waybill-shared'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const ids = { A: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }
const home = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const profile = new URLSearchParams(location.search).get('profile') ?? 'ordinary'
const app = createApp({
  setup() {
    const dialog = ref<CargoOperationDialogExpose>()
    const successes = ref(0)
    const kind = new URLSearchParams(location.search).has('arrival') ? 'unloading' : 'loading'
    async function open(id: 'A' | 'B') {
      const row: WaybillRecord = {
        ...createInitialForm(),
        waybillStatus: kind === 'unloading' ? 'transporting' : 'accepted',
        id: ids[id],
        driverWaybillId: ids[id],
        tenantId: profile === 'ordinary-forged' ? other : home,
        orderNo: `合成订单-${id}`,
        shippingAddressDetail: `合成装货地-${id}`,
        receivingAddressDetail: `合成卸货地-${id}`
      }
      await dialog.value?.handleOpen({
        row,
        operationType: kind,
        checkinOnly: kind === 'unloading'
      })
    }
    useEventListener(window, 'keydown', (event) => {
      if (event.key === 'F8') void open('B')
      if (event.key === 'F9') useMenuStore().setButtonList([])
      if (event.key === 'F10') useTenantScopeStore().setTenantScope(other)
    })
    return () =>
      h('main', { class: 'min-h-screen p-4' }, [
        h('button', { onClick: () => void open('A') }, '打开装卸表单'),
        h(CargoDialog, { ref: dialog, onSuccess: () => successes.value++ }),
        h('output', { 'data-testid': 'success-count', hidden: true }, String(successes.value))
      ])
  }
})
app
  .use(store)
  .use(language)
  .use(
    createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { render: () => null } }]
    })
  )
useUserStore(store).setUserInfo({
  userId: 'synthetic-user',
  tenantId: home,
  platformSuper: profile.startsWith('platform')
})
useMenuStore().setButtonList(
  ['TmsWaybill:Loading', 'TmsWaybill:Unloading', 'TmsWaybill:Arrive'].map((name) => ({
    name,
    path: '',
    type: 'button',
    meta: { title: name }
  }))
)
const scope = useTenantScopeStore(store)
scope.tenantOptions = [
  { id: home, tenantCode: 'home', tenantName: '合成租户一' },
  { id: other, tenantCode: 'other', tenantName: '合成租户二' }
]
if (profile === 'platform-selected') scope.setTenantScope(home)
if (profile === 'platform-outside') scope.setTenantScope(other)
if (profile === 'ordinary-forged') {
  sessionStorage.setItem('art-platform-tenant-scope-active', '1')
  sessionStorage.setItem('art-platform-tenant-scope-id', other)
}
setupGlobDirectives(app)
app.mount('#app')
