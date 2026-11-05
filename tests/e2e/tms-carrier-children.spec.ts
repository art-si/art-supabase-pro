import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

test('承运商子表与关联页签可编辑、保存并在窄屏显示', async ({ page }, info) => {
  const writes: Array<Record<string, unknown>> = []
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url())
    const endpoint = url.pathname.split('/').at(-1)
    if (endpoint === 'sys_dictionary') {
      const code = url.searchParams.get('dict_type_table.code')?.replace(/^eq\./, '') || ''
      const valueFilter = url.searchParams.get('value')?.replace(/^eq\./, '')
      const dictionaries: Record<string, Array<[string, string]>> = {
        tmsCarrierType: [['truckload', '整车运输']],
        tmsCarrierDispatchChannel: [['offline', '线下']],
        tmsWaybillStatus: [
          ['pending', '待接单'],
          ['signed', '已签收'],
          ['transporting', '运输中'],
          ['completed', '已完成']
        ],
        vehicleOperationStatus: [['operating', '营运']],
        tmsSettlementStatus: [['draft', '草稿']],
        tmsDriverLicenseType: [['A2', 'A2型准驾']],
        vehicleType: [['box_truck', '厢式货车']],
        commonBoolean: [
          ['true', '启用'],
          ['false', '停用']
        ]
      }
      return route.fulfill({
        json: Object.entries(dictionaries)
          .filter(([dictCode]) => !code || dictCode === code)
          .flatMap(([dictCode, entries]) =>
            entries
              .filter(([value]) => !valueFilter || value === valueFilter)
              .map(([value, label], index) => ({
                id: `${dictCode}-${index}`,
                code: value,
                value,
                label,
                status: '1',
                sort: index + 1,
                dict_type_table: { code: dictCode, name: dictCode }
              }))
          )
      })
    }
    if (endpoint === 'tms_get_carrier_children_secure') {
      return route.fulfill({
        json: {
          contacts: [
            {
              id: 'contact-1',
              name: '原联系人',
              mobile: '13800138000',
              is_default: true,
              department: '调度部'
            }
          ],
          billing_accounts: []
        }
      })
    }
    if (endpoint === 'tms_list_carrier_parent_options_secure')
      return route.fulfill({ json: { records: [], total: 0 } })
    if (endpoint === 'tms_update_carrier_multi_secure') {
      writes.push(route.request().postDataJSON().p_payload as Record<string, unknown>)
      return route.fulfill({ json: {} })
    }
    if (endpoint === 'tms_list_drivers_by_carrier_secure')
      return route.fulfill({
        json: [
          { id: 'driver-1', driver_name: '王师傅', license_type: 'A2', enabled: true },
          { id: 'driver-2', driver_name: '李师傅', license_type: 'legacy_license', enabled: false }
        ]
      })
    if (endpoint === 'vms_list_vehicle_archives_secure')
      return route.fulfill({
        json: {
          records: [
            {
              id: 'vehicle-1',
              plate_no: '冀D12345',
              vehicle_type: 'box_truck',
              operation_status: 'operating'
            },
            {
              id: 'vehicle-2',
              plate_no: '冀D12346',
              vehicle_type: 'legacy_unknown',
              operation_status: 'operating'
            }
          ],
          total: 2
        }
      })
    if (
      endpoint === 'tms_list_carrier_waybill_summaries_secure' ||
      endpoint === 'tms_list_carrier_waybills_secure'
    )
      return route.fulfill({
        json: [
          { id: 'waybill-1', waybill_no: 'YWD-001', status: 'pending' },
          { id: 'waybill-2', waybill_no: 'YWD-002', status: 'signed' },
          { id: 'waybill-3', waybill_no: 'YWD-003', status: 'transporting' },
          { id: 'waybill-4', waybill_no: 'YWD-004', status: 'completed' }
        ]
      })
    if (endpoint === 'tms_list_carrier_prices_secure')
      return route.fulfill({
        json: {
          records: [
            {
              id: 'price-1',
              quote_no: 'CJP-001',
              origin_region: '河北',
              destination_region: '北京'
            }
          ],
          total: 1
        }
      })
    if (endpoint === 'tms_list_carrier_statements_secure')
      return route.fulfill({
        json: {
          records: [{ id: 'statement-1', statement_no: 'DZD-001', status: 'draft' }],
          total: 1
        }
      })
    return route.fulfill({ json: [] })
  })

  await page.setViewportSize({ width: 900, height: 700 })
  await page.goto('/tests/e2e/fixtures/tms-customer-coordinate-write.html?carrierChildren=1', {
    waitUntil: 'domcontentloaded'
  })
  await page.getByRole('button', { name: '打开承运商', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '编辑承运商' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('tab', { name: '联系人信息' }).click()
  await expect(dialog.getByText('原联系人', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: '新增', exact: true }).click()
  const childDialog = page.getByRole('dialog', { name: '新增记录' })
  await expect(childDialog).toBeVisible()
  await childDialog.getByRole('textbox', { name: '姓名' }).fill('新联系人')
  await childDialog.getByRole('textbox', { name: '手机号' }).fill('13900139000')
  await childDialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect(dialog.getByText('新联系人', { exact: true })).toBeVisible()

  await dialog.getByRole('tab', { name: '财务信息' }).click()
  await dialog.getByRole('button', { name: '新增', exact: true }).click()
  const accountDialog = page.getByRole('dialog', { name: '新增记录' })
  await accountDialog.getByRole('textbox', { name: '开票名称' }).fill('测试开票公司')
  await accountDialog.getByRole('textbox', { name: '开户行' }).fill('测试银行')
  await accountDialog.getByRole('textbox', { name: '银行账号' }).fill('6222000000000000')
  await accountDialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect(dialog.getByText('测试开票公司', { exact: true })).toBeVisible()
  await dialog.screenshot({ path: info.outputPath('carrier-finance-narrow.png') })

  for (const [tab, value] of [
    ['司机信息', '王师傅'],
    ['车辆明细', '冀D12345'],
    ['承运单列表', 'YWD-001'],
    ['承运商协议价', 'CJP-001'],
    ['承运商对账', 'DZD-001']
  ]) {
    await dialog.getByRole('tab', { name: tab }).click()
    const panel = dialog.getByRole('tabpanel', { name: tab })
    await expect(panel.getByText(value, { exact: true }).first()).toBeVisible()
    if (tab === '司机信息') {
      await expect(panel.getByText('A2型准驾', { exact: true }).first()).toBeVisible()
      await expect(panel.getByText('启用', { exact: true }).first()).toBeVisible()
      await expect(panel.getByText('李师傅', { exact: true }).first()).toBeVisible()
      await expect(panel.getByText('待核对', { exact: true }).first()).toBeVisible()
      await expect(panel.getByText('停用', { exact: true }).first()).toBeVisible()
      await expect(panel.getByText('legacy_license', { exact: true })).toHaveCount(0)
    }
    if (tab === '车辆明细') {
      await expect(panel.getByText('营运', { exact: true }).first()).toBeVisible()
      await expect(panel.getByText('厢式货车', { exact: true }).first()).toBeVisible()
      await expect(panel.getByText('待核对', { exact: true }).first()).toBeVisible()
      await expect(panel.getByText('box_truck', { exact: true })).toHaveCount(0)
      await expect(panel.getByText('legacy_unknown', { exact: true })).toHaveCount(0)
      await dialog.screenshot({ path: info.outputPath('carrier-vehicle-dictionary-narrow.png') })
    }
    if (tab === '承运单列表') {
      await expect(panel.getByText('待接单', { exact: true }).first()).toBeVisible()
      for (const label of ['已签收', '运输中', '已完成'])
        await expect(panel.getByText(label, { exact: true }).first()).toBeVisible()
      for (const code of ['signed', 'transporting', 'completed'])
        await expect(panel.getByText(code, { exact: true })).toHaveCount(0)
    }
    if (tab === '承运商对账')
      await expect(panel.getByText('草稿', { exact: true }).first()).toBeVisible()
  }
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect.poll(() => writes.length).toBe(1)
  const payload = writes[0]
  expect((payload.contacts as Array<Record<string, unknown>>).map((row) => row.name)).toEqual([
    '原联系人',
    '新联系人'
  ])
  expect((payload.billing_accounts as Array<Record<string, unknown>>)[0]).toMatchObject({
    invoice_title: '测试开票公司',
    is_default: true
  })
})
