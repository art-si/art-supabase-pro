import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

test('AI 反馈请求失败可重试，改进意见保留输入', async ({ page, request }, testInfo) => {
  test.setTimeout(180_000)
  let submitCount = 0
  await page.route('**/rest/v1/ai_feedback?*', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ contentType: 'application/json', body: '[]' })
    }
    submitCount += 1
    if (submitCount === 2) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          id: 1,
          run_id: 'test-run-a',
          rating: 1,
          comment: null,
          correction: { schemaVersion: 1 },
          create_time: '2026-10-02T08:00:00Z',
          update_time: '2026-10-02T08:00:00Z'
        })
      })
    }
    return route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ code: '23514', message: '反馈内容未通过校验，请核对后重试' })
    })
  })
  const fixturePath = '/tests/e2e/fixtures/ai-feedback-errors.html'
  await expect
    .poll(async () => (await request.get(fixturePath)).text(), { timeout: 90_000 })
    .toContain('<title>AI 反馈错误验收</title>')
  await page.goto(fixturePath, { waitUntil: 'domcontentloaded' })
  if (testInfo.project.name.includes('dark'))
    await page.evaluate(() => document.documentElement.classList.add('dark'))

  await page.getByRole('button', { name: '有帮助' }).click()
  await expect(page.getByText('反馈内容未通过校验，请核对后重试')).toBeVisible()
  await expect(page.locator('.el-message--error')).toHaveCount(1)
  await expect(page.getByRole('button', { name: '有帮助' })).toBeEnabled()
  await page.getByRole('button', { name: '有帮助' }).click()
  await expect(page.getByText('已标记为有帮助')).toBeVisible()
  await expect(page.locator('.el-message--error')).toHaveCount(0)

  await page.getByRole('button', { name: '需要改进' }).click()
  const dialog = page.getByRole('dialog', { name: '提交 AI 改进反馈' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '提交改进意见' }).click()
  await expect(dialog.getByText('请选择问题类型')).toBeVisible()
  await dialog.getByRole('combobox', { name: '主要问题' }).click()
  await page.getByRole('option', { name: '答案不准确' }).click()
  await dialog.getByPlaceholder('选填，请描述这次结果哪里需要改进').fill('输出遗漏了关键步骤')
  await dialog.getByRole('button', { name: '提交改进意见' }).click()
  await expect(page.getByText('反馈内容未通过校验，请核对后重试')).toBeVisible()
  await expect(page.locator('.el-message--error')).toHaveCount(1)
  await expect(dialog).toBeVisible()
  await expect(dialog.getByPlaceholder('选填，请描述这次结果哪里需要改进')).toHaveValue(
    '输出遗漏了关键步骤'
  )
  const auditNote = dialog.getByText('反馈只用于 AI 质量改进，不会自动修改当前业务数据。')
  await auditNote.scrollIntoViewIfNeeded()
  await expect(auditNote).toBeVisible()
  await page.screenshot({
    path: `.artifacts/ai-feedback-error-lower-${testInfo.project.name}.png`,
    animations: 'disabled'
  })
  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth
  }))
  expect(widths.content).toBeLessThanOrEqual(widths.viewport + 1)
})

test('切换 AI 结果后忽略旧反馈请求的返回值', async ({ page, request }) => {
  test.setTimeout(180_000)
  let releaseSubmit: () => void = () => undefined
  const submitGate = new Promise<void>((resolve) => {
    releaseSubmit = resolve
  })
  let submitStarted = false
  await page.route('**/rest/v1/ai_feedback?*', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ contentType: 'application/json', body: '[]' })
      return
    }
    submitStarted = true
    await submitGate
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        id: 1,
        run_id: 'test-run-a',
        rating: 1,
        comment: null,
        correction: { schemaVersion: 1 },
        create_time: '2026-10-02T08:00:00Z',
        update_time: '2026-10-02T08:00:00Z'
      })
    })
  })
  const fixturePath = '/tests/e2e/fixtures/ai-feedback-errors.html'
  await expect
    .poll(async () => (await request.get(fixturePath)).text(), { timeout: 90_000 })
    .toContain('<title>AI 反馈错误验收</title>')
  await page.goto(fixturePath, { waitUntil: 'domcontentloaded' })

  const submitResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/rest/v1/ai_feedback') && response.request().method() === 'POST'
  )
  await page.getByRole('button', { name: '有帮助' }).click()
  try {
    await expect.poll(() => submitStarted).toBe(true)
    await page.getByRole('button', { name: '切换 AI 结果' }).click()
    await expect(page.getByRole('button', { name: '有帮助' })).toBeEnabled()
  } finally {
    releaseSubmit()
  }
  await submitResponse
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  )
  await expect(page.getByText('这次 AI 结果有帮助吗？')).toBeVisible()
  await expect(page.getByText('已标记为有帮助')).toHaveCount(0)
})
