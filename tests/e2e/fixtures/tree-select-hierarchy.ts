import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import WarehouseDialog from '@mdm/views/inventory-master/warehouse-definition/modules/warehouse-dialog.vue'
import SubjectDialog from '@fms/views/accounting/accounting-subject/modules/subject-dialog.vue'
import VoucherEntryLines from '@fms/views/modules/voucher-entry-lines.vue'
import type { WarehouseGroup } from '@mdm/api'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const tenantId = 'tree-tenant'
const mode = new URLSearchParams(location.search).get('mode') ?? 'warehouse'
const warehouse = ref<InstanceType<typeof WarehouseDialog>>()
const subject = ref<InstanceType<typeof SubjectDialog>>()
const groups: WarehouseGroup[] = [
  {
    id: 'group-root',
    tenantId,
    domain: 'warehouse',
    parentId: null,
    code: 'ROOT',
    name: '仓库总组',
    enabled: true,
    sort: 1
  },
  {
    id: 'group-child',
    tenantId,
    domain: 'warehouse',
    parentId: 'group-root',
    code: 'RAW',
    name: '原料仓组',
    enabled: true,
    sort: 2
  }
]
const subjectBase: Api.Fms.SubjectRecord = {
  id: 'subject-root',
  tenantId,
  accountSetId: 'tree-account',
  parentId: null,
  subjectCode: '1001',
  subjectName: '现金总科目',
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
  createTime: '',
  updateTime: ''
}
const subjects: Api.Fms.SubjectRecord[] = [
  subjectBase,
  {
    ...subjectBase,
    id: 'subject-current',
    parentId: subjectBase.id,
    subjectCode: '100101',
    subjectName: '当前现金科目',
    level: 2
  },
  {
    ...subjectBase,
    id: 'subject-descendant',
    parentId: 'subject-current',
    subjectCode: '10010101',
    subjectName: '现金明细科目',
    level: 3
  },
  {
    ...subjectBase,
    id: 'subject-sibling',
    parentId: subjectBase.id,
    subjectCode: '100102',
    subjectName: '备用现金科目',
    level: 2
  }
]
const lines = ref<Api.Fms.VoucherLineRecord[]>([
  {
    lineNo: 1,
    summary: '层级验收',
    subjectId: 'subject-sibling',
    auxiliaryValues: { stale: 'stale' },
    exchangeRate: 2,
    originalAmount: 20,
    quantity: 3,
    debitAmount: 10,
    creditAmount: 0
  }
])
function open() {
  if (mode === 'warehouse') void warehouse.value?.handleOpen({ tenantId, groups })
  else
    void subject.value?.handleOpen(
      { label: '验收账套', value: 'tree-account', status: 'active', tenantId },
      subjects,
      [],
      mode === 'subject-edit' ? subjects[1] : undefined
    )
}
const app = createApp({
  render: () =>
    h(ElConfigProvider, { locale: zhCn }, () =>
      h('main', { class: 'h-screen p-6' }, [
        mode === 'voucher'
          ? h(VoucherEntryLines, {
              modelValue: lines.value,
              'onUpdate:modelValue': (value: Api.Fms.VoucherLineRecord[]) => {
                lines.value = value
              },
              subjects,
              currencies: [],
              auxiliaryItems: []
            })
          : h('button', { type: 'button', onClick: open }, '打开层级表单'),
        mode === 'warehouse'
          ? h(WarehouseDialog, { ref: warehouse })
          : mode !== 'voucher'
            ? h(SubjectDialog, { ref: subject })
            : null,
        mode === 'voucher'
          ? h('output', { 'data-testid': 'voucher-model' }, JSON.stringify(lines.value[0]))
          : null
      ])
    )
})
app
  .use(store)
  .use(language)
  .use(
    createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:pathMatch(.*)*', component: {} }]
    })
  )
setupGlobDirectives(app)
useUserStore(store).setUserInfo({ userId: 'tree-test-user', tenantId, platformSuper: false })
app.mount('#tree-select-hierarchy')
