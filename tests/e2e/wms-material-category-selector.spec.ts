import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('参选物料按分类及子分类筛选，已选面板保留选择', async ({ page }, testInfo) => {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/sys_menu?*', (route) => route.fulfill({ json: { id: 'menu-test' } }))
  await page.route('**/rest/v1/mdm_material_category?*', (route) =>
    route.fulfill({
      json: [
        { id: 'category-parent', parent_id: null, category_code: 'B', category_name: '半成品' },
        {
          id: 'category-child',
          parent_id: 'category-parent',
          category_code: 'B01',
          category_name: '挖掘机配件'
        }
      ]
    })
  )
  const categoryFilters: string[] = []
  await page.route('**/rest/v1/mdm_material?*', (route) => {
    const query = new URL(route.request().url()).searchParams
    categoryFilters.push(query.get('category_id') || '')
    return route.fulfill({
      json: [
        {
          id: 'material-selected',
          tenant_id: '11111111-1111-4111-8111-111111111111',
          code: 'MAT-CATEGORY-01',
          name: '分类参选测试物料',
          description: '分类与子分类回归',
          serial_management_enabled: false,
          inventory_unit_id: 'unit-test',
          base_unit_id: 'unit-test',
          unit_conversions: []
        }
      ],
      headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
    })
  })
  await page.goto('/tests/e2e/fixtures/wms-document-serials.html', {
    waitUntil: 'domcontentloaded'
  })
  await page.getByRole('button', { name: '打开采购单据', exact: true }).click()
  await page
    .locator('.el-drawer:visible')
    .getByRole('button', { name: '添加物料', exact: true })
    .click()
  const dialog = page.getByRole('dialog', { name: '选择采购物料', exact: true })
  const navigation = dialog.locator('.art-data-select-dialog__navigation')
  await expect(navigation.getByText('物料分类', { exact: true })).toBeVisible()
  await navigation.getByText('半成品', { exact: true }).click()
  await expect.poll(() => categoryFilters).toContain('in.(category-parent,category-child)')
  await dialog.locator('.el-table__body tr').first().locator('.el-checkbox').click()
  await expect(dialog.getByText('分类参选测试物料', { exact: true })).toHaveCount(2)
  expect(await dialog.evaluate((node) => node.scrollWidth > node.clientWidth + 1)).toBe(false)
  await page.screenshot({
    path: testInfo.outputPath('material-three-panels.png'),
    animations: 'disabled'
  })
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(
    page.locator('.el-drawer:visible').getByText('分类参选测试物料', { exact: true })
  ).toBeVisible()
})
