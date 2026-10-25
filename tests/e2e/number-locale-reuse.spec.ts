import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, locale: 'ar-EG' })
test.setTimeout(180_000)

for (const mode of ['geofence', 'part']) {
  test(`数值显示遵循项目地区规则 ${mode}`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    let stage = 0
    await page.route('**/rest/v1/**', (route) => {
      if (
        new URL(route.request().url()).pathname.endsWith('/rpc/vms_get_vehicle_part_usage_secure')
      )
        return route.fulfill({
          json: {
            id: 'number-locale-test',
            plateNo: '测试车辆',
            partName: '测试零部件',
            usedMileage: [12345.6789, 0, null, 12345][stage],
            lifecycleLimitsMasked: stage === 3,
            fieldAccess: { lifecycleLimits: 'read' }
          }
        })
      return route.fulfill({ json: [] })
    })
    await page.goto(`/tests/e2e/fixtures/number-locale-reuse.html?mode=${mode}`)
    if (mode === 'geofence') {
      await expect(page.locator('dd').filter({ hasText: '1,000 米' })).toHaveCount(2, {
        timeout: 120_000
      })
      await expect(page.getByText('1,000 m', { exact: true })).toHaveCount(2)
      await expect(page.getByText('当前为安全只读视图', { exact: true })).toBeVisible()
      await page.screenshot({ path: info.outputPath('number-locale.png') })
      await page.locator('dd').filter({ hasText: '1,000 米' }).first().scrollIntoViewIfNeeded()
      await page.screenshot({ path: info.outputPath('number-locale-preview.png') })
    } else {
      const value = page
        .locator('.vehicle-part-usage-detail__summary-item')
        .filter({ hasText: '已使用里程' })
        .locator('strong')
      for (const expected of ['12,345.679 km', '0 km', '--', '***']) {
        await expect(value).toHaveText(expected, { timeout: 120_000 })
        const detailValue = page
          .getByRole('cell', { name: '已使用里程', exact: true })
          .locator('xpath=following-sibling::td[1]')
        await expect(detailValue).toHaveText(expected.replace(' km', ' 公里'))
        if (stage === 0) await page.screenshot({ path: info.outputPath('number-locale.png') })
        stage++
        if (stage < 4) await page.reload()
      }
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    expect(errors).toEqual([])
  })
}
