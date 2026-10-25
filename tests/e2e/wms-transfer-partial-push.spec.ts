import { expect, test } from '@playwright/test'
import { installFixtures, meta, tenantId } from './support/inventory-fixtures'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })

test('申请首行已处理时按单据仍可下推剩余明细', async ({ page }) => {
  test.setTimeout(90_000)
  await installFixtures(page)
  await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: false }))
  await page.route('**/rest/v1/sys_user?*', (route) =>
    route.fulfill({
      json: {
        id: 'transfer-user',
        auth_user_id: '705ddd8d-4959-4dc1-aeb0-08caed7ab51a',
        user_name: '普通仓储用户',
        user_type: '2',
        user_roles: ['R_USER'],
        status: '1',
        tenant_id: tenantId,
        tenant: { id: tenantId, tenant_code: 'DEMO', tenant_name: '示例工厂' }
      }
    })
  )
  await page.route('**/rpc/get_accessible_applications', (route) =>
    route.fulfill({
      json: [
        { code: 'platform', name: '平台', baseUrl: '/' },
        { code: 'wms', name: '仓储', baseUrl: '/wms/' }
      ]
    })
  )
  await mockApplicationMenus(page, {
    wms: [
      {
        id: 'request-menu',
        parentId: null,
        name: 'WmsTransfer',
        path: '/wms/transfer-business/transfer-request',
        component: '/wms/transfer-business/transfer-request',
        type: 'menu',
        sort: 1,
        meta: meta('调拨申请单')
      },
      ...['View', 'Push'].map((action) => ({
        id: `request-${action}`,
        parentId: 'request-menu',
        name: `WmsTransfer:${action}`,
        path: '',
        component: '',
        type: 'button',
        sort: 1,
        meta: meta(action)
      })),
      {
        id: 'direct-menu',
        parentId: null,
        name: 'WmsDirectTransfer',
        path: '/wms/transfer-business/direct-transfer',
        component: '/wms/transfer-business/direct-transfer',
        type: 'menu',
        sort: 2,
        meta: meta('直接调拨单')
      },
      ...['View', 'Create'].map((action) => ({
        id: `direct-${action}`,
        parentId: 'direct-menu',
        name: `WmsDirectTransfer:${action}`,
        path: '',
        component: '',
        type: 'button',
        sort: 1,
        meta: meta(action)
      }))
    ]
  })
  const requestRows = [10, 20].map((lineNo) => ({
    document_id: 'partial-request',
    line_id: `partial-line-${lineNo}`,
    line_no: lineNo,
    tenant_id: tenantId,
    organization_id: 'organization-one',
    document_no: 'DBSQ202610-001',
    document_type_id: 'request-type',
    document_type_name: '调拨申请',
    business_type_id: 'request-business',
    business_type_name: '转储申请',
    application_date: '2026-10-16',
    status: 'approved',
    pushed_document_id: lineNo === 10 ? 'existing-direct' : null,
    material_id: `material-${lineNo}`,
    material_code: `MAT-${lineNo}`,
    material_description: `测试物料-${lineNo}`,
    quantity: 1,
    base_quantity: 1,
    inventory_unit_id: 'unit-test',
    source_organization_id: 'organization-one',
    source_warehouse_id: 'source-warehouse',
    target_organization_id: 'organization-one',
    target_warehouse_id: 'target-warehouse'
  }))
  await page.route('**/rest/v1/wms_transfer_request_list?*', (route) => {
    const params = new URL(route.request().url()).searchParams
    const rows = params.has('pushed_document_id')
      ? [requestRows[1]]
      : params.has('material_code')
        ? [requestRows[0]]
        : requestRows
    return route.fulfill({
      json: rows,
      headers: {
        'content-range': `0-${rows.length - 1}/${rows.length}`,
        'access-control-expose-headers': 'content-range'
      }
    })
  })
  await page.goto('#/wms/transfer-business/transfer-request', {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.getByText('DBSQ202610-001', { exact: true })).toBeVisible({
    timeout: 60_000
  })
  await page.locator('.el-table__body tr').first().getByRole('button', { name: '更多操作' }).click()
  await page.getByRole('menuitem', { name: '下推调拨', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '下推调拨申请' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('下推全部未处理明细')
  await expect(dialog.getByRole('button', { name: '直接调拨' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: '调出在途' })).toHaveCount(0)
  await dialog.getByRole('button', { name: '关闭此对话框' }).click()
  await page.getByRole('button', { name: '展开', exact: true }).click()
  await page.getByPlaceholder('物料编码').fill('MAT-10')
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expect(page.getByText('DBSQ202610-001', { exact: true })).toBeVisible()
  await page.locator('.el-table__body tr').first().getByRole('button', { name: '更多操作' }).click()
  await page.getByRole('menuitem', { name: '下推调拨', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '下推调拨申请' })).toBeVisible()
})
