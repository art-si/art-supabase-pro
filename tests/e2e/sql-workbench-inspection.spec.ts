import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.beforeEach(({ page }) => {
  page.setDefaultNavigationTimeout(60_000)
})

test('schema relationships, query templates and explain remain inspectable without running SQL', async ({
  page
}, testInfo) => {
  test.setTimeout(180_000)
  page.setDefaultTimeout(10_000)
  await prepareIsolatedSession(page)
  await prepareAppearance(page, {
    theme: testInfo.project.name.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !testInfo.project.name.includes('shadow')
  })
  await page.addInitScript(
    ({ boxBorderMode }) => {
      const applyRootAppearance = () => {
        document.documentElement.dataset.boxMode = boxBorderMode ? 'border-mode' : 'shadow-mode'
        document.documentElement.dataset.uiScope = 'workspace'
      }
      if (document.documentElement) applyRootAppearance()
      else document.addEventListener('DOMContentLoaded', applyRootAppearance, { once: true })
    },
    { boxBorderMode: !testInfo.project.name.includes('shadow') }
  )

  const executedQueries: string[] = []
  const executionOptions: Array<{ maxRows?: number; timeoutMs?: number }> = []
  const explainedQueries: string[] = []
  const pageErrors: string[] = []
  const planPayload = [
    {
      Plan: {
        'Node Type': 'Seq Scan',
        'Relation Name': 'orders',
        'Total Cost': 12.5,
        Filter: `name = '<script>window.__planXss = true</script>' AND ${'long_field_'.repeat(28)}`
      }
    }
  ]
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.route('**/functions/v1/execute-sql-with-columns', async (route) => {
    const body = route.request().postDataJSON() as {
      action?: string
      query?: string
      maxRows?: number
      timeoutMs?: number
    }
    if (body.action === 'metadata') {
      await route.fulfill({
        json: {
          schemas: ['public'],
          functions: [],
          columns: [
            {
              tableSchema: 'public',
              tableName: 'orders',
              columnName: 'id',
              dataType: 'uuid',
              isNullable: 'NO',
              ordinalPosition: 1,
              description: '订单主键',
              isPrimaryKey: true
            },
            {
              tableSchema: 'public',
              tableName: 'orders',
              columnName: 'customer_id',
              dataType: 'uuid',
              isNullable: 'NO',
              ordinalPosition: 2,
              description: '关联客户'
            },
            {
              tableSchema: 'public',
              tableName: 'customers',
              columnName: 'id',
              dataType: 'uuid',
              isNullable: 'NO',
              ordinalPosition: 1,
              isPrimaryKey: true
            }
          ],
          tables: [
            {
              tableSchema: 'public',
              tableName: 'orders',
              description: '客户订单',
              kind: 'table',
              indexes: [
                {
                  name: 'orders_customer_id_idx',
                  columns: ['customer_id'],
                  isUnique: false,
                  isPrimary: false,
                  definition: 'CREATE INDEX orders_customer_id_idx ON public.orders (customer_id)'
                }
              ]
            },
            { tableSchema: 'public', tableName: 'customers', kind: 'table', indexes: [] }
          ],
          foreignKeys: [
            {
              sourceSchema: 'public',
              sourceTable: 'orders',
              sourceColumn: 'customer_id',
              targetSchema: 'public',
              targetTable: 'customers',
              targetColumn: 'id',
              constraintName: 'orders_customer_id_fkey'
            }
          ]
        }
      })
      return
    }
    if (body.action === 'explain') {
      explainedQueries.push(body.query || '')
      if (explainedQueries.length === 1) {
        await route.fulfill({
          json: { status: 'error', errorMessage: '无法生成执行计划，请调整查询后重试' }
        })
        return
      }
      await route.fulfill({
        json: {
          status: 'ok',
          plan: planPayload,
          estimatedCost: 12.5,
          estimatedRows: 1,
          planningTimeMs: 0.4
        }
      })
      return
    }
    if (body.query?.includes('pg_catalog.pg_constraint')) {
      await route.fulfill({
        json: {
          status: 'ok',
          rows: [
            {
              source_schema: 'public',
              source_table: 'orders',
              source_column: 'customer_id',
              target_schema: 'public',
              target_table: 'customers',
              target_column: 'id',
              constraint_name: 'orders_customer_id_fkey'
            }
          ],
          columns: []
        }
      })
      return
    }
    executedQueries.push(body.query || '')
    executionOptions.push({ maxRows: body.maxRows, timeoutMs: body.timeoutMs })
    await route.fulfill({
      json: {
        status: 'ok',
        rows: [{ id: 'order-1' }],
        columns: [{ name: 'id' }],
        command_tag: 'SELECT 1',
        row_count: 1,
        duration_ms: 3.2,
        truncated: true,
        max_rows: body.maxRows,
        warnings: [],
        notices: []
      }
    })
  })

  await page.goto(
    '/tests/e2e/fixtures/sql-console-metadata.html?actor=sql-inspection&tenant=tenant-a'
  )
  const editor = page.locator('.monaco-editor')
  await expect(editor).toBeVisible()
  await page.getByRole('button', { name: '数据库结构', exact: true }).click()
  const schemaDrawer = page.getByRole('dialog')
  await schemaDrawer.getByText('orders', { exact: true }).click()
  await expect(schemaDrawer).toContainText('客户订单')
  await expect(schemaDrawer).toContainText('订单主键')
  await expect(schemaDrawer).toContainText('关联客户')
  await expect(schemaDrawer).toContainText('orders_customer_id_idx')
  await expect(schemaDrawer).toContainText('PK')
  await expect(schemaDrawer).toContainText('FK')
  expect(
    await schemaDrawer
      .locator('.art-drawer__content')
      .evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
  ).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
  await page.screenshot({ path: testInfo.outputPath('schema-expanded.png') })

  await schemaDrawer.getByRole('button', { name: '定位关联表 public.customers' }).click()
  await expect(schemaDrawer.getByText('customers', { exact: true })).toBeVisible()
  await expect(schemaDrawer).toContainText('id')
  expect(executedQueries).toHaveLength(0)

  await schemaDrawer.getByText('orders', { exact: true }).click()
  for (const [label, sqlPattern] of [
    ['生成 SELECT 查询', /SELECT[\s\S]*FROM[\s\S]*orders[\s\S]*LIMIT/i],
    ['生成 COUNT 查询', /SELECT[\s\S]*COUNT\([\s\S]*FROM[\s\S]*orders/i],
    ['生成主键筛选查询', /SELECT[\s\S]*FROM[\s\S]*orders[\s\S]*WHERE[\s\S]*id/i]
  ] as const) {
    await schemaDrawer.getByRole('button', { name: label }).click()
    await expect(schemaDrawer).toHaveCount(0)
    await expect.poll(() => editor.locator('.view-lines').innerText()).toMatch(sqlPattern)
    expect(executedQueries).toHaveLength(0)
    await page.getByRole('button', { name: '数据库结构', exact: true }).click()
    if (!(await schemaDrawer.getByRole('button', { name: label }).isVisible())) {
      await schemaDrawer.getByText('orders', { exact: true }).click()
    }
  }

  await schemaDrawer.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(schemaDrawer).toHaveCount(0)
  await page.getByRole('button', { name: '查询设置' }).click()
  await page.locator('.el-popover .el-select').first().click()
  await page.getByRole('option', { name: '500 行' }).click()
  await expect(page.locator('.el-popover .el-select').nth(1)).toBeVisible()
  await page.locator('.el-popover .el-select').nth(1).click()
  await page.getByRole('option', { name: '5 秒' }).click()
  await expect(page.locator('.el-popover .el-select').first()).toBeVisible()
  expect(
    await page
      .locator('.el-popover')
      .evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
  ).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
  await page.screenshot({ path: testInfo.outputPath('query-settings.png') })
  await page.getByRole('button', { name: '查询设置' }).click()
  await editor.click({ position: { x: 150, y: 20 } })
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('SELECT id FROM public.orders LIMIT 1;')
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(page.locator('.result-table')).toContainText('order-1')
  await expect(page.locator('.sql-result-limit')).toContainText('仅展示前 500 行')
  expect(executedQueries).toHaveLength(1)
  expect(executionOptions).toEqual([{ maxRows: 500, timeoutMs: 5000 }])

  await page.getByRole('button', { name: '查看执行计划' }).click()
  const planDrawer = page.getByRole('dialog', { name: '执行计划' })
  await expect(planDrawer).toContainText('无法生成执行计划，请调整查询后重试')
  await planDrawer.getByRole('button', { name: '重新分析' }).click()
  await expect(planDrawer).toContainText('Seq Scan')
  const sqlPreview = planDrawer.locator('details.sql-plan-code').first()
  const jsonPreview = planDrawer.locator('details.sql-plan-code').last()
  const sqlSummary = sqlPreview.locator('summary')
  const jsonSummary = jsonPreview.locator('summary')
  await expect(sqlSummary).toContainText('本次分析的 SQL')
  await expect(jsonSummary).toContainText('原始 JSON')

  if ((await sqlPreview.getAttribute('open')) === null) await sqlSummary.click()
  await expect(sqlPreview).toHaveAttribute('open', '')
  await expect(sqlPreview.locator('code.language-sql .hljs-keyword').first()).toBeVisible()
  await sqlSummary.focus()
  await page.keyboard.press('Space')
  await expect(sqlPreview).not.toHaveAttribute('open', '')
  await page.keyboard.press('Enter')
  await expect(sqlPreview).toHaveAttribute('open', '')
  await page.screenshot({ path: testInfo.outputPath('execution-plan-sql.png') })
  await sqlSummary.focus()
  await page.keyboard.press('ControlOrMeta+f')
  await sqlPreview.getByRole('textbox', { name: '查找 SQL 内容' }).fill('SELECT')
  await expect(sqlPreview.getByRole('status')).toContainText('1 / 1')
  await sqlPreview.getByRole('textbox', { name: '查找 SQL 内容' }).fill('from public')
  await expect(sqlPreview.getByRole('status')).toContainText('1 / 1')
  await expect
    .poll(() =>
      page.evaluate(() =>
        CSS.highlights?.get('art-sql-code-find')?.values().next().value?.toString()
      )
    )
    .toBe('FROM public')
  await page.keyboard.press('Escape')
  await expect(planDrawer).toBeVisible()
  await expect(sqlPreview.getByRole('textbox', { name: '查找 SQL 内容' })).toHaveCount(0)

  if ((await jsonPreview.getAttribute('open')) === null) await jsonSummary.click()
  await expect(jsonPreview).toHaveAttribute('open', '')
  const jsonCode = jsonPreview.locator('code.language-json')
  await expect(jsonCode.locator('.hljs-attr').first()).toBeVisible()
  await expect(jsonCode.locator('.hljs-number').first()).toBeVisible()
  await expect(jsonCode).toContainText('<script>window.__planXss = true</script>')
  await expect(jsonCode.locator('script')).toHaveCount(0)
  expect(await page.evaluate(() => Reflect.get(window, '__planXss'))).toBeUndefined()

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await sqlPreview.getByRole('button', { name: '复制 SQL' }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'SELECT id FROM public.orders LIMIT 1;'
  )
  await jsonPreview.getByRole('button', { name: '复制 JSON' }).click()
  expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe(
    JSON.stringify(planPayload, null, 2)
  )

  const wrapButton = jsonPreview.getByRole('button', { name: '启用自动换行' })
  await expect(wrapButton).toHaveAttribute('aria-pressed', 'false')
  await wrapButton.click()
  await expect(jsonPreview.getByRole('button', { name: '取消自动换行' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await expect(jsonPreview.locator('pre.is-wrapped')).toBeVisible()
  expect(
    await jsonPreview
      .locator('.sql-plan-code__content')
      .evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
  ).toBe(true)
  expect(
    await planDrawer
      .locator('.art-drawer__content')
      .evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
  ).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
  await jsonPreview.scrollIntoViewIfNeeded()
  await jsonPreview.getByRole('button', { name: '查找 JSON', exact: true }).click()
  await jsonPreview.getByRole('textbox', { name: '查找 JSON 内容' }).fill('long_field')
  await expect(jsonPreview.getByRole('status')).toContainText('1 / 28')
  await page.screenshot({ path: testInfo.outputPath('code-find.png') })
  await jsonPreview.getByRole('button', { name: '下一个匹配' }).click()
  await expect(jsonPreview.getByRole('status')).toContainText('2 / 28')
  expect(
    await jsonPreview
      .locator('.sql-plan-code__content')
      .evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
  ).toBe(true)
  await expect(jsonCode.locator('.hljs-attr').first()).toBeVisible()
  await jsonPreview.getByRole('button', { name: '上一个匹配' }).click()
  await expect(jsonPreview.getByRole('status')).toContainText('1 / 28')
  await jsonPreview.getByRole('button', { name: '关闭代码查找' }).click()
  await jsonPreview.getByRole('button', { name: '查找 JSON', exact: true }).click()
  await expect(jsonPreview.getByRole('status')).toContainText('1 / 28')
  await expect
    .poll(() => page.evaluate(() => CSS.highlights?.get('art-sql-code-find')?.size || 0))
    .toBe(1)
  await jsonPreview.getByRole('textbox', { name: '查找 JSON 内容' }).fill('no-such-json-value')
  await expect(jsonPreview.getByRole('status')).toContainText('0 / 0')
  await expect(jsonPreview.getByRole('button', { name: '下一个匹配' })).toBeDisabled()
  await jsonPreview.getByRole('button', { name: '关闭代码查找' }).click()
  await page.screenshot({ path: testInfo.outputPath('execution-plan-code.png') })
  await page.screenshot({ path: testInfo.outputPath('execution-plan.png') })
  expect(explainedQueries).toEqual([
    'SELECT id FROM public.orders LIMIT 1;',
    'SELECT id FROM public.orders LIMIT 1;'
  ])
  expect(executedQueries).toHaveLength(1)
  await expect(page.locator('.result-table')).toContainText('order-1')
  expect(pageErrors).toEqual([])
  await planDrawer.getByRole('button', { name: '查看表结构 orders', exact: true }).click()
  const structure = page.getByRole('dialog', { name: '数据库结构' })
  await expect(structure).toContainText('客户订单')
  await expect(structure.locator('.el-collapse-item.is-active')).toContainText('订单主键')
  expect(executedQueries).toHaveLength(1)
})

test('advanced SQL workspace navigates statements and collapses its resizable panel', async ({
  page
}, testInfo) => {
  test.setTimeout(180_000)
  page.setDefaultTimeout(10_000)
  await prepareIsolatedSession(page)
  await prepareAppearance(page, {
    theme: testInfo.project.name.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !testInfo.project.name.includes('shadow')
  })
  const queries: string[] = []
  await page.route('**/functions/v1/execute-sql-with-columns', async (route) => {
    const body = route.request().postDataJSON() as { action?: string; query?: string }
    if (body.action === 'metadata') {
      await route.fulfill({
        json: { schemas: ['public'], tables: [], columns: [], functions: [], foreignKeys: [] }
      })
      return
    }
    queries.push(body.query || '')
    await route.fulfill({
      json: {
        status: 'ok',
        rows: [{ second: 22 }],
        columns: [{ name: 'second' }],
        command_tag: 'SELECT',
        row_count: 1
      }
    })
  })
  await page.goto(
    '/tests/e2e/fixtures/sql-console-metadata.html?actor=sql-advanced&tenant=tenant-a'
  )
  const editor = page.locator('.monaco-editor')
  await expect(editor).toBeVisible()
  await editor.click({ position: { x: 150, y: 20 } })
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type(
    "-- first\nSELECT 'a;b' AS first;\nSELECT 22 AS second;\nSELECT 33 AS third;"
  )
  await page.keyboard.press('Escape')
  const narrow = (page.viewportSize()?.width || 0) <= 900
  if (narrow) await page.getByRole('button', { name: '展开数据库资源', exact: true }).click()
  const navigator = page.getByRole('complementary', { name: 'SQL 语句导航' })
  await expect(navigator).toContainText('3 / 3 条')
  await navigator.getByRole('button', { name: '定位第 2 条语句', exact: true }).click()
  if (narrow) await expect(page.getByRole('dialog', { name: '数据库资源' })).toHaveCount(0)
  expect(queries).toEqual([])
  await page.keyboard.press('Shift+ArrowRight')
  await page.getByRole('button', { name: '选择当前语句' }).click()
  await page.keyboard.insertText('SELECT 23 AS second;')
  await expect(editor.locator('.view-lines')).toContainText('SELECT 23 AS second;')
  await page.getByRole('button', { name: '撤销 SQL 编辑' }).click()
  await expect(editor.locator('.view-lines')).not.toContainText('SELECT 23 AS second;')
  await page.getByRole('button', { name: '重做 SQL 编辑' }).click()
  await expect(editor.locator('.view-lines')).toContainText('SELECT 23 AS second;')
  await editor.click({ position: { x: 150, y: 20 } })
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText(
    "-- first\nSELECT 'a;b' AS first;\nSELECT 22 AS second;\nSELECT 33 AS third;"
  )
  await page.getByRole('button', { name: '查找 SQL 内容', exact: true }).click()
  await expect(editor.locator('.find-widget')).toHaveClass(/visible/)
  await editor.locator('.find-widget .find-part').getByRole('textbox').fill('second')
  await page.keyboard.press('Escape')
  if (!narrow) {
    const splitter = page.locator('.sql-workspace-splitter')
    const handle = splitter.locator(':scope > .el-splitter-bar .el-splitter-bar__dragger')
    const bounds = await handle.boundingBox()
    if (!bounds) throw new Error('Missing navigator resize handle')
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
    await page.mouse.down()
    await page.mouse.move(bounds.x + bounds.width / 2 + 40, bounds.y + bounds.height / 2, {
      steps: 8
    })
    await page.mouse.up()
    const expandedWidth = (await editor.boundingBox())?.width || 0
    await page.locator('.sql-editor-tools').getByRole('button', { name: '收起数据库资源' }).click()
    await expect(navigator).toHaveCount(0)
    await expect(editor).toBeVisible()
    await expect(page.locator('.result-section')).toBeVisible()
    expect((await editor.boundingBox())?.width || 0).toBeGreaterThan(expandedWidth + 180)
    await page.reload()
    await expect(page.getByRole('button', { name: '展开数据库资源' })).toBeVisible()
    await page.getByRole('button', { name: '展开数据库资源' }).click()
    await expect(navigator).toBeVisible()
    const width = await page
      .locator('.sql-workspace-splitter > .el-splitter-panel')
      .first()
      .evaluate((element) => element.getBoundingClientRect().width)
    expect(width).toBeGreaterThan(300)
  } else await page.getByRole('button', { name: '展开数据库资源' }).click()
  await page
    .getByRole('complementary', { name: 'SQL 语句导航' })
    .getByRole('button', { name: '定位第 2 条语句' })
    .click()
  if (narrow) await expect(page.getByRole('dialog', { name: '数据库资源' })).toHaveCount(0)
  await page.getByRole('button', { name: '执行 SQL', exact: true }).click()
  await expect.poll(() => queries).toEqual(['SELECT 22 AS second;'])
  await expect(page.locator('.result-table')).toContainText('22')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
  await page.screenshot({ path: testInfo.outputPath('advanced-workspace.png') })
  await page.clock.install()
  await page.getByRole('button', { name: '查找 SQL 内容', exact: true }).click()
  await editor.locator('.find-widget .find-part').getByRole('textbox').fill('second')
  await editor.locator('.find-widget .find-part').getByRole('textbox').press('Enter')
  await page.clock.fastForward(1000)
  await page.keyboard.press('Escape')
  if (narrow) await page.getByRole('button', { name: '展开数据库资源' }).click()
  await page
    .getByRole('complementary', { name: 'SQL 语句导航' })
    .getByRole('textbox', { name: '搜索脚本中的语句' })
    .fill('second')
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('sql-preview-tenant-change', { detail: 'tenant-b' }))
  )
  await expect(editor.locator('.view-lines')).toContainText('SELECT * FROM sys_user LIMIT 10;')
  await expect(page.locator('.result-table')).toHaveCount(0)
  await page.getByRole('button', { name: '查找 SQL 内容', exact: true }).click()
  await expect(editor.locator('.find-widget .find-part').getByRole('textbox')).not.toHaveValue(
    'second'
  )
  await editor.locator('.find-widget .find-part').getByRole('textbox').fill('')
  await editor.locator('.find-widget .find-part').getByRole('textbox').press('ArrowUp')
  await expect(editor.locator('.find-widget .find-part').getByRole('textbox')).not.toHaveValue(
    'second'
  )
  await page.keyboard.press('Escape')
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('sql-preview-tenant-change', { detail: 'tenant-a' }))
  )
  await expect(editor.locator('.view-lines')).toContainText('SELECT 22 AS second;')
  if (narrow) await page.getByRole('button', { name: '展开数据库资源' }).click()
  await expect(
    page
      .getByRole('complementary', { name: 'SQL 语句导航' })
      .getByRole('textbox', { name: '搜索脚本中的语句' })
  ).toHaveValue('')
  if (narrow)
    await page
      .getByRole('dialog', { name: '数据库资源' })
      .getByRole('button', { name: '关闭', exact: true })
      .click()
  expect(queries).toHaveLength(1)
  if (!narrow) {
    await page.locator('.sql-console-container').evaluate((element) => {
      element.style.width = '560px'
    })
    await expect(page.getByRole('button', { name: '展开数据库资源' })).toBeVisible()
    await expect(page.getByRole('complementary', { name: 'SQL 语句导航' })).toHaveCount(0)
    expect((await editor.boundingBox())?.width || 0).toBeGreaterThan(540)
    await page.getByRole('button', { name: '展开数据库资源' }).click()
    await expect(page.getByRole('dialog', { name: '数据库资源' })).toBeVisible()
    await page
      .getByRole('dialog', { name: '数据库资源' })
      .getByRole('button', { name: '定位第 2 条语句' })
      .click()
    await expect(page.getByRole('dialog', { name: '数据库资源' })).toHaveCount(0)
    expect(
      await page
        .locator('.tabs-header')
        .evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
    ).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('constrained-workspace.png') })
  }
})

test('ordinary user can inspect schema but cannot execute or explain SQL', async ({ page }) => {
  test.setTimeout(120_000)
  page.setDefaultTimeout(10_000)
  await prepareIsolatedSession(page)
  await prepareAppearance(page, { theme: 'light', boxBorderMode: true })
  const attemptedQueries: string[] = []
  await page.route('**/functions/v1/execute-sql-with-columns', async (route) => {
    const body = route.request().postDataJSON() as { action?: string; query?: string }
    if (body.action === 'metadata') {
      await route.fulfill({
        json: {
          schemas: ['public'],
          functions: [],
          columns: [
            {
              tableSchema: 'public',
              tableName: 'orders',
              columnName: 'id',
              dataType: 'uuid',
              isNullable: 'NO',
              ordinalPosition: 1,
              isPrimaryKey: true
            }
          ],
          tables: [{ tableSchema: 'public', tableName: 'orders', description: '客户订单' }],
          foreignKeys: []
        }
      })
      return
    }
    if (body.query?.includes('pg_catalog.pg_constraint')) {
      await route.fulfill({ json: { status: 'ok', rows: [], columns: [] } })
      return
    }
    attemptedQueries.push(body.query || body.action || '')
    await route.fulfill({ status: 403, json: { status: 'error', error: 'forbidden' } })
  })

  await page.goto(
    '/tests/e2e/fixtures/sql-console-metadata.html?actor=sql-inspection-ordinary&tenant=tenant-a&ordinary=1',
    { waitUntil: 'domcontentloaded' }
  )
  await page.getByRole('button', { name: '数据库结构', exact: true }).click()
  await page.getByRole('dialog').getByText('orders', { exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('客户订单')
  await expect(page.getByRole('dialog')).toContainText('PK')
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click()

  await expect(page.getByRole('button', { name: '执行 SQL' })).toBeDisabled()
  await expect(page.getByRole('button', { name: '查看执行计划' })).toBeDisabled()
  const editor = page.locator('.monaco-editor')
  await editor.click({ position: { x: 150, y: 20 } })
  await page.keyboard.press('ControlOrMeta+Enter')
  expect(attemptedQueries).toHaveLength(0)
})
