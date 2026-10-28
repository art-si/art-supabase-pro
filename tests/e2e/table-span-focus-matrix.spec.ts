import { copyFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { installFixtures, meta } from './support/inventory-fixtures'
import { mockApplicationMenus } from './support/menu-rpc'
import { assertTableFocusContract } from './support/table-focus'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

// One route per span implementation. Shared workspaces use their real menu-aligned view entry.
const workspaces = [
  ['wms', 'adjustment-business/assembly', 'WmsAssembly', '库存组装'],
  ['wms', 'adjustment-business/adjustment', 'WmsAdjustment', '库存调整'],
  ['wms', 'count-business/count-gain', 'WmsCountGain', '盘盈单'],
  ['wms', 'count-business/count', 'WmsCount', '库存盘点'],
  ['wms', 'initialization/initial-sales-outbound', 'WmsInitialSalesOutbound', '期初销售出库单'],
  ['wms', 'initialization/initial-stock', 'WmsInitialStock', '初始库存单'],
  ['wms', 'production-inout/production-issue', 'WmsProductionIssue', '生产领料单'],
  ['wms', 'outbound-business/outbound-request', 'WmsIssueRequest', '出库申请单'],
  ['wms', 'transfer-business/transfer-request', 'WmsTransfer', '调拨申请单'],
  ['wms', 'transfer-business/direct-transfer', 'WmsDirectTransfer', '直接调拨单'],
  ['scm', 'sales-management/sales-order', 'ScmSalesOrder', '销售订单'],
  ['scm', 'purchase-management/purchase-order', 'ScmPurchaseOrder', '采购订单'],
  ['scm', 'sales-management/loading-outbound', 'ScmLoadingOutbound', '装车出库'],
  ['wms', 'inbound-business/purchase-inbound', 'WmsPurchaseInbound', '采购入库单'],
  ['wms', 'receipt-issue/receipt-inbound', 'WmsReceiptInbound', '收料入库']
] as const

for (const [application, path, name, title] of workspaces) {
  test(`${name} 专注模式保留合法空表工作区并可双路径退出`, async ({ page }, testInfo) => {
    await installFixtures(page)
    await page.route('**/rest/v1/rpc/get_table_column_runtime', (route) =>
      route.fulfill({ json: { enabled: false, profiles: [] } })
    )
    await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
      route.fulfill({
        json: [{ code: application, name: application.toUpperCase(), baseUrl: `/${application}/` }]
      })
    )
    const routePath = `/${application}/${path}`
    const menu = {
      id: `span-focus-${name}`,
      parentId: null,
      name,
      path: routePath,
      component: routePath,
      type: 'menu',
      sort: 1,
      meta: meta(title)
    }
    await mockApplicationMenus(page, {
      [application]: [
        menu,
        {
          ...menu,
          id: `${menu.id}-View`,
          parentId: menu.id,
          name: `${name}:View`,
          path: '',
          component: '',
          type: 'button'
        }
      ]
    })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`#${routePath}`, { waitUntil: 'domcontentloaded' })
    const query = page.locator('.art-table-query:visible')
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible({
      timeout: 60_000
    })
    const dismissGuide = page.getByRole('button', { name: '知道了', exact: true })
    await expect(dismissGuide).toBeVisible()
    await dismissGuide.click()
    await expect(dismissGuide).toBeHidden()
    await expect(query).toHaveCount(1)
    await expect(query.locator('.el-table')).toBeVisible()
    await expect(query.locator('.el-table__empty-block')).toBeVisible()
    await expect(page.locator('.el-alert--error:visible')).toHaveCount(0)
    await assertTableFocusContract(page, testInfo)
    expect(errors).toEqual([])

    const evidence = join('.artifacts', 'quality-audit', 'span-focus-output', 'acknowledged')
    await mkdir(evidence, { recursive: true })
    await copyFile(
      testInfo.outputPath('table-focus.png'),
      join(evidence, `${name}-${testInfo.project.name}.png`)
    )
  })
}
