import { expect, test, type Page } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(900_000)

const tenantId = '11111111-1111-4111-8111-111111111111'
const vehicleId = '11111111-1111-4111-8111-111111111101'
const carrierId = '11111111-1111-4111-8111-111111111501'
const qaCertificateImage = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="560" height="320"><rect width="560" height="320" fill="#eef2ff"/><rect x="24" y="24" width="512" height="272" rx="14" fill="#ffffff" stroke="#a5b4fc"/><text x="48" y="100" font-size="28" fill="#3730a3">QA 车辆证件</text><text x="48" y="152" font-size="18" fill="#64748b">仅用于界面验收</text></svg>'
)}`
const vehicles = [
  {
    id: vehicleId,
    tenantId,
    plateNo: '测A·10001',
    companyName: '验收物流一部',
    carrierId,
    manufacturer: '测试商用车厂',
    vehicleType: 'heavy_truck',
    vehicleOwnership: 'self_operated',
    primaryDriver: { driverName: '验收司机甲', phone: '13800000001' },
    carrier: { companyName: '验收承运商' },
    plateColor: 'yellow',
    specLengthM: 17.5,
    volumeM3: 130,
    loadTons: 32,
    defaultTrailerPlateNo: '测挂A·001',
    purchaseDate: '2024-12-01',
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
    carrierId: null,
    manufacturer: '测试商用车厂',
    vehicleType: 'medium_truck',
    vehicleOwnership: 'third_party',
    operationStatus: 'idle',
    auditStatus: 'pending',
    vin: 'TESTVIN0000000002',
    startUseDate: '2026-02-01',
    invoiceDate: '2026-01-15',
    tireCount: 6,
    fieldAccess: { documents: 'hidden' }
  }
]

const mockVehicleApis = async (page: Page): Promise<void> => {
  await page.route('**/rest/v1/**', (route) => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
    if (endpoint === 'get_table_column_runtime') {
      return route.fulfill({ json: { enabled: false, profiles: [] } })
    }
    if (endpoint === 'vms_list_vehicle_archives_secure') {
      const selectedCarrierId = route.request().postDataJSON()?.p_carrier_id
      const records = selectedCarrierId
        ? vehicles.filter((vehicle) => vehicle.carrierId === selectedCarrierId)
        : vehicles
      return route.fulfill({ json: { records, total: records.length, fieldAccess: {} } })
    }
    if (endpoint === 'tms_list_carrier_options_secure') {
      return route.fulfill({
        json: [
          {
            id: carrierId,
            tenantId,
            carrierCode: 'QA-CARRIER-001',
            companyName: '验收承运商',
            enabled: true
          }
        ]
      })
    }
    if (endpoint === 'vms_list_vehicle_archive_navigation_secure') {
      return route.fulfill({
        json: vehicles.map(({ id, vehicleOwnership, vehicleType }) => ({
          id,
          vehicleOwnership,
          vehicleType
        }))
      })
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
        vehicleOwnership: [
          ['self_operated', '自营车辆'],
          ['carrier', '承运商'],
          ['third_party', '第三方物流']
        ],
        vehiclePlateColor: [['yellow', '黄牌']],
        tmsWaybillStatus: [['transporting', '运输中']]
      }
      const items = code
        ? (labels[code] || []).map(([value, label]) => ({ code, value, label }))
        : Object.entries(labels).flatMap(([dictCode, entries]) =>
            entries.map(([value, label]) => ({ code: dictCode, value, label }))
          )
      return route.fulfill({
        json: items.map(({ code: dictCode, value, label }, index) => ({
          id: `${code}-${index}`,
          code: value,
          label,
          value,
          sort: index,
          status: '1',
          dict_type_table: { code: dictCode, name: dictCode }
        }))
      })
    }
    return route.fulfill({ json: [] })
  })
}

const expandedListHeaders = [
  '图片',
  '车辆归属',
  '主司机',
  '所属承运商',
  '所属公司',
  '车牌颜色',
  '规格/车长(米)',
  '容积(立方米)',
  '载重(吨)',
  '默认挂车',
  '购置时间',
  '车辆年限'
]

test('普通年检用户可按查看权限打开详情，未授权时不显示入口', async ({ page }, info) => {
  test.setTimeout(180_000)
  await mockVehicleApis(page)
  const record = {
    id: vehicleId,
    vehicleId,
    plateNo: '测A·10001',
    companyName: '验收物流一部',
    inspectionDate: '2026-11-01',
    inspectionNo: 'INSPECTION-READ',
    expireDate: '2027-11-01',
    fieldAccess: { inspectionIdentifiers: 'read', monetaryAmounts: 'hidden' }
  }
  await page.route('**/rest/v1/rpc/vms_list_vehicle_inspections_secure', (route) =>
    route.fulfill({ json: { records: [record], total: 1, fieldAccess: record.fieldAccess } })
  )
  await page.route('**/rest/v1/rpc/vms_get_vehicle_inspection_secure', (route) =>
    route.fulfill({ json: record })
  )
  await page.goto(
    '/tests/e2e/fixtures/vehicle-query-visual.html?page=inspection&inspection-view=denied',
    { waitUntil: 'commit' }
  )
  await expect(page.getByText('INSPECTION-READ', { exact: true })).toBeVisible({ timeout: 90_000 })
  await expect(page.getByRole('button', { name: '更多操作', exact: true })).toHaveCount(0)
  await page.goto('/tests/e2e/fixtures/vehicle-query-visual.html?page=inspection', {
    waitUntil: 'commit'
  })
  await expect(page.getByText('INSPECTION-READ', { exact: true })).toBeVisible({ timeout: 90_000 })
  await page.getByRole('button', { name: '更多操作', exact: true }).hover()
  await expect(page.getByRole('menuitem', { name: '详情', exact: true })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: '删除', exact: true })).toHaveCount(0)
  await page.screenshot({
    path: info.outputPath('ordinary-inspection-read-menu.png'),
    animations: 'disabled'
  })
  await page.getByRole('menuitem', { name: '详情', exact: true }).click()
  const detail = page.locator('.vehicle-inspection-detail')
  await expect(detail).toBeVisible({ timeout: 30_000 })
  await expect(detail.getByText('年检信息', { exact: true })).toBeVisible()
  await expect(detail.getByText('年检金额', { exact: true })).toHaveCount(0)
})

test('车辆归属主体随自营、承运商和第三方物流正确展示', async ({ page }, info) => {
  test.setTimeout(240_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await mockVehicleApis(page)
  let vehicle = { ...vehicles[0] }
  await page.route('**/rest/v1/rpc/vms_get_vehicle_archive_secure', (route) =>
    route.fulfill({ json: vehicle })
  )
  for (const ownership of ['self_operated', 'carrier', 'third_party']) {
    vehicle = { ...vehicles[0], vehicleOwnership: ownership }
    await page.goto('/tests/e2e/fixtures/vehicle-query-visual.html?page=detail', {
      waitUntil: 'commit'
    })
    const summary = page.locator('.vehicle-query-summary')
    await expect(summary).toBeVisible({ timeout: 120_000 })
    const label = ownership === 'self_operated' ? '所属公司' : '所属承运商'
    const name = ownership === 'self_operated' ? '验收物流一部' : '验收承运商'
    await expect(summary.getByText(`${label}：${name}`, { exact: true })).toBeVisible()
    await expect(
      summary.getByText(
        ownership === 'self_operated'
          ? '自营车辆'
          : ownership === 'carrier'
            ? '承运商'
            : '第三方物流',
        { exact: true }
      )
    ).toBeVisible()
    await expect(summary.locator('small')).toHaveAttribute('title', `${label}：${name}`)
    await page.getByRole('button', { name: '车辆档案', exact: true }).click()
    const overview = page.getByRole('tabpanel', { name: '综合概览', exact: true })
    await expect(overview.getByText(label, { exact: true })).toBeVisible()
    await expect(overview.getByText(name, { exact: true })).toBeVisible()
    if (ownership !== 'self_operated')
      await expect(overview.getByText('验收物流一部', { exact: true })).toHaveCount(0)
    if (ownership === 'carrier') {
      await page.setViewportSize({ width: 1280, height: 800 })
      for (const theme of ['light', 'dark']) {
        await page.evaluate(
          (dark) => document.documentElement.classList.toggle('dark', dark),
          theme === 'dark'
        )
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true
        )
        await page.screenshot({
          path: info.outputPath(`vehicle-ownership-${theme}-1280.png`),
          fullPage: true
        })
      }
    }
  }
  vehicle = { ...vehicles[0], vehicleOwnership: 'carrier', carrier: { companyName: '' } }
  await page.reload({ waitUntil: 'commit' })
  await expect(page.locator('.vehicle-query-summary')).toBeVisible({ timeout: 120_000 })
  await expect(page.locator('.vehicle-query-summary')).toContainText('所属承运商：未设置')
  await expect(page.locator('.vehicle-query-summary')).not.toContainText('验收物流一部')
  expect(errors).toEqual([])
})

test('车辆综合查询两条记录在明暗主题和窄桌面完整呈现', async ({ page }, info) => {
  await mockVehicleApis(page)

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
    await expect(page.getByText('待审核')).toBeVisible({ timeout: 120_000 })
    await expect(page.getByText('测挂A·001')).toBeVisible()
    for (const label of expandedListHeaders) {
      await expect(
        page.locator('.vehicle-query-page').getByRole('columnheader', { name: label })
      ).toBeVisible()
    }
    await expect(page.getByText('验收承运商', { exact: true })).toBeVisible()
    await expect(
      page.locator('.vehicle-query-page__navigation').getByText('自营车辆')
    ).toBeVisible()
    await page
      .locator('.vehicle-query-page__workspace .el-splitter-bar__horizontal-collapse-icon-start')
      .click()
    const queryNavigationPanel = page
      .locator('.vehicle-query-page__workspace .el-splitter-panel')
      .first()
    await expect
      .poll(() => queryNavigationPanel.evaluate((panel) => panel.getBoundingClientRect().width))
      .toBeLessThan(8)
    await page
      .locator('.vehicle-query-page__workspace .el-splitter-bar__horizontal-collapse-icon-end')
      .click()
    await expect
      .poll(() => queryNavigationPanel.evaluate((panel) => panel.getBoundingClientRect().width))
      .toBeGreaterThan(200)
    await expect(page.getByText('全部车辆')).toBeVisible()
    await page.getByRole('button', { name: '全部收起车辆分类' }).click()
    await expect(page.getByRole('treeitem', { name: '自营车辆 1 辆车' })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
    await page.getByRole('button', { name: '全部展开车辆分类' }).click()
    await expect(page.getByRole('treeitem', { name: '自营车辆 1 辆车' })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
    await page
      .locator('.el-notification')
      .first()
      .waitFor({ state: 'hidden', timeout: 5000 })
      .catch(() => {})
    await page.locator('.vehicle-query-page .el-skeleton').first().waitFor({ state: 'hidden' })
    await page.screenshot({ path: info.outputPath(`vehicle-list-${theme}.png`), fullPage: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.setViewportSize({ width: 1280, height: 800 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.setViewportSize({ width: 1440, height: 900 })

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
    await expect(page.getByRole('link', { name: '验收司机甲' })).toBeVisible()
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

test('车辆档案管理字段、分类收缩和专注模式保持可用', async ({ page }, info) => {
  await mockVehicleApis(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/tests/e2e/fixtures/vehicle-query-visual.html?page=archive')
  await expect(page).toHaveURL(/page=archive/)
  const workspace = page.locator('.vehicle-archive-manage')
  await expect(workspace).toBeVisible()
  await expect(workspace.getByText('测挂A·001')).toBeVisible()
  await expect(workspace.getByText('黄牌')).toBeVisible()
  for (const label of expandedListHeaders) {
    await expect(workspace.getByRole('columnheader', { name: label })).toBeVisible()
  }
  await expect(workspace.getByText('验收承运商')).toBeVisible()
  await expect(
    workspace.locator('.vehicle-archive-manage__navigation').getByText('自营车辆')
  ).toBeVisible()
  await expect(workspace.getByRole('columnheader', { name: '车辆年限' })).toBeVisible()
  await expect(workspace.getByRole('columnheader', { name: '车架号（VIN）' })).toBeAttached()
  await page
    .locator('.vehicle-archive-manage__workspace .el-splitter-bar__horizontal-collapse-icon-start')
    .click()
  const archiveNavigationPanel = workspace.locator('.el-splitter-panel').first()
  await expect
    .poll(() => archiveNavigationPanel.evaluate((panel) => panel.getBoundingClientRect().width))
    .toBeLessThan(8)
  await page
    .locator('.vehicle-archive-manage__workspace .el-splitter-bar__horizontal-collapse-icon-end')
    .click()
  await expect
    .poll(() => archiveNavigationPanel.evaluate((panel) => panel.getBoundingClientRect().width))
    .toBeGreaterThan(200)
  await expect(workspace.locator('.vehicle-archive-manage__navigation')).toBeVisible()
  await page.screenshot({ path: info.outputPath('vehicle-archive-list-light.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
    .toBeLessThanOrEqual(1)
  await page.screenshot({ path: info.outputPath('vehicle-archive-list-390-light.png') })
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  await page.screenshot({ path: info.outputPath('vehicle-archive-list-390-dark.png') })
  await page.evaluate(() => document.documentElement.classList.remove('dark'))
  await page.setViewportSize({ width: 1280, height: 800 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page
    .locator('.business-table-workspace-actions__toggle')
    .filter({ hasText: '专注模式' })
    .locator('.el-switch')
    .click()
  await expect(workspace.locator('.business-workspace-header')).toBeHidden()
  await page.keyboard.press('Escape')
  await expect(workspace.locator('.business-workspace-header')).toBeVisible()
})

test('车辆列表可选择所属承运商并筛选结果', async ({ page }) => {
  await mockVehicleApis(page)
  for (const route of ['', '?page=archive']) {
    await page.goto(`/tests/e2e/fixtures/vehicle-query-visual.html${route}`)
    const searchBar = page.locator('.art-search-bar')
    await expect(searchBar.getByText('所属承运商', { exact: true })).toBeVisible()
    await searchBar
      .locator('.el-form-item')
      .filter({ hasText: '所属承运商' })
      .locator('.el-select')
      .click()
    await page.getByRole('option', { name: /验收承运商/ }).click()
    await searchBar.getByRole('button', { name: '查询' }).click()
    await expect(page.getByText('测A·10001')).toBeVisible()
    await expect(page.getByText('测A·10002')).toHaveCount(0)
  }
})
