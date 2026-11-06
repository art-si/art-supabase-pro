import { expect, test, type Page } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

const waybillId = '11111111-1111-4111-8111-111111111401'
const tenantId = '11111111-1111-4111-8111-111111111111'

async function revealAlignedAppointmentCell(page: Page, label: string, headerName: string) {
  const value = page.getByLabel(label)
  await value.scrollIntoViewIfNeeded()
  const cell = value.locator('xpath=ancestor::td[1]')
  const header = page.getByRole('columnheader', { name: headerName })
  const viewport = page.locator('.el-table__body-wrapper .el-scrollbar__wrap').first()
  await expect
    .poll(async () => {
      const [cellBox, headerBox, viewportBox] = await Promise.all([
        cell.boundingBox(),
        header.boundingBox(),
        viewport.boundingBox()
      ])
      if (!cellBox || !headerBox || !viewportBox) return false
      const visibleLeft = Math.max(cellBox.x, viewportBox.x)
      const visibleRight = Math.min(
        cellBox.x + cellBox.width,
        viewportBox.x + viewportBox.width - 86
      )
      return (
        visibleRight - visibleLeft >= Math.min(cellBox.width * 0.5, 70) &&
        Math.abs(cellBox.x - headerBox.x) <= 6 &&
        Math.abs(cellBox.width - headerBox.width) <= 6
      )
    })
    .toBe(true)
}
const waybill = {
  id: waybillId,
  tenantId,
  waybillNo: 'YD-APPOINTMENT-001',
  orderNo: 'DD-APPOINTMENT-001',
  sourceOrderNos: ['DD-APPOINTMENT-001'],
  originStation: '上海',
  destinationStation: '苏州',
  shippingContactName: '测试发货方',
  receivingContactName: '测试收货方',
  plannedDepartureTime: '2026-11-06T02:00:00Z',
  plannedArrivalTime: '2026-11-06T06:00:00Z',
  waybillStatus: 'accepted',
  status: 'accepted',
  cargoQuantityTotal: 2,
  cargoWeightTotal: 700
}

for (const kind of ['pickup', 'delivery'] as const) {
  test(`${kind === 'pickup' ? '提货' : '送货'}预约列表逐条展示同一调度单的两次预约`, async ({
    page
  }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) => {
      const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
      if (endpoint === 'tms_list_dispatch_workbench_secure')
        return route.fulfill({ json: { records: [waybill], total: 1, fieldAccess: {} } })
      if (endpoint === 'tms_list_waybill_appointments_secure')
        return route.fulfill({
          json: [
            {
              id: '11111111-1111-4111-8111-111111111501',
              appointmentNo: `${kind === 'pickup' ? 'TH' : 'SH'}202611-001`,
              kind,
              anchorWaybillId: waybillId,
              selectedWaybillIds: [waybillId],
              driverName: '测试司机甲',
              driverPhone: '13800000001',
              plateNo: '测A12345',
              vehicleType: '厢式货车',
              loadCapacityTon: 12,
              vehicleLengthM: 9.6,
              scheduledAt: '2026-11-06T02:30:00Z',
              status: 'confirmed',
              remark: null,
              arrivalPlateNo: null,
              arrivedAt: null,
              dockName: null,
              loadingStartedAt: null,
              loadingFinishedAt: null,
              departedAt: null,
              updateTime: '2026-11-05T03:00:00Z'
            },
            {
              id: '11111111-1111-4111-8111-111111111502',
              appointmentNo: `${kind === 'pickup' ? 'TH' : 'SH'}202611-002`,
              kind,
              anchorWaybillId: waybillId,
              selectedWaybillIds: [waybillId],
              driverName: '测试司机乙',
              driverPhone: '13800000002',
              plateNo: '测A67890',
              vehicleType: '平板货车',
              loadCapacityTon: 18,
              vehicleLengthM: 13.5,
              scheduledAt: '2026-11-06T04:30:00Z',
              status: 'confirmed',
              remark: null,
              arrivalPlateNo: null,
              arrivedAt: null,
              dockName: null,
              loadingStartedAt: null,
              loadingFinishedAt: null,
              departedAt: null,
              updateTime: '2026-11-05T04:00:00Z'
            }
          ]
        })
      if (endpoint === 'sys_dictionary') return route.fulfill({ json: [] })
      return route.fulfill({ json: [] })
    })
    await page.goto(
      `${process.env.E2E_FIXTURE_PREFIX || ''}/tests/e2e/fixtures/tms-appointment-list-visual.html?kind=${kind}`
    )
    await expect(
      page.getByRole('heading', { name: kind === 'pickup' ? '提货预约' : '送货预约' })
    ).toBeVisible()
    for (const name of [
      '预约单号',
      '进场日期与时间',
      '司机姓名',
      '车牌号',
      '车型',
      '载重（吨）',
      '车长（米）'
    ])
      await expect(page.getByRole('columnheader', { name })).toBeAttached()
    for (const [index, value] of [
      [1, `${kind === 'pickup' ? 'TH' : 'SH'}202611-001`],
      [2, `${kind === 'pickup' ? 'TH' : 'SH'}202611-002`],
      [1, '测试司机甲'],
      [2, '测试司机乙'],
      [1, '测A12345'],
      [2, '测A67890'],
      [1, '厢式货车'],
      [2, '平板货车'],
      [1, '12'],
      [2, '18'],
      [1, '9.6'],
      [2, '13.5']
    ] as const)
      await expect(page.getByLabel(`第 ${index} 条预约：${value}`)).toBeAttached()
    const tableScroll = page.locator('.el-table__body-wrapper .el-scrollbar__wrap').first()
    await expect
      .poll(() => tableScroll.evaluate((element) => element.scrollWidth > element.clientWidth))
      .toBe(true)
    for (const theme of ['light', 'dark']) {
      await page.evaluate(
        (value) => document.documentElement.classList.toggle('dark', value === 'dark'),
        theme
      )
      for (const width of [1440, 1280, 390]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
        await expect
          .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
          .toBeLessThanOrEqual(1)
        await page.screenshot({
          path: info.outputPath(`${kind}-${width}-${theme}.png`),
          animations: 'disabled'
        })
        await revealAlignedAppointmentCell(
          page,
          `第 2 条预约：${kind === 'pickup' ? 'TH' : 'SH'}202611-002`,
          '预约单号'
        )
        await page.screenshot({
          path: info.outputPath(`${kind}-${width}-${theme}-appointment-number.png`),
          animations: 'disabled'
        })
        await revealAlignedAppointmentCell(page, '第 2 条预约：测A67890', '车牌号')
        await page.screenshot({
          path: info.outputPath(`${kind}-${width}-${theme}-appointment-driver-plate.png`),
          animations: 'disabled'
        })
        await revealAlignedAppointmentCell(page, '第 2 条预约：13.5', '车长（米）')
        await page.screenshot({
          path: info.outputPath(`${kind}-${width}-${theme}-appointment-details.png`),
          animations: 'disabled'
        })
        await tableScroll.evaluate((element) => {
          element.scrollLeft = 0
        })
      }
    }
    expect(errors).toEqual([])
  })
}
