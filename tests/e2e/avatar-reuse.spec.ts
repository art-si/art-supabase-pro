import { expect, test } from '@playwright/test'

test('时间线和审批板共享完整的 Unicode 头像且保留各自空名称占位', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.goto('/tests/e2e/fixtures/avatar-reuse.html', { waitUntil: 'domcontentloaded' })
  const timeline = page.locator('.art-process-timeline__avatar')
  const board = page.locator('.workflow-task-board__avatar')
  await expect(timeline).toHaveText(['张三', 'JD', '👩‍🔧S', '🇨🇳李', '?'])
  await expect(board).toHaveText(['张三', 'JD', '👩‍🔧S', '🇨🇳李', '待'])
  await expect(page.locator('.art-process-timeline__actor time').first()).toHaveText(
    '2026-10-10 09:15:00'
  )
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  )
  expect(overflow).toBe(false)
  await page.screenshot({ path: test.info().outputPath('shared-avatar.png'), fullPage: true })
  await page.getByRole('button', { name: '切换空状态' }).click()
  await expect(page.getByText('暂无处理记录', { exact: true })).toBeVisible()
  await expect(page.getByText('流程尚未生成审批任务', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '恢复记录' }).click()
  await expect(board).toHaveCount(5)
  expect(errors).toEqual([])
})
