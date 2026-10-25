import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'
import { assertTableFocusContract } from './support/table-focus'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

const home = '11111111-1111-4111-8111-111111111111'
const business = '22222222-2222-4222-8222-222222222222'

for (const mode of ['all', 'selected', 'ordinary', 'ordinary-forged'] as const) {
  test(`物料读取与选项失败恢复-${mode}`, async ({ page }, testInfo) => {
    await prepareIsolatedSession(page)
    const platform = mode === 'all' || mode === 'selected'
    await page.route('**/rest/v1/rpc/current_is_super', (route) =>
      route.fulfill({ json: platform })
    )
    const tenants = [
      { id: home, tenant_code: 'platform', tenant_name: '测试平台租户', status: '1' },
      { id: business, tenant_code: 'business', tenant_name: '测试业务租户', status: '1' }
    ]
    await page.route('**/rest/v1/sys_tenant?*', (route) => route.fulfill({ json: tenants }))
    await page.route('**/rest/v1/mdm_material_code_rule?*', (route) =>
      route.fulfill({
        json: [
          {
            id: 'home-rule',
            tenantId: home,
            ruleName: '测试平台编码策略',
            status: 'enabled',
            sort: 1
          },
          {
            id: 'business-rule',
            tenantId: business,
            ruleName: '测试业务编码策略',
            status: 'enabled',
            sort: 1
          }
        ]
      })
    )
    await page.route('**/rest/v1/sys_user?*', (route) =>
      route.fulfill({
        json: {
          id: 'permission-test-user',
          user_name: '测试用户',
          status: '1',
          tenant_id: home,
          tenant: tenants[0]
        }
      })
    )
    if (mode === 'ordinary-forged')
      await page.addInitScript((tenant) => {
        sessionStorage.setItem('art-platform-tenant-scope-id', tenant)
        sessionStorage.setItem('art-platform-tenant-scope-active', '1')
      }, business)
    await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
      route.fulfill({ json: [{ code: 'mdm', name: '测试主数据', baseUrl: '/mdm/' }] })
    )
    const path = '/mdm/material-master/material-archive'
    const menu = {
      id: 'materials',
      parentId: null,
      name: 'MdmMaterialArchive',
      path,
      component: path,
      type: 'menu',
      sort: 1,
      meta: { title: '物料编码', is_enable: true, is_hide: false, roles: [] }
    }
    await mockApplicationMenus(page, {
      mdm: [
        menu,
        ...['View', 'Add', 'Edit'].map((action) => ({
          ...menu,
          id: `material-${action}`,
          parentId: menu.id,
          name: `MdmMaterialArchive:${action}`,
          type: 'button',
          path: '',
          component: ''
        }))
      ]
    })
    let failOptions = true
    const groupScopes: Array<string | null> = []
    await page.route('**/rest/v1/mdm_master_group?*', (route) => {
      groupScopes.push(new URL(route.request().url()).searchParams.get('tenant_id'))
      return failOptions
        ? route.fulfill({ status: 503, json: { code: 'XX000', message: 'database unavailable' } })
        : route.fulfill({ json: [] })
    })
    let recordTenant: string | undefined
    const reads: Array<{
      filter: string | null
      scope: string | undefined
      id: string | null
      supplier: string | null
    }> = []
    await page.route('**/rest/v1/mdm_material?*', (route) => {
      const params = new URL(route.request().url()).searchParams
      const filter = params.get('tenant_id')
      const scope = route.request().headers()['x-art-tenant-scope']
      const supplier = params.get('supplier_id')
      reads.push({ filter, scope, id: params.get('id'), supplier })
      if (supplier === 'eq.supplier-missing')
        return route.fulfill({
          headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' },
          json: []
        })
      return route.fulfill({
        headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' },
        json: [
          {
            id: 'material-1',
            tenantId: recordTenant ?? (scope || home),
            categoryId: recordTenant === business ? 'business-category' : 'home-category',
            codeRuleId: recordTenant === business ? 'business-rule' : 'home-rule',
            materialCode: 'MAT-001',
            materialName: recordTenant
              ? recordTenant === business
                ? '测试业务物料'
                : '测试平台物料'
              : '测试范围物料',
            status: 'enabled',
            materialSource: 'purchase',
            attributeValues: {},
            imageUrls: [],
            sort: 1
          }
        ]
      })
    })
    await page.goto(`#${path}`)
    await expect(page.locator('.material-archive-page')).toBeVisible({ timeout: 60_000 })
    const onboarding = page.getByRole('button', { name: '知道了' })
    if (await onboarding.isVisible()) await onboarding.click()
    const tree = page.locator('.material-category-tree')
    await expect(tree.locator('.el-result')).toBeVisible({ timeout: 30_000 })
    await expect(tree.locator('.el-result__subtitle')).toContainText(/失败|重试|繁忙/)
    await expect(tree).not.toContainText('database unavailable')
    await page.getByRole('button', { name: '新增物料', exact: true }).click()
    await expect(page.locator('.el-dialog:visible')).toHaveCount(0)
    await expect(tree.locator('.el-result')).toBeVisible({ timeout: 30_000 })
    await expect(tree.getByRole('button', { name: '重新加载', exact: true })).toBeVisible()
    await page.screenshot({
      path: testInfo.outputPath('options-error.png'),
      animations: 'disabled'
    })
    failOptions = false
    await tree.getByRole('button', { name: '重新加载', exact: true }).click()
    await expect(tree.getByText('尚未建立分类')).toBeVisible()
    if (mode === 'selected') {
      await page.getByRole('button', { name: '当前租户范围：全部租户' }).click()
      await page.getByRole('menuitem').filter({ hasText: '测试业务租户' }).click()
      await expect.poll(() => reads.at(-1)?.scope).toBe(business)
      await expect.poll(() => groupScopes.at(-1)).toBe(`eq.${business}`)
    } else {
      await expect.poll(() => reads.length).toBeGreaterThan(0)
      expect(reads.at(-1)?.filter).toBe(platform ? null : `eq.${home}`)
      expect(groupScopes.at(-1)).toBe(platform ? null : `eq.${home}`)
      if (!platform) await expect(page.locator('.tenant-scope-switcher')).toHaveCount(0)
    }
    await expect(page.locator('.el-pagination__total')).toHaveText(/共\s*1\s*条/)
    await assertTableFocusContract(page, testInfo, ['.material-category-tree'])
    await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
    const row = page.locator('.el-table__body-wrapper .el-table__row').first()
    const identity = row.locator('[title="测试范围物料"]')
    await identity.scrollIntoViewIfNeeded()
    await expect(identity).toBeInViewport({ ratio: 1 })
    const code = row.getByText('MAT-001', { exact: true })
    await code.scrollIntoViewIfNeeded()
    await expect(code).toBeInViewport({ ratio: 1 })
    const queryButton = page
      .locator('.art-search-bar')
      .getByRole('button', { name: '查询', exact: true })
    await queryButton.scrollIntoViewIfNeeded()
    await expect(queryButton).toBeInViewport({ ratio: 1 })
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: '新增物料', exact: true }).click()
    const dialog = page.locator('.el-dialog:visible')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('请选择目标租户', { exact: true })).toHaveCount(0)
    await expect(dialog.locator('.el-form-item').filter({ hasText: '编码策略' })).toContainText(
      mode === 'selected' ? '测试业务编码策略' : '测试平台编码策略'
    )
    await page.screenshot({
      path: testInfo.outputPath('create-default.png'),
      animations: 'disabled'
    })
    if (mode === 'all') {
      await dialog.getByRole('button', { name: '取消', exact: true }).click()
      await page.route('**/rest/v1/mdm_material_category?*', (route) =>
        route.fulfill({
          json: [
            {
              id: 'home-category',
              tenantId: home,
              categoryCode: 'HOME',
              categoryName: '测试平台分类',
              compositionColumns: [],
              compositionSeparator: ' / ',
              status: 'enabled',
              sort: 1
            },
            {
              id: 'business-category',
              tenantId: business,
              categoryCode: 'BUSINESS',
              categoryName: '测试业务分类',
              compositionColumns: [],
              compositionSeparator: ' / ',
              status: 'enabled',
              sort: 1
            }
          ]
        })
      )
      await tree.getByRole('button', { name: '刷新分类', exact: true }).click()
      await tree.getByText('测试业务分类', { exact: true }).click()
      await page.getByRole('button', { name: '新增物料', exact: true }).click()
      await expect(dialog.locator('.el-form-item').filter({ hasText: '编码策略' })).toContainText(
        '测试平台编码策略'
      )
      await expect(
        dialog.locator('.el-form-item').filter({ hasText: '物料分类' }).locator('input').first()
      ).toHaveValue('')
      await expect(dialog).not.toContainText('测试业务分类')
      await dialog.getByRole('button', { name: '取消', exact: true }).click()
      await tree.getByRole('button', { name: /全部分类/ }).click()
      for (const tenant of [home, business, home]) {
        recordTenant = tenant
        await queryButton.click()
        await expect(
          row.locator(`[title="${tenant === business ? '测试业务物料' : '测试平台物料'}"]`)
        ).toBeVisible()
        await row.getByRole('button', { name: '编辑', exact: true }).click()
        await expect(dialog).toBeVisible()
        await expect(dialog.locator('.el-form-item').filter({ hasText: '编码策略' })).toContainText(
          tenant === business ? '测试业务编码策略' : '测试平台编码策略'
        )
        await expect(dialog.locator('.el-form-item').filter({ hasText: '物料分类' })).toContainText(
          tenant === business ? '测试业务分类' : '测试平台分类'
        )
        await dialog.getByRole('button', { name: '取消', exact: true }).click()
      }
      recordTenant = undefined
      const location = new URLSearchParams({
        fromMasterDelete: '1',
        resourceType: 'mdm_supplier',
        recordId: 'material-1',
        resourceId: 'supplier-1',
        resourceName: '测试供应商',
        resourceLabel: '供应商',
        returnPath: path
      })
      await page.goto(`#${path}?${location}`)
      const notice = page.locator('.master-delete-notice')
      await expect(notice).toContainText('已精确过滤')
      await expect.poll(() => reads.at(-1)?.id).toBe('in.(material-1)')
      await expect.poll(() => reads.at(-1)?.supplier).toBe('eq.supplier-1')
      await page.locator('.business-workspace-header').scrollIntoViewIfNeeded()
      await assertTableFocusContract(page, testInfo, [
        '.material-category-tree',
        '.master-delete-notice'
      ])
      await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
      await identity.scrollIntoViewIfNeeded()
      await expect(identity).toBeInViewport({ ratio: 1 })
      await code.scrollIntoViewIfNeeded()
      await expect(code).toBeInViewport({ ratio: 1 })
      await page.screenshot({
        path: testInfo.outputPath('reference-row-visible.png'),
        animations: 'disabled'
      })
      await page.keyboard.press('Escape')
      await notice.getByRole('button', { name: '清除定位', exact: true }).click()
      await expect(notice).toHaveCount(0)
      await expect.poll(() => reads.at(-1)?.id).toBeNull()
      await expect.poll(() => reads.at(-1)?.supplier).toBeNull()
      location.set('resourceId', 'supplier-missing')
      await page.goto(`#${path}?${location}`)
      await expect(page.getByText('未找到关联物料', { exact: true })).toBeVisible()
      await page.screenshot({
        path: testInfo.outputPath('reference-unavailable.png'),
        animations: 'disabled'
      })
      const readCount = reads.length
      location.delete('resourceId')
      await page.goto(`#${path}?${location}`)
      await expect(notice).toContainText('定位待完成')
      await expect(page.getByText('未找到关联物料', { exact: true })).toBeVisible()
      expect(reads.length).toBe(readCount)
    }
  })
}
