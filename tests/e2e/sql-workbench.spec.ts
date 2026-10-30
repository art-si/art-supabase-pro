import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { assertAppearance, prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.beforeEach(async ({ page }, testInfo) => {
  const appearance = {
    theme: testInfo.project.name.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !testInfo.project.name.includes('shadow')
  } as const
  await prepareAppearance(page, appearance)
  // This isolated fixture omits App.vue; mirror its root attributes for teleported overlays.
  await page.addInitScript(({ boxBorderMode }) => {
    const applyRootAppearance = () => {
      document.documentElement.dataset.boxMode = boxBorderMode ? 'border-mode' : 'shadow-mode'
      document.documentElement.dataset.uiScope = 'workspace'
    }
    if (document.documentElement) applyRootAppearance()
    else document.addEventListener('DOMContentLoaded', applyRootAppearance, { once: true })
  }, appearance)
})

test('SQL drafts stay isolated between accounts and tenant scopes', async ({ page }) => {
  test.setTimeout(180_000)
  await prepareIsolatedSession(page)
  await page.route('**/functions/v1/execute-sql-with-columns', (route) =>
    route.fulfill({ json: { schemas: ['public'], functions: [], columns: [], foreignKeys: [] } })
  )
  const preview = '/tests/e2e/fixtures/sql-console-metadata.html'
  const editor = page.locator('.monaco-editor')
  await page.goto(`${preview}?actor=sql-preview-a&tenant=tenant-a`)
  await expect(editor).toBeVisible()
  await editor.click({ position: { x: 150, y: 20 } })
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('SELECT 73 AS isolated_draft;')
  await page.keyboard.press('Escape')
  for (const query of [
    'actor=sql-preview-b&tenant=tenant-a',
    'actor=sql-preview-a&tenant=tenant-b'
  ]) {
    await page.goto(`${preview}?${query}`)
    await expect(editor.locator('.view-lines')).toContainText('SELECT * FROM sys_user LIMIT 10;')
    await expect(editor.locator('.view-lines')).not.toContainText('isolated_draft')
  }
  await page.goto(`${preview}?actor=sql-preview-a&tenant=tenant-a`)
  await expect(editor.locator('.view-lines')).toContainText('isolated_draft')
})

test('SQL workspace restores drafts, runs one statement, prevents duplicates and reuses history', async ({
  page
}, testInfo) => {
  test.setTimeout(180_000)
  await prepareIsolatedSession(page)
  const queries: string[] = []
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  let releaseExecution: (() => void) | undefined
  const pendingExecution = new Promise<void>((resolve) => {
    releaseExecution = resolve
  })
  await page.route('**/functions/v1/execute-sql-with-columns', async (route) => {
    const body = route.request().postDataJSON() as { action?: string; query?: string }
    if (body.action === 'metadata') {
      await route.fulfill({
        json: {
          schemas: ['pg_temp_0', 'pg_temp_11', 'pg_toast_temp_11', 'public', 'app_private'],
          functions: [
            { routineSchema: 'pg_temp_11', routineName: 'temporary_function', returnType: 'void' }
          ],
          foreignKeys: [],
          columns: [
            {
              tableSchema: 'pg_temp_11',
              tableName: 'temporary_cache',
              columnName: 'id',
              dataType: 'uuid',
              isNullable: 'NO',
              ordinalPosition: 1
            },
            ...Array.from({ length: 62 }, (_, index) => ({
              tableSchema: 'public',
              tableName: `archive_long_table_name_for_sql_workbench_overflow_verification_${index}`,
              columnName: 'id',
              dataType: 'uuid',
              isNullable: 'NO',
              ordinalPosition: 1
            })),
            {
              tableSchema: 'public',
              tableName: 'sample_orders',
              columnName: 'order_no',
              dataType: 'text',
              isNullable: 'NO',
              ordinalPosition: 1
            }
          ]
        }
      })
      return
    }
    if (body.query?.includes('pg_catalog.pg_constraint')) {
      await route.fulfill({ json: { status: 'ok', rows: [], columns: [] } })
      return
    }
    queries.push(body.query || '')
    if (queries.length === 1) await pendingExecution
    await route.fulfill({
      json: {
        status: 'ok',
        rows: [{ value: 2, optional: null }],
        columns: [{ name: 'value' }, { name: 'optional' }],
        command_tag: 'SELECT 1',
        row_count: 1,
        duration_ms: 4.5,
        warnings: ['结果仅包含本次已加载记录'],
        notices: []
      }
    })
  })
  await page.goto(
    '/tests/e2e/fixtures/sql-console-metadata.html?actor=sql-workspace-admin&tenant=tenant-a'
  )
  await assertAppearance(page, {
    theme: testInfo.project.name.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !testInfo.project.name.includes('shadow')
  })
  const editor = page.locator('.monaco-editor')
  await expect(editor).toBeVisible()
  await editor.click({ position: { x: 150, y: 20 } })
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('SELECT 1 AS value;\nSELECT 2 AS value;')
  await page.keyboard.press('Escape')
  await page.reload()
  await expect(editor.locator('.view-lines')).toContainText('SELECT 2 AS value;')
  await editor.click({ position: { x: 150, y: 20 } })
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect.poll(() => queries.length).toBe(1)
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(page.getByRole('button', { name: '执行中', exact: true })).toBeDisabled()
  expect(queries).toEqual(['SELECT 2 AS value;'])
  releaseExecution?.()
  await expect(page.locator('.execution-info')).toContainText('返回 1 行')
  await expect(page.locator('.result-table')).toContainText('NULL')
  await page.getByText('数据库提示 · 1 条').click()
  await expect(page.getByText('结果仅包含本次已加载记录')).toBeVisible()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出查询结果', exact: true }).click()
  expect((await download).suggestedFilename()).toMatch(/SQL查询结果.*\.xlsx$/)
  await page.getByRole('button', { name: '查询历史', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('SELECT 2 AS value;')
  await page.screenshot({ path: testInfo.outputPath('history.png') })
  await page.locator('.sql-history-button').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(editor.locator('.view-lines')).not.toContainText('SELECT 1 AS value;')
  expect(queries).toHaveLength(1)
  await page.keyboard.press('ControlOrMeta+z')
  await expect(editor.locator('.view-lines')).toContainText('SELECT 1 AS value;')
  await page.getByRole('button', { name: '数据库结构', exact: true }).click()
  await expect(
    page
      .getByRole('dialog', { name: '数据库结构', exact: true })
      .locator('.el-select .art-svg-icon')
  ).toBeVisible()
  await page.getByRole('combobox', { name: '选择数据库 schema' }).click()
  await expect(page.getByRole('option').filter({ hasText: /pg_(?:toast_)?temp_/ })).toHaveCount(0)
  await expect(page.getByRole('option').filter({ hasText: 'public' })).toContainText('63 张表')
  await page.screenshot({ path: testInfo.outputPath('schemas.png') })
  await page.keyboard.press('Escape')
  await page.getByRole('textbox', { name: '搜索数据库结构' }).fill('order_no')
  expect(
    await page
      .locator('.art-drawer__subtitle')
      .evaluate((element) => element.getBoundingClientRect().height)
  ).toBeLessThanOrEqual(24)
  await expect(page.getByText('sample_orders', { exact: true })).toBeVisible()
  await expect(page.locator('.sql-table-title__count')).toHaveText('1 列匹配')
  await page.getByText('sample_orders', { exact: true }).click()
  await expect(page.getByTitle('插入 order_no · 不可为空')).toContainText('非空')
  await page.screenshot({ path: testInfo.outputPath('schema.png') })
  await page.getByTitle('插入 order_no · 不可为空').click()
  await expect(editor.locator('.view-lines')).toContainText('"order_no"')
  expect(queries).toHaveLength(1)
  await page.screenshot({ path: testInfo.outputPath('workspace.png') })
  await page.getByRole('button', { name: '数据库结构', exact: true }).click()
  const drawer = page.getByRole('dialog')
  await expect(drawer.locator('.el-pagination')).toHaveClass(/is-background/)
  await expect(drawer.locator('.sql-schema-pagination')).toContainText('共 63 张表')
  const paginationStyle = await drawer.locator('.el-pager li.is-active').evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    color: getComputedStyle(element).color,
    height: element.getBoundingClientRect().height
  }))
  expect(paginationStyle.height).toBeGreaterThanOrEqual(28)
  expect(paginationStyle.background).not.toBe('rgba(0, 0, 0, 0)')
  expect(paginationStyle.color).not.toBe(paginationStyle.background)
  const firstTable = await drawer.locator('.sql-table-title__name').first().innerText()
  await drawer.locator('.el-pager li.number').nth(1).click()
  await expect(drawer.locator('.sql-table-title__name').first()).not.toHaveText(firstTable)
  const scrollView = drawer.locator('.art-drawer__content')
  expect(
    await scrollView.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
  ).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('schema-pagination.png') })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(errors).toEqual([])
})
