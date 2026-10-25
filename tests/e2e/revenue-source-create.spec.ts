import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(90000)

const permissions = [
  'FinanceRevenueCost:View',
  'FinanceRevenueCost:Add',
  'FinanceEstimatedReceivable:View',
  'FinanceEstimatedReceivable:Push'
]

test('收入成本两来源新增、选择期间撤权及失败重试', async ({ page }, info) => {
  const tenant = '11111111-1111-4111-8111-111111111111'
  const sources = [1, 2].map((index) => ({
    id: `estimate-${index}`,
    tenant_id: tenant,
    document_no: `QA-ESTIMATE-${index}`,
    kind: 'estimate',
    status: 'approved',
    customer_name: `验收客户${index}`,
    settlement_organization_id: `department-${index}`,
    organization_name: `验收部门${index}`,
    amount: index * 100,
    total_amount: index * 100,
    business_date: '2026-10-25',
    currency_code: 'CNY',
    lines: []
  }))
  const created: Array<Record<string, unknown>> = []
  const attempts: string[] = []
  let fail = true
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url())
    const name = url.pathname.split('/').at(-1)
    const body = route.request().postDataJSON()
    if (name === 'sys_dictionary') {
      const code = (url.searchParams.get('dict_type_table.code') || '').replace(/^eq\./, '')
      return route.fulfill({
        json:
          code === 'arDocumentStatus'
            ? [
                {
                  id: 'draft',
                  code: 'draft',
                  value: 'draft',
                  label: '草稿',
                  status: '1',
                  dict_type_table: { code }
                }
              ]
            : []
      })
    }
    if (name === 'fms_receivable_workspace_secure') {
      const records = body.p_kind === 'estimate' ? sources : created
      return route.fulfill({ json: { records, total: records.length } })
    }
    if (name === 'fms_push_revenue_cost_secure') {
      attempts.push(body.p_estimate_id)
      if (fail)
        return route.fulfill({
          status: 409,
          json: { code: '23514', message: '来源已变化，请重新选择后重试' }
        })
      const source = sources.find((row) => row.id === body.p_estimate_id)
      expect(source).toBeDefined()
      created.push({
        ...source,
        id: `revenue-${created.length + 1}`,
        document_no: `QA-REVENUE-${created.length + 1}`,
        kind: 'revenue',
        estimate_id: source?.id,
        source_no: source?.document_no,
        status: 'draft',
        revenue_amount: source?.amount,
        cost_amount: null
      })
      return route.fulfill({ json: created.at(-1)?.id })
    }
    return route.fulfill({ json: [] })
  })
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  await page.goto(
    `/tests/e2e/fixtures/receivable-workspace.html?kind=revenue&theme=${theme}&permissionControls=1&permissions=${permissions.join(',')}`
  )
  if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/dark/)
  const select = async (index: number) => {
    await page.getByRole('button', { name: '新增', exact: true }).click()
    const picker = page.getByRole('dialog', { name: '选择已审核暂估应收', exact: true })
    await picker.getByText(`QA-ESTIMATE-${index}`, { exact: true }).click()
    return picker
  }
  for (const index of [1, 2]) {
    const before = attempts.length
    let picker = await select(index)
    await page.keyboard.press('Alt+Shift+4')
    await picker.getByRole('button', { name: '确定', exact: true }).click()
    await expect(page.locator('.el-message--warning')).toContainText('操作范围或权限已变化')
    expect(attempts).toHaveLength(before)
    await page.keyboard.press('Alt+Shift+5')
    picker = await select(index)
    await picker.getByRole('button', { name: '确定', exact: true }).click()
    if (index === 1) {
      await expect(page.locator('.el-message--error')).toContainText('来源已变化')
      fail = false
      picker = await select(index)
      await picker.getByRole('button', { name: '确定', exact: true }).click()
    }
    await expect(page.getByRole('row').filter({ hasText: `QA-REVENUE-${index}` })).toContainText(
      `${index * 100}.00`
    )
    await expect(page.locator('.el-message')).toHaveCount(0)
  }
  expect(attempts).toEqual(['estimate-1', 'estimate-1', 'estimate-2'])
  expect(created.map((row) => row.tenant_id)).toEqual([tenant, tenant])
  expect(created.map((row) => row.settlement_organization_id)).toEqual([
    'department-1',
    'department-2'
  ])
  expect(created.map((row) => row.estimate_id)).toEqual(['estimate-1', 'estimate-2'])
  await page.screenshot({ path: info.outputPath('revenue-created-two.png'), fullPage: true })
})

for (const missing of ['FinanceEstimatedReceivable:View', 'FinanceEstimatedReceivable:Push']) {
  test(`收入成本新增缺少${missing}时禁用来源入口`, async ({ page }, info) => {
    const reads: string[] = []
    await page.route('**/rest/v1/**', (route) => {
      const body = route.request().postDataJSON()
      if (body?.p_kind === 'estimate') reads.push(body.p_kind)
      return route.fulfill({ json: body?.p_kind ? { records: [], total: 0 } : [] })
    })
    const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
    await page.goto(
      `/tests/e2e/fixtures/receivable-workspace.html?kind=revenue&theme=${theme}&permissions=${permissions.filter((code) => code !== missing).join(',')}`
    )
    if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/dark/)
    await expect(page.getByRole('button', { name: '新增', exact: true })).toBeDisabled()
    await expect(page.getByText(/新增需具备暂估应收查看及下推权限/)).toBeVisible()
    expect(reads).toHaveLength(0)
  })
}
