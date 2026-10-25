import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

test('WebSocket 示例可连接、收发、断开并重新连接', async ({ page }) => {
  const pageErrors: string[] = []
  const sockets: Array<{ close(options?: { code?: number; reason?: string }): Promise<void> }> = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.routeWebSocket('ws://localhost:8080/ws', (socket) => {
    sockets.push(socket)
    socket.onMessage((message) => socket.send(`echo:${message}`))
  })

  await page.goto('/tests/e2e/fixtures/socket-chat.html')
  await expect(page.getByRole('heading', { name: 'WebSocket 连接示例' })).toBeVisible()
  await expect(page.getByText('暂无消息记录')).toBeVisible()

  const serverAddress = page.getByRole('textbox', { name: '服务器地址' })
  await serverAddress.fill('https://example.com')
  await page.getByRole('button', { name: '连接', exact: true }).click()
  await expect(page.getByText('请输入有效的 WebSocket 地址')).toBeVisible()
  await expect(page.getByText('已断开').first()).toBeVisible()

  await serverAddress.fill('ws://localhost:8080/ws')
  await page.getByRole('button', { name: '连接', exact: true }).click()
  await expect(page.getByText('已连接').first()).toBeVisible()

  await page.getByRole('textbox', { name: '消息内容' }).fill('hello')
  await page.getByRole('button', { name: '发送消息' }).click()
  await expect(page.locator('.message-item')).toHaveCount(2)
  await expect(page.getByText('echo:hello', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: '断开连接' }).click()
  await expect(page.getByText('已断开').first()).toBeVisible()
  await expect(page.getByRole('button', { name: '发送消息' })).toBeDisabled()

  await page.getByRole('button', { name: '重连' }).click()
  await expect(page.getByText('已连接').first()).toBeVisible()

  const activeSocket = sockets.at(-1)
  if (!activeSocket) throw new Error('模拟 WebSocket 未建立')
  await activeSocket.close({ code: 1011, reason: '模拟服务中断' })
  await expect(page.getByText('重连中（1/5）').first()).toBeVisible()
  await page.getByRole('button', { name: '断开连接' }).click()
  await expect(page.getByText('已断开').first()).toBeVisible()
  await page.getByRole('button', { name: '重连' }).click()
  await expect(page.getByText('已连接').first()).toBeVisible()

  await expect(page.locator('.el-message')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'WebSocket 连接示例' })).toBeVisible()

  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
    await expect(page.getByRole('heading', { name: 'WebSocket 连接示例' })).toBeVisible()
    const overflow = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth
    }))
    expect(overflow.content).toBeLessThanOrEqual(overflow.viewport + 1)
    await page.screenshot({
      path: `.artifacts/socket-chat-${width}.png`,
      animations: 'disabled',
      fullPage: true
    })
  }

  await page.setViewportSize({ width: 1280, height: 900 })
  await page.evaluate(() => {
    document.documentElement.classList.add('dark')
    document.documentElement.dataset.boxMode = 'shadow-mode'
  })
  await expect(page.getByRole('heading', { name: 'WebSocket 连接示例' })).toBeVisible()
  await page.screenshot({
    path: '.artifacts/socket-chat-dark-shadow-1280.png',
    animations: 'disabled',
    fullPage: true
  })
  expect(pageErrors).toEqual([])
})
