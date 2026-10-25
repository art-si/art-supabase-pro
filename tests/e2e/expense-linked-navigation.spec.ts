import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(90000)

for (const config of [
  {
    kind: 'travel',
    label: '出差',
    table: 'fms_travel_application',
    permission: 'FinanceTravelApplication'
  },
  { kind: 'loan', label: '借款', table: 'fms_travel_loan', permission: 'FinanceLoanApplication' },
  {
    kind: 'repayment',
    label: '还款',
    table: 'fms_travel_repayment',
    permission: 'FinanceRepayment'
  }
]) {
  test(`${config.label}关联定位较慢旧单不覆盖新单或清除后的页面`, async ({ page }, info) => {
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    const records = [1, 2].map((i) => ({
      id: `link-${i}`,
      tenant_id: '11111111-1111-4111-8111-111111111111',
      application_no: `QA-LINK-${i}`,
      loan_no: `QA-LINK-${i}`,
      repayment_no: `QA-LINK-${i}`,
      status: 'draft',
      amount: 100,
      requested_amount: 100,
      loan_amount: 100,
      received_amount: 0,
      applicant_name: '隔离定位员工',
      loan_id: 'source-loan',
      reason: '定位验收',
      repayment_date: '2026-10-25',
      application_date: '2026-10-25',
      create_time: '2026-10-25T00:00:00Z',
      attachment_urls: [],
      items: [],
      receipts: [],
      itineraries: []
    }))
    let release = () => {}
    let held = 0
    let finished = 0
    let detailReads = 0
    let holdNext = true
    await page.route('**/rest/v1/**', async (route) => {
      const url = new URL(route.request().url())
      const name = url.pathname.split('/').at(-1)
      if (name === 'sys_dictionary') {
        const code = url.searchParams.get('dict_type_table.code')?.replace(/^eq\./, '') || ''
        const entries =
          code === 'commonDocumentDisplayMode'
            ? [
                ['document', '单据'],
                ['line', '明细']
              ]
            : code.startsWith('fms') && code.endsWith('Status')
              ? [['draft', '草稿']]
              : []
        return route.fulfill({
          json: entries.map(([value, label]) => ({
            id: `${code}-${value}`,
            code: value,
            value,
            label,
            status: '1',
            dict_type_table: { code }
          }))
        })
      }
      if (name === config.table) {
        const id = url.searchParams.get('id')?.replace(/^eq\./, '')
        if (id) {
          detailReads++
          if (id === 'link-1' && holdNext) {
            holdNext = false
            held++
            await new Promise<void>((resolve) => {
              release = resolve
            })
          }
          await route.fulfill({ json: records.find((row) => row.id === id) })
          finished++
          return
        }
        const filter = url.searchParams.get('or') || ''
        const visible = filter.includes('QA-LINK-1')
          ? records.slice(0, 1)
          : filter.includes('QA-LINK-2')
            ? records.slice(1)
            : records
        return route.fulfill({
          json: visible,
          headers: {
            'content-range': `0-${visible.length - 1}/${visible.length}`,
            'access-control-expose-headers': 'content-range'
          }
        })
      }
      if (name === 'fms_travel_loan')
        return route.fulfill({
          json: { id: 'source-loan', loan_no: '原借款', applicant_name: '隔离借款员工', items: [] }
        })
      return route.fulfill({ json: [] })
    })
    const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
    const url = `/tests/e2e/fixtures/receivable-workspace.html?kind=expense_${config.kind}&arNavigation=1&expenseLinks=1&theme=${theme}`
    await page.goto(`${url}&permissions=${config.permission}:View`)
    await expect(page.getByText('QA-LINK-1', { exact: true })).toBeVisible({ timeout: 60000 })
    const expand = page.getByRole('button', { name: '展开', exact: true })
    if (await expand.isVisible()) await expand.click()
    await page.getByRole('button', { name: '定位关联单1', exact: true }).click()
    await expect.poll(() => held).toBe(1)
    await page.getByRole('button', { name: '定位关联单2', exact: true }).click()
    const keyword = page.getByRole('textbox', { name: '关键词', exact: true })
    const drawer = page.getByRole('dialog', { name: '查看还款单 · QA-LINK-2', exact: true })
    if (config.kind === 'repayment') await expect(drawer).toBeVisible()
    else await expect(keyword).toHaveValue('QA-LINK-2')
    await expect(page.locator('.el-message')).toHaveCount(0)
    if (config.kind === 'repayment')
      await drawer.screenshot({ path: info.outputPath('linked-current.png') })
    else await page.screenshot({ path: info.outputPath('linked-current.png'), fullPage: true })
    release()
    await page.waitForLoadState('networkidle')
    if (config.kind === 'repayment') await expect(drawer).toBeVisible()
    else await expect(keyword).toHaveValue('QA-LINK-2')
    if (config.kind === 'repayment')
      await drawer.getByRole('button', { name: '关闭此对话框', exact: true }).click()
    holdNext = true
    await page.getByRole('button', { name: '定位关联单1', exact: true }).click()
    await expect.poll(() => held).toBe(2)
    await page.getByRole('button', { name: '清除关联定位', exact: true }).click()
    release()
    await page.waitForLoadState('networkidle')
    if (config.kind === 'repayment') await expect(page.getByRole('dialog')).toHaveCount(0)
    else await expect(keyword).toHaveValue('QA-LINK-2')
    expect(finished).toBe(detailReads)
    const previousReads = detailReads
    await page.goto(`${url}&permissions=`)
    await page.getByRole('button', { name: '定位关联单2', exact: true }).click()
    await page.waitForLoadState('networkidle')
    expect(detailReads).toBe(previousReads)
    expect(pageErrors).toEqual([])
  })
}
