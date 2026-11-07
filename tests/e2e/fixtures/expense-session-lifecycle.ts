import { createApp, getCurrentInstance, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useEventListener } from '@vueuse/core'
import { store } from '@/store'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { writePlatformTenantScopeActive } from '@/utils/tenant-scope-context'
import ExpenseDialog from '@fms/views/settlement/waybill-cost/modules/waybill-expense-dialog.vue'
import ArtTable from '@/components/core/tables/art-table/index.vue'
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
      const params = new URLSearchParams(location.search)
      if (params.has('lineValidation') || params.has('artifact')) {
        Object.assign(row, {
          expenseLocation: '合成发生地点',
          expenseLongitude: 116.4,
          expenseLatitude: 39.9,
          expenseCoordinateSystem: 'gcj02',
          expenseCoordinateSource: 'import',
          expenseCoordinateStatus: 'located'
        })
      }
      if (new URLSearchParams(location.search).has('optionRaces')) {
        row.waybill = {
          id: ids[id],
          waybillNo: `合成运单-${id}`,
          status: 'completed',
          tenantId: row.tenantId,
          driverId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          driver: {
            id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            driverName: '合成司机',
            phone: ''
          }
        }
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
      if (event.key === 'F7') useMenuStore().setButtonList([])
      if (event.key === 'F6') {
        const scope = useTenantScopeStore(store)
        scope.setTenantScope('22222222-2222-4222-8222-222222222222')
        document.documentElement.dataset.expenseScope = scope.selectedTenantId ?? 'all'
      }
    })
    return () =>
      h('main', { class: 'min-h-screen p-4' }, [
        h('button', { onClick: () => void open('A') }, '打开费用表单'),
        h(ExpenseDialog, { ref: dialog, onSuccess: () => successes.value++ }),
        h('output', { 'data-testid': 'success-count', hidden: true }, String(successes.value))
      ])
  }
})
if (new URLSearchParams(location.search).has('lineValidation')) {
  let holdValidation = true
  app.mixin({
    beforeMount() {
      const instance = getCurrentInstance()
      if (instance?.type !== ArtTable) return
      const columns: unknown = instance.props.columns
      if (!Array.isArray(columns)) return
      const amountColumn = columns.find(
        (column: unknown): column is Record<string, unknown> =>
          typeof column === 'object' &&
          column !== null &&
          'prop' in column &&
          column.prop === 'amount'
      )
      if (!amountColumn) return
      const existingRules: unknown = amountColumn.rules
      amountColumn.rules = [
        ...(Array.isArray(existingRules) ? existingRules : existingRules ? [existingRules] : []),
        {
          validator: () => {
            if (!holdValidation) return true
            holdValidation = false
            document.documentElement.dataset.lineValidation = 'pending'
            return new Promise<boolean>((resolve) => {
              document.addEventListener(
                'expense-line-validation-result',
                (event) => {
                  const detail: unknown = event instanceof CustomEvent ? event.detail : undefined
                  const valid =
                    typeof detail === 'object' && detail !== null && 'valid' in detail
                      ? detail.valid === true
                      : true
                  document.documentElement.dataset.lineValidation = 'resolved'
                  resolve(valid)
                },
                { once: true }
              )
            })
          }
        }
      ]
    }
  })
}
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
  platformSuper: new URLSearchParams(location.search).has('platformScope')
})
if (new URLSearchParams(location.search).has('platformScope')) {
  const scope = useTenantScopeStore(store)
  scope.selectedTenantId = null
  scope.scopeOwnerUserId = 'synthetic-user'
  scope.tenantOptions = [
    {
      id: '11111111-1111-4111-8111-111111111111',
      tenantCode: 'A',
      tenantName: '合成租户 A'
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      tenantCode: 'B',
      tenantName: '合成租户 B'
    }
  ]
  writePlatformTenantScopeActive(true)
}
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
