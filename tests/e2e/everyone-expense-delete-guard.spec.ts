import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

for (const config of [
  {
    kind: 'payee',
    label: '收款信息',
    table: 'fms_payee_information',
    number: 'payee_name',
    inspect: 'get_fms_payee_delete_dependencies_secure',
    remove: null
  },
  {
    kind: 'travel',
    label: '出差申请单',
    table: 'fms_travel_application',
    number: 'application_no',
    inspect: 'get_fms_travel_application_delete_dependencies_secure',
    remove: 'delete_fms_travel_applications_secure'
  },
  {
    kind: 'loan',
    label: '借款单',
    table: 'fms_travel_loan',
    number: 'loan_no',
    inspect: 'get_fms_travel_loan_delete_dependencies_secure',
    remove: 'delete_fms_travel_loans_secure'
  },
  {
    kind: 'repayment',
    label: '还款单',
    table: 'fms_travel_repayment',
    number: 'repayment_no',
    inspect: 'get_fms_repayment_delete_dependencies_secure',
    remove: 'delete_fms_travel_repayments_secure'
  },
  {
    kind: 'reimbursement',
    label: '费用报销单',
    table: 'tms_expense_reimbursement',
    number: 'reimbursement_no',
    inspect: 'get_fms_reimbursement_delete_dependencies_secure',
    remove: 'fms_delete_travel_reimbursements_secure'
  }
]) {
  for (const bulk of [false, true]) {
    for (const mode of ['blocked', 'error', 'clear', 'concurrent', 'failure'] as const) {
      test(`${config.label}${bulk ? '批量' : '单条'}删除 ${mode}`, async ({ page }, info) => {
        const id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
        const ids = bulk ? [id, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'] : [id]
        const events: string[] = []
        let deleted = false
        let blocked = mode === 'blocked'
        const record = {
          id,
          tenant_id: '11111111-1111-4111-8111-111111111111',
          [config.number]: 'QA-DELETE-001',
          bank_name: '验收银行',
          bank_account: '6222000000000001',
          is_employee: false,
          status: 'draft',
          source_type: 'travel',
          applicant_name: '验收员工',
          applicant_name_snapshot: '验收员工',
          reason: '删除验收',
          attachment_urls: [],
          items: [],
          itineraries: [],
          payees: [],
          receipts: []
        }
        const records = ids.map((recordId, index) => ({
          ...record,
          id: recordId,
          [config.number]: `QA-DELETE-00${index + 1}`
        }))
        await page.route('**/rest/v1/**', (route) => {
          const url = new URL(route.request().url())
          const resource = url.pathname.split('/').at(-1)
          if (resource === config.inspect) {
            events.push('inspect')
            expect(route.request().postDataJSON()).toMatchObject({
              p_ids: ids
            })
            if (mode === 'error')
              return route.fulfill({
                status: 503,
                json: { code: 'XX000', message: 'database unavailable' }
              })
            return route.fulfill({
              json: blocked
                ? [
                    {
                      resourceId: id,
                      sourceTable: 'tms_expense_reimbursement',
                      recordId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
                      targetId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
                      recordNo: 'FYBX-QA-001',
                      recordSummary: '验收报销记录',
                      recordStatus: 'approved'
                    }
                  ]
                : []
            })
          }
          if (
            (config.remove && resource === config.remove) ||
            (resource === config.table && route.request().method() === 'DELETE')
          ) {
            events.push('delete')
            if (config.remove) expect(route.request().postDataJSON().p_ids).toEqual(ids)
            else for (const recordId of ids) expect(url.searchParams.get('id')).toContain(recordId)
            if (mode === 'concurrent') {
              blocked = true
              return route.fulfill({
                status: 400,
                json: { code: 'P0001', message: `${config.label}新增了关联业务，请重新检查` }
              })
            }
            if (mode === 'failure')
              return route.fulfill({
                status: 503,
                json: { code: 'XX000', message: 'database unavailable' }
              })
            deleted = true
            return route.fulfill({
              json: config.remove ? ids.length : ids.map((recordId) => ({ id: recordId })),
              headers: { 'content-range': `0-${ids.length - 1}/${ids.length}` }
            })
          }
          if (resource === 'tms_get_expense_reimbursement_secure')
            return route.fulfill({
              json: records.find((item) => item.id === route.request().postDataJSON().p_id)
            })
          if (resource === 'fms_list_expense_reimbursements_secure')
            return route.fulfill({
              json: { records: deleted ? [] : records, total: deleted ? 0 : ids.length }
            })
          if (resource !== config.table) return route.fulfill({ json: [] })
          if (url.searchParams.get('id')?.startsWith('eq.'))
            return route.fulfill({
              json: records.find((item) => `eq.${item.id}` === url.searchParams.get('id'))
            })
          return route.fulfill({
            json: deleted ? [] : records,
            headers: {
              'content-range': deleted ? '*/0' : `0-${ids.length - 1}/${ids.length}`,
              'access-control-expose-headers': 'content-range'
            }
          })
        })
        const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
        await page.goto(
          `/tests/e2e/fixtures/receivable-workspace.html?kind=expense_${config.kind}&theme=${theme}`
        )
        if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/dark/)
        const row = page.getByRole('row').filter({ hasText: 'QA-DELETE-001' })
        await expect(row).toBeVisible()
        if (bulk) {
          await row.locator('label.el-checkbox').click()
          await expect(row.getByRole('checkbox', { name: '选择当前行' })).toBeChecked()
          const secondRow = page.getByRole('row').filter({ hasText: 'QA-DELETE-002' })
          await secondRow.locator('label.el-checkbox').click()
          await expect(secondRow.getByRole('checkbox', { name: '选择当前行' })).toBeChecked()
          await page.getByRole('button', { name: '批量删除', exact: true }).click()
        } else {
          const more = row.getByRole('button', { name: '更多操作', exact: true })
          if ((await row.locator('.art-button-more').getAttribute('data-trigger')) === 'hover')
            await more.hover()
          else await more.click()
          await page.getByRole('menuitem', { name: '删除', exact: true }).click()
        }
        if (mode === 'error') {
          const failure = page.getByRole('dialog', { name: '删除检查未完成' })
          await expect(failure).toContainText('关联资料未完成核验，删除已停止')
          await failure.getByRole('button', { name: '重新检查', exact: true }).click()
          await expect.poll(() => events.length).toBe(2)
          expect(events).toEqual(['inspect', 'inspect'])
          return
        }
        if (mode !== 'blocked') {
          const confirmation = page.getByRole('dialog', { name: '删除确认' })
          await expect(confirmation).toContainText(bulk ? '选中的 2 条' : 'QA-DELETE-001')
          await confirmation.getByRole('button', { name: '删除', exact: true }).click()
        }
        if (mode === 'clear') {
          await expect(row).not.toBeVisible()
          if (bulk) await expect(page.getByText('QA-DELETE-002', { exact: true })).not.toBeVisible()
          expect(events).toEqual(['inspect', 'delete'])
        } else if (mode === 'failure') {
          await expect.poll(() => events.length).toBe(3)
          await expect(page.locator('.el-message--error')).toHaveCount(1)
          await expect(page.locator('.el-message--error')).not.toContainText('database unavailable')
          await expect(row).toBeVisible()
          if (bulk) await expect(page.getByText('QA-DELETE-002', { exact: true })).toBeVisible()
          expect(events).toEqual(['inspect', 'delete', 'inspect'])
        } else {
          await expect(
            page.getByRole('dialog', { name: `暂时无法删除${config.label}` })
          ).toContainText('FYBX-QA-001')
          expect(events).toEqual(
            mode === 'blocked' ? ['inspect'] : ['inspect', 'delete', 'inspect']
          )
          await page.screenshot({
            path: info.outputPath('payee-delete-reference.png'),
            fullPage: true
          })
        }
      })
    }
  }
}
