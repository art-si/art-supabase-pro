import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

test('演练统计失败显示不可用且重试恢复', async ({ page }) => {
  let failed = true
  await page.route('**/rest/v1/**', async (route) => {
    if (!route.request().url().includes('smis_emergency_drill_report_secure')) {
      await route.fulfill({ json: [] })
      return
    }
    await route.fulfill(
      failed
        ? { status: 500, json: { code: 'XX000', message: 'test failure' } }
        : {
            json: {
              overview: {
                planCount: 0,
                completedCount: 0,
                outstandingCount: 0,
                warningCount: 0,
                lateCount: 0
              },
              rows: [],
              outstanding: []
            }
          }
    )
  })
  await page.goto('/tests/e2e/fixtures/smis-drill-report.html')
  await expect(page.getByText('演练统计暂不可用', { exact: true })).toBeVisible()
  await expect(page.locator('.business-workspace-header__metric strong')).toHaveText([
    '—',
    '—',
    '—',
    '—'
  ])
  await expect(page.getByRole('button', { name: '导出 Excel' })).toBeDisabled()
  await page.screenshot({ path: `.artifacts/drill-report-error-${test.info().project.name}.png` })
  failed = false
  await page.getByRole('button', { name: '重新加载' }).first().click()
  await expect(page.getByText('延迟完成 0', { exact: true })).toBeVisible()
  await expect(page.locator('.business-workspace-header__metric strong')).toHaveText([
    '0',
    '0',
    '0',
    '0'
  ])
  await expect(page.getByRole('button', { name: '导出 Excel' })).toBeEnabled()
  await page.screenshot({ path: `.artifacts/drill-report-empty-${test.info().project.name}.png` })
})

test('演练报表加载中重置会执行新查询并忽略旧响应', async ({ page }) => {
  let releaseOld!: () => void
  const oldGate = new Promise<void>((resolve) => {
    releaseOld = resolve
  })
  let requests = 0
  let oldFinished = false
  await page.route('**/rest/v1/**', async (route) => {
    if (!route.request().url().includes('smis_emergency_drill_report_secure')) {
      await route.fulfill({ json: [] })
      return
    }
    const isOld = ++requests === 1
    if (isOld) await oldGate
    await route.fulfill({
      json: {
        overview: {
          planCount: isOld ? 99 : 2,
          completedCount: 0,
          outstandingCount: 0,
          warningCount: 0,
          lateCount: 0
        },
        rows: [],
        outstanding: []
      }
    })
    if (isOld) oldFinished = true
  })
  await page.goto('/tests/e2e/fixtures/smis-drill-report.html')
  await expect.poll(() => requests).toBe(1)
  await page.getByRole('button', { name: '重置', exact: true }).click()
  await expect.poll(() => requests).toBe(2)
  const total = page
    .locator('.business-workspace-header__metric')
    .filter({ hasText: '计划总数' })
    .locator('strong')
  await expect(total).toHaveText('2')
  releaseOld()
  await expect.poll(() => oldFinished).toBe(true)
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
  await expect(total).toHaveText('2')
  await expect(page.getByText('99', { exact: true })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
