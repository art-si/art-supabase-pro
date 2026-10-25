import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
test.setTimeout(90_000)
for (const kind of ['customer', 'accident', 'expense'])
  for (const mode of ['valid', 'zero', 'invalid', 'masked']) {
    test('经纬度显示统一 ' + kind + ' ' + mode, async ({ page }, info) => {
      await prepareIsolatedSession(page)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const longitude =
        mode === 'zero' ? 0 : mode === 'invalid' ? ' ' : mode === 'masked' ? '***' : 120.123456789
      const latitude = mode === 'zero' ? 0 : 30.123456789
      await page.route('**/rest/v1/**', (route) => {
        const path = new URL(route.request().url()).pathname
        if (
          !/tms_get_customer_price_secure|vms_get_vehicle_accident_secure|tms_get_waybill_cost_secure/.test(
            path
          )
        )
          return route.fulfill({ json: [] })
        return route.fulfill({
          json: {
            id: 'coordinate-test',
            plateNo: '坐标验收车辆',
            expenseNo: '坐标验收费用',
            waybillNoSnapshot: '坐标验收运单',
            customer: { customerName: '坐标验收客户' },
            shippingLongitude: longitude,
            shippingLatitude: latitude,
            receivingLongitude: null,
            receivingLatitude: null,
            accidentLongitude: longitude,
            accidentLatitude: latitude,
            expenseLongitude: longitude,
            expenseLatitude: latitude,
            attachments: [],
            cargoItems: [],
            fieldAccess: {
              addressDetails: 'read',
              accidentLocation: 'read',
              expenseLocation: 'read',
              expenseEvidence: 'read'
            }
          }
        })
      })
      await page.goto('/tests/e2e/fixtures/coordinate-display-reuse.html?kind=' + kind)
      const expected =
        mode === 'invalid'
          ? '--'
          : mode === 'masked'
            ? '***'
            : kind === 'accident'
              ? mode === 'zero'
                ? '0.0000000, 0.0000000'
                : '120.1234568, 30.1234568'
              : mode === 'zero'
                ? '0, 0'
                : '120.123456789, 30.123456789'
      const value = page
        .getByText(kind === 'accident' ? '事故坐标' : '经纬度', { exact: true })
        .first()
        .locator('xpath=ancestor-or-self::*[self::td or self::th][1]/following-sibling::td[1]')
        .locator('.art-descriptions__value')
      await expect(value).toHaveText(expected)
      await value.scrollIntoViewIfNeeded()
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
      ).toBe(true)
      expect(errors).toEqual([])
      await page.screenshot({ path: info.outputPath('coordinates.png') })
    })
  }
