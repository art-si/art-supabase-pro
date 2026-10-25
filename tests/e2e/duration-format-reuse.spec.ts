import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)
test('模型测速和会话历史复用耗时格式，并保留公共加载与恢复状态', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.goto('/tests/e2e/fixtures/duration-format.html')
  const metrics = page.locator('.ai-model-selector__metrics')
  await expect(metrics).toContainText('35 ms')
  await expect(metrics).toContainText('1.23 s')
  await expect(metrics).toContainText('12.3 s')
  await page.screenshot({ path: info.outputPath('benchmark.png') })
  await page.getByRole('button', { name: '查看会话历史' }).click()
  const drawer = page.getByRole('dialog', { name: '会话历史' })
  await expect(drawer).toBeVisible()
  for (const value of ['0 ms', '35 ms', '1.23 s', '12.3 s', 'test-model · --'])
    await expect(drawer.getByText(value, { exact: false })).toBeVisible()
  await page.screenshot({ path: info.outputPath('history.png') })
  const setState = async (state: string) =>
    page.evaluate(
      (value) => window.dispatchEvent(new CustomEvent('duration-fixture-state', { detail: value })),
      state
    )
  await setState('loading')
  await expect(drawer.locator('[aria-busy="true"]').first()).toBeVisible()
  await page.screenshot({ path: info.outputPath('loading.png') })
  await setState('error')
  await expect(drawer.getByRole('button', { name: '重新加载', exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('error.png') })
  await drawer.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(drawer.getByText('test-model · 1.23 s')).toBeVisible()
  await setState('empty')
  await expect(drawer.getByText('暂无会话历史', { exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('empty.png') })
  const width = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth
  }))
  expect(width.content).toBeLessThanOrEqual(width.viewport + 1)
  expect(errors).toEqual([])
})
