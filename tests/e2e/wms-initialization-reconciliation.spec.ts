import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('初始化对账失败重试、签名余额、类别筛选和空态', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await prepareIsolatedSession(page)
  let fail = true
  let empty = false
  const types = ['stock', 'receivable', 'receivable', 'estimated_payable', 'estimated_payable']
  const amounts = [1000, 113, -22.6, 226, -11.3]
  await page.route('**/rest/v1/rpc/wms_initialization_reconciliation_secure', (route) => {
    if (fail)
      return route.fulfill({
        status: 400,
        json: { code: 'P0001', message: '测试读取失败，请重试' }
      })
    return route.fulfill({
      json: empty
        ? []
        : types.map((balanceType, index) => ({
            id: `test-${index}`,
            balance_type: balanceType,
            source_area: index === 0 ? 'stock' : index < 3 ? 'sales' : 'purchase',
            document_id: `document-${index}`,
            document_no: `INIT-${index}-期初对账单据`,
            status: 'approved',
            counterparty_name: index ? '测试往来单位-客户与供应商长名称验证' : null,
            material_code: 'MAT-01',
            material_name: '测试物料',
            warehouse_name: '测试仓库',
            bin_name: 'A-01',
            batch_no: 'LOT-01',
            quantity: index === 2 || index === 4 ? -2 : 10,
            unit_name: '件',
            amount: amounts[index],
            tax_amount: 0,
            total_amount: amounts[index],
            pushed: index !== 0
          }))
    })
  })
  await page.goto('/tests/e2e/fixtures/wms-document-serials.html?reconciliation=true', {
    waitUntil: 'domcontentloaded'
  })
  if (testInfo.project.name.includes('dark'))
    await page.evaluate(() => document.documentElement.classList.add('dark'))
  await expect(page.getByText('初始化对账加载失败', { exact: true })).toBeVisible({
    timeout: 60_000
  })
  expect(errors).toEqual([])
  fail = false
  await page.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(page.getByText('¥90.40', { exact: true })).toBeVisible()
  await expect(page.getByText('¥214.70', { exact: true })).toBeVisible()
  await expect(page.locator('td.opening-negative')).toHaveCount(8)
  expect(
    await page.locator('body').evaluate((node) => node.scrollWidth > window.innerWidth + 1)
  ).toBe(false)
  await page.screenshot({
    path: testInfo.outputPath('initialization-reconciliation.png'),
    animations: 'disabled'
  })
  await page.locator('.el-select__wrapper').click()
  await page.getByRole('option', { name: '期初库存', exact: true }).click()
  await expect(page.locator('.el-table__body tr')).toHaveCount(1)
  empty = true
  await page.getByRole('button', { name: '刷新对账', exact: true }).click()
  await expect(page.getByText('暂无期初数据', { exact: true })).toBeVisible()
})
