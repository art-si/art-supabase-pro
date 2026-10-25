import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'
import { assertTableFocusContract } from './support/table-focus'
import { prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(150_000)

for (const { application, theme, boxBorderMode } of [
  { application: 'smis', theme: 'light', boxBorderMode: true },
  { application: 'mdm', theme: 'light', boxBorderMode: true },
  { application: 'mdm', theme: 'light', boxBorderMode: false },
  { application: 'mdm', theme: 'dark', boxBorderMode: true },
  { application: 'mdm', theme: 'dark', boxBorderMode: false }
] as const) {
  test(`${application}供应商删除检查、并发引用与零行反馈-${theme}-${boxBorderMode ? 'border' : 'shadow'}`, async ({
    page
  }, testInfo) => {
    await prepareIsolatedSession(page)
    await prepareAppearance(page, { theme, boxBorderMode })
    const path =
      application === 'smis' ? '/smis/basic-data/supplier' : '/mdm/purchase-master/supplier'
    const name = application === 'smis' ? 'SmisSupplier' : 'MdmPurchaseSupplier'
    const menu = {
      id: 'supplier',
      parentId: null,
      name,
      path,
      component: path,
      type: 'menu',
      sort: 1,
      meta: { title: '供应商', is_enable: true, is_hide: false, roles: [] }
    }
    await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: false }))
    await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
      route.fulfill({
        json: [{ code: application, name: '测试业务系统', baseUrl: `/${application}/` }]
      })
    )
    await mockApplicationMenus(page, {
      [application]: [
        menu,
        ...['View', 'Delete'].map((action) => ({
          ...menu,
          id: `supplier-${action}`,
          parentId: menu.id,
          name: `${name}:${action}`,
          type: 'button',
          path: '',
          component: ''
        }))
      ]
    })
    const supplier = {
      id: 'supplier-1',
      supplierCode: 'SUP-001',
      supplierName: '测试共用供应商',
      supplierCategory: 'inspection_agency',
      supplierType: 'key',
      coordinateSystem: 'gcj02',
      updateTime: '2026-01-01'
    }
    let removed = false
    await page.route('**/rest/v1/rpc/smis_list_suppliers_secure', (route) =>
      route.fulfill({
        json: {
          records: removed ? [] : [supplier],
          total: removed ? 0 : 1,
          overview: { total: 1, keySuppliers: 1, categoryCount: 1, contactComplete: 0 }
        }
      })
    )
    await page.route('**/rest/v1/mdm_supplier?**', (route) =>
      route.fulfill({
        headers: {
          'content-range': removed ? '*/0' : '0-0/1',
          'access-control-expose-headers': 'content-range'
        },
        json: removed ? [] : [supplier]
      })
    )
    let failure = true
    let blocked = true
    let checks = 0
    let deletes = 0
    let outcome: 'blocked' | 'zero' | 'success' = 'blocked'
    await page.route('**/rest/v1/rpc/get_record_delete_dependency_details?**', (route) => {
      checks++
      expect(route.request().postDataJSON().p_table).toBe('mdm_supplier')
      expect(route.request().postDataJSON().p_ids).toEqual([supplier.id])
      if (failure)
        return route.fulfill({
          status: 503,
          json: { code: 'XX000', message: 'database unavailable' }
        })
      return route.fulfill({
        json: blocked
          ? [
              {
                resourceId: supplier.id,
                sourceTable: 'mdm_material',
                recordId: 'material-1',
                targetId: 'material-1',
                recordNo: 'MAT-001',
                recordStatus: 'enabled',
                recordSummary: '测试引用物料',
                createdAt: '2026-01-01'
              }
            ]
          : []
      })
    })
    await page.route('**/rest/v1/rpc/smis_delete_suppliers_secure', (route) => {
      deletes++
      expect(route.request().postDataJSON().p_ids).toEqual([supplier.id])
      if (outcome === 'blocked') {
        blocked = true
        return route.fulfill({
          status: 400,
          json: { code: '23503', message: '供应商已被业务记录使用，请先解除关联' }
        })
      }
      if (outcome === 'success') removed = true
      return route.fulfill({ json: outcome === 'success' ? 1 : 0 })
    })
    await page.goto(`#${path}`)
    const remove = page
      .locator('.el-table__body-wrapper')
      .getByRole('button', { name: '删除', exact: true })
      .first()
    await expect(remove).toBeVisible({ timeout: 90_000 })
    await expect(page.locator('.el-pagination__total')).toHaveText(/^共\s*1\s*条$/)
    const onboarding = page.getByText('知道了', { exact: true })
    if (await onboarding.isVisible()) await onboarding.click()
    if (application === 'mdm') {
      const hint = page
        .locator('.master-group-panel')
        .getByText('可先建立顶级分组，再逐层补充分组结构。', { exact: true })
      await hint.scrollIntoViewIfNeeded()
      await expect(hint).toBeInViewport({ ratio: 1 })
    }
    await assertTableFocusContract(
      page,
      testInfo,
      application === 'mdm' ? ['.master-group-panel'] : []
    )
    await remove.click()
    await expect(page.getByText('关联资料未完成核验，删除已停止')).toBeVisible()
    expect(deletes).toBe(0)
    failure = false
    await page.getByRole('button', { name: '重新检查', exact: true }).click()
    await expect(page.getByText('MAT-001', { exact: true })).toBeVisible()
    await expect(page.getByText('测试引用物料 · 启用', { exact: true })).toBeVisible()
    await page.screenshot({
      path: testInfo.outputPath('supplier-blocked.png'),
      animations: 'disabled'
    })
    await page.getByRole('button', { name: '关闭', exact: true }).click()
    blocked = false
    await page.locator('.el-table__body-wrapper .el-checkbox').first().click()
    await page.getByRole('button', { name: '批量删除', exact: true }).click()
    const before = checks
    await page.getByRole('dialog').getByRole('button', { name: '删除', exact: true }).click()
    await expect(page.getByText('MAT-001', { exact: true })).toBeVisible()
    expect(deletes).toBe(1)
    expect(checks).toBeGreaterThan(before)
    await expect(page.locator('.el-message--error')).toHaveCount(0)
    await page.getByRole('button', { name: '关闭', exact: true }).click()
    blocked = false
    outcome = 'zero'
    await remove.click()
    await page.getByRole('dialog').getByRole('button', { name: '删除', exact: true }).click()
    await expect(page.locator('.el-message--error')).toHaveCount(1)
    await expect(page.locator('.el-message--success')).toHaveCount(0)
    await expect(remove).toBeVisible()
    expect(deletes).toBe(2)
    await page.mouse.move(0, 0)
    await expect(page.locator('.el-message--error')).toHaveCount(0)
    outcome = 'success'
    await remove.click()
    await page.getByRole('dialog').getByRole('button', { name: '删除', exact: true }).click()
    await expect(page.locator('.el-message--success')).toHaveCount(1)
    await expect(
      page.locator('.el-table__body-wrapper').getByText(supplier.supplierName, { exact: true })
    ).toHaveCount(0)
    expect(deletes).toBe(3)
    await expect(
      page.locator('.art-table-query').getByText('暂无供应商', { exact: true })
    ).toBeVisible()
    await expect(page.locator('.el-pagination__total')).toHaveCount(0)
  })
}
