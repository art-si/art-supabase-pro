import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

test('global assistant preserves conversation across navigation and reload, restores history and retries', async ({
  page
}) => {
  test.setTimeout(180_000)
  let calls = 0
  await page.route('**/functions/v1/ai-assistant', async (route) => {
    calls += 1
    if (calls === 1)
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'provider_auth_failed',
          message: '模型服务鉴权失败，请联系平台管理员更新服务密钥'
        })
      })
    return route.fulfill({
      json: {
        conversationId: 'test-conversation',
        runId: 'test-run',
        message: '已结合当前页面回答',
        tools: []
      }
    })
  })
  await page.goto('/tests/e2e/fixtures/global-assistant.html#/system/column-config')
  await page.getByRole('button', { name: '打开智能助手', exact: true }).click({ timeout: 120_000 })
  const drawer = page.locator('.art-ai-assistant-drawer')
  const input = drawer.getByRole('textbox').last()
  async function send(content: string) {
    await input.fill(content)
    await input.press('Enter')
  }
  await send('当前页面')
  await expect(
    drawer.getByText('可发送“打开 + 菜单名称”前往其他页面。', { exact: false }).last()
  ).toBeVisible()
  await send('筛选：项目=演示项目')
  await expect(page.getByTestId('page-filter')).toHaveText('项目：演示项目')
  await send('打开列配置')
  await drawer.getByRole('button', { name: '列配置', exact: true }).click()
  await send('解释业务流程')
  await expect(drawer.getByText('模型服务鉴权失败', { exact: false })).toBeVisible()
  await drawer.getByRole('button', { name: '重新尝试' }).click()
  await expect(drawer.getByText('已结合当前页面回答', { exact: true })).toBeVisible()
  await expect(
    drawer.locator('.art-ai-assistant__message-content').filter({ hasText: /^解释业务流程$/ })
  ).toHaveCount(1)
  await page.evaluate(() => {
    location.hash = '#/dashboard/console'
  })
  await expect(drawer.getByText('已结合当前页面回答', { exact: true })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: '打开智能助手', exact: true }).click({ timeout: 120_000 })
  await expect(drawer.getByText('已结合当前页面回答', { exact: true })).toBeVisible()
  await drawer.getByRole('button', { name: '新建对话', exact: true }).click()
  await expect(drawer.getByText('已结合当前页面回答', { exact: true })).toHaveCount(0)
  await drawer.getByRole('button', { name: '会话历史', exact: true }).click()
  const historyDrawer = page.locator('.art-assistant-history')
  await expect(historyDrawer.getByPlaceholder('搜索会话标题')).toBeVisible()
  await expect(historyDrawer.getByRole('button', { name: '重命名会话', exact: true })).toBeVisible()
  await historyDrawer.getByPlaceholder('搜索会话标题').fill('不存在的会话')
  await expect(historyDrawer.getByText('暂无会话历史')).toBeVisible()
  await historyDrawer.getByPlaceholder('搜索会话标题').fill('当前页面')
  await expect(historyDrawer.locator('.history-select')).toHaveCount(1)
  await page.screenshot({ path: `.artifacts/assistant-history-${test.info().project.name}.png` })
  await historyDrawer.locator('.history-select').click()
  await expect(historyDrawer).not.toBeVisible()
  await expect(drawer.getByText('已结合当前页面回答', { exact: true })).toBeVisible()
  await expect(drawer.getByText('服务已连接', { exact: true })).toHaveCount(0)
  await page.screenshot({ path: `.artifacts/global-assistant-${test.info().project.name}.png` })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
})

test('account changes isolate history and discard an in-flight response', async ({ page }) => {
  let finish: (() => void) | undefined
  const waiting = new Promise<void>((resolve) => {
    finish = resolve
  })
  await page.route('**/functions/v1/ai-assistant', async (route) => {
    await waiting
    await route.fulfill({
      json: { conversationId: 'old-account', runId: 'old-run', message: '旧账号回复', tools: [] }
    })
  })
  await page.goto('/tests/e2e/fixtures/global-assistant.html#/system/column-config')
  await page.getByRole('button', { name: '打开智能助手', exact: true }).click()
  const drawer = page.locator('.art-ai-assistant-drawer')
  await drawer.getByRole('textbox').last().fill('需要等待的业务问题')
  await drawer.getByRole('textbox').last().press('Enter')
  await expect(drawer.getByRole('button', { name: '新建对话', exact: true })).toBeDisabled()
  await drawer.getByRole('button', { name: '关闭 AI 业务助理', exact: true }).click()
  await page.getByRole('button', { name: '切换验收账号', exact: true }).click()
  finish?.()
  await page.getByRole('button', { name: '打开智能助手', exact: true }).click()
  await expect(drawer.getByText('需要等待的业务问题', { exact: true })).toHaveCount(0)
  await expect(drawer.getByText('旧账号回复', { exact: true })).toHaveCount(0)
  await expect(drawer.getByRole('button', { name: '新建对话', exact: true })).toBeEnabled()
})
