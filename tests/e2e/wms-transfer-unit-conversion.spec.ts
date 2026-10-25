import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'

test.use({ storageState: { cookies: [], origins: [] } })

test('调拨申请和直接调拨按库存单位换算基本数量', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/sys_menu?*', (route) => route.fulfill({ json: { id: 'menu-test' } }))
  await page.route('**/rest/v1/sys_user?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'user-test',
          tenant_id: 'tenant-test',
          organization_id: 'organization-one',
          user_name: '测试申请人',
          nick_name: '测试申请人',
          user_email: 'applicant@example.invalid',
          status: '1',
          organization: { id: 'organization-one', organization_name: '测试库存组织' }
        },
        {
          id: 'user-second',
          tenant_id: 'tenant-test',
          organization_id: 'organization-two',
          user_name: '另一申请人',
          nick_name: '另一申请人',
          user_email: 'second@example.invalid',
          status: '1',
          organization: { id: 'organization-two', organization_name: '测试二部门' }
        }
      ]
    })
  )
  await page.route('**/rest/v1/mdm_document_type?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'request-type',
          tenant_id: 'tenant-test',
          menu_ids: ['menu-test'],
          enabled: true,
          document_type_code: 'MT10',
          document_type_name: '标准调拨申请'
        },
        {
          id: 'direct-type',
          tenant_id: 'tenant-test',
          menu_ids: ['menu-test'],
          enabled: true,
          document_type_code: 'MT',
          document_type_name: '标准直接调拨'
        }
      ]
    })
  )
  await page.route('**/rest/v1/mdm_business_type?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'request-business',
          tenant_id: 'tenant-test',
          menu_ids: ['menu-test'],
          document_type_ids: ['request-type'],
          enabled: true,
          business_type_code: 'M300',
          business_type_name: '标准调拨申请'
        },
        {
          id: 'direct-business',
          tenant_id: 'tenant-test',
          menu_ids: ['menu-test'],
          document_type_ids: ['direct-type'],
          enabled: true,
          business_type_code: 'M311',
          business_type_name: '存储地点间转储'
        }
      ]
    })
  )
  await page.route('**/rest/v1/mdm_customer?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'customer-test',
          tenant_id: 'tenant-test',
          customer_code: 'C-TEST',
          customer_name: '测试客户'
        }
      ]
    })
  )
  await page.route('**/rest/v1/mdm_material?*', (route) => {
    const params = new URL(route.request().url()).searchParams
    if (params.get('material_code') === 'eq.MAT-UNIT')
      return route.fulfill({ json: { id: 'material-unit-test' } })
    return route.fulfill({
      json: [
        {
          id: 'material-unit-test',
          tenant_id: 'tenant-test',
          material_code: 'MAT-UNIT',
          material_name: '换算测试物料',
          description: '换算测试物料',
          specification_model: 'T/KG',
          status: 'enabled',
          serial_management_enabled: false,
          base_unit_id: 'unit-kg',
          inventory_unit_id: 'unit-ton',
          unit_conversions: [{ source_unit_id: 'unit-ton', source_factor: 1, base_factor: 1000 }]
        }
      ],
      headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
    })
  })
  await page.route('**/rest/v1/mdm_organization?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'organization-one',
          tenant_id: 'tenant-test',
          organization_code: 'ORG-01',
          organization_name: '测试库存组织',
          organization_type: 'company',
          status: '1',
          initialization: {
            enabled_on: '2026-10-01',
            is_default: true,
            initialization_closed_at: '2026-10-01'
          }
        },
        {
          id: 'organization-two',
          tenant_id: 'tenant-test',
          organization_code: 'ORG-02',
          organization_name: '测试二部门',
          organization_type: 'department',
          status: '1'
        }
      ],
      headers: { 'content-range': '0-1/2', 'access-control-expose-headers': 'content-range' }
    })
  )
  await page.route('**/rest/v1/mdm_warehouse?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'warehouse-one',
          tenant_id: 'tenant-test',
          organization_id: 'organization-one',
          warehouse_code: 'WH-01',
          warehouse_name: '来源仓库',
          status: 'enabled'
        },
        {
          id: 'warehouse-two',
          tenant_id: 'tenant-test',
          organization_id: 'organization-one',
          warehouse_code: 'WH-02',
          warehouse_name: '目标仓库',
          status: 'enabled'
        }
      ]
    })
  )
  await page.route('**/rest/v1/mdm_unit_of_measure?*', (route) =>
    route.fulfill({
      json: [
        { id: 'unit-kg', unit_code: 'KG', unit_name: '千克' },
        { id: 'unit-ton', unit_code: 'T', unit_name: '吨' }
      ]
    })
  )
  await page.route('**/rest/v1/wms_inventory_batch?*', (route) => {
    const params = new URL(route.request().url()).searchParams
    if (params.get('batch_no') === 'eq.MAT-UNIT')
      return route.fulfill({
        json: [],
        headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' }
      })
    return route.fulfill({
      json: [
        {
          id: 'batch-unit-test',
          tenant_id: 'tenant-test',
          organization_id: 'organization-one',
          warehouse_id: 'warehouse-one',
          bin_id: null,
          material_id: 'material-unit-test',
          batch_no: 'LOT-UNIT',
          quantity: 500,
          display_quantity: 0.5,
          status: 'normal',
          stock_type: 'entrusted_processing',
          owner_type: 'customer',
          owner_id: 'customer-test',
          project_id: null,
          construction_no: null,
          unit_cost: 2,
          production_date: '2026-01-01',
          expiry_date: '2027-01-01',
          tracking_no: 'TRACK-UNIT',
          warehouse: { warehouse_code: 'WH-01', warehouse_name: '来源仓库' },
          material: {
            material_code: 'MAT-UNIT',
            material_name: '换算测试物料',
            description: '换算测试物料',
            specification_model: 'T/KG',
            serial_management_enabled: false,
            base_unit_id: 'unit-kg',
            inventory_unit_id: 'unit-ton',
            unit_conversions: [{ source_unit_id: 'unit-ton', source_factor: 1, base_factor: 1000 }]
          }
        }
      ],
      headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
    })
  })
  await page.goto('/tests/e2e/fixtures/wms-operation-retry.html', {
    waitUntil: 'domcontentloaded'
  })
  await page.getByRole('button', { name: '测试调拨申请创建' }).click()
  const request = page.getByRole('dialog', { name: '新增调拨申请单' })
  await expect(request.getByText('测试申请人', { exact: true })).toBeVisible()
  await request.locator('.el-form-item').filter({ hasText: '申请人' }).locator('.el-select').click()
  await page.getByRole('option', { name: /另一申请人/ }).click()
  await expect(
    request.locator('.el-form-item').filter({ hasText: '申请部门' }).getByText('测试二部门')
  ).toBeVisible()
  await request.getByRole('button', { name: '添加物料' }).click()
  const picker = page.getByRole('dialog', { name: '选择调拨库存' })
  await expect(picker.getByText('MAT-UNIT', { exact: true })).toBeVisible()
  await expect(picker.getByText('0.5000', { exact: true })).toHaveCount(2)
  await expect(picker.getByText('500.0000', { exact: true })).toHaveCount(1)
  await expect(picker.getByText('2000.00', { exact: true })).toBeVisible()
  await expect(picker.getByText('1000.00', { exact: true })).toBeVisible()
  await picker.locator('.el-table__body tr').first().locator('.el-checkbox').click()
  await picker.getByRole('button', { name: '确定', exact: true }).click()
  await expect(request.locator('.transfer-line-table').getByText('500.0000')).toBeVisible()
  await expect(
    request.locator('.transfer-line-table').getByRole('spinbutton').first()
  ).toHaveJSProperty('valueAsNumber', 0.5)
  await expect
    .poll(() =>
      request
        .locator('.transfer-line-table input')
        .evaluateAll((inputs) =>
          inputs
            .filter((input) => (input as HTMLInputElement).value === 'TRACK-UNIT')
            .map((input) => (input as HTMLInputElement).disabled)
        )
    )
    .toEqual([true])
  await expect(request.getByText('受托加工', { exact: true })).toBeVisible()
  await expect(request.getByText('测试客户', { exact: true })).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('transfer-request-unit-conversion.png'),
    animations: 'disabled'
  })
  await request.getByRole('button', { name: '移除', exact: true }).click()
  const requestWorkbook = new ExcelJS.Workbook()
  const requestSheet = requestWorkbook.addWorksheet('调拨申请明细')
  requestSheet.addRow(['物料编码', '数量'])
  requestSheet.addRow(['MAT-UNIT', 0.4])
  await request.locator('input[type="file"]').setInputFiles({
    name: '调拨申请手工货主.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from(await requestWorkbook.xlsx.writeBuffer())
  })
  await expect(request.locator('.transfer-line-table').getByText('400.0000')).toBeVisible()
  const manualRow = request.locator('.transfer-line-table .el-table__body tr').first()
  const ownerTypeColumnIndex = await request
    .locator('.transfer-line-table th')
    .filter({ hasText: '货主类型' })
    .first()
    .evaluate((header) => (header as HTMLTableCellElement).cellIndex)
  await manualRow.locator('td').nth(ownerTypeColumnIndex).locator('.el-select').click()
  await page.getByRole('option', { name: '客户', exact: true }).click()
  await manualRow.locator('.art-data-select__single-input').click()
  const ownerPicker = page.getByRole('dialog', { name: '选择货主' })
  await expect(ownerPicker.getByText('测试客户', { exact: true })).toBeVisible()
  await ownerPicker.locator('.el-table__body tr').first().click()
  await ownerPicker.getByRole('button', { name: '确定', exact: true }).click()
  await expect(manualRow.locator('.art-data-select__single-input input')).toHaveValue('测试客户')
  await request.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('button', { name: '测试直接调拨单创建' }).click()
  const direct = page.getByRole('dialog', { name: '新增直接调拨单' })
  await direct.getByRole('button', { name: '添加物料' }).click()
  const directPicker = page.getByRole('dialog', { name: '选择调拨库存' })
  await expect(directPicker.getByText('MAT-UNIT', { exact: true })).toBeVisible()
  await directPicker.locator('.el-table__body tr').first().locator('.el-checkbox').click()
  await directPicker.getByRole('button', { name: '确定', exact: true }).click()
  await direct.getByRole('button', { name: '编辑', exact: true }).click()
  const line = page.getByRole('dialog', { name: '编辑调拨明细' })
  await expect(
    line.locator('.el-form-item').filter({ hasText: '数量' }).locator('input').first()
  ).toHaveJSProperty('valueAsNumber', 0.5)
  await expect(
    line.locator('.el-form-item').filter({ hasText: '基本数量' }).locator('input').first()
  ).toHaveJSProperty('valueAsNumber', 500)
  await line.locator('.el-form-item').filter({ hasText: '调入仓库' }).locator('.el-select').click()
  await page.getByRole('option', { name: /目标仓库/ }).click()
  const requestedQuantity = line
    .locator('.el-form-item')
    .filter({ hasText: '数量' })
    .locator('input')
    .first()
  await requestedQuantity.fill('0.6')
  await line.getByRole('button', { name: '确定', exact: true }).click()
  await expect(page.getByText('调拨数量超过当前可用库存量，或物料单位缺少换算关系')).toBeVisible()
  await expect(line).toBeVisible()
  await requestedQuantity.fill('0.4')
  await line.getByRole('button', { name: '确定', exact: true }).click()
  await expect(line).toBeHidden()
  await direct.getByRole('button', { name: '删除', exact: true }).click()
  const importQuantity = async (quantity: number) => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('调拨明细')
    sheet.addRow(['物料编码', '批次号', '数量'])
    sheet.addRow(['MAT-UNIT', 'LOT-UNIT', quantity])
    await direct.locator('input[type="file"]').setInputFiles({
      name: `调拨换算-${quantity}.xlsx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from(await workbook.xlsx.writeBuffer())
    })
  }
  await importQuantity(0.6)
  await expect(page.getByText(/第 1 行匹配到 0 个可用批次/)).toBeVisible()
  await expect(direct.locator('.transfer-business-lines')).toHaveCount(0)
  await importQuantity(0.4)
  await expect(direct.locator('.transfer-business-lines').first()).toBeVisible()
  await direct.getByRole('button', { name: '编辑', exact: true }).click()
  await expect(
    page
      .getByRole('dialog', { name: '编辑调拨明细' })
      .locator('.el-form-item')
      .filter({ hasText: '基本数量' })
      .locator('input')
      .first()
  ).toHaveJSProperty('valueAsNumber', 400)
  await page
    .getByRole('dialog', { name: '编辑调拨明细' })
    .getByRole('button', { name: '取消' })
    .click()
  await direct.getByRole('button', { name: '删除', exact: true }).click()
  await direct.getByLabel('PDA 扫码录入').fill('MAT-UNIT')
  await direct.getByLabel('PDA 扫码录入').press('Enter')
  await expect(direct.getByText('换算测试物料', { exact: true })).toBeVisible()
})
