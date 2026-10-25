import { test, expect } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90000)

for (const config of [
  {
    kind: 'payee',
    title: '收款信息',
    resource: 'fms_payee_information',
    number: 'payee_name',
    add: '新增'
  },
  {
    kind: 'reimbursement',
    title: '费用报销单',
    resource: 'fms_list_expense_reimbursements_secure',
    number: 'reimbursement_no',
    add: '新增差旅报销'
  },
  {
    kind: 'travel',
    title: '出差申请单',
    resource: 'fms_travel_application',
    number: 'application_no',
    add: '新增出差申请'
  },
  {
    kind: 'loan',
    title: '借款单',
    resource: 'fms_travel_loan',
    number: 'loan_no',
    add: '新增借款单'
  },
  {
    kind: 'repayment',
    title: '还款单',
    resource: 'fms_travel_repayment',
    number: 'repayment_no',
    add: '新增还款单'
  }
]) {
  for (const theme of ['light', 'dark']) {
    test(`${config.title} ${theme} 两条记录、查询、错误重试与空态`, async ({ page }, info) => {
      let fail = false
      let empty = false
      let reads = 0
      const lineSources: Record<string, { resource: string; parent: string }> = {
        travel: { resource: 'fms_travel_itinerary', parent: 'application' },
        loan: { resource: 'fms_travel_loan_item', parent: 'loan' },
        repayment: { resource: 'fms_travel_repayment_item', parent: 'repayment' },
        reimbursement: {
          resource: 'fms_list_expense_reimbursement_lines_secure',
          parent: 'reimbursement'
        }
      }
      const lineSource = lineSources[config.kind]
      const records = [1, 2].map((index) => ({
        id: `record-${index}`,
        tenant_id: '11111111-1111-4111-8111-111111111111',
        [config.number]: `QA-${config.kind}-${index}`,
        applicant_name: `验收员工${index}`,
        applicant_name_snapshot: `验收员工${index}`,
        applicant_employee_no: `QA-${index}`,
        applicant_employee_id: `employee-${index}`,
        applicant_company_name: '验收公司',
        expense_company_name: '验收公司',
        expense_department_name: '验收部门',
        expense_department_name_snapshot: '验收部门',
        application_date: '2026-10-23',
        repayment_date: '2026-10-23',
        reason: `验收用途${index}`,
        reimbursement_date: '2026-10-23',
        source_type: 'travel',
        total_amount: index * 100,
        is_employee: false,
        status: index === 1 ? 'draft' : config.kind === 'repayment' ? 'collected' : 'approved',
        loan_amount: index * 100,
        requested_amount: index * 100,
        amount: index * 100,
        received_amount: index === 2 ? 200 : 0,
        attachment_urls: [],
        is_demo: true,
        create_time: '2026-10-23T00:00:00Z',
        ...(config.kind === 'repayment'
          ? { loan: { loan_no: `QA-LOAN-${index}`, remaining_balance: 0 } }
          : {})
      }))
      await page.route('**/rest/v1/**', (route) => {
        const url = new URL(route.request().url())
        const resource = url.pathname.split('/').at(-1)
        if (resource === 'sys_dictionary') {
          const code = (url.searchParams.get('dict_type_table.code') || '').replace(/^eq\./, '')
          return route.fulfill({
            json:
              code === 'commonDocumentDisplayMode'
                ? [
                    ['document', '按单据'],
                    ['line', '按明细']
                  ].map(([value, label], index) => ({
                    id: `mode-${index}`,
                    code: value,
                    value,
                    label,
                    status: '1',
                    sort: index,
                    dict_type_table: { code, name: code }
                  }))
                : []
          })
        }
        const isLine = Boolean(lineSource && resource === lineSource.resource)
        if (resource !== config.resource && !isLine) return route.fulfill({ json: [] })
        reads++
        if (fail) return route.fulfill({ status: 503, json: { message: '验收模拟服务不可用' } })
        const data = empty
          ? []
          : isLine
            ? records.map((record, index) => ({
                id: `line-${index}`,
                line_no: index + 1,
                [lineSource.parent]: record,
                expense_item: { item_name: '验收费用' },
                requested_amount: 100,
                amount: 100,
                departure_region_path: [],
                destination_region_path: [],
                transport_modes: [],
                traveler_employee_ids: []
              }))
            : records
        return route.fulfill({
          json: config.kind === 'reimbursement' ? { records: data, total: empty ? 0 : 2 } : data,
          headers: {
            'content-range': empty ? '*/0' : '0-1/2',
            'access-control-expose-headers': 'content-range'
          }
        })
      })
      await page.goto(
        `/tests/e2e/fixtures/receivable-workspace.html?kind=expense_${config.kind}&theme=${theme}`
      )
      await expect(page.getByRole('heading', { name: config.title, exact: true })).toBeVisible()
      await expect(page.getByText(`QA-${config.kind}-1`, { exact: true })).toBeVisible()
      await expect(page.getByText(`QA-${config.kind}-2`, { exact: true })).toBeVisible()
      const heading = page.getByRole('heading', { name: config.title, exact: true })
      await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
      await expect(heading).not.toBeVisible()
      await expect(page.getByRole('button', { name: '查询', exact: true })).toBeVisible()
      await expect(page.getByText(`QA-${config.kind}-2`, { exact: true })).toBeVisible()
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
        .toBe(true)
      await page.screenshot({ path: info.outputPath(`${config.kind}-focus.png`), fullPage: true })
      await page.getByRole('button', { name: '退出专注模式', exact: true }).click()
      await expect(heading).toBeVisible()
      await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
      await expect(heading).not.toBeVisible()
      await page.keyboard.press('Escape')
      await expect(heading).toBeVisible()
      if (config.kind === 'travel' || config.kind === 'loan') {
        await expect(
          page
            .getByRole('row')
            .filter({ hasText: `QA-${config.kind}-1` })
            .getByRole('button', { name: '编辑', exact: true })
        ).toBeEnabled()
        await expect(
          page
            .getByRole('row')
            .filter({ hasText: `QA-${config.kind}-2` })
            .getByRole('button', { name: '编辑', exact: true })
        ).toBeDisabled()
      }
      if (lineSource) {
        const lineResponse = page.waitForResponse(
          (response) => new URL(response.url()).pathname.endsWith(`/${lineSource.resource}`),
          { timeout: 15000 }
        )
        await page.getByText('按明细', { exact: true }).click()
        await lineResponse
        await expect(page.getByText(`QA-${config.kind}-1`, { exact: true })).toBeVisible()
        fail = true
        await page.getByRole('button', { name: '查询', exact: true }).click()
        await expect(page.getByRole('button', { name: /重新加载|重试/ }).first()).toBeVisible()
        fail = false
        await page
          .getByRole('button', { name: /重新加载|重试/ })
          .first()
          .click()
        await expect(page.getByText(`QA-${config.kind}-2`, { exact: true })).toBeVisible()
      }
      await expect(page.getByRole('button', { name: config.add, exact: true })).toBeEnabled()
      const before = reads
      await page.getByRole('button', { name: '查询', exact: true }).click()
      await expect.poll(() => reads).toBeGreaterThan(before)
      fail = true
      await page.getByRole('button', { name: '查询', exact: true }).click()
      await expect(page.getByRole('button', { name: /重新加载|重试/ }).first()).toBeVisible()
      fail = false
      empty = true
      await page
        .getByRole('button', { name: /重新加载|重试/ })
        .first()
        .click()
      await expect(page.getByText(`QA-${config.kind}-1`, { exact: true })).not.toBeVisible()
      empty = false
      await page.getByRole('button', { name: '重置', exact: true }).click()
      await expect(page.getByText(`QA-${config.kind}-2`, { exact: true })).toBeVisible()
      await page.screenshot({
        path: info.outputPath(`${config.kind}-two-records.png`),
        fullPage: true
      })
    })
  }
}
