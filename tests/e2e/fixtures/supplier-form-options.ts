import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import SupplierDialog from '@mdm/views/purchase-master/supplier/modules/supplier-dialog.vue'
import ContactDialog from '@mdm/views/purchase-master/supplier/modules/supplier-contact-dialog.vue'
import BankDialog from '@mdm/views/purchase-master/supplier/modules/supplier-bank-dialog.vue'
import SupplierPage from '@mdm/views/purchase-master/supplier/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const supplier = ref<InstanceType<typeof SupplierDialog>>()
const contact = ref<InstanceType<typeof ContactDialog>>()
const bank = ref<InstanceType<typeof BankDialog>>()
const list = new URLSearchParams(location.search).has('list')
const app = createApp({
  render: () =>
    list
      ? h('main', { class: 'art-page-view h-screen p-4' }, [h(SupplierPage)])
      : h('main', { class: 'p-4' }, [
          h(
            'button',
            {
              type: 'button',
              onClick: () =>
                supplier.value?.handleOpen({
                  tenantId: 'test-tenant',
                  tenantOptions: [{ label: '测试租户', value: 'test-tenant' }],
                  groups: []
                })
            },
            '打开供应商'
          ),
          h(
            'button',
            {
              type: 'button',
              onClick: () => contact.value?.handleOpen({ supplierId: 'supplier-test' })
            },
            '打开联系人'
          ),
          h(
            'button',
            {
              type: 'button',
              onClick: () => bank.value?.handleOpen({ supplierId: 'supplier-test' })
            },
            '打开银行账户'
          ),
          h(SupplierDialog, { ref: supplier }),
          h(ContactDialog, { ref: contact }),
          h(BankDialog, { ref: bank })
        ])
})
app.use(store)
app.use(language)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: {} }]
  })
)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'supplier-form-test',
  tenantId: 'test-tenant',
  platformSuper: false
})
useMenuStore(store).setButtonList(
  ['View', 'Add', 'Edit', 'Export'].map((action) => ({
    name: `MdmPurchaseSupplier:${action}`,
    path: '',
    type: 'button',
    meta: { title: '测试权限' }
  }))
)
app.mount('#supplier-form-options')
