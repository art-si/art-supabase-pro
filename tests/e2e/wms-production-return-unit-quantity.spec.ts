import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(300_000)

test('生产退料单位换算保留负号和四位基本数量', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const material = {
    id: 'material-test',
    tenant_id: 'tenant-test',
    material_code: 'MAT-RETURN',
    material_name: '单位换算退料物料',
    inventory_unit_id: 'box',
    base_unit_id: 'piece',
    serial_management_enabled: false,
    unit_conversions: [{ sourceUnitId: 'box', sourceFactor: 1, baseFactor: 12.3456 }]
  }
  const document = {
    id: 'production-test',
    tenant_id: 'tenant-test',
    kind: 'return',
    document_no: 'RETURN-UNIT-001',
    document_type_id: 'type-test',
    business_type_id: 'business-test',
    organization_id: 'org-test',
    warehouse_id: 'warehouse-test',
    business_date: '2026-10-27',
    status: 'draft',
    material_status: 'pending',
    lines: [
      {
        id: 'line-test',
        line_no: 1,
        material_id: material.id,
        material,
        inventory_unit_id: 'box',
        base_unit_id: 'piece',
        requested_quantity: -1,
        actual_quantity: -1,
        base_quantity: -12.3456,
        warehouse_id: 'warehouse-test',
        return_type: 'good',
        stock_type: 'normal',
        owner_type: 'self',
        stock_status: 'available',
        serial_ids: [],
        serial_nos: []
      }
    ]
  }
  await page.route('**/rest/v1/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    const data: Record<string, unknown> = {
      sys_menu: { id: 'production-menu' },
      mdm_organization: [
        {
          id: 'org-test',
          tenant_id: 'tenant-test',
          organization_code: 'ORG',
          organization_name: '测试库存组织',
          status: '1',
          initialization: { enabled_on: '2026-01-01', is_default: true }
        }
      ],
      mdm_warehouse: [
        {
          id: 'warehouse-test',
          tenant_id: 'tenant-test',
          organization_id: 'org-test',
          warehouse_code: 'WH',
          warehouse_name: '测试原料仓',
          status: 'enabled',
          enable_locations: false
        }
      ],
      mdm_document_type: [
        {
          id: 'type-test',
          tenant_id: 'tenant-test',
          document_type_name: '生产退料',
          is_default: true
        }
      ],
      mdm_business_type: [
        { id: 'business-test', tenant_id: 'tenant-test', business_type_name: '生产退料' }
      ],
      mdm_unit_of_measure: [
        { id: 'box', unit_code: 'BOX', unit_name: '箱' },
        { id: 'piece', unit_code: 'PCS', unit_name: '件' }
      ],
      mdm_material: [material],
      wms_production_material_document: document
    }
    return route.fulfill({
      headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' },
      json: data[name || ''] ?? []
    })
  })
  await page.goto('/tests/e2e/fixtures/wms-production-material.html?kind=return', {
    waitUntil: 'commit',
    timeout: 180_000
  })
  const open = page.getByRole('button', { name: '测试生产单据 edit', exact: true })
  await expect(open).toBeVisible({ timeout: 120_000 })
  await open.click()
  const drawer = page.locator('.el-drawer:visible')
  const table = drawer.locator('.art-table.wms-editable-line-table')
  await expect(table).toBeVisible()
  const headers = await table.locator('.el-table__header th').allTextContents()
  const actualIndex = headers.findIndex((text) => text.includes('退料数量'))
  const baseIndex = headers.findIndex((text) => text.includes('基本数量'))
  expect(actualIndex).toBeGreaterThanOrEqual(0)
  expect(baseIndex).toBeGreaterThanOrEqual(0)
  const cells = table.locator('.el-table__body tr').first().locator('td')
  const input = cells.nth(actualIndex).locator('input')
  await input.fill('1')
  await input.press('Tab')
  await expect(input).toHaveValue('-1.0000')
  await expect(cells.nth(baseIndex)).toHaveText('-12.3456')
  await cells.nth(baseIndex).scrollIntoViewIfNeeded()
  expect(errors).toEqual([])
  await page.screenshot({ path: info.outputPath('wms-return-negative-four-decimals.png') })
})
