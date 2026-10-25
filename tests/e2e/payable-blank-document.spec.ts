import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(90000)
const tenant = '11111111-1111-4111-8111-111111111111'

for (const kind of ['estimated', 'financial']) {
  test(`${kind} 两空白应付新增、三级组织与撤权重试`, async ({ page }, info) => {
    const records: Record<string, unknown>[] = []
    const attempts: Record<string, unknown>[] = []
    let fail = true
    const suppliers = [1, 2].map((index) => ({
      id: `supplier-${index}`,
      code: `QA-SUP-${index}`,
      name: `新增供应商${index}`
    }))
    const materials = [1, 2].map((index) => ({
      id: `material-${index}`,
      code: `QA-MAT-${index}`,
      name: `新增物料${index}`,
      description: `新增物料${index}`,
      inventory_unit_id: 'unit',
      unit_name: '件',
      base_unit_id: 'unit',
      material_units: { base_unit_id: 'unit', unit_conversions: [] }
    }))
    await page.route('**/rest/v1/**', (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)
      const body = route.request().postDataJSON()
      if (name === 'fms_purchase_payable_list_secure')
        return route.fulfill({ json: { data: records, total: records.length } })
      if (name === 'fms_payable_options_secure') {
        const options: Record<string, unknown[]> = {
          supplier: suppliers,
          material: materials,
          unit: [{ id: 'unit', name: '件' }],
          tax: [{ id: 'tax', code: '0', name: '0%' }],
          [`${kind}_type`]: [{ id: 'type', name: '非标准采购应付', is_standard_purchase: false }]
        }
        return route.fulfill({ json: options[body.p_kind] || [] })
      }
      if (name === 'mdm_organization')
        return route.fulfill({
          json: [
            {
              id: 'group',
              tenant_id: tenant,
              parent_id: null,
              organization_name: '新增应付集团',
              organization_type: 'group',
              status: '1'
            },
            {
              id: 'company',
              tenant_id: tenant,
              parent_id: 'group',
              organization_name: '新增应付公司',
              organization_type: 'company',
              status: '1'
            },
            ...[1, 2].map((index) => ({
              id: `department-${index}`,
              tenant_id: tenant,
              parent_id: 'company',
              organization_name: `新增应付部门${index}`,
              organization_type: 'department',
              status: '1'
            }))
          ]
        })
      if (name === 'fms_payable_currency_context_secure')
        return route.fulfill({
          json: {
            configured: true,
            currency_code: 'CNY',
            base_currency_code: 'CNY',
            exchange_rate: 1,
            account_set_name: '新增验收账套',
            account_set_id: 'book',
            currencies: [{ id: 'CNY', name: '人民币 CNY' }],
            message: ''
          }
        })
      if (name === 'fms_save_purchase_payable_secure') {
        attempts.push(body.p_document)
        if (fail)
          return route.fulfill({
            status: 409,
            json: { code: 'P0001', message: '新增应付保存失败，请重试' }
          })
        const index = records.length + 1
        const created = {
          ...body.p_document,
          id: `created-${index}`,
          document_no: `QA-CREATED-${index}`
        }
        records.push(created)
        return route.fulfill({ json: created })
      }
      return route.fulfill({ json: [] })
    })
    const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
    const menu = kind === 'estimated' ? 'FinanceEstimatedPayable' : 'FinancePurchasePayable'
    for (const index of [1, 2]) {
      await page.goto(
        `/tests/e2e/fixtures/purchase-payable.html?kind=${kind}&theme=${theme}&permissionControls&permissions=${menu}:View,${menu}:Add`
      )
      await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*\bdark\b)/)
      await page.getByRole('button', { name: '新增', exact: true }).click()
      const drawer = page.getByRole('dialog')
      const save = drawer.getByRole('button', { name: '保存', exact: true })
      await expect(save).toBeEnabled()
      await drawer.getByLabel('结算供应商', { exact: true }).click()
      const supplier = page.getByRole('dialog', { name: '选择结算供应商', exact: true })
      await supplier
        .locator('tbody tr')
        .filter({ hasText: `QA-SUP-${index}` })
        .click()
      await supplier.getByRole('button', { name: '确定', exact: true }).click()
      const before = attempts.length
      await save.click()
      await expect(page.getByText('请至少选择一行物料明细', { exact: true })).toBeVisible()
      expect(attempts).toHaveLength(before)
      await drawer.getByLabel('付款组织', { exact: true }).click()
      await page
        .getByRole('treeitem', { name: '新增应付集团', exact: true })
        .locator('.el-tree-node__expand-icon')
        .first()
        .click()
      await page
        .getByRole('treeitem', { name: '新增应付公司', exact: true })
        .locator('.el-tree-node__expand-icon')
        .first()
        .click()
      if (index === 2)
        await page.getByRole('tree').screenshot({ path: info.outputPath('organization-tree.png') })
      await page.getByRole('treeitem', { name: `新增应付部门${index}`, exact: true }).click()
      await drawer.getByRole('button', { name: '选择物料', exact: true }).click()
      const picker = page.getByRole('dialog', { name: '数据来源物料编码', exact: true })
      await picker
        .locator('tbody tr')
        .filter({ hasText: `QA-MAT-${index}` })
        .locator('.el-checkbox')
        .click()
      await picker.getByRole('button', { name: '确定', exact: true }).click()
      await expect(picker).not.toBeVisible()
      await expect(
        drawer
          .locator('.el-select')
          .filter({ has: page.getByRole('combobox', { name: '库存单位', exact: true }) })
      ).toContainText('件')
      const price = drawer.getByRole('spinbutton', { name: '含税单价', exact: true })
      await price.fill(`${index * 100}`)
      await price.press('Tab')
      await expect(drawer.getByText(/共 1 行 · (?:立账)?价税合计/)).toContainText(`${index}00.00`)
      if (index === 2) {
        await expect(page.locator('.el-message')).toHaveCount(0)
        await drawer.screenshot({ path: info.outputPath('create-filled.png') })
      }
      await page.keyboard.press('Alt+Shift+4')
      await save.click()
      await expect(
        page.getByText('操作范围或权限已变化，请重新打开应付单', { exact: true })
      ).toBeVisible()
      expect(attempts).toHaveLength(before)
      await page.keyboard.press('Alt+Shift+5')
      await save.click()
      if (index === 1) {
        await expect(page.getByText('新增应付保存失败，请重试', { exact: true })).toBeVisible()
        fail = false
        await save.click()
      }
      await expect(drawer).not.toBeVisible()
      await expect(page.getByText(`QA-CREATED-${index}`, { exact: true })).toBeVisible()
      expect(attempts.at(-1)).toMatchObject({
        id: '',
        kind,
        tenant_id: tenant,
        account_set_id: 'book',
        organization_id: `department-${index}`,
        supplier_id: `supplier-${index}`,
        lines: [{ material_id: `material-${index}`, quantity: 1, total_amount: index * 100 }]
      })
    }
    expect(attempts).toHaveLength(3)
    expect(records).toHaveLength(2)
  })
}
