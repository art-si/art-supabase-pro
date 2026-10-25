import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120000)

for (const config of [
  {
    kind: 'loan',
    resource: 'fms_travel_loan',
    number: 'loan_no',
    business: 'fms_travel_loan',
    submit: 'start_workflow'
  },
  {
    kind: 'repayment',
    resource: 'fms_travel_repayment',
    number: 'repayment_no',
    business: 'fms_travel_repayment',
    submit: 'submit_fms_travel_repayment_secure'
  },
  {
    kind: 'reimbursement',
    resource: 'fms_list_expense_reimbursements_secure',
    number: 'reimbursement_no',
    business: 'tms_expense_reimbursement',
    submit: 'start_workflow'
  }
]) {
  test(`${config.kind} 两张草稿提交、失败恢复及提交后禁止删除`, async ({ page }) => {
    let fail = true
    const attempts: string[] = []
    const deletions: string[] = []
    const records = [1, 2].map((index) => ({
      id: `submit-record-${index}`,
      tenant_id: '11111111-1111-4111-8111-111111111111',
      [config.number]: `QA-SUBMIT-${index}`,
      status: 'draft',
      source_type: 'travel',
      is_demo: true,
      applicant_name: '验收员工',
      applicant_name_snapshot: '验收员工',
      reason: '提交验收',
      attachment_urls: [],
      items: [],
      payees: []
    }))
    await page.route('**/rest/v1/**', (route) => {
      const url = new URL(route.request().url())
      const resource = url.pathname.split('/').at(-1) || ''
      if (
        /delete_.*(loan|repayment|reimbursement)|fms_delete_travel_reimbursements_secure/.test(
          resource
        )
      ) {
        deletions.push(resource)
        return route.fulfill({ json: 0 })
      }
      if (resource === config.submit) {
        const body = route.request().postDataJSON()
        const id = config.submit === 'start_workflow' ? body.p_business_id : body.p_id
        attempts.push(id)
        if (config.submit === 'start_workflow') expect(body.p_business_type).toBe(config.business)
        if (fail)
          return route.fulfill({
            status: 400,
            json: { code: 'P0001', message: '流程暂不可用，请重试' }
          })
        const record = records.find((item) => item.id === id)
        expect(record).toBeDefined()
        if (record) record.status = 'pending_review'
        return route.fulfill({
          json:
            config.submit === 'start_workflow'
              ? 'workflow-test-id'
              : { id, status: 'pending_review' }
        })
      }
      if (resource === 'tms_get_expense_reimbursement_secure')
        return route.fulfill({
          json: records.find((record) => record.id === route.request().postDataJSON().p_id)
        })
      if (resource !== config.resource) return route.fulfill({ json: [] })
      const id = url.searchParams.get('id')?.replace(/^eq\./, '')
      if (id) return route.fulfill({ json: records.find((record) => record.id === id) })
      return route.fulfill({
        json: config.kind === 'reimbursement' ? { records, total: 2 } : records,
        headers: { 'content-range': '0-1/2', 'access-control-expose-headers': 'content-range' }
      })
    })
    await page.goto(`/tests/e2e/fixtures/receivable-workspace.html?kind=expense_${config.kind}`)
    for (const index of [1, 2]) {
      const row = page.getByRole('row').filter({ hasText: `QA-SUBMIT-${index}` })
      await expect(row).toBeVisible()
      if (index === 1) {
        await row.getByRole('button', { name: '提交审批', exact: true }).click()
        await page
          .getByRole('dialog')
          .getByRole('button', { name: '提交审批', exact: true })
          .click()
        await expect(page.locator('.el-message--error')).toHaveCount(1)
        await expect(row.getByRole('button', { name: '提交审批', exact: true })).toBeEnabled()
        expect(attempts).toEqual(['submit-record-1'])
        fail = false
      }
      await row.getByRole('button', { name: '提交审批', exact: true }).click()
      await page.getByRole('dialog').getByRole('button', { name: '提交审批', exact: true }).click()
      await expect(row.getByRole('button', { name: '提交审批', exact: true })).toHaveCount(0)
      if (config.kind === 'loan')
        await expect(row.getByRole('button', { name: '编辑', exact: true })).toBeDisabled()
      else await expect(row.getByRole('button', { name: '编辑', exact: true })).toHaveCount(0)
      const more = row.getByRole('button', { name: '更多操作', exact: true })
      if ((await row.locator('.art-button-more').getAttribute('data-trigger')) === 'hover')
        await more.hover()
      else await more.click()
      await page.getByRole('menuitem', { name: '删除', exact: true }).click()
      const blocked = page.getByRole('dialog', { name: /暂时无法删除/ })
      await expect(blocked).toContainText(`QA-SUBMIT-${index}`)
      await expect(blocked).toContainText(/仅草稿|审批及付款历史需保留/)
      await blocked.getByRole('button', { name: '关闭', exact: true }).click()
      await expect(row).toBeVisible()
    }
    expect(attempts).toEqual(['submit-record-1', 'submit-record-1', 'submit-record-2'])
    expect(deletions).toEqual([])
  })
}
