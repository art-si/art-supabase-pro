import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

test('经营大屏共享格式化保留阈值、负数及单位', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  let amount = 123456.78
  let cashInflow = 9999.9
  let cashOutflow = -12345.6
  await page.route('**/rest/v1/rpc/get_dashboard_console', (route) =>
    route.fulfill({
      json: {
        todayOrderCount: 0,
        todayFreightAmount: amount,
        pendingDispatchCount: 0,
        inTransitCount: 0,
        vehicleCount: 0,
        operatingVehicleCount: 0,
        pendingAuditVehicleCount: 0,
        completedTodayCount: 0,
        trend: [],
        statusCounts: {},
        transitOrders: [],
        recentOrders: [],
        reminders: []
      }
    })
  )
  await page.route('**/rest/v1/rpc/get_enterprise_dashboard', (route) =>
    route.fulfill({
      json: {
        generatedAt: '2026-10-10T00:00:00Z',
        fleet: { total: 0, operating: 0, pendingAudit: 0, dueDocuments: 0 },
        finance: {
          voucherCount: 0,
          postedAmount: 0,
          cashInflow,
          cashOutflow,
          receivable: 0,
          payable: 0,
          approvedWaybillCost: 0
        },
        workforce: { total: 0, active: 0, probation: 0, expiringContracts: 0 },
        safety: {
          openHazards: 0,
          overdueHazards: 0,
          overdueInspections: 0,
          recentAccidents: 0,
          equipmentTotal: 0,
          equipmentNormal: 0,
          criticalEquipment: 0
        }
      }
    })
  )
  for (const width of [1920, 1280]) {
    cashInflow = 9999.9
    cashOutflow = -12345.6
    await page.setViewportSize({ width, height: 1080 })
    await page.goto('/tests/e2e/fixtures/compact-display-reuse.html')
    const freight = page.locator('.hero-metric').filter({ hasText: '今日运费' }).locator('strong')
    for (const [value, expected] of [
      [123456.78, '12.3万元'],
      [9999.9, '9,999.9元'],
      [10000, '1万元'],
      [-12345.6, '-12,345.6元'],
      [0, '0元']
    ] as const) {
      amount = value
      await page.getByRole('button', { name: '刷新大屏数据' }).click()
      await expect(freight).toHaveText(expected)
      if (value === 123456.78)
        await page.screenshot({ path: info.outputPath(`screen-populated-${width}.png`) })
    }
    await expect(
      page.getByTitle('流入 9,999.9 元 · 流出 -12,345.6 元', { exact: true })
    ).toBeVisible()
    const financeScore = page
      .locator('.command-domain-node')
      .filter({ hasText: '资金运行' })
      .locator('strong')
    await expect(financeScore).toHaveText('0/100')
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    await page.screenshot({ path: info.outputPath(`screen-${width}.png`) })
    if (width === 1280) {
      const lowerPanel = page.getByRole('heading', { name: '待关注事项', exact: true })
      await lowerPanel.scrollIntoViewIfNeeded()
      await expect(lowerPanel).toBeInViewport()
      await page.screenshot({ path: info.outputPath('screen-lower-1280.png') })
    }
    for (const [inflow, outflow, score] of [
      [-10, 10, 0],
      [10, 5, 100],
      [0, 10, 0],
      [0, 0, 100]
    ] as const) {
      cashInflow = inflow
      cashOutflow = outflow
      await page.getByRole('button', { name: '刷新大屏数据' }).click()
      await expect(financeScore).toHaveText(`${score}/100`)
    }
  }
  expect(errors).toEqual([])
})

for (const state of ['readable', 'zero', 'masked'] as const) {
  test(`财务驾驶舱共享紧凑金额 ${state}`, async ({ page }) => {
    await prepareIsolatedSession(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname
      if (path.endsWith('fms_get_fund_account_overview_secure'))
        return route.fulfill({
          json: {
            baseCurrencyAvailableBalance:
              state === 'masked' ? '***' : state === 'zero' ? 0 : 123456.78
          }
        })
      if (
        path.endsWith('tms_list_customer_statements_secure') ||
        path.endsWith('tms_list_carrier_statements_secure')
      )
        return route.fulfill({
          json: {
            records:
              state === 'readable'
                ? [
                    {
                      status: 'confirmed',
                      outstandingAmount: path.includes('customer') ? 20000 : 10000
                    }
                  ]
                : [],
            total: state === 'readable' ? 1 : 0
          }
        })
      return route.fulfill({ json: { records: [], total: 0 } })
    })
    await page.goto('/tests/e2e/fixtures/compact-display-reuse.html?mode=finance')
    await page.getByRole('button', { name: '读取财务指标' }).click()
    const output = page.locator('output[aria-label="财务指标"]')
    await expect(output).toContainText('可用资金')
    const result = JSON.parse(await output.innerText())
    const expected =
      state === 'readable'
        ? ['12.3万', '13.3万', '2万', '1万']
        : state === 'zero'
          ? ['0', '0', '0', '0']
          : ['—', '—', '0', '0']
    expect(result.metrics.slice(0, 4).map((metric: { value: string }) => metric.value)).toEqual(
      expected
    )
    expect(
      result.metrics.slice(0, 4).every((metric: { unit: string }) => metric.unit === '元')
    ).toBe(true)
    expect(result.nodes[0].caption).toBe(`30天余额 ${expected[1]}`)
    expect(errors).toEqual([])
  })
}

test('事故责任比例和坐标复用公共格式化', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  let percent: number | null = 12.34567
  await page.route('**/rest/v1/rpc/vms_get_vehicle_accident_secure', (route) =>
    route.fulfill({
      json: {
        id: 'display-test',
        plateNo: '测试车辆',
        companyName: '测试公司',
        responsibilityPercent: percent,
        accidentLongitude: 120.12345678,
        accidentLatitude: 0,
        attachments: [],
        fieldAccess: { accidentLocation: 'read' }
      }
    })
  )
  for (const [value, text] of [
    [12.34567, '12.34567%'],
    [0, '0%'],
    [null, '--']
  ] as const) {
    percent = value
    await page.goto('/tests/e2e/fixtures/date-format-reuse.html?vehicle=accident')
    const label = page.getByRole('cell', { name: '责任比例', exact: true })
    await expect(label.locator('xpath=following-sibling::td[1]')).toHaveText(text)
    await expect(page.getByText('120.1234568, 0.0000000', { exact: true })).toBeVisible()
  }
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  await page.screenshot({ path: info.outputPath('accident-percent.png') })
  expect(errors).toEqual([])
})
