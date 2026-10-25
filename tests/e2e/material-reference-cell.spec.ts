import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)
for (const kind of ['unit-of-measure', 'material-type', 'attribute-group', 'code-rule']) {
  test(`${kind} 公共身份单元格保留名称编码且不溢出`, async ({ page }, testInfo) => {
    await prepareIsolatedSession(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) => {
      const url = route.request().url()
      if (
        /\/mdm_(unit_of_measure|material_type|material_attribute_group|material_code_rule)\?/.test(
          url
        )
      )
        return route.fulfill({
          headers: { 'content-range': '0-0/1' },
          json: [
            {
              id: 'reference-test',
              tenant_id: 'test-tenant',
              status: 'enabled',
              sort: 1,
              unit_name: '统一主档显示验证',
              unit_code: 'REFERENCE-001',
              decimal_places: 2,
              conversion_factor: 1,
              type_name: '统一主档显示验证',
              type_code: 'REFERENCE-001',
              tag_type: 'primary',
              group_name: '统一主档显示验证',
              group_code: 'REFERENCE-001',
              attributes: [],
              rule_name: '统一主档显示验证',
              rule_code: 'REFERENCE-001',
              strategy: 'material_type',
              code_length: 12
            }
          ]
        })
      return route.fulfill({ json: [] })
    })
    await page.goto(`/tests/e2e/fixtures/material-reference-cell.html?kind=${kind}`)
    const cell = page.locator('.material-reference-page .business-table-identity-cell').first()
    await expect(cell.locator('strong')).toHaveText('统一主档显示验证', { timeout: 60_000 })
    await expect(cell.locator('small')).toHaveText('REFERENCE-001')
    await expect(cell.locator('strong')).toHaveAttribute('title', '统一主档显示验证')
    await expect(cell.locator('small')).toHaveAttribute('title', 'REFERENCE-001')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(errors).toEqual([])
    await page.screenshot({ path: testInfo.outputPath(`${kind}.png`), fullPage: true })
  })
}
