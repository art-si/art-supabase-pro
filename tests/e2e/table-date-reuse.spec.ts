import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

test('供应商日期保留精度，缺失日期不显示今天，列表状态可恢复', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const tenant = await prepareIsolatedSession(page)
  await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: false }))
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({ json: [{ code: 'mdm', name: '测试主数据', baseUrl: '/mdm/' }] })
  )
  const menu = {
    id: 'supplier-date-menu',
    parentId: null,
    name: 'MdmPurchaseSupplier',
    path: '/mdm/purchase-master/supplier',
    component: '/mdm/purchase-master/supplier',
    type: 'menu',
    sort: 1,
    meta: { title: '供应商', is_enable: true, is_hide: false, roles: [] }
  }
  await mockApplicationMenus(page, {
    mdm: [
      menu,
      {
        ...menu,
        id: 'supplier-date-view',
        parentId: menu.id,
        name: 'MdmPurchaseSupplier:View',
        type: 'button',
        path: '',
        component: ''
      }
    ]
  })
  let failure = false
  let empty = false
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let requested = false
  await page.route('**/rest/v1/mdm_supplier?*', async (route) => {
    requested = true
    await gate
    if (failure)
      return route.fulfill({ status: 403, json: { code: '42501', message: 'permission denied' } })
    const records = empty
      ? []
      : [
          {
            id: 'date-valid',
            supplier_code: 'DATE-01',
            supplier_name: '日期正常供应商',
            update_time: '2026-10-01T00:00:00Z'
          },
          {
            id: 'date-missing',
            supplier_code: 'DATE-02',
            supplier_name: '日期缺失供应商',
            update_time: null
          },
          {
            id: 'date-invalid',
            supplier_code: 'DATE-03',
            supplier_name: '日期异常供应商',
            update_time: 'invalid'
          }
        ].map((row) => ({ ...row, tenant_id: tenant.id, coordinate_system: 'wgs84' }))
    await route.fulfill({
      headers: {
        'content-range': records.length ? `0-${records.length - 1}/${records.length}` : '*/0',
        'access-control-expose-headers': 'content-range'
      },
      json: records
    })
  })
  await page.goto('#/mdm/purchase-master/supplier')
  await expect(page.getByRole('heading', { name: '供应商', exact: true })).toBeVisible({
    timeout: 60_000
  })
  await expect.poll(() => requested).toBe(true)
  const table = page.locator('.art-table-query')
  await expect(table.locator('[aria-busy="true"]').first()).toBeVisible()
  await page.screenshot({ path: info.outputPath('date-loading.png') })
  release()
  const valid = table.locator('.el-table__row').filter({ hasText: '日期正常供应商' })
  const missing = table.locator('.el-table__row').filter({ hasText: '日期缺失供应商' })
  const invalid = table.locator('.el-table__row').filter({ hasText: '日期异常供应商' })
  await expect(valid).toContainText('2026-10-01 08:00')
  await expect(missing).toContainText('--')
  await expect(invalid).toContainText('--')
  await expect(table.getByText('Invalid Date', { exact: true })).toHaveCount(0)
  await expect(table.getByText('invalid', { exact: true })).toHaveCount(0)
  await table.locator('.el-table__body-wrapper .el-scrollbar__wrap').evaluate((element) => {
    element.scrollLeft = element.scrollWidth
  })
  const displayedDate = valid.getByText('2026-10-01 08:00', { exact: true })
  await displayedDate.scrollIntoViewIfNeeded()
  await expect(displayedDate).toBeInViewport()
  await page.screenshot({ path: info.outputPath('date-populated.png') })
  failure = true
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expect(table.getByText('数据加载失败', { exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('date-error.png') })
  failure = false
  await table.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(valid).toContainText('2026-10-01 08:00')
  empty = true
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expect(table.locator('.el-table__row')).toHaveCount(0)
  await expect(table.locator('.art-empty-state')).toBeVisible()
  await page.screenshot({ path: info.outputPath('date-empty.png') })
  const width = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth
  }))
  expect(width.content).toBeLessThanOrEqual(width.viewport + 1)
  expect(errors).toEqual([])
})
