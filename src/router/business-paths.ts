export const FMS_ROOT_PATH = '/fms'
export const TMS_ROOT_PATH = '/tms'
export const VMS_ROOT_PATH = '/vms'
export const WMS_FINISHED_INBOUND_PATH = '/wms/production-inout/finished-inbound'

const LEGACY_FMS_ROOT_PATH = '/finance'
const LEGACY_TMS_ROOT_PATH = '/tms-transportation'
const LEGACY_VMS_ROOT_PATH = '/vehicle-manage-system'
const LEGACY_TMS_FINANCE_ROOT_PATH = `${LEGACY_TMS_ROOT_PATH}/finance-center`

export const financePaths = {
  workbench: `${FMS_ROOT_PATH}/workbench`,
  settlement: `${FMS_ROOT_PATH}/settlement`,
  customerSettlement: `${FMS_ROOT_PATH}/settlement/customer-settlement`,
  carrierSettlement: `${FMS_ROOT_PATH}/settlement/carrier-settlement`,
  paymentApplication: `${FMS_ROOT_PATH}/settlement/payment-application`,
  cashTransaction: `${FMS_ROOT_PATH}/settlement/cash-transaction`,
  invoiceManagement: `${FMS_ROOT_PATH}/settlement/invoice-management`,
  waybillCost: `${FMS_ROOT_PATH}/settlement/waybill-cost`,
  everyoneExpense: `${FMS_ROOT_PATH}/everyone-expense`,
  payeeInformation: `${FMS_ROOT_PATH}/everyone-expense/payee-information`,
  travelApplication: `${FMS_ROOT_PATH}/everyone-expense/travel-application`,
  loanApplication: `${FMS_ROOT_PATH}/everyone-expense/loan-application`,
  expenseReimbursement: `${FMS_ROOT_PATH}/everyone-expense/expense-reimbursement`,
  repayment: `${FMS_ROOT_PATH}/everyone-expense/repayment`,
  accountsReceivable: `${FMS_ROOT_PATH}/accounts-receivable`,
  estimatedReceivable: `${FMS_ROOT_PATH}/accounts-receivable/estimated-receivable`,
  financialReceivable: `${FMS_ROOT_PATH}/accounts-receivable/financial-receivable`,
  receipt: `${FMS_ROOT_PATH}/accounts-receivable/receipt`,
  receiptRefund: `${FMS_ROOT_PATH}/accounts-receivable/receipt-refund`,
  receiptWriteoff: `${FMS_ROOT_PATH}/accounts-receivable/receipt-writeoff`,
  revenueCost: `${FMS_ROOT_PATH}/accounts-receivable/revenue-cost`,
  receivableReport: `${FMS_ROOT_PATH}/accounts-receivable/receivable-report`,
  receivablePaymentRequest: `${FMS_ROOT_PATH}/accounts-receivable/payment-request`,
  accountsPayable: `${FMS_ROOT_PATH}/accounts-payable`,
  estimatedPayable: `${FMS_ROOT_PATH}/accounts-payable/estimated-payable`,
  financialPayable: `${FMS_ROOT_PATH}/accounts-payable/purchase-payable`,
  payableApplication: `${FMS_ROOT_PATH}/accounts-payable/payment-application`,
  payablePayment: `${FMS_ROOT_PATH}/accounts-payable/payment`,
  payableRefund: `${FMS_ROOT_PATH}/accounts-payable/payment-refund`,
  payableWriteoff: `${FMS_ROOT_PATH}/accounts-payable/writeoff`,
  waybillProfit: `${FMS_ROOT_PATH}/settlement/waybill-profit`,
  expenseItem: `${FMS_ROOT_PATH}/settlement/expense-item`,
  assetPayable: `${FMS_ROOT_PATH}/settlement/asset-payable`,
  receivableAging: `${FMS_ROOT_PATH}/settlement/receivable-aging`,
  accounting: `${FMS_ROOT_PATH}/accounting`,
  accountSet: `${FMS_ROOT_PATH}/accounting/account-set`,
  accountingSubject: `${FMS_ROOT_PATH}/accounting/accounting-subject`,
  accountingAuxiliary: `${FMS_ROOT_PATH}/accounting/accounting-auxiliary`,
  accountingCurrency: `${FMS_ROOT_PATH}/accounting/accounting-currency`,
  openingBalance: `${FMS_ROOT_PATH}/accounting/opening-balance`,
  voucherCenter: `${FMS_ROOT_PATH}/accounting/voucher-center`,
  voucherTemplate: `${FMS_ROOT_PATH}/accounting/voucher-template`,
  autoPosting: `${FMS_ROOT_PATH}/accounting/auto-posting`,
  ledgerCenter: `${FMS_ROOT_PATH}/accounting/ledger-center`,
  financialReports: `${FMS_ROOT_PATH}/accounting/financial-reports`,
  commercialBill: `${FMS_ROOT_PATH}/specialized-accounting/commercial-bill`,
  fixedAsset: `${FMS_ROOT_PATH}/specialized-accounting/fixed-asset`,
  payroll: `${FMS_ROOT_PATH}/specialized-accounting/payroll`,
  taxManagement: `${FMS_ROOT_PATH}/specialized-accounting/tax-management`,
  periodClose: `${FMS_ROOT_PATH}/specialized-accounting/period-close`,
  treasury: `${FMS_ROOT_PATH}/treasury`,
  fundAccount: `${FMS_ROOT_PATH}/treasury/fund-account`,
  fundTransfer: `${FMS_ROOT_PATH}/treasury/fund-transfer`,
  bankReconciliation: `${FMS_ROOT_PATH}/treasury/bank-reconciliation`,
  fundJournal: `${FMS_ROOT_PATH}/treasury/fund-journal`,
  cashForecast: `${FMS_ROOT_PATH}/treasury/cash-forecast`,
  exceptionCenter: `${FMS_ROOT_PATH}/exception-center`
} as const

export const financeRouteNames = {
  root: 'FinanceCenter',
  workbench: 'FinanceWorkbench',
  accountSet: 'FinanceAccountSet',
  accountingSubject: 'FinanceAccountingSubject',
  accountingAuxiliary: 'FinanceAccountingAuxiliary',
  accountingCurrency: 'FinanceAccountingCurrency',
  openingBalance: 'FinanceOpeningBalance',
  voucherCenter: 'FinanceVoucherCenter',
  voucherTemplate: 'FinanceVoucherTemplate',
  autoPosting: 'FinanceAutoPosting',
  ledgerCenter: 'FinanceLedgerCenter',
  financialReports: 'FinanceFinancialReports',
  commercialBill: 'FinanceCommercialBill',
  fixedAsset: 'FinanceFixedAsset',
  payroll: 'FinancePayroll',
  taxManagement: 'FinanceTaxManagement',
  periodClose: 'FinancePeriodClose',
  fundAccount: 'FinanceFundAccount',
  fundTransfer: 'FinanceFundTransfer',
  bankReconciliation: 'FinanceBankReconciliation',
  fundJournal: 'FinanceFundJournal',
  customerSettlement: 'FinanceCustomerSettlement',
  carrierSettlement: 'FinanceCarrierSettlement',
  paymentApplication: 'FinanceCarrierPaymentApplication',
  cashTransaction: 'FinanceCashTransaction',
  invoiceManagement: 'FinanceInvoiceManagement',
  waybillCost: 'FinanceWaybillCost',
  expenseReimbursement: 'FinanceExpenseReimbursement',
  waybillProfit: 'FinanceWaybillProfit',
  expenseItem: 'FinanceExpenseItem',
  waybillCostDetail: 'FinanceWaybillCostDetail',
  expenseReimbursementDetail: 'FinanceExpenseReimbursementDetail'
} as const

export function getWaybillCostDetailPath(id: string): string {
  return `${financePaths.waybillCost}/detail/${id}`
}

export function getExpenseReimbursementDetailPath(id: string): string {
  return `${financePaths.expenseReimbursement}/detail/${id}`
}

/**
 * Maps persisted bookmarks from the former business namespaces to their new
 * module roots. Non-business paths are intentionally ignored.
 */
export function resolveLegacyBusinessPath(path: string): string | undefined {
  const wmsLeafMappings = [
    ['receipt-inbound', 'receipt-issue/receipt-inbound'],
    ['stock-operation', 'receipt-issue/stock-operation'],
    ['sales-return', 'receipt-issue/sales-return'],
    ['transfer', 'transfer-business/step-transfer'],
    ['count', 'count-business/count'],
    ['adjustment', 'adjustment-business/adjustment'],
    ['transfer-adjustment/transfer', 'transfer-business/step-transfer'],
    ['transfer-adjustment/direct-transfer', 'transfer-business/direct-transfer'],
    ['transfer-adjustment/count', 'count-business/count'],
    ['transfer-adjustment/adjustment', 'adjustment-business/adjustment'],
    ['transfer-adjustment/assembly', 'adjustment-business/assembly'],
    ['receipt-issue/issue-request', 'outbound-business/outbound-request'],
    ['stock', 'inventory-trace/stock'],
    ['serial-trace', 'inventory-trace/serial-trace'],
    ['inventory-ledger', 'inventory-trace/inventory-ledger'],
    ['project-section', 'project-warehouse/project-section'],
    ['project-report', 'project-warehouse/project-report']
  ] as const
  const financeLeafMappings = [
    ['customer-settlement', financePaths.customerSettlement],
    ['carrier-settlement', financePaths.carrierSettlement],
    ['payment-application', financePaths.paymentApplication],
    ['cash-transaction', financePaths.cashTransaction],
    ['invoice-management', financePaths.invoiceManagement],
    ['waybill-cost', financePaths.waybillCost],
    ['expense-reimbursement', financePaths.expenseReimbursement],
    ['waybill-profit', financePaths.waybillProfit],
    ['expense-item', financePaths.expenseItem],
    ['asset-payable', financePaths.assetPayable],
    ['receivable-aging', financePaths.receivableAging],
    ['account-set', financePaths.accountSet],
    ['accounting-subject', financePaths.accountingSubject],
    ['accounting-auxiliary', financePaths.accountingAuxiliary],
    ['accounting-currency', financePaths.accountingCurrency],
    ['opening-balance', financePaths.openingBalance],
    ['voucher-center', financePaths.voucherCenter],
    ['voucher-template', financePaths.voucherTemplate],
    ['auto-posting', financePaths.autoPosting],
    ['ledger-center', financePaths.ledgerCenter],
    ['financial-reports', financePaths.financialReports],
    ['commercial-bill', financePaths.commercialBill],
    ['fixed-asset', financePaths.fixedAsset],
    ['payroll', financePaths.payroll],
    ['tax-management', financePaths.taxManagement],
    ['period-close', financePaths.periodClose],
    ['fund-account', financePaths.fundAccount],
    ['fund-transfer', financePaths.fundTransfer],
    ['bank-reconciliation', financePaths.bankReconciliation],
    ['fund-journal', financePaths.fundJournal],
    ['cash-forecast', financePaths.cashForecast]
  ] as const

  const financeRoots = [FMS_ROOT_PATH, LEGACY_FMS_ROOT_PATH, LEGACY_TMS_FINANCE_ROOT_PATH]
  const mappings = [
    {
      legacyRoot: `${FMS_ROOT_PATH}/settlement/purchase-payable`,
      currentRoot: financePaths.financialPayable
    },
    {
      legacyRoot: `${FMS_ROOT_PATH}/settlement/expense-reimbursement`,
      currentRoot: financePaths.expenseReimbursement
    },
    {
      legacyRoot: `${FMS_ROOT_PATH}/settlement/estimated-payable`,
      currentRoot: financePaths.estimatedPayable
    },
    ...wmsLeafMappings.map(([legacyLeaf, currentLeaf]) => ({
      legacyRoot: `/wms/${legacyLeaf}`,
      currentRoot: `/wms/${currentLeaf}`
    })),
    ...financeRoots.flatMap((root) =>
      financeLeafMappings.map(([suffix, currentRoot]) => ({
        legacyRoot: `${root}/${suffix}`,
        currentRoot
      }))
    ),
    { legacyRoot: LEGACY_TMS_FINANCE_ROOT_PATH, currentRoot: FMS_ROOT_PATH },
    { legacyRoot: LEGACY_FMS_ROOT_PATH, currentRoot: FMS_ROOT_PATH },
    { legacyRoot: LEGACY_TMS_ROOT_PATH, currentRoot: TMS_ROOT_PATH },
    { legacyRoot: LEGACY_VMS_ROOT_PATH, currentRoot: VMS_ROOT_PATH }
  ] as const

  for (const { legacyRoot, currentRoot } of mappings) {
    if (path === legacyRoot) {
      return currentRoot
    }

    if (path.startsWith(`${legacyRoot}/`)) {
      return `${currentRoot}${path.slice(legacyRoot.length)}`
    }
  }

  return undefined
}
