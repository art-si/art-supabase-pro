import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })

const otherTenant = {
  id: '22222222-2222-4222-8222-222222222222',
  tenant_code: 'OTHER',
  tenant_name: '其他工厂'
}

for (const menu of [
  {
    name: 'WmsTransfer',
    title: '调拨申请单',
    path: '/wms/transfer-business/transfer-request',
    list: 'wms_transfer_request_list'
  },
  {
    name: 'WmsDirectTransfer',
    title: '直接调拨单',
    path: '/wms/transfer-business/direct-transfer',
    list: 'wms_transfer_business_list'
  },
  {
    name: 'WmsStepTransfer',
    title: '分步调拨单',
    path: '/wms/transfer-business/step-transfer',
    list: 'wms_transfer_business_list'
  }
] as const) {
  test(`${menu.title}单据类型筛选跟随全部与指定租户范围`, async ({ page }) => {
    test.setTimeout(120_000)
    const ownTenant = await prepareIsolatedSession(page)
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.route('**/rest/v1/sys_tenant?*', (route) =>
      route.fulfill({ json: [ownTenant, otherTenant] })
    )
    await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
      route.fulfill({ json: [{ code: 'wms', name: '仓储管理', baseUrl: '/wms/' }] })
    )
    const menuId = `scope-${menu.name}`
    await page.route('**/rest/v1/sys_menu?*', (route) => route.fulfill({ json: { id: menuId } }))
    await mockApplicationMenus(page, {
      wms: [
        {
          id: menuId,
          parentId: null,
          name: menu.name,
          path: menu.path,
          component: menu.path,
          type: 'menu',
          sort: 1,
          meta: { title: menu.title, is_enable: true, is_hide: false, roles: [] }
        },
        {
          id: `${menuId}-view`,
          parentId: menuId,
          name: `${menu.name}:View`,
          path: '',
          component: '',
          type: 'button',
          sort: 1,
          meta: { title: '查看', is_enable: true, is_hide: false, roles: [] }
        }
      ]
    })
    const typeRows = [
      {
        id: 'own-shared-type',
        tenant_id: ownTenant.id,
        document_type_code: 'DT-SHARED',
        document_type_name: '标准调拨',
        menu_ids: [menuId],
        enabled: true
      },
      {
        id: 'other-shared-type',
        tenant_id: otherTenant.id,
        document_type_code: 'DT-SHARED',
        document_type_name: '标准调拨',
        menu_ids: [menuId],
        enabled: true
      },
      {
        id: 'other-only-type',
        tenant_id: otherTenant.id,
        document_type_code: 'DT-OTHER',
        document_type_name: '其他调拨',
        menu_ids: [menuId],
        enabled: true
      }
    ]
    const typeReads: Array<string | null> = []
    await page.route('**/rest/v1/mdm_document_type?*', (route) => {
      const tenantFilter = new URL(route.request().url()).searchParams.get('tenant_id')
      typeReads.push(tenantFilter)
      const tenantId = tenantFilter?.match(/^eq\.(.*)$/)?.[1]
      return route.fulfill({
        json: tenantId ? typeRows.filter((row) => row.tenant_id === tenantId) : typeRows
      })
    })
    const listReads: Array<{ scope: string | undefined; types: string | null }> = []
    await page.route(`**/rest/v1/${menu.list}?*`, (route) => {
      const params = new URL(route.request().url()).searchParams
      listReads.push({
        scope: route.request().headers()['x-art-tenant-scope'],
        types: params.get('document_type_id')
      })
      return route.fulfill({
        json: [],
        headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' }
      })
    })
    await page.goto(`#${menu.path}`)
    await expect(page.getByRole('heading', { name: menu.title, exact: true })).toBeVisible({
      timeout: 60_000
    })
    await expect.poll(() => typeReads.includes(null)).toBe(true)
    const typeSelect = page
      .locator('.art-table-query .el-form-item')
      .filter({ hasText: '单据类型' })
      .locator('.el-select')
    await typeSelect.click()
    await expect(page.getByRole('option', { name: 'DT-SHARED · 标准调拨' })).toHaveCount(1)
    await expect(page.getByRole('option', { name: 'DT-OTHER · 其他调拨' })).toBeVisible()
    await page.getByRole('option', { name: 'DT-SHARED · 标准调拨' }).click()
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await expect.poll(() => listReads.at(-1)?.types).toBe('in.(own-shared-type,other-shared-type)')
    expect(listReads.at(-1)?.scope).toBeFalsy()

    await page.getByRole('button', { name: /当前租户范围：/ }).click()
    await page.getByRole('menuitem', { name: /其他工厂/ }).click()
    await expect.poll(() => typeReads.includes(`eq.${otherTenant.id}`)).toBe(true)
    await expect.poll(() => listReads.at(-1)?.scope).toBe(otherTenant.id)
    await typeSelect.click()
    await expect(page.getByRole('option', { name: 'DT-SHARED · 标准调拨' })).toHaveCount(1)
    await expect(page.getByRole('option', { name: 'DT-OTHER · 其他调拨' })).toBeVisible()
    await page.getByRole('option', { name: 'DT-SHARED · 标准调拨' }).click()
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await expect.poll(() => listReads.at(-1)?.types).toBe('in.(other-shared-type)')
    expect(pageErrors).toEqual([])
  })
}
