import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)
for (const mode of ['cargo', 'station']) {
  test(`${mode} 导入复用公共启停和数值规则`, async ({ page }, info) => {
    const errors: string[] = []
    const writes: Record<string, unknown>[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', async (route) => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      if (path.endsWith('/rpc/import_tms_stations')) {
        writes.push(...request.postDataJSON().p_rows)
        await route.fulfill({ json: { success: true } })
      } else if (path.endsWith('/mdm_cargo') && request.method() === 'POST') {
        writes.push(...request.postDataJSON())
        await route.fulfill({ json: [] })
      } else {
        await route.fulfill({
          json: path.endsWith('/mdm_material')
            ? [
                {
                  id: 'material-test',
                  tenant_id: '11111111-1111-4111-8111-111111111111',
                  material_code: 'MAT-001',
                  material_name: '导入测试物料',
                  basic_unit: '件'
                }
              ]
            : [],
          headers: {
            'content-range': path.endsWith('/mdm_material') ? '0-0/1' : '*/0',
            'access-control-expose-headers': 'content-range'
          }
        })
      }
    })
    await page.goto(`/tests/e2e/fixtures/tms-import-normalization.html?mode=${mode}`)
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('导入')
    sheet.addRow(
      mode === 'cargo' ? ['物料编码', '长(m)', '宽(m)', '状态'] : ['站名称', '类型', '状态']
    )
    for (const state of ['停用', '否', 'false', '启用', '']) {
      sheet.addRow(mode === 'cargo' ? ['MAT-001', '  ', 0, state] : ['测试站点', '发货站', state])
    }
    await page.locator('input[type="file"]').setInputFiles({
      name: '导入.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from(await workbook.xlsx.writeBuffer())
    })
    await expect.poll(() => writes.length).toBe(5)
    expect(writes.map((row) => row.enabled)).toEqual([false, false, false, true, true])
    expect(writes.every((row) => row.tenant_id === '11111111-1111-4111-8111-111111111111')).toBe(
      true
    )
    if (mode === 'cargo') {
      expect(writes.every((row) => row.length_m === null && row.width_m === 0)).toBe(true)
    }
    await expect(page.getByText('导入成功', { exact: true })).toBeVisible()
    await page.screenshot({ path: info.outputPath('import-success.png') })
    expect(errors).toEqual([])
  })
}

test('运输合同 XLSX 导入保留中文表头优先和五项数值边界', async ({ page }, info) => {
  const tenantId = '11111111-1111-4111-8111-111111111111'
  const carrierId = '11111111-1111-4111-8111-111111111113'
  await prepareIsolatedSession(page, { tenantId, platformSuper: false })
  const writes: Array<{ p_rows: Array<Record<string, unknown>> }> = []
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const name = url.pathname.split('/').at(-1)
    if (name === 'sys_dictionary') {
      const code = url.searchParams.get('dict_type_table.code')?.replace(/^eq\./, '')
      const values: Record<string, [string, string]> = {
        tmsContractBusinessType: ['carrier', '承运商合同'],
        tmsContractCategory: ['annual_framework', '年度框架'],
        tmsContractTransportMode: ['road', '公路'],
        tmsContractBillingMethod: ['by_weight', '按重量计费'],
        tmsCargoUnit: ['ton', '吨']
      }
      const item = code ? values[code] : undefined
      return route.fulfill({
        json: item
          ? [
              {
                id: `dict-${code}`,
                code: item[0],
                value: item[0],
                label: item[1],
                status: '1',
                dict_type_table: { code, name: code }
              }
            ]
          : []
      })
    }
    if (name === 'tms_list_contracts_secure')
      return route.fulfill({ json: { records: [], total: 0, fieldAccess: {} } })
    if (name === 'tms_list_carrier_options_secure')
      return route.fulfill({
        json: [
          {
            id: carrierId,
            tenant_id: tenantId,
            company_name: '导入承运商',
            carrier_code: 'CAR-IMPORT'
          }
        ]
      })
    if (name === 'tms_list_customer_options_secure') return route.fulfill({ json: [] })
    if (name === 'tms_import_contracts_secure') {
      writes.push(request.postDataJSON())
      return route.fulfill({ json: { success: true } })
    }
    return route.fallback()
  })
  await page.goto('/tests/e2e/fixtures/tms-contract-customer-tab.html?standalone')
  await expect(page.getByRole('button', { name: '导入', exact: true })).toBeEnabled()

  // 经原生表单加载选项，保留真实导入转换使用的字典值和业务主体映射。
  await page.getByRole('button', { name: '新增', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '新增合同', exact: true })
  await dialog.getByRole('tab', { name: '计费与履约', exact: true }).click()
  const billingMethod = dialog
    .locator('[data-art-form-item-key="billingMethod"]')
    .getByRole('combobox')
  await expect(billingMethod).toBeEnabled()
  await billingMethod.click()
  await expect(page.getByRole('option', { name: '按重量计费', exact: true })).toBeVisible()
  await billingMethod.press('Escape')
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(writes).toEqual([])

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('运输合同')
  sheet.addRow([
    '合同名称',
    'contractName',
    '合同编号',
    '业务合同分类',
    '承运商名称',
    '计费方式',
    '签订时间',
    '经办人',
    '合同金额',
    'contractAmount',
    '运输单价',
    'transportUnitPrice',
    '路耗标准%',
    'roadConsumptionRate',
    '亏扣价',
    'lossDeductionPrice',
    '合同约定运输量',
    'agreedTransportQuantity'
  ])
  for (const [name, code, values] of [
    ['零值与空白合同', 'HT-IMPORT-01', [' 0 ', ' \t ', 'invalid', ' -12.50 ', ' 1e2 ']],
    ['数值与非法合同', 'HT-IMPORT-02', [' 12.50 ', '1e309', ' 1.25 ', 0, 'NaN']]
  ] as const) {
    sheet.addRow([
      ` ${name} `,
      '不应读取英文合同名',
      code,
      '承运商合同',
      ' 导入承运商 ',
      '按重量计费',
      '2026-11-18',
      ' 导入经办人 ',
      ...values.flatMap((value) => [value, 99999])
    ])
  }
  sheet.addRow([
    ' 英文列回退合同 ',
    '不应读取英文合同名',
    'HT-IMPORT-03',
    '承运商合同',
    'CAR-IMPORT',
    'by_weight',
    '2026-11-18',
    '导入经办人',
    null,
    ' 7.25 ',
    null,
    ' 0 ',
    null,
    ' ',
    null,
    'invalid',
    null,
    ' 2e2 '
  ])
  await page.locator('input[type="file"]').setInputFiles({
    name: '运输合同数值边界.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from(await workbook.xlsx.writeBuffer())
  })
  await expect.poll(() => writes.length).toBe(1)
  expect(writes[0].p_rows).toHaveLength(3)
  expect(
    writes[0].p_rows.map((row) => ({
      contract_name: row.contract_name,
      contract_amount: row.contract_amount,
      transport_unit_price: row.transport_unit_price,
      road_consumption_rate: row.road_consumption_rate,
      loss_deduction_price: row.loss_deduction_price,
      agreed_transport_quantity: row.agreed_transport_quantity
    }))
  ).toEqual([
    {
      contract_name: '零值与空白合同',
      contract_amount: 0,
      transport_unit_price: null,
      road_consumption_rate: null,
      loss_deduction_price: -12.5,
      agreed_transport_quantity: 100
    },
    {
      contract_name: '数值与非法合同',
      contract_amount: 12.5,
      transport_unit_price: null,
      road_consumption_rate: 1.25,
      loss_deduction_price: 0,
      agreed_transport_quantity: null
    },
    {
      contract_name: '英文列回退合同',
      contract_amount: 7.25,
      transport_unit_price: 0,
      road_consumption_rate: null,
      loss_deduction_price: null,
      agreed_transport_quantity: 200
    }
  ])
  expect(writes[0].p_rows.map((row) => row.contract_no)).toEqual([
    'HT-IMPORT-01',
    'HT-IMPORT-02',
    'HT-IMPORT-03'
  ])
  for (const row of writes[0].p_rows) {
    expect(row).toMatchObject({
      business_contract_type: 'carrier',
      carrier_id: carrierId,
      customer_id: null,
      billing_method: 'by_weight',
      sign_time: '2026-11-18',
      handler: '导入经办人',
      transport_details: [],
      attachments: []
    })
    expect(row).not.toHaveProperty('tenant_id')
  }
  await expect(page.getByText('导入成功', { exact: true })).toBeVisible()
  expect(writes).toHaveLength(1)
  expect(errors).toEqual([])
  await page.screenshot({ path: info.outputPath('contract-import-normalized.png') })
})

test('站点删除引用提示翻译未知状态且不显示原始 code', async ({ page }) => {
  test.slow()
  const stationId = '11111111-1111-4111-8111-111111111119'
  await page.route('**/rest/v1/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    const json =
      name === 'mdm_station'
        ? [
            {
              id: stationId,
              station_code: 'ZD-DELETE-01',
              station_name: '删除校验测试站',
              station_type: 'shipping',
              enabled: true,
              tenant_id: '11111111-1111-4111-8111-111111111111'
            }
          ]
        : name === 'get_tms_station_delete_dependency_details'
          ? [
              {
                resourceId: stationId,
                dependencyCode: 'station_order',
                recordId: 'order-test',
                targetId: 'order-test',
                recordNo: 'YD-DELETE-01',
                recordSummary: '发货站',
                recordStatus: 'future_status_code',
                recordAmount: null,
                cleanupAllowed: false
              }
            ]
          : []
    return route.fulfill({
      json,
      headers: {
        'content-range': name === 'mdm_station' ? '0-0/1' : '*/0',
        'access-control-expose-headers': 'content-range'
      }
    })
  })
  await page.goto('/tests/e2e/fixtures/tms-import-normalization.html?mode=station')
  const row = page.getByRole('row').filter({ hasText: '删除校验测试站' })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: '更多操作' }).click()
  await page.getByRole('menuitem', { name: '删除' }).click()
  const guard = page.getByRole('dialog').filter({ hasText: '暂时无法删除站点' })
  await expect(guard).toContainText('YD-DELETE-01')
  await expect(guard).toContainText('待核对')
  await expect(guard).not.toContainText('future_status_code')
  await expect(page.getByRole('dialog', { name: '删除确认' })).toHaveCount(0)
})
