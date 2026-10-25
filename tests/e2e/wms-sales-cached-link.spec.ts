import { expect, test } from '@playwright/test'
import { installFixtures, meta, tenantId } from './support/inventory-fixtures'
import { mockApplicationMenus } from './support/menu-rpc'
import { mockInventoryOrganizations } from './support/inventory-organization'

test.use({ storageState: { cookies: [], origins: [] } })
test.describe.configure({ timeout: 180_000 })
for (const [path, name, title, kind] of [
  [
    'initialization/initial-sales-outbound',
    'WmsInitialSalesOutbound',
    '期初销售出库单',
    'initial_outbound'
  ],
  [
    'initialization/initial-sales-return',
    'WmsInitialSalesReturn',
    '期初销售退货单',
    'initial_return'
  ],
  ['outbound-business/sales-return', 'WmsSalesReturnDocument', '销售退货单', 'return'],
  ['outbound-business/other-outbound', 'WmsOtherOutbound', '其他出库退回单', 'other_return'],
  [
    'initialization/initial-purchase-inbound',
    'WmsInitialPurchaseInbound',
    '期初采购入库单',
    'initial_inbound'
  ],
  [
    'initialization/initial-purchase-return',
    'WmsInitialPurchaseReturn',
    '期初采购退料单',
    'initial_return'
  ]
]) {
  test(`${title}缓存页面再次关联打开不同单据`, async ({ page }) => {
    test.setTimeout(180_000)
    await installFixtures(page)
    await page.route('**/rpc/current_is_super', (route) => route.fulfill({ json: false }))
    await page.route('**/rest/v1/sys_user?*', (route) =>
      route.fulfill({
        json: {
          id: 'wms-test-user',
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
    await mockApplicationMenus(page, {
      wms: [
        ...[
          [name, path, title],
          ['WmsInitializationClose', 'initialization/close', '结束初始化']
        ].flatMap(([routeName, routePath, label]) => [
          {
            id: routeName,
            parentId: null,
            name: routeName,
            path: `/wms/${routePath}`,
            component: `/wms/${routePath}`,
            type: 'menu',
            sort: 1,
            meta: { ...meta(label), keepAlive: true }
          },
          {
            id: `${routeName}-view`,
            parentId: routeName,
            name: `${routeName}:View`,
            path: '',
            component: '',
            type: 'button',
            sort: 1,
            meta: meta('查看')
          }
        ])
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
    const requests: string[] = []
    await mockInventoryOrganizations(
      page,
      () => [
        {
          id: 'sales-linked-org',
          tenant_id: tenantId,
          organization_code: 'LINK-SALES',
          organization_name: '销售采购关联测试组织',
          organization_type: 'company',
          status: '1'
        }
      ],
      () => [
        {
          organization_id: 'sales-linked-org',
          enabled_on: '2026-10-05',
          is_default: true,
          initialization_closed_at: null
        }
      ]
    )
    let releaseHeldRead: (() => void) | undefined
    const heldRead = new Promise<void>((resolve) => {
      releaseHeldRead = resolve
    })
    const table = name.includes('Purchase') ? 'wms_purchase_document' : 'wms_sales_document'
    await page.route(`**/rest/v1/${table}?*`, async (route) => {
      const query = new URL(route.request().url()).searchParams
      const id = query.get('id')
      if (
        !id &&
        query.get('organization_id') === 'eq.sales-linked-org' &&
        query.get('status') === 'neq.approved'
      ) {
        expect(query.get('tenant_id')).toBe(`eq.${tenantId}`)
        return route.fulfill({
          json: [{ id: 'sales-linked-a', document_no: 'SALES-LINK-A', status: 'submitted', kind }]
        })
      }
      if (!id?.startsWith('eq.sales-linked-')) return route.fulfill({ json: [] })
      requests.push(id)
      if (id === 'eq.sales-linked-c') await heldRead
      const suffix = id.endsWith('-a') ? 'A' : 'B'
      return route.fulfill({
        json: {
          id: id.slice(3),
          tenant_id: tenantId,
          organization_id: 'sales-linked-org',
          document_no: `SALES-LINK-${suffix}`,
          kind,
          status: 'submitted',
          business_date: '2026-10-04',
          accounting_date: '2026-10-04',
          is_initialization: true,
          currency_code: 'CNY',
          exchange_rate: 1,
          remark: `单据${suffix}独立备注`,
          organization: { organization_name: '销售关联组织', organization_code: 'LINK-SALES' },
          lines: []
        }
      })
    })
    await page.route('**/rest/v1/sys_menu?*', (route) => route.fulfill({ json: { id: name } }))
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const detail = page.getByRole('dialog', { name: `${title}详情`, exact: true })
    for (const suffix of ['a', 'b']) {
      if (suffix === 'a' && kind !== 'other_return') {
        await page.goto('#/wms/initialization/close', { waitUntil: 'domcontentloaded' })
        await page.getByRole('button', { name: '查看待处理单据', exact: true }).click()
        const pending = page.getByRole('dialog', { name: '待处理初始化单据', exact: true })
        await expect(pending.locator('td').getByText('SALES-LINK-A', { exact: true })).toBeVisible()
        const open = pending.getByRole('button', { name: '查看单据', exact: true })
        await open.scrollIntoViewIfNeeded()
        await open.click()
        await expect(pending).toBeHidden()
      } else
        await page.goto(`#/wms/${path}?documentId=sales-linked-${suffix}`, {
          waitUntil: 'domcontentloaded'
        })
      await expect(detail).toBeVisible({ timeout: 60_000 })
      await expect(page).toHaveURL(new RegExp(`#/wms/${path}$`))
      await expect(
        detail.getByText(`SALES-LINK-${suffix.toUpperCase()}`, { exact: true }).first()
      ).toBeVisible()
      await expect(
        detail.getByText(`单据${suffix.toUpperCase()}独立备注`, { exact: true })
      ).toBeAttached()
      await expect(detail.getByRole('button', { name: '保存', exact: true })).toHaveCount(0)
      await page.keyboard.press('Escape')
      await expect(detail).toBeHidden()
      await page.goto('#/wms/initialization/close', { waitUntil: 'domcontentloaded' })
      await expect(page.getByRole('heading', { name: '结束初始化', exact: true })).toBeVisible()
    }
    await page.goto(`#/wms/${path}?documentId=sales-linked-c`, { waitUntil: 'domcontentloaded' })
    await expect.poll(() => requests.length).toBe(3)
    await page.goto('#/wms/initialization/close', { waitUntil: 'domcontentloaded' })
    const heldResponse = page.waitForResponse(
      (response) => new URL(response.url()).searchParams.get('id') === 'eq.sales-linked-c'
    )
    releaseHeldRead?.()
    await (await heldResponse).finished()
    await expect(detail).toBeHidden()
    await expect(page).toHaveURL(/#\/wms\/initialization\/close$/)
    expect(requests).toEqual(['eq.sales-linked-a', 'eq.sales-linked-b', 'eq.sales-linked-c'])
    expect(errors).toEqual([])
  })
}
