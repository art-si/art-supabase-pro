import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const scenario of [
  {
    kind: 'purchase_request',
    route: 'purchase-request',
    name: 'ScmPurchaseRequest',
    title: '采购申请'
  },
  {
    kind: 'purchase_contract',
    route: 'purchase-contract',
    name: 'ScmPurchaseContract',
    title: '采购合同'
  }
]) {
  test(`${scenario.title}按最新详情加载物料和建议供应商并可重试`, async ({ page }, testInfo) => {
    const tenant = await prepareIsolatedSession(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: false }))
    await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
      route.fulfill({ json: [{ code: 'scm', name: '测试供应链管理', baseUrl: '/scm/' }] })
    )
    const path = `/scm/purchase-management/${scenario.route}`
    const menu = {
      id: scenario.name,
      parentId: null,
      name: scenario.name,
      path,
      component: path,
      type: 'menu',
      sort: 1,
      meta: { title: scenario.title, is_enable: true, is_hide: false, roles: [] }
    }
    await mockApplicationMenus(page, {
      scm: [
        menu,
        {
          ...menu,
          id: `${scenario.name}-view`,
          parentId: menu.id,
          name: `${scenario.name}:View`,
          path: '',
          component: '',
          type: 'button'
        }
      ]
    })
    const line = {
      line_id: 'line-current',
      line_no: 1,
      material_id: 'material-current',
      material_description: '当前详情物料',
      material_code: 'M-CURRENT',
      quantity: 2,
      unit: 'U_TEST',
      base_unit: 'U_TEST',
      unit_price: 10,
      discount_rate: 0,
      tax_rate: 0,
      suggested_supplier_id: scenario.kind === 'purchase_request' ? 'supplier-current' : null,
      reason: '测试采购用途'
    }
    const document = {
      id: 'purchase-reference',
      tenant_id: tenant.id,
      kind: scenario.kind,
      document_no: 'TEST-REFERENCES',
      document_date: '2026-10-05',
      status: 'draft',
      source_id: null,
      supplier_id: null,
      details: {},
      subtotal: 20,
      tax_amount: 0,
      total_amount: 20,
      lines: [line],
      payment_plans: [],
      delivery_plans: [],
      clauses: []
    }
    await page.route('**/rest/v1/scm_purchase_document?**', (route) => {
      const params = new URL(route.request().url()).searchParams
      if (params.get('kind') === 'eq.purchase_order') return route.fulfill({ json: [] })
      return route.fulfill({
        json: params.has('id')
          ? document
          : [
              {
                ...document,
                lines: [
                  { ...line, material_id: 'material-stale', material_description: '列表旧物料' }
                ]
              }
            ],
        headers: { 'content-range': '0-0/1' }
      })
    })
    let materialFailure = true
    let materialReads = 0
    await page.route('**/rest/v1/mdm_material?**', (route) => {
      const params = new URL(route.request().url()).searchParams
      expect(params.get('tenant_id')).toBe(`eq.${tenant.id}`)
      expect(params.get('id')).toBe('in.(material-current)')
      materialReads++
      return materialFailure
        ? route.fulfill({ status: 403, json: { code: '42501', message: 'permission denied' } })
        : route.fulfill({
            json: [
              {
                id: 'material-current',
                tenant_id: tenant.id,
                material_code: 'M-CURRENT',
                material_name: '当前详情物料',
                basic_unit: 'U_TEST',
                baseUnitRecord: { unit_name: '测试件' }
              }
            ]
          })
    })
    let supplierFailure = false
    let supplierReads = 0
    await page.route('**/rest/v1/rpc/scm_purchase_suppliers_secure', (route) => {
      expect(route.request().postDataJSON().p_tenant_id).toBe(tenant.id)
      expect(route.request().postDataJSON().p_ids).toEqual(['supplier-current'])
      supplierReads++
      return supplierFailure
        ? route.fulfill({ status: 403, json: { code: '42501', message: 'permission denied' } })
        : route.fulfill({
            json: [
              {
                id: 'supplier-current',
                tenant_id: tenant.id,
                supplier_name: '测试建议供应商',
                supplier_code: 'S1'
              }
            ]
          })
    })
    await page.route('**/rest/v1/mdm_unit_of_measure?**', (route) => route.fulfill({ json: [] }))
    await page.goto(`#${path}`)
    const number = page.getByRole('button', { name: 'TEST-REFERENCES', exact: true }).first()
    await expect(number).toBeVisible({ timeout: 90_000 })
    const guide = page.getByText('知道了', { exact: true })
    if (await guide.isVisible()) await guide.click()
    await number.click()
    const drawer = page.getByRole('dialog', { name: `查看${scenario.title}`, exact: true })
    await expect(drawer.getByText('采购详情加载失败', { exact: true })).toBeVisible()
    materialFailure = false
    await drawer.getByRole('button', { name: '重新加载', exact: true }).click()
    await expect(drawer.getByText('当前详情物料', { exact: true })).toBeVisible()
    await expect(drawer.getByText('2 测试件', { exact: true })).toBeVisible()
    await expect(drawer.getByText('列表旧物料', { exact: true })).toHaveCount(0)
    if (scenario.kind === 'purchase_request') {
      await expect(drawer.getByText(/建议供应商.*测试建议供应商/)).toBeVisible()
      await expect(drawer.getByText('supplier-current', { exact: true })).toHaveCount(0)
      await drawer.locator('.el-drawer__close-btn').click()
      await expect(drawer).not.toBeVisible()
      supplierFailure = true
      await number.click()
      await expect(drawer.getByText('采购详情加载失败', { exact: true })).toBeVisible()
      supplierFailure = false
      await drawer.getByRole('button', { name: '重新加载', exact: true }).click()
      await expect(drawer.getByText(/建议供应商.*测试建议供应商/)).toBeVisible()
    } else {
      await expect(drawer.getByText('基本单位 测试件', { exact: true })).toBeVisible()
      expect(supplierReads).toBe(0)
    }
    expect(materialReads).toBeGreaterThanOrEqual(2)
    expect(errors).toEqual([])
    await drawer.getByText('当前详情物料', { exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({
      path: testInfo.outputPath('purchase-references.png'),
      animations: 'disabled'
    })
  })
}
