import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })

test('目录接口保留质量分边界及小数', async ({ page }) => {
  test.setTimeout(180_000)
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/rpc/mdm_list_catalog_secure', (route) =>
    route.fulfill({
      json: {
        total: 7,
        records: [-12, 120, 0, 12.34567, '45.67', null, 'invalid'].map((qualityScore, index) => ({
          id: String(index),
          qualityScore
        }))
      }
    })
  )
  await page.goto('/tests/e2e/fixtures/explicit-locale-reuse.html?mode=catalog-scores')
  await page.getByRole('button', { name: '读取目录质量分' }).click({ timeout: 120_000 })
  await expect(page.getByLabel('目录质量分')).toHaveText('[0,100,0,12.34567,45.67,0,0]')
})
