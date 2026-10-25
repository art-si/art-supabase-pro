import { createApp, defineComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import InvoiceDetail from '@fms/views/settlement/invoice-management/modules/invoice-detail-drawer.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const invoice: Api.Fms.InvoiceRecord = {
  id: 'invoice-format-test',
  tenantId: '11111111-1111-4111-8111-111111111111',
  invoiceRecordNo: 'FORMAT-001',
  direction: 'output',
  invoiceType: 'electronic',
  counterpartyNameSnapshot: '测试往来单位',
  issueDate: '2026-10-09',
  status: 'draft',
  statementCount: 0,
  createTime: '2026-10-09T00:00:00Z',
  updateTime: '2026-10-09T00:00:00Z'
}
const app = createApp(
  defineComponent({
    setup() {
      const drawer = ref<InstanceType<typeof InvoiceDetail>>()
      return () =>
        h('main', { class: 'art-page-view p-4' }, [
          h(
            'button',
            { type: 'button', onClick: () => void drawer.value?.handleOpen(invoice) },
            '打开格式化发票'
          ),
          h(InvoiceDetail, { ref: drawer })
        ])
    }
  })
)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: { render: () => null } }]
})
app.use(store)
app.use(language)
app.use(router)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'format-test',
  tenantId: invoice.tenantId,
  platformSuper: false
})
await router.push('/')
await router.isReady()
app.mount('#app')
