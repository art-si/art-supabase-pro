import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { assertAppearance, prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test('object favorites and editor tools persist safely without executing queries', async ({
  page
}, info) => {
  test.setTimeout(180000)
  page.setDefaultNavigationTimeout(60000)
  page.setDefaultTimeout(10000)
  await prepareIsolatedSession(page)
  const appearance = {
    theme: info.project.name.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !info.project.name.includes('shadow')
  } as const
  await prepareAppearance(page, appearance)
  await page.addInitScript(({ boxBorderMode }) => {
    const apply = () => {
      document.documentElement.dataset.boxMode = boxBorderMode ? 'border-mode' : 'shadow-mode'
      document.documentElement.dataset.uiScope = 'workspace'
    }
    if (document.documentElement) apply()
    else document.addEventListener('DOMContentLoaded', apply, { once: true })
  }, appearance)
  const errors: string[] = []
  const executions: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/functions/v1/execute-sql-with-columns', (route) => {
    const body = route.request().postDataJSON()
    if (body.action !== 'metadata') executions.push(body.query)
    return route.fulfill({
      json: {
        schemas: ['public'],
        functions: [],
        tables: [
          {
            tableSchema: 'public',
            tableName: 'orders',
            description: '订单',
            kind: 'table',
            indexes: [
              {
                name: 'orders_id_idx',
                columns: ['id'],
                isUnique: true,
                isPrimary: false,
                definition: 'CREATE UNIQUE INDEX orders_id_idx ON public.orders (id)'
              }
            ]
          },
          { tableSchema: 'public', tableName: 'customers', kind: 'table', indexes: [] }
        ],
        columns: [
          {
            tableSchema: 'public',
            tableName: 'orders',
            columnName: 'id',
            dataType: 'integer',
            isNullable: 'NO',
            ordinalPosition: 1,
            description: '订单编号'
          },
          {
            tableSchema: 'public',
            tableName: 'customers',
            columnName: 'id',
            dataType: 'integer',
            isNullable: 'NO',
            ordinalPosition: 1
          }
        ],
        foreignKeys: [
          {
            sourceSchema: 'public',
            sourceTable: 'orders',
            sourceColumn: 'id',
            targetSchema: 'public',
            targetTable: 'customers',
            targetColumn: 'id',
            constraintName: 'orders_customer_fkey'
          }
        ]
      }
    })
  })
  const url = '/tests/e2e/fixtures/sql-console-metadata.html?actor=advanced-tools&tenant=tenant-a'
  await page.goto(url)
  await assertAppearance(page, appearance)
  const editor = page.locator('.monaco-editor')
  await expect(editor).toBeVisible()
  const narrow = (page.viewportSize()?.width || 0) <= 900
  const openResources = async () => {
    if (narrow) await page.getByRole('button', { name: '展开数据库资源', exact: true }).click()
    return page.getByRole('complementary', { name: '数据库资源', exact: true })
  }
  const closeResources = async () => {
    if (narrow)
      await page
        .getByRole('dialog', { name: '数据库资源', exact: true })
        .getByRole('button', { name: '关闭', exact: true })
        .last()
        .click()
  }
  let panel = await openResources()
  await panel.getByRole('button', { name: '定位对象 public', exact: true }).click()
  await panel.getByRole('button', { name: '定位对象 表', exact: true }).click()
  await panel.getByRole('button', { name: '收藏对象 orders', exact: true }).click()
  await panel.getByRole('button', { name: '常用对象', exact: true }).click()
  await expect(panel.getByRole('button', { name: 'public.orders', exact: true })).toBeVisible()
  await panel.getByRole('button', { name: '数据库对象', exact: true }).click()
  await panel.getByRole('button', { name: '定位对象 orders', exact: true }).click()
  await panel.getByRole('button', { name: '定位对象 索引', exact: true }).click()
  await panel.getByRole('button', { name: '查看索引 orders_id_idx', exact: true }).click()
  const index = page.getByRole('dialog', { name: 'orders_id_idx', exact: true })
  await expect(index.locator('code')).toContainText('CREATE UNIQUE INDEX')
  await expect(index.locator('.hljs-keyword').first()).toBeVisible()
  await index.getByRole('button', { name: '关闭', exact: true }).last().click()
  await panel.getByRole('button', { name: '定位对象 外键', exact: true }).click()
  await panel.getByRole('button', { name: '定位关联表 customers', exact: true }).click()
  const structure = page.getByRole('dialog', { name: '数据库结构', exact: true })
  await expect(structure).toContainText('customers')
  await structure.getByRole('button', { name: '关闭', exact: true }).last().click()
  if (narrow) {
    panel = await openResources()
    await panel.getByRole('button', { name: '定位对象 public', exact: true }).click()
    await panel.getByRole('button', { name: '定位对象 表', exact: true }).click()
  }
  await panel.getByRole('button', { name: '收起全部对象', exact: true }).click()
  await expect(panel.getByRole('button', { name: '定位对象 orders', exact: true })).toHaveCount(0)
  await closeResources()
  await page.getByRole('button', { name: '编辑器工具', exact: true }).click()
  const tools = page.getByRole('tooltip').filter({ hasText: '跳转行号' })
  await tools.getByRole('button', { name: '放大 SQL 字体', exact: true }).click()
  await expect(tools).toContainText('14 px')
  await tools
    .locator('.el-switch')
    .filter({ has: page.getByRole('switch', { name: 'SQL 自动换行', exact: true }) })
    .click()
  await tools
    .locator('.el-switch')
    .filter({ has: page.getByRole('switch', { name: 'SQL 代码缩略图', exact: true }) })
    .click()
  await page.screenshot({ path: info.outputPath('editor-tools.png') })
  await page.getByLabel('选择 SQL 文件', { exact: true }).setInputFiles({
    name: 'analysis.sql',
    mimeType: 'text/plain',
    buffer: Buffer.from('SELECT 42 AS imported;\nSELECT 43 AS next_query;')
  })
  await expect(editor.locator('.view-lines')).toContainText('SELECT 42 AS imported;')
  await expect(
    page.getByRole('tablist', { name: 'SQL 查询页签', exact: true }).getByRole('tab')
  ).toHaveCount(2)
  await page.getByRole('button', { name: '编辑器工具', exact: true }).click()
  await tools.getByRole('button', { name: '查找替换', exact: true }).click()
  await expect(editor.locator('.find-widget.visible .replace-part')).toBeVisible()
  await page.keyboard.press('Escape')
  await editor.click({ position: { x: 160, y: 20 } })
  await page.keyboard.press('ControlOrMeta+Home')
  await page.getByRole('button', { name: '编辑器工具', exact: true }).click()
  await tools.getByRole('button', { name: '切换注释', exact: true }).click()
  await expect(editor.locator('.view-lines')).toContainText('-- SELECT 42')
  await page.getByRole('button', { name: '撤销 SQL 编辑', exact: true }).click()
  await expect(editor.locator('.view-lines')).not.toContainText('-- SELECT 42')
  panel = await openResources()
  await panel.getByRole('button', { name: /^SQL 收藏/ }).click()
  await panel.getByRole('button', { name: '收藏当前脚本', exact: true }).click()
  await page.getByRole('textbox', { name: '收藏名称' }).fill('订单分析')
  await page.getByRole('button', { name: '保存收藏', exact: true }).click()
  await expect(panel.getByRole('button', { name: '订单分析', exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('resource-favorites.png') })
  await closeResources()
  await page.reload()
  await expect(editor.locator('.view-lines')).toContainText('SELECT 42 AS imported;')
  await page.getByRole('button', { name: '编辑器工具', exact: true }).click()
  await expect(tools).toContainText('14 px')
  await expect(tools.getByRole('switch', { name: 'SQL 自动换行', exact: true })).toBeChecked()
  await page.getByRole('button', { name: '编辑器工具', exact: true }).click()
  panel = await openResources()
  await panel.getByRole('button', { name: /^常用对象/ }).click()
  await expect(panel.getByRole('button', { name: 'public.orders', exact: true })).toBeVisible()
  await panel.getByRole('button', { name: /^SQL 收藏/ }).click()
  await expect(panel.getByRole('button', { name: '订单分析', exact: true })).toBeVisible()
  await panel.getByRole('button', { name: '新页签打开 订单分析', exact: true }).click()
  await expect(
    page.getByRole('tablist', { name: 'SQL 查询页签', exact: true }).getByRole('tab')
  ).toHaveCount(3)
  await page.goto(url.replace('tenant-a', 'tenant-b'))
  panel = await openResources()
  await expect(panel.getByRole('button', { name: 'public.orders', exact: true })).toHaveCount(0)
  await expect(panel.getByRole('button', { name: '订单分析', exact: true })).toHaveCount(0)
  expect(executions).toEqual([])
  expect(errors).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
})

test('connection drawer automatically loads and retries an unavailable service', async ({
  page
}) => {
  test.setTimeout(90000)
  await prepareIsolatedSession(page)
  await page.route('**/functions/v1/execute-sql-with-columns', (route) =>
    route.fulfill({
      json: { schemas: ['public'], tables: [], columns: [], functions: [], foreignKeys: [] }
    })
  )
  let failed = true
  await page.route('http://127.0.0.1:4319/**', (route) => {
    const headers = {
      'Access-Control-Allow-Origin': new URL(
        route.request().headers().origin || 'http://127.0.0.1:41749'
      ).origin,
      'Access-Control-Allow-Headers': 'authorization,content-type,x-art-tenant-scope'
    }
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (failed) return route.abort()
    return route.fulfill({ headers, json: { canManage: true, connections: [], users: [] } })
  })
  await page.goto(
    '/tests/e2e/fixtures/sql-console-metadata.html?actor=connection-retry&tenant=tenant-a'
  )
  await page.getByRole('button', { name: '连接管理', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: '数据库连接', exact: true })
  await expect(drawer).toContainText('数据库连接服务未就绪')
  failed = false
  await drawer.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(drawer.getByText('连接服务已就绪', { exact: true })).toBeVisible()
  await expect(drawer.getByRole('button', { name: '新建连接', exact: true })).toBeVisible()
  await expect(drawer.getByRole('textbox', { name: 'SQL 执行端地址', exact: true })).toBeHidden()
})
