import { expect, test } from '@playwright/test'
import { installFixtures, meta, tenantId, warehouseId } from './support/inventory-fixtures'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

for (const source of [
  {
    title: '生产领料单',
    path: '/wms/production-inout/production-issue',
    routeName: 'WmsProductionIssue',
    table: 'wms_production_material_document',
    kind: 'issue',
    documentNo: 'TEST-SOURCE-ISSUE-001'
  },
  {
    title: '采购入库单',
    path: '/wms/inbound-business/purchase-inbound',
    routeName: 'WmsPurchaseInbound',
    table: 'wms_purchase_document',
    kind: 'purchase_inbound',
    documentNo: 'TEST-SOURCE-PURCHASE-001'
  },
  {
    title: '其他入库退回单',
    path: '/wms/inbound-business/other-inbound',
    routeName: 'WmsOtherInbound',
    table: 'wms_purchase_document',
    kind: 'other_return',
    documentNo: 'TEST-SOURCE-OTHER-RETURN-001'
  }
] as const) {
  test(`${source.title}来源链接打开对应详情`, async ({ page }, testInfo) => {
    await installFixtures(page)
    await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
      route.fulfill({
        json: [
          { code: 'platform', name: '平台', baseUrl: '/' },
          { code: 'wms', name: '仓储', baseUrl: '/wms/' }
        ]
      })
    )
    const menu = {
      id: `source-menu-${source.kind}`,
      parentId: null,
      name: source.routeName,
      path: source.path,
      component: source.path,
      type: 'menu',
      sort: 1,
      meta: meta(source.title)
    }
    await mockApplicationMenus(page, {
      wms: [
        menu,
        {
          id: `source-view-${source.kind}`,
          parentId: menu.id,
          name: `${source.routeName}:View`,
          path: '',
          component: '',
          type: 'button',
          sort: 1,
          meta: meta('查看')
        }
      ]
    })
    await page.route(`**/rest/v1/${source.table}?*`, (route) => {
      const isDetail =
        new URL(route.request().url()).searchParams.get('id') === 'eq.source-document-id'
      return route.fulfill({
        json: isDetail
          ? {
              id: 'source-document-id',
              tenant_id: tenantId,
              kind: source.kind,
              document_no: source.documentNo,
              document_type_id: 'source-document-type',
              business_type_id: 'source-business-type',
              organization_id: 'source-organization',
              business_date: '2026-10-19',
              accounting_date: '2026-10-19',
              warehouse_id: warehouseId,
              work_order_id: null,
              project_id: null,
              customer_id: null,
              supplier_id: null,
              purchaser_id: null,
              purchase_department_id: null,
              keeper_id: null,
              status: 'approved',
              material_status: 'pending',
              is_initialization: false,
              remark: '来源导航验证',
              lines: []
            }
          : [],
        headers: { 'content-range': isDetail ? '0-0/1' : '*/0' }
      })
    })
    if (source.kind === 'issue') {
      await page.route('**/rest/v1/wms_production_material_list?*', (route) =>
        route.fulfill({ json: [], headers: { 'content-range': '*/0' } })
      )
    } else {
      await page.route('**/rest/v1/wms_purchase_document_list?*', (route) =>
        route.fulfill({ json: [], headers: { 'content-range': '*/0' } })
      )
    }
    await page.goto(`#${source.path}?documentId=source-document-id`, {
      waitUntil: 'domcontentloaded'
    })
    const drawer = page.locator('.el-drawer:visible')
    await expect(drawer).toBeVisible({ timeout: 120_000 })
    await expect(drawer.getByText(source.documentNo, { exact: true }).first()).toBeVisible()
    await expect(page).not.toHaveURL(/documentId=source-document-id/)
    await drawer.screenshot({
      path: testInfo.outputPath(`${source.kind}-source-detail.png`),
      animations: 'disabled'
    })
  })
}
