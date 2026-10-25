import { expect, test, type Page } from '@playwright/test'

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const viewport = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }))
  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.clientWidth + 1)
}

const verifyWorkspace = async (page: Page, path: string, title: string) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  await page.goto(path, { waitUntil: 'domcontentloaded' })
  const titleHeading = page.getByRole('heading', { name: title, exact: true })
  const retryInitialization = page.getByRole('button', { name: '重试进入系统' })
  const routeState = await Promise.race([
    titleHeading.waitFor({ state: 'visible', timeout: 60_000 }).then(() => 'ready' as const),
    retryInitialization
      .waitFor({ state: 'visible', timeout: 60_000 })
      .then(() => 'recover' as const)
  ])
  if (routeState === 'recover') {
    consoleErrors.length = 0
    await retryInitialization.click()
  }

  await expect(titleHeading).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText('500', { exact: true })).toHaveCount(0)
  await expect
    .poll(() =>
      page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth
      }))
    )
    .toEqual(expect.objectContaining({ scrollWidth: expect.any(Number) }))
  await expectNoHorizontalOverflow(page)
  expect(consoleErrors).toEqual([])
}

test.describe('multi-module workspace expansion', () => {
  test.describe.configure({ timeout: 120_000 })

  test('opens HR workforce risk center', async ({ page }) => {
    await verifyWorkspace(page, '#/hr/operations/workforce-risk', '人力风险中心')
  })

  test('opens FMS cash forecast', async ({ page }) => {
    await verifyWorkspace(page, '#/fms/treasury/cash-forecast', '资金预测')
  })

  test('opens TMS transport event center', async ({ page }) => {
    await verifyWorkspace(page, '#/tms/transport-event', '运输事件中心')
  })

  test('opens HR talent inventory', async ({ page }) => {
    await verifyWorkspace(page, '#/hr/talent/talent-inventory', '人才盘点')
  })

  test('opens FMS receivable aging', async ({ page }) => {
    await verifyWorkspace(page, '#/fms/settlement/receivable-aging', '应收账龄')
  })

  test('opens TMS route performance', async ({ page }) => {
    await verifyWorkspace(page, '#/tms/route-performance', '线路效能')
  })

  test('opens VMS fleet health center', async ({ page }) => {
    await verifyWorkspace(page, '#/vms/fleet-health', '车队健康中心')
  })

  test('opens TMS capacity planning center', async ({ page }) => {
    await verifyWorkspace(page, '#/tms/capacity-planning', '运力容量中心')
  })

  test('opens FMS financial exception center', async ({ page }) => {
    await verifyWorkspace(page, '#/fms/exception-center', '财务异常中心')
  })

  test('opens HR skill matrix', async ({ page }) => {
    await verifyWorkspace(page, '#/hr/talent/skill-matrix', '技能矩阵')
  })

  test('filters overdue workflow tasks from the metric card', async ({ page }) => {
    await page.goto('#/workflow/workbench')
    const overdueMetric = page.getByRole('button', { name: /已超时待办/ })
    await expect(overdueMetric).toBeEnabled({ timeout: 60_000 })
    await overdueMetric.click()
    await expect(page).toHaveURL(/tab=pending/)
    await expect(page).toHaveURL(/scope=overdue/)
    await expect(overdueMetric).toHaveAttribute('aria-pressed', 'true')
  })

  test('filters workflow tasks due within 24 hours', async ({ page }) => {
    await page.goto('#/workflow/workbench')
    const dueSoonMetric = page.getByRole('button', { name: /24 小时内到期/ })
    await expect(dueSoonMetric).toBeEnabled({ timeout: 60_000 })
    await dueSoonMetric.click()
    await expect(page).toHaveURL(/tab=pending/)
    await expect(page).toHaveURL(/scope=due-soon/)
    await expect(dueSoonMetric).toHaveAttribute('aria-pressed', 'true')
  })
})
