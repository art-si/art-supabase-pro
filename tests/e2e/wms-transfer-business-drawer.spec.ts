import { expect, test, type Page } from '@playwright/test'
import ExcelJS from 'exceljs'

test.use({ storageState: { cookies: [], origins: [] } })

async function mockStandardTransferTypes(page: Page, kind: '直接' | '分步'): Promise<void> {
  await page.route('**/rest/v1/mdm_document_type?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'type-test',
          tenant_id: 'tenant-test',
          menu_ids: ['menu-test'],
          enabled: true,
          document_type_code: kind === '直接' ? 'MT' : 'MT20',
          document_type_name: `标准${kind}调拨单`
        }
      ]
    })
  )
  await page.route('**/rest/v1/mdm_business_type?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'business-test',
          tenant_id: 'tenant-test',
          menu_ids: ['menu-test'],
          document_type_ids: ['type-test'],
          enabled: true,
          business_type_code: kind === '直接' ? 'M311' : 'M303',
          business_type_name: kind === '直接' ? '存储地点间转储' : '工厂间转储发货'
        }
      ]
    })
  )
}

test('直接调拨缺少 MDM 标准类型时显示配置指引并禁止保存', async ({ page }) => {
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/sys_menu?*', (route) => route.fulfill({ json: { id: 'menu-test' } }))
  await page.goto('/tests/e2e/fixtures/wms-operation-retry.html', {
    waitUntil: 'domcontentloaded'
  })
  await page.getByRole('button', { name: '测试直接调拨单创建', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: '新增直接调拨单', exact: true })
  await expect(
    drawer.getByText('当前租户尚未在 MDM 配置直接调拨标准单据类型，请先配置后重试。')
  ).toBeVisible()
  await expect(drawer.getByRole('button', { name: '保存', exact: true })).toBeDisabled()
  await expect(drawer.getByRole('button', { name: '重新加载', exact: true })).toBeVisible()
})

for (const kind of ['直接', '分步'] as const) {
  test(`${kind}调拨单可多选库存并编辑明细`, async ({ page }, testInfo) => {
    test.setTimeout(90_000)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
    await page.route('**/rest/v1/sys_menu?*', (route) =>
      route.fulfill({ json: { id: 'menu-test' } })
    )
    await mockStandardTransferTypes(page, kind)
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
          }
        ],
        headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
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
            status: 'enabled',
            enable_locations: true
          },
          {
            id: 'warehouse-two',
            tenant_id: 'tenant-test',
            organization_id: 'organization-one',
            warehouse_code: 'WH-02',
            warehouse_name: '目标仓库',
            status: 'enabled'
          },
          {
            id: 'warehouse-other',
            tenant_id: 'tenant-test',
            organization_id: 'organization-two',
            warehouse_code: 'WH-OTHER',
            warehouse_name: '异组织仓库',
            status: 'enabled'
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
            zone_id: null,
            bin_code: 'BIN-01',
            bin_name: '来源仓位',
            status: 'available'
          },
          {
            id: 'bin-same-target',
            warehouse_id: 'warehouse-one',
            zone_id: null,
            bin_code: 'BIN-03',
            bin_name: '同仓目标仓位',
            status: 'available'
          },
          {
            id: 'bin-two',
            warehouse_id: 'warehouse-two',
            zone_id: null,
            bin_code: 'BIN-02',
            bin_name: '目标仓位',
            status: 'available'
          }
        ]
      })
    )
    await page.route('**/rest/v1/mdm_unit_of_measure?*', (route) =>
      route.fulfill({ json: [{ id: 'unit-one', unit_code: 'PCS', unit_name: '件' }] })
    )
    await page.route('**/rest/v1/wms_inventory_batch?*', (route) => {
      const query = new URL(route.request().url()).searchParams
      if (!query.has('id') && !query.has('batch_no') && !query.has('material_id'))
        expect(query.get('organization_id')).toBe('eq.organization-one')
      return route.fulfill({
        json: [
          {
            id: 'batch-one',
            tenant_id: 'tenant-test',
            organization_id: 'organization-one',
            warehouse_id: 'warehouse-one',
            bin_id: 'bin-one',
            material_id: 'material-one',
            batch_no: 'LOT-01',
            quantity: 8,
            status: 'normal',
            stock_type: 'entrusted_processing',
            owner_type: 'self',
            owner_id: null,
            project_id: null,
            construction_no: null,
            unit_cost: 2.5,
            warehouse: { warehouse_code: 'WH-01', warehouse_name: '来源仓库' },
            bin: { bin_code: 'BIN-01', bin_name: '来源仓位' },
            material: {
              material_code: 'MAT-01',
              material_name: '测试物料',
              description: '测试调拨物料描述',
              specification_model: 'M10',
              serial_management_enabled: false,
              base_unit_id: 'unit-one',
              inventory_unit_id: 'unit-one',
              auxiliary_unit_id: null,
              auxiliary_unit_2_id: null,
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
    await page.getByRole('button', { name: `测试${kind}调拨单创建`, exact: true }).click()
    const drawer = page.getByRole('dialog', { name: `新增${kind}调拨单`, exact: true })
    await expect(drawer.getByText('单据表头', { exact: true })).toBeVisible()
    await expect(drawer.getByLabel('PDA 扫码录入')).toBeVisible()
    await drawer.getByRole('button', { name: '添加物料', exact: true }).click()
    const picker = page.getByRole('dialog', { name: '选择调拨库存', exact: true })
    await expect(picker.getByText('MAT-01', { exact: true })).toBeVisible()
    await picker.locator('.el-table__body tr').first().locator('.el-checkbox').click()
    await picker.getByRole('button', { name: '确定', exact: true }).click()
    await expect(drawer.getByText('测试调拨物料描述', { exact: true })).toBeVisible()
    await drawer.getByRole('button', { name: '编辑', exact: true }).click()
    const lineDialog = page.getByRole('dialog', { name: '编辑调拨明细', exact: true })
    await expect(lineDialog.getByText('货主类型', { exact: true })).toBeVisible()
    if (kind === '直接') {
      await lineDialog.getByRole('button', { name: '确定', exact: true }).click()
      await expect(
        page.getByText('调出仓库和调入仓库相同时，调出仓位和调入仓位必须不同')
      ).toBeVisible()
      await expect(lineDialog).toBeVisible()
    } else {
      await lineDialog
        .locator('.el-form-item')
        .filter({ hasText: '调入仓位' })
        .locator('.el-select')
        .click()
      await expect(page.getByRole('option', { name: /来源仓位/ })).toHaveCount(0)
      await page.getByRole('option', { name: /同仓目标仓位/ }).click()
      await lineDialog.getByRole('button', { name: '确定', exact: true }).click()
      await expect(lineDialog).toBeHidden()
      await drawer.getByRole('button', { name: '编辑', exact: true }).click()
      await expect(lineDialog).toBeVisible()
    }
    await lineDialog
      .locator('.el-form-item')
      .filter({ hasText: '调入仓库' })
      .locator('.el-select')
      .click()
    await expect(page.getByRole('option', { name: /异组织仓库/ })).toHaveCount(0)
    await page.getByRole('option', { name: /目标仓库/ }).click()
    await lineDialog.getByRole('button', { name: '确定', exact: true }).click()
    await expect(lineDialog).toBeHidden()
    await drawer.getByRole('button', { name: '选单', exact: true }).click()
    const requestPicker = page.getByRole('dialog', { name: '选单', exact: true })
    await expect(requestPicker.locator('.art-table-query')).toBeVisible()
    await expect(requestPicker.getByText('申请单号', { exact: true }).first()).toBeVisible()
    await expect(requestPicker.getByRole('button', { name: '查询', exact: true })).toBeVisible()
    await requestPicker.getByRole('button', { name: '取消', exact: true }).click()
    if (kind === '直接') {
      await drawer.getByRole('button', { name: '删除', exact: true }).click()
      const workbook = new ExcelJS.Workbook()
      const sheet = workbook.addWorksheet('调拨明细')
      sheet.addRow(['物料编码', '批次号', '数量'])
      sheet.addRow(['MAT-01', 'LOT-01', 2])
      await drawer.locator('input[type="file"]').setInputFiles({
        name: '直接调拨明细.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: Buffer.from(await workbook.xlsx.writeBuffer())
      })
      await expect(drawer.getByText('测试调拨物料描述', { exact: true })).toBeVisible()
      await expect(drawer.getByRole('button', { name: '导入明细', exact: true })).toBeVisible()
    }
    await page.screenshot({
      path: testInfo.outputPath(`${kind}-transfer-business-drawer.png`),
      animations: 'disabled'
    })
    expect(errors).toEqual([])
  })
}

test('直接调拨选单带入来源批次并锁定申请数量和单位', async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/sys_menu?*', (route) => route.fulfill({ json: { id: 'menu-test' } }))
  await mockStandardTransferTypes(page, '直接')
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
    route.fulfill({ json: [{ id: 'unit-one', unit_code: 'PCS', unit_name: '件' }] })
  )
  await page.route('**/rest/v1/wms_inventory_batch?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'batch-one',
          tenant_id: 'tenant-test',
          organization_id: 'organization-one',
          warehouse_id: 'warehouse-one',
          bin_id: null,
          material_id: 'material-one',
          batch_no: 'LOT-01',
          quantity: 8,
          status: 'normal',
          stock_type: 'normal',
          owner_type: 'self',
          owner_id: null,
          project_id: null,
          construction_no: null,
          warehouse: { warehouse_code: 'WH-01', warehouse_name: '来源仓库' },
          material: {
            material_code: 'MAT-01',
            material_name: '测试物料',
            description: '来源库存物料',
            base_unit_id: 'unit-one',
            inventory_unit_id: 'unit-one',
            unit_conversions: []
          }
        }
      ],
      headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
    })
  )
  await page.route('**/rest/v1/wms_transfer_request_list?*', (route) =>
    route.fulfill({
      json: [
        {
          document_id: 'request-one',
          line_id: 'request-line-one',
          tenant_id: 'tenant-test',
          document_no: 'DBSQ202610-001',
          status: 'approved',
          line_no: 10,
          source_batch_id: 'batch-one',
          pushed_document_id: null,
          material_id: 'material-one',
          material_code: 'MAT-01',
          material_description: '来源库存物料',
          project_id: null,
          project_name: null,
          project_code: null,
          construction_no: null,
          inventory_unit_id: 'unit-one',
          quantity: 2,
          base_unit_id: 'unit-one',
          base_quantity: 2,
          batch_no: 'LOT-01',
          source_organization_id: 'organization-one',
          source_warehouse_id: 'warehouse-one',
          source_warehouse_name: '来源仓库',
          source_bin_id: null,
          target_organization_id: 'organization-one',
          target_warehouse_id: 'warehouse-two',
          target_warehouse_name: '目标仓库',
          target_bin_id: null,
          owner_type: 'supplier',
          owner_id: 'stale-owner',
          stock_type: 'entrusted_processing',
          stock_status: 'frozen',
          gift: false
        }
      ],
      headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
    })
  )
  await page.goto('/tests/e2e/fixtures/wms-operation-retry.html', {
    waitUntil: 'domcontentloaded'
  })
  await page.getByRole('button', { name: '测试直接调拨单创建', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: '新增直接调拨单', exact: true })
  await drawer.getByRole('button', { name: '选单', exact: true }).click()
  const picker = page.getByRole('dialog', { name: '选单', exact: true })
  await expect(picker.getByText('DBSQ202610-001', { exact: true })).toBeVisible()
  await picker.locator('.el-table__body tr').first().locator('.el-checkbox').click()
  await picker.getByRole('button', { name: '带入调拨明细', exact: true }).click()
  await expect(picker).toBeHidden()
  await expect(drawer.getByText('来源库存物料', { exact: true })).toBeVisible()
  await drawer.getByRole('button', { name: '编辑', exact: true }).click()
  const line = page.getByRole('dialog', { name: '编辑调拨明细', exact: true })
  await expect(line.getByText('自有', { exact: true })).toBeVisible()
  await expect(line.getByText('普通', { exact: true })).toBeVisible()
  await expect(line.getByText('可用', { exact: true })).toBeVisible()
  await expect(
    line.locator('.el-form-item').filter({ hasText: '库存单位' }).getByRole('combobox')
  ).toBeDisabled()
  await expect(
    line.locator('.el-form-item').filter({ hasText: '数量' }).locator('input').first()
  ).toBeDisabled()
  await line.getByText('库存类型', { exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({
    path: testInfo.outputPath('request-line-source-attributes.png'),
    animations: 'disabled'
  })
})

for (const kind of ['直接', '分步'] as const) {
  test(`${kind}调拨单查看使用 Description 展示表头和明细`, async ({ page }, testInfo) => {
    test.setTimeout(90_000)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
    await page.route('**/rest/v1/sys_menu?*', (route) =>
      route.fulfill({ json: { id: 'menu-test' } })
    )
    await page.route('**/rest/v1/wms_transfer_business_list?*', (route) =>
      route.fulfill({
        json: [
          {
            id: 'transfer-document-test',
            document_id: 'transfer-document-test',
            line_id: 'transfer-line-test',
            tenant_id: 'tenant-test',
            kind: kind === '直接' ? 'direct' : 'step',
            document_no: kind === '直接' ? 'DBDD202610-001' : 'DBFB202610-001',
            document_type_id: 'type-test',
            business_type_id: 'business-test',
            business_date: '2026-10-15',
            project_id: null,
            source_organization_id: 'organization-one',
            target_organization_id: 'organization-one',
            status: 'draft',
            remark: '查看说明',
            source_request_id: null,
            return_of_document_id: null,
            line: {
              id: 'transfer-line-test',
              line_no: 10,
              material_id: 'material-one',
              source_batch_id: null,
              project_id: null,
              inventory_unit_id: 'unit-one',
              quantity: 3,
              base_unit_id: 'unit-one',
              base_quantity: 3,
              batch_no: 'LOT-01',
              source_organization_id: 'organization-one',
              source_warehouse_id: 'warehouse-one',
              source_bin_id: null,
              target_organization_id: 'organization-one',
              target_warehouse_id: 'warehouse-two',
              target_bin_id: null,
              owner_type: 'self',
              stock_type: 'entrusted_processing',
              stock_status: 'available',
              returned_quantity: 0,
              serial_ids: []
            },
            material_code: 'MAT-01',
            material_description: '测试调拨物料',
            source_warehouse_name: '来源仓库',
            target_warehouse_name: '目标仓库',
            source_organization_name: '测试组织',
            target_organization_name: '测试组织',
            document_type_name: '标准调拨',
            business_type_name: '转储发货',
            inventory_unit_name: '件',
            base_unit_name: '件'
          }
        ]
      })
    )
    await page.goto('/tests/e2e/fixtures/wms-operation-retry.html', {
      waitUntil: 'domcontentloaded'
    })
    await page.getByRole('button', { name: `测试${kind}调拨单查看`, exact: true }).click()
    const drawer = page.getByRole('dialog', { name: `查看${kind}调拨单`, exact: true })
    await expect(drawer.locator('.art-descriptions')).toBeVisible()
    await expect(drawer.locator('.el-form')).toHaveCount(0)
    await drawer.getByRole('button', { name: '查看', exact: true }).click()
    const line = page.getByRole('dialog', { name: '查看调拨明细', exact: true })
    await expect(line.locator('.art-descriptions')).toBeVisible()
    await expect(line.locator('.el-form')).toHaveCount(0)
    await expect(line.getByText('受托加工', { exact: true })).toBeVisible()
    await expect(line.getByText('entrusted_processing', { exact: true })).toHaveCount(0)
    await page.screenshot({
      path: testInfo.outputPath(`${kind}-transfer-description-view.png`),
      animations: 'disabled'
    })
    expect(errors).toEqual([])
  })
}

test('分步收货单仅允许编辑日期、备注和目标仓位', async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  const errors: string[] = []
  let savedPayload: Record<string, unknown> | undefined
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/sys_menu?*', (route) => route.fulfill({ json: { id: 'menu-test' } }))
  await page.route('**/rest/v1/mdm_warehouse?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'warehouse-target',
          tenant_id: 'tenant-test',
          organization_id: 'organization-one',
          warehouse_code: 'WH-T',
          warehouse_name: '目标仓库',
          status: 'enabled',
          enable_locations: true
        }
      ]
    })
  )
  await page.route('**/rest/v1/mdm_warehouse_bin?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'bin-target',
          tenant_id: 'tenant-test',
          warehouse_id: 'warehouse-target',
          bin_code: 'T-01',
          bin_name: '目标库位',
          status: 'available'
        }
      ]
    })
  )
  await page.route('**/rest/v1/wms_transfer_business_list?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'receipt-document-test',
          document_id: 'receipt-document-test',
          line_id: 'receipt-line-test',
          tenant_id: 'tenant-test',
          kind: 'step_receipt',
          document_no: 'DBSH202610-001',
          document_type_id: 'type-test',
          business_type_id: 'receipt-business-test',
          business_date: '2026-10-16',
          source_organization_id: 'organization-one',
          target_organization_id: 'organization-one',
          status: 'draft',
          remark: '收货备注',
          line: {
            id: 'receipt-line-test',
            line_no: 10,
            material_id: 'material-one',
            inventory_unit_id: 'unit-one',
            quantity: 2,
            base_unit_id: 'unit-one',
            base_quantity: 2,
            source_organization_id: 'organization-one',
            source_warehouse_id: 'warehouse-source',
            target_organization_id: 'organization-one',
            target_warehouse_id: 'warehouse-target',
            target_bin_id: null,
            owner_type: 'self',
            stock_type: 'normal',
            stock_status: 'available',
            returned_quantity: 0,
            serial_ids: []
          },
          material_code: 'MAT-01',
          material_description: '收货物料',
          source_organization_name: '测试组织',
          target_organization_name: '测试组织',
          source_warehouse_name: '来源仓库',
          target_warehouse_name: '目标仓库',
          document_type_name: '跨工厂分步调拨',
          business_type_name: '工厂间转储收货',
          inventory_unit_name: '件',
          base_unit_name: '件'
        }
      ]
    })
  )
  await page.route('**/rest/v1/rpc/wms_update_transfer_business_receipt_secure', async (route) => {
    savedPayload = route.request().postDataJSON() as Record<string, unknown>
    await route.fulfill({ json: null })
  })
  await page.goto('/tests/e2e/fixtures/wms-operation-retry.html', {
    waitUntil: 'domcontentloaded'
  })
  await page.getByRole('button', { name: '测试分步调拨收货单编辑' }).click()
  const drawer = page.getByRole('dialog', { name: '编辑分步调拨收货单' })
  await expect(drawer.getByText('DBSH202610-001')).toBeVisible()
  await expect(drawer.getByRole('button', { name: '添加物料' })).toHaveCount(0)
  await expect(drawer.getByRole('button', { name: '扫码录入' })).toHaveCount(0)
  await expect(
    drawer.locator('.el-form-item').filter({ hasText: '单据类型' }).getByRole('combobox')
  ).toBeDisabled()
  await expect(
    drawer.locator('.el-form-item').filter({ hasText: '业务日期' }).locator('input').first()
  ).toBeEnabled()
  await drawer.getByRole('combobox', { name: '调入仓位' }).click()
  await page.getByRole('option', { name: 'T-01 · 目标库位' }).click()
  await page.screenshot({
    path: testInfo.outputPath('step-receipt-edit.png'),
    animations: 'disabled'
  })
  await drawer.getByRole('button', { name: '保存', exact: true }).click()
  await expect.poll(() => savedPayload).toBeDefined()
  expect(savedPayload?.p_document_id).toBe('receipt-document-test')
  expect(savedPayload?.p_lines).toEqual([
    { line_id: 'receipt-line-test', target_bin_id: 'bin-target' }
  ])
  expect(errors).toEqual([])
})
