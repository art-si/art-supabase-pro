import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

test('调拨申请按分类和仓储位置选择库存批次并带入明细', async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  const tenantId = 'tenant-test'
  const batchId = 'batch-selected'
  const stockQueries: URLSearchParams[] = []
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
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
  await page.route('**/rest/v1/mdm_warehouse?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'warehouse-one',
          tenant_id: tenantId,
          organization_id: 'organization-one',
          warehouse_code: 'WH-01',
          warehouse_name: '测试原料仓',
          status: 'enabled'
        }
      ]
    })
  )
  await page.route('**/rest/v1/mdm_warehouse_zone?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'zone-one',
          warehouse_id: 'warehouse-one',
          zone_code: 'Z-01',
          zone_name: '测试库区'
        }
      ]
    })
  )
  await page.route('**/rest/v1/mdm_warehouse_bin?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'bin-one',
          warehouse_id: 'warehouse-one',
          zone_id: 'zone-one',
          bin_code: 'B-01',
          bin_name: '测试库位'
        }
      ]
    })
  )
  await page.route('**/rest/v1/mdm_unit_of_measure?*', (route) =>
    route.fulfill({ json: [{ id: 'unit-one', unit_code: 'PCS', unit_name: '件' }] })
  )
  await page.route('**/rest/v1/wms_inventory_batch?*', (route) => {
    stockQueries.push(new URL(route.request().url()).searchParams)
    return route.fulfill({
      json: [
        {
          id: batchId,
          tenant_id: tenantId,
          organization_id: 'organization-one',
          warehouse_id: 'warehouse-one',
          zone_id: 'zone-one',
          bin_id: 'bin-one',
          material_id: 'material-one',
          batch_no: 'LOT-01',
          quantity: 9,
          unit_cost: 12.5,
          status: 'normal',
          owner_type: 'self',
          owner_id: null,
          project_id: null,
          construction_no: null,
          production_date: null,
          expiry_date: null,
          tracking_no: null,
          warehouse: { warehouse_code: 'WH-01', warehouse_name: '测试原料仓' },
          bin: { bin_code: 'B-01', bin_name: '测试库位' },
          material: {
            material_code: 'MAT-01',
            material_name: '测试调拨物料',
            description: '测试调拨物料描述',
            specification_model: 'M10',
            drawing_no: 'DRAW-01',
            brand: '测试品牌',
            category_id: 'category-child',
            material_source: 'purchased',
            material_type: 'part',
            serial_management_enabled: false,
            inventory_unit_id: 'unit-one',
            base_unit_id: 'unit-one',
            unit_conversions: []
          }
        }
      ],
      headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
    })
  })
  await page.goto('/tests/e2e/fixtures/wms-operation-retry.html', {
    waitUntil: 'domcontentloaded'
  })
  await page.getByRole('button', { name: '测试调拨申请创建', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: '新增调拨申请单', exact: true })
  await drawer.getByRole('button', { name: '添加物料', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '选择调拨库存', exact: true })
  const navigation = dialog.locator('.art-data-select-dialog__navigation')
  await expect(navigation.getByText('物料分类', { exact: true })).toBeVisible()
  await expect(navigation.getByText('仓储位置', { exact: true })).toBeVisible()
  await navigation.getByText('半成品', { exact: true }).click()
  await expect
    .poll(() =>
      stockQueries.some(
        (query) => query.get('material.category_id') === 'in.(category-parent,category-child)'
      )
    )
    .toBe(true)
  await navigation.getByText('测试原料仓', { exact: true }).click()
  await expect
    .poll(() => stockQueries.some((query) => query.get('warehouse_id') === 'eq.warehouse-one'))
    .toBe(true)
  await expect(dialog.getByText('MAT-01', { exact: true })).toBeVisible()
  await expect(dialog.getByText('测试调拨物料描述', { exact: true })).toBeVisible()
  await expect(dialog.getByText('采购', { exact: true })).toBeVisible()
  await expect(dialog.getByText('purchased', { exact: true })).toHaveCount(0)
  await dialog.locator('.el-table__body tr').first().locator('.el-checkbox').click()
  expect(await dialog.evaluate((node) => node.scrollWidth > node.clientWidth + 1)).toBe(false)
  await page.screenshot({
    path: testInfo.outputPath('transfer-stock-picker.png'),
    animations: 'disabled'
  })
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect(drawer.getByText('测试调拨物料描述', { exact: true })).toBeVisible()
})
