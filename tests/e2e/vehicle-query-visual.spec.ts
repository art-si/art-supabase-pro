import { expect, test, type Locator, type Page, type Request } from '@playwright/test'
import { assertAppearance, prepareAppearance } from './support/appearance'
import { electricEntry, fuelEntry } from './support/energy-card-data'
import { expectPaginationControlsInView } from './support/pagination-layout'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(900_000)

const tenantId = '11111111-1111-4111-8111-111111111111'
const vehicleId = '11111111-1111-4111-8111-111111111101'
const carrierId = '11111111-1111-4111-8111-111111111501'
const headerDisplaySample = {
  driverName: '阿不都热依木·买买提艾力·艾山',
  phone: '13800138000',
  vehicleTypeLabel: '重型半挂牵引车（国六柴油）'
}
const headerAppearances = [
  { width: 1440, height: 900, theme: 'light', boxBorderMode: true },
  { width: 390, height: 844, theme: 'dark', boxBorderMode: false },
  { width: 320, height: 844, theme: 'light', boxBorderMode: true }
] as const
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
const transportRpc = '**/rest/v1/rpc/tms_list_transport_mainline_relations_secure'
const transportRecord = {
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

const mockVehicleApis = async (page: Page, vehicleTypeLabel = '重型货车'): Promise<void> => {
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
      return route.fulfill({ json: { records: [transportRecord], total: 1 } })
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
          ['heavy_truck', vehicleTypeLabel],
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

async function setVehicleAppearance(
  page: Page,
  appearance: Parameters<typeof prepareAppearance>[1]
): Promise<void> {
  await page.emulateMedia({ colorScheme: appearance.theme })
  await page.evaluate(async (appearance) => {
    const { useTheme }: typeof import('../../src/hooks/core/useTheme') = await import(
      new URL('/src/hooks/core/useTheme.ts', location.origin).href
    )
    const { SystemThemeEnum }: typeof import('../../src/enums/app-enum') = await import(
      new URL('/src/enums/app-enum.ts', location.origin).href
    )
    const { useSettingStore }: typeof import('../../src/store/modules/setting') = await import(
      new URL('/src/store/modules/setting.ts', location.origin).href
    )
    useTheme().switchThemeStyles(
      appearance.theme === 'dark' ? SystemThemeEnum.DARK : SystemThemeEnum.LIGHT
    )
    useSettingStore().boxBorderMode = appearance.boxBorderMode
    document.documentElement.dataset.boxMode = appearance.boxBorderMode
      ? 'border-mode'
      : 'shadow-mode'
    await document.fonts.ready
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    )
  }, appearance)
  await assertAppearance(page, appearance)
}

async function expectHeaderDefinitions(root: Locator): Promise<void> {
  const metrics = await root.evaluate((element) => {
    return [...element.querySelectorAll('dl > div')].map((item) => {
      const label = item.querySelector('dt')!
      const value = item.querySelector('dd')!
      const bounds = item.getBoundingClientRect()
      const outer = item.closest('dl')!.getBoundingClientRect()
      const valueBounds = value.getBoundingClientRect()
      const labelRange = document.createRange()
      labelRange.selectNodeContents(label)
      const lines = [...labelRange.getClientRects()].filter((rect) => rect.width && rect.height)
      const values: { left: number; right: number; top: number; bottom: number }[] = []
      const walker = document.createTreeWalker(value, NodeFilter.SHOW_TEXT)
      while (walker.nextNode()) {
        if (!walker.currentNode.textContent?.trim()) continue
        const range = document.createRange()
        range.selectNodeContents(walker.currentNode)
        values.push(
          ...[...range.getClientRects()].map(({ left, right, top, bottom }) => ({
            left,
            right,
            top,
            bottom
          }))
        )
      }
      return {
        label: label.textContent?.trim(),
        value: value.textContent?.trim(),
        lineCount: lines.length,
        itemInside: bounds.left >= outer.left - 1 && bounds.right <= outer.right + 1,
        valueInside: valueBounds.left >= bounds.left - 1 && valueBounds.right <= bounds.right + 1,
        textInside: values.every(
          (rect) =>
            rect.left >= valueBounds.left - 1 &&
            rect.right <= valueBounds.right + 1 &&
            rect.top >= valueBounds.top - 1 &&
            rect.bottom <= valueBounds.bottom + 1
        )
      }
    })
  })
  await test.info().attach(`header-definition-geometry-${root.page().viewportSize()?.width}`, {
    body: JSON.stringify(metrics, null, 2),
    contentType: 'application/json'
  })
  expect(metrics).toHaveLength(7)
  for (const metric of metrics) {
    expect.soft(metric.lineCount, `${metric.label} 标签单行`).toBe(1)
    expect.soft(metric.itemInside, `${metric.label} 条目在摘要内`).toBe(true)
    expect.soft(metric.valueInside, `${metric.label} 值容器在条目内`).toBe(true)
    expect.soft(metric.textInside, `${metric.label} 值文本完整显示`).toBe(true)
  }
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
  const inspectionRow = page.getByRole('row').filter({
    has: page.getByRole('cell', { name: 'INSPECTION-READ', exact: true })
  })
  const moreActions = inspectionRow.getByRole('button', { name: '更多操作', exact: true })
  await expect(inspectionRow).toBeInViewport({ timeout: 90_000 })
  await expect(moreActions).toHaveCount(0)
  await page.goto('/tests/e2e/fixtures/vehicle-query-visual.html?page=inspection', {
    waitUntil: 'commit'
  })
  await expect(inspectionRow).toBeInViewport({ timeout: 90_000 })
  await moreActions.hover()
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
  await prepareAppearance(page, headerAppearances[0])
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockVehicleApis(page, headerDisplaySample.vehicleTypeLabel)
  const headerVehicle = {
    ...vehicles[0],
    primaryDriver: { driverName: headerDisplaySample.driverName, phone: headerDisplaySample.phone }
  }
  let vehicle = { ...headerVehicle }
  let hideDriverPhone = false
  await page.route('**/rest/v1/rpc/vms_get_vehicle_archive_secure', (route) =>
    route.fulfill({
      json: {
        ...vehicle,
        primaryDriver: {
          ...vehicle.primaryDriver,
          fieldAccess: { contactPhone: hideDriverPhone ? 'hidden' : 'read' }
        }
      }
    })
  )
  for (const ownership of ['self_operated', 'carrier', 'third_party']) {
    vehicle = { ...headerVehicle, vehicleOwnership: ownership }
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
    if (ownership === 'self_operated') {
      for (const appearance of headerAppearances) {
        await page.setViewportSize({ width: appearance.width, height: appearance.height })
        await setVehicleAppearance(page, appearance)
        await expect(
          summary
            .locator('dt')
            .filter({ hasText: '主司机/电话' })
            .locator('xpath=following-sibling::dd[1]')
        ).toHaveText(`${headerDisplaySample.driverName} / ${headerDisplaySample.phone}`)
        await expect(
          summary.getByText(headerDisplaySample.vehicleTypeLabel, { exact: true })
        ).toBeVisible()
        await page.screenshot({
          path: info.outputPath(
            `vehicle-summary-labels-${appearance.width}-${appearance.theme}.png`
          ),
          fullPage: true
        })
        await expectHeaderDefinitions(summary)
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
        ).toBeLessThanOrEqual(1)
      }
      await page.setViewportSize({ width: 1440, height: 900 })
      await setVehicleAppearance(page, headerAppearances[0])
    }
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
  vehicle = { ...headerVehicle, vehicleOwnership: 'carrier', carrier: { companyName: '' } }
  hideDriverPhone = true
  await page.reload({ waitUntil: 'commit' })
  await expect(page.locator('.vehicle-query-summary')).toBeVisible({ timeout: 120_000 })
  await expect(page.locator('.vehicle-query-summary')).toContainText('所属承运商：未设置')
  await expect(page.locator('.vehicle-query-summary')).not.toContainText('验收物流一部')
  await expect(
    page
      .locator('.vehicle-query-summary dt')
      .filter({ hasText: '主司机/电话' })
      .locator('xpath=following-sibling::dd[1]')
  ).toHaveText(headerDisplaySample.driverName)
  await expect(page.locator('.vehicle-query-summary')).not.toContainText(headerDisplaySample.phone)
  expect(errors).toEqual([])
})

test('车辆综合查询在窄屏可区分同名承运商并重置筛选', async ({ page }, info) => {
  const companyName = '验收国际多式联运区域运营中心华东干线重载运输服务有限公司临港分部'
  const codes = ['VMS-QA-001', 'VMS-QA-006']
  const selectedCarrierId = '11111111-1111-4111-8111-111111111506'
  const requests: unknown[] = []
  await page.setViewportSize({ width: 390, height: 844 })
  await mockVehicleApis(page)
  await page.route('**/rest/v1/rpc/tms_list_carrier_options_secure', (route) =>
    route.fulfill({
      json: [
        { id: carrierId, carrierCode: codes[0], companyName },
        { id: selectedCarrierId, carrierCode: codes[1], companyName },
        {
          id: '11111111-1111-4111-8111-111111111507',
          carrierCode: '  ',
          companyName: '暂无编号承运商'
        }
      ].map((carrier) => ({ ...carrier, tenantId, enabled: true }))
    })
  )
  await page.route('**/rest/v1/rpc/vms_list_vehicle_archives_secure', (route) => {
    requests.push(route.request().postDataJSON()?.p_carrier_id)
    return route.fallback()
  })
  await page.goto('/tests/e2e/fixtures/vehicle-query-visual.html', { waitUntil: 'commit' })
  const search = page.locator('.vehicle-query-page .art-search-bar')
  const field = search.locator('[data-art-form-item-key="carrierId"]')
  const combo = field.getByRole('combobox')
  const reset = search.getByRole('button', { name: '重置', exact: true })
  const query = search.getByRole('button', { name: '查询', exact: true })
  await expect(combo).toBeVisible({ timeout: 60_000 })
  await combo.press('ArrowDown')
  const options = page.getByRole('option').filter({ hasText: companyName })
  await expect(options).toHaveCount(2)
  await expect(page.getByRole('option', { name: '暂无编号承运商', exact: true })).toBeVisible()
  const visibleCodes = await options.evaluateAll(
    (items, codes) =>
      items.map((item, index) => {
        const label = item.querySelector('span')?.firstChild
        if (!(label instanceof Text)) return false
        const offset = label.data.indexOf(codes[index])
        if (offset < 0) return false
        const range = new Range()
        range.setStart(label, offset)
        range.setEnd(label, offset + codes[index].length)
        const optionRight =
          item.getBoundingClientRect().right -
          Number.parseFloat(getComputedStyle(item).paddingRight)
        return range.getBoundingClientRect().right <= Math.min(optionRight, innerWidth)
      }),
    codes
  )
  expect(visibleCodes).toEqual([true, true])
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.screenshot({ path: info.outputPath('carrier-options-390.png') })

  await combo.fill(codes[1])
  await expect(options).toHaveCount(1)
  await combo.press('ArrowDown')
  await combo.press('Enter')
  await expect(combo).toHaveAttribute('aria-expanded', 'false')
  await expect(field.locator('.el-select__placeholder:not(.is-transparent) span')).toHaveAttribute(
    'title',
    `${codes[1]} · ${companyName}`
  )
  await query.press('Enter')
  await expect.poll(() => requests.at(-1)).toBe(selectedCarrierId)
  await field.hover()
  await field.locator('.el-select__clear').click()
  await expect(combo).toBeFocused()
  await expect(field.getByText('请选择承运商')).toBeVisible()
  await query.press('Enter')
  await expect.poll(() => requests.at(-1)).toBeNull()

  await combo.press('ArrowDown')
  await options.last().click()
  await query.press('Enter')
  await expect.poll(() => requests.at(-1)).toBe(selectedCarrierId)
  await reset.press('Enter')
  await expect.poll(() => requests.at(-1)).toBeNull()
  await expect(reset).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(query).toBeFocused()
})

async function mockVehicleClassification(page: Page) {
  const sameOwner = {
    ...vehicles[1],
    id: '11111111-1111-4111-8111-111111111103',
    plateNo: '测A·10003',
    vehicleOwnership: vehicles[0].vehicleOwnership
  }
  const archives = [...vehicles, sameOwner]
  const reads: Array<string[] | null> = []
  await mockVehicleApis(page)
  await page.route('**/rest/v1/rpc/vms_list_vehicle_archive_navigation_secure', (route) =>
    route.fulfill({
      json: archives.map(({ id, vehicleOwnership, vehicleType }) => ({
        id,
        vehicleOwnership,
        vehicleType
      }))
    })
  )
  await page.route('**/rest/v1/rpc/vms_list_vehicle_archives_secure', (route) => {
    const { p_ids: ids } = route.request().postDataJSON() as { p_ids: string[] | null }
    reads.push(ids)
    const rows = ids ? archives.filter((vehicle) => ids.includes(vehicle.id)) : archives
    return route.fulfill({ json: { records: rows, total: rows.length, fieldAccess: {} } })
  })
  return { reads, sameOwner }
}

test('车辆综合查询方向键浏览分类，确认才提交归属和车型', async ({ page }) => {
  const { reads, sameOwner } = await mockVehicleClassification(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/tests/e2e/fixtures/vehicle-query-visual.html', { waitUntil: 'commit' })
  const query = page.locator('.vehicle-query-page')
  const navigation = query.locator('.vehicle-query-page__navigation')
  const selfOperated = navigation.getByRole('treeitem', { name: /^自营车辆/ })
  const heavyTruck = navigation.getByRole('treeitem', { name: /^重型货车/ })
  const otherVehicle = query.getByText(vehicles[1].plateNo, { exact: true })
  const otherType = query.getByText(sameOwner.plateNo, { exact: true })
  await expect(otherVehicle).toBeVisible({ timeout: 60_000 })
  await expect(selfOperated).toHaveAttribute('aria-expanded', 'true')
  const beforeBrowsing = reads.length
  await selfOperated.press('ArrowRight')
  await expect(heavyTruck).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(selfOperated).toBeFocused()
  expect(reads).toHaveLength(beforeBrowsing)
  await page.keyboard.press('Enter')
  await expect.poll(() => reads.at(-1)).toEqual([vehicles[0].id, sameOwner.id])
  await expect(otherVehicle).toHaveCount(0)
  await expect(otherType).toBeVisible()

  await selfOperated.press('ArrowRight')
  await expect(heavyTruck).toBeFocused()
  await page.keyboard.press('Space')
  await expect.poll(() => reads.at(-1)).toEqual([vehicles[0].id])
  await expect(otherType).toHaveCount(0)
  await expect(heavyTruck).toBeFocused()
  await navigation.getByRole('button', { name: /全部车辆/ }).click()
  await expect(otherVehicle).toBeVisible()
  expect(reads.at(-1)).toBeNull()
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

test('车辆详情运输订单分页在可视区域内且页间序号连续', async ({ page }, info) => {
  await mockVehicleApis(page)
  const ranges: Array<[number, number]> = []
  const total = 160
  await page.route(transportRpc, (route) => {
    const { p_vehicle_id, p_from, p_to } = route.request().postDataJSON() as {
      p_vehicle_id: string
      p_from: number
      p_to: number
    }
    expect(p_vehicle_id).toBe(vehicleId)
    ranges.push([p_from, p_to])
    const records = Array.from({ length: Math.min(total, p_to + 1) - p_from }, (_, index) => {
      const sequence = String(p_from + index + 1).padStart(3, '0')
      return {
        ...transportRecord,
        orderId: `11111111-1111-4111-8111-111111111${sequence}`,
        orderNo: `TEST-ORDER-${sequence}`,
        waybillNo: `TEST-WB-${sequence}`
      }
    })
    return route.fulfill({ json: { records, total } })
  })

  await page.goto('/tests/e2e/fixtures/vehicle-query-visual.html?page=detail')
  await expect(
    page.locator('.vehicle-query-detail__current').getByText('TEST-ORDER-001')
  ).toBeVisible()
  await page
    .getByRole('navigation', { name: '车辆详情分类' })
    .getByRole('button', { name: '运输订单', exact: true })
    .click()
  const pane = page.locator('.vehicle-query-detail__content')
  const pager = pane.locator('.el-pagination')
  await expectPaginationControlsInView(pager)
  await pager.locator('button.btn-next').click()
  const firstRow = pane.getByRole('row').filter({ hasText: 'TEST-ORDER-021' })
  await expect(firstRow.getByRole('cell', { name: '21', exact: true })).toBeVisible()
  expect(ranges).toEqual([
    [0, 49],
    [0, 19],
    [20, 39]
  ])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
  await pane.screenshot({
    path: info.outputPath('transport-pagination.png'),
    animations: 'disabled'
  })
})

const makeEnergyLedgerRecord = (
  entry: typeof fuelEntry | typeof electricEntry,
  number: number
) => ({
  ...entry,
  id: `energy-entry-${number}`,
  vehicleId,
  plateNo: vehicles[0].plateNo,
  referenceNo: `ENERGY-${number}`
})

const energyPaginationCases = [
  {
    tab: '油耗与加油',
    rpc: 'vms_list_vehicle_fuel_execution_secure',
    isNewEnergy: false,
    showRowNumber: true,
    record: (number: number) => ({
      waybillId: `fuel-waybill-${number}`,
      waybillNo: `ENERGY-${number}`,
      status: 'completed',
      refueledLiters: 40,
      consumedFuelLiters: 60,
      totalMileageKm: 350,
      fuelPer100km: 17.14
    })
  },
  {
    tab: '油卡流水',
    rpc: 'vms_list_fuel_card_entries_secure',
    isNewEnergy: false,
    showRowNumber: false,
    record: (number: number) => makeEnergyLedgerRecord(fuelEntry, number)
  },
  {
    tab: '电卡流水',
    rpc: 'vms_list_electric_card_entries_secure_v2',
    isNewEnergy: true,
    showRowNumber: false,
    record: (number: number) => makeEnergyLedgerRecord(electricEntry, number)
  }
]

for (const { tab, rpc, isNewEnergy, showRowNumber, record } of energyPaginationCases) {
  test(`车辆详情${tab}分页完整显示且按翻页请求记录`, async ({ page }, info) => {
    await mockVehicleApis(page)
    await page.route('**/rest/v1/rpc/vms_get_vehicle_archive_secure', (route) =>
      route.fulfill({ json: { ...vehicles[0], isNewEnergy } })
    )
    const ranges: Array<[number, number]> = []
    const total = 160
    await page.route(`**/rest/v1/rpc/${rpc}`, (route) => {
      const { p_vehicle_id, p_from, p_to } = route.request().postDataJSON() as {
        p_vehicle_id: string
        p_from: number
        p_to: number
      }
      expect(p_vehicle_id).toBe(vehicleId)
      ranges.push([p_from, p_to])
      const records = Array.from({ length: Math.min(total, p_to + 1) - p_from }, (_, index) =>
        record(p_from + index + 1)
      )
      return route.fulfill({ json: { records, total } })
    })

    await page.goto('/tests/e2e/fixtures/vehicle-query-visual.html?page=detail')
    await page
      .getByRole('navigation', { name: '车辆详情分类' })
      .getByRole('button', { name: tab, exact: true })
      .click()
    const pane = page.locator('.vehicle-query-detail__content')
    const pager = pane.locator('.el-pagination')
    await expect(pane.getByText('ENERGY-1', { exact: true })).toBeVisible()
    await expectPaginationControlsInView(pager)
    await pager.locator('button.btn-next').click()
    const firstRecord = pane.getByText('ENERGY-21', { exact: true })
    await expect(firstRecord).toBeVisible()
    if (showRowNumber) {
      await expect(
        pane
          .getByRole('row')
          .filter({ has: page.getByText('ENERGY-21', { exact: true }) })
          .getByRole('cell', { name: '21', exact: true })
      ).toBeVisible()
    }
    expect(ranges).toEqual([
      [0, 19],
      [20, 39]
    ])
    await expectPaginationControlsInView(pager)
    await pager.screenshot({
      path: info.outputPath('energy-pagination.png'),
      animations: 'disabled'
    })
  })
}

test('车辆详情当前承运重试得到空页时仍显示反馈并可手动收起', async ({ page }, info) => {
  await mockVehicleApis(page)
  let attempts = 0
  await page.route(transportRpc, (route) => {
    attempts += 1
    return attempts === 1
      ? route.fulfill({ status: 503, json: { message: 'Temporary fixture error' } })
      : route.fulfill({ json: { records: [], total: 0 } })
  })
  await page.goto('/tests/e2e/fixtures/vehicle-query-visual.html?page=detail')
  const current = page.locator('.vehicle-query-detail__current')
  const empty = current.getByText('当前暂无在运订单', { exact: true })
  const toggle = current.getByRole('button', { name: /^(展开|收起)$/ })
  await expect(current.getByText('当前承运信息加载失败', { exact: true })).toBeVisible()
  await current.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(empty).toBeVisible()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await current.screenshot({
    path: info.outputPath('execution-retry-empty.png'),
    animations: 'disabled'
  })
  await toggle.click()
  await expect(empty).toBeHidden()
  await toggle.click()
  await expect(empty).toBeVisible()
  expect(attempts).toBe(2)

  const initialEmpty = page.waitForResponse((response) =>
    response.url().endsWith('/tms_list_transport_mainline_relations_secure')
  )
  await page.reload()
  await initialEmpty
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  expect(attempts).toBe(3)
})

test('车辆详情切换车辆后忽略此前尚未完成的承运响应', async ({ page }) => {
  await mockVehicleApis(page)
  const otherVehicle = vehicles[1]
  let resolveFirstVehicle = () => {}
  const firstVehiclePending = new Promise<void>((resolve) => {
    resolveFirstVehicle = resolve
  })
  await page.route(transportRpc, async (route) => {
    const requestedId = route.request().postDataJSON()?.p_vehicle_id
    if (requestedId === vehicleId) await firstVehiclePending
    return route.fulfill({
      json: {
        records: [
          requestedId === vehicleId
            ? transportRecord
            : { ...transportRecord, vehicleId: otherVehicle.id, orderNo: 'TEST-OTHER-ORDER' }
        ],
        total: 1
      }
    })
  })
  const isFirstVehicleRequest = (request: Request) =>
    request.url().endsWith('/tms_list_transport_mainline_relations_secure') &&
    request.postDataJSON()?.p_vehicle_id === vehicleId

  try {
    const firstVehicleStarted = page.waitForRequest(isFirstVehicleRequest)
    await page.goto('/tests/e2e/fixtures/vehicle-query-visual.html?page=detail&switch-vehicle')
    await firstVehicleStarted
    await page.getByRole('link', { name: '查看另一辆测试车辆' }).click()
    const current = page.locator('.vehicle-query-detail__current')
    await expect(current.getByText('TEST-OTHER-ORDER', { exact: true })).toBeVisible()

    const lateResponse = page.waitForResponse((response) =>
      isFirstVehicleRequest(response.request())
    )
    resolveFirstVehicle()
    await (await lateResponse).finished()
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    )
    await expect(current.getByText('TEST-OTHER-ORDER', { exact: true })).toBeVisible()
    await expect(current.getByText(transportRecord.orderNo, { exact: true })).toHaveCount(0)
  } finally {
    resolveFirstVehicle()
  }
})

test('车辆档案窄屏分类回焦并保留关联挂车的只读权限', async ({ page }, info) => {
  const { reads, sameOwner } = await mockVehicleClassification(page)
  const trailerReads: string[] = []
  const trailerPlate = '测挂A·001'
  await page.route('**/rest/v1/rpc/vms_list_vehicle_trailers_secure', (route) => {
    trailerReads.push(route.request().postDataJSON().p_vehicle_id)
    return route.fulfill({
      json: [
        {
          id: '11111111-1111-4111-8111-111111111701',
          tenantId,
          plateNo: trailerPlate,
          trailerType: '半挂车',
          ownership: 'self_operated',
          status: 'active'
        }
      ]
    })
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/tests/e2e/fixtures/vehicle-query-visual.html?page=archive&archive-readonly', {
    waitUntil: 'commit'
  })
  const archives = page.locator('.vehicle-archive-manage')
  const navigation = archives.locator('.vehicle-archive-manage__navigation')
  const toggle = navigation.getByRole('button', { name: '展开或收起车辆分类', exact: true })
  const selfOperated = navigation.getByRole('treeitem', { name: /^自营车辆/ })
  const heavyTruck = navigation.getByRole('treeitem', { name: /^重型货车/ })
  const otherOwner = archives.getByText(vehicles[1].plateNo, { exact: true })
  const otherType = archives.getByText(sameOwner.plateNo, { exact: true })
  await expect(otherOwner).toBeVisible({ timeout: 60_000 })
  const panelHeight = () => navigation.evaluate((element) => element.getBoundingClientRect().height)
  await expect.poll(panelHeight).toBeLessThan(112)
  await expect(navigation.getByRole('button', { name: /全部(展开|收起)车辆分类/ })).toHaveCount(0)
  await navigation.screenshot({ path: info.outputPath('archive-classification-collapsed.png') })
  await toggle.press('Enter')
  await expect(selfOperated).toBeVisible({ timeout: 60_000 })
  await expect.poll(panelHeight).toBeGreaterThan(300)
  const beforeBrowsing = reads.length
  await selfOperated.press('ArrowRight')
  await expect(heavyTruck).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(selfOperated).toBeFocused()
  expect(reads).toHaveLength(beforeBrowsing)
  await page.keyboard.press('Enter')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(toggle).toBeFocused()
  await expect.poll(panelHeight).toBeLessThan(112)
  await expect.poll(() => reads.at(-1)).toEqual([vehicles[0].id, sameOwner.id])
  await expect(otherOwner).toHaveCount(0)
  await expect(otherType).toBeVisible()

  await toggle.press('Enter')
  await navigation.getByRole('button', { name: /全部车辆/ }).press('Space')
  await expect(toggle).toBeFocused()
  await expect(otherOwner).toBeVisible()
  expect(reads.at(-1)).toBeNull()

  await toggle.press('Enter')
  await selfOperated.press('ArrowRight')
  await expect(heavyTruck).toBeFocused()
  await page.keyboard.press('Space')
  await expect(toggle).toBeFocused()
  await expect.poll(() => reads.at(-1)).toEqual([vehicles[0].id])
  await expect(otherType).toHaveCount(0)
  const row = archives.getByRole('row').filter({ hasText: vehicles[0].plateNo })
  await expect(row.getByRole('cell', { name: trailerPlate, exact: true })).toBeAttached()
  await expect(row.getByRole('button', { name: '编辑', exact: true })).toHaveCount(0)
  await row.getByRole('button', { name: '更多操作', exact: true }).press('Enter')
  await expect(page.getByRole('menuitem', { name: '删除', exact: true })).toHaveCount(0)
  await page.getByRole('menuitem', { name: '查看', exact: true }).press('Enter')

  const trailers = page.getByRole('tab', { name: '挂车管理', exact: true })
  await expect(trailers).toBeVisible({ timeout: 60_000 })
  await trailers.click()
  const panel = page.getByRole('region', { name: '关联挂车', exact: true })
  await expect(panel.getByRole('cell', { name: trailerPlate, exact: true })).toBeVisible()
  await expect(panel.getByRole('button', { name: '添加挂车', exact: true })).toHaveCount(0)
  await expect(panel.getByRole('columnheader', { name: '操作', exact: true })).toHaveCount(0)
  expect(trailerReads).toEqual([vehicles[0].id])
  await page.screenshot({ path: info.outputPath('archive-classification-trailer-readonly.png') })
})

test('车辆档案管理字段、分类收缩和专注模式保持可用', async ({ page }, info) => {
  await prepareAppearance(page, headerAppearances[0])
  await mockVehicleApis(page, headerDisplaySample.vehicleTypeLabel)
  let hideDriverPhone = false
  await page.route('**/rest/v1/rpc/vms_get_vehicle_archive_secure', (route) =>
    route.fulfill({
      json: {
        ...vehicles[0],
        primaryDriver: {
          driverName: headerDisplaySample.driverName,
          phone: headerDisplaySample.phone,
          fieldAccess: { contactPhone: hideDriverPhone ? 'hidden' : 'read' }
        }
      }
    })
  )
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/tests/e2e/fixtures/vehicle-query-visual.html?page=archive')
  await expect(page).toHaveURL(/page=archive/)
  const workspace = page.locator('.vehicle-archive-manage')
  await expect(workspace).toBeVisible()
  await expect(workspace.getByText('测挂A·001')).toBeVisible()
  await expect(
    workspace
      .getByRole('row')
      .filter({ hasText: vehicles[0].plateNo })
      .getByRole('button', { name: '编辑', exact: true })
  ).toBeVisible()
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
  const row = workspace.getByRole('row').filter({ hasText: vehicles[0].plateNo })
  await row.getByRole('button', { name: '更多操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '查看', exact: true }).click()
  const detail = page.locator('.vehicle-archive-detail')
  const identity = detail.locator('.vehicle-archive-detail__identity-copy')
  await expect(detail).toBeVisible()
  await expect(identity.locator('h1')).toHaveText(vehicles[0].plateNo)
  await expect(identity.locator('input, textarea, select, [contenteditable="true"]')).toHaveCount(0)
  for (const appearance of headerAppearances) {
    await page.setViewportSize({ width: appearance.width, height: appearance.height })
    await setVehicleAppearance(page, appearance)
    await expect(
      identity
        .locator('dt')
        .filter({ hasText: '主司机/电话' })
        .locator('xpath=following-sibling::dd[1]')
    ).toHaveText(`${headerDisplaySample.driverName} / ${headerDisplaySample.phone}`)
    await expect(
      identity.getByText(headerDisplaySample.vehicleTypeLabel, { exact: true })
    ).toBeVisible()
    await page.screenshot({
      path: info.outputPath(`archive-summary-labels-${appearance.width}-${appearance.theme}.png`),
      fullPage: true
    })
    const readability = await identity.evaluate((element, phone) => {
      const title = element.querySelector('h1')!
      const titleBounds = title.getBoundingClientRect()
      const titleRange = document.createRange()
      titleRange.selectNodeContents(title)
      const titleRects = [...titleRange.getClientRects()].filter(
        (rect) => rect.width && rect.height
      )
      const driverValue = [...element.querySelectorAll('dl > div')]
        .find((item) => item.querySelector('dt')?.textContent === '主司机/电话')!
        .querySelector('dd')!
      const phoneBounds = driverValue.getBoundingClientRect()
      const phoneRange = document.createRange()
      const walker = document.createTreeWalker(driverValue, NodeFilter.SHOW_TEXT)
      while (walker.nextNode()) {
        const index = walker.currentNode.textContent?.indexOf(phone) ?? -1
        if (index < 0) continue
        phoneRange.setStart(walker.currentNode, index)
        phoneRange.setEnd(walker.currentNode, index + phone.length)
        break
      }
      const phoneRects = [...phoneRange.getClientRects()].filter(
        (rect) => rect.width && rect.height
      )
      return {
        title: titleRange.toString(),
        titleInside:
          titleRects.length > 0 &&
          titleRects.every(
            (rect) =>
              rect.left >= titleBounds.left - 1 &&
              rect.right <= titleBounds.right + 1 &&
              rect.top >= titleBounds.top - 1 &&
              rect.bottom <= titleBounds.bottom + 1
          ),
        phone: phoneRange.toString(),
        phoneLineCount: phoneRects.length,
        phoneInside:
          phoneRects.length > 0 &&
          phoneRects.every(
            (rect) =>
              rect.left >= phoneBounds.left - 1 &&
              rect.right <= phoneBounds.right + 1 &&
              rect.top >= phoneBounds.top - 1 &&
              rect.bottom <= phoneBounds.bottom + 1
          )
      }
    }, headerDisplaySample.phone)
    await info.attach(`archive-header-readability-${appearance.width}`, {
      body: JSON.stringify(readability, null, 2),
      contentType: 'application/json'
    })
    expect.soft(readability.titleInside, '车牌文字在标题内完整显示').toBe(true)
    expect.soft(readability.phone).toBe(headerDisplaySample.phone)
    expect.soft(readability.phoneLineCount, '11 位电话号码保持单行可读').toBe(1)
    expect.soft(readability.phoneInside, '电话号码完整显示在值容器内').toBe(true)
    await expectHeaderDefinitions(identity)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
  }
  hideDriverPhone = true
  await page.setViewportSize({ width: 1440, height: 900 })
  const reloadedList = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith('/rpc/vms_list_vehicle_archives_secure')
  )
  await page.reload()
  await (await reloadedList).finished()
  await expect(workspace).toBeVisible()
  await expect(row.getByText('黄牌', { exact: true })).toBeVisible()
  await expect(workspace.locator('[aria-busy="true"]')).toHaveCount(0)
  const more = row.getByRole('button', { name: '更多操作', exact: true })
  await more.hover()
  const menu = page.locator(`#${await more.getAttribute('aria-controls')}`)
  await expect(menu).toBeVisible()
  await menu.getByRole('menuitem', { name: '查看', exact: true }).click()
  await expect(
    identity
      .locator('dt')
      .filter({ hasText: '主司机/电话' })
      .locator('xpath=following-sibling::dd[1]')
  ).toHaveText(headerDisplaySample.driverName)
  await expect(identity).not.toContainText(headerDisplaySample.phone)
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
