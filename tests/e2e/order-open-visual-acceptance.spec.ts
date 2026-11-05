import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('开单完整表单在桌面和窄屏的深浅主题下保持可用', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/sys_dictionary')) {
      const code = url.searchParams.get('dict_type_table.code')?.replace(/^eq\./, '')
      const labels: Record<string, Array<[string, string]>> = {
        tmsOrderTransportMode: [['road', '公路运输']],
        tmsOrderDeliveryMethod: [['door', '送货上门']]
      }
      return route.fulfill({
        json: (labels[code || ''] || []).map(([value, label], index) => ({
          id: `${code}-${index}`,
          code: value,
          label,
          value,
          sort: index,
          status: '1',
          dict_type_table: { code, name: code }
        }))
      })
    }
    return route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/order-numeric.html')
  await page.getByRole('radiogroup').getByText('完整表单', { exact: true }).click()
  await expect(page.locator('.order-open__section--route')).toBeVisible()
  const addWaypoint = page.getByRole('button', { name: /添加途经点/ })
  await expect(addWaypoint).toBeVisible()
  await addWaypoint.click()
  await expect(page.getByText('途经点', { exact: true })).toBeVisible()

  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.classList.toggle('dark', value === 'dark')
    }, theme)
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 1280, height: 800 },
      { width: 390, height: 844 }
    ]) {
      await page.setViewportSize(viewport)
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
        .toBeLessThanOrEqual(1)
      await page.screenshot({
        path: info.outputPath(`order-open-top-${viewport.width}-${theme}.png`),
        animations: 'disabled'
      })
      const note = page.getByPlaceholder('请输入订单备注')
      await note.click()
      await expect
        .poll(() =>
          page.evaluate(() => {
            const input = document.querySelector<HTMLTextAreaElement>(
              'textarea[placeholder="请输入订单备注"]'
            )
            const footer = document.querySelector<HTMLElement>('.order-open__footer')
            return input && footer
              ? input.getBoundingClientRect().bottom - footer.getBoundingClientRect().top
              : Number.POSITIVE_INFINITY
          })
        )
        .toBeLessThanOrEqual(1)
      await page.screenshot({
        path: info.outputPath(`order-open-bottom-${viewport.width}-${theme}.png`),
        animations: 'disabled'
      })
      await page.evaluate(() => window.scrollTo(0, 0))
    }
  }
  expect(errors).toEqual([])
})
