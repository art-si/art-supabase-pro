import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(90000)

for (const kind of ['estimate', 'financial']) {
  test(`${kind} 下推调整勾稽与凭证的状态入口`, async ({ page }, info) => {
    let state = { status: 'draft', kind, is_credit: false, estimate_id: null as string | null }
    await page.route('**/rest/v1/**', (route) => {
      const url = new URL(route.request().url())
      const name = url.pathname.split('/').at(-1)
      if (name === 'sys_dictionary') {
        const code = (url.searchParams.get('dict_type_table.code') || '').replace(/^eq\./, '')
        const pairs =
          code === 'arDocumentStatus'
            ? [
                ['draft', '草稿'],
                ['submitted', '已提交'],
                ['approved', '已审核']
              ]
            : code === 'arViewMode'
              ? [
                  ['document', '按单据'],
                  ['line', '按明细']
                ]
              : []
        return route.fulfill({
          json: pairs.map(([value, label]) => ({
            id: `${code}-${value}`,
            code: value,
            value,
            label,
            status: '1',
            dict_type_table: { code }
          }))
        })
      }
      if (name === 'fms_receivable_workspace_secure')
        return route.fulfill({
          json: {
            records: [1, 2].map((index) => ({
              id: `ar-state-${index}`,
              document_no: `QA-AR-STATE-${index}`,
              ...state,
              customer_name: '隔离应收状态客户',
              business_date: '2026-10-24',
              currency_code: 'CNY',
              amount: index * 100,
              tax_amount: 0,
              total_amount: index * 100,
              available_amount: index * 100,
              outstanding_amount: index * 100,
              unmatched_amount: index * 100,
              uninvoiced_amount: index * 100,
              lines: []
            })),
            total: 2
          }
        })
      return route.fulfill({ json: [] })
    })
    const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
    await page.goto(`/tests/e2e/fixtures/receivable-workspace.html?kind=${kind}&theme=${theme}`)
    for (const entry of [
      { status: 'draft', kind, is_credit: false, estimate_id: null },
      { status: 'submitted', kind, is_credit: false, estimate_id: null },
      { status: 'approved', kind, is_credit: false, estimate_id: null },
      { status: 'approved', kind: 'reversal', is_credit: false, estimate_id: null },
      { status: 'approved', kind, is_credit: true, estimate_id: null },
      { status: 'approved', kind, is_credit: false, estimate_id: 'linked-estimate' }
    ]) {
      state = entry
      const response = page.waitForResponse((result) =>
        result.url().endsWith('/fms_receivable_workspace_secure')
      )
      await page.getByRole('button', { name: '查询', exact: true }).click()
      await response
      const row = page.getByRole('row').filter({ hasText: 'QA-AR-STATE-1' })
      await row.locator('label.el-checkbox').click()
      const approved = state.status === 'approved'
      const mutable = state.kind !== 'reversal'
      const expected: Array<[string, boolean]> = [
        ['提交', state.status === 'draft' && mutable],
        ['审核', state.status === 'submitted' && mutable],
        ['批量删除', state.status === 'draft' && mutable],
        ['下推', approved && mutable],
        ['生成凭证', approved],
        ['打印', true]
      ]
      if (kind === 'financial')
        expected.push(
          ['应收调整', approved && mutable],
          ['先开票勾稽', approved && mutable && !state.is_credit && !state.estimate_id]
        )
      for (const [name, allowed] of expected) {
        const button = page.getByRole('button', { name, exact: true })
        await expect(button).toBeVisible()
        if (allowed) await expect(button).toBeEnabled()
        else await expect(button).toBeDisabled()
      }
      if (approved && mutable && !state.is_credit && !state.estimate_id)
        await page.screenshot({
          path: info.outputPath(`${kind}-approved-buttons.png`),
          fullPage: true
        })
    }
  })
}
