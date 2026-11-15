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
    const url = new URL(route.request().url())
    const dictionaryValue = url.searchParams.get('value')
    const dictionaryRows = [
      { label: '', name: '公共名称回退', value: 'named-option', status: '1' },
      { label: '公共停用历史值', value: 'disabled-option', status: '0' }
    ]
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
      json: url.pathname.endsWith('/sys_dictionary')
        ? dictionaryRows.filter((row) => !dictionaryValue || dictionaryValue === `eq.${row.value}`)
        : url.pathname.endsWith('/mdm_supplier')
          ? rows
          : []
    })
  })
  await page.goto('/tests/e2e/fixtures/supplier-form-options.html?list=1')
  const table = page.locator('.el-table')
  await expect(table.getByText('SUP-0', { exact: true }).first()).toBeVisible()
  await expect(table.getByText('公共名称回退', { exact: true })).toHaveCount(2)
  await expect(table.getByText('公共停用历史值', { exact: true })).toHaveCount(2)
  await expect(table.getByText('待核对', { exact: true })).toHaveCount(2)
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出', exact: true }).click()
  const path = await (await pending).path()
  if (!path) throw new Error('供应商导出未生成文件')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(path)
  const sheet = workbook.worksheets[0]
  for (const [index, expected] of ['公共名称回退', '公共停用历史值', '待核对', '—'].entries()) {
    for (const column of [3, 5, 6, 7])
      expect(sheet.getRow(index + 2).getCell(column).value).toBe(expected)
  }
  await page.screenshot({ path: info.outputPath('supplier-list-options.png'), fullPage: true })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  expect(errors).toEqual([])
})

test('分组刷新保留最新响应并支持失败重试', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const lateResponse = Promise.withResolvers<void>()
  let requestCount = 0
  await page.route('**/rest/v1/mdm_master_group?*', async (route) => {
    const request = ++requestCount
    if (request === 1) return route.fulfill({ json: [] })
    if (request === 2) await lateResponse.promise
    if (request === 4)
      return route.fulfill({
        status: 500,
        json: { code: 'XX000', message: 'Database unavailable' }
      })
    return route.fulfill({
      json: [
        {
          id: 'group-1',
          tenant_id: 'test-tenant',
          domain: 'supplier',
          name: request === 2 ? '旧分组' : '最新分组',
          code: 'GROUP-1',
          sort: 0,
          enabled: true
        }
      ]
    })
  })
  await page.route('**/rest/v1/mdm_supplier?*', (route) => {
    const isFiltered = new URL(route.request().url()).searchParams.has('group_id')
    const rows = [
      {
        id: 'supplier-1',
        supplier_code: 'SUP-1',
        supplier_name: '分组供应商',
        group_id: 'group-1'
      },
      { id: 'supplier-2', supplier_code: 'SUP-2', supplier_name: '未分组供应商' }
    ]
    const records = isFiltered ? rows.slice(0, 1) : rows
    return route.fulfill({
      headers: {
        'content-range': `0-${records.length - 1}/${records.length}`,
        'access-control-expose-headers': 'content-range'
      },
      json: records
    })
  })

  await page.goto('/tests/e2e/fixtures/supplier-form-options.html?list=1')
  const panel = page.locator('.master-group-panel')
  await expect(panel).toBeVisible()
  const expand = panel.getByRole('button', { name: '展开分组', exact: true })
  if (await expand.isVisible()) await expand.click()
  await expect(panel.getByText('尚未建立分组')).toBeVisible()
  const refresh = panel.getByRole('button', { name: '刷新分组', exact: true })
  try {
    await refresh.click()
    await expect.poll(() => requestCount).toBe(2)
    await expect(panel).toHaveAttribute('aria-busy', 'true')
    await refresh.click()
    await expect(panel.getByText('最新分组', { exact: true })).toBeVisible()

    const oldResponse = page.waitForResponse((response) =>
      response.url().includes('/rest/v1/mdm_master_group?')
    )
    lateResponse.resolve()
    await (await oldResponse).finished()
    await page.evaluate(async () => {
      await new Promise<number>(requestAnimationFrame)
      await new Promise<number>(requestAnimationFrame)
    })
    await expect(panel.getByText('最新分组', { exact: true })).toBeVisible()
    await expect(panel.getByText('旧分组', { exact: true })).toHaveCount(0)
  } finally {
    lateResponse.resolve()
  }

  await refresh.click()
  await expect(panel.getByText('内容加载失败', { exact: true })).toBeVisible()
  await panel.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(panel.getByText('最新分组', { exact: true })).toBeVisible()
  await expect(panel).toHaveAttribute('aria-busy', 'false')

  const supplierMetric = page.locator('.business-workspace-header__metric').filter({
    has: page.getByText('当前供应商', { exact: true })
  })
  await expect(supplierMetric.locator('strong')).toHaveText('2')
  await panel.getByText('最新分组', { exact: true }).click()
  await expect(supplierMetric.locator('strong')).toHaveText('1')
  await expect(page.getByText('未分组供应商', { exact: true })).toHaveCount(0)

  const enterFocus = page.locator('.el-switch').filter({
    has: page.getByRole('switch', { name: '进入专注模式' })
  })
  const exitFocus = page.getByRole('button', { name: '退出专注模式' })
  await enterFocus.click({ timeout: 10_000 })
  await expect(supplierMetric).toBeHidden()
  await expect(panel.getByText('最新分组', { exact: true })).toBeVisible()
  await exitFocus.click({ timeout: 10_000 })
  await expect(supplierMetric.locator('strong')).toHaveText('1')
  await enterFocus.click({ timeout: 10_000 })
  await page.keyboard.press('Escape')
  await expect(supplierMetric.locator('strong')).toHaveText('1')
  const supplier = page.getByRole('button', { name: '分组供应商', exact: true })
  await supplier.scrollIntoViewIfNeeded()
  await expect(supplier).toBeInViewport()

  await page.screenshot({ path: info.outputPath('supplier-groups-recovered.png'), fullPage: true })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
})
