import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test('银行流水真实文件导入后复用公共金额格式', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/functions/v1/ai-bank-statement-batch-match', async (route) => {
    const body = route.request().postDataJSON()
    expect(body.action).toBe('analyze')
    expect(body.rows).toHaveLength(3)
    await route.fulfill({
      json: {
        artifactId: 'test-artifact',
        runId: 'test-run',
        generatedAt: '2026-10-09T08:00:00Z',
        mapping: {},
        usedAi: false,
        confidence: 0.9,
        reviewConfidenceThreshold: 0.8,
        summary: { ready: 1, review: 0, duplicate: 0, invalid: 2 },
        rows: [1234.5, 0, -1234.5].map((amount, index) => ({
          rowId: `row-${index}`,
          sourceRow: index + 2,
          status: index === 0 ? 'ready' : 'invalid',
          direction: 'receipt',
          transactionDate: '2026-10-09',
          amount,
          bankReference: `BANK-${index}`,
          counterpartyName: '测试单位',
          counterpartyId: 'test-customer',
          counterpartyScore: 90,
          paymentMethod: 'bank_transfer',
          remark: null,
          statementMatches: [],
          allocations: [],
          issues: index === 0 ? [] : ['金额需核对']
        }))
      }
    })
  })
  await page.goto('/tests/e2e/fixtures/bank-batch-money.html')
  await page.getByRole('button', { name: '打开流水导入', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'test-bank.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '交易日期,金额,往来单位\n2026-10-09,1234.5,测试单位\n2026-10-09,0,测试单位\n2026-10-09,-1234.5,测试单位',
      'utf8'
    )
  })
  const amounts = dialog.locator('.el-table__body-wrapper')
  for (const value of ['¥1,234.50', '¥0.00', '¥-1,234.50']) {
    await expect(amounts.getByText(value, { exact: true })).toBeVisible()
  }
  await amounts.getByText('¥1,234.50', { exact: true }).scrollIntoViewIfNeeded()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
  expect(errors).toEqual([])
  await page.screenshot({ path: info.outputPath('bank.png'), fullPage: true })
})
