import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(240_000)

test('首道开工、后道直接报工，任务双击和工单链接查看同一详情', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  let starts = 0
  let reports = 0
  let ruleReads = 0
  const steps = [
    {
      id: 'first-step',
      code: '10',
      name: '首道',
      sort: 10,
      sequence_no: 1,
      sequence_type: 'main',
      control_code: 'SY01',
      report_mode: 'optional'
    },
    {
      id: 'later-step',
      code: '20',
      name: '关键报工',
      sort: 20,
      sequence_no: 1,
      sequence_type: 'main',
      control_code: 'SY06',
      report_mode: 'required'
    }
  ]
  const order = {
    id: 'order-test',
    tenant_id: 'tenant-test',
    work_order_no: 'MO-EXEC-001',
    status: 'confirmed',
    order_status: 'REL',
    work_order_type_name_snapshot: '板材加工',
    material_id: 'material-test',
    material_code_snapshot: 'MAT-001',
    material_name_snapshot: '测试板材',
    specification_snapshot: '1000×50',
    drawing_no_snapshot: '',
    project_name_snapshot: '测试工程',
    unit_snapshot: '平米',
    order_quantity: 10,
    completed_quantity: 0,
    warehoused_quantity: 0,
    planned_start_date: '2026-10-27',
    planned_end_date: '2026-10-30',
    extension_schema_snapshot: [],
    extension_values: {},
    route_snapshot: { steps },
    bom_snapshot: [],
    details: [],
    urgency: 'normal',
    source: 'manual',
    production_fixed_lead_days_snapshot: 0,
    production_preprocess_days_snapshot: 0,
    self_made_production_days_snapshot: 0,
    production_postprocess_days_snapshot: 0,
    production_days_snapshot: 0
  }
  const tasks = steps.map((step, index) => ({
    id: `task-${index}`,
    tenant_id: 'tenant-test',
    work_order_id: order.id,
    task_no: `TASK-${index + 1}`,
    route_step_snapshot_id: step.id,
    sequence_no: 1,
    sequence_type: 'main',
    operation_code: step.code,
    operation_name: step.name,
    planned_quantity: 10,
    completed_quantity: 0,
    reported_good_quantity: 0,
    reported_bad_quantity: 0,
    required_start_date: '2026-10-27',
    required_completion_date: '2026-10-30',
    department_id: 'department-test',
    work_center_id: 'center-test',
    scheduling_status: 'scheduled',
    operation_status: 'released',
    started_at: null as string | null,
    equipment_id: null,
    equipment_locked: false,
    workOrder: order,
    workCenter: { code: 'WC-01', name: '测试工作中心', department_id: 'department-test' },
    allocations: []
  }))
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const name = url.pathname.split('/').at(-1)
    if (name === 'sys_dictionary') {
      const code = url.searchParams.get('dict_type_table.code')?.replace('eq.', '') || ''
      const entries: Record<string, Array<[string, string]>> = {
        mesProductionCompletionFilter: [
          ['unreported', '未报工'],
          ['partial', '部分报工'],
          ['reported', '已报工']
        ],
        mesWorkOrderSource: [['manual', '手工']],
        mesWorkOrderUrgency: [['normal', '常规']]
      }
      return route.fulfill({
        json: (entries[code] || []).map(([value, label], sort) => ({
          id: `${code}-${value}`,
          code,
          value,
          label,
          sort,
          status: '1',
          dict_type_table: { code, name: code }
        }))
      })
    }
    if (name === 'mes_execution_task_rules') {
      ruleReads++
      if (ruleReads === 1)
        return route.fulfill({
          status: 500,
          json: { code: 'XX000', message: 'simulated rule read failure' }
        })
    }
    if (name === 'mes_start_execution') {
      starts++
      expect(route.request().postDataJSON().p_task_id).toBe('task-0')
      tasks[0].started_at = '2026-10-27T01:00:00Z'
      tasks[0].operation_status = 'started'
      return route.fulfill({ json: { taskId: 'task-0', startedAt: tasks[0].started_at } })
    }
    if (name === 'mes_submit_production_report') {
      reports++
      expect(route.request().postDataJSON().p_task_id).toBe('task-1')
      return route.fulfill({ json: { id: 'report-test', status: 'pending' } })
    }
    const data: Record<string, unknown> = {
      mes_execution_task_rules: tasks.map((task, index) => ({
        task_id: task.id,
        first_task_id: 'task-0',
        control_code: index ? 'SY06' : 'SY01',
        report_mode: index ? 'required' : 'optional'
      })),
      mes_operation_task: tasks,
      mdm_production_department: [
        {
          id: 'department-test',
          tenant_id: 'tenant-test',
          parent_id: null,
          name: '测试车间',
          code: 'DP-01',
          enabled: true,
          sort: 0
        }
      ],
      mdm_work_center: [
        {
          id: 'center-test',
          tenant_id: 'tenant-test',
          department_id: 'department-test',
          code: 'WC-01',
          name: '测试工作中心',
          sort: 0
        }
      ],
      mes_work_order: [order],
      mdm_material: [{ id: 'material-test', description: '测试板材', attribute_values: {} }],
      mes_work_order_references: {
        materials: [],
        projects: [],
        documentTypes: [],
        people: [],
        units: [],
        warehouses: [],
        users: [],
        customers: []
      },
      mdm_production_calendar: [
        { pattern: { shifts: [{ name: '白班', start_time: '08:00', end_time: '20:00' }] } }
      ]
    }
    return route.fulfill({
      json: data[name || ''] ?? [],
      headers: { 'content-range': '0-1/2', 'access-control-expose-headers': 'content-range' }
    })
  })
  await page.goto('/tests/e2e/fixtures/mes-operation-automation.html', {
    waitUntil: 'domcontentloaded',
    timeout: 120_000
  })
  const cards = page.locator('.production-workspace__task')
  await expect(page.getByText('任务加载失败，请重试', { exact: true })).toBeVisible({
    timeout: 120_000
  })
  await page.screenshot({ path: testInfo.outputPath('rule-read-retry.png'), fullPage: true })
  await page
    .getByRole('button', { name: /重试|重新加载/ })
    .first()
    .click()
  await expect(cards).toHaveCount(2, { timeout: 120_000 })
  const start = page.getByRole('button', { name: '开始加工', exact: true })
  await expect(start).toBeVisible()
  await expect(page.getByRole('button', { name: '工序报工', exact: true })).toBeDisabled()
  await start.click()
  await expect.poll(() => starts).toBe(1)
  await cards.nth(1).click()
  await expect(start).toHaveCount(0)
  await expect(page.getByRole('button', { name: '工序报工', exact: true })).toBeEnabled()
  await page.screenshot({
    path: testInfo.outputPath('downstream-direct-report.png'),
    fullPage: true
  })
  await page.getByRole('button', { name: '工序报工', exact: true }).click()
  const reportDialog = page.getByRole('dialog').last()
  await expect(
    reportDialog.getByText('必须汇报 · 审批后自动补报前道', { exact: true })
  ).toBeVisible()
  await expect(reportDialog.getByText('白班 08:00—20:00', { exact: true })).toBeVisible()
  await reportDialog.getByRole('spinbutton').first().fill('2')
  await reportDialog.getByRole('spinbutton').first().press('Tab')
  await reportDialog.getByRole('button', { name: '提交报工', exact: true }).click()
  await expect.poll(() => reports).toBe(1)
  expect(starts).toBe(1)
  expect(ruleReads).toBeGreaterThanOrEqual(2)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await cards.nth(1).dblclick()
  const detail = page.getByRole('dialog').last()
  await expect(detail.getByText('MO-EXEC-001', { exact: true }).first()).toBeVisible({
    timeout: 120_000
  })
  await expect(detail.getByText('测试板材', { exact: false }).first()).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('work-order-detail.png'), fullPage: true })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'MO-EXEC-001', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(
    false
  )
  expect(errors).toEqual([])
})
