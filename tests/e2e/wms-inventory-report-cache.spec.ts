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
    const oldWarehouse = {
      id: 'cached-warehouse-old',
      warehouse_code: 'CACHE-OLD',
      warehouse_name: '原仓库'
    }
    const newWarehouse = {
      id: 'cached-warehouse-new',
      warehouse_code: 'CACHE-NEW',
      warehouse_name: '新仓库'
    }
    let warehouseRows = [oldWarehouse]
    let warehouseReads = 0
    await page.route('**/rest/v1/mdm_warehouse?*', (route) => {
      warehouseReads += 1
      return route.fulfill({ json: warehouseRows })
    })
    await page.goto(
      `/tests/e2e/fixtures/wms-inventory-report.html?kind=${kind}&cached=true&authority=super`
    )
    await expect(page.getByText('CACHE-BEFORE', { exact: true })).toBeVisible()
    const navigator = page.locator('.inventory-location-navigator')
    await navigator.getByRole('button', { name: '显示空位置', exact: true }).click()
    await expect(navigator.getByText('原仓库', { exact: true })).toBeVisible()
    expect(warehouseReads).toBe(1)
    const input = page.getByRole('textbox', { name: '物料编码', exact: true })
    await input.fill('CACHE')
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await expect.poll(() => requests.at(-1)?.p_material_code).toBe('CACHE')
    await page.getByRole('button', { name: '前往出库作业', exact: true }).click()
    await expect(page.getByText('CACHE-BEFORE', { exact: true })).toBeHidden()
    const before = requests.length
    const locationReadsBeforeReturn = warehouseReads
    posted = true
    warehouseRows = [newWarehouse]
    await page.getByRole('button', { name: '返回库存报表', exact: true }).click()
    await expect(page.getByText('CACHE-POSTED', { exact: true })).toBeVisible()
    await expect(navigator.getByText('新仓库', { exact: true })).toBeVisible()
    await expect(navigator.getByText('原仓库', { exact: true })).toHaveCount(0)
    expect(warehouseReads).toBe(locationReadsBeforeReturn + 1)
    await expect(input).toHaveValue('CACHE')
    expect(requests.length).toBe(before + 1)
    expect(requests.at(-1)?.p_material_code).toBe('CACHE')
    await page.screenshot({
      path: testInfo.outputPath('report-after-posting.png'),
      animations: 'disabled'
    })
  })
}

for (const kind of ['stock', 'movement', 'ledger', 'receipt-issue']) {
  test(`${kind}返回缓存报表时清除已删除仓库筛选`, async ({ page }) => {
    await installFixtures(page)
    const requests: Record<string, unknown>[] = []
    await page.route('**/rest/v1/rpc/wms_inventory_report_secure', (route) => {
      requests.push(route.request().postDataJSON())
      return route.fulfill({ json: { data: [], total: 0, navigation: [] } })
    })
    let warehouseRows = [
      { id: 'cached-warehouse-old', warehouse_code: 'CACHE-OLD', warehouse_name: '原仓库' }
    ]
    await page.route('**/rest/v1/mdm_warehouse?*', (route) =>
      route.fulfill({ json: warehouseRows })
    )
    await page.goto(
      `/tests/e2e/fixtures/wms-inventory-report.html?kind=${kind}&cached=true&authority=super`
    )
    const navigator = page.locator('.inventory-location-navigator')
    await navigator.getByRole('button', { name: '显示空位置', exact: true }).click()
    await navigator.getByText('原仓库', { exact: true }).click()
    await expect.poll(() => requests.at(-1)?.p_warehouse_id).toBe('cached-warehouse-old')
    await page.getByRole('button', { name: '前往出库作业', exact: true }).click()
    const beforeReturn = requests.length
    warehouseRows = [
      { id: 'cached-warehouse-new', warehouse_code: 'CACHE-NEW', warehouse_name: '新仓库' }
    ]
    await page.getByRole('button', { name: '返回库存报表', exact: true }).click()
    await expect(navigator.getByText('新仓库', { exact: true })).toBeVisible()
    await expect(navigator.getByText('原仓库', { exact: true })).toHaveCount(0)
    await expect(navigator.getByRole('button', { name: /全部仓库/ })).toHaveClass(/is-active/)
    await expect.poll(() => requests.at(-1)?.p_warehouse_id).toBeNull()
    expect(requests.length).toBe(beforeReturn + 1)
  })
}

test('保留仍存在的仓库筛选，手动刷新发现删除时仅重新查询一次', async ({ page }) => {
  await installFixtures(page)
  const requests: Record<string, unknown>[] = []
  await page.route('**/rest/v1/rpc/wms_inventory_report_secure', (route) => {
    requests.push(route.request().postDataJSON())
    return route.fulfill({ json: { data: [], total: 0, navigation: [] } })
  })
  let warehouseRows = [
    { id: 'cached-warehouse-old', warehouse_code: 'CACHE-OLD', warehouse_name: '原仓库' }
  ]
  await page.route('**/rest/v1/mdm_warehouse?*', (route) => route.fulfill({ json: warehouseRows }))
  await page.goto(
    '/tests/e2e/fixtures/wms-inventory-report.html?kind=stock&cached=true&authority=super'
  )
  const navigator = page.locator('.inventory-location-navigator')
  await navigator.getByRole('button', { name: '显示空位置', exact: true }).click()
  await navigator.getByText('原仓库', { exact: true }).click()
  await expect.poll(() => requests.at(-1)?.p_warehouse_id).toBe('cached-warehouse-old')
  await page.getByRole('button', { name: '前往出库作业', exact: true }).click()
  const beforeReturn = requests.length
  await page.getByRole('button', { name: '返回库存报表', exact: true }).click()
  await expect.poll(() => requests.length).toBe(beforeReturn + 1)
  expect(requests.at(-1)?.p_warehouse_id).toBe('cached-warehouse-old')
  const beforeManualRefresh = requests.length
  warehouseRows = [
    { id: 'cached-warehouse-new', warehouse_code: 'CACHE-NEW', warehouse_name: '新仓库' }
  ]
  await navigator.getByRole('button', { name: '刷新仓储位置', exact: true }).click()
  await expect(navigator.getByText('新仓库', { exact: true })).toBeVisible()
  await expect(navigator.getByRole('button', { name: /全部仓库/ })).toHaveClass(/is-active/)
  await expect.poll(() => requests.at(-1)?.p_warehouse_id).toBeNull()
  expect(requests.length).toBe(beforeManualRefresh + 1)
})
