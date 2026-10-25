import { mockInventoryOrganizations } from './support/inventory-organization'
import { expect, test } from '@playwright/test'
import { installFixtures, meta, tenantId } from './support/inventory-fixtures'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })
for (const authority of ['super', 'ordinary', 'viewonly']) {
  test(`${authority}库存启用日期校验、取消、重新打开与提交失败恢复`, async ({ page }, testInfo) => {
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
      id: 'enable-menu',
      parentId: root.id,
      name: 'WmsInventoryEnable',
      path: 'initialization/enable-inventory',
      component: '/wms/initialization/enable-inventory',
      type: 'menu',
      sort: 1,
      meta: meta('启用库存')
    }
    await mockApplicationMenus(page, {
      wms: [
        root,
        menu,
        ...(authority === 'viewonly' ? ['View'] : ['View', 'Enable', 'Disable']).map((action) => ({
          id: `enable-${action}`,
          parentId: menu.id,
          name: `WmsInventoryEnable:${action}`,
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
        id: 'enable-org',
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
    let writes = 0
    let rejectWrite = true
    const payloads: unknown[] = []
    await page.route('**/rest/v1/rpc/wms_set_inventory_enabled_secure', (route) => {
      writes += 1
      payloads.push(route.request().postDataJSON())
      if (rejectWrite) {
        return route.fulfill({
          status: 400,
          json: { code: 'P0001', message: '测试库存组织暂时无法启用，请重试' }
        })
      }
      return route.fulfill({ json: null })
    })
    await page.goto('#/wms/initialization/enable-inventory', { waitUntil: 'domcontentloaded' })
    const enable = page.getByRole('button', { name: '启用', exact: true })
    if (authority === 'viewonly') {
      await expect(page.getByText('测试库存组织', { exact: true }).first()).toBeVisible({
        timeout: 60_000
      })
      await expect(enable).toHaveCount(0)
      await mockInventoryOrganizations(
        page,
        () => organizationRows(),
        () => [
          {
            organization_id: 'enable-org',
            enabled_on: '2026-10-06',
            is_default: false,
            initialization_closed_at: null
          }
        ]
      )
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expect(page.getByText('测试库存组织', { exact: true }).first()).toBeVisible({
        timeout: 60_000
      })
      await expect(page.getByRole('button', { name: '反启用', exact: true })).toHaveCount(0)
      await expect(page.getByRole('button', { name: '设为默认', exact: true })).toHaveCount(0)
      await page.screenshot({
        path: testInfo.outputPath('ordinary-viewonly-enabled.png'),
        animations: 'disabled'
      })
      expect(writes).toBe(0)
      expect(errors).toEqual([])
      return
    }
    await enable.click()
    const dialog = page.getByRole('dialog', { name: '设置库存启用日期' })
    await expect(dialog).toBeVisible()
    const date = dialog.getByRole('combobox').first()
    await expect(date).toHaveValue(/\d{4}-\d{2}-\d{2}/)
    await date.fill('')
    await dialog.getByRole('button', { name: '确定', exact: true }).click()
    await expect(dialog.locator('.el-form-item__error')).toHaveText('请选择启用日期')
    await date.press('Escape')
    expect(writes).toBe(0)
    await page.screenshot({
      path: testInfo.outputPath('wms-enable-validation.png'),
      animations: 'disabled'
    })
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await expect(dialog).toBeHidden()
    await enable.click()
    await expect(dialog).toBeVisible()
    await expect(date).toHaveValue(/\d{4}-\d{2}-\d{2}/)
    await expect(dialog.locator('.el-form-item__error')).toHaveCount(0)
    const overflow = await dialog.evaluate((node) => node.scrollWidth > node.clientWidth + 1)
    expect(overflow).toBe(false)
    await page.screenshot({
      path: testInfo.outputPath('wms-enable-reopened.png'),
      animations: 'disabled'
    })
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    expect(writes).toBe(0)
    await enable.click()
    await expect(dialog).toBeVisible()
    const enabledOn = await date.inputValue()
    const confirm = dialog.getByRole('button', { name: '确定', exact: true })
    await confirm.click()
    await expect(page.getByText('测试库存组织暂时无法启用，请重试', { exact: true })).toBeVisible()
    await expect(dialog).toBeVisible()
    await expect(confirm).toBeEnabled()
    await expect(date).toHaveValue(enabledOn)
    expect(writes).toBe(1)
    await page.screenshot({
      path: testInfo.outputPath('wms-enable-submit-error.png'),
      animations: 'disabled'
    })
    rejectWrite = false
    await confirm.click()
    await expect(dialog).toBeHidden()
    expect(writes).toBe(2)
    expect(payloads).toEqual(
      [1, 2].map(() => ({
        p_organization_ids: ['enable-org'],
        p_enabled_on: enabledOn,
        p_is_default: true
      }))
    )
    expect(errors).toEqual([])
    let defaultSet = false
    let rejectDefault = true
    const defaultWrites: unknown[] = []
    await mockInventoryOrganizations(
      page,
      () => organizationRows(),
      () => [
        {
          organization_id: 'enable-org',
          enabled_on: enabledOn,
          is_default: defaultSet,
          initialization_closed_at: null
        }
      ]
    )
    await page.route('**/rpc/wms_set_default_inventory_org_secure', (route) => {
      defaultWrites.push(route.request().postDataJSON())
      if (rejectDefault)
        return route.fulfill({
          status: 400,
          json: { code: 'P0001', message: '测试默认组织设置失败' }
        })
      defaultSet = true
      return route.fulfill({ json: null })
    })
    await page.reload()
    const setDefault = page.getByRole('button', { name: '设为默认', exact: true })
    await setDefault.click()
    await expect(page.getByText('测试默认组织设置失败', { exact: false }).first()).toBeVisible()
    await expect(setDefault).toBeEnabled()
    await page.screenshot({
      path: testInfo.outputPath('default-organization-rejected.png'),
      animations: 'disabled'
    })
    rejectDefault = false
    await setDefault.click()
    await expect(setDefault).toHaveCount(0)
    expect(defaultWrites).toEqual([
      { p_organization_id: 'enable-org' },
      { p_organization_id: 'enable-org' }
    ])
    let disabled = false
    let rejectDisable = true
    const disableWrites: unknown[] = []
    await mockInventoryOrganizations(
      page,
      () => organizationRows(),
      () =>
        disabled
          ? []
          : [
              {
                organization_id: 'enable-org',
                enabled_on: enabledOn,
                is_default: true,
                initialization_closed_at: null
              }
            ]
    )
    await page.route('**/rpc/wms_set_inventory_enabled_secure', (route) => {
      disableWrites.push(route.request().postDataJSON())
      if (rejectDisable)
        return route.fulfill({
          status: 400,
          json: { code: 'P0001', message: '测试组织已有初始库存单，不能反启用' }
        })
      disabled = true
      return route.fulfill({ json: null })
    })
    const disable = page.getByRole('button', { name: '反启用', exact: true })
    await disable.click()
    const confirmation = page.getByRole('dialog', { name: '反启用库存', exact: true })
    await confirmation.getByRole('button', { name: '取消', exact: true }).click()
    expect(disableWrites).toHaveLength(0)
    await disable.click()
    await confirmation.getByRole('button', { name: '确定反启用', exact: true }).click()
    await expect(
      page.getByText('测试组织已有初始库存单，不能反启用', { exact: false }).first()
    ).toBeVisible()
    await expect(disable).toBeVisible()
    await page.screenshot({
      path: testInfo.outputPath('disable-organization-rejected.png'),
      animations: 'disabled'
    })
    rejectDisable = false
    await disable.click()
    await confirmation.getByRole('button', { name: '确定反启用', exact: true }).click()
    await expect(disable).toHaveCount(0)
    await expect(page.getByRole('button', { name: '启用', exact: true })).toBeVisible()
    expect(disableWrites).toEqual(
      [1, 2].map(() => ({
        p_organization_ids: ['enable-org'],
        p_enabled_on: null,
        p_is_default: false
      }))
    )
    expect(errors).toEqual([])
    const organizationIds = ['enable-org', 'enable-org-two']
    const enabledDates = new Map<string, string>()
    let defaultId = ''
    const independentWrites: unknown[] = []
    organizationRows = () =>
      organizationIds.map((id, index) => ({
        id,
        tenant_id: tenantId,
        organization_code: `INV-00${index + 1}`,
        organization_name: `独立库存组织 ${index + 1}`,
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
        [...enabledDates].map(([id, enabledDate]) => ({
          organization_id: id,
          enabled_on: enabledDate,
          is_default: defaultId === id,
          initialization_closed_at: null
        }))
    )
    await page.route('**/rpc/wms_set_inventory_enabled_secure', (route) => {
      const payload = route.request().postDataJSON()
      independentWrites.push(payload)
      for (const id of payload.p_organization_ids) enabledDates.set(id, payload.p_enabled_on)
      if (payload.p_is_default) defaultId = payload.p_organization_ids[0]
      return route.fulfill({ json: null })
    })
    await page.reload()
    for (const index of [1, 2]) {
      const row = page.locator('.el-table__body tr').filter({ hasText: `独立库存组织 ${index}` })
      await row.getByRole('button', { name: '启用', exact: true }).click()
      await expect(dialog).toBeVisible()
      const enabledDate = await date.inputValue()
      await confirm.click()
      await expect(dialog).toBeHidden()
      await expect(row.getByRole('button', { name: '反启用', exact: true })).toBeVisible()
      expect(independentWrites.at(-1)).toEqual({
        p_organization_ids: [organizationIds[index - 1]],
        p_enabled_on: enabledDate,
        p_is_default: true
      })
    }
    expect(independentWrites).toHaveLength(2)
    const firstRow = page.locator('.el-table__body tr').filter({ hasText: '独立库存组织 1' })
    const secondRow = page.locator('.el-table__body tr').filter({ hasText: '独立库存组织 2' })
    await expect(firstRow.getByRole('button', { name: '设为默认', exact: true })).toBeVisible()
    await expect(secondRow.getByRole('button', { name: '设为默认', exact: true })).toHaveCount(0)
    await secondRow.locator('td').nth(2).scrollIntoViewIfNeeded()
    await page.screenshot({
      path: testInfo.outputPath('two-organizations-default-state.png'),
      animations: 'disabled'
    })
  })
}
