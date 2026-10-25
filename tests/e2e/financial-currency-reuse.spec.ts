import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

for (const state of ['read', 'masked', 'unavailable'] as const) {
  test(`资金调拨与票据共享金额显示保留币种和权限 ${state}`, async ({ page }, testInfo) => {
    await prepareIsolatedSession(page)
    const tenantId = '11111111-1111-4111-8111-111111111111'
    const accountSetId = '33333333-3333-4333-8333-333333333333'
    const access = state === 'masked' ? 'masked' : 'read'
    const amount = state === 'read' ? 1234.5 : state === 'masked' ? '***' : null
    const secondaryAmount = state === 'read' ? 0 : amount
    const display = state === 'read' ? 'US$1,234.50' : state === 'masked' ? '***' : '--'
    const secondaryDisplay = state === 'read' ? 'US$0.00' : display
    await page.route('**/rest/v1/rpc/fms_list_account_set_options_secure', (route) =>
      route.fulfill({
        json: {
          records: [
            {
              id: accountSetId,
              tenantId,
              accountSetCode: 'TEST-BOOK',
              accountSetName: '测试账套',
              status: 'active'
            }
          ],
          total: 1
        }
      })
    )
    await page.route('**/rest/v1/rpc/fms_get_fund_transfer_secure', (route) =>
      route.fulfill({
        json: {
          id: '44444444-4444-4444-8444-444444444444',
          tenantId,
          accountSetId,
          transferNo: 'TEST-TRANSFER-001',
          transferDate: '2026-10-02',
          amount,
          feeAmount: secondaryAmount,
          purpose: '验收测试',
          status: 'draft',
          version: 1,
          createTime: '2026-10-02T08:00:00Z',
          updateTime: '2026-10-02T08:00:00Z',
          sourceAccountName: '测试账户 A',
          targetAccountName: '测试账户 B',
          currencyCode: 'USD',
          currencyName: '美元',
          fieldAccess: { transferAccounts: 'read', transferAmounts: access, bankReference: 'read' }
        }
      })
    )
    await page.route('**/rest/v1/rpc/fms_list_fund_transfer_actions_secure', (route) =>
      route.fulfill({ json: [] })
    )
    await page.route('**/rest/v1/rpc/fms_get_commercial_bill_secure', (route) =>
      route.fulfill({
        json: {
          id: '77777777-7777-4777-8777-777777777777',
          tenantId,
          accountSetId,
          billNo: 'TEST-BILL-001',
          direction: 'receivable',
          billType: 'bank_acceptance',
          status: 'draft',
          issueDate: '2026-10-02',
          dueDate: '2026-11-02',
          currencyCode: 'USD',
          faceAmount: amount,
          settledAmount: secondaryAmount,
          outstandingAmount: amount,
          transferable: true,
          version: 1,
          createTime: '2026-10-02T08:00:00Z',
          updateTime: '2026-10-02T08:00:00Z',
          fieldAccess: { billAmounts: access, billParties: 'read', billReferences: 'read' }
        }
      })
    )
    await page.route('**/rest/v1/rpc/fms_list_commercial_bill_events_secure', (route) =>
      route.fulfill({ json: [] })
    )
    await page.goto('/tests/e2e/fixtures/fms-detail-retry.html?currency', {
      waitUntil: 'domcontentloaded'
    })

    for (const business of ['资金调拨', '商业票据'] as const) {
      await page.getByRole('button', { name: `打开${business}详情`, exact: true }).click()
      const drawer = page.locator('.el-drawer:visible')
      await expect(drawer.getByText(display, { exact: true }).first()).toBeVisible()
      if (business === '资金调拨' && state === 'masked')
        await expect(drawer.getByText(`手续费 ${secondaryDisplay}`, { exact: true })).toBeVisible()
      await page.screenshot({
        path: testInfo.outputPath(`${business}-detail.png`),
        animations: 'disabled'
      })
      await page.keyboard.press('Escape')
      await expect(drawer).toHaveCount(0)

      await page.getByRole('button', { name: `打开${business}编辑`, exact: true }).click()
      const dialog = page.getByRole('dialog')
      const label = business === '资金调拨' ? '调拨金额' : '票面金额'
      const item = dialog
        .locator('.el-form-item')
        .filter({ has: page.getByText(label, { exact: true }) })
      if (business === '商业票据') {
        await expect(item.locator('input')).toHaveValue(display)
        await expect(item.locator('input')).toBeDisabled()
      } else {
        await expect(item).toContainText(display)
        await expect(item.locator('input')).toHaveCount(0)
        await expect(
          dialog
            .locator('.el-form-item')
            .filter({ has: page.getByText('银行手续费', { exact: true }) })
        ).toContainText(secondaryDisplay)
      }
      await item.scrollIntoViewIfNeeded()
      await expect(item).toBeInViewport()
      await page.screenshot({
        path: testInfo.outputPath(`${business}-edit.png`),
        animations: 'disabled'
      })
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
        )
      ).toBe(true)
      await dialog.getByRole('button', { name: '取消', exact: true }).click()
      await expect(dialog).not.toBeVisible()
    }
  })
}
