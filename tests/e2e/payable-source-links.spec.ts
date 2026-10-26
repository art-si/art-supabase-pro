import { expect, test, type Locator, type Page } from '@playwright/test'
import { captureBusinessEvidence } from './support/capture-business-evidence'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(150000)

const tenantId = '11111111-1111-4111-8111-111111111111'
const permissions = [
  'FinancePayablePayment:View',
  'FinancePurchasePayable:View',
  'FinanceCarrierSettlement:View'
]
const invoices = [1, 2].map((index) => ({
  id: `invoice-${index}`,
  tenant_id: tenantId,
  kind: 'financial',
  document_no: `CWYF-LINK-${index}`,
  source_type: 'carrier_statement',
  tms_statement_id: `statement-${index}`,
  source_document_id: null,
  source_document_no: `CYSDZ-LINK-${index}`,
  supplier_name: `联查验收承运商${index}`,
  payee_supplier_name: `联查验收承运商${index}`,
  status: 'approved',
  business_date: '2026-10-24',
  currency_code: 'CNY',
  amount: 100 * index,
  tax_amount: 0,
  total_amount: 100 * index,
  written_off_amount: 100 * index,
  unpaid_amount: 0,
  payment_plans: [],
  lines: [
    {
      id: `invoice-line-${index}`,
      line_no: 10,
      material_description: '承运运费',
      unit_name: '项',
      quantity: 1,
      unit_price: 100 * index,
      amount: 100 * index,
      tax_amount: 0,
      total_amount: 100 * index
    }
  ]
}))
const payments = invoices.map((invoice, index) => ({
  id: `payment-${index + 1}`,
  tenant_id: tenantId,
  kind: 'payment',
  document_no: `FK-LINK-${index + 1}`,
  document_type_name: '采购付款',
  status: 'approved',
  payment_status: 'paid',
  business_date: '2026-10-25',
  currency_code: 'CNY',
  amount: invoice.total_amount,
  approved_amount: invoice.total_amount,
  planned_amount: invoice.total_amount,
  counterparty_name: invoice.supplier_name,
  details: {},
  lines: [
    {
      id: `payment-line-${index + 1}`,
      line_no: 10,
      supplier_name: invoice.supplier_name,
      payee_supplier_name: invoice.supplier_name,
      purpose_name: '采购付款',
      amount: invoice.total_amount,
      approved_amount: invoice.total_amount,
      planned_amount: invoice.total_amount,
      source_document_id: invoice.id,
      source_document_kind: 'financial_payable',
      source_document_no: invoice.document_no,
      details: {}
    }
  ]
}))
const statements = invoices.map((invoice, index) => ({
  id: invoice.tms_statement_id,
  tenantId,
  statementNo: invoice.source_document_no,
  carrierName: invoice.supplier_name,
  statementAmount: invoice.total_amount,
  settledAmount: invoice.total_amount,
  outstandingAmount: 0,
  status: 'settled',
  periodStart: '2026-10-01',
  periodEnd: '2026-10-31',
  costCount: 1,
  waybillCount: 1,
  items: [
    {
      id: `cost-${index + 1}`,
      waybillNo: `YD-LINK-${index + 1}`,
      expenseItemName: '承运运费',
      costAmount: invoice.total_amount
    }
  ]
}))

async function mockSources(page: Page, purchaseKind?: 'purchase_contract' | 'purchase_order') {
  let failStatement = false
  let statementReads = 0
  let allowApplications = true
  const mutations: string[] = []
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1) || ''
    if (name === 'get_accessible_applications')
      return route.fulfill({
        json: allowApplications
          ? [
              { code: 'fms', name: '财务管理', base_url: '', sort: 1 },
              { code: 'scm', name: '供应链管理', base_url: '', sort: 2 }
            ]
          : []
      })
    if (name === 'get_table_column_runtime')
      return route.fulfill({ json: { enabled: false, catalog: null, profiles: [] } })
    if (name === 'sys_dictionary') {
      const code =
        new URL(route.request().url()).searchParams
          .get('dict_type_table.code')
          ?.replace(/^eq\./, '') || ''
      const dictionary: Record<string, Array<[string, string]>> = {
        tmsSettlementStatus: [['settled', '已结清']],
        tmsWaybillCostType: [['carrier_freight', '承运运费']],
        scmPurchaseStatus: [
          ['effective', '已生效'],
          ['approved', '已审核']
        ],
        commonBoolean: [
          ['true', '是'],
          ['false', '否']
        ]
      }
      return route.fulfill({
        json: (dictionary[code] || []).map(([value, label], index) => ({
          id: `dictionary-${code}-${index}`,
          value,
          code: value,
          label,
          status: '1',
          sort: index,
          dict_type_table: { code, name: code }
        }))
      })
    }
    const request = route.request().postDataJSON() as {
      p_id?: string
      p_query?: { id?: string }
    } | null
    if (name === 'fms_payable_settlement_list_secure') {
      const data = payments
        .filter((row) => !request?.p_query?.id || row.id === request.p_query.id)
        .map((row) =>
          purchaseKind
            ? {
                ...row,
                lines: row.lines.map((line) => ({
                  ...line,
                  source_document_id: row.id.replace('payment-', 'purchase-'),
                  source_document_kind: purchaseKind,
                  source_document_no: row.id.replace('payment-', 'CG-LINK-')
                }))
              }
            : row
        )
      return route.fulfill({ json: { data, total: data.length } })
    }
    if (name === 'scm_purchase_document') {
      const documents = [1, 2].map((index) => ({
        id: `purchase-${index}`,
        tenant_id: tenantId,
        document_no: `CG-LINK-${index}`,
        kind: purchaseKind,
        document_date: '2026-10-24',
        status: purchaseKind === 'purchase_contract' ? 'effective' : 'approved',
        total_amount: index * 100,
        subtotal: index * 100,
        tax_amount: 0,
        details: {},
        payment_plans: [],
        delivery_plans: [],
        clauses: [],
        lines: [
          {
            line_id: `purchase-line-${index}`,
            line_no: 10,
            material_description: `联查采购物料${index}`,
            material_code: `MAT-LINK-${index}`,
            quantity: 1,
            unit: '件',
            unit_price: index * 100,
            tax_rate: 0,
            discount_rate: 0,
            gift: false
          }
        ]
      }))
      const id = new URL(route.request().url()).searchParams.get('id')?.replace(/^eq\./, '')
      return route.fulfill({
        json: id ? documents.find((row) => row.id === id) || null : documents,
        headers: { 'content-range': '0-1/2' }
      })
    }
    if (name === 'fms_purchase_payable_list_secure') {
      const data = invoices.filter((row) => !request?.p_id || row.id === request.p_id)
      return route.fulfill({ json: { data, total: data.length } })
    }
    if (name === 'tms_get_carrier_statement_secure') {
      statementReads += 1
      return failStatement
        ? route.fulfill({ status: 500, json: { code: 'XX000', message: 'internal error' } })
        : route.fulfill({ json: statements.find((row) => row.id === request?.p_id) || null })
    }
    if (name === 'tms_list_carrier_statements_secure')
      return route.fulfill({ json: { records: statements, total: statements.length } })
    if (/^(fms_save_|fms_act_|tms_create_|tms_update_)/.test(name)) mutations.push(name)
    return route.fulfill({ json: [] })
  })
  return {
    setFail: (value: boolean) => {
      failStatement = value
    },
    statementReads: () => statementReads,
    setApplicationsAllowed: (value: boolean) => {
      allowApplications = value
    },
    mutations,
    errors
  }
}

async function openFixture(page: Page, kind: string, id: string, grants = permissions) {
  const parameters = new URLSearchParams({
    kind,
    recordId: id,
    sourceLinks: '1',
    permissions: grants.join(',')
  })
  parameters.set('theme', test.info().project.use.colorScheme === 'dark' ? 'dark' : 'light')
  parameters.set('box', test.info().project.name.includes('shadow') ? 'shadow-mode' : 'border-mode')
  await page.goto(`/tests/e2e/fixtures/purchase-payable.html?${parameters}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000
  })
}

async function ready(detail: Locator) {
  await expect(detail).toBeVisible({ timeout: 60000 })
  await expect(
    detail.locator('[aria-busy="true"]:visible,.el-loading-mask:visible,.el-skeleton:visible')
  ).toHaveCount(0, { timeout: 60000 })
  await expect(detail.locator('.el-alert--error:visible')).toHaveCount(0)
}

test('两条付款逐级打开实际应付及承运商来源，空付款计划只读且无业务写入', async ({ page }, info) => {
  const state = await mockSources(page)
  for (const index of [1, 2]) {
    await openFixture(page, 'payment', `payment-${index}`)
    const payment = page.getByRole('dialog', { name: '查看付款单', exact: true })
    await ready(payment)
    await payment.getByRole('button', { name: `CWYF-LINK-${index}`, exact: true }).click()
    const invoice = page.getByRole('dialog', { name: '财务应付单详情', exact: true })
    await ready(invoice)
    await expect(payment).not.toBeVisible()
    await expect(invoice).toContainText(`联查验收承运商${index}`)
    await expect(invoice.getByText('未设置付款计划', { exact: true })).toBeVisible()
    await expect(invoice.getByRole('switch', { name: '按比例计算付款计划' })).toHaveCount(0)
    const source = invoice.getByRole('button', { name: `CYSDZ-LINK-${index}`, exact: true })
    await source.scrollIntoViewIfNeeded()
    await captureBusinessEvidence(invoice, { path: info.outputPath(`invoice-${index}-source.png`) })
    await source.click()
    const statement = page.getByRole('dialog', { name: '承运商对账详情', exact: true })
    await ready(statement)
    await expect(statement.getByText('已结清', { exact: true })).toBeVisible()
    await expect(invoice).not.toBeVisible()
    await expect(statement).toContainText(`CYSDZ-LINK-${index}`)
    await expect(statement).toContainText(`联查验收承运商${index}`)
    await captureBusinessEvidence(statement, {
      path: info.outputPath(`statement-${index}-source.png`)
    })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  expect(state.statementReads()).toBe(2)
  expect(state.mutations).toEqual([])
  expect(state.errors).toEqual([])
})

test('来源加载失败保留目标并可重试，不重复打开付款或应付', async ({ page }, info) => {
  const state = await mockSources(page)
  state.setFail(true)
  await openFixture(page, 'financial', 'invoice-2')
  const invoice = page.getByRole('dialog', { name: '财务应付单详情', exact: true })
  await ready(invoice)
  await invoice.getByRole('button', { name: 'CYSDZ-LINK-2', exact: true }).click()
  const failure = page.getByRole('alert').filter({ hasText: '关联承运商对账单暂未打开' })
  await expect(failure).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await captureBusinessEvidence(page, { path: info.outputPath('source-error-retry.png') })
  state.setFail(false)
  await failure.getByRole('button', { name: '重新打开对账单' }).click()
  const statement = page.getByRole('dialog', { name: '承运商对账详情', exact: true })
  await ready(statement)
  await expect(statement).toContainText('CYSDZ-LINK-2')
  await expect(failure).not.toBeVisible()
  expect(state.statementReads()).toBe(2)
  expect(state.mutations).toEqual([])
  expect(state.errors).toEqual([])
})

test('缺少来源查看权限保留可识别编号，不提供越权链接或发起来源读取', async ({ page }, info) => {
  const state = await mockSources(page)
  await openFixture(page, 'financial', 'invoice-1', ['FinancePurchasePayable:View'])
  const invoice = page.getByRole('dialog', { name: '财务应付单详情', exact: true })
  await ready(invoice)
  const source = invoice
    .locator('strong[title="CYSDZ-LINK-1 · 暂无来源单据查看权限"]')
    .filter({ hasText: 'CYSDZ-LINK-1' })
  await source.scrollIntoViewIfNeeded()
  await expect(source).toBeVisible()
  await expect(invoice.getByRole('button', { name: 'CYSDZ-LINK-1', exact: true })).toHaveCount(0)
  await captureBusinessEvidence(invoice, { path: info.outputPath('source-permission-limited.png') })
  expect(state.statementReads()).toBe(0)
  expect(state.mutations).toEqual([])
  expect(state.errors).toEqual([])
})

for (const [kind, title, permission] of [
  ['purchase_contract', '采购合同', 'ScmPurchaseContract:View'],
  ['purchase_order', '采购订单', 'ScmPurchaseOrder:View']
] as const) {
  test(`两条${title}来源打开原生只读详情而非新建或编辑`, async ({ page }, info) => {
    const state = await mockSources(page, kind)
    for (const index of [1, 2]) {
      await openFixture(page, 'payment', `payment-${index}`, [
        'FinancePayablePayment:View',
        permission
      ])
      const payment = page.getByRole('dialog', { name: '查看付款单', exact: true })
      await ready(payment)
      await payment.getByRole('button', { name: `CG-LINK-${index}`, exact: true }).click()
      const source = page.getByRole('dialog', { name: `查看${title}`, exact: true })
      await ready(source)
      await expect(payment).toBeHidden()
      await expect(source).toContainText(`CG-LINK-${index}`)
      await expect(source).toContainText(`联查采购物料${index}`)
      await expect(source).toContainText(kind === 'purchase_contract' ? '已生效' : '已审核')
      await captureBusinessEvidence(source, {
        path: info.outputPath(`${kind}-${index}-readonly.png`)
      })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      )
    }
    expect(state.mutations).toEqual([])
    expect(state.errors).toEqual([])
  })
}

test('具有来源查看权限但目标应用不可访问时，不绕过应用授权', async ({ page }) => {
  const state = await mockSources(page, 'purchase_order')
  state.setApplicationsAllowed(false)
  await openFixture(page, 'payment', 'payment-1', [
    'FinancePayablePayment:View',
    'ScmPurchaseOrder:View'
  ])
  const payment = page.getByRole('dialog', { name: '查看付款单', exact: true })
  await ready(payment)
  await payment.getByRole('button', { name: 'CG-LINK-1', exact: true }).click()
  await expect(page.getByText('当前账号没有目标应用的访问权限', { exact: true })).toBeVisible()
  await expect(page.getByRole('dialog', { name: '查看采购订单', exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '付款单', exact: true })).toBeVisible()
  expect(state.statementReads()).toBe(0)
  expect(state.mutations).toEqual([])
  expect(state.errors).toEqual([])
})
