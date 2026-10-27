import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

const cases = [
  { key: 'range', longitude: 181, latitude: 91, status: 'unconfirmed' },
  { key: 'half', longitude: 121, latitude: null, status: 'unconfirmed' },
  { key: 'negative', longitude: -73.9857, latitude: -40.7484, status: 'located' }
] as const

for (const kind of ['客户', '地址'] as const) {
  test(`${kind}提交按有效坐标决定定位状态，保留原字段值`, async ({ page }, info) => {
    const writes: Array<Record<string, unknown>> = []
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await prepareIsolatedSession(page)
    await page.route('**/rest/v1/**', (route) => {
      const table = new URL(route.request().url()).pathname.split('/').at(-1)
      if (
        table === 'tms_update_customer_secure' ||
        table === 'tms_update_customer_address_secure'
      ) {
        writes.push(route.request().postDataJSON().p_payload)
        return route.fulfill({ json: {} })
      }
      return route.fulfill({
        headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' },
        json: []
      })
    })
    await page.goto('/tests/e2e/fixtures/tms-customer-coordinate-write.html', {
      waitUntil: 'domcontentloaded'
    })

    for (const [index, scenario] of cases.entries()) {
      await page.getByRole('button', { name: `打开${kind} ${scenario.key}` }).click()
      const dialog = page.getByRole('dialog', {
        name: kind === '客户' ? '编辑客户' : '编辑常用地址'
      })
      await expect(dialog).toBeVisible()
      await expect(dialog.locator('.art-form .art-async-state__skeleton')).toHaveCount(0, {
        timeout: 120_000
      })
      await expect(
        dialog.getByRole('textbox', { name: kind === '客户' ? /客户名称/ : '联系人' })
      ).toBeVisible()
      if (scenario.key === 'range') {
        await expect(dialog.getByText('待确认', { exact: true })).toBeVisible()
        await dialog.screenshot({ path: info.outputPath(`${kind}-invalid-coordinate.png`) })
      }
      await dialog.getByRole('button', { name: '确定', exact: true }).click()
      try {
        await expect.poll(() => writes.length, { timeout: 8000 }).toBe(index + 1)
      } catch {
        const fieldErrors = await dialog.locator('.el-form-item__error').allTextContents()
        const loadingErrors = await dialog.locator('.art-async-state__error').allTextContents()
        const notices = await page.locator('.el-message').allTextContents()
        throw new Error(
          `客户坐标提交未到达 RPC：${JSON.stringify({ fieldErrors, loadingErrors, notices })}`
        )
      }
      expect(writes[index]).toMatchObject({
        longitude: scenario.longitude,
        latitude: scenario.latitude,
        coordinate_status: scenario.status,
        region: '上海市/上海市/黄浦区'
      })
      await expect(dialog).toBeHidden()
    }
    expect(errors).toEqual([])
  })
}
