import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)

for (const theme of ['light', 'dark']) {
  for (const latency of [0, 12345]) {
    test(`识别详情保留零值和公共格式 theme=${theme} latency=${latency}`, async ({ page }, info) => {
      await prepareIsolatedSession(page)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.route('**/rest/v1/ai_artifact_review?**', (route) =>
        route.fulfill({
          json: {
            id: 'recognition-test',
            feature: 'invoice_ocr',
            status: 'applied',
            confidence: 0.9,
            proposed_payload: {
              invoiceNo: 'TEST-001',
              totalAmount: 12345.678,
              taxAmount: 0,
              quantity: 0,
              taxRate: 0,
              confirmed: false,
              verified: true,
              remark: ''
            },
            metadata: {},
            warnings: [],
            run: { model: '测试模型', latency_ms: latency }
          }
        })
      )
      await page.goto(`/tests/e2e/fixtures/recognition-detail-reuse.html?theme=${theme}`)
      await page.getByRole('button', { name: '查看测试识别' }).click()
      const fields = page.locator('.recognition-detail__fields')
      for (const [label, expected] of [
        ['价税合计', '¥12,345.68'],
        ['税额', '¥0.00'],
        ['数量', '0'],
        ['税率', '0%'],
        ['confirmed', '否'],
        ['verified', '是'],
        ['备注', '未识别']
      ]) {
        const field = fields
          .locator('article')
          .filter({ has: page.getByText(label, { exact: true }) })
        await expect(field.locator('strong')).toHaveText(expected)
      }
      await expect(page.getByText(latency === 0 ? '0 ms' : '12.3 s', { exact: true })).toBeVisible()
      await fields.scrollIntoViewIfNeeded()
      await page.screenshot({
        path: info.outputPath('recognition-values.png'),
        animations: 'disabled'
      })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      )
      expect(errors).toEqual([])
    })
  }
}
