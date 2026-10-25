import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(90000)

for (const referenceIndex of [1, 2])
  test(`借款两单删除引用${referenceIndex}显示状态并打开准确报销详情`, async ({ page }, info) => {
    const target =
      referenceIndex === 1
        ? 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'
        : 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    const number = `FYBX-REFERENCE-00${referenceIndex}`
    const reads: string[] = []
    let deletes = 0
    await page.route('**/rest/v1/**', (route) => {
      const url = new URL(route.request().url())
      const name = url.pathname.split('/').at(-1)
      if (name === 'sys_dictionary') {
        const code = (url.searchParams.get('dict_type_table.code') || '').replace(/^eq\./, '')
        return route.fulfill({
          json:
            code === 'tmsReimbursementApprovalStatus'
              ? [
                  {
                    id: 'approved',
                    code: 'approved',
                    value: 'approved',
                    label: '已通过',
                    status: '1',
                    dict_type_table: { code }
                  }
                ]
              : []
        })
      }
      if (name === 'fms_travel_loan') {
        const records = [1, 2].map((index) => ({
          id: `loan-${index}`,
          loan_no: `QA-REFERENCE-${index}`,
          tenant_id: '11111111-1111-4111-8111-111111111111',
          status: 'draft',
          reason: '引用保护验收',
          items: [],
          payees: [],
          attachment_urls: []
        }))
        return route.fulfill({
          json: url.searchParams.get('id')?.startsWith('eq.')
            ? records.find((row) => `eq.${row.id}` === url.searchParams.get('id'))
            : records,
          headers: { 'content-range': '0-1/2' }
        })
      }
      if (name === 'get_fms_travel_loan_delete_dependencies_secure')
        return route.fulfill({
          json: [
            {
              resourceId: `loan-${referenceIndex}`,
              sourceTable: 'tms_expense_reimbursement',
              recordId: target,
              targetId: target,
              recordNo: number,
              recordSummary: '关联报销验收',
              recordStatus: 'approved'
            }
          ]
        })
      if (name === 'delete_fms_travel_loans_secure') {
        deletes++
        return route.fulfill({ json: 2 })
      }
      if (name === 'tms_get_expense_reimbursement_secure') {
        reads.push(route.request().postDataJSON().p_id)
        return route.fulfill({
          json: {
            id: target,
            tenant_id: '11111111-1111-4111-8111-111111111111',
            reimbursement_no: number,
            source_type: 'travel',
            status: 'approved',
            amount: 100,
            paid_amount: 0,
            applicant_name_snapshot: '引用验收员工',
            reason: '关联报销验收',
            attachment_urls: [],
            items: [],
            payees: [],
            lines: [],
            payments: []
          }
        })
      }
      return route.fulfill({ json: [] })
    })
    const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
    await page.goto(
      `/tests/e2e/fixtures/receivable-workspace.html?kind=expense_loan&arNavigation=1&theme=${theme}`
    )
    await expect(page.getByText('QA-REFERENCE-2', { exact: true })).toBeVisible()
    if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/dark/)
    await page.locator('.el-table__header-wrapper label.el-checkbox').first().click()
    await page.getByRole('button', { name: '批量删除', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '暂时无法删除借款单', exact: true })
    await expect(dialog).toContainText(number)
    await expect(dialog).toContainText('已通过')
    await expect(dialog).toContainText(`QA-REFERENCE-${referenceIndex}`)
    await expect(dialog).not.toContainText('undefined')
    await expect(dialog).not.toContainText('单据删除条件')
    await dialog.screenshot({ path: info.outputPath('reference-navigation.png') })
    await dialog.getByRole('button', { name: '查看关联', exact: true }).click()
    await expect(page.getByRole('heading', { name: number, exact: true })).toBeVisible()
    expect(reads).toEqual([target])
    expect(deletes).toBe(0)
  })
