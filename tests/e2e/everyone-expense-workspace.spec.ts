import { test, expect } from '@playwright/test'
import { installDictionaryOptions } from './support/dictionary-options'
import { assertTableFocusContract } from './support/table-focus'

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

test('借款明细取消中的旧请求不能改变已接受表格的合并行', async ({ page }, info) => {
  test.setTimeout(120_000)
  const renderErrors: string[] = []
  page.on('pageerror', (error) => renderErrors.push(error.message))
  page.on('console', (message) => {
    if (
      ['error', 'warning'].includes(message.type()) &&
      /VueError|Unhandled error during execution of render function/.test(message.text())
    ) {
      renderErrors.push(message.text())
    }
  })
  const tenantId = '11111111-1111-4111-8111-111111111111'
  const loan = (id: string, loanNo: string) => ({
    id,
    tenant_id: tenantId,
    loan_no: loanNo,
    application_date: '2026-10-23',
    status: 'draft',
    total_amount: 200,
    amount: 200,
    attachment_urls: []
  })
  const line = (id: string, parent: ReturnType<typeof loan>, lineNo: number) => ({
    id,
    tenant_id: tenantId,
    line_no: lineNo,
    loan: parent,
    expense_item: { item_name: '验收费用' },
    amount: 100
  })
  const accepted = loan('loan-b', 'QA-B')
  const acceptedLines = [line('b-1', accepted, 1), line('b-2', accepted, 2)]
  const lateLines = [
    line('a-1', loan('loan-a-1', 'QA-A-1'), 1),
    line('a-2', loan('loan-a-2', 'QA-A-2'), 1)
  ]
  let holdFirstLineRequest = true
  let releaseFirst: (() => void) | undefined
  let signalFirstStarted: (() => void) | undefined
  const firstStarted = new Promise<void>((resolve) => {
    signalFirstStarted = resolve
  })
  const firstRelease = new Promise<void>((resolve) => {
    releaseFirst = resolve
  })
  let holdNextLineRequest = false
  let releaseLate: (() => void) | undefined
  let signalLateStarted: (() => void) | undefined
  const lateStarted = new Promise<void>((resolve) => {
    signalLateStarted = resolve
  })
  const lateRelease = new Promise<void>((resolve) => {
    releaseLate = resolve
  })
  await page.route('**/rest/v1/**', async (route) => {
    const resource = new URL(route.request().url()).pathname.split('/').at(-1)
    if (resource === 'fms_travel_loan_item') {
      if (holdFirstLineRequest) {
        holdFirstLineRequest = false
        signalFirstStarted?.()
        await firstRelease
      }
      const isLate = holdNextLineRequest
      if (isLate) {
        holdNextLineRequest = false
        signalLateStarted?.()
        await lateRelease
      }
      return route.fulfill({
        json: isLate ? lateLines : acceptedLines,
        headers: { 'content-range': '0-1/2', 'access-control-expose-headers': 'content-range' }
      })
    }
    if (resource === 'fms_travel_loan') {
      return route.fulfill({
        json: [accepted],
        headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
      })
    }
    return route.fulfill({ json: [] })
  })
  await installDictionaryOptions(page, {
    commonDocumentDisplayMode: [
      { value: 'document', label: '按单据' },
      { value: 'line', label: '按明细' }
    ]
  })
  await page.goto(
    '/tests/e2e/fixtures/receivable-workspace.html?kind=expense_loan&permissions=FinanceLoanApplication:View'
  )
  await expect(page.getByRole('heading', { name: '借款单', exact: true })).toBeVisible()
  const appearanceGuide = page.getByText('知道了', { exact: true })
  if (await appearanceGuide.isVisible()) {
    await appearanceGuide.click()
    await expect(appearanceGuide).toBeHidden()
  }
  const table = page.locator('.art-table-query .el-table')
  await expect(table.locator('tbody tr.el-table__row')).toHaveCount(1)
  await page.getByText('按明细', { exact: true }).click()
  await firstStarted
  await expect(table.locator('tbody tr.el-table__row')).toHaveCount(1)
  await page.screenshot({ path: info.outputPath('loan-document-to-line-pending.png') })
  expect(renderErrors).toEqual([])
  releaseFirst?.()
  const numberCell = table
    .locator('tbody tr.el-table__row')
    .first()
    .locator('td')
    .filter({ hasText: 'QA-B' })
  await expect(table.locator('tbody tr.el-table__row')).toHaveCount(2)
  await expect(numberCell).toHaveAttribute('rowspan', '2')

  holdNextLineRequest = true
  const olderRequest = page.locator('.art-table-query').evaluate(async (element) => {
    const api = (
      element as HTMLElement & {
        __vueParentComponent?: { exposed?: { getData?: () => Promise<unknown> } }
      }
    ).__vueParentComponent?.exposed
    if (!api?.getData) throw new Error('ArtTableQuery.getData is unavailable')
    await api.getData()
  })
  await lateStarted
  await page.locator('.art-table-query').evaluate((element) => {
    const api = (
      element as HTMLElement & {
        __vueParentComponent?: { exposed?: { cancelRequest?: () => void } }
      }
    ).__vueParentComponent?.exposed
    if (!api?.cancelRequest) throw new Error('ArtTableQuery.cancelRequest is unavailable')
    api.cancelRequest()
  })
  releaseLate?.()
  await olderRequest
  await expect(table.locator('tbody tr.el-table__row')).toHaveCount(2)
  await expect(table.getByText('QA-A-1', { exact: true })).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('loan-cancelled-late-response.png') })
  await expect(numberCell).toHaveAttribute('rowspan', '2')
  await expect(table.getByText('QA-B', { exact: true })).toHaveCount(1)
  expect(renderErrors).toEqual([])
})

const expenseScenarios = [
  {
    kind: 'travel',
    title: '出差申请单',
    permission: 'FinanceTravelApplication:View',
    list: 'fms_travel_application',
    lines: 'fms_travel_itinerary',
    parent: 'application',
    number: 'application_no'
  },
  {
    kind: 'loan',
    title: '借款单',
    permission: 'FinanceLoanApplication:View',
    list: 'fms_travel_loan',
    lines: 'fms_travel_loan_item',
    parent: 'loan',
    number: 'loan_no'
  },
  {
    kind: 'repayment',
    title: '还款单',
    permission: 'FinanceRepayment:View',
    list: 'fms_travel_repayment',
    lines: 'fms_travel_repayment_item',
    parent: 'repayment',
    number: 'repayment_no'
  },
  {
    kind: 'reimbursement',
    title: '费用报销单',
    permission: 'FinanceExpenseReimbursement:View',
    list: 'fms_list_expense_reimbursements_secure',
    lines: 'fms_list_expense_reimbursement_lines_secure',
    parent: 'reimbursement',
    number: 'reimbursement_no'
  }
] as const

for (const scenario of expenseScenarios) {
  test(`${scenario.title}按明细合并使用已接受行并可退出专注模式`, async ({ page }, info) => {
    test.setTimeout(180_000)
    const renderErrors: string[] = []
    page.on('pageerror', (error) => renderErrors.push(error.message))
    page.on('console', (message) => {
      if (
        ['error', 'warning'].includes(message.type()) &&
        /VueError|Unhandled error during execution of render function/.test(message.text())
      )
        renderErrors.push(message.text())
    })
    const document = {
      id: 'group-document',
      tenant_id: '11111111-1111-4111-8111-111111111111',
      [scenario.number]: 'QA-GROUP',
      application_date: '2026-10-23',
      repayment_date: '2026-10-23',
      reimbursement_date: '2026-10-23',
      status: 'draft',
      source_type: 'travel',
      is_demo: true,
      attachment_urls: [],
      total_amount: 200,
      amount: 200
    }
    const lines = [1, 2].map((lineNo) => ({
      id: `group-line-${lineNo}`,
      tenant_id: document.tenant_id,
      line_no: lineNo,
      [scenario.parent]: document,
      reimbursement_id: document.id,
      repayment_id: document.id,
      expense_item: { item_name: '验收费用' },
      expense_item_name: '验收费用',
      source_type: 'travel',
      amount: 100,
      gross_amount: 100,
      departure_region_path: [],
      destination_region_path: [],
      transport_modes: [],
      traveler_employee_ids: []
    }))
    let holdFirstLine = scenario.kind === 'travel' || scenario.kind === 'loan'
    let signalLineStarted: (() => void) | undefined
    let releaseLine: (() => void) | undefined
    const lineStarted = new Promise<void>((resolve) => {
      signalLineStarted = resolve
    })
    const lineRelease = new Promise<void>((resolve) => {
      releaseLine = resolve
    })
    await page.route('**/rest/v1/**', async (route) => {
      const resource = new URL(route.request().url()).pathname.split('/').at(-1)
      if (resource === scenario.lines) {
        if (holdFirstLine) {
          holdFirstLine = false
          signalLineStarted?.()
          await lineRelease
        }
        return route.fulfill({
          json: scenario.kind === 'reimbursement' ? { records: lines, total: 2 } : lines,
          headers: { 'content-range': '0-1/2', 'access-control-expose-headers': 'content-range' }
        })
      }
      if (resource === scenario.list) {
        return route.fulfill({
          json: scenario.kind === 'reimbursement' ? { records: [document], total: 1 } : [document],
          headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
        })
      }
      return route.fulfill({ json: [] })
    })
    await installDictionaryOptions(page, {
      commonDocumentDisplayMode: [
        { value: 'document', label: '按单据' },
        { value: 'line', label: '按明细' }
      ]
    })
    await page.goto(
      `/tests/e2e/fixtures/receivable-workspace.html?kind=expense_${scenario.kind}&permissions=${scenario.permission}`,
      { waitUntil: 'domcontentloaded' }
    )
    await expect(page.getByRole('heading', { name: scenario.title, exact: true })).toBeVisible()
    const appearanceGuide = page.getByText('知道了', { exact: true })
    if (await appearanceGuide.isVisible()) {
      await appearanceGuide.click()
      await expect(appearanceGuide).toBeHidden()
    }
    const table = page.locator('.art-table-query .el-table')
    await expect(table.locator('tbody tr.el-table__row')).toHaveCount(1)
    await page.getByText('按明细', { exact: true }).click()
    if (scenario.kind === 'travel' || scenario.kind === 'loan') {
      await lineStarted
      await expect(table.locator('tbody tr.el-table__row')).toHaveCount(1)
      expect(renderErrors).toEqual([])
      await page.screenshot({ path: info.outputPath(`${scenario.kind}-line-pending.png`) })
      releaseLine?.()
    }
    await expect(table.locator('tbody tr.el-table__row')).toHaveCount(2)
    const numberCell = table
      .locator('tbody tr.el-table__row')
      .first()
      .locator('td')
      .filter({ hasText: 'QA-GROUP' })
    await expect(numberCell).toHaveAttribute('rowspan', '2')
    await page.screenshot({ path: info.outputPath(`${scenario.kind}-grouped-lines.png`) })
    await assertTableFocusContract(page, info)
    expect(renderErrors).toEqual([])
  })
}

for (const scenario of expenseScenarios) {
  for (const mode of ['document', 'line'] as const) {
    test(`${scenario.title}${mode === 'line' ? '明细' : '单据'}请求切换会中止旧请求并接受新行`, async ({
      page
    }, info) => {
      test.setTimeout(240_000)
      const pageErrors: string[] = []
      page.on('pageerror', (error) => pageErrors.push(error.message))
      const tenantId = '11111111-1111-4111-8111-111111111111'
      const parent = (suffix: string) => ({
        id: `document-${suffix}`,
        tenant_id: tenantId,
        [scenario.number]: `QA-${suffix}`,
        application_date: '2026-10-23',
        repayment_date: '2026-10-23',
        reimbursement_date: '2026-10-23',
        status: 'draft',
        source_type: 'travel',
        amount: 200,
        total_amount: 200,
        attachment_urls: []
      })
      const rows = (suffix: string, shape: 'document' | 'line' = mode) => {
        const document = parent(suffix)
        return shape === 'document'
          ? [document]
          : [1, 2].map((lineNo) => ({
              id: `line-${suffix}-${lineNo}`,
              tenant_id: tenantId,
              line_no: lineNo,
              [scenario.parent]: document,
              reimbursement_id: document.id,
              repayment_id: document.id,
              expense_item: { item_name: '验收费用' },
              expense_item_name: '验收费用',
              amount: 100,
              gross_amount: 100,
              departure_region_path: [],
              destination_region_path: [],
              transport_modes: [],
              traveler_employee_ids: []
            }))
      }
      const target = mode === 'line' ? scenario.lines : scenario.list
      let armRace = false
      let raceReads = 0
      let releaseA: (() => void) | undefined
      let signalAStarted: (() => void) | undefined
      const aStarted = new Promise<void>((resolve) => (signalAStarted = resolve))
      const aRelease = new Promise<void>((resolve) => (releaseA = resolve))
      await page.route('**/rest/v1/**', async (route) => {
        const resource = new URL(route.request().url()).pathname.split('/').at(-1)
        if (resource !== scenario.list && resource !== scenario.lines)
          return route.fulfill({ json: [] })
        if (resource === target && armRace) {
          raceReads++
          if (raceReads === 1) {
            signalAStarted?.()
            await aRelease
            try {
              await route.fulfill({
                json:
                  scenario.kind === 'reimbursement' ? { records: rows('A'), total: 2 } : rows('A'),
                headers: {
                  'content-range': '0-1/2',
                  'access-control-expose-headers': 'content-range'
                }
              })
            } catch (error) {
              if (!route.request().failure()) throw error
            }
            return
          }
        }
        const data = rows(
          resource === target && armRace ? 'B' : 'SEED',
          resource === scenario.list ? 'document' : 'line'
        )
        return route.fulfill({
          json: scenario.kind === 'reimbursement' ? { records: data, total: 2 } : data,
          headers: {
            'content-range': '0-1/2',
            'access-control-expose-headers': 'content-range'
          }
        })
      })
      await installDictionaryOptions(page, {
        commonDocumentDisplayMode: [
          { value: 'document', label: '按单据' },
          { value: 'line', label: '按明细' }
        ]
      })
      await page.goto(
        `/tests/e2e/fixtures/receivable-workspace.html?kind=expense_${scenario.kind}&permissions=${scenario.permission}`,
        { waitUntil: 'domcontentloaded' }
      )
      const table = page.locator('.art-table-query .el-table')
      await expect(page.getByText('QA-SEED', { exact: true })).toBeVisible()
      const appearanceGuide = page.getByText('知道了', { exact: true })
      if (await appearanceGuide.isVisible()) await appearanceGuide.click()
      if (mode === 'line') {
        await page.getByText('按明细', { exact: true }).click()
        await expect(table.locator('tbody tr.el-table__row')).toHaveCount(2)
      }
      armRace = true
      const failedA = page.waitForEvent('requestfailed', {
        predicate: (request) => new URL(request.url()).pathname.endsWith(`/${target}`),
        timeout: 15_000
      })
      const refresh = () =>
        page.locator('.art-table-query').evaluate(async (element) => {
          const api = (
            element as HTMLElement & {
              __vueParentComponent?: { exposed?: { getData?: () => Promise<unknown> } }
            }
          ).__vueParentComponent?.exposed
          if (!api?.getData) throw new Error('ArtTableQuery.getData is unavailable')
          await api.getData()
        })
      const olderRequest = refresh()
      await aStarted
      await refresh()
      await expect.poll(() => raceReads).toBe(2)
      const aborted = await failedA
      expect(aborted.failure()?.errorText).toMatch(/ERR_ABORTED|NS_BINDING_ABORTED|cancel/i)
      await expect(page.getByText('QA-B', { exact: true })).toBeVisible()
      await expect(table.locator('tbody tr.el-table__row')).toHaveCount(mode === 'line' ? 2 : 1)
      await expect(page.locator('.el-pagination__total')).toHaveText(/共\s*2\s*条/)
      if (mode === 'line') {
        const numberCell = table
          .locator('tbody tr.el-table__row')
          .first()
          .locator('td')
          .filter({ hasText: 'QA-B' })
        await expect(numberCell).toHaveAttribute('rowspan', '2')
      }
      if (scenario.kind === 'reimbursement' && mode === 'line') {
        await page.screenshot({ path: info.outputPath('reimbursement-abort-accepted-lines.png') })
      }
      releaseA?.()
      await olderRequest
      await expect(page.getByText('QA-A', { exact: true })).toHaveCount(0)
      await expect(page.getByText('QA-B', { exact: true })).toBeVisible()
      await expect(page.locator('.el-message--error')).toHaveCount(0)
      expect(pageErrors).toEqual([])
    })
  }
}

test('借款单无信号的全量导出读取不受表格刷新取消影响', async ({ page }) => {
  test.setTimeout(300_000)
  const failedUrls: string[] = []
  page.on('requestfailed', (request) => failedUrls.push(request.url()))
  const record = (suffix: string) => ({
    id: `loan-${suffix}`,
    tenant_id: '11111111-1111-4111-8111-111111111111',
    loan_no: `QA-${suffix}`,
    application_date: '2026-10-23',
    status: 'draft',
    amount: 100,
    total_amount: 100,
    attachment_urls: []
  })
  let releaseExport: (() => void) | undefined
  let signalExportStarted: (() => void) | undefined
  const exportStarted = new Promise<void>((resolve) => (signalExportStarted = resolve))
  const exportRelease = new Promise<void>((resolve) => (releaseExport = resolve))
  let tableReads = 0
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    if (!url.pathname.endsWith('/fms_travel_loan')) return route.fulfill({ json: [] })
    if (url.searchParams.get('limit') === '500') {
      signalExportStarted?.()
      await exportRelease
      return route.fulfill({
        json: [record('EXPORT-1'), record('EXPORT-2')],
        headers: { 'content-range': '0-1/2', 'access-control-expose-headers': 'content-range' }
      })
    }
    tableReads++
    return route.fulfill({
      json: [record(tableReads === 1 ? 'SEED' : 'REFRESH')],
      headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
    })
  })
  await page.goto(
    '/tests/e2e/fixtures/receivable-workspace.html?kind=expense_loan&permissions=FinanceLoanApplication:View&loanExportProbe',
    { waitUntil: 'domcontentloaded' }
  )
  await expect(page.getByText('QA-SEED', { exact: true })).toBeVisible()
  const exportResult = page.evaluate(async () => {
    const probe = (
      window as Window & { __loanExportProbe?: () => Promise<Array<{ loanNo: string }>> }
    ).__loanExportProbe
    if (!probe) throw new Error('Loan export probe is unavailable')
    return probe()
  })
  await exportStarted
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expect(page.getByText('QA-REFRESH', { exact: true })).toBeVisible()
  releaseExport?.()
  expect((await exportResult).map((row) => row.loanNo)).toEqual(['QA-EXPORT-1', 'QA-EXPORT-2'])
  await expect(page.getByText('QA-REFRESH', { exact: true })).toBeVisible()
  expect(failedUrls.filter((url) => new URL(url).searchParams.get('limit') === '500')).toEqual([])
})
