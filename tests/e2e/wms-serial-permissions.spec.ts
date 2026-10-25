import { expect, test } from '@playwright/test'
import { installFixtures, meta, tenantId } from './support/inventory-fixtures'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })
for (const authority of ['viewonly', 'reserve', 'bind', 'all']) {
  test(`${authority}普通用户序列号操作权限与状态限制`, async ({ page }, testInfo) => {
    await installFixtures(page)
    await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
      route.fulfill({
        json: [
          { code: 'platform', name: '测试平台', baseUrl: '/' },
          { code: 'wms', name: 'WMS仓储管理', baseUrl: '/wms/' }
        ]
      })
    )
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
    const actions = [
      'View',
      ...(authority === 'reserve' || authority === 'all' ? ['Reserve'] : []),
      ...(authority === 'bind' || authority === 'all' ? ['Bind'] : [])
    ]
    const menu = {
      id: 'serial-menu',
      parentId: null,
      name: 'WmsSerialTrace',
      path: '/wms/inventory-trace/serial-trace',
      component: '/wms/inventory-trace/serial-trace',
      type: 'menu',
      sort: 1,
      meta: { ...meta('序列号追溯'), roles: ['R_USER'] }
    }
    await mockApplicationMenus(page, {
      wms: [
        menu,
        ...actions.map((action) => ({
          id: `serial-${action}`,
          parentId: menu.id,
          name: `WmsSerialTrace:${action}`,
          path: '',
          component: '',
          type: 'button',
          sort: 1,
          meta: { ...meta(action), roles: ['R_USER'] }
        }))
      ]
    })
    const rows = ['eligible', 'reserved', 'no-context', 'out', 'pending'].map((kind) => ({
      id: `serial-${kind}`,
      tenant_id: tenantId,
      serial_no: `TEST-${kind}`,
      material_id: 'material-test',
      material: { material_code: 'TEST-MAT', material_name: '测试追溯物料' },
      status: kind === 'out' ? 'out' : kind === 'pending' ? 'pending_in' : 'in_stock',
      batch_id: kind === 'no-context' ? null : 'batch-test',
      work_order_id: kind === 'no-context' ? null : 'order-test',
      reserved_work_order_id: kind === 'reserved' ? 'order-test' : null
    }))
    const serialReads: string[] = []
    await page.route('**/rest/v1/wms_serial_number?*', (route) => {
      serialReads.push(route.request().url())
      return route.fulfill({
        json: rows,
        headers: { 'content-range': '0-4/5', 'access-control-expose-headers': 'content-range' }
      })
    })
    await page.goto('#/wms/inventory-trace/serial-trace')
    const eligible = page.locator('.el-table__body tr').filter({ hasText: 'TEST-eligible' })
    await expect(eligible).toBeVisible()
    for (const kind of ['eligible', 'reserved', 'no-context', 'out', 'pending']) {
      const row = page.locator('.el-table__body tr').filter({ hasText: `TEST-${kind}` })
      await expect(row.getByRole('button', { name: '追溯', exact: true })).toBeEnabled()
      const reserve = row.getByRole('button', {
        name: kind === 'reserved' ? '释放预留' : '预留 SN',
        exact: true
      })
      const bind = row.getByRole('button', { name: '绑定子件', exact: true })
      if (actions.includes('Reserve')) {
        if (kind === 'eligible' || kind === 'reserved') await expect(reserve).toBeEnabled()
        else await expect(reserve).toBeDisabled()
      } else await expect(reserve).toHaveCount(0)
      if (actions.includes('Bind')) {
        if (kind === 'no-context') await expect(bind).toBeDisabled()
        else await expect(bind).toBeEnabled()
      } else await expect(bind).toHaveCount(0)
    }
    expect(serialReads.length).toBeGreaterThan(0)
    for (const url of serialReads)
      expect(new URL(url).searchParams.get('tenant_id')).toBe(`eq.${tenantId}`)
    if (actions.includes('Reserve')) {
      await eligible.getByRole('button', { name: '预留 SN', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: '预留关键件 SN', exact: true })
      await expect(dialog).toBeVisible()
      await dialog.getByRole('button', { name: '取消', exact: true }).click()
      await expect(dialog).toBeHidden()
      await page
        .locator('.el-table__body tr')
        .filter({ hasText: 'TEST-reserved' })
        .getByRole('button', { name: '释放预留', exact: true })
        .click()
      const confirmation = page.getByRole('dialog', { name: '释放 SN 预留', exact: true })
      await expect(confirmation).toBeVisible()
      await confirmation.getByRole('button', { name: '取消', exact: true }).click()
      await expect(confirmation).toBeHidden()
    }
    if (actions.includes('Bind')) {
      await eligible.getByRole('button', { name: '绑定子件', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: '绑定装配子件', exact: true })
      await expect(dialog).toBeVisible()
      await dialog.getByRole('button', { name: '取消', exact: true }).click()
      await expect(dialog).toBeHidden()
    }
    await eligible.getByRole('button', { name: '追溯', exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({
      path: testInfo.outputPath('serial-ordinary-permissions.png'),
      animations: 'disabled'
    })
  })
}
