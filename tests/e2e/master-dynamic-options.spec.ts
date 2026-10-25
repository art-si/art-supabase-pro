import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 30_000 })
test.setTimeout(180_000)
test('同一主数据弹窗切换配置后使用正确字典名称与布尔值', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const boolean = url.searchParams.get('dict_type_table.code') === 'eq.commonBoolean'
    await route.fulfill({
      json: url.pathname.endsWith('/sys_dictionary')
        ? [
            {
              label: '',
              name: boolean ? '公共启用名称' : '公共业务名称',
              value: boolean ? 'true' : 'active',
              status: '1'
            },
            { label: '停用字典项', value: 'obsolete', status: '0' },
            ...(!boolean ? [{ label: '', name: '', value: 'legacy-value', status: '1' }] : [])
          ]
        : []
    })
  })
  await page.goto('/tests/e2e/fixtures/master-dynamic-options.html')
  for (const [kind, label] of [
    ['project', '项目阶段'],
    ['operation', '计价类型']
  ]) {
    await page.getByRole('button', { name: `打开${kind}`, exact: true }).click()
    const dialog = page.getByRole('dialog')
    const field = dialog
      .locator('.el-form-item')
      .filter({ has: page.getByText(label, { exact: true }) })
    await field.scrollIntoViewIfNeeded()
    await field.locator('.el-select').click()
    await expect(page.getByRole('option', { name: '公共业务名称', exact: true })).toBeVisible()
    await expect(page.getByRole('option', { name: 'legacy-value', exact: true })).toBeVisible()
    await expect(page.getByRole('option', { name: '停用字典项', exact: true })).toHaveCount(0)
    await page.getByRole('option', { name: '公共业务名称', exact: true }).click()
    await page.screenshot({ path: info.outputPath(`${kind}-dictionary.png`) })
    const enabled = dialog.getByRole('radiogroup', { name: '启用状态' })
    await enabled.scrollIntoViewIfNeeded()
    await expect(enabled.getByRole('radio', { name: '公共启用名称', exact: true })).toBeChecked()
    await expect(enabled.getByText('停用字典项', { exact: true })).toHaveCount(0)
    await page.screenshot({ path: info.outputPath(`${kind}-boolean.png`) })
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await expect(dialog).toBeHidden()
  }
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  expect(errors).toEqual([])
})
