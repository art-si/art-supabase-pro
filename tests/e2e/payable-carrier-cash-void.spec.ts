import { expect, test, type Page } from '@playwright/test'
import { captureBusinessEvidence } from './support/capture-business-evidence'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 20_000 })
test.setTimeout(120_000)

const tenant = '11111111-1111-4111-8111-111111111111'
const makeRows = () =>
  [1, 2].map((index) => ({
    id: `11111111-1111-4111-8111-11111111111${index}`,
    tenant_id: tenant,
    transaction_no: `CP-QA-CARRIER-${index}`,
    direction: 'payment',
    carrier_id: `22222222-2222-4222-8222-22222222222${index}`,
    counterparty_name: `虚构运输付款单位${index}`,
    transaction_date: '2026-10-23',
    amount: index * 120,
    allocated_amount: 0,
    unallocated_amount: index * 120,
    principal_amount: index * 120,
    fee_amount: 0,
    allocatable_amount: index * 120,
    allocation_count: 0,
    payment_method: 'cash',
    status: 'pending_allocation',
    create_time: '2026-10-23T00:00:00Z',
    update_time: '2026-10-23T00:00:00Z',
    field_access: { transactionAmounts: 'edit', paymentEvidence: 'read' },
    managed_payment: { linked: true, document_no: `FK-QA-CARRIER-${index}` }
  }))

async function mockCash(
  page: Page,
  mode: {
    failed?: boolean
    readOnly?: boolean
    stale?: boolean
    fees?: boolean
    amountAccess?: 'masked' | 'hidden'
  } = {}
) {
  const rows = makeRows()
  if (mode.fees) {
    rows.forEach((row) => {
      row.amount += 5
      row.fee_amount = 5
      row.allocated_amount = 120
      row.unallocated_amount = row.amount - row.allocated_amount
      row.allocatable_amount = row.principal_amount - row.allocated_amount
      row.status = 'partially_allocated'
    })
  }
  function secureRow(row: (typeof rows)[number]) {
    if (!mode.amountAccess) return row
    const keys = [
      'amount',
      'allocated_amount',
      'unallocated_amount',
      'principal_amount',
      'fee_amount',
      'allocatable_amount'
    ]
    return {
      ...Object.fromEntries(
        Object.entries(row)
          .filter(([key]) => mode.amountAccess !== 'hidden' || !keys.includes(key))
          .map(([key, value]) => [
            key,
            keys.includes(key) && mode.amountAccess === 'masked' ? '***' : value
          ])
      ),
      field_access: { transactionAmounts: mode.amountAccess }
    }
  }
  const writes: Array<{ id: string; reason: string }> = []
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const name = url.pathname.split('/').at(-1)
    const body = route.request().postDataJSON() || {}
    if (name === 'sys_dictionary') {
      const code = url.searchParams.get('dict_type_table.code')?.replace(/^eq\./, '') || ''
      const values: Record<string, Array<[string, string]>> = {
        tmsCashDirection: [
          ['payment', '付款'],
          ['receipt', '收款']
        ],
        tmsCashPaymentMethod: [['cash', '现金']],
        tmsCashTransactionStatus: [
          ['pending_allocation', '待核销'],
          ['partially_allocated', '部分核销'],
          ['voided', '已作废']
        ]
      }
      return route.fulfill({
        json: (values[code] || []).map(([value, label], index) => ({
          id: `${code}-${value}`,
          code: value,
          label,
          name: label,
          value,
          status: '1',
          sort: index,
          dict_type_table: { code, name: code }
        }))
      })
    }
    if (name === 'tms_list_cash_transactions_secure')
      return route.fulfill({
        json: {
          records: rows.map(secureRow),
          total: rows.length,
          field_access: { transactionAmounts: mode.amountAccess || 'edit' }
        }
      })
    if (name === 'tms_get_cash_transaction_secure') {
      if (mode.failed)
        return route.fulfill({
          status: 503,
          json: { code: 'PGRST002', message: 'schema cache not ready' }
        })
      const record = rows.find((row) => row.id === body.p_id)
      return route.fulfill({
        json: record
          ? {
              ...secureRow(record),
              status: mode.stale ? 'allocated' : record.status,
              allocated_amount: mode.stale ? record.amount : record.allocated_amount,
              field_access: {
                transactionAmounts: mode.amountAccess || (mode.readOnly ? 'read' : 'edit')
              }
            }
          : null
      })
    }
    if (name === 'void_tms_cash_transaction_secure') {
      const record = rows.find((row) => row.id === body.p_transaction_id)
      if (!record) throw new Error('Unknown cash fixture')
      writes.push({ id: record.id, reason: body.p_reason })
      record.status = 'voided'
      return route.fulfill({ json: record.id })
    }
    return route.fulfill({ json: [] })
  })
  return { rows, writes, mode }
}

for (const theme of ['light', 'dark'] as const) {
  test(`运输流水两条关联付款作废说明与取消 ${theme}`, async ({ page }, info) => {
    const { rows, writes } = await mockCash(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`/tests/e2e/fixtures/purchase-payable.html?kind=cash&theme=${theme}`)
    await expect(page.getByRole('heading', { name: '收付款管理', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'AI 批量导入流水', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '发起承运商付款申请', exact: true })).toHaveCount(
      0
    )
    for (const [index, record] of rows.entries()) {
      const row = page
        .locator('.art-table-query tbody tr')
        .filter({ hasText: record.transaction_no })
      await row.getByRole('button', { name: '作废付款', exact: true }).click()
      const prompt = page.getByRole('dialog', { name: '作废付款', exact: true })
      await expect(prompt).toContainText(`FK-QA-CARRIER-${index + 1}`)
      await expect(prompt).toContainText('同步取消付款确认')
      await expect(prompt).toContainText('不代表银行发生退款')
      await captureBusinessEvidence(prompt, {
        path: info.outputPath(`carrier-void-${index + 1}.png`)
      })
      await prompt.getByRole('button', { name: '取消', exact: true }).click()
      expect(writes).toHaveLength(index)
      await row.getByRole('button', { name: '作废付款', exact: true }).click()
      await prompt.getByRole('textbox').fill(`虚构运输付款账面撤销-${index + 1}`)
      await prompt.getByRole('button', { name: '确认作废', exact: true }).click()
      await expect(row).toContainText('已作废')
      expect(writes).toHaveLength(index + 1)
      expect(writes[index]).toEqual({ id: record.id, reason: `虚构运输付款账面撤销-${index + 1}` })
    }
    expect(errors).toEqual([])
  })
}

for (const theme of ['light', 'dark'] as const) {
  test(`手续费不参与核销且弹窗重读本金 ${theme}`, async ({ page }, info) => {
    const fixture = await mockCash(page, { fees: true })
    await page.goto(
      `/tests/e2e/fixtures/purchase-payable.html?kind=cash&withAllocate=1&theme=${theme}`
    )
    const fullRow = page.locator('.art-table-query tbody tr').filter({
      hasText: fixture.rows[0].transaction_no
    })
    const partialRow = page.locator('.art-table-query tbody tr').filter({
      hasText: fixture.rows[1].transaction_no
    })
    await expect(fullRow).toContainText('手续费 ¥5.00 不参与核销')
    await expect(fullRow).toContainText('可核销 ¥0.00')
    await expect(fullRow.getByRole('button', { name: '继续核销', exact: true })).toHaveCount(0)
    await expect(partialRow).toContainText('可核销 ¥120.00')
    await expect(page.getByText('仍有可核销本金', { exact: true }).locator('..')).toContainText('1')
    await captureBusinessEvidence(page, { path: info.outputPath('cash-principal-list.png') })
    await fullRow.getByRole('button', { name: '查看', exact: true }).click()
    const drawer = page.getByRole('dialog', { name: '付款详情', exact: true })
    await expect(drawer).toContainText('核销本金')
    await expect(drawer).toContainText('手续费（不核销）')
    await expect(drawer).toContainText('可核销余额')
    await expect(drawer).toContainText('¥5.00')
    await captureBusinessEvidence(drawer, { path: info.outputPath('cash-principal-detail.png') })
    await drawer
      .getByText('完成核销后可在此查看关联对账单与核销金额。', { exact: true })
      .scrollIntoViewIfNeeded()
    await captureBusinessEvidence(drawer, {
      path: info.outputPath('cash-principal-detail-lower.png')
    })
    await page.keyboard.press('Escape')
    await expect(drawer).not.toBeVisible()
    await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
    await expect(page.getByRole('heading', { name: '收付款管理', exact: true })).not.toBeVisible()
    await expect(partialRow).toBeVisible()
    await captureBusinessEvidence(page, { path: info.outputPath('cash-principal-focus.png') })
    await page.getByRole('button', { name: '退出专注模式', exact: true }).click()
    await expect(page.getByRole('heading', { name: '收付款管理', exact: true })).toBeVisible()
    await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('heading', { name: '收付款管理', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    fixture.rows[1].allocatable_amount = 60
    fixture.rows[1].allocated_amount = 180
    fixture.rows[1].unallocated_amount = 65
    await partialRow.getByRole('button', { name: '继续核销', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: /继续核销 · CP-QA-CARRIER-2/ })
    await expect(dialog).toContainText('可核销本金 ¥60.00，不含手续费')
    await expect(dialog).toContainText('可核销 ¥60.00，本次核销 ¥0.00，剩余 ¥60.00')
    await expect(dialog).toContainText('手续费不参与应付核销')
    await captureBusinessEvidence(dialog, { path: info.outputPath('cash-principal-dialog.png') })
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    fixture.rows[1].allocatable_amount = 0
    fixture.rows[1].allocated_amount = 240
    fixture.rows[1].unallocated_amount = 5
    await partialRow.getByRole('button', { name: '继续核销', exact: true }).click()
    await expect(page.locator('.el-message')).toContainText('已无可核销本金')
    await expect(dialog).toHaveCount(0)
    expect(fixture.writes).toHaveLength(0)
  })
}

for (const access of ['masked', 'hidden'] as const) {
  test(`核销本金与手续费遵守${access}金额权限`, async ({ page }) => {
    await mockCash(page, { fees: true, amountAccess: access })
    await page.goto('/tests/e2e/fixtures/purchase-payable.html?kind=cash&withAllocate=1')
    const row = page.locator('.art-table-query tbody tr').filter({ hasText: 'CP-QA-CARRIER-1' })
    await expect(row).toBeVisible()
    await expect(row.getByRole('button', { name: '继续核销', exact: true })).toHaveCount(0)
    await expect(row).not.toContainText('¥5.00')
    await expect(row).not.toContainText('¥125.00')
    await expect(page.getByText('金额不可见，不统计待核销数', { exact: true })).toBeVisible()
    if (access === 'hidden')
      await expect(page.getByRole('columnheader', { name: '核销余额', exact: true })).toHaveCount(0)
    else await expect(row).toContainText('可核销 ***')
  })
}

for (const mode of ['permission', 'readOnly', 'failed', 'stale'] as const) {
  test(`运输流水作废在${mode}时停止且可恢复`, async ({ page }) => {
    const fixture = await mockCash(page, {
      failed: mode === 'failed',
      readOnly: mode === 'readOnly',
      stale: mode === 'stale'
    })
    await page.goto(
      `/tests/e2e/fixtures/purchase-payable.html?kind=cash${mode === 'permission' ? '&withoutConfirm=1' : ''}`
    )
    const row = page
      .locator('.art-table-query tbody tr')
      .filter({ hasText: fixture.rows[0].transaction_no })
    await row.getByRole('button', { name: '作废付款', exact: true }).click()
    await expect(page.locator('.el-message')).toContainText(
      mode === 'permission'
        ? '取消付款确认权限'
        : mode === 'readOnly'
          ? '金额字段为只读'
          : mode === 'stale'
            ? '状态或核销金额已变化'
            : '稍后重试'
    )
    await expect(page.getByRole('dialog', { name: '作废付款', exact: true })).toHaveCount(0)
    expect(fixture.writes).toHaveLength(0)
    await expect(row.getByRole('button', { name: '作废付款', exact: true })).toBeEnabled()
    if (mode !== 'permission') {
      fixture.mode.failed = false
      fixture.mode.readOnly = false
      fixture.mode.stale = false
      await row.getByRole('button', { name: '作废付款', exact: true }).click()
      await expect(page.getByRole('dialog', { name: '作废付款', exact: true })).toBeVisible()
    }
  })
}
