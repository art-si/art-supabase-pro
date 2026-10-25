import { createApp } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { store } from '@/store'
import StatementRuleDialog from '../../../modules/art-supabase-fms/src/views/accounting/financial-reports/modules/statement-rule-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const app = createApp(StatementRuleDialog)
app.use(store)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }]
  })
)
app.use(language)
setupGlobDirectives(app)

const dialog = app.mount('#fms-statement-rule-preview') as unknown as {
  handleOpen: (
    item: Api.Fms.FinancialStatementItemRecord,
    statementItems: Api.Fms.FinancialStatementItemRecord[],
    subjectList: Api.Fms.SubjectRecord[],
    canEdit: boolean
  ) => Promise<void>
}
const item = {
  id: '11111111-1111-4111-8111-111111111111',
  itemCode: 'BS510',
  itemName: '货币资金',
  statementType: 'balance_sheet',
  calculationMethod: 'mapping',
  isEnabled: true,
  mappings: []
} as Api.Fms.FinancialStatementItemRecord
const subjects = [
  {
    id: '22222222-2222-4222-8222-222222222222',
    subjectCode: '1001',
    subjectName: '库存现金',
    isEnabled: true
  } as Api.Fms.SubjectRecord
]

void dialog.handleOpen(item, [item], subjects, true)
