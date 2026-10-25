import { expect, test } from '@playwright/test'
import { installFixtures, meta } from './support/inventory-fixtures'
import { mockApplicationMenus } from './support/menu-rpc'
test.use({ storageState: { cookies: [], origins: [] } })
for (const [path, name, title, table, message] of [
  [
    'outbound-business/outbound-request',
    'WmsIssueRequest',
    '出库申请单',
    'wms_issue_request_list',
    '关联出库申请加载失败，请检查权限后重试。'
  ],
  [
    'initialization/initial-purchase-inbound',
    'WmsInitialPurchaseInbound',
    '期初采购入库单',
    'wms_purchase_document',
    '期初采购入库单加载失败，请刷新后重试'
  ],
  [
    'initialization/initial-purchase-return',
    'WmsInitialPurchaseReturn',
    '期初采购退料单',
    'wms_purchase_document',
    '期初采购退料单加载失败，请刷新后重试'
  ],
  [
    'initialization/initial-stock',
    'WmsInitialStock',
    '初始库存单',
    'wms_initial_stock_document',
    '初始库存单加载失败，请刷新后重试'
  ],
  [
    'initialization/initial-sales-outbound',
    'WmsInitialSalesOutbound',
    '期初销售出库单',
    'wms_sales_document',
    '期初销售出库单加载失败，请刷新后重试'
  ],
  [
    'initialization/initial-sales-return',
    'WmsInitialSalesReturn',
    '期初销售退货单',
    'wms_sales_document',
    '期初销售退货单加载失败，请刷新后重试'
  ],
  [
    'outbound-business/sales-return',
    'WmsSalesReturnDocument',
    '销售退货单',
    'wms_sales_document',
    '销售退货单加载失败，请刷新后重试'
  ]
]) {
  test(`${title}关联详情失败后刷新保留原单据请求`, async ({ page }) => {
    test.setTimeout(180_000)
    await installFixtures(page)
    await mockApplicationMenus(page, {
      wms: [
        {
          id: 'linked-menu',
          parentId: null,
          name,
          path: `/wms/${path}`,
          component: `/wms/${path}`,
          type: 'menu',
          sort: 1,
          meta: meta(title)
        },
        {
          id: 'linked-view',
          parentId: 'linked-menu',
          name: `${name}:View`,
          path: '',
          component: '',
          type: 'button',
          sort: 1,
          meta: meta('查看')
        }
      ]
    })
    await page.route('**/rpc/get_accessible_applications', (route) =>
      route.fulfill({
        json: [
          { code: 'platform', name: '平台', baseUrl: '/' },
          { code: 'wms', name: '仓储', baseUrl: '/wms/' }
        ]
      })
    )
    const requested: string[] = []
    let recovered = false
    let releaseLinkedResponse: () => void = () => {}
    const linkedResponseGate = new Promise<void>((resolve) => {
      releaseLinkedResponse = resolve
    })
    await page.route(`**/rest/v1/${table}?*`, async (route) => {
      const id = new URL(route.request().url()).searchParams.get('id')
      if (id !== 'eq.pending-linked-test')
        return route.fulfill({ json: [], headers: { 'content-range': '0-0/0' } })
      requested.push(id)
      if (recovered) {
        await linkedResponseGate
        return route.fulfill({
          json: {
            id: 'pending-linked-test',
            document_no: 'ISSUE-RECOVERED-001',
            request_type: 'project',
            application_date: '2026-10-07',
            status: 'draft',
            project_name: '重试验证项目'
          }
        })
      }
      return route.fulfill({ status: 400, json: { code: 'P0001', message: '模拟详情读取失败' } })
    })
    const linkedQuery =
      table === 'wms_issue_request_list'
        ? 'recordId=pending-linked-test&resourceType=wms_issue_request'
        : 'documentId=pending-linked-test'
    await page.goto(`#/wms/${path}?${linkedQuery}`, {
      waitUntil: 'domcontentloaded'
    })
    await expect(page.getByText(message, { exact: true })).toBeVisible({ timeout: 60_000 })
    await expect(page).toHaveURL(/(?:documentId|recordId)=pending-linked-test/)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByText(message, { exact: true })).toBeVisible({ timeout: 60_000 })
    expect(requested).toEqual(['eq.pending-linked-test', 'eq.pending-linked-test'])
    await expect(page).toHaveURL(/(?:documentId|recordId)=pending-linked-test/)
    if (table === 'wms_issue_request_list') {
      await page.getByRole('button', { name: '重新加载关联申请' }).click()
      await expect.poll(() => requested.length).toBe(3)
      await expect(page.getByText(message, { exact: true })).toBeVisible()
      await page.screenshot({
        path: test.info().outputPath('linked-request-retry.png'),
        animations: 'disabled'
      })
      recovered = true
      await page.route('**/rest/v1/wms_issue_request_line?*', (route) =>
        route.fulfill({ json: [] })
      )
      await page.route('**/rest/v1/wms_issue_request_allocation?*', (route) =>
        route.fulfill({ json: [] })
      )
      await page.getByRole('button', { name: '重新加载关联申请' }).click()
      await expect.poll(() => requested.length).toBe(4)
      await expect(page.getByText('正在加载关联出库申请…', { exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: '重新加载关联申请' })).toBeDisabled()
      releaseLinkedResponse()
      const detail = page.getByRole('dialog', { name: '领料申请详情' })
      await expect(detail).toBeVisible()
      await expect(detail).toContainText('ISSUE-RECOVERED-001')
      await expect(detail).toContainText('重试验证项目')
      await expect(detail).toContainText('2026-10-07')
      await expect(page.getByText(message, { exact: true })).toBeHidden()
      expect(requested).toHaveLength(4)
      await page.screenshot({
        path: test.info().outputPath('linked-request-recovered.png'),
        animations: 'disabled'
      })
    }
  })
}
