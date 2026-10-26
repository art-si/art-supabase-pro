import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

test('领料选单读取工单 BOM 快照，扣除选单占用并恢复可重领退料，同物料分录分别领用', async ({
  page
}, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const materials = [1, 2, 3].map((n) => ({
    id: `material-${n}`,
    material_code: `BOM-MAT-${n}`,
    material_name: `BOM组件${n}`,
    description: `工单快照组件${n}`,
    specification_model: `MODEL-${n}`,
    inventory_unit_id: 'unit-test',
    base_unit_id: 'unit-test',
    serial_management_enabled: false,
    unit_conversions: []
  }))
  const document = {
    id: 'production-test',
    tenant_id: 'tenant-test',
    kind: 'issue',
    document_no: 'PICK-001',
    document_type_id: 'type-test',
    business_type_id: 'business-test',
    organization_id: 'org-test',
    warehouse_id: 'warehouse-test',
    work_order_id: 'work-order-test',
    business_date: '2026-10-26',
    status: 'draft',
    material_status: 'pending',
    remark: '',
    lines: []
  }
  const item = (id: string, material: number, quantity: number, sequence: number) => ({
    id,
    component_material_id: `material-${material}`,
    required_quantity: quantity,
    basic_quantity: 2,
    sequence_no: sequence,
    unit_name: '千克',
    position_no: `P-${sequence}`,
    operation_name: '工单指定工序'
  })
  let writes = 0
  const materialReads: string[] = []
  const snapshotReads: string[] = []
  await page.route('**/rest/v1/**', (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const name = url.pathname.split('/').at(-1)
    if (request.method() !== 'GET' && !url.pathname.includes('/rpc/')) writes++
    const data: Record<string, unknown> = {
      sys_menu: { id: 'production-menu' },
      mdm_organization: [
        {
          id: 'org-test',
          tenant_id: 'tenant-test',
          organization_code: 'ORG',
          organization_name: '测试库存组织',
          status: '1',
          initialization: {
            enabled_on: '2026-01-01',
            is_default: true,
            initialization_closed_at: '2026-01-02'
          }
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
          document_type_name: '生产领料',
          is_default: true
        }
      ],
      mdm_business_type: [
        {
          id: 'business-test',
          tenant_id: 'tenant-test',
          business_type_name: '生产领料',
          is_default: true
        }
      ],
      mdm_unit_of_measure: [{ id: 'unit-test', unit_code: 'KG', unit_name: '千克' }],
      wms_production_material_document: document,
      wms_work_order_options_secure: [
        {
          id: 'work-order-test',
          work_order_no: 'MO-BOM-001',
          tenant_id: 'tenant-test',
          material_id: 'product-test',
          material_name: '成品',
          order_quantity: 100
        }
      ],
      mes_work_order: {
        work_order_no: 'MO-BOM-001',
        bom_snapshot: [
          {
            id: 'bom-test',
            items: [
              item('source-a', 1, 100, 10),
              item('source-b', 2, 200, 20),
              item('source-c', 3, 50, 30),
              item('source-same-material', 1, 10, 40),
              item('zero-quantity', 1, 0, 50),
              null,
              'invalid'
            ]
          }
        ]
      },
      mdm_material: materials,
      wms_work_order_bom_issue_totals_secure: [
        {
          source_line_no: 'source-a',
          selected_quantity: 40,
          issued_quantity: 30,
          good_return_quantity: 5,
          incoming_defect_return_quantity: 2
        },
        {
          source_line_no: 'source-b',
          selected_quantity: 200,
          issued_quantity: 200,
          good_return_quantity: 0,
          incoming_defect_return_quantity: 0
        },
        {
          source_line_no: 'source-same-material',
          selected_quantity: 2,
          issued_quantity: 2,
          good_return_quantity: 0,
          incoming_defect_return_quantity: 0
        }
      ]
    }
    if (name === 'mes_work_order') {
      snapshotReads.push(url.search)
      expect(url.searchParams.get('id')).toBe('eq.work-order-test')
      expect(url.searchParams.get('tenant_id')).toBe('eq.tenant-test')
    }
    if (name === 'mdm_material') {
      materialReads.push(url.search)
      expect(url.searchParams.get('tenant_id')).toBe('eq.tenant-test')
    }
    return route.fulfill({
      headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' },
      json: data[name || ''] ?? []
    })
  })
  await page.goto('/tests/e2e/fixtures/wms-production-material.html?kind=issue', {
    waitUntil: 'domcontentloaded',
    timeout: 120_000
  })
  await expect(page.getByRole('button', { name: '测试生产单据 edit', exact: true })).toBeVisible({
    timeout: 120_000
  })
  await page.getByRole('button', { name: '测试生产单据 edit', exact: true }).click()
  const drawer = page.locator('.el-drawer')
  await expect(drawer.getByRole('button', { name: '选单', exact: true })).toBeEnabled()
  await expect.poll(() => materialReads.length).toBeGreaterThan(0)
  await drawer.getByRole('button', { name: '选单', exact: true }).click()
  const picker = page.getByRole('dialog', { name: '参选生产工单 BOM 未领料明细', exact: true })
  const rows = picker.locator('.el-table__body-wrapper tbody tr')
  await expect(rows).toHaveCount(3)
  await expect(rows.filter({ hasText: 'BOM-MAT-2' })).toHaveCount(0)
  const first = rows.filter({ hasText: 'P-10' })
  await expect(first).toContainText('100')
  await expect(first).toContainText('67')
  await expect(first).toContainText('千克')
  await expect(first).toContainText('工单指定工序')
  await expect(rows.filter({ hasText: 'P-40' })).toContainText('8')
  await page.screenshot({ path: testInfo.outputPath('bom-unissued-picker.png'), fullPage: true })
  await first.locator('.el-checkbox').click()
  await rows.filter({ hasText: 'P-40' }).locator('.el-checkbox').click()
  await picker.getByRole('button', { name: '确定', exact: true }).click()
  const lines = drawer.locator('.el-table__body-wrapper tbody tr')
  await expect(lines).toHaveCount(2)
  await expect(lines.nth(0).getByRole('spinbutton').first()).toHaveValue('67.0000')
  await expect(lines.nth(1).getByRole('spinbutton').first()).toHaveValue('8.0000')
  await lines.nth(0).getByRole('spinbutton').first().fill('10')
  await lines.nth(0).getByRole('spinbutton').first().press('Tab')
  await drawer.getByRole('button', { name: '选单', exact: true }).click()
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('BOM-MAT-3')
  await picker.getByRole('button', { name: '取消', exact: true }).click()
  expect(snapshotReads.length).toBeGreaterThan(0)
  expect(writes).toBe(0)
  expect(errors).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(
    false
  )
})
