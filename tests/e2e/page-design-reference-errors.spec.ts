import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

test('设计参考保存失败时保留内容并提示一次', async ({ page, request }, testInfo) => {
  test.setTimeout(180_000)
  await page.route('**/rest/v1/ai_ui_design_reference?*', (route) =>
    route.fulfill({
      status: route.request().method() === 'GET' ? 200 : 400,
      contentType: 'application/json',
      body:
        route.request().method() === 'GET'
          ? '[]'
          : JSON.stringify({ code: '23514', message: '设计参考内容不符合要求，请调整后重试' })
    })
  )
  const fixturePath = '/tests/e2e/fixtures/page-design-reference-errors.html'
  await expect
    .poll(async () => (await request.get(fixturePath)).text(), { timeout: 90_000 })
    .toContain('<title>设计参考错误反馈验收</title>')
  await page.goto(fixturePath, { waitUntil: 'domcontentloaded' })
  if (testInfo.project.name.includes('dark'))
    await page.evaluate(() => document.documentElement.classList.add('dark'))

  await page.getByRole('button', { name: '将当前路由标记为设计参考' }).click()
  const dialog = page.getByRole('dialog', { name: '添加设计参考' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('textbox', { name: '设计参考补充说明' }).fill('保持模块紧凑且层级清晰')
  await dialog.getByRole('button', { name: '保存参考' }).click()
  await expect(page.getByText('设计参考内容不符合要求，请调整后重试')).toBeVisible()
  await expect(page.locator('.el-message--error')).toHaveCount(1)
  await expect(dialog).toBeVisible()
  const note = dialog.getByRole('textbox', { name: '设计参考补充说明' })
  await expect(note).toHaveValue('保持模块紧凑且层级清晰')
  await note.scrollIntoViewIfNeeded()
  await expect(note).toBeInViewport()
  await page.screenshot({
    path: `.artifacts/page-design-reference-error-${testInfo.project.name}.png`,
    animations: 'disabled'
  })
  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth
  }))
  expect(widths.content).toBeLessThanOrEqual(widths.viewport + 1)
})

test('参考图片上传失败时保留待上传截图', async ({ page, request }) => {
  test.setTimeout(180_000)
  await page.route('**/rest/v1/ai_ui_design_reference?*', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body:
        route.request().method() === 'GET'
          ? '[]'
          : JSON.stringify({
              id: '33333333-3333-4333-8333-333333333333',
              route_name: 'VisualAuditWorkspace',
              route_path_pattern: '/demo/workspace',
              page_title: '测试工作台',
              surface_kind: 'workspace',
              preference_tags: [],
              note: null,
              style_snapshot: {},
              source_revision: null,
              create_time: '2026-10-02T08:00:00Z',
              update_time: '2026-10-02T08:00:00Z'
            })
    })
  )
  const fixturePath = '/tests/e2e/fixtures/page-design-reference-errors.html'
  await expect
    .poll(async () => (await request.get(fixturePath)).text(), { timeout: 90_000 })
    .toContain('<title>设计参考错误反馈验收</title>')
  await page.goto(fixturePath, { waitUntil: 'domcontentloaded' })

  await page.getByRole('button', { name: '将当前路由标记为设计参考' }).click()
  const dialog = page.getByRole('dialog', { name: '添加设计参考' })
  await dialog.locator('input[type="file"]').setInputFiles({
    name: '参考截图.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/1d8AAAAASUVORK5CYII=',
      'base64'
    )
  })
  await expect(dialog.getByText('1/6')).toBeVisible()
  await dialog.getByRole('button', { name: '保存参考' }).click()
  await expect(page.locator('.el-message--error')).toHaveCount(1)
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('参考截图.png')).toBeVisible()
})
