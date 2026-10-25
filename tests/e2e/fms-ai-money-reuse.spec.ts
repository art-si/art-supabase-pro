import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)
for (const mode of ['audit', 'ocr']) {
  test(`${mode} 公共金额格式保留金额精度和业务空值提示`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    const errors: string[] = []
    const warnings: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.text().includes('[Vue warn]')) warnings.push(message.text())
    })
    await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
    await page.route('**/functions/v1/**', (route) => {
      if (route.request().url().includes('ai-waybill-cost-auditor'))
        return route.fulfill({
          json: {
            assessment: {
              waybillNo: 'AUDIT-001',
              route: '测试始发 → 测试到货',
              riskLevel: 'low',
              recommendation: 'routine_review',
              riskScore: 10,
              confidence: 0.9,
              summary: '测试只读审核建议',
              signals: [],
              recommendedActions: ['人工核对金额'],
              limitations: ['测试数据'],
              metrics: {
                amount: 1234.5,
                projectedTotalCost: 0,
                receivableAmount: null,
                projectedGrossMargin: null,
                duplicateCount: 0,
                benchmarkMedian: null,
                benchmarkSampleSize: 0,
                attachmentCount: 0
              }
            },
            generatedAt: '2026-10-09T08:00:00Z',
            ruleVersion: 'test',
            runId: 'test-cost-run'
          }
        })
      return route.fulfill({
        json: {
          runId: 'test-ocr-run',
          artifactId: 'test-ocr-artifact',
          generatedAt: '2026-10-09T08:00:00Z',
          invoice: {
            invoiceNo: 'OCR-001',
            amountExcludingTax: 1234.5,
            taxAmount: 0,
            totalAmount: null
          },
          confidence: 0.9,
          fieldConfidence: {},
          warnings: [],
          missingFields: [],
          summary: '测试发票金额',
          rawText: ''
        }
      })
    })
    await page.goto(`/tests/e2e/fixtures/fms-ai-money.html?mode=${mode}`)
    await page
      .getByRole('button', { name: mode === 'audit' ? '打开费用审核' : '识别票面', exact: true })
      .click()
    const root = mode === 'audit' ? page.getByRole('dialog') : page.locator('.invoice-ocr-panel')
    await expect(root.getByText('¥1,234.50', { exact: true }).first()).toBeVisible({
      timeout: 60_000
    })
    await expect(root.getByText('¥0.00', { exact: true }).first()).toBeVisible()
    if (mode === 'audit') {
      for (const label of ['运单应收', '历史中位数']) {
        await expect(
          root
            .locator('.cost-auditor__metrics article')
            .filter({ has: page.getByText(label, { exact: true }) })
            .locator('strong')
        ).toHaveText('数据不足')
      }
    } else {
      await expect(
        root
          .locator('.invoice-ocr-panel__field')
          .filter({ has: page.getByText('价税合计', { exact: true }) })
          .locator('strong')
      ).toHaveText('未识别')
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true
    )
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
    await page.screenshot({ path: info.outputPath(`${mode}.png`), fullPage: true })
  })
}
