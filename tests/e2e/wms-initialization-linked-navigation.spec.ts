import { expect, test } from '@playwright/test'
import { installFixtures, meta, tenantId } from './support/inventory-fixtures'
import { mockApplicationMenus } from './support/menu-rpc'
import { mockInventoryOrganizations } from './support/inventory-organization'

test.use({ storageState: { cookies: [], origins: [] } })

for (const allowCreate of [false, true]) {
  test(`普通用户${allowCreate ? '有新增权限' : '只读'}从待处理列表打开原初始库存单详情并返回`, async ({
    page
  }, testInfo) => {
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
    const menus = [
      ['close-menu', 'WmsInitializationClose', 'initialization/close', '结束初始化'],
      ['stock-menu', 'WmsInitialStock', 'initialization/initial-stock', '初始库存单']
    ].flatMap(([id, name, path, title]) => [
      {
        id,
        parentId: null,
        name,
        path: `/wms/${path}`,
        component: `/wms/${path}`,
        type: 'menu',
        sort: 1,
        meta: { ...meta(title), keepAlive: true }
      },
      {
        id: `${id}-view`,
        parentId: id,
        name: `${name}:View`,
        path: '',
        component: '',
        type: 'button',
        sort: 1,
        meta: meta('查看')
      }
    ])
    if (allowCreate)
      menus.push({
        id: 'stock-add',
        parentId: 'stock-menu',
        name: 'WmsInitialStock:Add',
        path: '',
        component: '',
        type: 'button',
        sort: 2,
        meta: meta('新增')
      })
    await mockApplicationMenus(page, { wms: menus })
    await page.route('**/rpc/get_accessible_applications', (route) =>
      route.fulfill({
        json: [
          { code: 'platform', name: '平台', baseUrl: '/' },
          { code: 'wms', name: '仓储', baseUrl: '/wms/' }
        ]
      })
    )
    await mockInventoryOrganizations(
      page,
      () => [
        {
          id: 'linked-org',
          tenant_id: tenantId,
          organization_code: 'LINK-ORG',
          organization_name: '关联测试库存组织',
          organization_type: 'company',
          status: '1'
        }
      ],
      () => [
        {
          organization_id: 'linked-org',
          enabled_on: '2026-10-05',
          is_default: true,
          initialization_closed_at: null
        }
      ]
    )
    await page.route('**/rest/v1/sys_menu?*', (route) =>
      route.fulfill({ json: { id: 'stock-menu' } })
    )
    const detailRequests: string[] = []
    await page.route('**/rest/v1/wms_initial_stock_document?*', (route) => {
      const query = new URL(route.request().url()).searchParams
      if (query.get('id') === 'eq.linked-stock') {
        detailRequests.push(query.get('id')!)
        return route.fulfill({
          json: {
            id: 'linked-stock',
            tenant_id: tenantId,
            organization_id: 'linked-org',
            document_no: 'INIT-LINKED-0001',
            business_date: '2026-10-04',
            accounting_date: '2026-10-04',
            status: 'submitted',
            remark: '关联详情测试备注',
            currency_code: 'CNY',
            amount_entry_enabled: false,
            organization: {
              id: 'linked-org',
              tenant_id: tenantId,
              organization_code: 'LINK-ORG',
              organization_name: '关联测试库存组织'
            },
            lines: []
          }
        })
      }
      if (query.get('organization_id') === 'eq.linked-org') {
        expect(query.get('tenant_id')).toBe(`eq.${tenantId}`)
        return route.fulfill({
          json: [{ id: 'linked-stock', document_no: 'INIT-LINKED-0001', status: 'submitted' }]
        })
      }
      return route.fulfill({ json: [], headers: { 'content-range': '0-0/0' } })
    })
    await page.route('**/rest/v1/wms_purchase_document?*', (route) => route.fulfill({ json: [] }))
    await page.route('**/rest/v1/wms_sales_document?*', (route) => route.fulfill({ json: [] }))
    let writes = 0
    await page.route('**/rpc/wms_*', (route) => {
      writes += 1
      return route.fulfill({ json: null })
    })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('#/wms/initialization/close', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: '查看待处理单据', exact: true }).click()
    const pending = page.getByRole('dialog', { name: '待处理初始化单据', exact: true })
    await expect(pending.locator('td').getByText('INIT-LINKED-0001', { exact: true })).toBeVisible()
    const open = pending.getByRole('button', { name: '查看单据', exact: true })
    await open.scrollIntoViewIfNeeded()
    await open.click()
    const detail = page.getByRole('dialog', { name: '初始库存单详情', exact: true })
    await expect(detail).toBeVisible({ timeout: 60_000 })
    await expect(page).toHaveURL(/#\/wms\/initialization\/initial-stock$/)
    await expect(pending).toBeHidden()
    await expect(detail.getByText('INIT-LINKED-0001', { exact: true }).first()).toBeVisible()
    await expect(detail.getByText('关联详情测试备注', { exact: true })).toBeVisible()
    await expect(detail.getByRole('button', { name: '保存', exact: true })).toHaveCount(0)
    await expect(detail.getByText(/当前租户没有关联/)).toHaveCount(0)
    await expect(detail.getByText('暂无物料明细', { exact: true })).toBeAttached()
    await expect(detail.getByText('该单据尚未记录物料明细。', { exact: true })).toBeAttached()
    await expect(detail.getByText(/从物料编码中多选后/)).toHaveCount(0)
    expect(detailRequests).toEqual(['eq.linked-stock'])
    await page.screenshot({
      path: testInfo.outputPath('linked-stock-detail.png'),
      animations: 'disabled'
    })
    const scroll = detail.locator('.art-drawer__scrollbar > .el-scrollbar__wrap')
    await scroll.evaluate((node) => {
      node.scrollTop = node.scrollHeight
    })
    await expect(detail.getByText('关联详情测试备注', { exact: true })).toBeVisible()
    expect(
      await scroll.evaluate((node) => node.scrollHeight - node.clientHeight - node.scrollTop)
    ).toBeLessThanOrEqual(2)
    await page.screenshot({
      path: testInfo.outputPath('linked-stock-detail-bottom.png'),
      animations: 'disabled'
    })
    await page.keyboard.press('Escape')
    await expect(detail).toBeHidden()
    await page.goBack({ waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/#\/wms\/initialization\/close$/)
    await page.getByRole('button', { name: '查看待处理单据', exact: true }).click()
    await expect(pending.locator('td').getByText('INIT-LINKED-0001', { exact: true })).toBeVisible()
    await open.scrollIntoViewIfNeeded()
    await open.click()
    await expect(detail).toBeVisible({ timeout: 10_000 })
    expect(detailRequests).toEqual(['eq.linked-stock', 'eq.linked-stock'])
    await page.keyboard.press('Escape')
    await expect(detail).toBeHidden()
    await page.goto('#/wms/initialization/initial-stock', { waitUntil: 'domcontentloaded' })
    const createButton = page.getByRole('button', { name: '新增初始库存单', exact: true })
    if (allowCreate) {
      await createButton.click()
      const create = page.getByRole('dialog', { name: '新增初始库存单', exact: true })
      await expect(create.getByText(/当前租户没有关联/)).toBeVisible()
      await expect(create.getByText('尚未选择物料', { exact: true })).toBeAttached()
      await expect(create.getByText(/从物料编码中多选后/)).toBeAttached()
      await create.getByRole('button', { name: '取消', exact: true }).click()
      await expect(create).toBeHidden()
    } else await expect(createButton).toHaveCount(0)
    expect(writes).toBe(0)
    expect(errors).toEqual([])
  })
}
