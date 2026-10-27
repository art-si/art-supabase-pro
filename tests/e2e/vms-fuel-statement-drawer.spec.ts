import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(180_000)

const tenantId = '11111111-1111-4111-8111-111111111111'
const occurredAt = '2026-10-20T08:00:00+08:00'
const ledgerEntry = {
  id: 'entry-1',
  tenantId,
  cardId: 'card-1',
  cardNo: 'QA-CARD-001',
  vehicleId: 'vehicle-1',
  plateNo: '测A·10001',
  companyName: null,
  cardStatus: 'active',
  driverId: null,
  driverName: null,
  stationName: '测试加油站',
  liters: 20,
  unitPrice: 6,
  paymentMethod: 'fuel_card',
  voucherPaths: ['fuel/receipt-1.png'],
  sourceCostId: null,
  sourceCostNo: null,
  cardBalance: 880,
  rechargeChannel: '',
  invoiceNo: '',
  rechargerEmployeeId: null,
  rechargerEmployeeName: null,
  waybillId: null,
  waybillNo: null,
  occurredAt,
  expenseLocation: '',
  odometerKm: null,
  tripFuelPer100Km: null,
  entryType: 'consume',
  amount: 120,
  signedAmount: -120,
  balanceAfter: 880,
  occurredOn: '2026-10-20',
  referenceNo: 'QA-CM-001',
  remark: '',
  reversesEntryId: null,
  isReversed: false,
  createTime: occurredAt
}
const batch = {
  id: 'batch-1',
  tenantId,
  fileName: '测试站点账单.csv',
  fileSha256: 'ab'.repeat(32),
  rowCount: 2,
  importedAt: occurredAt,
  matched: 0,
  difference: 1,
  unmatched: 1
}
const statementRows = [
  {
    id: 'statement-row-1',
    tenantId,
    batchId: batch.id,
    sourceRow: 2,
    cardNo: ledgerEntry.cardNo,
    occurredAt,
    stationName: '测试加油站',
    liters: 20,
    amount: 120,
    matchStatus: 'difference',
    matchedEntryId: ledgerEntry.id,
    ledgerAmount: 118,
    amountDifference: 2,
    ledgerOccurredAt: occurredAt,
    ledgerStationName: '测试加油站',
    ledgerLiters: 20,
    reconciledAt: occurredAt
  },
  {
    id: 'statement-row-2',
    tenantId,
    batchId: batch.id,
    sourceRow: 3,
    cardNo: 'QA-CARD-MISSING',
    occurredAt,
    stationName: '未匹配站点',
    liters: 10,
    amount: 60,
    matchStatus: 'unmatched',
    matchedEntryId: null,
    ledgerAmount: null,
    amountDifference: null,
    ledgerOccurredAt: null,
    ledgerStationName: null,
    ledgerLiters: null,
    reconciledAt: occurredAt
  }
]

for (const variant of [
  { width: 1280, theme: 'light' },
  { width: 570, theme: 'dark' }
] as const) {
  test(`加油站对账 ${variant.width}px ${variant.theme} 加载、空态、失败重试与导入提示`, async ({
    page
  }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setViewportSize({ width: variant.width, height: 900 })
    let rowState: 'success' | 'empty' | 'error' = 'success'
    let holdFirstRows = true
    let releaseFirstRows: (() => void) | undefined
    await page.route('**/rest/v1/**', async (route) => {
      const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
      if (endpoint === 'vms_list_fuel_card_entries_secure')
        return route.fulfill({ json: { records: [ledgerEntry], total: 1 } })
      if (endpoint === 'vms_list_fuel_cards_secure')
        return route.fulfill({ json: { records: [], total: 0 } })
      if (endpoint === 'vms_list_fuel_statement_batches_secure')
        return route.fulfill({ json: [batch] })
      if (endpoint === 'vms_list_fuel_statement_rows_secure') {
        if (holdFirstRows) {
          holdFirstRows = false
          await new Promise<void>((resolve) => {
            releaseFirstRows = resolve
          })
        }
        if (rowState === 'error')
          return route.fulfill({ status: 503, json: { code: 'XX000', message: 'temporary error' } })
        return route.fulfill({ json: rowState === 'empty' ? [] : statementRows })
      }
      if (endpoint === 'vms_reconcile_fuel_statement_secure')
        return route.fulfill({
          json: { batchId: batch.id, matched: 0, difference: 1, unmatched: 1 }
        })
      if (endpoint === 'sys_dictionary') return route.fulfill({ json: [] })
      return route.fulfill({ json: [] })
    })
    await page.goto('/tests/e2e/fixtures/vms-fuel-card-visual.html?page=ledger', {
      waitUntil: 'domcontentloaded'
    })
    await page.evaluate(
      (theme) => document.documentElement.classList.toggle('dark', theme === 'dark'),
      variant.theme
    )
    const voucher = page.getByRole('button', { name: '查看 QA-CARD-001 的 1 张现场凭证' })
    await expect(voucher).toBeVisible({ timeout: 60_000 })
    expect(
      await voucher.locator('.art-icon-label').evaluate((element) => getComputedStyle(element).gap)
    ).not.toBe('0px')
    await page.screenshot({ path: info.outputPath('ledger-voucher.png'), fullPage: true })

    await page.getByRole('button', { name: '站点对账', exact: true }).click()
    const drawer = page.getByRole('dialog', { name: '加油站对账' })
    await expect(drawer).toBeVisible()
    await expect.poll(() => Boolean(releaseFirstRows)).toBe(true)
    await expect(drawer.locator('.art-table')).toHaveAttribute('aria-busy', 'true')
    await drawer.screenshot({ path: info.outputPath('loading.png'), animations: 'disabled' })
    releaseFirstRows?.()
    const difference = drawer.locator('.fuel-statement-difference-row')
    await expect(difference).toContainText('QA-CARD-001')
    await expect(difference).toContainText('¥2.00')
    await expect(drawer.locator('.fuel-statement-unmatched-row')).toContainText('未匹配')
    await drawer.screenshot({ path: info.outputPath('success.png'), animations: 'disabled' })

    await drawer.locator('input[type="file"]').setInputFiles({
      name: 'invalid-statement.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('油卡号,消费时间,金额,加油升数,加油站\n,2026-10-20,120,20,测试加油站\n')
    })
    await expect(page.locator('.el-message--error')).toContainText('第 2 行缺少卡号')

    rowState = 'empty'
    await drawer.getByRole('button', { name: '重新核对', exact: true }).click()
    await expect(drawer.getByText('该批次暂无对账明细')).toBeVisible()
    await drawer.screenshot({ path: info.outputPath('empty.png'), animations: 'disabled' })

    rowState = 'error'
    await drawer.getByRole('button', { name: '重新核对', exact: true }).click()
    await expect(drawer.getByText('对账明细加载失败，请重试。')).toBeVisible()
    await drawer.screenshot({ path: info.outputPath('error.png'), animations: 'disabled' })
    rowState = 'success'
    await drawer.getByRole('button', { name: '重试', exact: true }).click()
    await expect(drawer.locator('.fuel-statement-difference-row')).toContainText('QA-CARD-001')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true
    )
    expect(errors).toEqual([])
  })
}
