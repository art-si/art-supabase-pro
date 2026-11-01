import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)
const path = (relative: string) => 'modules/art-supabase-fms/src/views/' + relative
const scenarios = [
  {
    name: '资金调拨',
    path: path('treasury/fund-transfer/modules/fund-transfer-detail-drawer.vue'),
    tabs: 2
  },
  {
    name: '银行对账',
    path: path('treasury/bank-reconciliation/modules/bank-reconciliation-detail-drawer.vue'),
    tabs: 2
  },
  {
    name: '商业票据',
    path: path('specialized-accounting/commercial-bill/modules/commercial-bill-detail-drawer.vue'),
    tabs: 2
  },
  {
    name: '税务期间',
    path: path('specialized-accounting/tax-management/modules/tax-detail-drawer.vue'),
    tabs: 2
  },
  {
    name: '薪资批次',
    path: path('specialized-accounting/payroll/modules/payroll-detail-drawer.vue'),
    tabs: 2
  },
  {
    name: '关账检查',
    path: path('specialized-accounting/period-close/modules/period-close-detail-drawer.vue'),
    tabs: 2
  },
  {
    name: '承运商对账',
    path: path('settlement/carrier-settlement/modules/carrier-statement-detail-drawer.vue'),
    tabs: 3
  },
  {
    name: '客户对账',
    path: path('settlement/customer-settlement/modules/customer-statement-detail-drawer.vue'),
    tabs: 3
  },
  {
    name: '收付款',
    path: path('settlement/cash-transaction/modules/cash-transaction-detail-drawer.vue'),
    tabs: 3
  },
  {
    name: '会计凭证',
    path: path('accounting/voucher-center/modules/voucher-detail-drawer.vue'),
    tabs: 4
  },
  {
    name: '发票',
    path: path('settlement/invoice-management/modules/invoice-detail-drawer.vue'),
    tabs: 4
  },
  {
    name: '付款申请',
    path: path('settlement/payment-application/modules/payment-application-detail-drawer.vue'),
    tabs: 4
  },
  {
    name: '自动入账事件',
    path: path('accounting/auto-posting/modules/posting-event-detail-drawer.vue'),
    tabs: 2
  },
  {
    name: '自动入账无数据权限紧凑',
    path: path('accounting/auto-posting/modules/posting-event-detail-drawer.vue'),
    tabs: 0
  }
]
for (const [scenarioIndex, scenario] of scenarios.entries()) {
  test(`FMS ${scenario.name} 详情分组可切换且权限不泄漏`, async ({ page }, testInfo) => {
    await prepareIsolatedSession(page)
    const narrow = scenarioIndex % 3 === 1
    await page.setViewportSize({ width: narrow ? 570 : 1440, height: 900 })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const fieldAccess = Object.fromEntries(
      [
        'transferAccounts',
        'transferAmounts',
        'statementAmounts',
        'billParties',
        'billAmounts',
        'billReferences',
        'taxAmounts',
        'taxReferences',
        'taxFiling',
        'employeeIdentity',
        'salaryAmounts',
        'closeDiagnostics',
        'statementLines',
        'statementAmounts',
        'voucherEvidence',
        'allocations',
        'cashAmounts',
        'cashAccounts',
        'cashReferences',
        'voucherAmounts',
        'voucherAttachments',
        'auditTrail',
        'sourceReferences',
        'taxIdentity',
        'invoiceAmounts',
        'invoiceAttachments',
        'paymentAmounts',
        'paymentReferences',
        'applicationAmounts',
        'basisEvidence',
        'eventAmounts',
        'eventPayloadDetails',
        'eventSourceReferences',
        'processingDiagnostics'
      ].map((key) => [key, 'read'])
    )
    if (scenario.tabs === 0) {
      fieldAccess.eventAmounts = 'hidden'
      fieldAccess.eventPayloadDetails = 'hidden'
      fieldAccess.eventSourceReferences = 'hidden'
    }
    const row = {
      id: '44444444-4444-4444-8444-444444444444',
      tenantId: '11111111-1111-4111-8111-111111111111',
      accountSetId: '55555555-5555-4555-8555-555555555555',
      accountSet: { accountSetName: '验收账套' },
      transferNo: 'TRANSFER-001',
      batchNo: 'BANK-001',
      billNo: 'BILL-001',
      runNo: 'RUN-001',
      periodNo: 'PERIOD-001',
      statementNo: 'STMT-001',
      voucherNo: 'VOUCHER-001',
      invoiceNo: 'INV-001',
      applicationNo: 'PAY-001',
      transactionNo: 'CASH-001',
      eventNo: 'EVENT-001',
      eventDate: '2026-11-01',
      sourceType: 'waybill_cost',
      sourceEvent: 'confirmed',
      sourceNo: 'SOURCE-001',
      payload: { amount: 100, sourceNo: 'SOURCE-001', costType: 'freight' },
      summary: '验收业务摘要',
      title: '验收业务详情',
      amount: 100,
      faceAmount: 100,
      totalAmount: 100,
      paidAmount: 0,
      receivedAmount: 0,
      unpaidAmount: 100,
      unreceivedAmount: 100,
      taxAmount: 6,
      netAmount: 94,
      direction: scenario.name === '收付款' ? 'payment' : 'receivable',
      billType: 'bank_acceptance',
      currencyCode: 'CNY',
      currencyName: '人民币',
      transferDate: '2026-11-01',
      transactionDate: '2026-11-01',
      issueDate: '2026-11-01',
      dueDate: '2027-01-01',
      statementStartDate: '2026-11-01',
      statementEndDate: '2026-11-30',
      periodStart: '2026-11-01',
      periodEnd: '2026-11-30',
      payrollMonth: '2026-11-01',
      sourceAccountName: '验收来源账户',
      targetAccountName: '验收目标账户',
      accountName: '验收银行账户',
      carrierName: '验收承运商',
      customerName: '验收客户',
      counterpartyName: '验收往来主体',
      status: 'draft',
      createTime: '2026-11-01T08:00:00Z',
      updateTime: '2026-11-01T08:00:00Z',
      version: 1,
      passedCount: 1,
      warningCount: 0,
      blockingCount: 0,
      lineCount: 0,
      matchedCount: 0,
      partialCount: 0,
      ignoredCount: 0,
      unmatchedCount: 0,
      lines: [],
      entries: [],
      attachments: [],
      actions: [],
      events: [],
      allocations: [],
      statementLinks: [],
      workflowInstances: [],
      cashFlowAllocations: [],
      fieldAccess
    }
    await page.route('**/rest/v1/**', (route) => {
      const url = new URL(route.request().url()),
        rpc = url.pathname.split('/rpc/')[1]
      if (rpc?.match(/^(fms|tms)_get_/)) return route.fulfill({ json: row })
      if (
        rpc === 'fms_list_bank_statement_lines_secure' ||
        rpc === 'fms_list_payroll_lines_secure' ||
        rpc?.includes('tax_ledger')
      )
        return route.fulfill({ json: { records: [], fieldAccess } })
      if (rpc === 'current_is_super') return route.fulfill({ json: true })
      if (route.request().method() !== 'GET' && !rpc)
        return route.fulfill({ status: 400, json: { message: '详情不应写入业务数据' } })
      return route.fulfill({ json: [] })
    })
    await page.addInitScript(
      (input) => {
        window.formsMigrationInput = input
      },
      { args: [row] }
    )
    await page.goto(
      '/tests/e2e/fixtures/forms-migration-business.html?entry=' +
        encodeURIComponent(scenario.path) +
        '&theme=' +
        (narrow ? 'dark' : 'light')
    )
    const drawer = page.locator('.el-drawer:visible')
    await expect(drawer).toBeVisible({ timeout: 60_000 })
    await expect(page.getByTestId('open-error')).toBeEmpty()
    const tabs = drawer.getByRole('tab')
    await expect(tabs).toHaveCount(scenario.tabs, { timeout: 30_000 })
    const panes = drawer.locator('.el-tab-pane')
    await expect(panes).toHaveCount(scenario.tabs)
    for (let index = 0; index < scenario.tabs; index++) {
      await tabs.nth(index).click()
      await expect(panes.nth(index)).toBeVisible()
      expect((await panes.nth(index).innerText()).trim().length).toBeGreaterThan(0)
      expect(await drawer.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
    }
    await page.screenshot({
      path: testInfo.outputPath('detail-last-tab.png'),
      animations: 'disabled'
    })
    if (scenario.tabs) {
      await tabs.first().click()
      await expect(panes.first()).toBeVisible()
    }
    if (scenario.tabs === 0)
      await expect(drawer.getByText('SOURCE-001', { exact: true })).toHaveCount(0)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
      )
    ).toBe(true)
    expect(errors).toEqual([])
  })
}
