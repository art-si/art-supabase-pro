import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { mockApplicationMenus } from './support/menu-rpc'
import { installFixtures, meta, tenantId } from './support/inventory-fixtures'

const scenarios = [
  ['WmsInitialSalesOutbound', 'initialization/initial-sales-outbound', '期初销售出库单'],
  ['WmsInitialSalesReturn', 'initialization/initial-sales-return', '期初销售退货单'],
  ['WmsInitialPurchaseInbound', 'initialization/initial-purchase-inbound', '期初采购入库单'],
  ['WmsInitialPurchaseReturn', 'initialization/initial-purchase-return', '期初采购退料单'],
  ['WmsPurchaseInbound', 'inbound-business/purchase-inbound', '采购入库单'],
  ['WmsPurchaseReturn', 'inbound-business/purchase-return', '采购退货单'],
  ['WmsOtherInbound', 'inbound-business/other-inbound', '其他入库单'],
  [
    'WmsEntrustedProcessingInbound',
    'inbound-business/entrusted-processing-inbound',
    '受托加工材料入库单'
  ],
  [
    'WmsEntrustedProcessingReturn',
    'inbound-business/entrusted-processing-return',
    '受托加工材料退料单'
  ],
  ['WmsSalesOutbound', 'outbound-business/sales-outbound', '销售出库单'],
  ['WmsSalesReturnDocument', 'outbound-business/sales-return', '销售退货单'],
  ['WmsOtherOutbound', 'outbound-business/other-outbound', '其他出库单'],
  ['WmsProductionIssue', 'production-inout/production-issue', '生产领料单'],
  ['WmsProductionReturn', 'production-inout/production-return', '生产退料单'],
  ['WmsFinishedInbound', 'production-inout/finished-inbound', '完工入库单'],
  ['WmsFinishedReturn', 'production-inout/finished-return', '完工退库单'],
  ['WmsTransfer', 'transfer-business/transfer-request', '调拨申请单']
] as const

for (const [name, path, title] of scenarios) {
  test(`${title}按自身菜单与多关联单据带入三个默认字段`, async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    await installFixtures(page)
    const root = {
      id: 'wms-root',
      parentId: null,
      name: 'WmsWarehouseManagement',
      path: '/wms',
      component: '/index/index',
      type: 'folder',
      sort: 1,
      meta: meta('WMS仓储管理')
    }
    const menu = {
      id: `menu-${name}`,
      parentId: root.id,
      name,
      path,
      component: `/wms/${path}`,
      type: 'menu',
      sort: 1,
      meta: meta(title)
    }
    const buttons = ['View', 'Add'].map((action) => ({
      id: `${menu.id}-${action}`,
      parentId: menu.id,
      name: `${name}:${action}`,
      path: '',
      component: '',
      type: 'button',
      sort: 1,
      meta: meta(action)
    }))
    await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
      route.fulfill({
        json: [
          { code: 'platform', name: '测试平台', baseUrl: '/' },
          { code: 'wms', name: 'WMS仓储管理', baseUrl: '/wms/' }
        ]
      })
    )
    await mockApplicationMenus(page, { wms: [root, menu, ...buttons] })
    await page.route('**/rest/v1/sys_menu?*', (route) => {
      expect(new URL(route.request().url()).searchParams.get('name')).toBe(`eq.${name}`)
      return route.fulfill({ json: { id: menu.id } })
    })
    const organizationId = 'default-inventory-org'
    await page.route('**/rest/v1/mdm_organization?*', (route) =>
      route.fulfill({
        json: [
          {
            id: organizationId,
            tenant_id: tenantId,
            parent_id: null,
            organization_code: 'INV-DEFAULT',
            organization_name: '本菜单默认库存组织',
            organization_type: 'company',
            status: '1',
            sort: 1,
            is_system: false
          }
        ]
      })
    )
    await page.route('**/rest/v1/wms_inventory_initialization?*', (route) =>
      route.fulfill({
        json: [
          {
            organization_id: organizationId,
            enabled_on: path.startsWith('initialization/') ? '2026-10-06' : '2026-10-01',
            is_default: true,
            initialization_closed_at: path.startsWith('initialization/')
              ? null
              : '2026-10-02T00:00:00Z'
          }
        ]
      })
    )
    const documentTypeId = `document-${name}`
    let scopedDocumentRead = false
    let scopedBusinessRead = false
    await page.route('**/rest/v1/mdm_document_type?*', (route) => {
      const params = new URL(route.request().url()).searchParams
      if (params.has('tenant_id')) {
        expect(params.get('tenant_id')).toBe(`eq.${tenantId}`)
        scopedDocumentRead = true
      }
      if (params.has('menu_ids')) expect(params.get('menu_ids')).toBe(`cs.{${menu.id}}`)
      return route.fulfill({
        json: [
          {
            id: documentTypeId,
            tenant_id: tenantId,
            menu_ids: [menu.id],
            document_type_code: name,
            document_type_name: '本菜单默认单据',
            is_default: true,
            enabled: true
          }
        ]
      })
    })
    await page.route('**/rest/v1/mdm_business_type?*', (route) => {
      const params = new URL(route.request().url()).searchParams
      if (params.has('tenant_id')) {
        expect(params.get('tenant_id')).toBe(`eq.${tenantId}`)
        scopedBusinessRead = true
      }
      const business = {
        id: `business-${name}`,
        tenant_id: tenantId,
        document_type_id: 'primary-other-document',
        document_type_ids: ['primary-other-document', documentTypeId],
        menu_ids: [menu.id],
        business_type_code: name,
        business_type_name: '本菜单默认业务',
        is_default: true,
        enabled: true
      }
      if (params.has('document_type_ids')) {
        expect(params.get('document_type_ids')).toBe(`cs.{${documentTypeId}}`)
        expect(params.get('menu_ids')).toBe(`cs.{${menu.id}}`)
        return route.fulfill({ json: [business] })
      }
      return route.fulfill({
        json: [
          business,
          {
            ...business,
            id: 'wrong-menu-business',
            menu_ids: ['other-menu'],
            business_type_name: '其他菜单业务'
          }
        ]
      })
    })
    await page.goto(`#/wms/${path}`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: `新增${title}`, exact: true }).click({ timeout: 90_000 })
    const drawer = page.locator('.el-drawer:visible').first()
    await expect(drawer.getByText('本菜单默认库存组织').first()).toBeVisible()
    await expect(drawer.getByText('本菜单默认单据').first()).toBeVisible()
    await expect(drawer.getByText('本菜单默认业务').first()).toBeVisible()
    expect(scopedDocumentRead).toBe(true)
    expect(scopedBusinessRead).toBe(true)
    await expect(drawer.getByText('其他菜单业务')).toHaveCount(0)
    if (
      ['WmsPurchaseInbound', 'WmsSalesOutbound', 'WmsProductionIssue', 'WmsTransfer'].includes(name)
    ) {
      const visualDir = join(process.cwd(), '.artifacts', 'wms-visual', testInfo.project.name)
      mkdirSync(visualDir, { recursive: true })
      await page.screenshot({ path: join(visualDir, `${name}-master-data.png`), fullPage: true })
    }
  })
}
