import { expect, test, type Page, type Route } from '@playwright/test'
import { mockApplicationMenus } from './support/menu-rpc'

const meta = (title: string) => ({ title, is_enable: true, is_hide: false, keep_alive: true })

async function installMenus(page: Page): Promise<void> {
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({ json: [{ code: 'platform', name: '平台', baseUrl: '/', sort: 1 }] })
  )
  const children = ['analytics', 'monitor'].map((key, index) => ({
    id: `test-workflow-${key}`,
    parentId: 'test-workflow',
    type: 'menu',
    name: key === 'analytics' ? 'WorkflowAnalytics' : 'WorkflowMonitor',
    path: key,
    component: `/workflow/${key}`,
    sort: index,
    meta: meta(key === 'analytics' ? '审批效能' : '审批运营监控'),
    children: []
  }))
  const root = {
    id: 'test-workflow',
    parentId: null,
    name: 'Workflow',
    path: '/workflow',
    component: '/index/index',
    type: 'folder',
    sort: 1,
    meta: meta('流程审批中心'),
    children
  }
  await mockApplicationMenus(page, { platform: [{ ...root, children: undefined }, ...children] })
}

function analyticsResponse(route: Route, days: number, empty = false): object {
  const common = { periodDays: days, generatedAt: '2026-09-05T00:00:00Z' }
  return route.request().url().includes('bottleneck')
    ? {
        ...common,
        minimumSampleSize: 5,
        nodes: empty
          ? []
          : [
              {
                definitionId: 'test-definition',
                nodeKey: 'review',
                definitionName: '费用审批',
                nodeName: '部门复核',
                riskLevel: 'warning',
                taskCount: 10,
                pendingCount: 3,
                overduePendingCount: 1,
                slaMeasuredCount: 7,
                slaComplianceRate: 85,
                averageHandleHours: 4,
                p90HandleHours: 8
              }
            ],
        approvers: empty
          ? []
          : [
              {
                assigneeUserId: 'test-assignee',
                assigneeName: '测试审批人',
                delegatedCount: 1,
                transferredCount: 0,
                pendingCount: 3,
                handledCount: 7,
                slaComplianceRate: 85,
                riskLevel: 'warning'
              }
            ],
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
    : {
        ...common,
        businessTypes: empty
          ? []
          : [
              {
                businessType: 'tms_expense_reimbursement',
                totalCount: days,
                runningCount: 3,
                approvedCount: days - 3,
                rejectedCount: 0,
                interruptedCount: 0,
                overdueCount: 1,
                approvalRate: 100,
                averageDurationHours: 4
              }
            ],
        daily: empty
          ? []
          : Array.from({ length: 14 }, (_, index) => ({
              date: `2026-08-${String(index + 10).padStart(2, '0')}`,
              startedCount: index % 5,
              approvedCount: 0,
              rejectedCount: 0
            })),
        summary: {
          totalCount: empty ? 0 : days,
          runningCount: 0,
          approvedCount: 0,
          rejectedCount: 0,
          interruptedCount: 0,
          overdueCount: 0,
          averageDurationHours: 0
        }
      }
}

const endpoint = '**/rest/v1/rpc/get_workflow_*_analytics'
const total = (page: Page) =>
  page.locator('.workflow-analytics__metrics article').first().locator('strong')

async function prepareVisual(page: Page, projectName: string): Promise<void> {
  const guide = page.locator('.setting-guide')
  const shown = await guide
    .waitFor({ state: 'visible', timeout: 2_000 })
    .then(() => true)
    .catch(() => false)
  if (shown) await guide.getByRole('button', { name: '知道了' }).click()
  await page.evaluate(
    ({ dark, boxMode }) => {
      document.documentElement.classList.toggle('dark', dark)
      document.documentElement.dataset.boxMode = boxMode
    },
    {
      dark: projectName.includes('dark'),
      boxMode: projectName.includes('shadow') ? 'shadow-mode' : 'border-mode'
    }
  )
}

test.describe('Workflow analytics reuse and request integrity', () => {
  test.setTimeout(120_000)

  test('direct menu supports loading and keeps the latest period after out-of-order responses', async ({
    page
  }, info) => {
    await installMenus(page)
    const pending: Route[] = []
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    await page.route(endpoint, async (route) => {
      const days = route.request().postDataJSON().p_days as number
      if (days === 7) {
        pending.push(route)
        return
      }
      await route.fulfill({ json: analyticsResponse(route, days) })
    })
    await page.goto('#/workflow/analytics')
    await expect(page.getByRole('heading', { name: '审批效能', exact: true })).toBeVisible({
      timeout: 60_000
    })
    await expect(total(page)).toHaveText('30')
    await prepareVisual(page, info.project.name)
    await page.getByText('7 天', { exact: true }).click()
    await expect.poll(() => pending.length).toBe(2)
    await expect(page.getByRole('button', { name: '导出业务汇总' })).toBeDisabled()
    await expect(page.locator('.workflow-analytics .el-skeleton')).toBeVisible()
    await page.screenshot({ path: info.outputPath('analytics-loading.png') })
    await page.getByText('90 天', { exact: true }).click()
    await expect(total(page)).toHaveText('90')
    await Promise.all(pending.map((route) => route.fulfill({ json: analyticsResponse(route, 7) })))
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    )
    await expect(total(page)).toHaveText('90')
    await expect(page.getByRole('button', { name: '导出业务汇总' })).toBeEnabled()
    await expect(page.locator('.workflow-analytics__metrics').first()).toContainText('90 天内发起')
    expect(errors).toEqual([])
    await page.screenshot({ path: info.outputPath('analytics-ready.png') })
    await page.getByRole('tab', { name: '瓶颈治理' }).click()
    await expect(page.getByText('部门复核', { exact: true })).toBeVisible()
    await page.getByText('测试审批人', { exact: true }).scrollIntoViewIfNeeded()
    await expect(page.getByText('测试审批人', { exact: true })).toBeInViewport()
    await page.screenshot({ path: info.outputPath('analytics-governance.png') })
  })

  test('recoverable error retries to an explicit empty state', async ({ page }, info) => {
    await installMenus(page)
    let fail = true
    await page.route(endpoint, (route) =>
      route.fulfill(
        fail
          ? { status: 500, json: { code: 'XX000', message: 'internal SQL details' } }
          : { json: analyticsResponse(route, 30, true) }
      )
    )
    await page.goto('#/workflow/analytics')
    await expect(page.getByText('审批运营分析加载失败', { exact: true })).toBeVisible({
      timeout: 60_000
    })
    await expect(page.getByRole('button', { name: '导出业务汇总' })).toBeDisabled()
    await expect(page.locator('.workflow-analytics')).not.toContainText('internal SQL details')
    await prepareVisual(page, info.project.name)
    await page.screenshot({ path: info.outputPath('analytics-error.png') })
    fail = false
    await page.getByRole('button', { name: '重新加载' }).click()
    await expect(total(page)).toHaveText('0')
    await expect(page.getByText('当前周期暂无审批数据', { exact: true })).toBeVisible()
    await page.getByRole('tab', { name: '瓶颈治理' }).click()
    await expect(
      page.locator('.workflow-analytics__metrics--governance article').first().locator('strong')
    ).toHaveText('—')
    await expect(page.getByText('当前周期暂无节点数据', { exact: true })).toBeVisible()
    await expect(page.getByText('当前周期暂无审批人数据', { exact: true })).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
    expect(overflow).toBeLessThanOrEqual(1)
    await page.screenshot({ path: info.outputPath('analytics-empty.png') })
  })

  test('monitor dialog reuses the panel and resets on reopen', async ({ page }) => {
    await installMenus(page)
    await page.route(endpoint, (route) =>
      route.fulfill({ json: analyticsResponse(route, route.request().postDataJSON().p_days) })
    )
    await page.goto('#/workflow/monitor')
    await expect(page.getByRole('button', { name: '运营分析', exact: true })).toBeVisible({
      timeout: 60_000
    })
    await page.getByRole('button', { name: '运营分析', exact: true }).click()
    await expect(total(page)).toHaveText('30')
    await page.getByText('7 天', { exact: true }).click()
    await expect(total(page)).toHaveText('7')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
    await page.getByRole('button', { name: '运营分析', exact: true }).click()
    await expect(total(page)).toHaveText('30')
  })
})
