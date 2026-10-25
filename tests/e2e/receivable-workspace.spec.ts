import { test, expect, type Page, type Route } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
const tenant = '11111111-1111-4111-8111-111111111111'
const customer = '22222222-2222-4222-8222-222222222222'
const organization = '33333333-3333-4333-8333-333333333333'
const documentId = '44444444-4444-4444-8444-444444444444'
const lineId = '55555555-5555-4555-8555-555555555555'
const dictionaries: Record<string, Array<[string, string]>> = {
  arDocumentStatus: [
    ['draft', '草稿'],
    ['submitted', '已提交'],
    ['approved', '已审核'],
    ['confirmed', '已收款'],
    ['paid', '已付款'],
    ['reversed', '已反核销']
  ],
  arViewMode: [
    ['document', '按单据'],
    ['line', '按明细']
  ],
  arBasis: [
    ['quantity', '数量'],
    ['amount', '金额']
  ],
  arDiscountMethod: [
    ['none', '无'],
    ['rate', '折扣率'],
    ['amount', '折扣额']
  ],
  arTaxRate: [
    ['0', '0%'],
    ['6', '6%'],
    ['13', '13%']
  ],
  arSettlementMethod: [
    ['cash', '现金'],
    ['bank_transfer', '电汇']
  ],
  mdmCurrency: [['CNY', '人民币']],
  commonBoolean: [
    ['true', '是'],
    ['false', '否']
  ],
  arCounterpartyType: [
    ['customer', '客户'],
    ['supplier', '供应商'],
    ['person', '人员'],
    ['other', '其他往来单位']
  ],
  arWriteoffRelation: [
    ['receivable_receipt', '应收收款核销'],
    ['receivable_receivable', '应收冲应收'],
    ['receipt_refund', '收款冲退款'],
    ['receivable_refund', '应收退款核销'],
    ['receivable_red_blue', '应收红蓝对冲'],
    ['bad_debt_recovery', '坏账收回']
  ],
  arPartialStatus: [
    ['none', '未核销'],
    ['partial', '部分核销'],
    ['full', '已核销']
  ],
  arAdjustmentKind: [
    ['increase', '调增应收'],
    ['decrease', '调减应收'],
    ['bad_debt', '坏账损失'],
    ['warranty', '质保金转回']
  ],
  arReportMode: [
    ['detail', '应收明细'],
    ['summary', '应收汇总与账龄']
  ],
  arAgingBasis: [
    ['due', '计划到期日'],
    ['business', '业务日期']
  ],
  arDocumentKind: [
    ['estimate', '暂估应收'],
    ['financial', '财务应收'],
    ['reversal', '暂估冲回']
  ],
  arSourceType: [['wms_sales_outbound', '销售出库单']]
}
const doc = {
  id: documentId,
  tenant_id: tenant,
  document_no: 'AR-E-202610-001',
  kind: 'estimate',
  status: 'draft',
  document_type_id: 'type-standard',
  customer_id: customer,
  customerName: '演示客户 · 华东制造',
  organizationName: '演示结算组织',
  settlement_organization_id: organization,
  documentTypeName: '标准销售暂估',
  business_date: '2026-10-22',
  accounting_date: '2026-10-22',
  currency_code: 'CNY',
  settlement_method: 'cash',
  amount: 1000,
  tax_amount: 130,
  total_amount: 1130,
  unreversed_amount: 1130,
  linked_financial_amount: 0,
  unlinked_financial_amount: 1130,
  available_amount: 1130,
  outstanding_amount: 1130,
  reserved_amount: 0,
  invoiced_amount: 0,
  uninvoiced_amount: 1130,
  createdBy: '演示财务',
  source_no: 'XSCK-202610-001',
  lines: [
    {
      id: lineId,
      tenant_id: tenant,
      document_id: documentId,
      line_no: 10,
      basis: 'quantity',
      material_description: '演示金属构件 · 长名称用于检验表格布局',
      materialCode: 'MAT-001',
      specificationModel: '1200 × 600',
      quantity: 10,
      base_quantity: 10,
      inventory_unit_id: 'unit',
      base_unit_id: 'unit',
      unit_price: 100,
      tax_inclusive_unit_price: 113,
      tax_rate: 13,
      discount_method: 'none',
      discount_rate: 0,
      discount_amount: 0,
      amount: 1000,
      tax_amount: 130,
      total_amount: 1130,
      availableAmount: 1130,
      outstandingAmount: 1130,
      gift: false,
      advance_invoice: false,
      customer_id: customer
    }
  ]
}
async function mock(
  page: Page,
  state: { empty?: boolean; error?: boolean; deleteError?: boolean; multiLine?: boolean } = {}
) {
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const body = route.request().postDataJSON() as Record<string, unknown> | null
    let response: unknown = []
    if (url.pathname.endsWith('/sys_dictionary')) {
      const code = (url.searchParams.get('dict_type_table.code') || '').replace(/^eq\./, '')
      response = (dictionaries[code] || []).map(([value, label], index) => ({
        id: `${code}-${index}`,
        code: value,
        value,
        label,
        status: '1',
        sort: index,
        dict_type_table: { code, name: code },
        tag_type: ''
      }))
    } else if (url.pathname.endsWith('/mdm_organization')) {
      response = [
        {
          id: 'organization-group',
          tenant_id: tenant,
          parent_id: null,
          organization_code: 'GROUP',
          organization_name: '演示集团',
          organization_type: 'group',
          status: '1',
          sort: 0
        },
        {
          id: organization,
          tenant_id: tenant,
          parent_id: 'organization-group',
          organization_code: 'ORG-001',
          organization_name: '演示结算组织',
          organization_type: 'company',
          status: '1',
          sort: 1
        }
      ]
    } else if (url.pathname.endsWith('/fms_ar_options_secure')) {
      const type = String(body?.p_type)
      response =
        type === 'customer'
          ? [{ id: customer, tenant_id: tenant, code: 'KH-001', name: '演示客户 · 华东制造' }]
          : type.includes('organization') || type === 'company'
            ? [{ id: organization, tenant_id: tenant, code: 'ORG-001', name: '演示结算组织' }]
            : type.endsWith('_type')
              ? [
                  {
                    id: 'type-standard',
                    tenant_id: tenant,
                    code: 'AR_STANDARD',
                    name: '标准销售暂估',
                    is_default: true
                  }
                ]
              : type === 'unit'
                ? [{ id: 'unit', tenant_id: tenant, code: 'PCS', name: '件' }]
                : type === 'fund'
                  ? [
                      {
                        id: 'fund',
                        tenant_id: tenant,
                        code: 'BANK',
                        name: '演示收款账户',
                        currency_code: 'CNY'
                      }
                    ]
                  : []
    } else if (url.pathname.endsWith('/fms_receivable_workspace_secure')) {
      if (state.error) {
        await route.fulfill({
          status: 500,
          json: { code: 'P0001', message: '演示加载失败，请重试' }
        })
        return
      }
      const kind = String(body?.p_kind)
      const receipt = {
        id: documentId,
        tenant_id: tenant,
        documentNo: 'AR-RECEIPT-202610-001',
        status: 'confirmed',
        customer_id: customer,
        customerName: '演示客户 · 华东制造',
        settlement_organization_id: organization,
        organizationName: '演示结算组织',
        business_date: '2026-10-22',
        currency_code: 'CNY',
        amount: 1130,
        availableAmount: 500,
        refundableAmount: 1130,
        payment_method: 'cash',
        lines: [{ lineNo: 10, amount: 1130, sourceNo: doc.document_no }]
      }
      const rows =
        kind === 'receipt' || kind === 'refund'
          ? [{ ...receipt, status: kind === 'refund' ? 'approved' : 'confirmed' }]
          : kind === 'revenue'
            ? [
                {
                  id: documentId,
                  tenant_id: tenant,
                  documentNo: 'AR-REVENUE-202610-001',
                  status: 'draft',
                  businessDate: '2026-10-22',
                  sourceNo: doc.document_no,
                  customerName: receipt.customerName,
                  revenueAmount: 1000,
                  costAmount: 0,
                  lines: [
                    {
                      id: lineId,
                      lineNo: 10,
                      description: '演示构件',
                      revenueAmount: 1000,
                      costAmount: null
                    }
                  ]
                }
              ]
            : kind === 'writeoff' || kind === 'adjustment' || kind === 'condition'
              ? []
              : [
                  {
                    ...doc,
                    kind,
                    document_no: kind === 'financial' ? 'AR-F-202610-001' : doc.document_no
                  }
                ]
      response = { records: state.empty ? [] : rows, total: state.empty ? 0 : rows.length }
      if (state.multiLine && kind === 'financial') {
        const document = {
          ...doc,
          kind,
          status: 'approved',
          document_no: 'AR-F-202610-001',
          amount: 300,
          tax_amount: 39,
          total_amount: 339,
          outstanding_amount: 309,
          reserved_amount: 90,
          available_amount: 219,
          unlinked_invoice_amount: 339,
          unmatched_amount: 300,
          invoiced_amount: 0,
          uninvoiced_amount: 339
        }
        const records = [1, 2].map((factor) => ({
          ...document,
          recordKey: `${documentId}:${factor}`,
          amount: 100 * factor,
          tax_amount: 13 * factor,
          total_amount: 113 * factor,
          outstanding_amount: 103 * factor,
          reserved_amount: 30 * factor,
          available_amount: 73 * factor,
          unlinked_invoice_amount: 113 * factor,
          unmatched_amount: 100 * factor,
          uninvoiced_amount: 113 * factor,
          lines: [{ ...doc.lines[0], id: `${lineId}-${factor}`, line_no: factor * 10 }]
        }))
        response =
          (body?.p_query as Record<string, unknown>)?.viewMode === 'line'
            ? { records, total: 2 }
            : { records: [document], total: 1 }
      }
    } else if (url.pathname.endsWith('/fms_receivable_writeoff_candidates_secure'))
      response = {
        records: [
          {
            id: lineId,
            documentId,
            documentNo: 'AR-F-202610-001',
            tenantId: tenant,
            sourceType: 'financial',
            status: 'approved',
            organizationId: organization,
            customerId: customer,
            customerName: '演示客户',
            currencyCode: 'CNY',
            exchangeRate: 1,
            businessDate: '2026-10-22',
            amount: 1130,
            outstandingAmount: 1130,
            availableAmount: 1130
          },
          {
            id: 'receipt',
            documentId: 'receipt',
            documentNo: 'AR-RECEIPT-202610-001',
            tenantId: tenant,
            sourceType: 'receipt',
            status: 'confirmed',
            organizationId: organization,
            customerId: customer,
            customerName: '演示客户',
            currencyCode: 'CNY',
            exchangeRate: 1,
            businessDate: '2026-10-22',
            amount: 1130,
            availableAmount: 1130
          }
        ],
        summary: {
          receivableAmount: 1130,
          dueThisMonthAmount: 1130,
          unallocatedReceiptAmount: 1130
        }
      }
    else if (url.pathname.endsWith('/fms_ar_report_secure')) response = { records: [], total: 0 }
    else if (url.pathname.endsWith('/fms_ar_delete_dependencies_secure')) {
      if (state.deleteError) {
        await route.fulfill({
          status: 500,
          json: { code: 'P0001', message: '关联资料读取失败，请重试' }
        })
        return
      }
      response = []
    } else if (url.pathname.endsWith('/fms_check_receivable_writeoff_secure'))
      response = [
        {
          documentNo: 'AR-F-202610-001',
          availableAmount: 1130,
          currencyCode: 'CNY',
          message: '状态及余额查验通过'
        },
        {
          documentNo: 'AR-RECEIPT-202610-001',
          availableAmount: 1130,
          currencyCode: 'CNY',
          message: '状态及余额查验通过'
        }
      ]
    else if (url.pathname.endsWith('/fms_ar_voucher_secure'))
      response = { message: '演示凭证预览', lines: [] }
    else if (url.pathname.includes('/rpc/')) response = documentId
    await route.fulfill({ status: 200, json: response })
  })
}
test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(120_000)
test('暂估列表、抽屉和窄屏完整可用', async ({ page }, info) => {
  await mock(page)
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  await page.goto(`/tests/e2e/fixtures/receivable-workspace.html?kind=estimate&theme=${theme}`)
  await expect(page.getByText('AR-E-202610-001', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '新增', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByText('应收明细', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '保存应收单', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '新增服务行', exact: true }).click()
  await expect(page.getByRole('spinbutton', { name: '录入价税合计(元) 第10行' })).toBeVisible()
  await expect(
    page.getByRole('dialog').getByRole('columnheader').filter({ hasText: '必填' })
  ).toHaveCount(3)
  await mkdir('.artifacts/receivable-visual', { recursive: true })
  await page.screenshot({
    path: '.artifacts/receivable-visual/estimate-editor.png',
    fullPage: true
  })
  await page.getByRole('button', { name: '取消', exact: true }).last().click()
  await page.getByRole('button', { name: '查看', exact: true }).click()
  const detail = page.getByRole('dialog')
  await expect(detail.getByRole('columnheader').filter({ hasText: '必填' })).toHaveCount(0)
  await expect(detail.getByRole('button', { name: '保存应收单', exact: true })).toHaveCount(0)
  await detail.screenshot({ path: info.outputPath('receivable-readonly.png') })
  await detail.getByRole('button', { name: '取消', exact: true }).click()
  await page.setViewportSize({ width: 1024, height: 768 })
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true)
  await page.screenshot({ path: '.artifacts/receivable-visual/estimate-1024.png', fullPage: true })
})
test('收款只读详情不显示填写标记或保存操作', async ({ page }, info) => {
  await mock(page)
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  await page.goto(`/tests/e2e/fixtures/receivable-workspace.html?kind=receipt&theme=${theme}`)
  await page.getByRole('button', { name: '查看', exact: true }).click()
  const detail = page.getByRole('dialog')
  if ((info.project.use.viewport?.width ?? 1440) <= 640)
    await expect(detail.getByText('本次收款金额', { exact: true })).toBeVisible()
  else
    await expect(
      detail.getByRole('columnheader', { name: '本次收款金额', exact: true })
    ).toBeVisible()
  await expect(detail.getByRole('columnheader').filter({ hasText: '必填' })).toHaveCount(0)
  await expect(detail.getByRole('spinbutton')).toHaveCount(0)
  await expect(detail.getByRole('button', { name: '保存草稿', exact: true })).toHaveCount(0)
  await detail.screenshot({ path: info.outputPath('receipt-readonly.png') })
})

for (const [kind, guide] of [
  ['estimate', '新建暂估应收，或从已审核销售出库、已签收运输来源生成暂估。'],
  ['financial', '新建财务应收，或从已审核暂估应收下推；先开票单据可后续勾稽。']
]) {
  test(`${kind} 空态提供对应业务指引`, async ({ page }, info) => {
    await mock(page, { empty: true })
    const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
    await page.goto(`/tests/e2e/fixtures/receivable-workspace.html?kind=${kind}&theme=${theme}`)
    await expect(page.getByText('暂无应收单据', { exact: true })).toBeVisible()
    await expect(page.getByText(guide, { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '新增', exact: true })).toBeEnabled()
    await page.screenshot({ path: info.outputPath(`${kind}-empty-guide.png`), fullPage: true })
  })
}

test('仅已确认收款展示已收款未核销金额', async ({ page }, info) => {
  await mock(page)
  await page.route('**/rest/v1/rpc/fms_receivable_workspace_secure', (route) =>
    route.fulfill({
      json: {
        records: ['draft', 'submitted', 'approved', 'confirmed'].map((status, index) => ({
          id: `receipt-status-${index}`,
          documentNo: `QA-RECEIPT-STATUS-${index}`,
          status,
          tenant_id: tenant,
          customerName: '隔离收款状态客户',
          business_date: '2026-10-24',
          currency_code: 'CNY',
          amount: 100,
          availableAmount: 100,
          lines: []
        })),
        total: 4
      }
    })
  )
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  await page.goto(`/tests/e2e/fixtures/receivable-workspace.html?kind=receipt&theme=${theme}`)
  for (const index of [0, 1, 2, 3]) {
    const row = page.getByRole('row').filter({ hasText: `QA-RECEIPT-STATUS-${index}` })
    await expect(row.locator('td').nth(7)).toHaveText(index === 3 ? '¥100.00' : '—')
  }
  await page.screenshot({ path: info.outputPath('receipt-confirmed-balance.png'), fullPage: true })
})

test('空态、加载错误和重试', async ({ page }) => {
  const state = { empty: true, error: false }
  await mock(page, state)
  await page.goto('/tests/e2e/fixtures/receivable-workspace.html?kind=financial')
  await expect(page.getByText('暂无应收单据', { exact: true })).toBeVisible()
  state.empty = false
  state.error = true
  await page.reload()
  await expect(page.getByText(/加载失败|加载出错|重新加载|重试/).first()).toBeVisible()
  state.error = false
  await page.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(page.getByText('AR-F-202610-001', { exact: true })).toBeVisible()
})

test('按明细选择多行时按行汇总应收余额', async ({ page }) => {
  await mock(page, { multiLine: true })
  for (const variant of [
    { theme: 'light', box: 'border-mode', width: 1440 },
    { theme: 'dark', box: 'shadow-mode', width: 1024 }
  ]) {
    await page.setViewportSize({ width: variant.width, height: 900 })
    await page.goto(
      `/tests/e2e/fixtures/receivable-workspace.html?kind=financial&theme=${variant.theme}&box=${variant.box}`
    )
    await expect(page.getByText('AR-F-202610-001', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '展开', exact: true }).click()
    await page.getByText('按明细', { exact: true }).click()
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await expect(page.getByText('AR-F-202610-001', { exact: true })).toHaveCount(2)
    await page.locator('.el-table__header-wrapper .el-checkbox').first().click()
    await expect(page.getByText('价税合计 ¥339.00', { exact: true })).toBeVisible()
    await expect(page.getByText('未核销金额 ¥309.00', { exact: true })).toBeVisible()
    await expect(page.getByText('未勾稽金额 ¥300.00', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '提交', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: '审核', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: '批量删除', exact: true })).toBeDisabled()
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true)
    await page.screenshot({
      path: `.artifacts/receivable-visual/financial-line-selection-${variant.theme}.png`,
      fullPage: true
    })
  }
})
test('收款、退款、成本和核销页面能呈现状态', async ({ page }) => {
  await mock(page)
  for (const kind of [
    'receipt',
    'refund',
    'revenue',
    'payment_request',
    'writeoff',
    'condition',
    'report'
  ]) {
    await page.goto(`/tests/e2e/fixtures/receivable-workspace.html?kind=${kind}&theme=dark`)
    await expect(page.locator('.business-workspace-page')).toBeVisible()
    if (kind === 'writeoff') {
      await expect(page.getByText('应收余额', { exact: true })).toBeVisible()
    }
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true)
    await page.screenshot({ path: `.artifacts/receivable-visual/${kind}-dark.png`, fullPage: true })
  }
})
test('聚焦模式可退出且打印包含单据明细', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await mock(page)
  await page.goto('/tests/e2e/fixtures/receivable-workspace.html?kind=estimate')
  await expect(page.getByText(doc.document_no, { exact: true })).toBeVisible()
  const focusSwitch = page
    .locator('.business-table-workspace-actions__toggle')
    .filter({ hasText: '专注模式' })
    .locator('.el-switch')
  await focusSwitch.click()
  await expect(page.getByRole('button', { name: '退出专注模式' })).toBeVisible()
  await expect(page.locator('.business-workspace-header')).not.toBeVisible()
  await page.keyboard.press('Escape')
  await expect(focusSwitch).toBeVisible()
  await focusSwitch.click()
  await page.getByRole('button', { name: '退出专注模式' }).click()
  await expect(focusSwitch).toBeVisible()
  await page.locator('.el-table__header-wrapper .el-checkbox').first().click()
  await page.evaluate(() => {
    window.print = () => {}
  })
  await page.getByRole('button', { name: '打印', exact: true }).click()
  await page.emulateMedia({ media: 'print' })
  await expect(
    page.locator('.ar-print-sheet').getByText(doc.document_no, { exact: true })
  ).toBeVisible()
  await page.screenshot({ path: '.artifacts/receivable-visual/estimate-print.png', fullPage: true })
  await page.pdf({
    path: '.artifacts/receivable-visual/estimate-print.pdf',
    format: 'A4',
    printBackground: true
  })
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
  await page.emulateMedia({ media: 'screen' })
  for (const kind of [
    'financial',
    'receipt',
    'refund',
    'revenue',
    'payment_request',
    'condition',
    'report'
  ]) {
    await page.goto(`/tests/e2e/fixtures/receivable-workspace.html?kind=${kind}`)
    await page
      .locator('.business-table-workspace-actions__toggle')
      .filter({ hasText: '专注模式' })
      .locator('.el-switch')
      .click()
    await expect(page.locator('.business-workspace-header')).not.toBeVisible()
    await expect(page.getByRole('button', { name: '退出专注模式' })).toBeVisible()
    await page.getByRole('button', { name: '退出专注模式' }).click()
    await expect(page.locator('.business-workspace-header')).toBeVisible()
  }
  expect(errors).toEqual([])
})
test('编辑保存只发送业务字段并包含稳定请求标识', async ({ page }) => {
  await mock(page)
  await page.goto('/tests/e2e/fixtures/receivable-workspace.html?kind=estimate')
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await expect(page.getByRole('button', { name: '保存应收单' })).toBeVisible()
  await page.getByRole('spinbutton', { name: '数量 第10行', exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({
    path: '.artifacts/receivable-visual/estimate-editor-detail.png',
    fullPage: true
  })
  const request = page.waitForRequest((r) =>
    r.url().endsWith('/fms_save_receivable_document_secure')
  )
  await page.getByRole('button', { name: '保存应收单' }).click()
  const body = (await request).postDataJSON().p_payload
  expect(body).toMatchObject({ id: documentId, customerId: customer, currencyCode: 'CNY' })
  expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/i)
  expect(body).not.toHaveProperty('totalAmount')
  expect(body).not.toHaveProperty('status')
  expect(body.lines[0]).not.toHaveProperty('materialCode')
  await expect(page.getByRole('dialog')).not.toBeVisible()
})
for (const [kind, mode] of [
  ['estimate', 'edit'],
  ['financial', 'edit'],
  ['estimate', 'copy'],
  ['financial', 'copy'],
  ['estimate', 'late'],
  ['financial', 'late']
] as const) {
  test(`${kind} ${mode} 两张单据费用承担部门保留三级树并提交子部门`, async ({ page }, info) => {
    await mock(page)
    const records = [1, 2].map((index) => ({
      ...doc,
      id: `department-document-${index}`,
      kind,
      document_no: `QA-DEPARTMENT-${index}`,
      lines: [
        {
          ...doc.lines[0],
          id: `department-line-${index}`,
          expense_department_id: null as string | null
        }
      ]
    }))
    let heldSave: Route | undefined
    let reads = 0
    await page.route('**/rest/v1/rpc/fms_receivable_workspace_secure', (route) => {
      reads++
      const body = route.request().postDataJSON()
      const rows = body.p_query?.id ? records.filter((row) => row.id === body.p_query.id) : records
      return route.fulfill({ json: { records: rows, total: rows.length } })
    })
    await page.route('**/rest/v1/rpc/fms_ar_options_secure', (route) => {
      if (route.request().postDataJSON().p_type !== 'organization') return route.fallback()
      return route.fulfill({
        json: [1, 2].map((index) => ({
          id: `department-${index}`,
          tenant_id: tenant,
          name: `验收部门${index}`,
          code: `D${index}`
        }))
      })
    })
    await page.route('**/rest/v1/mdm_organization*', (route) =>
      route.fulfill({
        json: [
          {
            id: 'group',
            tenant_id: tenant,
            parent_id: null,
            organization_name: '验收集团',
            organization_code: 'G',
            status: '1'
          },
          {
            id: organization,
            tenant_id: tenant,
            parent_id: 'group',
            organization_name: '演示结算组织',
            organization_code: 'C',
            status: '1'
          },
          ...[1, 2].map((index) => ({
            id: `department-${index}`,
            tenant_id: tenant,
            parent_id: organization,
            organization_name: `验收部门${index}`,
            organization_code: `D${index}`,
            status: '1'
          }))
        ]
      })
    )
    const payloads: Array<{
      id?: string
      requestId: string
      lines: Array<{
        expenseDepartmentId: string
        estimatedLineId?: string | null
        sourceLineId?: string | null
      }>
    }> = []
    await page.route('**/rest/v1/rpc/fms_save_receivable_document_secure', (route) => {
      const payload = route.request().postDataJSON().p_payload
      payloads.push(payload)
      if (mode === 'late') {
        heldSave = route
        return
      }
      const record = records.find((row) => row.id === payload.id)
      if (mode === 'edit') expect(record).toBeDefined()
      if (record) record.lines[0].expense_department_id = payload.lines[0].expenseDepartmentId
      return route.fulfill({ json: payload.id || `copied-${payloads.length}` })
    })
    const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
    const permission =
      kind === 'estimate' ? 'FinanceEstimatedReceivable' : 'FinanceFinancialReceivable'
    await page.goto(
      `/tests/e2e/fixtures/receivable-workspace.html?kind=${kind}&theme=${theme}&permissionControls=1&permissions=${permission}:View,${permission}:${mode === 'copy' ? 'Add' : 'Edit'},${permission}:Copy`
    )
    for (const index of [1, 2]) {
      await expect(page.locator('.el-message')).toHaveCount(0)
      const row = page.getByRole('row').filter({ hasText: `QA-DEPARTMENT-${index}` })
      if (mode !== 'copy') await row.getByRole('button', { name: '编辑', exact: true }).click()
      else {
        await row.locator('label.el-checkbox').click()
        await page.getByRole('button', { name: '复制', exact: true }).click()
      }
      const dialog = page.getByRole('dialog')
      const department = dialog.getByRole('combobox', { name: '费用承担部门 第10行', exact: true })
      await department.click()
      await expect(page.getByRole('treeitem', { name: '验收集团' })).toHaveAttribute(
        'aria-disabled',
        'true'
      )
      await page
        .getByRole('treeitem', { name: '验收集团' })
        .locator('.el-tree-node__expand-icon')
        .first()
        .click()
      await expect(
        page.getByRole('treeitem', { name: '演示结算组织', exact: true })
      ).toHaveAttribute('aria-disabled', 'true')
      await page
        .getByRole('treeitem', { name: '演示结算组织', exact: true })
        .locator('.el-tree-node__expand-icon')
        .first()
        .click()
      if (index === 2)
        await page.screenshot({
          path: info.outputPath(`${kind}-department-tree-open.png`),
          fullPage: true
        })
      await page.getByRole('treeitem', { name: `验收部门${index}`, exact: true }).click()
      if (index === 2)
        await dialog.screenshot({ path: info.outputPath(`${kind}-department-tree.png`) })
      if (mode === 'late') {
        await dialog.getByRole('button', { name: '保存应收单', exact: true }).click()
        await expect.poll(() => payloads.length).toBe(index)
        const readsBeforeRelease = reads
        await page.keyboard.press('Alt+Shift+4')
        if (!heldSave) throw new Error('未捕获应收保存请求')
        await heldSave.fulfill({ json: `department-document-${index}` })
        await expect(dialog.getByRole('button', { name: '保存应收单', exact: true })).toBeEnabled()
        await expect(dialog).toBeVisible()
        await expect(page.locator('.el-message--success')).toHaveCount(0)
        expect(reads).toBe(readsBeforeRelease)
        await expect(dialog.locator('.el-form-item').filter({ hasText: '收款组织' })).toContainText(
          '演示结算组织'
        )
        await dialog.getByRole('button', { name: '取消', exact: true }).click()
        await page.keyboard.press('Alt+Shift+5')
        continue
      }
      await page.keyboard.press(mode === 'copy' ? 'Alt+Shift+0' : 'Alt+Shift+4')
      await dialog.getByRole('button', { name: '保存应收单', exact: true }).click()
      await expect(
        page.getByText('操作范围或权限已变化，请重新打开应收单', { exact: true })
      ).toBeVisible()
      expect(payloads).toHaveLength(index - 1)
      await page.keyboard.press('Alt+Shift+5')
      await dialog.getByRole('button', { name: '保存应收单', exact: true }).click()
      await expect(dialog).not.toBeVisible()
    }
    expect(
      payloads.map((payload) => ({
        id: payload.id,
        department: payload.lines[0].expenseDepartmentId
      }))
    ).toEqual([
      { id: mode === 'copy' ? undefined : 'department-document-1', department: 'department-1' },
      { id: mode === 'copy' ? undefined : 'department-document-2', department: 'department-2' }
    ])
    if (mode === 'copy') {
      expect(payloads[0].requestId).not.toBe(payloads[1].requestId)
      for (const payload of payloads)
        expect(payload.lines[0]).toMatchObject({ estimatedLineId: null, sourceLineId: null })
    }
  })
}

test('删除检查失败会停止删除并可重试', async ({ page }) => {
  const state = { deleteError: true }
  const mutations: string[] = []
  await mock(page, state)
  page.on('request', (r) => {
    if (r.url().endsWith('/fms_delete_ar_records_secure')) mutations.push(r.url())
  })
  await page.goto('/tests/e2e/fixtures/receivable-workspace.html?kind=estimate')
  await page.locator('.el-table__header-wrapper .el-checkbox').first().click()
  await page.getByRole('button', { name: '批量删除', exact: true }).click()
  await expect(page.getByText('关联资料未完成核验，删除已停止')).toBeVisible()
  expect(mutations).toEqual([])
  state.deleteError = false
  await page.getByRole('button', { name: '重新检查' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  expect(mutations).toEqual([])
})
test('核销查验及特殊核销传递所选主方和原因', async ({ page }) => {
  await mock(page)
  const initializedOptions = page.waitForResponse(
    (response) =>
      response.url().endsWith('/fms_ar_options_secure') &&
      response.request().postDataJSON()?.p_type === 'initialized_organization'
  )
  await page.goto('/tests/e2e/fixtures/receivable-workspace.html?kind=writeoff')
  await initializedOptions
  await expect(page.locator('#ar-preview').getByText('应收收款核销', { exact: true })).toBeVisible()
  await page.getByLabel('结算组织', { exact: true }).click()
  await page
    .getByRole('treeitem', { name: '演示集团', exact: true })
    .locator('.el-tree-node__expand-icon')
    .first()
    .click()
  await page.getByRole('treeitem', { name: '演示结算组织', exact: true }).click()
  await page.getByRole('button', { name: '查询待核销单据' }).click()
  await expect(page.getByText('AR-F-202610-001', { exact: true })).toBeVisible()
  await page.locator('.el-table__header-wrapper .el-checkbox').nth(0).click()
  await page.locator('.el-table__header-wrapper .el-checkbox').nth(1).click()
  await page.getByRole('button', { name: '单据查验', exact: true }).click()
  await expect(page.getByText('状态及余额查验通过').first()).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '特殊核销', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '特殊核销确认' })).toBeVisible()
  await page.getByLabel('业务原因 / 核销备注').fill('经确认的小额尾差')
  await page.screenshot({
    path: '.artifacts/receivable-visual/writeoff-special.png',
    fullPage: true
  })
  const request = page.waitForRequest((r) =>
    r.url().endsWith('/fms_execute_receivable_writeoff_secure')
  )
  await page.getByRole('button', { name: '执行核销' }).click()
  const payload = (await request).postDataJSON().p_payload
  expect(payload).toMatchObject({ relationKind: 'special', reason: '经确认的小额尾差' })
  expect(payload.sides).toHaveLength(1)
  expect(payload.sides[0]).toMatchObject({ side: 'primary', id: lineId, sourceType: 'financial' })
})
