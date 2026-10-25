import { test, expect } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

for (const theme of ['light', 'dark']) {
  test(`收款信息 ${theme} 两条数据保留组织层级且只能选择公司`, async ({ page }, info) => {
    const tenant = '11111111-1111-4111-8111-111111111111'
    const saved: Record<string, unknown>[] = []
    await page.route('**/rest/v1/**', async (route) => {
      const resource = new URL(route.request().url()).pathname.split('/').at(-1)
      if (resource === 'mdm_organization') {
        return route.fulfill({
          json: [
            {
              id: 'company',
              tenant_id: tenant,
              parent_id: null,
              organization_code: 'C',
              organization_name: '验收公司',
              organization_type: 'company',
              status: '1',
              sort: 0
            },
            {
              id: 'department',
              tenant_id: tenant,
              parent_id: 'company',
              organization_code: 'D',
              organization_name: '验收部门',
              organization_type: 'department',
              status: '1',
              sort: 1
            }
          ]
        })
      }
      if (resource === 'fms_payee_information' && route.request().method() === 'POST') {
        const payload = route.request().postDataJSON() as Record<string, unknown>
        saved.push(payload)
        return route.fulfill({ json: { ...payload, id: `payee-${saved.length}` } })
      }
      return route.fulfill({ json: [] })
    })
    await page.goto(`/tests/e2e/fixtures/receivable-workspace.html?kind=payee&theme=${theme}`)
    for (const index of [1, 2]) {
      await page.getByRole('button', { name: '新增收款信息', exact: true }).click()
      const dialog = page.getByRole('dialog')
      await dialog.getByRole('switch', { name: '是否职员', exact: true }).locator('..').click()
      await dialog.getByLabel('收款人', { exact: true }).fill(`组织验收收款人${index}`)
      await dialog.getByLabel('收款银行', { exact: true }).fill('验收银行')
      await dialog.getByLabel('银行账号', { exact: true }).fill(`622200000000000${index}`)
      await dialog.getByLabel('费用承担公司', { exact: true }).click()
      const company = page.getByRole('treeitem', { name: '验收公司', exact: true })
      await company.locator('.el-tree-node__expand-icon').first().click()
      await expect(page.getByRole('treeitem', { name: '验收部门', exact: true })).toHaveAttribute(
        'aria-disabled',
        'true'
      )
      await page.getByText('验收公司', { exact: true }).filter({ visible: true }).click()
      await expect(dialog.getByText('验收公司', { exact: true })).toBeVisible()
      if (index === 2)
        await page.screenshot({ path: info.outputPath('payee-organization.png'), fullPage: true })
      await dialog.getByRole('button', { name: '保存收款信息', exact: true }).click()
      await expect(dialog).not.toBeVisible()
    }
    expect(saved).toHaveLength(2)
    expect(saved.map((row) => row.cost_company_id)).toEqual(['company', 'company'])
    expect(saved.every((row) => row.tenant_id === tenant)).toBe(true)
  })
}
