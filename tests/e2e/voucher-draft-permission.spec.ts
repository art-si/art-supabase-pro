import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const permission of ['View', 'Edit', 'Add', 'Add,Submit']) {
  test(`凭证草稿入口与空白校验 ${permission}`, async ({ page }) => {
    await prepareIsolatedSession(page)
    let writes = 0
    await page.route('**/rest/v1/**', (route) => {
      if (/\/rpc\/(?:save_fms_|fms_save_|fms_transition_)/.test(route.request().url())) writes += 1
      return route.fallback()
    })
    await page.route('**/rest/v1/rpc/fms_list_financial_statement_items_secure**', (route) =>
      route.fulfill({ json: { records: [], fieldAccess: {} } })
    )
    await page.goto(
      `/tests/e2e/fixtures/record-delete-context.html?validationTarget=voucher&voucherPermission=${permission}`
    )
    await page.getByRole('button', { name: '打开校验表单', exact: true }).click()
    if (!permission.includes('Add')) {
      await expect(page.getByText('当前账号无权新增或编辑凭证', { exact: true })).toBeVisible()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      expect(writes).toBe(0)
      return
    }
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: '保存并提交', exact: true })).toHaveCount(
      permission.includes('Submit') ? 1 : 0
    )
    const summary = dialog.getByPlaceholder('概括本次经济业务', { exact: true })
    await summary.fill('   ')
    await dialog.getByRole('button', { name: '保存草稿', exact: true }).click()
    await expect(dialog.getByText('请输入凭证摘要', { exact: true })).toBeVisible()
    await expect(summary).toHaveValue('   ')
    expect(writes).toBe(0)
    await summary.fill('测试有效凭证摘要')
    await summary.blur()
    await expect(dialog.getByText('请输入凭证摘要', { exact: true })).toHaveCount(0)
    await page
      .getByTestId('revoke-delete-permission')
      .evaluate((button: HTMLButtonElement) => button.click())
    await expect(dialog.getByRole('button', { name: '保存草稿', exact: true })).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: '保存并提交', exact: true })).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: '新增分录' })).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: '上传附件' })).toHaveCount(0)
    await expect(dialog.getByPlaceholder('分录摘要')).toHaveCount(0)
    await expect(summary).toHaveValue('测试有效凭证摘要')
    await expect(summary).toBeDisabled()
    for (const label of ['账套', '凭证日期', '凭证类型', '套用模板', '业务来源'])
      await expect(dialog.getByRole('combobox', { name: new RegExp(label) })).toBeDisabled()
    await expect(dialog.getByPlaceholder('请输入来源单号', { exact: true })).toBeDisabled()
    await page.screenshot({ path: test.info().outputPath('draft-revoked.png') })
    expect(writes).toBe(0)
  })
}
