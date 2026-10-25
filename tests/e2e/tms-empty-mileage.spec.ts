import { test, expect } from '@playwright/test'
test.use({ storageState: { cookies: [], origins: [] } })
test('回场空驶里程边界与提交', async ({ page }, info) => {
  test.setTimeout(120_000)
  const submissions: Record<string, unknown>[] = []
  const context = {
    waybillId: 'empty-mileage-test',
    waybillStatus: 'signed',
    canComplete: true,
    needsReturnCompletion: true,
    record: {
      departureOdometerKm: 1000,
      returnOdometerKm: 1100,
      returnTime: '2026-10-24T09:00:00+08:00',
      signedAt: '2026-10-23T09:00:00+08:00',
      returnPhotoUrls: ['/test-return.svg'],
      emptyMileageKm: null
    }
  }
  await page.route('**/test-return.svg', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><rect width="160" height="100" fill="#e9eef3"/><text x="80" y="52" text-anchor="middle" font-size="14" fill="#536273">测试回场凭证</text></svg>'
    })
  )
  await page.route('**/rest/v1/rpc/tms_get_waybill_execution_context', (route) =>
    route.fulfill({ json: context })
  )
  await page.route('**/rest/v1/rpc/tms_complete_waybill_execution', (route) => {
    submissions.push(route.request().postDataJSON())
    return route.fulfill({ json: context })
  })
  await page.goto('/tests/e2e/fixtures/tms-empty-mileage.html')
  await page.getByRole('button', { name: '确认回场', exact: true }).click()
  const input = page.getByRole('spinbutton', { name: '本次空驶里程（公里）' })
  await expect(input).toBeVisible()
  await input.fill('101')
  await page.getByRole('button', { name: '确认回场并完成', exact: true }).click()
  await expect(page.getByText('空驶里程须在 0 与本次总里程之间', { exact: true })).toBeVisible()
  expect(submissions).toHaveLength(0)
  await input.fill('10')
  await page.getByRole('spinbutton', { name: '出车余油（升）' }).fill('100')
  await page.getByRole('spinbutton', { name: '途中加油（升）' }).fill('30')
  const returnFuel = page.getByRole('spinbutton', { name: '回场余油（升）' })
  await returnFuel.fill('131')
  await page.getByRole('button', { name: '确认回场并完成', exact: true }).click()
  await expect(
    page.getByText('回场余油不能大于出车余油与途中加油之和', { exact: true })
  ).toBeVisible()
  expect(submissions).toHaveLength(0)
  await returnFuel.fill('100')
  await expect(page.locator('.el-message')).toHaveCount(0)
  await expect(page.getByText('空驶里程须在 0 与本次总里程之间', { exact: true })).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('empty-mileage.png'), fullPage: true })
  await page.getByRole('button', { name: '确认回场并完成', exact: true }).click()
  await expect.poll(() => submissions.length).toBe(1)
  expect(submissions[0].p_empty_mileage_km).toBe(10)
  expect(submissions[0].p_departure_fuel_liters).toBe(100)
  expect(submissions[0].p_refueled_liters).toBe(30)
  expect(submissions[0].p_return_fuel_liters).toBe(100)
})
