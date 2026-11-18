import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const tenantId = '11111111-1111-4111-8111-111111111111'
const knownNo = 'YSXY-VEHICLE-KNOWN'
const unknownNo = 'YSXY-VEHICLE-UNKNOWN'
const legacyNo = 'YSXY-VEHICLE-LEGACY'
const agreement = (id: string, agreementNo: string, vehicleType: string) => ({
  id,
  tenantId,
  customerId: null,
  agreementNo,
  shipperName: '验收托运方',
  carrierId: '11111111-1111-4111-8111-111111111201',
  carrierName: '验收承运商',
  contactPhone: '13800000001',
  vehicleId: '11111111-1111-4111-8111-111111111301',
  plateNo: '测A·10001',
  vehicleType,
  vehicleLengthM: 6.8,
  startsOn: '2026-11-01',
  endsOn: '2027-10-31',
  status: 'pending_signed',
  approvalStatus: 'draft',
  contentHtml: '<p>验收协议内容</p>',
  attachments: [],
  idCardImages: [],
  registrationImages: [],
  driverLicenseImages: [],
  roadPermitImages: [],
  driverLicenseImage: null,
  roadPermitImage: null,
  partyASeal: '验收托运方',
  partyARepresentative: '代表甲',
  partyASignedOn: '2026-11-01',
  partyBSeal: '验收承运商',
  partyBRepresentative: '代表乙',
  partyBSignedOn: '2026-11-01',
  createBy: '验收员',
  createTime: '2026-11-01T08:00:00+08:00',
  updateTime: '2026-11-01T08:00:00+08:00'
})
const records = [
  agreement('11111111-1111-4111-8111-111111111401', knownNo, 'box_truck'),
  agreement('11111111-1111-4111-8111-111111111402', unknownNo, 'legacy_type'),
  agreement('11111111-1111-4111-8111-111111111403', legacyNo, '厢式货车')
]
const dictionaries = [
  {
    id: 'vehicle-type-box-truck',
    code: 'box_truck',
    value: 'box_truck',
    label: '厢式货车',
    status: '1',
    sort: 1,
    dict_type_table: { code: 'vehicleType', name: '车型' }
  },
  {
    id: 'agreement-status-pending',
    code: 'pending_signed',
    value: 'pending_signed',
    label: '待签署',
    status: '1',
    sort: 1,
    dict_type_table: { code: 'tmsTransportAgreementStatus', name: '协议状态' }
  }
]

test('运输协议换车后清除旧司机和自动带入的乙方代表人', async ({ page }, info) => {
  const current = {
    ...records[0],
    driverId: '11111111-1111-4111-8111-111111111502',
    partyBRepresentative: '原车验收司机'
  }
  const vehicle = {
    id: '11111111-1111-4111-8111-111111111302',
    carrierId: current.carrierId,
    tenantId,
    plateNo: '测A·20002',
    vehicleType: 'box_truck'
  }
  const saves: Record<string, unknown>[] = []
  await page.route('**/rest/v1/**', (route) => {
    const request = route.request()
    const url = new URL(request.url())
    switch (url.pathname.split('/').at(-1)) {
      case 'sys_dictionary':
        return route.fulfill({
          json: dictionaries.filter(
            (row) =>
              row.dict_type_table.code ===
              url.searchParams.get('dict_type_table.code')?.replace(/^eq\./, '')
          )
        })
      case 'tms_transport_agreement':
        if (request.method() === 'PATCH') {
          saves.push(request.postDataJSON())
          return route.fulfill({
            json: current,
            headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
          })
        }
        return route.fulfill({
          json: [current],
          headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
        })
      case 'tms_list_basic_carrier_options_secure':
        return route.fulfill({
          json: [{ id: current.carrierId, tenantId, companyName: current.carrierName }]
        })
      case 'list_vehicle_driver_choices_secure': {
        const records = request.postDataJSON()?.p_source === 'carrier_vehicle' ? [vehicle] : []
        return route.fulfill({ json: { records, total: records.length } })
      }
      case 'get_table_column_runtime':
        return route.fulfill({ json: { enabled: false, profiles: [] } })
      default:
        return route.fulfill({ json: [] })
    }
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/tests/e2e/fixtures/tms-agreement-label.html', { waitUntil: 'commit' })
  await page
    .getByRole('row')
    .filter({ hasText: knownNo })
    .getByRole('button', { name: '编辑', exact: true })
    .click()
  const form = page.getByRole('dialog', { name: `编辑运输协议 · ${knownNo}` })
  const driver = form.locator('[data-art-form-item-key="driverId"] input')
  const vehicleField = form.locator('[data-art-form-item-key="vehicleId"]')
  const vehicleInput = vehicleField.locator('input')
  const save = form.getByRole('button', { name: '确定', exact: true })
  await expect(driver).toHaveValue(current.partyBRepresentative)
  await expect(vehicleInput).toHaveValue(current.plateNo)
  await form.screenshot({ path: info.outputPath('agreement-edit-1440.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(save).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)

  await vehicleField.getByRole('button', { name: '清空', exact: true }).click()
  await expect(vehicleInput).toHaveValue('')
  await expect(driver).toHaveValue('')
  await save.click()
  await expect(form.getByText('请选择车牌号', { exact: true })).toBeVisible()
  expect(saves).toHaveLength(0)
  await vehicleInput.click()
  const picker = page.getByRole('dialog', { name: '选择车辆', exact: true })
  await picker.getByRole('row').filter({ hasText: vehicle.plateNo }).click()
  await picker.getByRole('button', { name: '确定', exact: true }).click()
  await expect(vehicleInput).toHaveValue(vehicle.plateNo)
  await expect(driver).toHaveValue('')
  await form.screenshot({ path: info.outputPath('agreement-edit-cleared-390.png') })
  expect(saves).toHaveLength(0)
  await save.click()
  await expect
    .poll(() => saves.at(-1))
    .toMatchObject({
      vehicle_id: vehicle.id,
      driver_id: null,
      party_b_representative: null
    })
})

test('运输协议车型在列表、详情、表单和导出均显示字典中文', async ({ page }, info) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url())
    const endpoint = url.pathname.split('/').at(-1)
    if (endpoint === 'sys_dictionary') {
      const code = url.searchParams.get('dict_type_table.code')?.replace(/^eq\./, '')
      const value = url.searchParams.get('value')?.replace(/^eq\./, '')
      return route.fulfill({
        json: dictionaries.filter(
          (row) => (!code || row.dict_type_table.code === code) && (!value || row.value === value)
        )
      })
    }
    if (endpoint === 'tms_transport_agreement') {
      const id = url.searchParams.get('id')?.replace(/^eq\./, '')
      const rows = id ? records.filter((record) => record.id === id) : records
      return route.fulfill({
        json: rows,
        headers: {
          'content-range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0',
          'access-control-expose-headers': 'content-range'
        }
      })
    }
    if (endpoint === 'tms_list_basic_carrier_options_secure')
      return route.fulfill({
        json: [
          {
            id: records[0].carrierId,
            tenantId,
            companyName: '验收承运商',
            contactName: '代表乙',
            legalRepresentative: '代表乙'
          }
        ]
      })
    if (endpoint === 'get_table_column_runtime')
      return route.fulfill({ json: { enabled: false, profiles: [] } })
    return route.fulfill({ json: [] })
  })

  await page.goto('/tests/e2e/fixtures/tms-agreement-label.html', {
    waitUntil: 'domcontentloaded'
  })
  const knownRow = page.getByRole('row').filter({ hasText: knownNo })
  const unknownRow = page.getByRole('row').filter({ hasText: unknownNo })
  const legacyRow = page.getByRole('row').filter({ hasText: legacyNo })
  await expect(knownRow).toContainText('厢式货车')
  await expect(unknownRow).toContainText('待核对')
  await expect(legacyRow).toContainText('厢式货车')
  await expect(knownRow).not.toContainText('box_truck')
  await expect(unknownRow).not.toContainText('legacy_type')
  await page.screenshot({ path: info.outputPath('agreement-vehicle-list.png') })

  await knownRow.getByRole('button', { name: knownNo }).click()
  const detail = page.getByRole('dialog', { name: `运输协议 · ${knownNo}` })
  await expect(detail.getByText('厢式货车', { exact: true })).toBeVisible()
  await detail.getByRole('button', { name: '关闭弹窗' }).click()
  await unknownRow.getByRole('button', { name: unknownNo }).click()
  const unknownDetail = page.getByRole('dialog', { name: `运输协议 · ${unknownNo}` })
  await expect(unknownDetail.getByText('待核对', { exact: true }).first()).toBeVisible()
  await unknownDetail.getByRole('button', { name: '关闭弹窗' }).click()
  await legacyRow.getByRole('button', { name: legacyNo }).click()
  const legacyDetail = page.getByRole('dialog', { name: `运输协议 · ${legacyNo}` })
  await expect(legacyDetail.getByText('厢式货车', { exact: true })).toBeVisible()
  await legacyDetail.getByRole('button', { name: '关闭弹窗' }).click()

  await knownRow.getByRole('button', { name: '编辑' }).click()
  const form = page.getByRole('dialog', { name: `编辑运输协议 · ${knownNo}` })
  await expect(form.getByText('厢式货车', { exact: true })).toBeVisible()
  await form.getByRole('button', { name: '取消' }).click()
  await unknownRow.getByRole('button', { name: '编辑' }).click()
  const unknownForm = page.getByRole('dialog', { name: `编辑运输协议 · ${unknownNo}` })
  await expect(unknownForm.getByText('待核对', { exact: true })).toBeVisible()
  await unknownForm.getByRole('button', { name: '取消' }).click()
  await legacyRow.getByRole('button', { name: '编辑' }).click()
  const legacyForm = page.getByRole('dialog', { name: `编辑运输协议 · ${legacyNo}` })
  await expect(legacyForm.getByText('厢式货车', { exact: true })).toBeVisible()
  await legacyForm.getByRole('button', { name: '取消' }).click()

  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出', exact: true }).click()
  const download = await pending
  const path = await download.path()
  if (!path) throw new Error('运输协议导出文件未生成')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(path)
  const sheet = workbook.worksheets[0]
  expect(sheet.rowCount).toBe(4)
  expect(sheet.getCell('F2').value).toBe('厢式货车')
  expect(sheet.getCell('F3').value).toBe('待核对')
  expect(sheet.getCell('F4').value).toBe('厢式货车')
  expect(pageErrors).toEqual([])
})
