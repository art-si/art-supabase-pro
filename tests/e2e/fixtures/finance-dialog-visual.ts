import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { setupGlobDirectives } from '@/directives'
import FreightDialog from '@tms/views/order-list/modules/freight-dialog.vue'
import WaybillExpenseDialog from '@fms/views/settlement/waybill-cost/modules/waybill-expense-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const tenantId = '11111111-1111-4111-8111-111111111111'
const selectedTenantId = '22222222-2222-4222-8222-222222222222'
const tenantScopeMode = new URLSearchParams(location.search).get('tenantScope')
useUserStore(store).setUserInfo({
  userId: 'finance-dialog-visual',
  tenantId,
  platformSuper: tenantScopeMode === 'all' || tenantScopeMode === 'selected'
})
useTenantScopeStore(store).selectedTenantId =
  tenantScopeMode === 'selected' ? selectedTenantId : null
useMenuStore(store).setButtonList(
  ['TmsOrderList:EditFreight', 'FinanceWaybillCost:Add', 'FinanceWaybillCost:Edit'].map((name) => ({
    name,
    path: '',
    type: 'button',
    meta: { title: name }
  }))
)

const freightDialogRef = ref<InstanceType<typeof FreightDialog>>()
const waybillExpenseDialogRef = ref<InstanceType<typeof WaybillExpenseDialog>>()
const order = {
  id: '11111111-1111-4111-8111-111111111201',
  orderNo: 'DD-ABNORMAL-001',
  waybillNo: 'YD-LOADED-001',
  originStation: '上海站',
  destinationStation: '苏州站',
  dispatchDriverName: '验收司机甲',
  dispatchPlateNo: '测A12345'
} as Parameters<InstanceType<typeof FreightDialog>['handleOpen']>[0]

const app = createApp({
  render: () =>
    h('main', { class: 'art-page-view min-h-screen p-4' }, [
      h(
        'button',
        { type: 'button', onClick: () => void freightDialogRef.value?.handleOpen(order) },
        '打开异常运费'
      ),
      h(
        'button',
        {
          type: 'button',
          onClick: () =>
            void waybillExpenseDialogRef.value?.handleOpen({
              orderId: '11111111-1111-4111-8111-111111111201'
            })
        },
        '打开运单费用'
      ),
      h(FreightDialog, { ref: freightDialogRef }),
      h(WaybillExpenseDialog, { ref: waybillExpenseDialogRef })
    ])
})
app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
app.mount('#finance-dialog-visual')
