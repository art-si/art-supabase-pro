import { expect, test } from '@playwright/test'
import { installFixtures, meta, tenantId } from './support/inventory-fixtures'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })
for (const authority of ['workflow', 'viewonly', 'submitonly', 'approveonly']) {
  test(`${authority}普通用户初始库存两单提交流程权限与失败重试`, async ({ page }, testInfo) => {
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
    const actions =
      authority === 'workflow'
        ? ['View', 'Submit', 'Approve']
        : authority === 'viewonly'
          ? ['View']
          : ['View', authority === 'submitonly' ? 'Submit' : 'Approve']
    await mockApplicationMenus(page, {
      wms: [
        {
          id: 'stock-menu',
          parentId: null,
          name: 'WmsInitialStock',
          path: '/wms/initialization/initial-stock',
          component: '/wms/initialization/initial-stock',
          type: 'menu',
          sort: 1,
          meta: meta('初始库存单')
        },
        ...actions.map((action) => ({
          id: `stock-${action}`,
          parentId: 'stock-menu',
          name: `WmsInitialStock:${action}`,
          path: '',
          component: '',
          type: 'button',
          sort: 1,
          meta: meta(action)
        }))
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
    const states = new Map([
      ['stock-flow-1', 'draft'],
      ['stock-flow-2', authority === 'workflow' ? 'draft' : 'submitted']
    ])
    await page.route('**/rest/v1/wms_initial_stock_document?*', (route) => {
      expect(new URL(route.request().url()).searchParams.get('tenant_id')).toBe(`eq.${tenantId}`)
      return route.fulfill({
        json: [1, 2].map((n) => ({
          id: `stock-flow-${n}`,
          tenant_id: tenantId,
          document_no: `INITIAL-FLOW-${n}`,
          status: states.get(`stock-flow-${n}`),
          business_date: '2026-10-05',
          accounting_date: '2026-10-05',
          currency_code: 'CNY',
          lines: []
        })),
        headers: { 'content-range': '0-1/2', 'access-control-expose-headers': 'content-range' }
      })
    })
    let rejectWrite = true
    const writes: Array<{ p_document_id: string; p_action: string }> = []
    await page.route('**/rpc/wms_change_initial_stock_status_secure', (route) => {
      const payload = route.request().postDataJSON()
      writes.push(payload)
      if (rejectWrite)
        return route.fulfill({ status: 400, json: { code: 'P0001', message: '测试期初流程失败' } })
      states.set(payload.p_document_id, payload.p_action === 'submit' ? 'submitted' : 'approved')
      return route.fulfill({ json: null })
    })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('#/wms/initialization/initial-stock', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('INITIAL-FLOW-1', { exact: true })).toBeVisible({ timeout: 60_000 })
    for (const n of [1, 2]) {
      const row = page.locator('.el-table__body tr').filter({ hasText: `INITIAL-FLOW-${n}` })
      const more = row.getByRole('button', { name: '更多操作', exact: true })
      if (authority !== 'workflow') {
        const allowed =
          (authority === 'submitonly' && n === 1) || (authority === 'approveonly' && n === 2)
        await expect(more).toHaveCount(allowed ? 1 : 0)
        if (allowed) {
          await more.click()
          const items = page.locator('.el-dropdown-menu:visible').getByRole('menuitem')
          await expect(items).toHaveCount(1)
          await items.click()
          await page
            .locator('.el-message-box')
            .getByRole('button', { name: '取消', exact: true })
            .click()
        }
        continue
      }
      for (const [action, label, status] of [
        ['submit', '提交', '已提交'],
        ['approve', '审核入账', '已审核']
      ]) {
        const open = async () => {
          await more.click()
          await page
            .getByRole('menuitem', {
              name: action === 'submit' ? '提交单据' : '审核入账',
              exact: true
            })
            .click()
        }
        const confirm = page.locator('.el-message-box')
        const before = writes.length
        await open()
        await expect(confirm).toContainText(`INITIAL-FLOW-${n}`)
        if (action === 'approve')
          await expect(confirm).toContainText('审核后将生成即时库存和库存流水')
        await confirm.getByRole('button', { name: '取消', exact: true }).click()
        expect(writes).toHaveLength(before)
        rejectWrite = true
        await open()
        await confirm.getByRole('button', { name: `确定${label}`, exact: true }).click()
        await expect(page.getByText('测试期初流程失败', { exact: true }).first()).toBeVisible()
        rejectWrite = false
        await open()
        await confirm.getByRole('button', { name: `确定${label}`, exact: true }).click()
        await expect(row.getByText(status, { exact: true })).toBeVisible()
        expect(writes.slice(before)).toEqual([
          { p_document_id: `stock-flow-${n}`, p_action: action },
          { p_document_id: `stock-flow-${n}`, p_action: action }
        ])
      }
      await expect(more).toHaveCount(0)
    }
    expect(writes).toHaveLength(authority === 'workflow' ? 8 : 0)
    expect(errors).toEqual([])
    await page
      .locator('.el-table__body tr')
      .first()
      .getByText(authority === 'workflow' ? '已审核' : '暂存', { exact: true })
      .scrollIntoViewIfNeeded()
    await page.screenshot({
      path: testInfo.outputPath('initial-stock-workflow.png'),
      animations: 'disabled'
    })
  })
}
