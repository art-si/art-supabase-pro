import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(150000)
const jobStatusLabels: Record<string, string> = {
  blocked: '待处理条件',
  cancelled: '已取消',
  failed: '处理失败',
  no_match: '暂未匹配',
  pending: '待处理',
  succeeded: '已完成'
}

test('后台核销两配置保存失败保留输入及编辑', async ({ page }, info) => {
  const tenant = '11111111-1111-4111-8111-111111111111'
  const configurations: Array<Record<string, unknown>> = []
  let failSave = true
  const saves: Array<Record<string, unknown>> = []
  const queries: Array<Record<string, unknown>> = []
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request()
    const name = new URL(request.url()).pathname.split('/').at(-1)
    const body = request.postData() ? request.postDataJSON() : {}
    if (name === 'sys_dictionary') {
      const code = new URL(request.url()).searchParams
        .get('dict_type_table.code')
        ?.replace(/^eq\./, '')
      const values =
        code === 'commonBoolean'
          ? [
              ['true', '是'],
              ['false', '否']
            ]
          : code === 'fmsPayableAutoCurrencyMode'
            ? [['same_currency', '同币核销']]
            : []
      return route.fulfill({
        json: values.map(([value, label]) => ({
          id: `${code}-${value}`,
          value,
          code: value,
          label,
          status: '1',
          dict_type_table: { code }
        }))
      })
    }
    if (name === 'fms_payable_automation_workspace_secure') {
      queries.push(body.p_query)
      expect(body.p_query.client_version).toBe(2)
      return route.fulfill({
        json: {
          configuration_version: 1,
          configurations: { data: configurations, total: configurations.length },
          jobs: { data: [], total: 0 },
          runtime: { available: true },
          schemes: [1, 2].map((i) => ({
            id: `scheme-${i}`,
            tenant_id: tenant,
            name: `验收方案${i}`,
            version: 1
          })),
          books: [{ id: 'book-1', tenant_id: tenant, name: '验收账套', code: 'QA', active: true }],
          relations: [{ value: 'payable_payment', label: '应付与付款' }]
        }
      })
    }
    if (name === 'fms_save_payable_automation_secure') {
      saves.push(body.p_record)
      if (failSave) {
        failSave = false
        return route.fulfill({
          status: 409,
          json: { code: '40001', message: '配置版本已变化，请刷新后重试' }
        })
      }
      const record = body.p_record
      const id = record.id || `automation-${configurations.length + 1}`
      const existing = configurations.find((row) => row.id === id)
      const row = {
        ...record,
        id,
        tenant_id: tenant,
        scheme_version: 1,
        version: Number(record.version || 0) + 1,
        scheme_name: record.scheme_id === 'scheme-1' ? '验收方案1' : '验收方案2',
        account_set_name: '验收账套',
        actor_name: '验收人员',
        pause_reason: '',
        job_count: 0
      }
      if (existing) Object.assign(existing, row)
      else configurations.push(row)
      return route.fulfill({ json: id })
    }
    return route.fulfill({ json: [] })
  })
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  await page.goto(
    `/tests/e2e/fixtures/receivable-workspace.html?kind=ap_automation&theme=${theme}&permissions=FinancePayableWriteoff:View,FinancePayableWriteoff:Automation`
  )
  await page.getByRole('button', { name: '后台核销', exact: true }).click({ timeout: 60000 })
  const manager = page.getByRole('dialog', { name: '后台应付核销管理', exact: true })
  for (const i of [1, 2]) {
    await manager.getByRole('button', { name: '新增后台配置', exact: true }).click()
    const editor = page.getByRole('dialog', { name: '新增后台核销配置', exact: true })
    await editor.getByRole('textbox', { name: /配置名称/ }).fill(`验收后台配置${i}`)
    await editor.getByRole('combobox', { name: /核销方案/ }).click()
    await page.getByRole('option', { name: `验收方案${i}`, exact: true }).click()
    await editor.getByRole('combobox', { name: /核算账套/ }).click()
    await page.getByRole('option', { name: '验收账套', exact: true }).click()
    await editor.getByRole('checkbox', { name: '应付与付款', exact: true }).locator('..').click()
    await editor.getByRole('button', { name: '保存配置', exact: true }).click()
    if (i === 1) {
      await expect(
        page.getByText('数据已被其他操作更新，请刷新后重试', { exact: true })
      ).toBeVisible()
      await expect(editor.getByRole('textbox', { name: /配置名称/ })).toHaveValue('验收后台配置1')
      await editor.getByRole('button', { name: '保存配置', exact: true }).click()
    }
    await expect(editor).toBeHidden()
    await expect(manager.getByRole('row').filter({ hasText: `验收后台配置${i}` })).toBeVisible()
  }
  expect(configurations).toHaveLength(2)
  expect(saves.every((row) => row.enabled === false && row.process_existing === false)).toBe(true)
  const row = manager.getByRole('row').filter({ hasText: '验收后台配置1' })
  await row.getByRole('button', { name: '编辑', exact: true }).click()
  const editor = page.getByRole('dialog', { name: '编辑后台核销配置', exact: true })
  await editor.getByRole('textbox', { name: /配置名称/ }).fill('验收后台配置1已修改')
  await editor.getByRole('button', { name: '保存配置', exact: true }).click()
  await expect(editor).toBeHidden()
  await expect(manager).toContainText('验收后台配置1已修改')
  await expect(manager.getByRole('button', { name: '删除', exact: true })).toHaveCount(0)
  await expect(page.locator('.el-message')).toHaveCount(0)
  await manager.locator('.el-pagination__sizes').click()
  await page.getByRole('option', { name: '50条/页', exact: true }).click()
  await expect.poll(() => queries.at(-1)?.size).toBe(50)
  expect(queries.at(-1)?.configuration_page).toBe(1)
  expect(queries.at(-1)?.job_page).toBe(1)
  await manager
    .locator('.el-table__body-wrapper .el-scrollbar__wrap')
    .first()
    .evaluate((node) => {
      node.scrollLeft = 0
    })
  await manager.screenshot({ path: info.outputPath('automation-configurations.png') })
  await page.goto(
    `/tests/e2e/fixtures/receivable-workspace.html?kind=ap_automation&theme=${theme}&permissions=FinancePayableWriteoff:View`
  )
  await page.getByRole('button', { name: '后台核销', exact: true }).click()
  await expect(manager).toContainText('验收后台配置1已修改')
  await expect(manager.getByRole('button', { name: '新增后台配置', exact: true })).toHaveCount(0)
  await expect(manager.getByRole('button', { name: '编辑', exact: true })).toHaveCount(0)
  await expect(manager.getByRole('button', { name: '删除', exact: true })).toHaveCount(0)
})

test('后台核销任务状态与重试权限及失败恢复', async ({ page }, info) => {
  let failRead = true
  let failRetry = true
  const retries: string[] = []
  const recordReads: string[] = []
  const jobs = [
    'failed',
    'blocked',
    'no_match',
    'pending',
    'succeeded',
    'cancelled',
    'failed',
    'failed'
  ].map((status, i) => ({
    id: `job-${i}`,
    tenant_id: '11111111-1111-4111-8111-111111111111',
    automation_id: 'automation-1',
    automation_name: '验收配置',
    automation_version: 1,
    configuration_version: i === 7 ? 2 : 1,
    configuration_enabled: i !== 6,
    scheme_version: 1,
    job_no: `QA-JOB-${i}`,
    relation: 'payable_payment',
    source_document_no: `QA-SOURCE-${i}`,
    business_date: '2026-10-25',
    status,
    message: '验收任务',
    attempt_count: 1,
    record_count: 0,
    actor_name: '验收人员'
  }))
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const name = url.pathname.split('/').at(-1)
    const body = request.postData() ? request.postDataJSON() : {}
    if (name === 'sys_dictionary') {
      const code = url.searchParams.get('dict_type_table.code')?.replace(/^eq\./, '')
      return route.fulfill({
        json:
          code === 'fmsPayableAutomationJobStatus'
            ? Object.entries(jobStatusLabels).map(([value, label]) => ({
                id: value,
                code: value,
                value,
                label,
                status: '1',
                dict_type_table: { code }
              }))
            : code === 'fmsPayableWriteoffRecordStatus'
              ? [
                  {
                    id: 'active',
                    code: 'active',
                    value: 'active',
                    label: '已核销',
                    status: '1',
                    dict_type_table: { code }
                  }
                ]
              : []
      })
    }
    if (name === 'fms_payable_automation_workspace_secure') {
      if (failRead) {
        failRead = false
        return route.fulfill({
          status: 409,
          json: { code: 'P0001', message: '任务读取失败，请重试' }
        })
      }
      return route.fulfill({
        json: {
          configuration_version: 1,
          configurations: { data: [], total: 0 },
          jobs: { data: jobs, total: jobs.length },
          books: [],
          schemes: [],
          relations: [],
          runtime: { available: true }
        }
      })
    }
    if (name === 'fms_retry_payable_automation_job_secure') {
      retries.push(body.p_id)
      if (failRetry) {
        failRetry = false
        return route.fulfill({
          status: 409,
          json: { code: 'P0001', message: '任务重试失败，请刷新配置后重试' }
        })
      }
      const row = jobs.find((item) => item.id === body.p_id)
      if (row) row.status = 'pending'
      return route.fulfill({ json: body.p_id })
    }
    if (name === 'fms_payable_automation_records_secure') {
      recordReads.push(body.p_job_id)
      expect(body.p_page).toBe(1)
      expect(body.p_size).toBeGreaterThan(0)
      return route.fulfill({
        json: {
          data: [1, 2].map((i) => ({
            id: `${body.p_job_id}-record-${i}`,
            record_no: `${body.p_job_id}-核销${i}`,
            document_no: `${body.p_job_id}-单据${i}`,
            writeoff_date: '2026-10-25',
            status: 'active',
            needs_voucher: false,
            voucher_no: null
          })),
          total: 2
        }
      })
    }
    return route.fulfill({ json: [] })
  })
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  const fixture = `/tests/e2e/fixtures/receivable-workspace.html?kind=ap_automation&theme=${theme}&permissions=FinancePayableWriteoff:View,FinancePayableWriteoff:AutomationRetry`
  await page.goto(fixture)
  await page.getByRole('button', { name: '后台核销', exact: true }).click({ timeout: 60000 })
  const manager = page.getByRole('dialog', { name: '后台应付核销管理', exact: true })
  await expect(manager.getByText('后台核销资料未加载，请重试', { exact: true })).toBeVisible()
  await manager.getByRole('button', { name: '重新加载', exact: true }).click()
  await manager.getByRole('tab', { name: '处理任务', exact: true }).click()
  await expect(manager.getByRole('button', { name: '重试任务', exact: true })).toHaveCount(8)
  for (const button of await manager.getByRole('button', { name: '重试任务', exact: true }).all())
    await expect(button).toBeDisabled()
  expect(retries).toHaveLength(0)
  await page.goto(`${fixture},FinancePayableWriteoff:AutoWriteoff`)
  await page.getByRole('button', { name: '后台核销', exact: true }).click()
  await manager.getByRole('tab', { name: '处理任务', exact: true }).click()
  for (let i = 0; i < jobs.length; i++) {
    const row = manager.getByRole('row').filter({ hasText: `QA-JOB-${i}` })
    const button = row.getByRole('button', { name: '重试任务', exact: true })
    if (i < 3) await expect(button).toBeEnabled()
    else await expect(button).toBeDisabled()
  }
  const retryButton = manager
    .getByRole('row')
    .filter({ hasText: 'QA-JOB-0' })
    .getByRole('button', { name: '重试任务', exact: true })
  for (const attempt of [1, 2]) {
    await retryButton.click()
    await page
      .getByRole('dialog', { name: '重试后台核销任务', exact: true })
      .getByRole('button', { name: '确定', exact: true })
      .click()
    if (attempt === 1) {
      await expect(page.getByText('任务重试失败，请刷新配置后重试', { exact: true })).toBeVisible()
      await expect(retryButton).toBeEnabled()
    }
  }
  await expect(retryButton).toBeDisabled()
  expect(retries).toEqual(['job-0', 'job-0'])
  for (const i of [0, 1]) {
    await manager
      .getByRole('row')
      .filter({ hasText: `QA-JOB-${i}` })
      .getByRole('button', { name: '核销记录', exact: true })
      .click()
    const recordsDialog = page.getByRole('dialog', { name: '后台任务生成记录', exact: true })
    await expect(recordsDialog.getByText(`job-${i}-核销1`, { exact: true })).toBeVisible()
    await expect(recordsDialog.getByText(`job-${i}-核销2`, { exact: true })).toBeVisible()
    await expect(recordsDialog.getByText('已核销', { exact: true })).toHaveCount(2)
    await expect(recordsDialog.getByText(`job-${1 - i}-核销1`, { exact: true })).toHaveCount(0)
    await expect(page.locator('.el-message')).toHaveCount(0)
    await recordsDialog.screenshot({ path: info.outputPath(`automation-records-${i}.png`) })
    await recordsDialog.getByRole('button', { name: '关闭此对话框', exact: true }).click()
  }
  expect(recordReads).toEqual(['job-0', 'job-1'])
  await expect(page.locator('.el-message')).toHaveCount(0)
  await manager.screenshot({ path: info.outputPath('automation-jobs.png') })
})

test('后台配置删除先核验引用且并发拒绝后重新检查', async ({ page }, info) => {
  let failCheck = true
  let concurrentHistory = false
  let allowDelete = false
  const navigationQueries: Array<Record<string, unknown>> = []
  const deletions: string[] = []
  const checks: string[] = []
  const configurations = [1, 2].map((i) => ({
    id: `automation-${i}`,
    name: `删除验收配置${i}`,
    enabled: false,
    version: 3,
    scheme_name: '验收方案',
    account_set_name: '验收账套',
    actor_name: '验收人员',
    pause_reason: '',
    job_count: i === 1 ? 1 : 0
  }))
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request()
    const name = new URL(request.url()).pathname.split('/').at(-1)
    const body = request.postData() ? request.postDataJSON() : {}
    if (name === 'sys_dictionary') {
      const code = new URL(request.url()).searchParams
        .get('dict_type_table.code')
        ?.replace(/^eq\./, '')
      const entries =
        code === 'commonBoolean'
          ? [
              ['true', '是'],
              ['false', '否']
            ]
          : code === 'fmsPayableAutomationJobStatus'
            ? Object.entries(jobStatusLabels)
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
    if (name === 'fms_payable_automation_workspace_secure') {
      navigationQueries.push(body.p_query)
      return route.fulfill({
        json: {
          configuration_version: 1,
          configurations: { data: configurations, total: configurations.length },
          jobs: {
            data: body.p_query.job_id
              ? [
                  {
                    id: 'job-history',
                    job_no: 'QA-保留历史任务',
                    status: 'succeeded',
                    automation_name: '删除验收配置1',
                    message: '历史核销记录必须保留',
                    attempt_count: 1,
                    record_count: 2,
                    configuration_enabled: false,
                    configuration_version: 3,
                    automation_version: 3
                  }
                ]
              : [],
            total: body.p_query.job_id ? 1 : 0
          },
          books: [],
          schemes: [],
          relations: [],
          runtime: { available: true }
        }
      })
    }
    if (name === 'get_fms_payable_automation_delete_dependencies_secure') {
      const id = body.p_ids[0]
      checks.push(id)
      if (id === 'automation-2' && failCheck) {
        failCheck = false
        return route.fulfill({
          status: 409,
          json: { code: 'P0001', message: '关联任务暂未读取，请重试' }
        })
      }
      return route.fulfill({
        json:
          id === 'automation-1' || concurrentHistory
            ? [
                {
                  resource_id: id,
                  dependency_code: 'fms_payable_writeoff_automation_job',
                  record_id: 'job-history',
                  target_id: id,
                  record_no: 'QA-保留历史任务',
                  record_summary: '已生成核销历史，配置只能停用',
                  record_status: 'succeeded',
                  record_amount: null,
                  created_at: '2026-10-25T00:00:00Z',
                  cleanup_allowed: false
                }
              ]
            : []
      })
    }
    if (name === 'fms_delete_payable_automation_secure') {
      deletions.push(body.p_id)
      expect(body.p_expected_version).toBe(3)
      if (allowDelete) {
        const index = configurations.findIndex((row) => row.id === body.p_id)
        if (index >= 0) configurations.splice(index, 1)
        return route.fulfill({ json: true })
      }
      concurrentHistory = true
      return route.fulfill({
        status: 409,
        json: { code: '23503', message: '配置已新增处理历史，只能停用' }
      })
    }
    return route.fulfill({ json: [] })
  })
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  await page.goto(
    `/tests/e2e/fixtures/receivable-workspace.html?kind=ap_automation&theme=${theme}&permissions=FinancePayableWriteoff:View,FinancePayableWriteoff:AutomationDelete`
  )
  await page.getByRole('button', { name: '后台核销', exact: true }).click({ timeout: 60000 })
  const manager = page.getByRole('dialog', { name: '后台应付核销管理', exact: true })
  const remove = (i: number) =>
    manager
      .getByRole('row')
      .filter({ hasText: `删除验收配置${i}` })
      .getByRole('button', { name: '删除', exact: true })
  await remove(1).click()
  const guard = page.getByRole('dialog', { name: '暂时无法删除后台核销配置', exact: true })
  await expect(guard.getByText('QA-保留历史任务', { exact: true })).toBeVisible()
  expect(deletions).toHaveLength(0)
  await guard.getByRole('button', { name: '关闭', exact: true }).click()
  await remove(2).click()
  const failure = page.getByRole('dialog', { name: '删除检查未完成', exact: true })
  await expect(failure.getByText('关联资料未完成核验，删除已停止', { exact: true })).toBeVisible()
  expect(deletions).toHaveLength(0)
  await failure.getByRole('button', { name: '重新检查', exact: true }).click()
  await expect(failure).toBeHidden()
  expect(deletions).toHaveLength(0)
  await remove(2).click()
  await page
    .getByRole('dialog', { name: '删除确认', exact: true })
    .getByRole('button', { name: '删除', exact: true })
    .click()
  await expect(guard.getByText('QA-保留历史任务', { exact: true })).toBeVisible()
  expect(deletions).toEqual(['automation-2'])
  expect(checks).toEqual([
    'automation-1',
    'automation-2',
    'automation-2',
    'automation-2',
    'automation-2'
  ])
  await expect(manager.getByRole('row').filter({ hasText: '删除验收配置2' })).toHaveCount(1)
  await expect(page.locator('.el-message')).toHaveCount(0)
  await guard.screenshot({ path: info.outputPath('automation-delete-history.png') })
  await guard.getByRole('button', { name: '关闭', exact: true }).click()
  concurrentHistory = false
  allowDelete = true
  await remove(2).click()
  await page
    .getByRole('dialog', { name: '删除确认', exact: true })
    .getByRole('button', { name: '删除', exact: true })
    .click()
  await expect(manager.getByRole('row').filter({ hasText: '删除验收配置2' })).toHaveCount(0)
  expect(deletions).toEqual(['automation-2', 'automation-2'])
  expect(configurations.map((row) => row.id)).toEqual(['automation-1'])
  await remove(1).click()
  await guard.getByRole('button', { name: '查看任务', exact: true }).click()
  await expect(guard).toBeHidden()
  await expect(manager.getByRole('tab', { name: '处理任务', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect(manager.getByRole('row').filter({ hasText: 'QA-保留历史任务' })).toBeVisible()
  await expect.poll(() => navigationQueries.at(-1)?.job_id).toBe('job-history')
  expect(navigationQueries.at(-1)?.automation_id).toBe('automation-1')
})
