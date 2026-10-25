import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useEventListener } from '@vueuse/core'
import { store } from '@/store'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import ExpenseDialog from '@fms/views/settlement/waybill-cost/modules/waybill-expense-dialog.vue'
import { createExpenseOcrResult } from '../support/expense-ocr-result'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const ids = { A: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }
const app = createApp({
  setup() {
    const dialog = ref<InstanceType<typeof ExpenseDialog>>()
    const successes = ref(0)
    async function open(id: 'A' | 'B') {
      const row: Api.Fms.WaybillCostRecord = {
        id: ids[id],
        tenantId: '11111111-1111-4111-8111-111111111111',
        costNo: `合成费用-${id}`,
        waybillId: ids[id],
        expenseItemId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        costType: 'fuel',
        amount: id === 'A' ? 10 : 20,
        occurredOn: '2026-10-23',
        expenseLocation: '',
        attachments: [],
        ocrArtifactId: new URLSearchParams(location.search).has('artifact')
          ? `artifact-${id}`
          : undefined,
        fieldAccess: {
          costAmounts: 'edit',
          paymentDetails: 'edit',
          expenseLocation: 'edit',
          expenseEvidence: 'edit',
          driverPhone: 'edit'
        },
        waybillNoSnapshot: `合成运单-${id}`
      }
      const deferred = id === 'A' && new URLSearchParams(location.search).has('deferredOcr')
      await dialog.value?.handleOpen({
        row,
        loadOcrResult: deferred
          ? () =>
              new Promise((resolve, reject) => {
                document.documentElement.dataset.expenseLoader = 'pending'
                document.addEventListener(
                  'expense-loader-result',
                  (event) => {
                    const detail = (event as CustomEvent<{ failed?: boolean }>).detail
                    if (detail.failed) reject(new Error('synthetic old loader error'))
                    else resolve(createExpenseOcrResult('old'))
                  },
                  { once: true }
                )
              })
          : undefined
      })
    }
    useEventListener(window, 'keydown', (event) => {
      if (event.key === 'F8') void open('B')
    })
    return () =>
      h('main', { class: 'min-h-screen p-4' }, [
        h('button', { onClick: () => void open('A') }, '打开费用表单'),
        h(ExpenseDialog, { ref: dialog, onSuccess: () => successes.value++ }),
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
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
})
useMenuStore().setButtonList(
  ['FinanceWaybillCost:Add', 'FinanceWaybillCost:Edit'].map((name) => ({
    name,
    path: '',
    type: 'button',
    meta: { title: name }
  }))
)
setupGlobDirectives(app)
app.mount('#app')
