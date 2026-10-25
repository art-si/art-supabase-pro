import { expect, test } from '@playwright/test'
import { installFixtures } from './support/inventory-fixtures'

test.describe.configure({ timeout: 180_000 })

for (const kind of ['stock', 'movement', 'ledger', 'receipt-issue']) {
  test(`${kind}返回缓存报表重新读取并保留筛选`, async ({ page }, testInfo) => {
    await installFixtures(page)
    let posted = false
    const requests: Record<string, unknown>[] = []
    await page.route('**/rest/v1/rpc/wms_inventory_report_secure', (route) => {
      requests.push(route.request().postDataJSON())
      return route.fulfill({
        json: {
          data: [
            {
              id: 'cached-report',
              batch_id: 'cached-batch',
              material_code: posted ? 'CACHE-POSTED' : 'CACHE-BEFORE',
              material_name: '库存缓存测试物料',
              warehouse_id: 'cached-warehouse',
              warehouse_name: '测试仓库',
              inventory_quantity: posted ? 9 : 10,
              opening_quantity: 10,
              inbound_quantity: 0,
              outbound_quantity: posted ? 1 : 0,
              closing_quantity: posted ? 9 : 10
            }
          ],
          total: 1,
          navigation: []
        }
      })
    })
    await page.goto(
      `/tests/e2e/fixtures/wms-inventory-report.html?kind=${kind}&cached=true&authority=super`
    )
    await expect(page.getByText('CACHE-BEFORE', { exact: true })).toBeVisible()
    const input = page.getByRole('textbox', { name: '物料编码', exact: true })
    await input.fill('CACHE')
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await expect.poll(() => requests.at(-1)?.p_material_code).toBe('CACHE')
    await page.getByRole('button', { name: '前往出库作业', exact: true }).click()
    await expect(page.getByText('CACHE-BEFORE', { exact: true })).toBeHidden()
    const before = requests.length
    posted = true
    await page.getByRole('button', { name: '返回库存报表', exact: true }).click()
    await expect(page.getByText('CACHE-POSTED', { exact: true })).toBeVisible()
    await expect(input).toHaveValue('CACHE')
    expect(requests.length).toBe(before + 1)
    expect(requests.at(-1)?.p_material_code).toBe('CACHE')
    await page.screenshot({
      path: testInfo.outputPath('report-after-posting.png'),
      animations: 'disabled'
    })
  })
}
