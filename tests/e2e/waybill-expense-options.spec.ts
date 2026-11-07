import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const mode of ['success', 'retry', 'empty', 'revoked', 'denied'] as const) {
  test(`运单费用选择树 ${mode}`, async ({ page }, testInfo) => {
    await prepareIsolatedSession(page)
    await page.route('**/rest/v1/rpc/get_effective_ai_feature_configs**', (route) =>
      route.fulfill({ json: [{ feature: 'waybill_expense_ocr', enabled: false }] })
    )
    let reads = 0
    let failing = mode === 'retry'
    let releaseOptions: (() => void) | undefined
    await page.route('**/rest/v1/rpc/tms_list_waybill_cost_options_secure', (route) =>
      route.fulfill({
        json: {
          records: [
            {
              id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              tenant_id: '11111111-1111-4111-8111-111111111111',
              waybill_no: '合成选项运单',
              status: 'completed'
            }
          ],
          total: 1
        }
      })
    )
    await page.route('**/rest/v1/tms_expense_item?*', async (route) => {
      reads += 1
      if (mode === 'success' && reads === 1)
        await new Promise<void>((resolve) => {
          releaseOptions = resolve
        })
      if (failing)
        return route.fulfill({
          status: 503,
          json: { code: 'XX000', message: 'database unavailable' }
        })
      return route.fulfill({
        headers: { 'content-range': mode === 'empty' ? '*/0' : '0-3/4' },
        json:
          mode === 'empty'
            ? []
            : [
                {
                  id: 'group',
                  tenant_id: '11111111-1111-4111-8111-111111111111',
                  parent_id: null,
                  item_code: 'GROUP',
                  item_name: '启用费用分组',
                  is_enabled: true,
                  is_selectable: false,
                  sort: 1
                },
                {
                  id: 'leaf',
                  tenant_id: '11111111-1111-4111-8111-111111111111',
                  parent_id: 'group',
                  item_code: 'LEAF',
                  item_name: '可记账费用项目',
                  is_enabled: true,
                  is_selectable: true,
                  sort: 2
                },
                {
                  id: 'disabled-group',
                  tenant_id: '11111111-1111-4111-8111-111111111111',
                  parent_id: null,
                  item_code: 'DISABLED',
                  item_name: '停用费用分组',
                  is_enabled: false,
                  is_selectable: false,
                  sort: 3
                },
                {
                  id: 'hidden-leaf',
                  tenant_id: '11111111-1111-4111-8111-111111111111',
                  parent_id: 'disabled-group',
                  item_code: 'HIDDEN',
                  item_name: '停用分组下的启用叶项',
                  is_enabled: true,
                  is_selectable: true,
                  sort: 4
                }
              ]
      })
    })
    let writes = 0
    await page.route('**/rest/v1/rpc/tms_save_waybill_cost_classified_secure', (route) => {
      writes += 1
      return route.fulfill({ json: null })
    })
    await page.goto(
      `/tests/e2e/fixtures/record-delete-context.html?target=waybill-expense&waybillExpensePermission=${mode === 'denied' ? 'View' : 'Add'}`
    )
    await page.getByRole('button', { name: '打开运单费用', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '新增运单费用', exact: true })
    if (mode === 'denied') {
      await expect(
        page.getByText('没有运单费用操作权限，请联系管理员', { exact: true })
      ).toBeVisible()
      await expect(dialog).toHaveCount(0)
      expect(writes).toBe(0)
      return
    }
    const picker = dialog.getByRole('combobox', { name: '费用项目', exact: true })
    await expect(picker).toBeDisabled()
    await dialog.getByRole('textbox', { name: /运单\/车牌/ }).click()
    const waybills = page.getByRole('dialog', { name: '选择关联运单', exact: true })
    await waybills.getByRole('row').filter({ hasText: '合成选项运单' }).click()
    await waybills.getByRole('button', { name: '确定', exact: true }).click()
    if (mode === 'success') {
      await expect.poll(() => reads).toBe(1)
      await expect(picker).toBeDisabled()
      await picker.scrollIntoViewIfNeeded()
      await page.screenshot({ path: testInfo.outputPath('expense-options-loading.png') })
      releaseOptions?.()
    }
    if (mode === 'retry') {
      await expect(dialog.getByText('选项加载失败', { exact: true })).toBeVisible()
      await expect(picker).toBeDisabled()
      await expect(dialog).not.toContainText('database unavailable')
      await expect(page.locator('.el-message--error')).toHaveCount(0)
      await dialog.getByText('选项加载失败', { exact: true }).scrollIntoViewIfNeeded()
      await page.screenshot({ path: testInfo.outputPath('expense-options-error.png') })
      const readsBeforeRetry = reads
      failing = false
      await dialog.getByRole('button', { name: '重新加载', exact: true }).click()
      await expect(picker).toBeEnabled()
      expect(reads).toBeGreaterThan(readsBeforeRetry)
    }
    if (mode === 'empty') {
      await expect(dialog.getByText('暂无可记账的费用项目', { exact: true })).toBeVisible()
      await expect(picker).toBeDisabled()
      expect(writes).toBe(0)
      await dialog.getByText('暂无可记账的费用项目', { exact: true }).scrollIntoViewIfNeeded()
      await page.screenshot({ path: testInfo.outputPath('expense-options-empty.png') })
      return
    }
    await expect(picker).toBeEnabled()
    await picker.click()
    await expect(page.getByText('停用费用分组', { exact: true })).toHaveCount(0)
    await expect(page.getByText('停用分组下的启用叶项', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('option', { name: '启用费用分组', exact: true })).toHaveCount(0)
    await page
      .getByRole('listbox', { name: '费用项目', exact: true })
      .getByRole('option', { name: '可记账费用项目', exact: true })
      .click()
    await expect(
      dialog.locator('.el-select__selected-item').filter({ hasText: '可记账费用项目' })
    ).toBeVisible()
    if (mode === 'revoked') {
      await page
        .getByTestId('revoke-delete-permission')
        .evaluate((element: HTMLButtonElement) => element.click())
      await dialog.getByRole('button', { name: '保存草稿', exact: true }).click()
      await expect(
        page.getByText('运单费用操作权限已变化，请刷新页面后重试', { exact: true })
      ).toBeVisible()
      await expect(dialog).toBeVisible()
      await expect(
        dialog.locator('.el-select__selected-item').filter({ hasText: '可记账费用项目' })
      ).toBeVisible()
      expect(writes).toBe(0)
    }
    await page.screenshot({
      path: testInfo.outputPath('expense-option-selected.png'),
      animations: 'disabled'
    })
  })
}
