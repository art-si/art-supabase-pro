import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(90000)

const permissions = [
  'FinanceFinancialReceivable:View',
  'FinanceFinancialReceivable:Writeoff',
  'FinanceReceiptWriteoff:View',
  'FinanceReceiptWriteoff:Writeoff'
]
const tenant = '11111111-1111-4111-8111-111111111111'

test('两财务应收进入核销带入组织和客户且不自动核销', async ({ page }, info) => {
  const queries: Array<{ organizationId: string; customerId: string; counterpartyType: string }> =
    []
  const mutations: string[] = []
  let stale = true
  const records = [1, 2].map((index) => ({
    id: `financial-${index}`,
    document_no: `QA-WRITEOFF-${index}`,
    tenant_id: tenant,
    kind: 'financial',
    status: 'approved',
    settlement_organization_id: 'company',
    customer_id: `customer-${index}`,
    customer_name: `核销客户${index}`,
    amount: index * 100,
    total_amount: index * 100,
    available_amount: index * 100,
    outstanding_amount: index * 100,
    lines: []
  }))
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url())
    const name = url.pathname.split('/').at(-1) || ''
    const body = route.request().postDataJSON()
    if (name === 'sys_dictionary') {
      const code = (url.searchParams.get('dict_type_table.code') || '').replace(/^eq\./, '')
      const values =
        code === 'arWriteoffRelation'
          ? [['receivable_receipt', '应收收款核销']]
          : code === 'arCounterpartyType'
            ? [['customer', '客户']]
            : code === 'arDocumentStatus'
              ? [['approved', '已审核']]
              : []
      return route.fulfill({
        json: values.map(([value, label]) => ({
          id: value,
          code: value,
          value,
          label,
          status: '1',
          dict_type_table: { code }
        }))
      })
    }
    if (name === 'mdm_organization')
      return route.fulfill({
        json: [
          {
            id: 'group',
            parent_id: null,
            organization_type: 'group',
            organization_name: '核销集团'
          },
          {
            id: 'company',
            parent_id: 'group',
            organization_type: 'company',
            organization_name: '核销公司'
          },
          {
            id: 'department',
            parent_id: 'company',
            organization_type: 'department',
            organization_name: '核销部门'
          }
        ].map((row) => ({ ...row, tenant_id: tenant, organization_code: row.id, status: '1' }))
      })
    if (name === 'fms_ar_options_secure')
      return route.fulfill({
        json:
          body.p_type === 'initialized_organization'
            ? [{ id: 'company', tenant_id: tenant, name: '核销公司' }]
            : body.p_type === 'customer'
              ? [1, 2].map((index) => ({
                  id: `customer-${index}`,
                  tenant_id: tenant,
                  name: `核销客户${index}`
                }))
              : []
      })
    if (name === 'fms_receivable_workspace_secure')
      return route.fulfill({
        json: {
          records: records
            .filter((row) => !body.p_query?.id || row.id === body.p_query.id)
            .map((row) => (body.p_query?.id && stale ? { ...row, status: 'draft' } : row)),
          total: 2
        }
      })
    if (name === 'fms_receivable_writeoff_candidates_secure') {
      queries.push(body.p_query)
      const index = body.p_query.customerId === 'customer-1' ? 1 : 2
      return route.fulfill({
        json: {
          records: ['financial', 'receipt'].map((sourceType) => ({
            id: `${sourceType}-${index}`,
            documentId: `${sourceType}-${index}`,
            documentNo: `QA-CANDIDATE-${sourceType}-${index}`,
            sourceType,
            status: sourceType === 'receipt' ? 'confirmed' : 'approved',
            tenantId: tenant,
            organizationId: 'company',
            customerId: `customer-${index}`,
            customerName: `核销客户${index}`,
            currencyCode: 'CNY',
            amount: index * 100,
            availableAmount: index * 100
          })),
          summary: {
            receivableAmount: index * 100,
            dueThisMonthAmount: 0,
            unallocatedReceiptAmount: index * 100
          }
        }
      })
    }
    if (/execute_|reverse_|save_|act_/.test(name)) mutations.push(name)
    return route.fulfill({ json: [] })
  })
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  for (const index of [1, 2]) {
    if (index === 1) {
      await page.goto(
        `/tests/e2e/fixtures/receivable-workspace.html?kind=financial&arNavigation=1&permissionControls=1&theme=${theme}&permissions=${permissions.join(',')}`
      )
    } else {
      await page.keyboard.press('Alt+Shift+6')
      await page.getByRole('button', { name: '返回来源页面', exact: true }).click()
      await expect(page.getByRole('heading', { name: '财务应收单', exact: true })).toBeVisible()
      const clear = page.getByRole('button', { name: '取消选择', exact: true })
      if (await clear.isVisible()) await clear.click()
    }
    if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/dark/)
    await page
      .getByRole('row')
      .filter({ hasText: `QA-WRITEOFF-${index}` })
      .locator('label.el-checkbox')
      .click()
    if (index === 1) {
      await page.getByRole('button', { name: '应收核销', exact: true }).click()
      await expect(page.locator('.el-message--warning')).toContainText('单据状态或可核销余额已变化')
      await expect(page.getByRole('heading', { name: '财务应收单', exact: true })).toBeVisible()
      expect(queries).toHaveLength(0)
      stale = false
    }
    await page.getByRole('button', { name: '应收核销', exact: true }).click()
    await expect(page.getByRole('heading', { name: '收款核销工作台', exact: true })).toBeVisible()
    await expect(
      page
        .locator('.el-form-item')
        .filter({ has: page.getByRole('combobox', { name: '结算组织', exact: true }) })
    ).toContainText('核销公司')
    await expect(
      page
        .locator('.el-form-item')
        .filter({ has: page.getByRole('combobox', { name: '往来单位', exact: true }) })
    ).toContainText(`核销客户${index}`)
    await expect(page.getByText(`QA-CANDIDATE-financial-${index}`, { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '核销', exact: true })).toBeDisabled()
    if (index === 2) {
      await expect(page.locator('.el-message')).toHaveCount(0)
      await expect(page.locator('.el-notification')).toHaveCount(0)
      await page.getByRole('combobox', { name: '结算组织', exact: true }).click()
      const groupNode = page.getByRole('treeitem', { name: /^核销集团/ })
      await expect(groupNode).toBeVisible()
      await expect(groupNode).toHaveAttribute('aria-disabled', 'true')
      if ((await groupNode.getAttribute('aria-expanded')) !== 'true')
        await groupNode.locator('.el-tree-node__expand-icon').first().click()
      const companyNode = page.getByRole('treeitem', { name: /^核销公司/ })
      if ((await companyNode.getAttribute('aria-expanded')) !== 'true')
        await companyNode.locator('.el-tree-node__expand-icon').first().click()
      await expect(page.getByRole('treeitem', { name: '核销部门', exact: true })).toBeVisible()
      await expect(page.getByRole('treeitem', { name: '核销部门', exact: true })).toHaveAttribute(
        'aria-disabled',
        'true'
      )
      await page.screenshot({ path: info.outputPath('writeoff-entry-tree.png'), fullPage: true })
      await page.keyboard.press('Escape')
      await page.screenshot({ path: info.outputPath('writeoff-entry-context.png'), fullPage: true })
    }
  }
  expect(queries).toEqual(
    [1, 2].map((index) => ({
      organizationId: 'company',
      customerId: `customer-${index}`,
      counterpartyType: 'customer'
    }))
  )
  expect(mutations).toHaveLength(0)
})

test('财务应收草稿已提交及无可核销余额禁用入口', async ({ page }) => {
  const states = [
    { status: 'draft', available_amount: 100 },
    { status: 'submitted', available_amount: 100 },
    { status: 'approved', available_amount: 0 },
    { status: 'approved', available_amount: null }
  ]
  await page.route('**/rest/v1/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    return route.fulfill({
      json:
        name === 'fms_receivable_workspace_secure'
          ? {
              records: states.map((row, index) => ({
                ...row,
                id: `state-${index}`,
                document_no: `QA-NO-WRITEOFF-${index}`,
                kind: 'financial',
                settlement_organization_id: 'company',
                customer_id: 'customer-1',
                total_amount: 100
              })),
              total: states.length
            }
          : []
    })
  })
  await page.goto(
    `/tests/e2e/fixtures/receivable-workspace.html?kind=financial&permissions=${permissions.join(',')}`
  )
  for (let index = 0; index < states.length; index++) {
    const box = page
      .getByRole('row')
      .filter({ hasText: `QA-NO-WRITEOFF-${index}` })
      .locator('label.el-checkbox')
    await box.click()
    await expect(page.getByRole('button', { name: '应收核销', exact: true })).toBeDisabled()
    await box.click()
  }
})

for (const missing of ['FinanceReceiptWriteoff:View', 'FinanceReceiptWriteoff:Writeoff']) {
  test(`财务应收核销缺少${missing}时禁用目标入口`, async ({ page }) => {
    await page.route('**/rest/v1/**', (route) =>
      route.fulfill({
        json: new URL(route.request().url()).pathname.endsWith('fms_receivable_workspace_secure')
          ? {
              records: [
                {
                  id: 'approved',
                  document_no: 'QA-TARGET-RIGHTS',
                  kind: 'financial',
                  status: 'approved',
                  available_amount: 100,
                  settlement_organization_id: 'company',
                  customer_id: 'customer-1'
                }
              ],
              total: 1
            }
          : []
      })
    )
    await page.goto(
      `/tests/e2e/fixtures/receivable-workspace.html?kind=financial&permissions=${permissions.filter((code) => code !== missing).join(',')}`
    )
    await page
      .getByRole('row')
      .filter({ hasText: 'QA-TARGET-RIGHTS' })
      .locator('label.el-checkbox')
      .click()
    await expect(page.getByRole('button', { name: '应收核销', exact: true })).toBeDisabled()
  })
}
