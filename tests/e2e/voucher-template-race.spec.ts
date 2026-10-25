import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const revoked of [false, true]) {
  test(`凭证模板延迟响应 ${revoked ? '撤权保留' : '正常套用'}`, async ({ page }) => {
    await prepareIsolatedSession(page)
    let release: (() => void) | undefined
    const responseGate = new Promise<void>((resolve) => {
      release = resolve
    })
    let requested = false
    await page.route('**/rest/v1/rpc/fms_list_financial_statement_items_secure**', (route) =>
      route.fulfill({ json: { records: [], fieldAccess: {} } })
    )
    await page.route('**/rest/v1/rpc/fms_get_voucher_template_secure**', async (route) => {
      requested = true
      await responseGate
      await route.fulfill({
        json: {
          id: 'dddddddd-dddd-4ddd-addd-dddddddddddd',
          voucherType: 'general',
          summary: '模板返回的新摘要',
          lines: [],
          fieldAccess: { templateEntries: 'read', templateNarrative: 'read' }
        }
      })
    })
    try {
      await page.goto(
        '/tests/e2e/fixtures/record-delete-context.html?validationTarget=voucher&voucherPermission=Add&voucherTemplate=true'
      )
      await page.getByRole('button', { name: '打开校验表单', exact: true }).click()
      const dialog = page.getByRole('dialog')
      const summary = dialog.getByPlaceholder('概括本次经济业务', { exact: true })
      await summary.fill('原始手写摘要')
      await dialog.getByRole('combobox', { name: '套用模板', exact: true }).click()
      await page.getByRole('option', { name: 'TEST 测试模板', exact: true }).click()
      await expect.poll(() => requested).toBe(true)
      if (revoked)
        await page
          .getByTestId('revoke-delete-permission')
          .evaluate((button: HTMLButtonElement) => button.click())
      release?.()
      await expect(
        page.getByText(
          revoked
            ? '凭证操作权限已变化，模板未套用，请刷新后重试'
            : '凭证模板已套用，请核对金额与核算维度',
          { exact: true }
        )
      ).toBeVisible()
      await expect(summary).toHaveValue(revoked ? '原始手写摘要' : '模板返回的新摘要')
      await expect(dialog.locator('.el-table__body-wrapper tbody tr')).toHaveCount(revoked ? 2 : 0)
      await page.screenshot({ path: test.info().outputPath('template-result.png') })
    } finally {
      release?.()
    }
  })
}
