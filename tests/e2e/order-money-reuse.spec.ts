import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { assertAppearance, prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)
test('订单详情公共金额格式保留零值空值和掩码', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const appearance = {
    theme: info.project.name === 'mobile-390' ? 'dark' : 'light',
    boxBorderMode: info.project.name !== 'mobile-390'
  } as const
  await prepareAppearance(page, appearance)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rpc/tms_get_order_detail_secure', (route) =>
    route.fulfill({
      json: {
        id: 'money-test',
        order_no: 'ORDER-MONEY-001',
        order_status: 'pending_order',
        create_time: '2026-10-31T08:09:10',
        transport_fee: '1234.5',
        unloading_fee: 0,
        delivery_fee: '***',
        insurance_fee: null,
        field_access: { freightAmounts: 'read' }
      }
    })
  )
  await page.goto('/tests/e2e/fixtures/order-money-detail.html')
  await assertAppearance(page, appearance)
  await expect(page.getByText('2026-10-31 08:09:10', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: '应收信息', exact: true }).click()
  await expect(page.getByText('¥1,234.50', { exact: true }).first()).toBeVisible({
    timeout: 60_000
  })
  await expect(page.getByText('¥0.00', { exact: true }).first()).toBeAttached()
  await expect(page.getByText('***', { exact: true }).first()).toBeAttached()
  await expect(
    page
      .getByRole('row')
      .filter({ has: page.getByRole('cell', { name: '保费', exact: true }) })
      .getByRole('cell')
      .nth(1)
  ).toHaveText('--')
  await expect(page.getByText('¥***', { exact: true })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
  expect(errors).toEqual([])
  await page.screenshot({ path: info.outputPath('order-money.png'), fullPage: true })
})
