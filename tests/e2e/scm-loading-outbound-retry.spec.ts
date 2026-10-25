import { expect, test, type Route } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(240_000)
test('装车出库库存重试、数量汇总与旧响应失效', async ({ page }, testInfo) => {
  const tenant = await prepareIsolatedSession(page)
  await page.route('**/rest/v1/sys_dictionary?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'display-document',
          value: 'document',
          label: '按单据',
          status: '1',
          sort: 1,
          dict_type_table: { code: 'commonDocumentDisplayMode' }
        },
        {
          id: 'display-line',
          value: 'line',
          label: '按明细',
          status: '1',
          sort: 2,
          dict_type_table: { code: 'commonDocumentDisplayMode' }
        }
      ]
    })
  )
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
          lines: [
            {
              line_id: 'line-a',
              source_document_id: 'notice-a',
              source_line_id: 'notice-line-a',
              material_id: 'material-a',
              material_code: 'M1',
              material_description: '测试出库物料',
              quantity: 10,
              unit_price: 0,
              tax_rate: 0
            }
          ]
        }
      ]
    })
  )
  let fail = true
  let hold = false
  const pending: Route[] = []
  const stocks = [
    {
      id: 'batch-a',
      tenant_id: tenant.id,
      material_id: 'material-a',
      warehouse_id: 'warehouse-a',
      project_id: 'project-a',
      quantity: 20,
      batch_no: 'BATCH-A',
      pack_id: 'pack-outbound-a',
      pack: { pack_no: 'PK-OUT-001' },
      zone_id: null,
      bin_id: null,
      warehouse: { warehouse_name: '测试仓库' },
      material: { serial_management_enabled: false }
    }
  ]
  await page.route('**/rest/v1/wms_inventory_batch?**', (route) => {
    const params = new URL(route.request().url()).searchParams
    expect(params.get('tenant_id')).toBe(`eq.${tenant.id}`)
    expect(params.get('project_id')).toBe('eq.project-a')
    if (hold) {
      hold = false
      pending.push(route)
      return
    }
    return fail
      ? route.fulfill({ status: 500, json: { code: 'XX000', message: 'technical stock failure' } })
      : route.fulfill({ json: stocks })
  })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`#${path}`)
  await expect(page.getByRole('heading', { name: '装车出库', exact: true })).toBeVisible({
    timeout: 120_000
  })
  if (!(await page.getByRole('radio', { name: '按明细', exact: true }).isVisible()))
    await page.getByRole('button', { name: '展开', exact: true }).click()
  await page.locator('.el-radio-button').filter({ hasText: '按明细' }).click()
  await expect(page.getByRole('radio', { name: '按明细', exact: true })).toBeChecked()
  const issue = page.getByRole('button', { name: '出库', exact: true })
  await expect(issue).toBeVisible({ timeout: 90_000 })
  const guide = page.getByText('知道了', { exact: true })
  if (await guide.isVisible()) await guide.click()
  await issue.click()
  const dialog = page.getByRole('dialog', { name: '销售出库 · LOAD-A', exact: true })
  await expect(dialog.getByText('现有库存加载失败，请重试', { exact: true })).toBeVisible()
  fail = false
  await dialog.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(dialog.getByText('BATCH-A', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('columnheader', { name: '包号', exact: true })).toBeAttached()
  await expect(dialog.getByText('PK-OUT-001', { exact: true })).toBeVisible()
  await dialog.locator('.el-checkbox[aria-label="选择当前行"]').click()
  await expect(dialog.getByRole('checkbox', { name: '选择当前行', exact: true })).toBeChecked()
  const quantity = dialog.getByRole('spinbutton', { name: '出库数量', exact: true })
  await quantity.fill('3')
  await quantity.press('Tab')
  await expect(dialog.getByText(/已选 1 个批次 · 本次出库 3/)).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('outbound-recovered.png'),
    animations: 'disabled'
  })
  await dialog.getByRole('button', { name: '关闭此对话框', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  hold = true
  await issue.click()
  await expect.poll(() => pending.length).toBe(1)
  await dialog.getByRole('button', { name: '关闭此对话框', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await issue.click()
  await expect(dialog.getByText('BATCH-A', { exact: true })).toBeVisible()
  await pending[0].fulfill({ json: stocks.map((stock) => ({ ...stock, batch_no: 'OLD-BATCH' })) })
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
  await expect(dialog.getByText('OLD-BATCH', { exact: true })).toHaveCount(0)
  await expect(dialog.getByText('BATCH-A', { exact: true })).toBeVisible()
  expect(errors).toEqual([])
})
