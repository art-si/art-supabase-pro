import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)
const forms = [
  {
    button: '打开供应商',
    title: '新增供应商',
    fields: ['供应商类别', '供应商类型', '企业性质', '行业']
  },
  { button: '打开联系人', title: '新增联系人', fields: ['性别'] },
  { button: '打开银行账户', title: '新增银行信息', fields: ['币种'] }
]
for (const form of forms) {
  test(`${form.title}延迟字典选项使用公共加载及停用过滤`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    let releaseDictionaries: () => void = () => {}
    const dictionaryGate = new Promise<void>((resolve) => {
      releaseDictionaries = resolve
    })
    await page.route('**/rest/v1/**', async (route) => {
      const dictionary = new URL(route.request().url()).pathname.endsWith('/sys_dictionary')
      if (dictionary) await dictionaryGate
      await route.fulfill({
        json: dictionary
          ? [
              { label: '公共启用选项', value: 'enabled-option', status: '1' },
              { label: '', name: '公共名称回退', value: 'named-option', status: '1' },
              { label: '公共停用选项', value: 'disabled-option', status: '0' }
            ]
          : []
      })
    })
    await page.goto('/tests/e2e/fixtures/supplier-form-options.html')
    await page.getByRole('button', { name: form.button, exact: true }).click()
    const dialog = page.getByRole('dialog', { name: form.title, exact: true })
    await expect(dialog).toBeVisible()
    releaseDictionaries()
    for (const label of form.fields) {
      const select = dialog
        .locator('.el-form-item')
        .filter({ has: page.getByText(label, { exact: true }) })
        .locator('.el-select')
      await select.scrollIntoViewIfNeeded()
      await select.click()
      const option = page.getByRole('option', { name: '公共启用选项', exact: true })
      await expect(option).toBeVisible()
      await expect(page.getByRole('option', { name: '公共停用选项', exact: true })).toHaveCount(0)
      await option.click()
      await expect(select).toContainText('公共启用选项')
      await select.click()
      await page.getByRole('option', { name: '公共名称回退', exact: true }).click()
      await expect(select).toContainText('公共名称回退')
    }
    await dialog.screenshot({ path: info.outputPath('supplier-form-options.png') })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    expect(errors).toEqual([])
  })
}

test('供应商列表和导出复用字典显示策略并保留停用历史值', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const values = ['named-option', 'disabled-option', 'unknown-option', null]
  await page.route('**/rest/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    const rows = values.map((value, index) => ({
      id: `supplier-${index}`,
      tenant_id: 'test-tenant',
      supplier_code: `SUP-${index}`,
      supplier_name: `公共字典测试供应商-${index}`,
      supplier_category: value,
      supplier_type: value,
      enterprise_nature: value,
      industry: value,
      update_time: '2026-10-09'
    }))
    await route.fulfill({
      headers: {
        'content-range': `0-3/${rows.length}`,
        'access-control-expose-headers': 'content-range'
      },
      json: path.endsWith('/sys_dictionary')
        ? [
            { label: '', name: '公共名称回退', value: 'named-option', status: '1' },
            { label: '公共停用历史值', value: 'disabled-option', status: '0' }
          ]
        : path.endsWith('/mdm_supplier')
          ? rows
          : []
    })
  })
  await page.goto('/tests/e2e/fixtures/supplier-form-options.html?list=1')
  const table = page.locator('.el-table')
  await expect(table.getByText('SUP-0', { exact: true }).first()).toBeVisible()
  await expect(table.getByText('公共名称回退', { exact: true })).toHaveCount(2)
  await expect(table.getByText('公共停用历史值', { exact: true })).toHaveCount(2)
  await expect(table.getByText('unknown-option', { exact: true })).toHaveCount(2)
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出', exact: true }).click()
  const path = await (await pending).path()
  if (!path) throw new Error('供应商导出未生成文件')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(path)
  const sheet = workbook.worksheets[0]
  for (const [index, expected] of [
    '公共名称回退',
    '公共停用历史值',
    'unknown-option',
    '—'
  ].entries()) {
    for (const column of [3, 5, 6, 7])
      expect(sheet.getRow(index + 2).getCell(column).value).toBe(expected)
  }
  await page.screenshot({ path: info.outputPath('supplier-list-options.png'), fullPage: true })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  expect(errors).toEqual([])
})
