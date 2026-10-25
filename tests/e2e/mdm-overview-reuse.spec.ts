import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)

test('治理总览公共数字展示与失败重试', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  let failed = false
  await page.route('**/rest/v1/rpc/mdm_get_governance_overview_secure', (route) =>
    route.fulfill(
      failed
        ? { status: 503, json: { message: 'temporary failure' } }
        : {
            json: { domains: [{ key: 'organization', recordCount: 12345, attentionCount: 2345 }] }
          }
    )
  )
  await page.goto('/tests/e2e/fixtures/mdm-overview-reuse.html')
  const root = page.locator('.mdm-workbench')
  await expect(root.getByText('12,345', { exact: true })).toHaveCount(2)
  await expect(
    root.locator('.domain-list em').getByText('2,345 条待完善', { exact: true })
  ).toBeVisible()
  await expect(root.getByText('10,000 条', { exact: true })).toBeVisible()
  await expect(root.getByText('2,345 条', { exact: true })).toBeVisible()
  await expect(root.getByText('81%', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({
    path: info.outputPath('overview-numbers.png'),
    fullPage: true,
    animations: 'disabled'
  })
  failed = true
  await root.getByRole('button', { name: '刷新主数据概览', exact: true }).click()
  await expect(root.getByText('主数据概览加载失败', { exact: true })).toBeVisible()
  await expect(root.getByText('12,345', { exact: true })).toHaveCount(0)
  failed = false
  await root.getByRole('button', { name: '重新加载', exact: true }).first().click()
  await expect(root.getByText('12,345', { exact: true })).toHaveCount(2)
  expect(errors).toEqual([])
})
