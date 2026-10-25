import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 30_000 })
test.setTimeout(240_000)
test('工作中心资料复用公共字典', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) =>
    route.fulfill({
      json: new URL(route.request().url()).pathname.endsWith('/sys_dictionary')
        ? [
            { label: '', name: '公共资料选项', value: 'test-option', status: '1' },
            { label: '停用字典项', value: 'obsolete', status: '0' }
          ]
        : [],
      headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' }
    })
  )
  await page.goto('/tests/e2e/fixtures/work-center-assignment-options.html?mode=center')
  await page.getByRole('button', { name: '打开安排', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '编辑工作中心', exact: true })
  for (const label of ['人员安排', '产能模式']) {
    const field = dialog
      .locator('.el-form-item')
      .filter({ has: page.getByText(label, { exact: true }) })
    await field.locator('.el-select').scrollIntoViewIfNeeded()
    await field.locator('.el-select').click()
    await expect(page.getByRole('option', { name: '公共资料选项', exact: true })).toBeVisible()
    await expect(page.getByRole('option', { name: '停用字典项', exact: true })).toHaveCount(0)
    await page.getByRole('option', { name: '公共资料选项', exact: true }).click()
    await expect(field).toContainText('公共资料选项')
    expect(
      await field.locator('.el-select').evaluate((element) => {
        const dialog = element.closest('.el-dialog')
        if (!dialog) throw new Error('控件缺少所属弹窗')
        return element.getBoundingClientRect().right - dialog.getBoundingClientRect().right
      })
    ).toBeLessThanOrEqual(0)
    await page.screenshot({ path: info.outputPath(`${label}.png`) })
  }
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  expect(errors).toEqual([])
})
for (const mode of ['personnel', 'devices']) {
  test(`工作中心安排公共选项 ${mode}`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) =>
      route.fulfill({
        json: new URL(route.request().url()).pathname.endsWith('/sys_dictionary')
          ? [
              {
                label: '',
                name: '公共安排名称',
                value: mode === 'devices' ? '无' : '短期加入',
                status: '1'
              },
              { label: '停用字典项', value: 'obsolete', status: '0' }
            ]
          : [],
        headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' }
      })
    )
    await page.goto(`/tests/e2e/fixtures/work-center-assignment-options.html?mode=${mode}`)
    await page.getByRole('button', { name: '打开安排', exact: true }).click()
    const add = page.getByRole('button', {
      name: mode === 'devices' ? '添加设备' : '添加临时调整',
      exact: true
    })
    await expect(add).toBeVisible()
    await page.screenshot({ path: info.outputPath('header.png') })
    await add.click()
    const dialog = page.getByRole('dialog', {
      name: mode === 'devices' ? '关联设备' : '添加临时调整',
      exact: true
    })
    const field = dialog.locator('.el-form-item').filter({
      has: page.getByText(mode === 'devices' ? '投入 / 产出点' : '临时调整', { exact: true })
    })
    if (mode === 'devices') {
      await field.locator('.el-select').click()
      await expect(page.getByRole('option', { name: '公共安排名称', exact: true })).toBeVisible()
      await expect(page.getByRole('option', { name: '停用字典项', exact: true })).toHaveCount(0)
      await page.getByRole('option', { name: '公共安排名称', exact: true }).click()
    } else {
      await field.getByText('公共安排名称', { exact: true }).click()
      await expect(field.getByRole('radio', { name: '公共安排名称', exact: true })).toBeChecked()
      await expect(field.getByText('停用字典项', { exact: true })).toHaveCount(0)
      const range = dialog.locator('.el-range-editor')
      expect(
        await range.evaluate((element) => {
          const parent = element.closest('.el-form-item')
          if (!parent) throw new Error('日期区间缺少所属表单项')
          return element.getBoundingClientRect().right - parent.getBoundingClientRect().right
        })
      ).toBeLessThanOrEqual(1)
    }
    await page.screenshot({ path: info.outputPath('options.png') })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    expect(errors).toEqual([])
  })
}
