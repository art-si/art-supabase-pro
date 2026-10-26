import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(900_000)

const tenantId = '11111111-1111-4111-8111-111111111111'
const vehicleId = '11111111-1111-4111-8111-111111111101'
const qaCertificateImage = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="560" height="320"><rect width="560" height="320" fill="#eef2ff"/><rect x="24" y="24" width="512" height="272" rx="14" fill="#ffffff" stroke="#a5b4fc"/><text x="48" y="100" font-size="28" fill="#3730a3">QA 车辆证件</text><text x="48" y="152" font-size="18" fill="#64748b">仅用于界面验收</text></svg>'
)}`
const vehicles = [
  {
    id: vehicleId,
    tenantId,
    plateNo: '测A·10001',
    companyName: '验收物流一部',
    manufacturer: '测试商用车厂',
    vehicleType: 'heavy_truck',
    operationStatus: 'running',
    auditStatus: 'approved',
    vin: 'TESTVIN0000000001',
    startUseDate: '2025-01-01',
    invoiceDate: '2024-12-01',
    tireCount: 6,
    operationCertNo: 'TEST-CERT-001',
    registrationCertNo: 'TEST-REG-001',
    issueDate: '2025-01-02',
    vehiclePhotoUrl: qaCertificateImage,
    drivingLicenseFrontUrl: qaCertificateImage,
    fieldAccess: { documents: 'read', vehicleIdentifiers: 'read' }
  },
  {
    id: '11111111-1111-4111-8111-111111111102',
    tenantId,
    plateNo: '测A·10002',
    companyName: '验收物流二部',
    manufacturer: '测试商用车厂',
    vehicleType: 'medium_truck',
    operationStatus: 'idle',
    auditStatus: 'pending',
    vin: 'TESTVIN0000000002',
    startUseDate: '2026-02-01',
    invoiceDate: '2026-01-15',
    tireCount: 6,
    fieldAccess: { documents: 'hidden' }
  }
]

test('车辆综合查询两条记录在明暗主题和窄桌面完整呈现', async ({ page }, info) => {
  await page.route('**/rest/v1/**', (route) => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
    if (endpoint === 'vms_list_vehicle_archives_secure') {
      return route.fulfill({ json: { records: vehicles, total: vehicles.length, fieldAccess: {} } })
    }
    if (endpoint === 'vms_get_vehicle_archive_secure') {
      const id = route.request().postDataJSON()?.p_id
      return route.fulfill({ json: vehicles.find((vehicle) => vehicle.id === id) || null })
    }
    if (endpoint === 'vms_get_vehicle_query_summary_records_secure') {
      return route.fulfill({
        json: {
          [vehicleId]: {
            insurance: [
              {
                commercialExpireDate: '2027-01-01',
                compulsoryExpireDate: '2027-02-01',
                createTime: '2026-01-01'
              }
            ],
            inspection: [{ expireDate: '2027-04-01' }],
            maintenance: [{ startTime: '2026-09-01' }],
            mileage: [{ endMileage: 120000, endTime: '2026-09-01' }]
          }
        }
      })
    }
    if (endpoint === 'tms_list_transport_mainline_relations_secure') {
      return route.fulfill({
        json: {
          records: [
            {
              tenantId,
              orderId: '11111111-1111-4111-8111-111111111201',
              orderNo: 'TEST-ORDER-001',
              orderStatus: 'transporting',
              waybillId: '11111111-1111-4111-8111-111111111301',
              waybillNo: 'TEST-WB-001',
              waybillStatus: 'transporting',
              vehicleId,
              plateNo: vehicles[0].plateNo,
              driverId: '11111111-1111-4111-8111-111111111401',
              driverName: '验收司机甲',
              departedAt: '2026-10-01',
              completedAt: null
            }
          ],
          total: 1
        }
      })
    }
    if (endpoint === 'sys_dictionary') {
      const code = new URL(route.request().url()).searchParams
        .get('dict_type_table.code')
        ?.replace(/^eq\./, '')
      const labels: Record<string, Array<[string, string]>> = {
        vehicleAuditStatus: [
          ['approved', '已审核'],
          ['pending', '待审核']
        ],
        vehicleOperationStatus: [
          ['running', '运营中'],
          ['idle', '待命']
        ],
        vehicleType: [
          ['heavy_truck', '重型货车'],
          ['medium_truck', '中型货车']
        ],
        tmsWaybillStatus: [['transporting', '运输中']]
      }
      return route.fulfill({
        json: (labels[code || ''] || []).map(([value, label], index) => ({
          id: `${code}-${index}`,
          code: value,
          label,
          value,
          sort: index,
          status: '1',
          dict_type_table: { code, name: code }
        }))
      })
    }
    return route.fulfill({ json: [] })
  })

  for (const theme of ['light', 'dark'] as const) {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/tests/e2e/fixtures/vehicle-query-visual.html', {
      waitUntil: 'commit',
      timeout: 360_000
    })
    if (theme === 'dark') await page.evaluate(() => document.documentElement.classList.add('dark'))
    await expect(page.locator('.vehicle-query-page')).toBeVisible({ timeout: 360_000 })
    await expect(page.getByText('测A·10001')).toBeVisible()
    await expect(page.getByText('测A·10002')).toBeVisible()
    await expect(page.getByText('待审核')).toBeVisible()
    await page
      .locator('.el-notification')
      .first()
      .waitFor({ state: 'hidden', timeout: 5000 })
      .catch(() => {})
    await page.screenshot({ path: info.outputPath(`vehicle-list-${theme}.png`), fullPage: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

    await page.getByText('测A·10002').click()
    await expect(page.locator('.vehicle-query-detail')).toBeVisible({ timeout: 180_000 })
    await expect(page.getByText('待审核')).toBeVisible()
    await page.getByRole('button', { name: '车辆证件' }).click()
    await expect(page.getByText('暂无证件查看权限')).toBeVisible()
    await page.goto('/tests/e2e/fixtures/vehicle-query-visual.html', {
      waitUntil: 'commit',
      timeout: 360_000
    })
    await expect(page.locator('.vehicle-query-page')).toBeVisible()

    await page
      .locator('.business-table-workspace-actions__toggle')
      .filter({ hasText: '专注模式' })
      .locator('.el-switch')
      .click()
    await expect(page.locator('.vehicle-query-page__overview')).toBeHidden()
    await page.keyboard.press('Escape')
    await expect(page.locator('.vehicle-query-page__overview')).toBeVisible()

    await page.goto('/tests/e2e/fixtures/vehicle-query-visual.html?page=detail', {
      waitUntil: 'commit',
      timeout: 360_000
    })
    if (theme === 'dark') await page.evaluate(() => document.documentElement.classList.add('dark'))
    await expect(page.locator('.vehicle-query-detail')).toBeVisible({ timeout: 360_000 })
    await expect(page.getByText('TEST-ORDER-001')).toBeVisible()
    await expect(page.getByText('验收司机甲')).toBeVisible()
    await page.getByRole('button', { name: '车辆证件' }).click()
    await expect(page.getByText('TEST-CERT-001')).toBeVisible()
    await expect(page.getByAltText('行驶证正页')).toBeVisible()
    await page.screenshot({
      path: info.outputPath(`vehicle-documents-${theme}.png`),
      fullPage: true
    })
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.screenshot({
      path: info.outputPath(`vehicle-documents-${theme}-1280.png`),
      fullPage: true
    })
    await page.screenshot({ path: info.outputPath(`vehicle-detail-${theme}.png`), fullPage: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const lastTab = page.getByRole('button', { name: '绑定设备' })
    await lastTab.focus()
    await lastTab.press('Enter')
    await expect(lastTab).toHaveAttribute('aria-current', 'page')
    await expect(lastTab).toBeInViewport()
    const documentsTab = page.getByRole('button', { name: '车辆证件' })
    await documentsTab.focus()
    await documentsTab.press('Enter')
    await expect(documentsTab).toHaveAttribute('aria-current', 'page')
    await expect(documentsTab).toBeInViewport()
  }
})
