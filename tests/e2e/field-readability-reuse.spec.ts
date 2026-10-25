import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const level of ['hidden', 'masked', 'read', 'edit'] as const) {
  test(`银行流水原值操作使用公共可读权限 ${level}`, async ({ page }, testInfo) => {
    await prepareIsolatedSession(page)
    const tenantId = '11111111-1111-4111-8111-111111111111'
    const accountSetId = '33333333-3333-4333-8333-333333333333'
    const batchId = '55555555-5555-4555-8555-555555555555'
    const fundAccountId = '66666666-6666-4666-8666-666666666666'
    await page.route('**/rest/v1/rpc/fms_get_bank_reconciliation_secure', (route) =>
      route.fulfill({
        json: {
          id: batchId,
          tenantId,
          accountSetId,
          fundAccountId,
          batchNo: 'TEST-BANK-001',
          statementStartDate: '2026-10-01',
          statementEndDate: '2026-10-02',
          importedAt: '2026-10-02T08:00:00Z',
          importedBy: '测试用户',
          status: 'draft',
          version: 1,
          accountName: '测试银行账户',
          currencyCode: 'CNY',
          lineCount: 1,
          matchedCount: 0,
          partialCount: 0,
          ignoredCount: 0,
          unmatchedCount: 1,
          fieldAccess: { statementAmounts: level }
        }
      })
    )
    await page.route('**/rest/v1/rpc/fms_list_bank_statement_lines_secure', (route) =>
      route.fulfill({
        json: {
          records: [
            {
              id: '77777777-7777-4777-8777-777777777777',
              tenantId,
              accountSetId,
              batchId,
              fundAccountId,
              lineNo: 1,
              transactionDate: '2026-10-01',
              direction: 'inflow',
              amount: level === 'masked' ? '***' : 100,
              matchedAmount: level === 'masked' ? '***' : 0,
              remainingAmount: level === 'masked' ? '***' : 100,
              matchCount: 0,
              status: 'unmatched',
              bankMemo: '测试流水',
              fieldAccess: { statementAmounts: level }
            }
          ]
        }
      })
    )
    await page.goto('/tests/e2e/fixtures/fms-detail-retry.html?readability', {
      waitUntil: 'domcontentloaded'
    })
    await page.getByRole('button', { name: '打开银行对账详情', exact: true }).click()
    const drawer = page.locator('.el-drawer')
    await expect(drawer.getByText('测试银行账户', { exact: true })).toBeVisible()
    await expect(drawer.getByRole('button', { name: '查看匹配', exact: true })).toBeVisible()
    const match = drawer.getByRole('button', { name: '手工匹配', exact: true })
    if (level === 'read' || level === 'edit') await expect(match).toBeVisible()
    else await expect(match).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath('readability.png'), animations: 'disabled' })
    await drawer.locator('.art-drawer__scrollbar > .el-scrollbar__wrap').evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await expect(drawer.getByRole('button', { name: '查看匹配', exact: true })).toBeInViewport()
    if (level === 'masked')
      await expect(drawer.getByText('***', { exact: true }).first()).toBeVisible()
    await page.screenshot({
      path: testInfo.outputPath('readability-lower.png'),
      animations: 'disabled'
    })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
      )
    ).toBe(true)
  })
}
