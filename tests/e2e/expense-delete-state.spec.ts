import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

for (const config of [
  { kind: 'travel', table: 'fms_travel_application', number: 'application_no' },
  { kind: 'loan', table: 'fms_travel_loan', number: 'loan_no' },
  { kind: 'repayment', table: 'fms_travel_repayment', number: 'repayment_no' },
  { kind: 'reimbursement', table: 'tms_expense_reimbursement', number: 'reimbursement_no' }
]) {
  test(`${config.kind} 行菜单及混合批量选择遵循删除状态`, async ({ page }, info) => {
    let deleteRequests = 0
    const records = ['draft', 'submitted', 'approved', 'paid', 'rejected'].map((status, index) => ({
      id: `document-${index}`,
      tenant_id: '11111111-1111-4111-8111-111111111111',
      [config.number]: `QA-STATE-${status}`,
      status,
      source_type: 'travel',
      applicant_name: '状态验收员工',
      applicant_name_snapshot: '状态验收员工',
      reason: '状态验收',
      attachment_urls: [],
      items: [],
      itineraries: [],
      payees: [],
      receipts: []
    }))
    if (config.kind === 'reimbursement')
      records.push({
        ...records[0],
        id: 'waybill-draft',
        source_type: 'waybill',
        [config.number]: 'QA-STATE-waybill'
      })
    await page.route('**/rest/v1/**', (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)
      if (/delete|dependencies/.test(name || '')) deleteRequests++
      if (name === 'fms_list_expense_reimbursements_secure')
        return route.fulfill({ json: { records, total: records.length } })
      return route.fulfill({
        json: name === config.table ? records : [],
        headers: {
          'content-range': `0-${records.length - 1}/${records.length}`,
          'access-control-expose-headers': 'content-range'
        }
      })
    })
    const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
    await page.goto(
      `/tests/e2e/fixtures/receivable-workspace.html?kind=expense_${config.kind}&theme=${theme}`
    )
    const draft = page.getByRole('row').filter({ hasText: 'QA-STATE-draft' })
    await expect(draft).toBeVisible()
    for (const status of [
      'draft',
      'submitted',
      'approved',
      'paid',
      'rejected',
      ...(config.kind === 'reimbursement' ? ['waybill'] : [])
    ]) {
      const row = page.getByRole('row').filter({ hasText: `QA-STATE-${status}` })
      const more = row.getByRole('button', { name: '更多操作', exact: true })
      if ((await row.locator('.art-button-more').getAttribute('data-trigger')) === 'hover')
        await more.hover()
      else await more.click()
      const menu = page.getByRole('menu', { name: '更多操作', exact: true })
      const remove = menu.getByRole('menuitem', { name: '删除', exact: true })
      if (status === 'draft' || (config.kind === 'reimbursement' && status === 'rejected'))
        await expect(remove).toBeEnabled()
      else await expect(remove).toBeDisabled()
      await menu.press('Escape')
      await page.getByRole('heading', { level: 1 }).hover()
      await expect(menu).toBeHidden()
    }
    const submitted = page.getByRole('row').filter({ hasText: 'QA-STATE-submitted' })
    await draft.locator('label.el-checkbox').click()
    await expect(page.getByRole('button', { name: '批量删除', exact: true })).toBeEnabled()
    await submitted.locator('label.el-checkbox').click()
    await expect(page.getByRole('button', { name: '批量删除', exact: true })).toBeDisabled()
    await submitted.locator('label.el-checkbox').click()
    await expect(page.getByRole('button', { name: '批量删除', exact: true })).toBeEnabled()
    expect(deleteRequests).toBe(0)
  })
}
