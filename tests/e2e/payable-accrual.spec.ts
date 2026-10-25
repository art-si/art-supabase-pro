import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(150000)

test('自动暂估两参数新增编辑、组织树、保存失败重试及普通只读入口', async ({ page }, info) => {
  const permissions = 'FinanceEstimatedPayable:View,FinanceEstimatedPayable:Accrual'
  const policies = [1, 2].map((index) => ({
    id: `policy-${index}`,
    tenant_id: 'tenant-a',
    code: `QA-ACCRUAL-${index}`,
    name: `暂估参数${index}`,
    organization_id: 'company-a',
    organization_name: '测试公司',
    account_set_id: 'book-a',
    account_set_name: '人民币账套',
    effective_from: '2026-10-01',
    enabled: false,
    auto_approve: false,
    tax_excluded_from_cost: true,
    version: 1,
    actor_name: '测试操作员',
    generated_count: 0,
    locked: false,
    remark: ''
  }))
  policies.splice(0)
  let failSave = true
  let allowAutoApprove = false
  let references = true
  let failCheck = true
  let concurrent = true
  let concurrentHistory = false
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  const deletions: string[] = []
  const checks: string[] = []
  const saved: Array<Record<string, unknown>> = []
  const linkedReads: string[] = []
  await page.route('**/rest/v1/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    const input = route.request().postDataJSON() || {}
    if (name === 'fms_payable_accrual_delete_dependencies_secure') {
      const id = input.p_ids[0]
      checks.push(id)
      if (id === 'policy-2' && failCheck) {
        failCheck = false
        return route.fulfill({
          status: 503,
          json: { code: 'PGRST000', message: 'database unavailable' }
        })
      }
      return route.fulfill({
        json:
          (references && id === 'policy-1') || (concurrentHistory && id === 'policy-2')
            ? [
                {
                  resource_id: id,
                  dependency_code: 'accrual_run',
                  record_id: 'run-1',
                  target_id: 'payable-1',
                  record_no: 'QA-历史暂估001',
                  record_status: '已生成',
                  record_summary: '保留生成历史',
                  created_at: '2026-10-25T00:00:00Z',
                  cleanup_allowed: false
                }
              ]
            : []
      })
    }
    if (name === 'fms_delete_payable_accrual_policy_secure') {
      deletions.push(input.p_id)
      if (concurrent && input.p_id === 'policy-2') {
        concurrent = false
        concurrentHistory = true
        return route.fulfill({
          status: 409,
          json: { code: '23503', message: '参数已被引用或仍在启用，请重新检查关联记录' }
        })
      }
      const index = policies.findIndex((row) => row.id === input.p_id)
      if (index >= 0) policies.splice(index, 1)
      return route.fulfill({ json: null })
    }
    if (name === 'sys_dictionary') {
      const code = new URL(route.request().url()).searchParams
        .get('dict_type_table.code')
        ?.replace(/^eq\./, '')
      return route.fulfill({
        json:
          code === 'commonBoolean'
            ? [
                ['true', '是'],
                ['false', '否']
              ].map(([value, label]) => ({
                id: `boolean-${value}`,
                value,
                code: value,
                label,
                status: '1',
                dict_type_table: { code }
              }))
            : []
      })
    }
    if (name === 'fms_payable_accrual_workspace_secure')
      return route.fulfill({
        json: {
          configurations: { data: policies, total: policies.length },
          gaps: { data: [], total: 0 },
          organizations: [1, 2].map((index) => ({
            id: `company-${index}`,
            tenant_id: 'tenant-a',
            name: `测试公司${index}`,
            code: `CO${index}`
          })),
          books: [
            { id: 'book-a', tenant_id: 'tenant-a', name: '人民币账套', code: 'BOOK' },
            { id: 'book-foreign', tenant_id: 'tenant-b', name: '其他租户账套', code: 'FOREIGN' }
          ],
          periods: [],
          actor_name: '测试操作员',
          can_auto_approve: allowAutoApprove,
          can_read_sources: false
        }
      })
    if (name === 'mdm_organization')
      return route.fulfill({
        json: [
          {
            id: 'group-a',
            tenant_id: 'tenant-a',
            parent_id: null,
            organization_code: 'GROUP',
            organization_name: '测试集团',
            sort: 0
          },
          ...[1, 2].map((index) => ({
            id: `company-${index}`,
            tenant_id: 'tenant-a',
            parent_id: 'group-a',
            organization_code: 'CO',
            organization_name: `测试公司${index}`,
            sort: 1
          }))
        ]
      })
    if (name === 'fms_save_payable_accrual_policy_secure') {
      saved.push(input.p_policy)
      if (failSave && input.p_policy.id) {
        failSave = false
        return route.fulfill({
          status: 409,
          json: { code: '40001', message: '参数已由其他人员修改，请刷新后重试' }
        })
      }
      const row = policies.find((row) => row.id === input.p_policy.id)
      const id = input.p_policy.id || `policy-${policies.length + 1}`
      if (row) Object.assign(row, input.p_policy)
      else
        policies.push({
          ...input.p_policy,
          id,
          tenant_id: 'tenant-a',
          organization_name: `测试公司${policies.length + 1}`,
          account_set_name: '人民币账套',
          actor_name: '测试操作员',
          generated_count: 0,
          locked: false,
          version: 1
        })
      return route.fulfill({ json: id })
    }
    if (name === 'fms_purchase_payable_list_secure') {
      if (input.p_id === 'payable-1') {
        linkedReads.push(input.p_id)
        return route.fulfill({
          json: {
            data: [
              {
                id: 'payable-1',
                document_no: 'QA-历史暂估001',
                kind: 'estimated',
                status: 'approved',
                amount: 100,
                total_amount: 100,
                tax_amount: 0,
                currency_code: 'CNY',
                business_date: '2026-10-01',
                source_type: 'purchase_inbound',
                lines: []
              }
            ],
            total: 1
          }
        })
      }
      return route.fulfill({ json: { data: [], total: 0 } })
    }
    return route.fulfill({ json: [] })
  })
  await page.goto(
    `/tests/e2e/fixtures/purchase-payable.html?kind=estimated&permissions=${permissions}`
  )
  await page.getByRole('button', { name: '自动暂估参数', exact: true }).click()
  const manager = page.getByRole('dialog', { name: '自动暂估管理', exact: true })
  await expect(manager.getByRole('button', { name: '新增参数', exact: true })).toBeVisible()
  for (const index of [1, 2]) {
    await manager.getByRole('button', { name: '新增参数', exact: true }).click()
    const editor = page.getByRole('dialog', { name: '新增自动暂估参数', exact: true })
    await expect(
      editor
        .getByRole('radiogroup', { name: /^启用自动生成/ })
        .getByRole('radio', { name: '是', exact: true })
    ).toBeDisabled()
    await expect(
      editor
        .getByRole('radiogroup', { name: /^自动审核暂估/ })
        .getByRole('radio', { name: '是', exact: true })
    ).toBeDisabled()
    await editor.getByRole('textbox', { name: /参数编码/ }).fill(`QA-ACCRUAL-${index}`)
    await editor.getByRole('textbox', { name: /参数名称/ }).fill(`暂估参数${index}`)
    await editor.getByRole('combobox', { name: /库存组织/ }).click()
    const group = page.getByRole('treeitem', { name: '测试集团', exact: true })
    await expect(group).toHaveAttribute('aria-disabled', 'true')
    await group.locator('.el-tree-node__expand-icon').first().click()
    await page
      .getByRole('treeitem', { name: `测试公司${index}`, exact: true })
      .getByText(`测试公司${index}`, { exact: true })
      .click()
    await editor.getByRole('combobox', { name: /人民币账套/ }).click()
    await expect(page.getByRole('option', { name: '其他租户账套', exact: true })).toHaveCount(0)
    await page.getByRole('option', { name: '人民币账套', exact: true }).click()
    await editor.getByRole('combobox', { name: /生效日期/ }).fill('2026-10-01')
    await editor.getByRole('textbox', { name: /参数名称/ }).click()
    if (index === 2) await editor.screenshot({ path: info.outputPath('accrual-editor.png') })
    await editor.getByRole('button', { name: '保存参数', exact: true }).click()
    await expect(editor).not.toBeVisible()
  }
  await expect(manager.getByText('QA-ACCRUAL-1', { exact: true })).toBeVisible()
  await expect(manager.getByText('QA-ACCRUAL-2', { exact: true })).toBeVisible()
  await expect(manager.getByRole('button', { name: '删除', exact: true })).toHaveCount(0)
  for (const index of [1, 2]) {
    await manager
      .getByRole('row')
      .filter({ hasText: `QA-ACCRUAL-${index}` })
      .getByRole('button', { name: '编辑', exact: true })
      .click()
    const editor = page.getByRole('dialog', { name: '编辑自动暂估参数', exact: true })
    await expect(editor.getByText('库存组织', { exact: true })).toBeVisible()
    await editor.getByRole('textbox', { name: /参数名称/ }).fill(`回归参数${index}`)
    await editor.getByRole('button', { name: '保存参数', exact: true }).click()
    if (index === 1) {
      await expect(editor).toBeVisible()
      await expect(editor.getByRole('textbox', { name: /参数名称/ })).toHaveValue('回归参数1')
      await editor.getByRole('button', { name: '保存参数', exact: true }).click()
    }
    await expect(editor).not.toBeVisible()
    await expect(manager.getByText(`回归参数${index}`, { exact: true })).toBeVisible()
  }
  expect(saved.map((row) => row.id)).toEqual([
    undefined,
    undefined,
    'policy-1',
    'policy-1',
    'policy-2'
  ])
  expect(saved.every((row) => row.enabled === false && row.auto_approve === false)).toBe(true)
  await expect(page.locator('.el-message')).toHaveCount(0)
  await manager.locator('.el-scrollbar__wrap').evaluateAll((elements) =>
    elements.forEach((element) => {
      element.scrollLeft = 0
    })
  )
  await manager.screenshot({ path: info.outputPath('accrual-manager.png') })
  allowAutoApprove = true
  await page.goto(
    `/tests/e2e/fixtures/purchase-payable.html?kind=estimated&permissions=${permissions},FinanceEstimatedPayable:Add,FinanceEstimatedPayable:Submit,FinanceEstimatedPayable:Approve,WmsPurchaseInbound:View,WmsPurchaseInbound:Push`
  )
  await page.getByRole('button', { name: '自动暂估参数', exact: true }).click()
  for (const index of [1, 2]) {
    await manager
      .getByRole('row')
      .filter({ hasText: `QA-ACCRUAL-${index}` })
      .getByRole('button', { name: '编辑', exact: true })
      .click()
    const editor = page.getByRole('dialog', { name: '编辑自动暂估参数', exact: true })
    await editor
      .getByRole('radiogroup', { name: /^启用自动生成/ })
      .getByText('是', { exact: true })
      .click()
    await editor
      .getByRole('radiogroup', { name: /^自动审核暂估/ })
      .getByText('是', { exact: true })
      .click()
    const previous = saved.length
    await editor.getByRole('button', { name: '保存参数', exact: true }).click()
    const confirm = page.getByRole('dialog', { name: '启用自动暂估', exact: true })
    if (index === 1) {
      await confirm.getByRole('button', { name: '取消', exact: true }).click()
      await expect(editor.getByRole('button', { name: '保存参数', exact: true })).toBeEnabled()
      expect(saved).toHaveLength(previous)
      await editor.getByRole('button', { name: '保存参数', exact: true }).click()
    }
    await confirm.getByRole('button', { name: '确定', exact: true }).click()
    await expect(editor).toBeHidden()
    expect(saved.at(-1)).toMatchObject({ id: `policy-${index}`, enabled: true, auto_approve: true })
  }
  allowAutoApprove = false
  await page.goto(
    `/tests/e2e/fixtures/purchase-payable.html?kind=estimated&permissions=${permissions}`
  )
  await page.getByRole('button', { name: '自动暂估参数', exact: true }).click()
  for (const index of [1, 2]) {
    await manager
      .getByRole('row')
      .filter({ hasText: `QA-ACCRUAL-${index}` })
      .getByRole('button', { name: '编辑', exact: true })
      .click()
    const editor = page.getByRole('dialog', { name: '编辑自动暂估参数', exact: true })
    await editor
      .getByRole('radiogroup', { name: /^启用自动生成/ })
      .getByText('否', { exact: true })
      .click()
    await editor
      .getByRole('radiogroup', { name: /^自动审核暂估/ })
      .getByText('否', { exact: true })
      .click()
    await editor.getByRole('button', { name: '保存参数', exact: true }).click()
    await expect(editor).toBeHidden()
    expect(saved.at(-1)).toMatchObject({
      id: `policy-${index}`,
      enabled: false,
      auto_approve: false
    })
  }
  await page.goto(
    `/tests/e2e/fixtures/purchase-payable.html?kind=estimated&permissions=${permissions},FinanceEstimatedPayable:AccrualDelete`
  )
  await page.getByRole('button', { name: '自动暂估参数', exact: true }).click()
  const remove = (index: number) =>
    manager
      .getByRole('row')
      .filter({ hasText: `QA-ACCRUAL-${index}` })
      .getByRole('button', { name: '删除', exact: true })
  await remove(1).click()
  const guard = page.getByRole('dialog', { name: '暂时无法删除自动暂估参数', exact: true })
  await expect(guard.getByText('QA-历史暂估001', { exact: true })).toBeVisible()
  expect(deletions).toHaveLength(0)
  await guard.screenshot({ path: info.outputPath('accrual-delete-guard.png') })
  await guard.getByRole('button', { name: '查看暂估单', exact: true }).click()
  await expect(guard).toBeHidden()
  await expect(manager).toBeHidden()
  await expect(page.getByRole('row').filter({ hasText: 'QA-历史暂估001' })).toBeVisible()
  expect(linkedReads).toContain('payable-1')
  await page.getByRole('button', { name: '自动暂估参数', exact: true }).click()
  await remove(2).click()
  const failure = page.getByRole('dialog', { name: '删除检查未完成', exact: true })
  await expect(failure).toBeVisible()
  expect(deletions).toHaveLength(0)
  await failure.getByRole('button', { name: '重新检查', exact: true }).click()
  await expect(failure).toBeHidden()
  expect(deletions).toHaveLength(0)
  const confirmDelete = () =>
    page
      .getByRole('dialog', { name: '删除确认', exact: true })
      .getByRole('button', { name: '删除', exact: true })
      .click()
  await remove(2).click()
  const checksBefore = checks.length
  await confirmDelete()
  await expect.poll(() => checks.length).toBeGreaterThan(checksBefore)
  await expect(manager.getByText('QA-ACCRUAL-2', { exact: true })).toBeVisible()
  expect(deletions).toEqual(['policy-2'])
  await expect(guard.getByText('QA-历史暂估001', { exact: true })).toBeVisible()
  await guard.getByRole('button', { name: '关闭', exact: true }).click()
  concurrentHistory = false
  await remove(2).click()
  await confirmDelete()
  await expect(manager.getByText('QA-ACCRUAL-2', { exact: true })).toHaveCount(0)
  references = false
  await remove(1).click()
  await confirmDelete()
  await expect(manager.getByText('QA-ACCRUAL-1', { exact: true })).toHaveCount(0)
  expect(deletions).toEqual(['policy-2', 'policy-2', 'policy-1'])
  expect(policies).toHaveLength(0)
  expect(pageErrors).toEqual([])
  await page.goto(
    '/tests/e2e/fixtures/purchase-payable.html?kind=estimated&permissions=FinanceEstimatedPayable:View'
  )
  await expect(page.getByRole('heading', { name: '暂估应付单', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '自动暂估参数', exact: true })).toHaveCount(0)
})

test('两张入库补提失败重试、取消、关闭旧查询及权限组合', async ({ page }, info) => {
  const base = 'FinanceEstimatedPayable:View,FinanceEstimatedPayable:Accrual'
  const full = `${base},FinanceEstimatedPayable:AccrualExecute,WmsPurchaseInbound:View`
  const completed = new Set<string>()
  const calls: string[] = []
  let failExecute = true
  let heldPeriod = false
  let release: (() => void) | undefined
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const gaps = (period: string) =>
    [1, 2]
      .filter((index) => !completed.has(`inbound-${index}`))
      .map((index) => ({
        id: `${period}-line-${index}`,
        tenant_id: 'tenant-a',
        policy_id: 'policy-1',
        source_document_id: `inbound-${index}`,
        source_document_no: `${period === 'period-1' ? '十月' : '九月'}入库${index}`,
        business_date: '2026-10-01',
        line_no: 1,
        material_description: `验收物料${index}`,
        quantity: index * 10,
        recognized_quantity: 0,
        difference_quantity: index * 10,
        pending_document_count: 0
      }))
  await page.route('**/rest/v1/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    const input = route.request().postDataJSON() || {}
    if (name === 'fms_payable_accrual_workspace_secure') {
      const period = input.p_query.period_id
      const data = period ? gaps(period) : []
      if (heldPeriod && period === 'period-1') {
        heldPeriod = false
        await new Promise<void>((resolve) => {
          release = resolve
        })
      }
      return route.fulfill({
        json: {
          configurations: { data: [], total: 0 },
          gaps: { data, total: data.length },
          organizations: [],
          books: [],
          periods: [1, 2].map((index) => ({
            id: `period-${index}`,
            tenant_id: 'tenant-a',
            account_set_id: 'book-a',
            end_date: '2026-10-31',
            name: index === 1 ? '人民币账套 · 十月' : '人民币账套 · 九月'
          })),
          actor_name: '测试操作员',
          can_auto_approve: false,
          can_read_sources: true
        }
      })
    }
    if (name === 'fms_execute_payable_accrual_secure') {
      calls.push(input.p_source_document_id)
      if (failExecute) {
        failExecute = false
        return route.fulfill({
          status: 409,
          json: { code: '23514', message: '会计期间已关闭，请重新选择期间' }
        })
      }
      completed.add(input.p_source_document_id)
      return route.fulfill({ json: { document_ids: [`payable-${input.p_source_document_id}`] } })
    }
    if (name === 'fms_purchase_payable_list_secure')
      return route.fulfill({ json: { data: [], total: 0 } })
    return route.fulfill({ json: [] })
  })
  const open = async (permissions: string) => {
    await page.goto(
      `/tests/e2e/fixtures/purchase-payable.html?kind=estimated&permissions=${permissions}`
    )
    await page.getByRole('button', { name: '自动暂估参数', exact: true }).click()
    const manager = page.getByRole('dialog', { name: '自动暂估管理', exact: true })
    await manager.getByRole('tab', { name: '期末暂估缺口', exact: true }).click()
    return manager
  }
  const selectPeriod = async (label: string) => {
    await page
      .getByRole('dialog', { name: '自动暂估管理', exact: true })
      .getByRole('combobox')
      .first()
      .click()
    await page.getByRole('option', { name: `人民币账套 · ${label}`, exact: true }).click()
  }
  let manager = await open(base)
  await selectPeriod('十月')
  await expect(manager.getByText('十月入库1', { exact: true })).toBeVisible()
  await expect(manager.getByRole('button', { name: '补提暂估', exact: true })).toHaveCount(0)
  manager = await open(`${base},FinanceEstimatedPayable:AccrualExecute`)
  await selectPeriod('十月')
  await expect(manager.getByRole('button', { name: '补提暂估', exact: true })).toHaveCount(2)
  for (const button of await manager.getByRole('button', { name: '补提暂估', exact: true }).all())
    await expect(button).toBeDisabled()
  expect(calls).toEqual([])
  manager = await open(full)
  await selectPeriod('九月')
  await expect(manager.getByText('九月入库1', { exact: true })).toBeVisible()
  heldPeriod = true
  await selectPeriod('十月')
  await expect.poll(() => Boolean(release)).toBe(true)
  // The loading mask blocks period selection; close and reopen instead.
  await manager.getByRole('button', { name: '关闭此对话框', exact: true }).click()
  await expect(manager).toBeHidden()
  await page.getByRole('button', { name: '自动暂估参数', exact: true }).click()
  await manager.getByRole('tab', { name: '期末暂估缺口', exact: true }).click()
  await selectPeriod('九月')
  await expect(manager.getByText('九月入库1', { exact: true })).toBeVisible()
  release?.()
  await page.waitForLoadState('networkidle')
  await expect(manager.getByText('十月入库1', { exact: true })).toHaveCount(0)
  await selectPeriod('十月')
  const execute = (index: number) =>
    manager
      .getByRole('row')
      .filter({ hasText: `十月入库${index}` })
      .getByRole('button', { name: '补提暂估', exact: true })
  await execute(1).click()
  const confirmation = page.getByRole('dialog', { name: '补提暂估', exact: true })
  await confirmation.getByRole('button', { name: '取消', exact: true }).click()
  expect(calls).toEqual([])
  await expect(execute(1)).toBeEnabled()
  for (const index of [1, 1, 2]) {
    await execute(index).click()
    await confirmation.getByRole('button', { name: '确定', exact: true }).click()
    if (calls.length === 1) {
      await expect(execute(index)).toBeEnabled()
      await expect(manager.getByText('十月入库1', { exact: true })).toBeVisible()
      await manager.screenshot({ path: info.outputPath('accrual-gaps.png') })
    } else await expect(manager.getByText(`十月入库${index}`, { exact: true })).toHaveCount(0)
  }
  expect(calls).toEqual(['inbound-1', 'inbound-1', 'inbound-2'])
  expect(errors).toEqual([])
})
