import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
const tenantId = '00000000-0000-4000-8000-000000000001'
const userId = '00000000-0000-4000-8000-000000000003'
const mysqlId = '00000000-0000-4000-8000-000000000011'
const pgId = '00000000-0000-4000-8000-000000000012'
const mysqlConnection = {
  id: mysqlId,
  name: 'MySQL 分析库',
  dialect: 'mysql',
  host: 'localhost',
  port: 3307,
  database: 'analytics',
  username: 'reader',
  tls: false,
  enabled: true,
  tenantId,
  allowedUserIds: [userId],
  updatedAt: '2026-10-29T00:00:00Z'
}
const metadata = {
  schemas: ['analytics'],
  tables: [
    {
      tableSchema: 'analytics',
      tableName: 'orders',
      description: '客户订单',
      kind: 'table',
      columns: [
        { name: 'id', dataType: 'integer', isNullable: false, isPrimaryKey: true },
        { name: 'payload', dataType: 'json', isNullable: true, description: '订单详情' }
      ],
      indexes: [{ name: 'orders_pkey', columns: ['id'], isPrimary: true, isUnique: true }]
    }
  ],
  columns: [
    {
      tableSchema: 'analytics',
      tableName: 'orders',
      columnName: 'id',
      dataType: 'integer',
      isNullable: 'NO',
      ordinalPosition: 1,
      isPrimaryKey: true
    },
    {
      tableSchema: 'analytics',
      tableName: 'orders',
      columnName: 'payload',
      dataType: 'json',
      isNullable: 'YES',
      ordinalPosition: 2,
      description: '订单详情'
    }
  ],
  functions: [{ routineSchema: 'analytics', routineName: 'order_total', returnType: 'integer' }],
  foreignKeys: []
}

test.beforeEach(async ({ page }, info) => {
  page.setDefaultNavigationTimeout(60000)
  page.setDefaultTimeout(10000)
  await prepareIsolatedSession(page)
  await prepareAppearance(page, {
    theme: info.project.name.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !info.project.name.includes('shadow')
  })
  await page.route('**/functions/v1/execute-sql-with-columns', (route) =>
    route.fulfill({
      json: { schemas: ['public'], tables: [], columns: [], functions: [], foreignKeys: [] }
    })
  )
  await page.route('**/rest/v1/sys_tenant?*', (route) =>
    route.fulfill({
      json: [{ id: tenantId, tenant_name: '测试租户', tenant_code: 'test', status: '1' }]
    })
  )
})

test('resource groups, external connection tabs, JSON details and MySQL plans work together', async ({
  page
}, info) => {
  test.setTimeout(180000)
  const connections = [
    mysqlConnection,
    { ...mysqlConnection, id: pgId, name: 'PostgreSQL 报表库', dialect: 'postgres', port: 5432 }
  ]
  const queries: { connectionId: string; query: string; action: string }[] = []
  const schemas: string[] = []
  await page.route('http://127.0.0.1:4319/**', async (route) => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization,content-type,x-art-tenant-scope'
    }
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers })
      return
    }
    if (pathname === '/snapshot') {
      await route.fulfill({
        headers,
        json: { connections, canManage: true, users: [{ id: userId, name: '测试账号', tenantId }] }
      })
      return
    }
    const body = request.postDataJSON() as Record<string, unknown>
    if (pathname.endsWith('/metadata')) {
      if (typeof body.schema === 'string') schemas.push(body.schema)
      await route.fulfill({
        headers,
        json: body.schema
          ? metadata
          : { ...metadata, tables: [], columns: [], functions: [], foreignKeys: [] }
      })
      return
    }
    if (pathname.endsWith('/query')) {
      queries.push({
        connectionId: pathname.split('/')[2],
        query: String(body.query),
        action: String(body.action)
      })
      const rows =
        body.action === 'explain'
          ? [
              {
                EXPLAIN: JSON.stringify({
                  query_block: {
                    cost_info: { query_cost: '1.2' },
                    table: {
                      table_name: 'orders',
                      access_type: 'ref',
                      key: 'orders_pkey',
                      rows_produced_per_join: 12
                    }
                  }
                })
              }
            ]
          : [
              {
                id: 1,
                payload: {
                  order: '测试订单',
                  tags: Array.from({ length: 80 }, (_, index) => `tag-${index}`),
                  nested: { active: true }
                }
              }
            ]
      await route.fulfill({
        headers,
        json: {
          status: 'ok',
          rows,
          columns:
            body.action === 'explain'
              ? [{ name: 'EXPLAIN' }]
              : [{ name: 'id' }, { name: 'payload' }],
          commandTag: body.action === 'explain' ? 'EXPLAIN' : 'SELECT',
          rowCount: 1,
          truncated: false,
          maxRows: 200,
          timeoutMs: 10000,
          durationMs: 12
        }
      })
      return
    }
    if (pathname === '/connections/test') {
      await route.fulfill({ headers, json: { ok: true } })
      return
    }
    if (pathname === '/connections/save') {
      expect(body.password).toBe('')
      const { password, ...fields } = body
      void password
      Object.assign(connections[0], fields)
      await route.fulfill({ headers, json: connections[0] })
      return
    }
    await route.abort()
  })
  await page.goto(
    `/tests/e2e/fixtures/sql-console-metadata.html?actor=sql-resources&tenant=${tenantId}`
  )
  await page.getByRole('button', { name: '连接管理', exact: true }).click()
  const manager = page.getByRole('dialog', { name: '数据库连接', exact: true })
  await expect(manager.getByText('连接服务已就绪', { exact: true })).toBeVisible()
  const item = manager.locator('.connection-manager__item').filter({ hasText: 'MySQL 分析库' })
  await item.getByRole('button', { name: '编辑', exact: true }).click()
  const edit = page.getByRole('dialog', { name: '编辑数据库连接', exact: true })
  await expect(edit.getByRole('spinbutton')).toHaveValue('3307')
  await edit.getByRole('button', { name: '测试连接', exact: true }).click()
  await expect(edit.getByRole('status')).toContainText('连接成功')
  await page.screenshot({ path: info.outputPath('connection-edit.png') })
  await edit.getByRole('button', { name: '保存连接', exact: true }).click()
  await expect(edit).toHaveCount(0)
  await item.getByRole('button', { name: '使用', exact: true }).click()
  await expect(manager).toHaveCount(0)
  const editor = page.locator('.monaco-editor')
  await expect(editor.locator('.view-lines')).toContainText('SELECT 1 AS connection_ok;')
  const narrow = (page.viewportSize()?.width || 0) <= 900
  if (narrow) await page.getByRole('button', { name: '展开数据库资源', exact: true }).click()
  const panel = page.getByRole('complementary', { name: '数据库资源', exact: true })
  const statement = panel.getByRole('button', { name: /^语句导航/ })
  await expect(statement).toHaveAttribute('aria-expanded', 'false')
  await panel.getByRole('button', { name: '定位对象 analytics', exact: true }).click()
  await expect.poll(() => schemas).toContain('analytics')
  await panel.getByRole('button', { name: '定位对象 表', exact: true }).click()
  await panel.getByRole('button', { name: '定位对象 orders', exact: true }).click()
  await panel.getByRole('button', { name: '定位对象 字段 · 2', exact: true }).click()
  await expect(
    panel.getByRole('button', { name: '插入 payload · json', exact: true })
  ).toBeVisible()
  await page.screenshot({ path: info.outputPath('database-resource-tree.png') })
  await panel.getByRole('textbox', { name: '搜索数据库资源' }).fill('订单详情')
  await expect(
    panel.getByRole('button', { name: '查看对象 analytics.orders', exact: true })
  ).toBeVisible()
  if (narrow)
    await page
      .getByRole('dialog', { name: '数据库资源', exact: true })
      .getByRole('button', { name: '关闭', exact: true })
      .last()
      .click()
  await editor.click({ position: { x: 130, y: 20 } })
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('SELECT * FROM ')
  await page.keyboard.press('ControlOrMeta+Space')
  await expect(
    page.locator('.suggest-widget.visible .monaco-list-row').filter({ hasText: 'orders' }).first()
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText('SELECT `id`, `payload` FROM `analytics`.`orders` LIMIT 10;')
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect.poll(() => queries.length).toBe(1)
  expect(queries[0].connectionId).toBe(mysqlId)
  expect(queries[0].query).toContain('`analytics`.`orders`')
  const payload = page.getByRole('button', { name: '查看 payload 内容', exact: true })
  await expect(payload).toBeVisible()
  expect((await payload.boundingBox())?.height).toBeLessThan(50)
  await payload.click()
  const cell = page.getByRole('dialog', { name: '单元格详情', exact: true })
  await expect(cell.locator('code .hljs-attr').first()).toBeVisible()
  await cell.getByRole('button', { name: '查找 JSON', exact: true }).click()
  await cell.getByRole('textbox', { name: '查找 JSON 内容', exact: true }).fill('tag-')
  await expect(cell).toContainText('1 / 80')
  await page.screenshot({ path: info.outputPath('json-cell-details.png') })
  await cell.getByRole('button', { name: '关闭', exact: true }).last().click()
  await page.getByRole('button', { name: '查看执行计划', exact: true }).click()
  const plan = page.getByRole('dialog', { name: '执行计划', exact: true })
  await expect(plan).toContainText('MySQL ref')
  await expect(plan).toContainText('orders_pkey')
  await plan.getByRole('button', { name: '关闭', exact: true }).last().click()
  await page.getByRole('button', { name: '新建查询页签', exact: true }).click()
  await expect(editor.locator('.view-lines')).toContainText('SELECT 1 AS connection_ok;')
  await editor.click({ position: { x: 130, y: 20 } })
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText('SELECT 22 AS scratch;')
  const queryTabs = page.getByRole('tablist', { name: 'SQL 查询页签', exact: true })
  await queryTabs.getByRole('tab').nth(1).click()
  await expect(editor.locator('.view-lines')).toContainText('`analytics`.`orders`')
  await expect(page.locator('.result-table')).toHaveCount(0)
  await queryTabs.getByRole('tab').nth(0).click()
  await expect(editor.locator('.view-lines')).toContainText('sys_user')
  await queryTabs.getByRole('tab').nth(2).click()
  await expect(editor.locator('.view-lines')).toContainText('SELECT 22 AS scratch;')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
  await page.screenshot({ path: info.outputPath('database-workspace.png') })
  if (narrow) {
    const tabBounds = await queryTabs.boundingBox()
    const managerBounds = await page
      .getByRole('button', { name: '连接管理', exact: true })
      .boundingBox()
    expect(tabBounds?.width || 0).toBeGreaterThan((page.viewportSize()?.width || 0) - 48)
    expect(tabBounds?.y || 0).toBeGreaterThan(
      (managerBounds?.y || 0) + (managerBounds?.height || 0)
    )
  }
  await page.reload()
  await expect(editor.locator('.view-lines')).toContainText('SELECT 22 AS scratch;')
  await expect(page.getByRole('button', { name: '执行 SQL', exact: true })).toBeEnabled()
  expect(queries.filter((query) => query.action === 'execute')).toHaveLength(1)
})

test('ordinary users can use granted read-only connections while built-in execution remains restricted', async ({
  page
}) => {
  test.setTimeout(120000)
  let calls = 0
  await page.route('http://127.0.0.1:4319/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization,content-type,x-art-tenant-scope'
    }
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers })
      return
    }
    if (pathname === '/snapshot') {
      await route.fulfill({
        headers,
        json: { connections: [mysqlConnection], canManage: false, users: [] }
      })
      return
    }
    if (pathname.endsWith('/metadata')) {
      await route.fulfill({ headers, json: metadata })
      return
    }
    if (pathname.endsWith('/query')) {
      calls++
      await route.fulfill({
        headers,
        json: {
          status: 'ok',
          rows: [{ allowed: 1 }],
          columns: [{ name: 'allowed' }],
          commandTag: 'SELECT',
          rowCount: 1,
          truncated: false,
          maxRows: 200,
          timeoutMs: 10000,
          durationMs: 1
        }
      })
      return
    }
    await route.abort()
  })
  await page.goto(
    `/tests/e2e/fixtures/sql-console-metadata.html?actor=${userId}&tenant=${tenantId}&ordinary=1`
  )
  await expect(page.getByRole('button', { name: '执行 SQL', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '连接管理', exact: true }).click()
  const manager = page.getByRole('dialog', { name: '数据库连接', exact: true })
  await expect(manager.getByText('连接服务已就绪', { exact: true })).toBeVisible()
  await expect(manager.getByRole('button', { name: '新建连接', exact: true })).toHaveCount(0)
  await expect(manager.getByRole('button', { name: '编辑', exact: true })).toHaveCount(0)
  await manager.getByRole('button', { name: '使用', exact: true }).click()
  await expect(page.getByRole('button', { name: '执行 SQL', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '执行 SQL', exact: true }).click()
  await expect.poll(() => calls).toBe(1)
  await expect(page.locator('.result-table')).toContainText('allowed')
})

test('SQL 收藏保存后清空名称并在同一身份刷新后恢复', async ({ page }, info) => {
  test.setTimeout(90000)
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.route('**/functions/v1/**', (route) =>
    route.fulfill({
      json: { schemas: ['public'], tables: [], columns: [], functions: [], foreignKeys: [] }
    })
  )
  await page.route('http://127.0.0.1:4319/**', (route) => {
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization,content-type,x-art-tenant-scope'
    }
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (new URL(route.request().url()).pathname === '/snapshot')
      return route.fulfill({ headers, json: { connections: [], canManage: false, users: [] } })
    return route.abort()
  })
  const response = await page.goto(
    `/tests/e2e/fixtures/sql-console-metadata.html?actor=sql-favorite-regression&tenant=${tenantId}`,
    { waitUntil: 'domcontentloaded' }
  )
  expect(response?.status()).toBe(200)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  await expect(page.locator('.monaco-editor')).toBeVisible()

  const narrow = (page.viewportSize()?.width || 0) <= 900
  if (narrow) await page.getByRole('button', { name: '展开数据库资源', exact: true }).click()
  const panel = page.getByRole('complementary', { name: '数据库资源', exact: true })
  const favorites = panel.getByRole('region', { name: /^SQL 收藏/ })
  await panel.getByRole('button', { name: /^SQL 收藏/ }).click()
  await favorites.getByRole('button', { name: '收藏当前脚本', exact: true }).click()
  const nameField = page.getByRole('textbox', { name: '收藏名称' })
  await nameField.fill('刷新后仍在的脚本')
  await page.getByRole('button', { name: '保存收藏', exact: true }).click()
  await expect(
    favorites.getByRole('button', { name: '刷新后仍在的脚本', exact: true })
  ).toBeVisible()
  await expect(nameField).toBeHidden()
  await favorites.getByRole('button', { name: '收藏当前脚本', exact: true }).click()
  await expect(nameField).toHaveValue('')
  await page.screenshot({ path: info.outputPath('sql-favorite-after-save.png') })

  await page.reload()
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  if (narrow) await page.getByRole('button', { name: '展开数据库资源', exact: true }).click()
  await panel.getByRole('button', { name: /^SQL 收藏/ }).click()
  await expect(
    favorites.getByRole('button', { name: '刷新后仍在的脚本', exact: true })
  ).toBeVisible()
  expect(pageErrors).toEqual([])
  await page.screenshot({ path: info.outputPath('sql-favorite-after-reload.png') })
})
