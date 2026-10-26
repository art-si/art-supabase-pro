import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(240_000)

const daily = Array.from({ length: 14 }, (_, index) => {
  const date = new Date(Date.UTC(2026, 9, 26 + index)).toISOString().slice(0, 10)
  return {
    date,
    demandTrips: index === 0 ? 2 : 0,
    demandTon: index === 0 ? 18 : 0,
    assignedVehicles: index === 0 ? 1 : 0,
    unassignedTrips: index === 0 ? 1 : 0,
    fleetCapacityTon: 0,
    loadRate: null
  }
})

test('运力容量提示条和每日需求卡按内容展开，不压住文字', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
    if (endpoint === 'tms_get_capacity_planning_secure')
      return route.fulfill({
        json: {
          generatedAt: '2026-10-26T16:00:00+08:00',
          periodDays: 14,
          activeFleetCount: 5,
          fleetCapacityTon: 0,
          activeWaybillCount: 8,
          assignedVehicleCount: 6,
          availableVehicleCount: 0,
          unassignedActiveCount: 1,
          backlogCount: 2,
          returnedBacklogCount: 2,
          truncated: false,
          daily,
          backlog: [
            {
              id: '11111111-1111-4111-8111-111111111301',
              waybillNo: 'QA-WB-001',
              status: 'pending',
              originCity: '上海',
              destinationCity: '苏州',
              plannedLoadTime: '2026-10-27T08:00:00+08:00',
              cargoWeightTon: 8,
              waitingHours: 12
            },
            {
              id: '11111111-1111-4111-8111-111111111302',
              waybillNo: 'QA-WB-002',
              status: 'pending',
              originCity: '宁波',
              destinationCity: '杭州',
              plannedLoadTime: '2026-10-28T08:00:00+08:00',
              cargoWeightTon: 10,
              waitingHours: 30
            }
          ]
        }
      })
    if (endpoint === 'sys_dictionary') {
      const code = new URL(route.request().url()).searchParams
        .get('dict_type_table.code')
        ?.replace(/^eq\./, '')
      return route.fulfill({
        json:
          code === 'tmsCapacityPlanningHorizonDays'
            ? [7, 14, 30].map((value) => ({
                id: `horizon-${value}`,
                code: String(value),
                label: `${value}天`,
                value: String(value),
                sort: value,
                status: '1',
                dict_type_table: { code, name: code }
              }))
            : []
      })
    }
    return route.fulfill({ json: [] })
  })

  for (const width of [1920, 1440, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/tests/e2e/fixtures/capacity-planning-layout.html', {
      waitUntil: 'domcontentloaded'
    })
    await expect(page.getByText('车辆核载资料尚未形成可用容量基线')).toBeVisible({
      timeout: 60_000
    })
    await expect(page.getByText('QA-WB-001')).toBeVisible()
    await expect(page.getByText('QA-WB-002')).toBeVisible()
    const alert = page.locator('.capacity-planning-page .el-alert').first()
    const timeline = page.locator('.capacity-planning-page__timeline')
    const alertBox = await alert.boundingBox()
    const timelineBox = await timeline.boundingBox()
    expect(alertBox?.height).toBeGreaterThanOrEqual(56)
    expect(
      (timelineBox?.y ?? 0) - (alertBox?.y ?? 0) - (alertBox?.height ?? 0)
    ).toBeGreaterThanOrEqual(12)
    expect(
      await alert.evaluate((element) => element.scrollHeight <= element.clientHeight + 2)
    ).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`capacity-${width}.png`), fullPage: true })
  }
  expect(errors).toEqual([])
})
