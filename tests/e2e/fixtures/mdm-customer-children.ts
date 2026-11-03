import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { setupGlobDirectives } from '@/directives'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import MasterDialog from '@mdm/views/components/operational-master/modules/master-dialog.vue'
import { resolveMasterConfig } from '@mdm/views/components/operational-master/modules/master-config'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const tenantId = '11111111-1111-4111-8111-111111111111'
const customerId = '11111111-1111-4111-8111-111111111201'
useUserStore(store).setUserInfo({ userId: 'mdm-customer-fixture', tenantId, platformSuper: false })
useMenuStore(store).setButtonList(
  [
    'MdmSalesCustomer:View',
    'MdmSalesCustomer:Edit',
    'MdmSalesCustomer:ContactAdd',
    'MdmSalesCustomer:ContactEdit',
    'MdmSalesCustomer:ContactCopy',
    'MdmSalesCustomer:ContactDelete',
    'MdmSalesCustomer:FinanceAdd',
    'MdmSalesCustomer:FinanceEdit',
    'MdmSalesCustomer:FinanceCopy',
    'MdmSalesCustomer:FinanceDelete'
  ].map((name) => ({ name, path: '', type: 'button', meta: { title: name } }))
)
const dialog = ref<InstanceType<typeof MasterDialog>>()
const row = {
  id: customerId,
  tenantId,
  customerCode: 'MDM-C-001',
  customerName: '验收客户甲',
  groupId: null,
  industry: 'technology',
  customerLevel: 'key',
  region: '上海市',
  addressDetail: '测试路 1 号',
  enabled: true,
  remark: '',
  fieldAccess: { contactPhone: 'edit', taxNo: 'edit', bankAccount: 'edit' } as const
}
const open = () =>
  dialog.value?.handleOpen({
    config: resolveMasterConfig('/mdm/sales-master/customer'),
    tenantId,
    tenantOptions: [{ label: '验收租户', value: tenantId }],
    groups: [],
    row
  })
const app = createApp({
  render: () =>
    h('main', { class: 'art-page-view min-h-screen p-4' }, [
      h('button', { type: 'button', onClick: open }, '编辑验收客户'),
      h(MasterDialog, { ref: dialog })
    ])
})
app.use(store)
app.use(language)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }]
})
app.use(router)
setupGlobDirectives(app)
await router.push('/mdm/sales-master/customer')
await router.isReady()
app.mount('#mdm-customer-children')
