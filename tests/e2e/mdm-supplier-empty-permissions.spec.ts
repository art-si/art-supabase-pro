import { expect, test } from '@playwright/test'
import { prepareAppearance } from './support/appearance'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })

for (const canAdd of [false, true]) {
  test(`供应商空态与当前账号的可用操作一致（${canAdd ? '可新增' : '只读'}）`, async ({ page }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 320, height: 700 })
    await prepareAppearance(page, { theme: 'light', boxBorderMode: true })
    const tenant = await prepareIsolatedSession(page, {
      platformSuper: false,
      tenantId: '11111111-1111-4111-8111-111111111111'
    })
    const path = '/mdm/purchase-master/supplier'
    const menu = {
      id: 'mdm-purchase-supplier',
      parentId: null,
      name: 'MdmPurchaseSupplier',
      path,
      component: `${path}/index`,
      type: 'menu',
      sort: 1,
      meta: { title: '供应商', is_enable: true, is_hide: false, roles: [] }
    }
    await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
      route.fulfill({ json: [{ code: 'mdm', name: 'MDM主数据', baseUrl: '/mdm/' }] })
    )
    await mockApplicationMenus(page, {
      mdm: [
        menu,
        ...['View', ...(canAdd ? ['Add'] : [])].map((action) => ({
          ...menu,
          id: `supplier-${action}`,
          parentId: menu.id,
          name: `MdmPurchaseSupplier:${action}`,
          type: 'button',
          path: '',
          component: ''
        }))
      ]
    })
    let hasSuppliers = false
    await page.route('**/rest/v1/mdm_supplier?*', (route) => {
      const request = route.request()
      expect(request.method()).toBe('GET')
      const params = new URL(request.url()).searchParams
      expect(params.get('tenant_id')).toBe(`eq.${tenant.id}`)
      const noMatches = !hasSuppliers || params.has('or')
      return route.fulfill({
        json: noMatches
          ? []
          : [
              {
                id: '11111111-1111-4111-8111-111111111112',
                tenant_id: tenant.id,
                supplier_code: 'SUP-VIEW-001',
                supplier_name: '华东采购测试供应商'
              }
            ],
        headers: {
          'content-range': noMatches ? '*/0' : '0-0/1',
          'access-control-expose-headers': 'content-range'
        }
      })
    })
    const initialList = page.waitForResponse(
      (response) => response.url().includes('/rest/v1/mdm_supplier?') && response.ok(),
      { timeout: 90_000 }
    )
    await page.goto(`#${path}`, { waitUntil: 'commit' })
    await initialList
    const workspace = page.locator('.purchase-supplier-page')
    const supplier = workspace.getByText('SUP-VIEW-001', { exact: true })
    const add = workspace.getByRole('button', { name: '新增供应商', exact: true })
    const search = workspace.getByPlaceholder('编码、名称、联系人或地址')
    const query = workspace.getByRole('button', { name: '查询', exact: true })
    const empty = workspace.locator('.art-table-query .art-empty-state')
    await expect(empty).toContainText('暂无供应商', { timeout: 90_000 })
    await expect(add).toHaveCount(canAdd ? 1 : 0)
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: width === 320 ? 700 : 900 })
      await expect(empty).not.toContainText('左侧')
      if (canAdd) await expect(empty).toContainText('新增供应商')
      else {
        await expect(empty).not.toContainText('新增供应商')
        await expect(empty).toContainText('资料录入后')
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    }

    await page.setViewportSize({ width: 320, height: 700 })
    await search.fill('QA-NOT-FOUND')
    await expect(empty).toContainText('暂无供应商')
    hasSuppliers = true
    await query.click()
    await expect(empty).toContainText('未找到匹配的供应商')
    await expect(empty).toContainText('重置查询条件')
    await expect(empty).not.toContainText('新增供应商')

    await workspace.getByRole('button', { name: '重置', exact: true }).click()
    await expect(supplier).toBeVisible()
  })
}
