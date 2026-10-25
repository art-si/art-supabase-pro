import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 30_000 })
test.setTimeout(180_000)

test('ESOP 行操作复用公共容器', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) =>
    route.fulfill({
      json: new URL(route.request().url()).pathname.endsWith('/mdm_esop_document')
        ? [
            {
              id: 'test-esop',
              tenant_id: 'test-tenant',
              category_id: 'test-category',
              document_code: 'ESOP-TEST',
              document_name: '测试作业文件',
              version_no: 'V1',
              attachment_url: '',
              attachment_name: '测试文件.pdf',
              attachment_type: 'pdf',
              attachment_size: 1024 ** 3,
              status: 'enabled',
              upload_time: '2026-10-09T00:00:00Z',
              create_time: '2026-10-09T00:00:00Z',
              update_time: '2026-10-09T00:00:00Z',
              bindings: []
            }
          ]
        : [],
      headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
    })
  )
  await page.goto('/tests/e2e/fixtures/engineering-dictionary-options.html?mode=esop-list')
  const row = page.locator('tbody tr').filter({ hasText: 'ESOP-TEST' }).first()
  const actions = row.locator('.business-table-row-actions')
  await expect(actions).toHaveCount(1)
  await expect(actions.locator('.business-table-row-actions')).toHaveCount(0)
  await expect(actions.locator('.art-button-table')).toHaveCount(2)
  expect(await actions.evaluate((element) => getComputedStyle(element).gap)).toBe('8px')
  await actions.scrollIntoViewIfNeeded()
  expect(
    await actions.evaluate((element) => {
      const cell = element.closest('td')
      if (!cell) throw new Error('行操作缺少所属单元格')
      const boundary = cell.getBoundingClientRect()
      return [...element.querySelectorAll('.art-button-table, .el-dropdown')].every((button) => {
        const rect = button.getBoundingClientRect()
        return rect.left >= boundary.left && rect.right <= boundary.right
      })
    })
  ).toBe(true)
  await page.screenshot({ path: info.outputPath('esop-row-actions.png') })
  await actions.locator('.art-button-table').first().click()
  await expect(page.getByText('PDF · 1.0 GB', { exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('esop-file-size.png') })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  expect(errors).toEqual([])
})

for (const mode of ['equipment-list', 'esop-list', 'equipment', 'document', 'category']) {
  test(`工程主数据公共字典选项 ${mode}`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    let release: () => void = () => {}
    const dictionaryGate = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/rest/v1/**', async (route) => {
      const url = new URL(route.request().url())
      if (url.pathname.endsWith('/sys_dictionary')) await dictionaryGate
      return route.fulfill({
        json: url.pathname.endsWith('/sys_dictionary')
          ? [
              { label: '', name: '公共状态名称', value: 'enabled', status: '1' },
              { label: '停用字典项', value: 'obsolete', status: '0' }
            ]
          : []
      })
    })
    await page.goto(`/tests/e2e/fixtures/engineering-dictionary-options.html?mode=${mode}`)
    if (!mode.endsWith('-list')) await page.getByRole('button', { name: '打开表单' }).click()
    const scope = mode.endsWith('-list')
      ? page.locator('.art-search-bar')
      : page.getByRole('dialog')
    const field = scope.locator('.el-form-item').filter({
      has: page.getByText(mode.startsWith('equipment') ? '启用状态' : '状态', { exact: true })
    })
    if (mode === 'category') {
      await expect(field).toBeVisible()
      release()
      await expect(field.getByText('公共状态名称', { exact: true })).toBeVisible()
      await expect(field.getByText('停用字典项', { exact: true })).toHaveCount(0)
    } else {
      await field.locator('.el-select').click()
      release()
      await expect(page.getByRole('option', { name: '公共状态名称', exact: true })).toBeVisible()
      await expect(page.getByRole('option', { name: '停用字典项', exact: true })).toHaveCount(0)
      await page.getByRole('option', { name: '公共状态名称', exact: true }).click()
    }
    if (mode === 'equipment') {
      await page.getByRole('tab', { name: '治理设置' }).click()
      await page
        .getByRole('dialog')
        .locator('.el-form-item')
        .filter({
          has: page.getByText('运行状态', { exact: true })
        })
        .locator('.el-select')
        .click()
      await expect(page.getByRole('option', { name: '公共状态名称', exact: true })).toBeVisible()
      await expect(page.getByRole('option', { name: '停用字典项', exact: true })).toHaveCount(0)
      await page.getByRole('option', { name: '公共状态名称', exact: true }).click()
    }
    await page.screenshot({ path: info.outputPath(`${mode}.png`) })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    expect(errors).toEqual([])
  })
}
