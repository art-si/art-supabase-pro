import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 30_000 })
test.setTimeout(180_000)
test('工作中心活动复用公共字典', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) =>
    route.fulfill({
      json: new URL(route.request().url()).pathname.endsWith('/sys_dictionary')
        ? [
            { label: '', name: '公共活动名称', value: '测试值', status: '1' },
            { label: '停用字典项', value: 'obsolete', status: '0' }
          ]
        : []
    })
  )
  await page.goto('/tests/e2e/fixtures/work-center-policy-options.html?mode=activity')
  await page.getByRole('button', { name: '新增', exact: true }).click()
  for (const placeholder of [
    '请选择活动名称',
    '请选择活动类型',
    '请选择维护规则',
    '请选择活动单位'
  ]) {
    const field = page
      .locator('.el-select')
      .filter({ has: page.getByRole('combobox', { name: placeholder, exact: true }) })
    await field.scrollIntoViewIfNeeded()
    await field.click()
    await expect(page.getByRole('option', { name: '公共活动名称', exact: true })).toBeVisible()
    await expect(page.getByRole('option', { name: '停用字典项', exact: true })).toHaveCount(0)
    await page.getByRole('option', { name: '公共活动名称', exact: true }).click()
    await page.screenshot({ path: info.outputPath(`${placeholder}.png`) })
  }
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  expect(errors).toEqual([])
})
test('工作中心策略公共选项与分区切换', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) =>
    route.fulfill({
      json: new URL(route.request().url()).pathname.endsWith('/sys_dictionary')
        ? [
            { label: '', name: '公共策略名称', value: '测试值', status: '1' },
            { label: '停用字典项', value: 'obsolete', status: '0' }
          ]
        : []
    })
  )
  await page.goto('/tests/e2e/fixtures/work-center-policy-options.html')
  for (const label of ['报工', '时限单位', '自动报工']) {
    if (label === '自动报工')
      await page.getByRole('button', { name: '切换自动化', exact: true }).click()
    const field = page
      .locator('.el-form-item')
      .filter({ has: page.getByText(label, { exact: true }) })
    await field.scrollIntoViewIfNeeded()
    await field.locator('.el-select').click()
    await expect(page.getByRole('option', { name: '公共策略名称', exact: true })).toBeVisible()
    await expect(page.getByRole('option', { name: '停用字典项', exact: true })).toHaveCount(0)
    await page.getByRole('option', { name: '公共策略名称', exact: true }).click()
    await page.screenshot({ path: info.outputPath(`${label}.png`) })
  }
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  expect(errors).toEqual([])
})
