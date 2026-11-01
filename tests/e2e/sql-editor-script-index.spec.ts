import { expect, test } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { prepareIsolatedSession } from './support/isolated-session'
import { prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })

test('a 1 MB imported script keeps cursor targets, selections and edits accurate', async ({
  page
}, info) => {
  test.setTimeout(120000)
  await prepareIsolatedSession(page)
  await prepareAppearance(page, {
    theme: info.project.name.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !info.project.name.includes('shadow')
  })
  const queries: string[] = []
  await page.route('**/functions/v1/execute-sql-with-columns', async (route) => {
    const body = route.request().postDataJSON() as { action?: string; query?: string }
    if (body.action === 'metadata')
      return route.fulfill({
        json: { schemas: ['public'], tables: [], columns: [], functions: [], foreignKeys: [] }
      })
    if (body.query) queries.push(body.query)
    return route.fulfill({
      json: {
        status: 'ok',
        rows: [{ checked: 1 }],
        columns: [{ name: 'checked' }],
        command_tag: 'SELECT',
        row_count: 1
      }
    })
  })
  await page.goto(
    '/tests/e2e/fixtures/sql-console-metadata.html?actor=sql-script-index&tenant=tenant-a'
  )
  await expect(page.locator('.monaco-editor')).toBeVisible()
  const repeated =
    "-- report; comment\nSELECT id, 'semi;colon' AS label FROM public.orders WHERE status = 'active';\n"
  const script =
    repeated.repeat(Math.floor(1_000_000 / repeated.length)) + 'SELECT 777 AS final_probe;'
  await page.getByRole('button', { name: '编辑器工具', exact: true }).click()
  const fileChooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: '导入 SQL 文件', exact: true }).click()
  await (
    await fileChooser
  ).setFiles({
    name: 'large-script.sql',
    mimeType: 'text/plain',
    buffer: Buffer.from(script)
  })
  const importDialog = page.getByRole('dialog', { name: '导入 SQL 文件', exact: true })
  await importDialog.getByRole('button', { name: '导入新页签', exact: true }).click()
  await expect(importDialog).toHaveCount(0)
  const editor = page.locator('.monaco-editor')
  await expect(page.getByRole('tablist', { name: 'SQL 查询页签' }).getByRole('tab')).toHaveCount(2)
  await editor.click({ position: { x: 150, y: 20 } })
  await page.keyboard.press('ControlOrMeta+End')
  await expect(page.locator('.sql-editor-status')).toContainText('列 27')
  const navigationProfile = await page.evaluate(async () => {
    const path = '/src/utils/monaco-runtime.ts'
    const { monaco } = (await import(path)) as typeof import('../../src/utils/monaco-runtime')
    const instance = monaco.editor
      .getEditors()
      .find((item) => (item.getModel()?.getValueLength() || 0) > 900000)
    const model = instance?.getModel()
    if (!instance || !model) throw new Error('Large SQL editor model was not mounted')
    const started = performance.now()
    for (let i = 0; i < 40; i++)
      instance.setPosition(
        model.getPositionAt(Math.floor((model.getValueLength() * (i + 0.5)) / 40))
      )
    const synchronousCursorMs = performance.now() - started
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    )
    const settledMs = performance.now() - started
    instance.setPosition(model.getPositionAt(model.getValueLength()))
    return {
      statementsMounted: document.querySelectorAll('.sql-statement-item').length,
      synchronousCursorMs,
      settledMs,
      probes: 40
    }
  })
  const profilePath = info.outputPath('large-script-navigation-profile.json')
  expect(navigationProfile.statementsMounted).toBeLessThan(50)
  const narrow = (page.viewportSize()?.width || 0) <= 900
  if (narrow) await page.getByRole('button', { name: '展开数据库资源', exact: true }).click()
  const navigator = page.getByRole('complementary', { name: 'SQL 语句导航', exact: true })
  const statementCount = Math.floor(1_000_000 / repeated.length) + 1
  const lastStatement = navigator.getByRole('button', {
    name: `定位第 ${statementCount} 条语句`,
    exact: true
  })
  await expect(lastStatement).toBeVisible()
  await expect(lastStatement).toHaveAttribute('aria-current', 'true')
  const visibleNavigatorStatements = await navigator.locator('.sql-statement-item').count()
  expect(visibleNavigatorStatements).toBeLessThan(50)
  await writeFile(
    profilePath,
    JSON.stringify(
      {
        ...navigationProfile,
        visibleNavigatorStatements,
        totalMountedAfterOpeningNavigator: await page.locator('.sql-statement-item').count()
      },
      null,
      2
    )
  )
  await info.attach('large-script-navigation-profile', {
    path: profilePath,
    contentType: 'application/json'
  })
  const search = navigator.getByRole('textbox', { name: '搜索脚本中的语句', exact: true })
  await search.fill('final_probe')
  await expect(navigator).toContainText(`1 / ${statementCount} 条`)
  await expect(lastStatement).toBeVisible()
  await search.fill('no-such-statement')
  await expect(navigator).toContainText('没有匹配的语句')
  await search.fill('')
  const firstStatement = navigator.getByRole('button', { name: '定位第 1 条语句', exact: true })
  await navigator.getByRole('tree').hover()
  await page.mouse.wheel(0, -2000000)
  await expect(firstStatement).toBeVisible()
  await search.focus()
  await search.press('Tab')
  await expect(firstStatement).toBeFocused()
  await firstStatement.press('End')
  await expect(lastStatement).toBeFocused()
  await lastStatement.press('Home')
  await expect(firstStatement).toBeFocused()
  await firstStatement.press('End')
  await expect(lastStatement).toBeFocused()
  await lastStatement.press('ArrowUp')
  await expect(
    navigator.getByRole('button', { name: `定位第 ${statementCount - 1} 条语句`, exact: true })
  ).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(lastStatement).toBeFocused()
  await page.screenshot({ path: info.outputPath('statement-navigator-tail.png') })
  await lastStatement.press('Enter')
  expect(queries).toHaveLength(0)
  if (narrow)
    await expect(page.getByRole('dialog', { name: '数据库资源', exact: true })).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect.poll(() => queries.length).toBe(1)
  expect(queries[0]).toBe('SELECT 777 AS final_probe;')
  await expect(page.locator('.execution-info')).toContainText('返回 1 行')

  await page.keyboard.press('Home')
  await page.keyboard.press('Shift+End')
  await expect(page.locator('.sql-editor-status')).toContainText('已选 26 字符')
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect.poll(() => queries.length).toBe(2)
  expect(queries[1]).toBe('SELECT 777 AS final_probe;')
  await expect(page.locator('.execution-info')).toContainText('返回 1 行')

  await page.keyboard.insertText('SELECT 888 AS edited_probe;')
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect.poll(() => queries.length).toBe(3)
  expect(queries[2]).toBe('SELECT 888 AS edited_probe;')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
  await page.screenshot({ path: info.outputPath('large-script-edited.png') })
})
