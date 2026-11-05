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
    if (endpoint === 'tms_transport_agreement')
      return route.fulfill({
        json: records,
        headers: {
          'content-range': '0-2/3',
          'access-control-expose-headers': 'content-range'
        }
      })
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
    if (endpoint === 'vms_list_vehicle_archive_options_secure')
      return route.fulfill({
        json: [
          {
            id: records[0].vehicleId,
            tenantId,
            carrierId: records[0].carrierId,
            plateNo: records[0].plateNo,
            vehicleType: records[0].vehicleType,
            vehicleLengthM: records[0].vehicleLengthM
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
