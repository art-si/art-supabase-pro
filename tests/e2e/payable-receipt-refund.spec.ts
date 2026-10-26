import { expect, test, type Page } from '@playwright/test'
import { captureBusinessEvidence } from './support/capture-business-evidence'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(150000)

const tenant = '11111111-1111-4111-8111-111111111111'
const relations = [
  { value: 'payable_payment', label: '应付付款核销' },
  { value: 'payment_refund', label: '付款冲退款' },
  { value: 'payable_receivable', label: '应付冲应收' },
  { value: 'payable_red_blue', label: '应付红蓝对冲' },
  { value: 'payable_refund', label: '应付退款核销' }
]
const scheme = {
  id: 'refund-scheme',
  tenant_id: tenant,
  code: 'SUPPLIER_REFUND',
  name: '供应商退款核销方案',
  enabled: true,
  automatic: true,
  version: 2,
  relation_rules: [
    {
      relation: 'payable_refund',
      rules: [
        {
          primary_field: 'supplier_id',
          secondary_field: 'supplier_id',
          operator: 'eq',
          empty_matches: false
        }
      ]
    }
  ]
}

test('退款历史缺失或脱敏金额不显示伪零、汇总 NaN 或借用另一方金额', async ({ page }, info) => {
  const history = [null, '***'].map((value, index) => ({
    ...record(index + 1),
    document_no: null,
    amount: value,
    receipt_amount: value,
    payable_base_amount: value,
    receipt_base_amount: value,
    exchange_difference: value
  }))
  await page.route('**/rest/v1/**', (route) => {
    if (route.request().url().endsWith('/rpc/fms_payable_writeoff_workspace_secure'))
      return route.fulfill({
        json: { primary: [], secondary: [], history, schemes: [scheme], relations }
      })
    if (new URL(route.request().url()).pathname.endsWith('/sys_dictionary'))
      return route.fulfill({
        json: [
          {
            id: 'active-state',
            value: 'active',
            label: '已核销',
            code: 'active',
            status: '1',
            dict_type_table: { code: 'fmsPayableWriteoffRecordStatus' }
          }
        ]
      })
    return route.fulfill({ json: [] })
  })
  await page.goto(
    '/tests/e2e/fixtures/purchase-payable.html?kind=writeoff&relation=payable_refund&tab=history',
    { waitUntil: 'domcontentloaded', timeout: 120000 }
  )
  await expect(page.getByRole('tab', { name: '核销记录（2）', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect(page.locator('.payable-writeoff-page')).not.toContainText('NaN')
  for (const index of [1, 2]) {
    const row = page
      .locator('tbody tr')
      .filter({ hasText: `APHX-REFUND-${index}` })
      .first()
    await row.getByRole('button', { name: '查看核销记录', exact: true }).click()
    const detail = page.getByRole('dialog', { name: '应付退款核销记录', exact: true })
    for (const label of [
      '主方原币金额',
      '辅方原币金额',
      '主方本位币金额',
      '辅方本位币金额',
      '汇兑差额(本位币)'
    ]) {
      const field = detail
        .getByRole('cell', { name: label, exact: true })
        .locator('xpath=following-sibling::*[1]')
      await expect(field).toHaveText(index === 1 ? '--' : '***')
    }
    await expect(detail).toContainText('核销状态')
    await expect(detail).toContainText('已核销')
    await captureBusinessEvidence(detail, {
      path: info.outputPath(`supplier-refund-sensitive-${index}.png`)
    })
    await detail.getByRole('button', { name: /关闭此/ }).click()
  }
})

test('核销记录深链打开两条实际来源记录，失败保留链接并可重试', async ({ page }, info) => {
  let fail = false
  let detailReads = 0
  const records = [record(1), { ...record(2), document_no: null, status: 'reversed' }]
  await page.route('**/rest/v1/**', (route) => {
    const rpc = new URL(route.request().url()).pathname.split('/').pop()
    if (rpc === 'fms_payable_writeoff_workspace_secure')
      return route.fulfill({
        json: { primary: [], secondary: [], history: records, schemes: [scheme], relations }
      })
    if (rpc === 'fms_get_payable_writeoff_record_secure') {
      detailReads++
      if (fail)
        return route.fulfill({
          status: 503,
          json: { code: 'XX000', message: 'unavailable internal service' }
        })
      const id = route.request().postDataJSON().p_id
      return route.fulfill({ json: records.find((row) => row.id === id) })
    }
    return route.fulfill({ json: [] })
  })
  for (const index of [1, 2]) {
    await page.goto(
      `/tests/e2e/fixtures/purchase-payable.html?kind=writeoff&recordId=record-${index}&relation=payable_payment`,
      { waitUntil: 'domcontentloaded', timeout: 120000 }
    )
    const detail = page
      .getByRole('dialog')
      .filter({ hasText: index === 1 ? 'APHXD-REFUND-1' : 'APHX-REFUND-2' })
      .first()
    await expect(detail).toBeVisible()
    await expect(detail).toContainText(`示例退款收款方${index}`)
    await expect(page.getByRole('tab', { name: /^核销记录/ })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    await captureBusinessEvidence(detail, {
      path: info.outputPath(`refund-linked-record-${index}.png`)
    })
    await detail.getByRole('button', { name: /关闭此/ }).click()
  }
  fail = true
  await page.goto(
    '/tests/e2e/fixtures/purchase-payable.html?kind=writeoff&recordId=record-1&relation=payable_refund',
    { waitUntil: 'domcontentloaded' }
  )
  await expect(page.getByText('关联核销记录暂未打开', { exact: true })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText('unavailable internal service')
  fail = false
  await page.getByRole('button', { name: '重新打开核销记录', exact: true }).click()
  await expect(page.getByRole('dialog').filter({ hasText: 'APHXD-REFUND-1' })).toBeVisible()
  expect(detailReads).toBe(4)
})
const candidate = (index: number, secondary: boolean, foreign = false) => ({
  id: `${secondary ? 'receipt-line' : 'credit'}-${index}`,
  document_id: `${secondary ? 'receipt' : 'credit'}-${index}`,
  tenant_id: tenant,
  supplier_id: `supplier-${index}`,
  supplier_name: `示例退款供应商${index}`,
  document_no: `${secondary ? 'RC' : 'AP-RED'}-202610-00${index}`,
  business_date: '2026-10-24',
  document_type_name: secondary ? '供应商退款收款' : '红字财务应付',
  currency_code: foreign ? (secondary ? 'EUR' : 'USD') : 'CNY',
  base_currency_code: 'CNY',
  exchange_rate: foreign ? (secondary ? 8 : 7) : 1,
  account_set_id: 'book-1',
  account_set_name: '示例人民币核算账套',
  amount: (secondary ? 1 : -1) * (foreign ? (secondary ? 90 : 100) : index * 20),
  available_amount: foreign ? (secondary ? 90 : 100) : index * 20,
  match_values: { execution_id: secondary ? `execution-${index}` : undefined }
})
const record = (index: number) => ({
  id: `record-${index}`,
  tenant_id: tenant,
  relation: 'payable_refund',
  supplier_id: `supplier-${index}`,
  supplier_name: `示例退款供应商${index}`,
  counterparty_name: `示例主方身份${index}`,
  secondary_supplier_name: `示例退款收款方${index}`,
  record_no: `APHX-REFUND-${index}`,
  document_no: `APHXD-REFUND-${index}`,
  payable_no: `AP-RED-202610-00${index}`,
  payment_no: `RC-202610-00${index}`,
  writeoff_date: '2026-10-24',
  amount: 100,
  receipt_amount: 90,
  payable_base_amount: 700,
  receipt_base_amount: 720,
  exchange_difference: -20,
  currency_code: 'USD',
  secondary_currency_code: 'EUR',
  base_currency_code: 'CNY',
  primary_exchange_rate: 7,
  secondary_exchange_rate: 8,
  needs_voucher: true,
  status: 'active',
  remark: '示例退款核销'
})

async function openRefund(page: Page, theme: string, box: string): Promise<void> {
  await page.goto(
    `/tests/e2e/fixtures/purchase-payable.html?kind=writeoff&theme=${theme}&box=${box}`,
    {
      waitUntil: 'domcontentloaded',
      timeout: 120000
    }
  )
  await page.getByRole('radio', { name: '应付退款核销', exact: true }).locator('..').click()
  await expect(
    page.getByRole('region', { name: '供应商退款收款单', exact: true }).locator('tbody tr')
  ).not.toHaveCount(0)
  await page.getByRole('combobox', { name: '核销方案', exact: true }).click()
  await page.getByRole('option', { name: scheme.name, exact: true }).click()
}

async function selectBoth(page: Page): Promise<void> {
  for (const name of ['红字财务应付单', '供应商退款收款单']) {
    await page
      .getByRole('region', { name, exact: true })
      .locator('.el-table__header-wrapper .el-checkbox')
      .first()
      .click()
  }
}

for (const theme of ['light', 'dark']) {
  const box = theme === 'dark' ? 'shadow-mode' : 'border-mode'
  test(`退款核销 ${theme} 异币手工重试保持幂等请求并正确显示双方与损益`, async ({ page }, info) => {
    const requests: Array<{ p_items: Array<Record<string, unknown>> }> = []
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    let written = false
    await page.route('**/rest/v1/**', async (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)
      if (name === 'fms_payable_writeoff_workspace_secure') {
        expect(route.request().postDataJSON().p_query.client_version).toBe(2)
        return route.fulfill({
          json: {
            primary: written ? [] : [candidate(1, false, true)],
            secondary: written ? [] : [candidate(1, true, true)],
            history: written ? [record(1), record(2)] : [],
            schemes: [scheme],
            relations
          }
        })
      }
      if (name === 'fms_payable_writeoff_secure') {
        requests.push(route.request().postDataJSON())
        if (requests.length === 1)
          return route.fulfill({
            status: 503,
            json: { code: 'P0001', message: '核销结果暂不可确认，请查询后重试' }
          })
        written = true
        return route.fulfill({ json: ['record-1'] })
      }
      return route.fulfill({ json: [] })
    })
    await openRefund(page, theme, box)
    await captureBusinessEvidence(page, {
      path: info.outputPath(`supplier-refund-${theme}-candidates.png`),
      fullPage: true
    })
    for (const attempt of [1, 2]) {
      await selectBoth(page)
      await page.getByRole('button', { name: '核销', exact: true }).click()
      const confirmation = page.getByRole('dialog', { name: '核销确认', exact: true })
      await expect(confirmation).toContainText('双方原记账汇率')
      await confirmation.getByRole('button', { name: '执行核销', exact: true }).click()
      await expect.poll(() => requests.length).toBe(attempt)
      if (attempt === 1) {
        await expect(
          page.getByText('核销结果暂不可确认，请查询后重试', { exact: true })
        ).toBeVisible()
        await expect(page.getByRole('button', { name: '刷新', exact: true })).toBeEnabled()
      }
    }
    expect(requests[0].p_items).toEqual(requests[1].p_items)
    expect(requests[1].p_items[0]).toMatchObject({
      relation: 'payable_refund',
      payable_id: 'credit-1',
      receipt_line_id: 'receipt-line-1',
      amount: 100,
      receipt_amount: 90
    })
    expect(requests[1].p_items[0].request_id).toMatch(/^[0-9a-f-]{36}$/)
    await expect(page.getByText('应付退款核销已完成', { exact: true })).toBeVisible()
    await page.getByRole('tab', { name: '核销单（2）', exact: true }).click()
    await page.getByRole('button', { name: 'APHXD-REFUND-1', exact: true }).click()
    const detail = page.getByRole('dialog', { name: '应付核销单', exact: true })
    await expect(detail.getByText('示例退款收款方1', { exact: true })).toBeVisible()
    await expect(detail.getByText('收益 ¥20.00', { exact: true })).toBeVisible()
    await expect(detail.getByText('示例主方身份1', { exact: true })).toHaveCount(0)
    await captureBusinessEvidence(detail, {
      path: info.outputPath(`supplier-refund-${theme}-detail.png`)
    })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(errors).toEqual([])
  })

  test(`退款核销 ${theme} 两笔自动清单保留原币与汇率口径`, async ({ page }, info) => {
    let executed = false
    const requests: Array<Record<string, unknown>> = []
    await page.route('**/rest/v1/**', async (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)
      if (name === 'fms_payable_writeoff_workspace_secure')
        return route.fulfill({
          json: {
            primary: executed ? [] : [candidate(1, false), candidate(2, false)],
            secondary: executed ? [] : [candidate(1, true), candidate(2, true)],
            history: [],
            schemes: [scheme],
            relations
          }
        })
      if (name === 'fms_auto_payable_writeoff_secure') {
        const request = route.request().postDataJSON()
        requests.push(request)
        expect(request.p_query.relation).toBe('payable_refund')
        expect(request.p_query.as_of_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        if (request.p_execute) {
          expect(request.p_plan_token).toBe('refund-plan')
          executed = true
        }
        return route.fulfill({
          json: {
            items: [1, 2].map((index) => ({
              relation: 'payable_refund',
              payable_id: `credit-${index}`,
              receipt_line_id: `receipt-line-${index}`,
              payable_no: `AP-RED-202610-00${index}`,
              payment_no: `RC-202610-00${index}`,
              supplier_name: `示例退款供应商${index}`,
              payment_supplier_name: `示例退款收款方${index}`,
              amount: index * 20,
              receipt_amount: index * 20,
              currency_code: 'CNY',
              secondary_currency_code: 'CNY',
              base_currency_code: 'CNY',
              exchange_difference: 0,
              needs_voucher: false
            })),
            record_count: 2,
            plan_token: 'refund-plan',
            record_ids: executed ? ['record-1', 'record-2'] : [],
            executed,
            total_amount: 60,
            scheme_name: scheme.name,
            message: executed ? '已完成 2 笔退款核销，未发起银行付款。' : '按双方原记账汇率核销。'
          }
        })
      }
      return route.fulfill({ json: [] })
    })
    await openRefund(page, theme, box)
    await page.getByRole('button', { name: '按方案自动核销', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '按方案自动核销', exact: true })
    await expect(dialog.locator('tbody tr')).toHaveCount(2)
    await expect(dialog.getByRole('radio', { name: '本位币等值分配', exact: true })).toBeChecked()
    await dialog.getByRole('radio', { name: '匹配余量全部对冲', exact: true }).locator('..').click()
    await expect(
      dialog.getByText('异币匹配双方可用余量将全部对冲，差额计入汇兑损益，请逐行核对原币金额。', {
        exact: true
      })
    ).toBeVisible()
    await expect.poll(() => requests.filter((entry) => entry.p_execute === false).length).toBe(2)
    await captureBusinessEvidence(dialog, {
      path: info.outputPath(`supplier-refund-${theme}-automatic.png`)
    })
    await dialog.getByRole('button', { name: '确认自动核销', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    expect(executed).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })

  test(`退款核销 ${theme} 取消再确认到账不复用旧资金执行的请求身份`, async ({ page }) => {
    const requests: Array<{ p_items: Array<Record<string, unknown>> }> = []
    let execution = 'execution-before-cancellation'
    let written = false
    await page.route('**/rest/v1/**', async (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)
      if (name === 'fms_payable_writeoff_workspace_secure')
        return route.fulfill({
          json: {
            primary: written ? [] : [candidate(1, false)],
            secondary: written
              ? []
              : [{ ...candidate(1, true), match_values: { execution_id: execution } }],
            history: [],
            schemes: [scheme],
            relations
          }
        })
      if (name === 'fms_payable_writeoff_secure') {
        requests.push(route.request().postDataJSON())
        if (requests.length === 1) {
          execution = 'execution-after-reconfirmation'
          return route.fulfill({
            status: 503,
            json: { code: 'P0001', message: '核销结果暂不可确认，请查询后重试' }
          })
        }
        written = true
        return route.fulfill({ json: ['reconfirmed-record'] })
      }
      return route.fulfill({ json: [] })
    })
    await openRefund(page, theme, box)
    for (const attempt of [1, 2]) {
      await selectBoth(page)
      await page.getByRole('button', { name: '核销', exact: true }).click()
      await page
        .getByRole('dialog', { name: '核销确认', exact: true })
        .getByRole('button', { name: '执行核销', exact: true })
        .click()
      await expect.poll(() => requests.length).toBe(attempt)
      if (attempt === 1)
        await expect(page.getByRole('button', { name: '刷新', exact: true })).toBeEnabled()
    }
    expect(requests[0].p_items[0].request_id).not.toBe(requests[1].p_items[0].request_id)
    await expect(page.getByText('应付退款核销已完成', { exact: true })).toBeVisible()
  })

  test(`退款核销 ${theme} 无需记账及已撤销的两条记录仍可联查详情`, async ({ page }, info) => {
    const history = [1, 2].map((index) => ({
      ...record(index),
      document_no: null,
      amount: index * 20,
      receipt_amount: index * 20,
      payable_base_amount: index * 20,
      receipt_base_amount: index * 20,
      exchange_difference: 0,
      currency_code: 'CNY',
      secondary_currency_code: 'CNY',
      primary_exchange_rate: 1,
      secondary_exchange_rate: 1,
      needs_voucher: index === 2,
      status: index === 2 ? 'reversed' : 'active'
    }))
    await page.route('**/rest/v1/**', async (route) => {
      if (route.request().url().endsWith('/rpc/fms_payable_writeoff_workspace_secure'))
        return route.fulfill({
          json: { primary: [], secondary: [], history, schemes: [scheme], relations }
        })
      return route.fulfill({ json: [] })
    })
    await page.goto(
      `/tests/e2e/fixtures/purchase-payable.html?kind=writeoff&theme=${theme}&box=${box}&relation=payable_refund&tab=history`,
      { waitUntil: 'domcontentloaded', timeout: 120000 }
    )
    await expect(page.getByRole('tab', { name: '核销记录（2）', exact: true })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    for (const index of [1, 2]) {
      const row = page
        .locator('tbody tr')
        .filter({ hasText: `APHX-REFUND-${index}` })
        .first()
      await expect(row.getByRole('button', { name: '预览凭证', exact: true })).toHaveCount(0)
      await row.getByRole('button', { name: '查看核销记录', exact: true }).click()
      const detail = page.getByRole('dialog', { name: '应付退款核销记录', exact: true })
      await expect(detail).toContainText(`APHX-REFUND-${index}`)
      await expect(detail).toContainText(`示例退款收款方${index}`)
      if (index === 1)
        await captureBusinessEvidence(detail, {
          path: info.outputPath(`supplier-refund-${theme}-non-voucher-detail.png`)
        })
      await detail.getByRole('button', { name: /关闭此/ }).click()
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}
