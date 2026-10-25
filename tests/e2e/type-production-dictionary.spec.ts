import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 30_000 })
test.setTimeout(240_000)
test('生产单据仓库范围与扩展字段复用公共字典', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url())
    const dictionaryType = url.searchParams.get('dict_type_table.code')
    const dictionaryRows =
      dictionaryType === 'eq.mdmProductionReportControl'
        ? [
            { label: '不控制', value: 'none', status: '1' },
            { label: '警告', value: 'warning', status: '1' },
            { label: '严格控制', value: 'strict', status: '1' }
          ]
        : dictionaryType === 'eq.mdmProductionFullIssueScope'
          ? [
              { label: '全部物料', value: 'all', status: '1' },
              { label: '非倒冲物料', value: 'non_backflush', status: '1' },
              { label: '关键物料', value: 'key', status: '1' }
            ]
          : dictionaryType === 'eq.mdmProductionWipDeductionTiming'
            ? [
                { label: '完工入库审核时扣减', value: 'inbound_approval', status: '1' },
                { label: '不扣减', value: 'none', status: '1' }
              ]
            : [
                { label: '', name: '公共选项名称', value: 'number', status: '1' },
                { label: '停用选项', value: 'inactive', status: '0' }
              ]
    return route.fulfill({
      json: url.pathname.endsWith('/sys_dictionary') ? dictionaryRows : []
    })
  })
  await page.goto('/tests/e2e/fixtures/type-dictionary-reuse.html?mode=document-production', {
    waitUntil: 'domcontentloaded'
  })
  await page.getByRole('button', { name: '打开表单' }).click()
  const dialog = page.getByRole('dialog', { name: '新增单据类型' })
  const warehouse = dialog
    .locator('.el-form-item')
    .filter({ has: page.getByText('允许领料的仓库类型', { exact: true }) })
    .locator('.el-select')
  await expect(warehouse).toBeVisible({ timeout: 90_000 })
  await warehouse.click()
  await expect(page.getByRole('option', { name: '公共选项名称', exact: true })).toBeVisible()
  await expect(page.getByRole('option', { name: '停用选项', exact: true })).toHaveCount(0)
  await page.getByRole('option', { name: '公共选项名称', exact: true }).click()
  await page.keyboard.press('Escape')
  const reportControl = dialog.locator('.el-form-item').filter({ hasText: '完工入库报工控制' })
  await expect(reportControl).toContainText('不控制')
  await reportControl.locator('.el-select').click()
  await expect(page.getByRole('option', { name: '警告', exact: true })).toBeVisible()
  await expect(page.getByRole('option', { name: '严格控制', exact: true })).toBeVisible()
  await page.getByRole('option', { name: '警告', exact: true }).click()
  await expect(reportControl).toContainText('警告')
  const fullIssueControl = dialog.locator('.el-form-item').filter({ hasText: '入库完全领料控制' })
  const fullIssueScope = dialog.locator('.el-form-item').filter({ hasText: '完全领料组件范围' })
  await expect(fullIssueControl).toContainText('不控制')
  await expect(fullIssueScope.getByRole('combobox')).toBeDisabled()
  await fullIssueControl.locator('.el-select').click()
  await page.getByRole('option', { name: '严格控制', exact: true }).click()
  await expect(fullIssueScope.getByRole('combobox')).toBeEnabled()
  await fullIssueScope.locator('.el-select').click()
  await expect(page.getByRole('option', { name: '全部物料', exact: true })).toBeVisible()
  await expect(page.getByRole('option', { name: '关键物料', exact: true })).toBeVisible()
  await page.getByRole('option', { name: '非倒冲物料', exact: true }).click()
  await expect(fullIssueScope).toContainText('非倒冲物料')
  const wipTiming = dialog.locator('.el-form-item').filter({ hasText: '在制材料扣减时机' })
  await expect(wipTiming).toContainText('完工入库审核时扣减')
  await wipTiming.locator('.el-select').click()
  await expect(page.getByRole('option', { name: '不扣减', exact: true })).toBeVisible()
  await page.getByRole('option', { name: '不扣减', exact: true }).click()
  await expect(wipTiming).toContainText('不扣减')
  await page.screenshot({
    path: info.outputPath('production-warehouse.png'),
    animations: 'disabled'
  })
  await dialog
    .locator('.el-form-item')
    .filter({ has: page.getByText('需要排包', { exact: true }) })
    .getByRole('switch')
    .locator('..')
    .click()
  await dialog.getByRole('button', { name: '新增字段', exact: true }).click()
  await dialog
    .getByRole('combobox', { name: '第 1 个字段类型', exact: true })
    .locator('xpath=ancestor::div[contains(@class, "el-select__wrapper")]')
    .click()
  await expect(page.getByRole('option', { name: '公共选项名称', exact: true })).toBeVisible()
  await expect(page.getByRole('option', { name: '停用选项', exact: true })).toHaveCount(0)
  await page.getByRole('option', { name: '公共选项名称', exact: true }).click()
  await page.screenshot({
    path: info.outputPath('production-extension.png'),
    animations: 'disabled'
  })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  expect(errors).toEqual([])
})
