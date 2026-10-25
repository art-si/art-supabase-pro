import { mockInventoryOrganizations } from './support/inventory-organization'
import { expect, test } from '@playwright/test'
import { installFixtures, meta, tenantId } from './support/inventory-fixtures'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })
for (const authority of ['super', 'ordinary', 'viewonly']) {
  test(`${authority}结束初始化待处理单据读取失败重试、长编号与空态`, async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    await installFixtures(page)
    if (authority !== 'super') {
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
    }
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
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
      id: 'close-menu',
      parentId: root.id,
      name: 'WmsInitializationClose',
      path: 'initialization/close',
      component: '/wms/initialization/close',
      type: 'menu',
      sort: 1,
      meta: meta('结束初始化')
    }
    await mockApplicationMenus(page, {
      wms: [
        root,
        menu,
        {
          id: 'close-view',
          parentId: menu.id,
          name: 'WmsInitializationClose:View',
          path: '',
          component: '',
          type: 'button',
          sort: 1,
          meta: meta('查看')
        },
        ...(authority === 'viewonly' ? [] : ['Close', 'Reopen']).map((action) => ({
          id: `close-${action}`,
          parentId: menu.id,
          name: `WmsInitializationClose:${action}`,
          path: '',
          component: '',
          type: 'button',
          sort: 1,
          meta: meta(action)
        }))
      ]
    })
    await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
      route.fulfill({
        json: [
          { code: 'platform', name: '测试平台', baseUrl: '/' },
          { code: 'wms', name: 'WMS仓储管理', baseUrl: '/wms/' }
        ]
      })
    )
    let organizationRows = () => [
      {
        id: 'close-org',
        tenant_id: tenantId,
        organization_code: 'INV-001',
        organization_name: '测试库存组织',
        organization_type: 'company',
        status: '1'
      }
    ]
    await mockInventoryOrganizations(
      page,
      () => organizationRows(),
      () => []
    )
    await mockInventoryOrganizations(
      page,
      () => organizationRows(),
      () => [
        {
          organization_id: 'close-org',
          enabled_on: '2026-10-05',
          is_default: true,
          initialization_closed_at: null
        }
      ]
    )
    let failRead = true
    let empty = false
    let reads = 0
    await page.route('**/rest/v1/wms_initial_stock_document?*', (route) => {
      const query = new URL(route.request().url()).searchParams
      if (query.get('organization_id') !== 'eq.close-org') return route.fulfill({ json: [] })
      reads += 1
      // 平台全部租户读取由请求范围层移除租户过滤，单据仍按所选组织限定。
      expect(query.get('tenant_id')).toBe(authority === 'super' ? null : `eq.${tenantId}`)
      expect(query.get('organization_id')).toBe('eq.close-org')
      expect(query.get('status')).toBe('neq.approved')
      if (failRead)
        return route.fulfill({ status: 400, json: { code: 'P0001', message: '测试读取失败' } })
      return route.fulfill({
        json: empty
          ? []
          : [
              {
                id: 'pending-test',
                document_no: 'INIT-TEST-20261005-非常长的可识别期初库存单编号-00001',
                status: 'submitted'
              }
            ]
      })
    })
    let writes = 0
    await page.route('**/rest/v1/rpc/wms_change_initialization_status_secure', (route) => {
      writes += 1
      return route.fulfill({ json: null })
    })
    await page.goto('#/wms/initialization/close', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: '查看待处理单据', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '待处理初始化单据' })
    await expect(dialog.getByText('单据排查失败', { exact: true })).toBeVisible()
    await page.screenshot({
      path: testInfo.outputPath('wms-close-read-error.png'),
      animations: 'disabled'
    })
    failRead = false
    await dialog.getByRole('button', { name: '重新加载', exact: true }).click()
    await expect(dialog.getByText('已提交', { exact: true })).toBeVisible()
    await expect(
      dialog.getByText('INIT-TEST-20261005-非常长的可识别期初库存单编号-00001', { exact: true })
    ).toBeVisible()
    if (authority === 'super')
      await expect(dialog.getByRole('button', { name: '查看单据', exact: true })).toBeAttached()
    else {
      await expect(dialog.getByRole('button', { name: '查看单据', exact: true })).toHaveCount(0)
      await expect(dialog.getByText('无查看权限', { exact: true })).toBeAttached()
    }
    expect(await dialog.evaluate((node) => node.scrollWidth > node.clientWidth + 1)).toBe(false)
    await page.screenshot({
      path: testInfo.outputPath('wms-close-pending.png'),
      animations: 'disabled'
    })
    const viewDocument = dialog.getByRole('button', { name: '查看单据', exact: true })
    if (authority === 'super') {
      await viewDocument.scrollIntoViewIfNeeded()
      await expect(viewDocument).toBeVisible()
      if (testInfo.project.name === 'mobile-390') {
        await expect(dialog.locator('td.el-table-fixed-column--right')).toHaveCount(0)
        await page.screenshot({
          path: testInfo.outputPath('wms-close-pending-operation.png'),
          animations: 'disabled'
        })
      }
    }
    empty = true
    await dialog.getByRole('button', { name: '刷新列表', exact: true }).click()
    await expect(dialog.getByText('没有待处理初始化单据', { exact: true })).toBeVisible()
    await page.screenshot({
      path: testInfo.outputPath('wms-close-empty.png'),
      animations: 'disabled'
    })
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    expect(reads).toBeGreaterThanOrEqual(3)
    expect(writes).toBe(0)
    if (authority === 'viewonly') {
      await expect(page.getByRole('button', { name: '结束初始化', exact: true })).toHaveCount(0)
      await mockInventoryOrganizations(
        page,
        () => organizationRows(),
        () => [
          {
            organization_id: 'close-org',
            enabled_on: '2026-10-05',
            is_default: true,
            initialization_closed_at: '2026-10-06T00:00:00Z'
          }
        ]
      )
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expect(page.getByText('测试库存组织', { exact: true }).first()).toBeVisible({
        timeout: 60_000
      })
      await expect(page.getByRole('button', { name: '反初始化', exact: true })).toHaveCount(0)
      expect(writes).toBe(0)
      expect(errors).toEqual([])
      return
    }
    let initialized = false
    let rejectClose = true
    let rejectReopen = true
    const transitions: unknown[] = []
    await mockInventoryOrganizations(
      page,
      () => organizationRows(),
      () => [
        {
          organization_id: 'close-org',
          enabled_on: '2026-10-05',
          is_default: true,
          initialization_closed_at: initialized ? '2026-10-05T01:02:03Z' : null
        }
      ]
    )
    await page.route('**/rpc/wms_change_initialization_status_secure', (route) => {
      const payload = route.request().postDataJSON()
      transitions.push(payload)
      if (payload.p_action === 'close' && rejectClose)
        return route.fulfill({
          status: 400,
          json: { code: 'P0001', message: '测试初始化结束校验失败' }
        })
      if (payload.p_action === 'reopen' && rejectReopen)
        return route.fulfill({
          status: 400,
          json: { code: 'P0001', message: '测试反初始化暂时无法办理' }
        })
      initialized = payload.p_action === 'close'
      return route.fulfill({ json: null })
    })
    await page.getByRole('button', { name: '结束初始化', exact: true }).click()
    const closeConfirm = page.getByRole('dialog', { name: '结束初始化', exact: true })
    await closeConfirm.getByRole('button', { name: '取消', exact: true }).click()
    expect(transitions).toHaveLength(0)
    await page.getByRole('button', { name: '结束初始化', exact: true }).click()
    await closeConfirm.getByRole('button', { name: '确定结束初始化', exact: true }).click()
    await expect(dialog.getByText('测试初始化结束校验失败', { exact: true })).toBeVisible()
    await expect(dialog.getByText('没有待处理初始化单据', { exact: true })).toHaveCount(0)
    const previousReads = reads
    await dialog.getByRole('button', { name: '刷新列表', exact: true }).click()
    await expect.poll(() => reads).toBeGreaterThan(previousReads)
    await expect(dialog.getByText('测试初始化结束校验失败', { exact: true })).toBeVisible()
    await page.screenshot({
      path: testInfo.outputPath('close-rejected-no-documents.png'),
      animations: 'disabled'
    })
    await page.keyboard.press('Escape')
    rejectClose = false
    await page.getByRole('button', { name: '结束初始化', exact: true }).click()
    await closeConfirm.getByRole('button', { name: '确定结束初始化', exact: true }).click()
    const reopen = page.getByRole('button', { name: '反初始化', exact: true })
    await expect(reopen).toBeVisible()
    await reopen.click()
    const reopenConfirm = page.getByRole('dialog', { name: '反初始化', exact: true })
    await reopenConfirm.getByRole('button', { name: '确定反初始化', exact: true }).click()
    await expect(page.getByText('测试反初始化暂时无法办理', { exact: true })).toBeVisible()
    await expect(reopen).toBeVisible()
    await page.screenshot({
      path: testInfo.outputPath('initialization-reopen-rejected.png'),
      animations: 'disabled'
    })
    rejectReopen = false
    await reopen.click()
    await reopenConfirm.getByRole('button', { name: '确定反初始化', exact: true }).click()
    await expect(page.getByRole('button', { name: '结束初始化', exact: true })).toBeVisible()
    expect(transitions).toEqual(
      ['close', 'close', 'reopen', 'reopen'].map((action) => ({
        p_organization_id: 'close-org',
        p_action: action
      }))
    )
    expect(errors).toEqual([])
    const organizationIds = ['close-org-one', 'close-org-two']
    const closedIds = new Set<string>()
    const isolatedTransitions: unknown[] = []
    organizationRows = () =>
      organizationIds.map((id, index) => ({
        id,
        tenant_id: tenantId,
        organization_code: `CLOSE-00${index + 1}`,
        organization_name: `独立初始化组织 ${index + 1}`,
        organization_type: 'company',
        status: '1'
      }))
    await mockInventoryOrganizations(
      page,
      () => organizationRows(),
      () => []
    )
    await mockInventoryOrganizations(
      page,
      () => organizationRows(),
      () =>
        organizationIds.map((id) => ({
          organization_id: id,
          enabled_on: '2026-10-05',
          is_default: id === organizationIds[0],
          initialization_closed_at: closedIds.has(id) ? '2026-10-06T00:00:00Z' : null
        }))
    )
    await page.route('**/rpc/wms_change_initialization_status_secure', (route) => {
      const payload = route.request().postDataJSON()
      isolatedTransitions.push(payload)
      if (payload.p_action === 'close') closedIds.add(payload.p_organization_id)
      else closedIds.delete(payload.p_organization_id)
      return route.fulfill({ json: null })
    })
    await page.reload()
    for (const index of [1, 2]) {
      const row = page.locator('.el-table__body tr').filter({ hasText: `独立初始化组织 ${index}` })
      await row.getByRole('button', { name: '结束初始化', exact: true }).click()
      await closeConfirm.getByRole('button', { name: '确定结束初始化', exact: true }).click()
      await expect(row.getByRole('button', { name: '反初始化', exact: true })).toBeVisible()
      expect(isolatedTransitions.at(-1)).toEqual({
        p_organization_id: organizationIds[index - 1],
        p_action: 'close'
      })
    }
    for (const index of [1, 2]) {
      const row = page.locator('.el-table__body tr').filter({ hasText: `独立初始化组织 ${index}` })
      await row.getByRole('button', { name: '反初始化', exact: true }).click()
      await reopenConfirm.getByRole('button', { name: '确定反初始化', exact: true }).click()
      await expect(row.getByRole('button', { name: '结束初始化', exact: true })).toBeVisible()
      expect(isolatedTransitions.at(-1)).toEqual({
        p_organization_id: organizationIds[index - 1],
        p_action: 'reopen'
      })
      if (index === 1) {
        const other = page.locator('.el-table__body tr').filter({ hasText: '独立初始化组织 2' })
        await expect(other.getByRole('button', { name: '反初始化', exact: true })).toBeVisible()
        await other.locator('td').nth(2).scrollIntoViewIfNeeded()
        await page.screenshot({
          path: testInfo.outputPath('two-organizations-isolated-status.png'),
          animations: 'disabled'
        })
      }
    }
    expect(isolatedTransitions).toHaveLength(4)
  })
}
