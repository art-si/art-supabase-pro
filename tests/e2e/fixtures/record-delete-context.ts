import { createApp, defineComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import { useRecordDeleteGuard } from '@/hooks/core/useRecordDeleteGuard'
import { useSupplierDelete } from '@/hooks/core/useSupplierDelete'
import MasterDataDeleteGuard from '@/components/business/master-data-delete-guard/index.vue'
import VoucherTemplatePage from '../../../modules/art-supabase-fms/src/views/accounting/voucher-template/index.vue'
import AutoPostingPage from '../../../modules/art-supabase-fms/src/views/accounting/auto-posting/index.vue'
import FundAccountPage from '../../../modules/art-supabase-fms/src/views/treasury/fund-account/index.vue'
import AssetCategoryDrawer from '../../../modules/art-supabase-fms/src/views/specialized-accounting/fixed-asset/modules/asset-category-drawer.vue'
import FixedAssetPage from '../../../modules/art-supabase-fms/src/views/specialized-accounting/fixed-asset/index.vue'
import FixedAssetDialog from '../../../modules/art-supabase-fms/src/views/specialized-accounting/fixed-asset/modules/fixed-asset-dialog.vue'
import FundTransferPage from '../../../modules/art-supabase-fms/src/views/treasury/fund-transfer/index.vue'
import OpeningBalancePage from '../../../modules/art-supabase-fms/src/views/accounting/opening-balance/index.vue'
import ExpenseItemPage from '../../../modules/art-supabase-fms/src/views/settlement/expense-item/index.vue'
import AccountingAuxiliaryPage from '../../../modules/art-supabase-fms/src/views/accounting/accounting-auxiliary/index.vue'
import WaybillExpenseDialog from '../../../modules/art-supabase-fms/src/views/settlement/waybill-cost/modules/waybill-expense-dialog.vue'
import CurrencyDialog from '../../../modules/art-supabase-fms/src/views/accounting/accounting-currency/modules/currency-dialog.vue'
import SubjectDialog from '../../../modules/art-supabase-fms/src/views/accounting/accounting-subject/modules/subject-dialog.vue'
import StatementItemDialog from '../../../modules/art-supabase-fms/src/views/accounting/financial-reports/modules/statement-item-dialog.vue'
import AccountSetDialog from '../../../modules/art-supabase-fms/src/views/accounting/account-set/modules/account-set-dialog.vue'
import VoucherTemplateDialog from '../../../modules/art-supabase-fms/src/views/accounting/voucher-template/modules/voucher-template-dialog.vue'
import VoucherDialog from '../../../modules/art-supabase-fms/src/views/accounting/voucher-center/modules/voucher-dialog.vue'
import PostingRuleDialog from '../../../modules/art-supabase-fms/src/views/accounting/auto-posting/modules/posting-rule-dialog.vue'
import FundAccountDialog from '../../../modules/art-supabase-fms/src/views/treasury/fund-account/modules/fund-account-dialog.vue'
import AssetCategoryDialog from '../../../modules/art-supabase-fms/src/views/specialized-accounting/fixed-asset/modules/asset-category-dialog.vue'
import CommercialBillDialog from '../../../modules/art-supabase-fms/src/views/specialized-accounting/commercial-bill/modules/commercial-bill-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', name: 'DeleteContextTest', component: {} },
    { path: '/fms/specialized-accounting/fixed-asset', name: 'FinanceFixedAsset', component: {} }
  ]
})
const app = createApp(
  defineComponent({
    setup() {
      const table = ref('hr_recruitment_requisition')
      const label = ref('招聘需求')
      const deletedTable = ref('')
      const recordGuard = useRecordDeleteGuard(table, label)
      const supplierGuard = useSupplierDelete('MdmPurchaseSupplier:Delete')
      const params = new URLSearchParams(location.search)
      const assetCategoryRef = ref<{ handleOpen: (id?: string) => Promise<void> }>()
      const waybillExpenseRef = ref<{ handleOpen: () => Promise<void> }>()
      const currencyRef = ref<InstanceType<typeof CurrencyDialog>>()
      const subjectRef = ref<InstanceType<typeof SubjectDialog>>()
      const statementRef = ref<InstanceType<typeof StatementItemDialog>>()
      const accountSetRef = ref<InstanceType<typeof AccountSetDialog>>()
      const templateRef = ref<InstanceType<typeof VoucherTemplateDialog>>()
      const voucherRef = ref<InstanceType<typeof VoucherDialog>>()
      const postingRef = ref<InstanceType<typeof PostingRuleDialog>>()
      const fundAccountRef = ref<InstanceType<typeof FundAccountDialog>>()
      const categoryRef = ref<InstanceType<typeof AssetCategoryDialog>>()
      const fixedAssetRef = ref<InstanceType<typeof FixedAssetDialog>>()
      const billRef = ref<InstanceType<typeof CommercialBillDialog>>()
      const accountSet: Api.Fms.AccountSetOption = {
        value: 'cccccccc-cccc-4ccc-accc-cccccccccccc',
        label: '测试账套',
        tenantId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
        status: 'active'
      }
      const validationTarget = params.get('validationTarget')
      const editAsset: Api.Fms.FixedAssetRecord = {
        id: 'eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee',
        tenantId: accountSet.tenantId,
        accountSetId: accountSet.value,
        categoryId: 'dddddddd-dddd-4ddd-addd-dddddddddddd',
        assetNo: 'ASSET001',
        assetName: '测试编辑资产',
        status: 'draft',
        acquisitionDate: '2026-10-01',
        readyForUseDate: '2026-10-01',
        depreciationStartDate: '2026-10-01',
        usefulLifeMonths: 60,
        depreciatedMonths: 0,
        version: 1,
        createTime: '2026-10-01T00:00:00Z',
        updateTime: '2026-10-01T00:00:00Z'
      }
      function openValidationDialog(): void {
        if (validationTarget === 'voucher')
          void voucherRef.value?.handleOpen({
            accountSet,
            subjects: params.get('voucherTemplate')
              ? [
                  {
                    id: 'ffffffff-ffff-4fff-afff-ffffffffffff',
                    tenantId: accountSet.tenantId,
                    accountSetId: accountSet.value,
                    subjectCode: '1001',
                    subjectName: '测试现金',
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
                    createTime: '2026-10-01T00:00:00Z',
                    updateTime: '2026-10-01T00:00:00Z'
                  }
                ]
              : [],
            currencies: [],
            auxiliaryItems: [],
            templates: params.get('voucherTemplate')
              ? [
                  {
                    id: 'dddddddd-dddd-4ddd-addd-dddddddddddd',
                    tenantId: accountSet.tenantId,
                    accountSetId: accountSet.value,
                    templateCode: 'TEST',
                    templateName: '测试模板',
                    isEnabled: true,
                    sort: 1,
                    fieldAccess: { templateEntries: 'read' }
                  }
                ]
              : []
          })
        if (validationTarget === 'fixed-asset')
          void fixedAssetRef.value?.handleOpen(
            params.get('assetOperation') === 'edit' ? editAsset : undefined,
            accountSet.value
          )
        if (validationTarget === 'fund-account') void fundAccountRef.value?.handleOpen()
        if (validationTarget === 'category') void categoryRef.value?.handleOpen(accountSet.value)
        if (validationTarget === 'bill') void billRef.value?.handleOpen()
        if (validationTarget === 'currency') void currencyRef.value?.handleOpen(accountSet)
        if (validationTarget === 'subject') void subjectRef.value?.handleOpen(accountSet, [], [])
        if (validationTarget === 'statement')
          void statementRef.value?.handleOpen(accountSet.value, 'balance_sheet', [])
        if (validationTarget === 'account-set') void accountSetRef.value?.handleOpen()
        if (validationTarget === 'template')
          void templateRef.value?.handleOpen({
            accountSet,
            subjects: [],
            currencies: [],
            auxiliaryItems: []
          })
        if (validationTarget === 'posting')
          void postingRef.value?.handleOpen({ accountSet, subjects: [], auxiliaryTypes: [] })
      }
      const supplierMode = params.get('target') === 'supplier'
      const businessPageMode = [
        'voucher-template',
        'auto-posting',
        'fund-account',
        'fixed-asset',
        'fund-transfer',
        'opening-balance',
        'expense-item',
        'accounting-auxiliary',
        'waybill-expense',
        'asset-category'
      ].includes(params.get('target') ?? '')
      const deleteGuardRef = supplierMode
        ? supplierGuard.deleteGuardRef
        : recordGuard.deleteGuardRef
      return () =>
        h('main', { class: 'art-page-view', style: { height: '100vh', overflow: 'auto' } }, [
          validationTarget ? h('button', { onClick: openValidationDialog }, '打开校验表单') : null,
          params.get('assetPermission') === 'Add'
            ? h(
                'button',
                {
                  onClick: () =>
                    useMenuStore().setButtonList([
                      {
                        name: 'FinanceFixedAsset:Add',
                        path: '',
                        type: 'button',
                        meta: { title: '新增资产' }
                      }
                    ])
                },
                '恢复资产权限'
              )
            : null,
          validationTarget === 'fixed-asset' ? h(FixedAssetDialog, { ref: fixedAssetRef }) : null,
          validationTarget === 'fund-account'
            ? h(FundAccountDialog, { ref: fundAccountRef })
            : null,
          validationTarget === 'category' ? h(AssetCategoryDialog, { ref: categoryRef }) : null,
          validationTarget === 'bill' ? h(CommercialBillDialog, { ref: billRef }) : null,
          validationTarget === 'currency' ? h(CurrencyDialog, { ref: currencyRef }) : null,
          validationTarget === 'subject' ? h(SubjectDialog, { ref: subjectRef }) : null,
          validationTarget === 'statement' ? h(StatementItemDialog, { ref: statementRef }) : null,
          validationTarget === 'account-set' ? h(AccountSetDialog, { ref: accountSetRef }) : null,
          validationTarget === 'template' ? h(VoucherTemplateDialog, { ref: templateRef }) : null,
          validationTarget === 'voucher' ? h(VoucherDialog, { ref: voucherRef }) : null,
          validationTarget === 'posting' ? h(PostingRuleDialog, { ref: postingRef }) : null,
          params.get('target') === 'waybill-expense'
            ? h(
                'button',
                { onClick: () => void waybillExpenseRef.value?.handleOpen() },
                '打开运单费用'
              )
            : null,
          params.get('target') === 'asset-category'
            ? h(
                'button',
                { onClick: () => void assetCategoryRef.value?.handleOpen() },
                '打开资产类别'
              )
            : null,
          h(
            'button',
            {
              hidden: businessPageMode,
              'data-testid': 'revoke-delete-permission',
              onClick: () => {
                useUserStore(store).setUserInfo({
                  userId: 'context-test-user',
                  tenantId: 'context-test-tenant',
                  platformSuper: false
                })
                useMenuStore(store).setButtonList([])
              }
            },
            '撤销删除权限'
          ),
          h(
            'button',
            {
              hidden: businessPageMode,
              onClick: () => {
                table.value = 'hr_candidate'
                label.value = '候选人'
              }
            },
            '切换分类'
          ),
          h(
            'button',
            {
              hidden: businessPageMode,
              onClick: () => {
                if (supplierMode) {
                  void supplierGuard.removeSuppliers(
                    Array.from({ length: params.get('count') === '2' ? 2 : 1 }, (_, index) => ({
                      id:
                        index === 0
                          ? 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
                          : 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
                      supplierName: `测试供应商 ${index + 1}`,
                      supplierCode: `SUP-00${index + 1}`
                    })),
                    () => undefined
                  )
                  return
                }
                const targetTable = table.value
                void recordGuard.deleteRecord({
                  resource: {
                    id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
                    label: '招聘需求测试记录'
                  },
                  permission:
                    new URLSearchParams(location.search).get('permission') === 'empty'
                      ? []
                      : 'Hr:Recruitment:Delete',
                  remove: async () => {
                    deletedTable.value = targetTable
                    throw new Error('Concurrent reference change')
                  }
                })
              }
            },
            '删除记录'
          ),
          h(
            'output',
            { 'data-testid': 'deleted-table', hidden: businessPageMode },
            deletedTable.value
          ),
          h(
            'output',
            { 'data-testid': 'navigation-path', hidden: true },
            router.currentRoute.value.fullPath
          ),
          params.get('target') === 'voucher-template'
            ? h(VoucherTemplatePage)
            : params.get('target') === 'auto-posting'
              ? h(AutoPostingPage)
              : params.get('target') === 'fund-account'
                ? h(FundAccountPage)
                : params.get('target') === 'asset-category'
                  ? h(AssetCategoryDrawer, { ref: assetCategoryRef })
                  : params.get('target') === 'fixed-asset'
                    ? h(FixedAssetPage)
                    : params.get('target') === 'fund-transfer'
                      ? h(FundTransferPage)
                      : params.get('target') === 'opening-balance'
                        ? h(OpeningBalancePage)
                        : params.get('target') === 'expense-item'
                          ? h(ExpenseItemPage)
                          : params.get('target') === 'accounting-auxiliary'
                            ? h(AccountingAuxiliaryPage)
                            : params.get('target') === 'waybill-expense'
                              ? h(WaybillExpenseDialog, { ref: waybillExpenseRef })
                              : h(MasterDataDeleteGuard, { ref: deleteGuardRef })
        ])
    }
  })
)
app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)
const expensePermission = new URLSearchParams(location.search).get('expensePermission')
const assetPermission = new URLSearchParams(location.search).get('assetPermission')
const voucherPermission = new URLSearchParams(location.search).get('voucherPermission')
const auxiliaryPermission = new URLSearchParams(location.search).get('auxiliaryPermission')
const waybillExpensePermission = new URLSearchParams(location.search).get(
  'waybillExpensePermission'
)
useUserStore(store).setUserInfo({
  userId: 'context-test-user',
  tenantId: 'context-test-tenant',
  platformSuper:
    !expensePermission &&
    !assetPermission &&
    !voucherPermission &&
    !auxiliaryPermission &&
    !waybillExpensePermission &&
    new URLSearchParams(location.search).get('view') !== 'denied'
})
if (expensePermission) {
  useMenuStore(store).setButtonList([
    {
      name: `FinanceExpenseItem:${expensePermission}`,
      path: '',
      type: 'button',
      meta: { title: '费用项目操作' }
    }
  ])
}
if (voucherPermission)
  useMenuStore(store).setButtonList(
    voucherPermission.split(',').map((permission) => ({
      name: `FinanceVoucherCenter:${permission}`,
      path: '',
      type: 'button',
      meta: { title: '凭证操作' }
    }))
  )
if (assetPermission)
  useMenuStore(store).setButtonList([
    {
      name: `FinanceFixedAsset:${assetPermission}`,
      path: '',
      type: 'button',
      meta: { title: '资产操作' }
    }
  ])
if (waybillExpensePermission) {
  useMenuStore(store).setButtonList([
    {
      name: `FinanceWaybillCost:${waybillExpensePermission}`,
      path: '',
      type: 'button',
      meta: { title: '运单费用操作' }
    }
  ])
}
if (auxiliaryPermission) {
  useMenuStore(store).setButtonList(
    [auxiliaryPermission, 'AddType', 'EditType', 'DeleteType'].map((permission) => ({
      name: `FinanceAccountingAuxiliary:${permission}`,
      path: '',
      type: 'button',
      meta: { title: '辅助核算操作' }
    }))
  )
}
if (new URLSearchParams(location.search).get('view') === 'denied') {
  useMenuStore(store).setButtonList([
    {
      name: 'FinanceFixedAsset:ManageCategory',
      path: '',
      type: 'button',
      meta: { title: '资产类别维护' }
    }
  ])
}
await router.push('/')
await router.isReady()
app.mount('#record-delete-context')
