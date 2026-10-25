import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })

for (const mode of ['missing', 'zero', 'restricted'] as const) {
  test(`资金调拨编辑金额 ${mode}`, async ({ page }, testInfo) => {
    await prepareIsolatedSession(page)
    const row = {
      id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
      transferNo: 'TRANSFER-001',
      status: 'draft',
      transferDate: '2026-10-07',
      amount: mode === 'restricted' ? '***' : 100,
      feeAmount: mode === 'missing' ? null : mode === 'restricted' ? '***' : 0,
      version: 1,
      fieldAccess: { transferAmounts: mode === 'restricted' ? 'read' : 'edit' }
    }
    await page.route('**/rest/v1/rpc/fms_list_fund_transfers_secure**', (route) =>
      route.fulfill({ json: { records: [row], total: 1 } })
    )
    await page.route('**/rest/v1/rpc/fms_get_fund_transfer_secure**', (route) =>
      route.fulfill({ json: row })
    )
    let writes = 0
    await page.route('**/rest/v1/rpc/save_fms_fund_transfer_secure**', (route) => {
      writes++
      return route.fulfill({ json: row })
    })
    await page.goto('/tests/e2e/fixtures/record-delete-context.html?target=fund-transfer')
    const body = page.locator('.el-table__body-wrapper').first()
    await expect(body).toContainText('TRANSFER-001')
    await expect(page.getByRole('button', { name: /^全部调拨 1(?:\s|$)/ })).toBeVisible()
    await body.getByRole('button', { name: '编辑', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '编辑资金调拨 · TRANSFER-001', exact: true })
    await expect(dialog.getByRole('button', { name: '保存修改', exact: true })).toBeVisible()
    if (mode === 'restricted') {
      await expect(dialog.getByRole('spinbutton')).toHaveCount(0)
      await expect(dialog).toContainText('***')
    } else {
      const fee = dialog
        .locator('.el-form-item')
        .filter({ has: page.getByText('银行手续费', { exact: true }) })
        .getByRole('spinbutton')
      await expect(fee).toHaveValue(mode === 'missing' ? '' : '0.00')
    }
    await page.screenshot({ path: testInfo.outputPath('edit-numbers.png'), animations: 'disabled' })
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await expect(dialog).toBeHidden()
    expect(writes).toBe(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}
