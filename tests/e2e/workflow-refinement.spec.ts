import { expect, test, type Route } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(150_000)

test('当前待处理任务优先可见，筛选可恢复且不推断节点结果', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.goto(
    `/tests/e2e/fixtures/workflow-refinement.html?theme=${info.project.name.includes('dark') ? 'dark' : 'light'}&box=${info.project.name.includes('shadow') ? 'shadow-mode' : 'border-mode'}`
  )
  const board = page.locator('.workflow-task-board')
  await expect(board.getByText('当前待处理人', { exact: true })).toBeVisible()
  await expect(board.locator('.workflow-task-board__members > article').first()).toContainText(
    '当前待处理人'
  )
  await expect(board.locator('.workflow-task-board__group-header .el-tag')).toHaveText('待处理')
  await board.getByRole('switch', { name: '只看待处理审批任务' }).locator('..').click()
  await expect(board.locator('.workflow-task-board__members > article')).toHaveCount(1)
  await page.getByRole('button', { name: '模拟全部任务结束' }).click()
  await expect(board.getByText('当前没有待处理任务', { exact: true })).toBeVisible()
  await board.getByRole('button', { name: '查看全部任务' }).click()
  await expect(board.locator('.workflow-task-board__members > article')).toHaveCount(6)
  await expect(board.getByText('含驳回记录', { exact: true })).toBeVisible()
  await expect(
    page.locator('.workflow-business-snapshot').getByText('暂无业务摘要资料', { exact: true })
  ).toBeVisible()
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  await page.screenshot({ path: info.outputPath('task-board.png'), fullPage: true })
  expect(errors).toEqual([])
})

test('慢摘要不阻断详情与进度，旧实例响应不会覆盖新实例', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  let oldDetail: Route | undefined
  let newSnapshot: Route | undefined
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/wf_instance')) {
      const id = url.searchParams.get('id')?.replace('eq.', '')
      if (id === 'instance-a') {
        oldDetail = route
        return
      }
      await route.fulfill({
        json: {
          id: 'instance-b',
          business_id: 'business-b',
          business_type: 'scm_sales_contract',
          business_title: '新实例 B 的业务标题',
          status: 'running',
          current_node_name: '部门审批',
          initiator_name_snapshot: '测试发起人',
          started_at: '2026-11-01T09:00:00+08:00',
          definition: { name: '测试流程' },
          tasks: [],
          actions: []
        }
      })
      return
    }
    if (url.pathname.endsWith('/get_workflow_business_snapshot')) {
      const id = route.request().postDataJSON().p_instance_id
      if (id === 'instance-b') {
        newSnapshot = route
        return
      }
      await route.fulfill({
        json: {
          instanceId: id,
          businessId: 'business-a',
          businessType: 'scm_sales_contract',
          title: '旧摘要',
          fields: [],
          metrics: [],
          warnings: [],
          attachments: []
        }
      })
      return
    }
    await route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/workflow-refinement.html?mode=drawer')
  await page.getByRole('button', { name: '打开实例 A' }).click()
  await expect.poll(() => Boolean(oldDetail)).toBe(true)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '打开实例 B' }).click()
  const drawer = page.getByRole('dialog')
  await expect(drawer.getByRole('heading', { name: '新实例 B 的业务标题' })).toBeVisible()
  await expect.poll(() => Boolean(newSnapshot)).toBe(true)
  await drawer.getByRole('tab', { name: '审批进度', exact: true }).click()
  await expect(drawer.getByText('流程尚未生成审批任务', { exact: true })).toBeVisible()
  await oldDetail?.fulfill({
    json: {
      id: 'instance-a',
      business_title: '过期实例 A 的标题',
      status: 'running',
      tasks: [],
      actions: []
    }
  })
  await oldDetail
    ?.request()
    .response()
    .then((response) => response?.finished())
  await expect(drawer.getByRole('heading', { name: '新实例 B 的业务标题' })).toBeVisible()
  await newSnapshot?.fulfill({
    json: {
      instanceId: 'instance-b',
      businessId: 'business-b',
      businessType: 'scm_sales_contract',
      title: '新摘要',
      fields: [{ label: '合同编号', value: 'NEW-B' }],
      metrics: [],
      warnings: [],
      attachments: []
    }
  })
  await drawer.getByRole('tab', { name: '业务与概览', exact: true }).click()
  await expect(drawer.getByText('NEW-B', { exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('监控快捷范围在专注中可用，死信直达队列且故障状态可重试', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const queries: Array<{ p_status?: string; p_sla_status?: string }> = []
  let failedQueue = false
  await page.route('**/rest/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/get_workflow_monitor_summary')) {
      await route.fulfill({
        json: {
          runningCount: 6,
          overdueCount: 2,
          approved30dCount: 10,
          rejected30dCount: 1,
          cancelled30dCount: 0,
          averageDurationHours: 3
        }
      })
      return
    }
    if (path.endsWith('/search_workflow_instances_for_monitor')) {
      queries.push(route.request().postDataJSON())
      await route.fulfill({ json: { records: [], total: 0 } })
      return
    }
    if (path.endsWith('/get_workflow_callback_outbox')) {
      const status = route.request().postDataJSON().p_status
      if (status === 'dead_letter' && !failedQueue) {
        failedQueue = true
        await route.fulfill({
          status: 503,
          json: { code: 'XX000', message: 'temporary test failure' }
        })
        return
      }
      await route.fulfill({
        json: {
          items: [],
          summary: { pending: 0, processing: 0, succeeded: 7, retryWait: 1, deadLetter: 2 }
        }
      })
      return
    }
    await route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/workflow-focus.html?mode=monitor')
  await page.getByRole('button', { name: '已超时', exact: true }).click()
  await expect.poll(() => queries.at(-1)?.p_sla_status).toBe('overdue')
  expect(queries.at(-1)?.p_status ?? '').toBe('')
  await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
  await expect(page.locator('.business-workspace-header')).toBeHidden()
  await page.getByRole('button', { name: '全部实例', exact: true }).click()
  await expect.poll(() => queries.at(-1)?.p_status ?? '').toBe('')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '查看死信事件', exact: true }).click()
  const drawer = page.getByRole('dialog')
  await expect(drawer.getByText('业务回调队列加载失败', { exact: true })).toBeVisible()
  await expect(drawer.locator('.workflow-callback-outbox__metric').first()).toBeDisabled()
  await drawer.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(drawer.getByText('业务回调队列加载失败', { exact: true })).toBeHidden()
  await expect(drawer.locator('.workflow-callback-outbox__metric').first()).toBeEnabled()
  expect(errors).toEqual([])
})

test('分析页按当前标签展示对应生成时间，趋势为空时提供明确说明', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.includes('bottleneck_analytics')) {
      return route.fulfill({
        json: {
          periodDays: 30,
          generatedAt: '2026-11-02T00:00:00Z',
          minimumSampleSize: 5,
          nodes: [],
          approvers: [],
          summary: {
            taskCount: 0,
            pendingCount: 0,
            overduePendingCount: 0,
            handledCount: 0,
            slaMeasuredCount: 0,
            slaBreachedCount: 0,
            slaComplianceRate: 100,
            delegatedCount: 0,
            transferredCount: 0,
            averageHandleHours: 0,
            p90HandleHours: 0
          }
        }
      })
    }
    if (path.includes('operational_analytics')) {
      return route.fulfill({
        json: {
          periodDays: 30,
          generatedAt: '2026-11-01T00:00:00Z',
          daily: [],
          businessTypes: [],
          summary: {
            totalCount: 0,
            runningCount: 0,
            approvedCount: 0,
            rejectedCount: 0,
            interruptedCount: 0,
            overdueCount: 0,
            averageDurationHours: 0
          }
        }
      })
    }
    return route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/workflow-focus.html?mode=analytics')
  const toolbar = page.locator('.workflow-analytics__toolbar')
  await expect(toolbar).toContainText('2026-11-01 08:00')
  await expect(page.getByText('当前周期暂无发起记录', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: '瓶颈治理', exact: true }).click()
  await expect(toolbar).toContainText('2026-11-02 08:00')
  await expect(toolbar.getByRole('button', { name: '导出瓶颈明细', exact: true })).toBeEnabled()
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  await page.screenshot({ path: info.outputPath('analytics-governance.png'), fullPage: true })
  expect(errors).toEqual([])
})
