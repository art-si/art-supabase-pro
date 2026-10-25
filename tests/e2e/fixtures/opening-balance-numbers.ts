import { createApp, defineComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import OpeningBalanceDialog from '../../../modules/art-supabase-fms/src/views/accounting/opening-balance/modules/opening-balance-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const mode = new URLSearchParams(location.search).get('mode')
const subject: Api.Fms.SubjectRecord = {
  id: 'test-subject',
  tenantId: 'test-tenant',
  accountSetId: 'test-account-set',
  subjectCode: '1001',
  subjectName: '库存现金',
  category: 'asset',
  balanceDirection: 'debit',
  level: 1,
  isSystem: false,
  isEnabled: true,
  allowQuantity: false,
  allowForeignCurrency: false,
  allowPeriodEndRevaluation: false,
  cashFlowRequired: false,
  sort: 1,
  createTime: '2026-10-07T00:00:00Z',
  updateTime: '2026-10-07T00:00:00Z'
}
const row: Api.Fms.OpeningBalanceRecord = {
  id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  accountSetId: 'test-account-set',
  fiscalYear: 2026,
  subjectId: 'test-subject',
  subject,
  openingDebit: mode === 'missing' ? null : mode === 'zero' ? 0 : '12.50',
  yearToDateDebit: mode === 'missing' ? undefined : mode === 'zero' ? 0 : '12.50',
  yearToDateCredit: mode === 'missing' ? '' : mode === 'zero' ? 0 : '12.50',
  fieldAccess: {
    balanceAmounts: mode === 'readonly' || mode === 'auxiliary-only' ? 'read' : 'edit',
    auxiliaryDetails: mode === 'auxiliary-only' ? 'edit' : 'hidden'
  }
}
const app = createApp(
  defineComponent({
    setup() {
      const dialog = ref<InstanceType<typeof OpeningBalanceDialog>>()
      return () =>
        h('main', [
          h('button', {
            hidden: true,
            'data-testid': 'revoke-save-permission',
            onClick: () => {
              useUserStore(store).setUserInfo({
                userId: 'test-user',
                tenantId: 'test-tenant',
                platformSuper: false
              })
              useMenuStore(store).setButtonList([])
            }
          }),
          h(
            'button',
            {
              type: 'button',
              onClick: () =>
                void dialog.value?.handleOpen(
                  {
                    label: '测试账套',
                    value: row.accountSetId,
                    tenantId: 'test-tenant',
                    status: 'active'
                  },
                  2026,
                  { subjects: [subject], currencies: [], auxiliaryTypes: [], auxiliaryItems: [] },
                  mode === 'create' ? undefined : row
                )
            },
            '打开期初余额'
          ),
          h(OpeningBalanceDialog, { ref: dialog })
        ])
    }
  })
)
app.use(store)
useUserStore(store).setUserInfo({
  userId: 'test-user',
  tenantId: 'test-tenant',
  platformSuper: false
})
useMenuStore(store).setButtonList(
  mode === 'denied'
    ? []
    : [
        {
          name: mode === 'create' ? 'FinanceOpeningBalance:Add' : 'FinanceOpeningBalance:Edit',
          path: '',
          type: 'button',
          meta: { title: '期初余额操作' }
        }
      ]
)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
app.mount('#preview')
