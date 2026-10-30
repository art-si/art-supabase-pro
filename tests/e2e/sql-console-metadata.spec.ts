import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

test('SQL metadata failure keeps execution usable and retry reloads schema', async ({
  page
}, testInfo) => {
  test.setTimeout(120_000)
  let metadataRequests = 0
  const vueContextWarnings: string[] = []
  page.on('console', (message) => {
    if (message.text().includes('Missing ref owner context')) {
      vueContextWarnings.push(message.text())
    }
  })
  await page.addInitScript(() => {
    localStorage.setItem(
      'sb-ckbftoopuyophiebamwy-auth-token',
      JSON.stringify({
        access_token: 'a.b.c',
        refresh_token: 'test-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'bearer',
        user: {
          id: '00000000-0000-0000-0000-000000000000',
          aud: 'authenticated',
          role: 'authenticated'
        }
      })
    )
  })
  await page.route('**/functions/v1/execute-sql-with-columns', async (route) => {
    const body = route.request().postDataJSON() as { action?: string; query?: string }
    if (body.action === 'metadata') {
      metadataRequests += 1
      await route.fulfill(
        metadataRequests === 1
          ? { status: 503, json: { status: 'error', message: 'temporary failure' } }
          : {
              status: 200,
              json: {
                schemas: ['public'],
                columns: [
                  {
                    tableSchema: 'public',
                    tableName: 'sys_user',
                    columnName: 'id',
                    dataType: 'uuid',
                    isNullable: 'NO',
                    ordinalPosition: 1
                  }
                ],
                functions: []
              }
            }
      )
      return
    }
    if (body.query?.includes('pg_catalog.pg_constraint')) {
      await route.fulfill({ status: 200, json: { status: 'ok', rows: [], columns: [] } })
      return
    }
    await route.fulfill({
      status: 200,
      json: {
        status: 'ok',
        rows: [],
        columns: [],
        command_tag: 'SELECT 0',
        row_count: 0,
        duration_ms: 2
      }
    })
  })

  await page.goto('/tests/e2e/fixtures/sql-console-metadata.html')
  const warning = page.locator('.sql-editor-section__metadata-alert')
  await expect(warning).toBeVisible()
  await expect(warning).toContainText('关键字提示可用')
  await expect(page.locator('.monaco-editor')).toBeVisible()

  // Keyword completion must work even when database metadata is unavailable.
  const editor = page.locator('.monaco-editor')
  const suggestions = page.locator('.suggest-widget.visible')
  await editor.click({ position: { x: 150, y: 12 } })
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('sel')
  await expect(suggestions.getByText('SELECT', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Control+Space')
  await suggestions.getByText('SELECT', { exact: true }).dblclick()
  await expect(editor.locator('.view-lines')).toContainText('SELECT')
  await page.keyboard.type(" 'highlight check', 1;")
  await page.keyboard.press('Escape')
  await expect
    .poll(() =>
      editor
        .locator('.view-line span[class*="mtk"]')
        .evaluateAll((tokens) => new Set(tokens.map((token) => getComputedStyle(token).color)).size)
    )
    .toBeGreaterThan(1)

  if (testInfo.project.name.includes('dark')) {
    await expect(page.locator('html')).toHaveClass(/dark/)
    await expect(page.locator('.monaco-editor')).toHaveClass(/vs-dark/)
    await expect
      .poll(() =>
        page
          .locator('.monaco-editor .view-line span[class*="mtk"]')
          .evaluateAll(
            (tokens) => new Set(tokens.map((token) => getComputedStyle(token).color)).size
          )
      )
      .toBeGreaterThan(1)
  }
  const actions = page.locator('.tabs-actions')
  for (const name of ['AI 写 SQL', '执行 SQL', '格式化 SQL', '清空 SQL']) {
    const action = actions.getByRole('button', { name })
    await expect(action).toBeVisible()
    await expect(action.locator('svg path').first()).toHaveAttribute('d', /.+/)
  }
  const actionsBounds = await actions.evaluate((element) => ({
    left: element.getBoundingClientRect().left,
    right: element.getBoundingClientRect().right,
    viewportWidth: document.documentElement.clientWidth
  }))
  expect(actionsBounds.left).toBeGreaterThanOrEqual(0)
  expect(actionsBounds.right).toBeLessThanOrEqual(actionsBounds.viewportWidth + 1)
  expect(metadataRequests).toBe(1)
  await actions.getByRole('button', { name: '执行 SQL' }).click()
  await expect(page.getByText('执行成功，暂无数据行')).toBeVisible()
  await page.mouse.move(2, 2)
  await page.screenshot({
    path: `.artifacts/sql-console-metadata-${testInfo.project.name}-error.png`,
    animations: 'disabled'
  })

  await warning.getByRole('button', { name: '重试加载' }).click({ timeout: 5_000 })
  await expect(warning).toHaveCount(0)
  expect(metadataRequests).toBe(2)

  // Retrying metadata also restores table and alias-qualified column completion.
  await editor.click({ position: { x: 150, y: 12 } })
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('SELECT * FROM sys_')
  await expect(suggestions.getByText('sys_user', { exact: true })).toBeVisible()
  await suggestions.getByText('sys_user', { exact: true }).dblclick()
  await page.keyboard.type(' u WHERE u.')
  await expect(suggestions.getByText('id', { exact: true })).toBeVisible()
  await suggestions.getByText('id', { exact: true }).dblclick()
  await expect(editor.locator('.view-lines')).toContainText('u.id')
  await page.keyboard.press('Escape')
  await page.mouse.move(2, 2)
  await page.screenshot({
    path: `.artifacts/sql-console-metadata-${testInfo.project.name}-ready.png`,
    animations: 'disabled'
  })

  const viewport = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }))
  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.width + 1)
  expect(vueContextWarnings).toEqual([])
})
