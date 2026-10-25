import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 30_000 })
test.setTimeout(180_000)

async function mockInventory(page: Page, dictionaryGate: Promise<void>) {
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const dictionary = url.pathname.endsWith('/sys_dictionary')
    if (dictionary) await dictionaryGate
    let json: unknown = []
    if (dictionary) {
      const code = url.search
      const value = code.includes('commonBoolean')
        ? 'true'
        : code.includes('mdmWarehouseType')
          ? 'raw_material'
          : code.includes('mdmWarehouseBusinessScope')
            ? 'picking'
            : code.includes('mdmWarehouseBinType')
              ? 'floor'
              : code.includes('mdmWarehouseBinStatus')
                ? 'available'
                : code.includes('commonEnabled')
                  ? 'enabled'
                  : 'in_stock'
      json = code.includes('mdmMaterialSource')
        ? [{ label: '停用历史物料来源', value: 'legacy-source', status: '0' }]
        : [
            { label: '', name: '公共名称选项', value, status: '1' },
            { label: '停用选项', value: 'pending_in', status: '0' },
            { label: '不可流转选项', value: 'out', status: '1' }
          ]
    } else if (url.pathname.endsWith('/wms_list_serials_secure')) {
      json = {
        data: [
          {
            id: 'serial-test',
            tenant_id: 'test-tenant',
            serial_no: 'SN-TEST',
            material_id: 'material-test',
            material_source: 'legacy-source',
            status: 'pending_in',
            warehouse_id: 'warehouse-test',
            create_time: '2026-10-09'
          }
        ],
        total: 1
      }
    } else if (url.pathname.endsWith('/wms_list_reservations_secure')) {
      json = { data: [], total: 0 }
    }
    await route.fulfill({ json })
  })
}

const forms = [
  { mode: 'warehouse', title: '新增仓库', fields: ['仓库类型', '业务应用范围', '一位一品'] },
  { mode: 'zone', title: '新增库区', fields: ['库区用途', '启用状态'] },
  { mode: 'bin', title: '新增库位', fields: ['库位类型', '库位状态'] },
  { mode: 'serial', title: '新增序列号', fields: ['序列号状态'] }
]
for (const form of forms) {
  test(`${form.title}公共字典延迟更新、名称回退和停用过滤`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    let release: () => void = () => {}
    await mockInventory(
      page,
      new Promise<void>((resolve) => {
        release = resolve
      })
    )
    await page.goto(`/tests/e2e/fixtures/inventory-dictionary-options.html?mode=${form.mode}`)
    await page.getByRole('button', { name: '打开表单' }).click()
    const dialog = page.getByRole('dialog', { name: form.title, exact: true })
    await expect(dialog).toBeVisible()
    release()
    if (form.mode === 'warehouse') {
      await dialog
        .locator('.el-form-item')
        .filter({ has: page.getByText('启用库位', { exact: true }) })
        .getByRole('switch')
        .locator('..')
        .click()
    }
    for (const label of form.fields) {
      const select = dialog
        .locator('.el-form-item')
        .filter({ has: page.getByText(label, { exact: true }) })
        .locator('.el-select')
      await select.scrollIntoViewIfNeeded()
      await select.click()
      const option = page.getByRole('option', { name: '公共名称选项', exact: true })
      await expect(option).toBeVisible()
      await expect(page.getByRole('option', { name: '停用选项', exact: true })).toHaveCount(0)
      if (form.mode === 'serial')
        await expect(page.getByRole('option', { name: '不可流转选项', exact: true })).toHaveCount(0)
      if ((await option.getAttribute('aria-selected')) !== 'true') await option.click()
      await page.keyboard.press('Escape')
      await expect(select).toContainText('公共名称选项')
    }
    await dialog.screenshot({ path: info.outputPath('inventory-form-options.png') })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    expect(errors).toEqual([])
  })
}

for (const mode of ['serial-list', 'reservation-list']) {
  test(`${mode}公共搜索字典及专注模式`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await mockInventory(page, Promise.resolve())
    await page.goto(`/tests/e2e/fixtures/inventory-dictionary-options.html?mode=${mode}`)
    const select = page
      .locator('.el-form-item')
      .filter({
        has: page.getByText(mode === 'serial-list' ? '状态' : '预留状态', { exact: true })
      })
      .locator('.el-select')
    await expect(select).toBeVisible()
    await select.click()
    await expect(page.getByRole('option', { name: '停用选项', exact: true })).toHaveCount(0)
    await page.getByRole('option', { name: '公共名称选项', exact: true }).click()
    await expect(select).toContainText('公共名称选项')
    if (mode === 'serial-list') {
      await expect(
        page.locator('.el-table').getByText('停用历史物料来源', { exact: true })
      ).toHaveCount(1)
      await expect(page.locator('.el-table').getByText('停用选项', { exact: true })).toHaveCount(1)
    }
    const header = page.locator('.business-workspace-header')
    await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
    await expect(header).toBeHidden()
    await page.getByRole('button', { name: '退出专注模式', exact: true }).click()
    await expect(header).toBeVisible()
    await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
    await page.keyboard.press('Escape')
    await expect(header).toBeVisible()
    await page.screenshot({ path: info.outputPath('inventory-list-options.png'), fullPage: true })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    expect(errors).toEqual([])
  })
}

for (const theme of ['light', 'dark']) {
  for (const box of ['border-mode', 'shadow-mode']) {
    test(`公共筛选隐藏展开按钮时所有字段可用，保留正常展开收起 ${theme} ${box}`, async ({
      page
    }, info) => {
      await prepareIsolatedSession(page)
      await mockInventory(page, Promise.resolve())
      await page.goto(
        `/tests/e2e/fixtures/inventory-dictionary-options.html?mode=search-contract&theme=${theme}&box=${box}`
      )
      const complete = page.getByTestId('complete-search')
      await expect(complete.getByRole('textbox', { name: '筛选丙', exact: true })).toBeVisible()
      await expect(complete.locator('button.art-form__filter-toggle')).toHaveCount(0)
      await complete.getByRole('textbox', { name: '筛选丙', exact: true }).fill('第三项筛选值')
      await complete.locator('button.submit-button').click()
      await expect(page.getByTestId('submitted-filter')).toHaveText('第三项筛选值')
      const expandable = page.getByTestId('expandable-search')
      await expect(expandable.getByRole('textbox', { name: '筛选丙', exact: true })).toHaveCount(0)
      await expandable.locator('button.art-form__filter-toggle').click()
      await expect(expandable.getByRole('textbox', { name: '筛选丙', exact: true })).toBeVisible()
      await page.screenshot({ path: info.outputPath('search-expand-open.png'), fullPage: true })
      await expandable.locator('button.art-form__filter-toggle').click()
      await expect(expandable.getByRole('textbox', { name: '筛选丙', exact: true })).toHaveCount(0)
      await page.screenshot({ path: info.outputPath('search-expand-contract.png'), fullPage: true })
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
      ).toBeLessThanOrEqual(1)
    })
  }
}
