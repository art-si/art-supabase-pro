import { expect, test } from '@playwright/test'
import { captureBusinessEvidence } from './support/capture-business-evidence'
import { acceptanceRecord, acceptanceRows } from './support/payable-live-session'
import { normalizeStringList } from '../../src/utils/form/normalize'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 20_000 })
test.setTimeout(180_000)
const tenant = '11111111-1111-4111-8111-111111111111'
const makeBill = (index: number) => ({
  id: `virtual-${index}`,
  record_key: `virtual-${index}`,
  tenant_id: tenant,
  kind: 'payment',
  document_no: `FK-NONCASH-${index}`,
  status: 'draft',
  version: 1,
  document_type_id: 'payment-type',
  document_type_name: '采购付款',
  business_date: '2026-10-25',
  currency_code: 'CNY',
  amount: index * 10,
  approved_amount: index * 10,
  planned_amount: index * 10,
  counterparty_name: `示例承运商${index}`,
  payment_status: 'none',
  frozen: false,
  reason: `运输非现金结算${index}`,
  remark: '',
  details: { fee: 0, payment_type: 'active' },
  lines: [
    {
      id: `virtual-line-${index}`,
      line_no: 10,
      carrier_id: `carrier-${index}`,
      supplier_id: null,
      payee_supplier_id: null,
      supplier_name: `示例承运商${index}`,
      payee_supplier_name: `示例承运商${index}`,
      payable_id: `ap-${index}`,
      source_document_no: `CWYF-TMS-${index}`,
      purpose_id: 'purchase',
      purpose_name: '采购付款',
      settlement_method_id: 'virtual',
      settlement_method_name: '虚拟结算',
      fund_account_id: null,
      amount: index * 10,
      approved_amount: index * 10,
      planned_amount: index * 10,
      cash_discount: 0,
      tax_rate: 0,
      bank_account: '',
      bank_account_name: '',
      bank_name: '',
      bank_reference: '',
      fund_purpose: '',
      remark: '',
      details: {}
    }
  ]
})

for (const theme of ['light', 'dark']) {
  test(`${theme} 两笔运输虚拟付款显示真实往来单位，无账户可保存确认并诚实提示制证配置`, async ({
    page
  }, info) => {
    let bills = [makeBill(1), makeBill(2)]
    let saves = 0
    const mutations: string[] = []
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) => {
      const endpoint = new URL(route.request().url()).pathname.split('/').pop() || ''
      const body = acceptanceRecord(
        route.request().method() === 'POST' ? route.request().postDataJSON() || {} : {}
      )
      if (endpoint === 'fms_payable_settlement_list_secure') {
        const query = body.p_query ? acceptanceRecord(body.p_query) : undefined
        const rows = bills.filter((bill) => !query?.id || bill.id === query.id)
        return route.fulfill({ json: { data: rows, total: rows.length } })
      }
      if (endpoint === 'fms_payable_settlement_options_secure')
        return route.fulfill({
          json: {
            tenant_id: tenant,
            supplier: [],
            purpose: [{ id: 'purchase', code: '201', name: '采购付款', payable_writeoff: true }],
            method: [{ id: 'virtual', code: 'JSFS13', name: '虚拟结算', category: 'virtual' }],
            fund: [],
            document_type: [
              {
                id: 'payment-type',
                code: 'AP_PAYMENT_PURCHASE',
                name: '采购付款',
                is_default: true
              }
            ],
            organization: [],
            project: [],
            expense: [],
            bank: [],
            purchase: [],
            currency: [{ id: 'CNY', name: '人民币', code: 'CNY' }],
            payable: bills.map((bill, index) => ({
              id: `ap-${index + 1}`,
              code: `CWYF-TMS-${index + 1}`,
              name: `CWYF-TMS-${index + 1}`,
              carrier_id: bill.lines[0].carrier_id,
              amount: bill.amount,
              balance: bill.amount
            }))
          }
        })
      if (endpoint === 'fms_save_payable_settlement_secure') {
        saves += 1
        const incoming = acceptanceRecord(body.p_document)
        const lines = acceptanceRows(incoming.lines)
        expect(lines[0].carrier_id).toBeTruthy()
        expect(lines[0].supplier_id ?? null).toBeNull()
        expect(lines[0].fund_account_id ?? null).toBeNull()
        const previous = bills.find((bill) => bill.id === incoming.id)
        if (!previous) throw new Error('Missing expected transport payment fixture')
        const saved = { ...previous, version: previous.version + 1 }
        bills = bills.map((bill) => (bill.id === saved.id ? saved : bill))
        return route.fulfill({ json: saved })
      }
      if (endpoint === 'fms_act_payable_settlement_secure') {
        const action = typeof body.p_action === 'string' ? body.p_action : ''
        const selected = normalizeStringList(body.p_ids)
        mutations.push(action)
        const next: Record<string, string> = {
          submit: 'submitted',
          approve: 'approved',
          confirm: 'confirmed'
        }
        bills = bills.map((bill) =>
          selected.includes(bill.id)
            ? {
                ...bill,
                status: next[action],
                payment_status: action === 'confirm' ? 'full' : 'none'
              }
            : bill
        )
        return route.fulfill({ json: bills.filter((bill) => selected.includes(bill.id)) })
      }
      if (endpoint === 'fms_payable_settlement_voucher_secure') {
        expect(body.p_preview).toBe(true)
        return route.fulfill({
          json: {
            status: 'pending_configuration',
            lines: [],
            voucher_ids: [],
            message: '请配置非现金付款确认事件；本次没有资金流水或默认银行凭证。'
          }
        })
      }
      return route.fulfill({ json: [] })
    })
    await page.goto(
      `/tests/e2e/fixtures/purchase-payable.html?kind=payment&theme=${theme}&box=${theme === 'dark' ? 'shadow-mode' : 'border-mode'}`,
      { waitUntil: 'domcontentloaded', timeout: 120_000 }
    )
    const rows = page.locator('.art-table-query .el-table__body-wrapper tbody tr')
    await expect(rows).toHaveCount(2)
    for (const index of [1, 2]) {
      const row = rows.filter({ hasText: `FK-NONCASH-${index}` })
      await row.getByRole('button', { name: '编辑', exact: true }).click()
      const drawer = page.getByRole('dialog')
      const detail = drawer.locator('.el-table__body-wrapper tbody tr')
      await expect(detail.getByText(`示例承运商${index}`, { exact: true })).toHaveCount(2)
      await expect(drawer.getByRole('combobox', { name: '往来单位', exact: true })).toHaveCount(0)
      await expect(drawer).toContainText('虚拟结算只作账务核销，不生成资金流水')
      await expect(drawer.getByRole('combobox', { name: '付款账号', exact: true })).toHaveValue('')
      await expect(page.locator('.el-message:visible')).toHaveCount(0)
      await captureBusinessEvidence(drawer, {
        path: info.outputPath(`virtual-${theme}-editor-${index}.png`)
      })
      await detail.getByText(`示例承运商${index}`, { exact: true }).first().scrollIntoViewIfNeeded()
      await captureBusinessEvidence(drawer, {
        path: info.outputPath(`virtual-${theme}-carrier-${index}.png`)
      })
      await drawer.getByRole('combobox', { name: '付款账号', exact: true }).scrollIntoViewIfNeeded()
      await captureBusinessEvidence(drawer, {
        path: info.outputPath(`virtual-${theme}-account-${index}.png`)
      })
      await drawer.getByRole('button', { name: '保存', exact: true }).click()
      await expect(drawer).toBeHidden()
      for (const action of ['提交', '审核']) {
        await row.getByRole('checkbox').locator('..').click()
        await page.getByRole('button', { name: action, exact: true }).click()
        await expect(row).toContainText(action === '提交' ? '已提交' : '已审核')
      }
      await row.getByRole('checkbox').locator('..').click()
      await page.getByRole('button', { name: '确认付款', exact: true }).click()
      await page.getByRole('menuitem', { name: '确认付款', exact: true }).click()
      await expect(page.locator('.el-message-box')).toContainText('虚拟结算不生成资金流水')
      await page.getByRole('button', { name: '确认登记', exact: true }).click()
      await expect(row).toContainText('已确认付款')
    }
    expect(saves).toBe(2)
    expect(mutations).toEqual(['submit', 'approve', 'confirm', 'submit', 'approve', 'confirm'])
    await rows.first().getByRole('checkbox').locator('..').click()
    await page.getByRole('button', { name: '生成凭证', exact: true }).click()
    await page.getByRole('menuitem', { name: '预览凭证', exact: true }).click()
    const preview = page.getByRole('dialog')
    await expect(preview).toContainText('请配置非现金付款确认事件')
    await expect(page.locator('.el-message:visible')).toHaveCount(0)
    await captureBusinessEvidence(preview, {
      path: info.outputPath(`virtual-${theme}-posting-pending.png`)
    })
    expect(errors).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}

test('两笔运输虚拟结算在逆序选择时仍仅核销原财务应付', async ({ page }, info) => {
  const writes: unknown[] = []
  const errors: string[] = []
  let completed = false
  page.on('pageerror', (error) => errors.push(error.message))
  const candidate = (index: number, side: 'ap' | 'payment') => ({
    id: `${side}-${index}`,
    tenantId: tenant,
    documentNo: `${side === 'ap' ? 'CWYF' : 'FK'}-VIRTUAL-${index}`,
    businessDate: '2026-10-25',
    supplierId: '',
    supplierName: '示例运输承运商',
    counterpartyKey: 'carrier:shared',
    currencyCode: 'CNY',
    amount: index * 10,
    availableAmount: index * 10,
    sameSourceOnly: true,
    ...(side === 'payment' ? { sourcePayableId: `ap-${index}` } : {})
  })
  await page.route('**/rest/v1/**', (route) => {
    const endpoint = new URL(route.request().url()).pathname.split('/').pop()
    if (endpoint === 'fms_payable_writeoff_workspace_secure')
      return route.fulfill({
        json: {
          primary: completed ? [] : [candidate(1, 'ap'), candidate(2, 'ap')],
          secondary: completed ? [] : [candidate(2, 'payment'), candidate(1, 'payment')],
          history: [],
          organizations: [],
          schemes: [
            {
              id: 'transport-manual',
              tenantId: tenant,
              code: 'QA-TMS-MANUAL',
              name: '运输原单手工核销',
              enabled: true,
              automatic: false
            }
          ]
        }
      })
    if (endpoint === 'fms_payable_writeoff_secure') {
      const body = acceptanceRecord(route.request().postDataJSON())
      writes.push(body.p_items)
      expect(body.p_scheme_id).toBe('transport-manual')
      completed = true
      return route.fulfill({ json: ['writeoff-2', 'writeoff-1'] })
    }
    return route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/purchase-payable.html?kind=writeoff')
  await expect(page.getByText('CWYF-VIRTUAL-2', { exact: true })).toBeVisible()
  await expect(page.getByText('运输虚拟结算仅按原财务应付匹配，不生成资金流水。')).toBeVisible()
  const headers = page.locator('.el-table__header-wrapper label.el-checkbox')
  await headers.nth(0).click()
  await headers.nth(1).click()
  await page.getByRole('button', { name: '核销', exact: true }).click()
  const confirmation = page.locator('.el-message-box')
  await expect(confirmation).toContainText('30.00')
  await captureBusinessEvidence(page, {
    path: info.outputPath('transport-source-bound-confirmation.png'),
    fullPage: true
  })
  await confirmation.getByRole('button', { name: '执行核销', exact: true }).click()
  await expect(page.getByText('暂无待核销应付', { exact: true })).toBeVisible()
  expect(writes).toEqual([
    [
      { payable_id: 'ap-2', payment_line_id: 'payment-2', amount: 20 },
      { payable_id: 'ap-1', payment_line_id: 'payment-1', amount: 10 }
    ]
  ])
  expect(errors).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
