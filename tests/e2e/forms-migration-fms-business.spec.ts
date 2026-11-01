import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)
const tenantId = '11111111-1111-4111-8111-111111111111'
const recordId = '44444444-4444-4444-8444-444444444444'
const accountSetId = '55555555-5555-4555-8555-555555555555'
const currencyId = '66666666-6666-4666-8666-666666666666'
const categoryId = '77777777-7777-4777-8777-777777777777'
const accountSet = {
  id: accountSetId,
  tenantId,
  accountSetCode: 'BOOK-001',
  accountSetName: '验收账套',
  label: '验收账套',
  value: accountSetId,
  status: 'active'
}
const common = { id: recordId, tenantId, accountSetId, status: 'draft' }
const subjects = [1, 2].map((index) => ({
  id: '88888888-8888-4888-8888-88888888888' + index,
  tenantId,
  accountSetId,
  subjectCode: index === 1 ? '1001' : '2001',
  subjectName: index === 1 ? '验收现金科目' : '验收往来科目',
  category: index === 1 ? 'asset' : 'liability',
  balanceDirection: index === 1 ? 'debit' : 'credit',
  isEnabled: true,
  isLeaf: true,
  parentId: null,
  allowQuantity: false,
  allowForeignCurrency: false,
  cashFlowRequired: false,
  auxiliaryConfigs: []
}))
const accountingContext = {
  accountSet,
  subjects,
  currencies: [],
  auxiliaryItems: [],
  auxiliaryTypes: [],
  templates: []
}
const templateRow = {
  ...common,
  templateCode: 'TEMPLATE-001',
  templateName: '',
  voucherType: 'general',
  summary: '验收模板摘要',
  isEnabled: true,
  sort: 10,
  lineCount: 2,
  fieldAccess: { templateEntries: 'edit', templateNarrative: 'edit' },
  lines: subjects.map((subject, index) => ({
    lineNo: index + 1,
    subjectId: subject.id,
    entryDirection: index === 0 ? 'debit' : 'credit',
    defaultAmount: 100,
    summary: '验收模板分录',
    auxiliaryValues: {},
    currencyId: null,
    exchangeRate: 1,
    quantity: 0
  }))
}
const ruleRow = {
  ...common,
  ruleCode: 'RULE-001',
  ruleName: '',
  sourceType: 'waybill_cost',
  eventCode: 'confirmed',
  voucherType: 'general',
  submissionMode: 'draft',
  priority: 10,
  effectiveFrom: '2026-11-01',
  effectiveTo: null,
  isEnabled: true,
  fieldAccess: { ruleConfiguration: 'edit' },
  lines: subjects.map((subject, index) => ({
    lineNo: index + 1,
    subjectId: subject.id,
    direction: index === 0 ? 'debit' : 'credit',
    amountKey: 'gross_amount',
    amountMultiplier: 1,
    summary: '验收入账分录',
    auxiliaryBindings: {},
    cashFlowItemId: null
  }))
}
const voucherRow = {
  ...common,
  voucherNo: 'VOUCHER-001',
  voucherType: 'general',
  voucherDate: '2026-11-01',
  sourceType: 'manual',
  summary: '',
  attachments: [],
  fieldAccess: {
    voucherAmounts: 'edit',
    sourceReferences: 'edit',
    voucherAttachments: 'edit',
    auditTrail: 'edit'
  },
  lines: subjects.map((subject, index) => ({
    id: '99999999-9999-4999-8999-99999999999' + index,
    lineNo: index + 1,
    subjectId: subject.id,
    summary: '验收会计分录',
    debitAmount: index === 0 ? 100 : 0,
    creditAmount: index === 1 ? 100 : 0,
    auxiliaryValues: {},
    currencyId: null,
    exchangeRate: 1,
    originalAmount: 0,
    quantity: 0
  }))
}
const path = (relative: string) => 'modules/art-supabase-fms/src/views/' + relative
interface Scenario {
  name: string
  path: string
  rpc?: string
  table?: string
  row: Record<string, unknown>
  args?: unknown[]
  label: string
  key: string
  tabs: number
  permissions?: string[]
  accountScope?: boolean
}
const scenarios: Scenario[] = [
  {
    name: '账套',
    path: path('accounting/account-set/modules/account-set-dialog.vue'),
    rpc: 'save_fms_account_set_secure',
    row: {
      ...common,
      accountSetCode: 'BOOK-001',
      accountSetName: '',
      legalEntityName: '验收主体',
      accountingStandard: 'enterprise_2019',
      vatTaxpayerType: 'general',
      baseCurrencyCode: 'CNY',
      enabledOn: '2026-01-01',
      fiscalYearStartMonth: 1,
      isDefault: false,
      fieldAccess: {
        taxRegistration: 'edit',
        accountingPolicy: 'edit',
        administrativeAudit: 'edit'
      }
    },
    label: '账套名称',
    key: 'accountSetName',
    tabs: 2
  },
  {
    name: '资金账户',
    path: path('treasury/fund-account/modules/fund-account-dialog.vue'),
    rpc: 'save_fms_fund_account_secure',
    row: {
      ...common,
      currencyId,
      accountCode: 'BANK-001',
      accountName: '',
      accountType: 'bank',
      bankName: '验收银行',
      bankBranch: '上海支行',
      openingBalance: 0,
      frozenBalance: 0,
      status: 'active',
      isDefault: false,
      reconciliationEnabled: true,
      onlineBankingEnabled: false,
      fieldAccess: { accountDetails: 'edit', accountBalances: 'edit' }
    },
    label: '账户名称',
    key: 'accountName',
    tabs: 2,
    accountScope: true
  },
  {
    name: '会计科目',
    path: path('accounting/accounting-subject/modules/subject-dialog.vue'),
    rpc: 'save_fms_subject',
    row: {
      ...common,
      subjectCode: '1001',
      subjectName: '',
      category: 'asset',
      balanceDirection: 'debit',
      isEnabled: true,
      allowQuantity: false,
      allowForeignCurrency: false,
      allowPeriodEndRevaluation: false,
      cashFlowRequired: false,
      sort: 10,
      auxiliaryConfigs: []
    },
    label: '科目名称',
    key: 'subjectName',
    tabs: 2,
    accountScope: true
  },
  {
    name: '固定资产',
    path: path('specialized-accounting/fixed-asset/modules/fixed-asset-dialog.vue'),
    rpc: 'save_fms_fixed_asset_secure',
    row: {
      ...common,
      categoryId,
      assetNo: 'ASSET-001',
      assetName: '',
      acquisitionDate: '2026-01-01',
      readyForUseDate: '2026-01-01',
      depreciationStartDate: '2026-01-01',
      originalValue: 10000,
      residualValue: 100,
      usefulLifeMonths: 60,
      fieldAccess: { assetValues: 'edit', assetCustody: 'edit', assetReferences: 'edit' }
    },
    label: '资产名称',
    key: 'assetName',
    tabs: 2,
    permissions: ['FinanceFixedAsset:Edit'],
    accountScope: true
  },
  {
    name: '商业票据',
    path: path('specialized-accounting/commercial-bill/modules/commercial-bill-dialog.vue'),
    rpc: 'save_fms_commercial_bill_secure',
    row: {
      ...common,
      billNo: 'BILL-001',
      direction: 'receivable',
      billType: 'bank_acceptance',
      drawerName: '出票主体',
      payeeName: '收票主体',
      acceptorName: '承兑银行',
      issueDate: '2026-11-01',
      dueDate: '2027-01-01',
      faceAmount: 10000,
      currencyCode: 'CNY',
      transferable: true,
      fieldAccess: { billParties: 'edit', billAmounts: 'edit', billReferences: 'edit' }
    },
    label: '出票人',
    key: 'drawerName',
    tabs: 2,
    accountScope: true
  },
  {
    name: '收款信息紧凑',
    path: path('everyone-expense/payee-information/modules/payee-information-dialog.vue'),
    table: 'fms_payee_information',
    row: {
      ...common,
      isEmployee: false,
      payeeName: '收款主体',
      bankName: '',
      bankAccount: '622200000001',
      currencyCode: 'CNY',
      authorizedUse: false,
      isDefault: false
    },
    label: '收款银行',
    key: 'bank_name',
    tabs: 0,
    permissions: ['FinancePayeeInformation:View', 'FinancePayeeInformation:Edit']
  },
  {
    name: '凭证模板',
    path: path('accounting/voucher-template/modules/voucher-template-dialog.vue'),
    rpc: 'save_fms_voucher_template_secure',
    row: templateRow,
    args: [accountingContext, templateRow],
    label: '模板名称',
    key: 'templateName',
    tabs: 2,
    accountScope: true
  },
  {
    name: '自动入账规则',
    path: path('accounting/auto-posting/modules/posting-rule-dialog.vue'),
    rpc: 'save_fms_posting_rule_secure',
    row: ruleRow,
    args: [accountingContext, ruleRow],
    label: '规则名称',
    key: 'ruleName',
    tabs: 3,
    accountScope: true
  },
  {
    name: '会计凭证录入',
    path: path('accounting/voucher-center/modules/voucher-dialog.vue'),
    rpc: 'save_fms_voucher_secure',
    row: voucherRow,
    args: [accountingContext, voucherRow],
    label: '凭证摘要',
    key: 'summary',
    tabs: 3,
    accountScope: true,
    permissions: ['FinanceVoucherCenter:Edit']
  }
]

function fieldFor(page: Page, label: string) {
  return page.getByRole('textbox', { name: new RegExp('^\\*?\\s*' + label + '$') })
}
async function openScenario(page: Page, scenario: Scenario, mutations: Record<string, unknown>[]) {
  await prepareIsolatedSession(page)
  const row = { ...scenario.row }
  // One required editable control is intentionally missing, all other source values remain valid.
  if (scenario.name === '商业票据') row.drawerName = ''
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      rpc = url.pathname.split('/rpc/')[1]
    if (
      (scenario.rpc && rpc === scenario.rpc) ||
      (scenario.table &&
        url.pathname.endsWith('/' + scenario.table) &&
        request.method() === 'PATCH')
    ) {
      mutations.push(request.postDataJSON())
      return route.fulfill({
        json: { ...row, id: recordId },
        headers: { 'content-range': '0-0/1' }
      })
    }
    if (
      scenario.rpc === 'save_fms_voucher_secure' &&
      rpc === 'save_fms_cash_flow_allocations_secure'
    ) {
      expect(request.postDataJSON()).toEqual({ p_voucher_id: recordId, p_allocations: [] })
      return route.fulfill({ json: 0 })
    }
    if (rpc?.startsWith('save_fms_'))
      return route.fulfill({ status: 400, json: { message: '未预期的财务保存入口 ' + rpc } })
    if (rpc === 'current_is_super') return route.fulfill({ json: true })
    if (rpc === 'fms_list_account_set_options_secure')
      return route.fulfill({ json: { records: [accountSet], total: 1 } })
    if (rpc === 'fms_list_asset_categories_secure')
      return route.fulfill({
        json: [
          {
            id: categoryId,
            accountSetId,
            categoryCode: 'EQUIPMENT',
            categoryName: '设备',
            usefulLifeMonths: 60,
            residualRate: 1,
            isEnabled: true
          }
        ]
      })
    if (rpc?.startsWith('fms_get_')) return route.fulfill({ json: row })
    if (url.pathname.endsWith('/fms_currency'))
      return route.fulfill({
        json: [
          {
            id: currencyId,
            tenantId,
            accountSetId,
            currencyCode: 'CNY',
            currencyName: '人民币',
            isEnabled: true,
            isBase: true
          }
        ]
      })
    return route.fulfill({ json: [] })
  })
  const args =
    scenario.args ??
    (scenario.name === '会计科目' ? [accountSet, [], [], row] : scenario.table ? [{ row }] : [row])
  const dicts = Object.fromEntries(
    [
      'fmsAccountingStandard',
      'fmsVatTaxpayerType',
      'fmsFundAccountType',
      'fmsFundAccountStatus',
      'fmsSubjectCategory',
      'fmsBalanceDirection',
      'fmsBillDirection',
      'fmsBillType',
      'mdmCurrency',
      'fmsVoucherType',
      'fmsPostingAmountKey',
      'fmsPostingAuxiliaryPayloadKey',
      'fmsPostingSourceEvent',
      'fmsPostingSubmissionMode',
      'fmsPostingWaybillCostType'
    ].map((code) => [
      code,
      [
        'enterprise_2019',
        'general',
        'bank',
        'active',
        'asset',
        'debit',
        'receivable',
        'bank_acceptance',
        'CNY',
        'general',
        'gross_amount',
        'waybill_cost:confirmed',
        'draft',
        'credit'
      ].map((value, sort) => ({ id: value, label: value, value, sort }))
    ])
  )
  await page.addInitScript(
    (input) => {
      window.formsMigrationInput = input
    },
    { args, permissions: scenario.permissions || [], dicts }
  )
  await page.goto(
    '/tests/e2e/fixtures/forms-migration-business.html?entry=' + encodeURIComponent(scenario.path),
    { waitUntil: 'domcontentloaded', timeout: 120_000 }
  )
  const dialog = page.locator('.el-dialog:visible').first()
  await expect(dialog).toBeVisible({ timeout: 60_000 })
  await expect(page.getByTestId('open-error')).toBeEmpty()
  await expect(dialog.locator('.el-dialog__footer button').last()).toBeEnabled({ timeout: 30_000 })
  return dialog
}
for (const scenario of scenarios) {
  test(scenario.name + ' 真实保存保留字段与业务范围', async ({ page }, testInfo) => {
    const mutations: Record<string, unknown>[] = [],
      errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const dialog = await openScenario(page, scenario, mutations),
      tabs = dialog.getByRole('tab'),
      field = fieldFor(page, scenario.label)
    await expect(tabs).toHaveCount(scenario.tabs)
    if (scenario.tabs) {
      await tabs.first().click()
      await expect(field).toBeVisible()
      await field.evaluate((node) => node.setAttribute('data-preserved-field', 'true'))
      await tabs.last().click()
      await expect(field).toBeHidden()
      await expect(page.locator('[data-preserved-field]')).toHaveCount(1)
    }
    await dialog.locator('.el-dialog__footer button').last().click()
    await expect(field).toBeVisible()
    await expect(field).toBeFocused()
    expect(mutations).toHaveLength(0)
    const value = '布局保存验收-' + scenario.name
    await field.fill(value)
    await field.press('Tab')
    await page.screenshot({
      path: testInfo.outputPath('corrected-form.png'),
      animations: 'disabled'
    })
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
    await dialog.locator('.el-dialog__footer button').last().click()
    await expect.poll(() => mutations.length).toBe(1)
    await expect(page.getByTestId('successes')).toHaveText('1')
    const payload = (mutations[0].p_payload || mutations[0]) as Record<string, unknown>
    expect(payload[scenario.key]).toBe(value)
    if (scenario.name === '凭证模板' || scenario.name === '自动入账规则')
      expect(payload.lines).toMatchObject(subjects.map((subject) => ({ subjectId: subject.id })))
    if (scenario.accountScope) expect(payload.accountSetId).toBe(accountSetId)
    if (scenario.table) expect(payload.tenant_id).toBe(tenantId)
    else if (scenario.name === '账套') expect(payload.tenantId).toBe(tenantId)
    expect(errors).toEqual([])
  })
}

for (const compact of [false, true]) {
  test(`薪酬${compact ? '少项目紧凑' : '多分类页签'}使用表格公共校验并保存`, async ({
    page
  }, testInfo) => {
    await prepareIsolatedSession(page)
    const submissions: Record<string, unknown>[] = []
    await page.route('**/rest/v1/rpc/save_fms_payroll_line_secure', (route) => {
      submissions.push(route.request().postDataJSON())
      return route.fulfill({ json: { id: recordId } })
    })
    const run = {
      id: accountSetId,
      tenantId,
      accountSetId,
      runNo: 'PAY-001',
      status: 'draft',
      fieldAccess: { employeeIdentity: 'edit', salaryAmounts: 'edit' }
    }
    const line = {
      id: recordId,
      runId: accountSetId,
      employeeId: categoryId,
      employeeNameSnapshot: '验收员工',
      employeeNoSnapshot: 'EMP-001',
      earningItems: compact ? { 基本工资: 6000 } : { 基本工资: 6000, 提成: 1800, 历史补助: 200 },
      deductionItems: compact ? { 违章扣款: 100 } : { 违章扣款: 100, 事故扣款: 50 },
      employerCostItems: { 社保: 1200 },
      grossAmount: compact ? 6000 : 8000,
      deductionAmount: compact ? 100 : 150,
      employerCostAmount: 1200,
      netAmount: compact ? 5900 : 7850,
      fieldAccess: run.fieldAccess
    }
    await page.addInitScript(
      (input) => {
        window.formsMigrationInput = input
      },
      { args: [run, line], permissions: ['FinancePayroll:Calculate'] }
    )
    await page.goto(
      '/tests/e2e/fixtures/forms-migration-business.html?entry=' +
        encodeURIComponent(path('specialized-accounting/payroll/modules/payroll-line-dialog.vue'))
    )
    const dialog = page.locator('.el-dialog:visible'),
      tabs = dialog.getByRole('tab'),
      footer = dialog.locator('.el-dialog__footer button').last()
    await expect(dialog).toBeVisible({ timeout: 60_000 })
    await expect(tabs).toHaveCount(compact ? 0 : 3)
    if (!compact) await tabs.first().click()
    const names = dialog.getByRole('textbox', { name: '项目名称', exact: true })
    const invalidName = compact ? names.first() : names.nth(1)
    await invalidName.fill('')
    if (!compact) await tabs.last().click()
    await footer.click()
    await expect(invalidName).toBeVisible()
    await expect(dialog.locator('.is-validation-error').first()).toBeVisible()
    await expect(dialog.locator('.art-table__required-marker').first()).toBeVisible()
    await expect(page.locator('.el-message')).toBeVisible()
    await expect(dialog.locator('.art-table__validation-error')).toHaveCount(0)
    expect(submissions).toHaveLength(0)
    await page.screenshot({
      path: testInfo.outputPath('table-red-border.png'),
      animations: 'disabled'
    })
    await invalidName.fill(compact ? '基本工资' : '提成')
    await footer.click()
    await expect.poll(() => submissions.length).toBe(1)
    await expect(page.getByTestId('successes')).toHaveText('1')
    expect(submissions[0].p_run_id).toBe(accountSetId)
    expect(submissions[0].p_payload).toMatchObject({
      earningItems: line.earningItems,
      deductionItems: line.deductionItems,
      employerCostItems: line.employerCostItems,
      grossAmount: line.grossAmount,
      deductionAmount: line.deductionAmount,
      employerCostAmount: 1200
    })
  })
}

test('银行对账流水跨页校验使用红框与红星，余额一致后真实导入', async ({ page }, testInfo) => {
  await prepareIsolatedSession(page)
  const submissions: Record<string, unknown>[] = []
  await page.route('**/rest/v1/**', (route) => {
    const rpc = new URL(route.request().url()).pathname.split('/rpc/')[1]
    if (rpc === 'import_fms_bank_reconciliation_secure') {
      submissions.push(route.request().postDataJSON())
      return route.fulfill({ json: { id: recordId } })
    }
    if (rpc === 'fms_list_account_set_options_secure')
      return route.fulfill({ json: { records: [accountSet], total: 1 } })
    if (rpc === 'fms_list_fund_account_options_secure')
      return route.fulfill({
        json: [
          {
            id: currencyId,
            tenantId,
            accountSetId,
            accountName: '验收银行账户',
            accountCode: 'BANK-001',
            accountType: 'bank',
            currencyId,
            reconciliationEnabled: true,
            status: 'active'
          }
        ]
      })
    return route.fulfill({ json: [] })
  })
  await page.addInitScript(
    (input) => {
      window.formsMigrationInput = input
    },
    {
      args: [],
      dicts: {
        fmsFundLedgerDirection: [
          { label: '流入', value: 'inflow' },
          { label: '流出', value: 'outflow' }
        ]
      }
    }
  )
  await page.goto(
    '/tests/e2e/fixtures/forms-migration-business.html?entry=' +
      encodeURIComponent(
        path('treasury/bank-reconciliation/modules/bank-reconciliation-import-dialog.vue')
      )
  )
  const dialog = page.locator('.el-dialog:visible'),
    tabs = dialog.getByRole('tab'),
    confirm = dialog.locator('.el-dialog__footer button').last()
  await expect(dialog).toBeVisible({ timeout: 60_000 })
  await expect(confirm).toBeEnabled({ timeout: 30_000 })
  await expect(tabs).toHaveCount(2)
  await dialog.getByRole('combobox', { name: /对账账户/ }).click()
  await page.getByRole('option', { name: '验收银行账户' }).click()
  await dialog.getByRole('spinbutton', { name: /期末余额/ }).fill('-10')
  await confirm.click()
  await expect(tabs.last()).toHaveAttribute('aria-selected', 'true')
  const table = dialog.locator('.art-table').filter({ visible: true }).first()
  await expect(table.locator('.is-validation-error')).toBeVisible()
  await expect(table.locator('.art-table__required-marker')).toHaveCount(3)
  await expect(page.locator('.el-message')).toBeVisible()
  await expect(table.locator('.art-table__validation-error')).toHaveCount(0)
  expect(submissions).toHaveLength(0)
  await page.screenshot({
    path: testInfo.outputPath('bank-red-border.png'),
    animations: 'disabled'
  })
  await table.getByRole('spinbutton').fill('10')
  await confirm.click()
  await expect.poll(() => submissions.length).toBe(1)
  await expect(page.getByTestId('successes')).toHaveText('1')
  expect(submissions[0].p_payload).toMatchObject({
    fundAccountId: currencyId,
    openingBalance: 0,
    closingBalance: -10,
    lines: [{ direction: 'outflow', amount: 10 }]
  })
})

for (const formula of [false, true])
  test(`报表${formula ? '公式' : '科目映射'}紧凑表格使用公共红框校验并保存`, async ({
    page
  }, testInfo) => {
    await prepareIsolatedSession(page)
    const submissions: Record<string, unknown>[] = []
    const rpc = formula
      ? 'save_fms_financial_statement_formulas_secure'
      : 'save_fms_financial_statement_mappings_secure'
    await page.route('**/rest/v1/**', (route) => {
      const name = new URL(route.request().url()).pathname.split('/rpc/')[1]
      if (name === rpc) {
        submissions.push(route.request().postDataJSON())
        return route.fulfill({ json: 1 })
      }
      if (name === 'fms_list_financial_statement_formulas_secure')
        return route.fulfill({ json: { records: [] } })
      return route.fulfill({ json: [] })
    })
    const item = {
      ...common,
      itemCode: 'TARGET-001',
      itemName: '验收报表项目',
      statementType: 'balance_sheet',
      calculationMethod: formula ? 'formula' : 'mapping',
      isEnabled: true,
      mappings: []
    }
    const source = {
      id: categoryId,
      itemCode: 'SOURCE-001',
      itemName: '验收来源项目',
      statementType: 'balance_sheet',
      calculationMethod: 'mapping',
      isEnabled: true,
      parentId: null
    }
    await page.addInitScript(
      (input) => {
        window.formsMigrationInput = input
      },
      {
        args: [item, [source], subjects, true],
        dicts: { fmsStatementMappingDirection: [{ label: '借方净额', value: 'net_debit' }] }
      }
    )
    await page.goto(
      '/tests/e2e/fixtures/forms-migration-business.html?entry=' +
        encodeURIComponent(path('accounting/financial-reports/modules/statement-rule-dialog.vue'))
    )
    const dialog = page.locator('.el-dialog:visible'),
      confirm = dialog.locator('.el-dialog__footer button').last()
    await expect(dialog).toBeVisible({ timeout: 60_000 })
    await expect(confirm).toBeEnabled({ timeout: 30_000 })
    await expect(dialog.getByRole('tab')).toHaveCount(0)
    await dialog.getByRole('button', { name: '添加规则' }).click()
    await confirm.click()
    await expect(dialog.locator('.is-validation-error')).toBeVisible()
    await expect(dialog.locator('.art-table__required-marker').first()).toBeVisible()
    await expect(page.locator('.el-message')).toBeVisible()
    expect(submissions).toHaveLength(0)
    await page.screenshot({
      path: testInfo.outputPath('statement-rule-red-border.png'),
      animations: 'disabled'
    })
    await dialog
      .getByRole('combobox', { name: formula ? '第 1 条来源项目' : '第 1 条会计科目', exact: true })
      .click()
    await page
      .getByRole('treeitem', {
        name: formula ? 'SOURCE-001 验收来源项目' : '1001 验收现金科目',
        exact: true
      })
      .click()
    await confirm.click()
    await expect.poll(() => submissions.length).toBe(1)
    await expect(page.getByTestId('successes')).toHaveText('1')
    if (formula)
      expect(submissions[0]).toEqual({
        p_target_item_id: recordId,
        p_formulas: [{ sourceItemId: categoryId, factor: 1 }]
      })
    else
      expect(submissions[0]).toEqual({
        p_statement_item_id: recordId,
        p_mappings: [
          { subjectId: subjects[0].id, mappingDirection: 'net_debit', factor: 1, remark: null }
        ]
      })
  })
