import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)
test('批量出库按装车行和库存批次分配、阻止共享库存超量并生成流水', async ({ page }, testInfo) => {
  const tenant = await prepareIsolatedSession(page)
  await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: false }))
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({ json: [{ code: 'scm', name: '测试供应链', baseUrl: '/scm/' }] })
  )
  const path = '/scm/sales-management/loading-outbound'
  const menu = {
    id: 'outbound-retry',
    parentId: null,
    name: 'ScmLoadingOutbound',
    path,
    component: path,
    type: 'menu',
    sort: 1,
    meta: { title: '装车出库', is_enable: true, is_hide: false, roles: [] }
  }
  await mockApplicationMenus(page, {
    scm: [
      menu,
      ...['ScmLoadingOutbound:View', 'ScmLoadingOutbound:Issue', 'WmsStockOperation:Issue'].map(
        (name, index) => ({
          ...menu,
          id: `outbound-${index}`,
          parentId: menu.id,
          name,
          path: '',
          component: '',
          type: 'button'
        })
      )
    ]
  })
  await page.route('**/rest/v1/scm_sales_document?**', (route) =>
    route.fulfill({
      json: [
        {
          id: 'loading-a',
          tenant_id: tenant.id,
          kind: 'loading',
          document_no: 'LOAD-A',
          status: 'loaded',
          project_id: 'project-a',
          details: {},
          project: { project_name: '测试项目' },
          customer: { customer_name: '测试客户' },
          lines: [10, 8].map((quantity, index) => ({
            line_id: `line-${index}`,
            source_document_id: 'notice-a',
            source_line_id: 'notice-line-a',
            material_id: 'material-a',
            material_code: 'M1',
            material_description: '测试出库物料',
            quantity,
            unit_price: 0,
            tax_rate: 0
          }))
        }
      ]
    })
  )
  await page.route('**/rest/v1/wms_inventory_batch?**', (route) =>
    route.fulfill({
      json: [
        {
          id: 'batch-a',
          tenant_id: tenant.id,
          material_id: 'material-a',
          warehouse_id: 'warehouse-a',
          project_id: 'project-a',
          quantity: 12,
          batch_no: 'BATCH-A',
          warehouse: { warehouse_name: '测试仓库' },
          material: { serial_management_enabled: false }
        }
      ]
    })
  )
  const posted: Array<{
    p_items: Array<{
      loading_id: string
      loading_line_id: string
      batch_id: string
      quantity: number
      remark: string
      request_key: string
    }>
  }> = []
  await page.route('**/rest/v1/rpc/scm_post_loading_outbound_secure', (route) => {
    posted.push(route.request().postDataJSON())
    return route.fulfill({ json: [] })
  })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`#${path}`)
  await expect(page.getByRole('heading', { name: '装车出库', exact: true })).toBeVisible({
    timeout: 90000
  })
  const guide = page.getByText('知道了', { exact: true })
  if (await guide.isVisible()) await guide.click()
  if (!(await page.getByRole('radio', { name: '按明细', exact: true }).isVisible()))
    await page.getByRole('button', { name: '展开', exact: true }).click()
  await page.locator('.el-radio-button').filter({ hasText: '按明细' }).click()
  const rows = page.locator('.el-table__body-wrapper tbody tr')
  await expect(rows).toHaveCount(2)
  await rows.nth(0).getByRole('checkbox').locator('..').click()
  await rows.nth(1).getByRole('checkbox').locator('..').click()
  await page.getByRole('button', { name: '批量出库', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '批量销售出库 · 2 条明细', exact: true })
  await expect(dialog).toBeVisible()
  const stocks = dialog.locator('.el-table__body-wrapper tbody tr')
  await expect(stocks).toHaveCount(2)
  await stocks.nth(0).getByRole('checkbox').locator('..').click()
  await stocks.nth(1).getByRole('checkbox').locator('..').click()
  const quantities = dialog.getByRole('spinbutton', { name: '出库数量', exact: true })
  await expect(quantities.nth(0)).toHaveValue('10.000')
  await expect(quantities.nth(1)).toHaveValue('2.000')
  await quantities.nth(1).fill('4')
  await quantities.nth(1).press('Tab')
  await dialog.getByRole('button', { name: '执行出库', exact: true }).click()
  await expect(
    page.getByText('本次出库数量不能超过装车明细剩余数量或同批次可用库存', { exact: true })
  ).toBeVisible()
  expect(posted).toHaveLength(0)
  await quantities.nth(1).fill('2')
  await quantities.nth(1).press('Tab')
  await dialog.getByRole('textbox', { name: '出库备注', exact: true }).nth(0).fill('分批发货')
  await page.screenshot({
    path: testInfo.outputPath('bulk-outbound-batches.png'),
    animations: 'disabled'
  })
  await dialog.getByRole('button', { name: '执行出库', exact: true }).click()
  await expect.poll(() => posted.length).toBe(1)
  expect(
    posted[0].p_items.map(({ loading_line_id, quantity, batch_id }) => ({
      loading_line_id,
      quantity,
      batch_id
    }))
  ).toEqual([
    { loading_line_id: 'line-0', quantity: 10, batch_id: 'batch-a' },
    { loading_line_id: 'line-1', quantity: 2, batch_id: 'batch-a' }
  ])
  expect(posted[0].p_items[0].remark).toBe('分批发货')
  expect(posted[0].p_items.every((item) => item.request_key.length === 36)).toBe(true)
  await expect(dialog).not.toBeVisible()
  await page.getByRole('switch', { name: '进入专注模式' }).locator('..').click()
  await expect(page.locator('.business-workspace-header')).not.toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.business-workspace-header')).toBeVisible()
  await page.getByRole('switch', { name: '进入专注模式' }).locator('..').click()
  await page.getByRole('button', { name: /退出专注/ }).click()
  await expect(page.locator('.business-workspace-header')).toBeVisible()
  expect(errors).toEqual([])
})
