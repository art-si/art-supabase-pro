import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { assertAppearance, prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
const tenant = '00000000-0000-4000-8000-000000000001'
const dmId = '00000000-0000-4000-8000-000000000015'
const columns = [
  { name: 'id', dataType: 'integer', isNullable: false, isPrimaryKey: true },
  { name: 'customer_id', dataType: 'integer', isNullable: true },
  { name: 'amount', dataType: 'numeric', isNullable: true },
  { name: 'status', dataType: 'varchar', isNullable: true },
  { name: 'payload', dataType: 'json', isNullable: true }
]
const metadata = {
  schemas: ['public'],
  tables: [
    {
      tableSchema: 'public',
      tableName: 'orders',
      kind: 'table',
      description: '订单',
      columns,
      indexes: []
    }
  ],
  columns: columns.map((column, index) => ({
    tableSchema: 'public',
    tableName: 'orders',
    columnName: column.name,
    dataType: column.dataType,
    isNullable: column.isNullable ? 'YES' : 'NO',
    isPrimaryKey: column.isPrimaryKey,
    ordinalPosition: index + 1
  })),
  functions: [],
  foreignKeys: [
    {
      sourceSchema: 'public',
      sourceTable: 'orders',
      sourceColumn: 'customer_id',
      targetSchema: 'crm',
      targetTable: 'customers',
      targetColumn: 'id',
      constraintName: 'customer_fk'
    }
  ]
}

async function prepare(page: Page, project: string) {
  page.setDefaultTimeout(10000)
  page.setDefaultNavigationTimeout(60000)
  await prepareIsolatedSession(page)
  const appearance = {
    theme: project.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !project.includes('shadow')
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
  return appearance
}

test('object menus, icon alignment, migration of sidebar width and refresh space support the complete workflow', async ({
  page,
  context
}, info) => {
  test.setTimeout(150000)
  const appearance = await prepare(page, info.project.name)
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.addInitScript(() => {
    const key = 'sql-console:ckbftoopuyophiebamwy:enterprise-menu:tenant-a'
    if (!localStorage.getItem(key))
      localStorage.setItem(key, JSON.stringify({ navigatorWidth: 250 }))
  })
  let executions = 0
  let refreshGate: Promise<void> | undefined
  let releaseRefresh: (() => void) | undefined
  await page.route('**/functions/v1/execute-sql-with-columns', async (route) => {
    if (route.request().postDataJSON().action !== 'metadata') executions++
    if (refreshGate) await refreshGate
    await route.fulfill({ json: metadata })
  })
  await page.goto(
    '/tests/e2e/fixtures/sql-console-metadata.html?actor=enterprise-menu&tenant=tenant-a'
  )
  await assertAppearance(page, appearance)
  const narrow = (page.viewportSize()?.width || 0) <= 900
  const panel = page.getByRole('complementary', { name: '数据库资源', exact: true })
  const open = async () => {
    if (!(await panel.isVisible()))
      await page.getByRole('button', { name: '展开数据库资源', exact: true }).click()
  }
  const expand = async () => {
    await open()
    if (!(await panel.getByRole('button', { name: '定位对象 orders', exact: true }).isVisible())) {
      await panel.getByRole('button', { name: '定位对象 public', exact: true }).click()
      await panel.getByRole('button', { name: '定位对象 表', exact: true }).click()
    }
  }
  await expand()
  if (!narrow)
    expect(
      await panel.evaluate((element) => element.parentElement!.getBoundingClientRect().width)
    ).toBeGreaterThanOrEqual(339)
  for (const name of ['收藏对象 orders', '查看 orders 结构', '更多操作 orders']) {
    const button = panel.getByRole('button', { name, exact: true })
    await button.hover()
    const centers = await button.evaluate((element) => {
      const b = element.getBoundingClientRect()
      const i = element.querySelector('svg')!.getBoundingClientRect()
      return {
        w: b.width,
        h: b.height,
        x: Math.abs(b.x + b.width / 2 - i.x - i.width / 2),
        y: Math.abs(b.y + b.height / 2 - i.y - i.height / 2)
      }
    })
    expect(centers.w).toBeCloseTo(centers.h, 0)
    expect(centers.x).toBeLessThan(1)
    expect(centers.y).toBeLessThan(1)
  }
  await panel.getByRole('button', { name: '更多操作 orders', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: '查看对象结构', exact: true })).toBeFocused()
  expect(await page.getByRole('menuitem').count()).toBeGreaterThan(12)
  await page.screenshot({ path: info.outputPath('enterprise-object-menu.png') })
  await page.keyboard.press('End')
  await expect(page.getByRole('menuitem', { name: '插入对象名称', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(panel).toBeVisible()
  await panel.getByRole('button', { name: '更多操作 orders', exact: true }).click()
  await page.getByRole('menuitem', { name: '复制字段列表', exact: true }).click()
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain('"customer_id"')
  await panel.getByRole('button', { name: '更多操作 orders', exact: true }).click()
  await page.getByRole('menuitem', { name: '新页签查询前 100 行', exact: true }).click()
  const editor = page.locator('.monaco-editor')
  await expect(editor.locator('.view-lines')).toContainText('"public"."orders"')
  await expand()
  await panel.getByRole('button', { name: '定位对象 orders', exact: true }).click()
  await panel.getByRole('button', { name: '定位对象 字段 · 5', exact: true }).click()
  await panel.getByRole('button', { name: '更多操作 status · varchar', exact: true }).click()
  await page.getByRole('menuitem', { name: '生成值分布统计', exact: true }).click()
  await expect(editor.locator('.view-lines')).toContainText('GROUP BY "status"')
  if (narrow) await open()
  await expect(panel.locator('.art-async-state')).toHaveAttribute('aria-busy', 'false')
  refreshGate = new Promise((resolve) => {
    releaseRefresh = resolve
  })
  await panel.getByRole('button', { name: '刷新数据库资源', exact: true }).click()
  const state = panel.locator('.art-async-state')
  await expect(state).toHaveAttribute('aria-busy', 'true')
  expect((await state.boundingBox())?.height).toBeGreaterThanOrEqual(239)
  await page.screenshot({ path: info.outputPath('resource-refresh-space.png') })
  refreshGate = undefined
  releaseRefresh?.()
  await expect(state).toHaveAttribute('aria-busy', 'false')
  expect(executions).toBe(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
})

test('all action loading uses one refresh indicator, keeps size and respects reduced motion', async ({
  page
}, info) => {
  test.setTimeout(90000)
  const appearance = await prepare(page, info.project.name)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/tests/e2e/fixtures/button-loading.html')
  await assertAppearance(page, appearance)
  const names = ['刷新连接', '编辑副本', '导出数据', '保存配置']
  const widths = await Promise.all(
    names.map(
      async (name) => (await page.getByRole('button', { name, exact: true }).boundingBox())!.width
    )
  )
  await page.getByRole('button', { name: '刷新连接', exact: true }).click()
  for (const [index, name] of names.entries()) {
    const button = page.getByRole('button', { name, exact: true })
    await expect(button).toBeDisabled()
    await expect(button.locator('svg:visible')).toHaveCount(0)
    await expect(button.locator('.el-icon.is-loading:visible')).toHaveCount(1)
    expect((await button.boundingBox())!.width).toBeCloseTo(widths[index], 0)
    const animated = await button.evaluate((element) =>
      Array.from(element.querySelectorAll('svg,i')).some(
        (icon) => getComputedStyle(icon).animationName === 'art-button-action-spin'
      )
    )
    expect(animated).toBe(true)
    expect(
      await button
        .locator('.el-icon.is-loading')
        .evaluate((element) => getComputedStyle(element, '::before').maskImage)
    ).toContain('svg')
  }
  await expect(
    page
      .getByRole('button', { name: '纯文字操作', exact: true })
      .locator('.el-icon.is-loading:visible')
  ).toHaveCount(1)
  await expect(page.getByRole('status')).toContainText('触发次数：1')
  await page.screenshot({ path: info.outputPath('single-icon-loading.png') })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(
    await page
      .getByRole('button', { name: '刷新连接', exact: true })
      .locator('.el-icon.is-loading')
      .evaluate((element) => getComputedStyle(element).animationName)
  ).toBe('none')
  const iconButton = page.getByRole('button', { name: '刷新结构图标', exact: true })
  await expect(iconButton.locator('svg')).toHaveClass(/iconify--ri/)
  await expect(iconButton.locator('path')).toHaveAttribute('d', /^M5\.463 4\.433/)
  await page.getByRole('button', { name: '重置状态', exact: true }).click()
  await expect(iconButton.locator('path')).not.toHaveAttribute('d', /^M5\.463 4\.433/)
})

test('DM8 form uses port 5236, an optional schema and the matching query dialect', async ({
  page
}, info) => {
  test.setTimeout(150000)
  await prepare(page, info.project.name)
  await page.route('**/functions/v1/execute-sql-with-columns', (route) =>
    route.fulfill({ json: metadata })
  )
  await page.route('**/rest/v1/sys_tenant?*', (route) =>
    route.fulfill({
      json: [{ id: tenant, tenant_name: '测试租户', tenant_code: 'test', status: '1' }]
    })
  )
  let saved: Record<string, unknown> | undefined
  let executed = ''
  let executedSchema = ''
  let releaseSchema: (() => void) | undefined
  const schemaGate = new Promise<void>((resolve) => {
    releaseSchema = resolve
  })
  await page.route('http://127.0.0.1:4319/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    const headers = {
      'Access-Control-Allow-Origin': route.request().headers().origin,
      'Access-Control-Allow-Headers': 'authorization,content-type,x-art-tenant-scope'
    }
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (path === '/snapshot')
      return route.fulfill({
        headers,
        json: { connections: saved ? [saved] : [], canManage: true, users: [] }
      })
    const body = route.request().postDataJSON()
    if (path === '/connections/test') {
      expect(body.dialect).toBe('dm')
      expect(body.port).toBe(5236)
      expect(body.database).toBe('')
      expect(body.tls).toBe(false)
      return route.fulfill({ headers, json: { ok: true } })
    }
    if (path === '/connections/save') {
      const { password, ...input } = body
      void password
      saved = { ...input, id: dmId, updatedAt: '2026-10-30T00:00:00Z' }
      return route.fulfill({ headers, json: saved })
    }
    if (path.endsWith('/metadata')) {
      if (body.schema === 'READER') await schemaGate
      return route.fulfill({
        headers,
        json: { schemas: ['READER'], tables: [], columns: [], functions: [], foreignKeys: [] }
      })
    }
    if (path.endsWith('/query')) {
      executed = body.query
      executedSchema = body.schema
      return route.fulfill({
        headers,
        json: {
          status: 'ok',
          rows: [{ CONNECTION_OK: '1' }],
          columns: [{ name: 'CONNECTION_OK' }],
          commandTag: 'SELECT',
          rowCount: 1,
          truncated: false,
          durationMs: 2,
          maxRows: 200,
          timeoutMs: 10000
        }
      })
    }
    return route.abort()
  })
  await page.goto(`/tests/e2e/fixtures/sql-console-metadata.html?actor=dm-form&tenant=${tenant}`)
  await page.getByRole('button', { name: '连接管理', exact: true }).click()
  const manager = page.getByRole('dialog', { name: '数据库连接', exact: true })
  await manager.getByRole('button', { name: '新建连接', exact: true }).click()
  const form = page.getByRole('dialog', { name: '新建数据库连接', exact: true })
  await form.getByText('达梦 DM8', { exact: true }).click()
  await expect(form.getByRole('spinbutton')).toHaveValue('5236')
  await form.getByRole('textbox', { name: /连接名称/ }).fill('DM8 验收连接')
  await form.getByRole('textbox', { name: /主机地址/ }).fill('127.0.0.1')
  await form.getByRole('textbox', { name: /数据库账号/ }).fill('reader')
  await form
    .getByRole('textbox', { name: '数据库密码', exact: true })
    .fill('synthetic-test-password')
  await form.getByRole('button', { name: '测试连接', exact: true }).click()
  await expect(form.getByRole('status')).toContainText('只读事务可用')
  await page.screenshot({ path: info.outputPath('dm8-connection-form.png') })
  await form.getByRole('button', { name: '保存连接', exact: true }).click()
  await manager.getByRole('button', { name: '使用', exact: true }).click()
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('FROM DUAL')
  await expect(page.locator('.sql-editor-status')).toContainText('达梦 DM8')
  const narrow = (page.viewportSize()?.width || 0) <= 900
  if (narrow) await page.getByRole('button', { name: '展开数据库资源', exact: true }).click()
  const panel = page.getByRole('complementary', { name: '数据库资源', exact: true })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await panel.getByRole('button', { name: '定位对象 READER', exact: true }).click()
  const loading = panel.getByRole('status', { name: '正在加载 READER', exact: true })
  await expect(loading).toBeVisible()
  await expect(loading.locator('.art-svg-icon')).toHaveCount(1)
  expect(
    await loading.locator('svg').evaluate((element) => getComputedStyle(element).animationName)
  ).toBe('art-button-action-spin')
  expect(
    await panel
      .getByRole('button', { name: '定位对象 READER', exact: true })
      .locator('svg')
      .evaluate((element) => getComputedStyle(element).animationName)
  ).toBe('none')
  await page.screenshot({ path: info.outputPath('schema-loading-indicator.png') })
  releaseSchema?.()
  await expect(loading).toHaveCount(0)
  if (narrow) await panel.getByRole('button', { name: '收起数据库资源', exact: true }).click()
  await page.getByRole('combobox', { name: '当前查询 schema', exact: true }).press('Enter')
  await page.getByRole('option', { name: 'READER', exact: true }).click()
  await expect(page.getByRole('button', { name: '查看执行计划', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '执行 SQL', exact: true }).click()
  await expect.poll(() => executed).toContain('FROM DUAL')
  expect(executedSchema).toBe('READER')
  await page.getByRole('combobox', { name: '当前查询 schema', exact: true }).press('Enter')
  await page.getByRole('option', { name: '连接默认', exact: true }).click()
  await page.getByRole('button', { name: '查询历史', exact: true }).click()
  const history = page.getByRole('dialog').filter({ has: page.locator('.sql-history-button') })
  await history.getByRole('button').filter({ hasText: 'connection_ok' }).click()
  await expect(page.locator('.sql-target-context__schema')).toContainText('READER')
  await page.reload()
  await expect(page.locator('.sql-target-context__schema')).toContainText('READER')
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    'synthetic-test-password'
  )
})

test('virtual tree keeps 5000 loaded functions scrollable without mounting every row', async ({
  page
}, info) => {
  test.setTimeout(150000)
  await prepare(page, info.project.name)
  let requests = 0
  await page.route('**/functions/v1/execute-sql-with-columns', (route) => {
    requests++
    return route.fulfill({
      json: {
        schemas: ['public'],
        tables: [],
        columns: [],
        foreignKeys: [],
        functions: Array.from({ length: 5000 }, (_, index) => ({
          routineSchema: 'public',
          routineName: `perf_fn_${String(index).padStart(4, '0')}`,
          returnType: 'integer'
        }))
      }
    })
  })
  await page.goto(
    '/tests/e2e/fixtures/sql-console-metadata.html?actor=virtual-tree&tenant=tenant-a'
  )
  const narrow = (page.viewportSize()?.width || 0) <= 900
  if (narrow) await page.getByRole('button', { name: '展开数据库资源', exact: true }).click()
  const panel = page.getByRole('complementary', { name: '数据库资源', exact: true })
  expect(
    (await panel.locator('.sql-resource-panel__tree-viewport').boundingBox())?.height
  ).toBeGreaterThan(160)
  await panel.getByRole('button', { name: '定位对象 public', exact: true }).click()
  await panel.getByRole('button', { name: '定位对象 函数', exact: true }).click()
  await expect(
    panel.getByRole('button', { name: '定位对象 perf_fn_0000', exact: true })
  ).toBeVisible()
  expect(await panel.getByRole('treeitem').count()).toBeLessThan(80)
  const scrollOwners = await panel.evaluate(
    (element) =>
      Array.from(element.querySelectorAll('*')).filter((child) => {
        const box = child.getBoundingClientRect()
        const style = getComputedStyle(child)
        return (
          box.width > 0 &&
          box.height > 0 &&
          /auto|scroll/.test(style.overflowY) &&
          child.scrollHeight > child.clientHeight + 1
        )
      }).length
  )
  expect(scrollOwners).toBe(1)
  if (narrow) {
    const drawerScrollOwners = await page
      .getByRole('dialog', { name: '数据库资源', exact: true })
      .evaluate(
        (element) =>
          Array.from(element.querySelectorAll('*')).filter((child) => {
            const box = child.getBoundingClientRect()
            return (
              box.width > 0 &&
              box.height > 0 &&
              /auto|scroll/.test(getComputedStyle(child).overflowY) &&
              child.scrollHeight > child.clientHeight + 1
            )
          }).length
      )
    expect(drawerScrollOwners).toBe(1)
  }
  await expect(panel.getByRole('button', { name: /^SQL 收藏/ })).toBeInViewport()
  await expect(panel.getByRole('button', { name: /^语句导航/ })).toBeInViewport()
  const viewport = panel.locator('.sql-resource-panel__tree-viewport')
  await viewport.hover()
  await page.mouse.wheel(0, 180000)
  await expect(
    panel.getByRole('button', { name: '定位对象 perf_fn_4999', exact: true })
  ).toBeVisible()
  expect(await panel.getByRole('treeitem').count()).toBeLessThan(80)
  await page.screenshot({ path: info.outputPath('virtual-functions-end.png') })
  await panel.getByRole('button', { name: 'SQL 收藏', exact: true }).click()
  await expect(panel.getByRole('button', { name: '收藏当前脚本', exact: true })).toBeVisible()
  await panel.getByRole('button', { name: '数据库对象', exact: true }).click()
  await expect(
    panel.getByRole('button', { name: '定位对象 perf_fn_4999', exact: true })
  ).toBeVisible()
  await panel.getByRole('textbox', { name: '搜索数据库资源', exact: true }).fill('perf_fn_4999')
  await expect(
    panel.getByRole('button', { name: '插入函数 public.perf_fn_4999', exact: true })
  ).toBeVisible()
  await panel.getByRole('textbox', { name: '搜索数据库资源', exact: true }).fill('')
  await viewport.hover()
  await page.mouse.wheel(0, -180000)
  await panel.getByRole('button', { name: '定位对象 函数', exact: true }).click()
  await panel.getByRole('button', { name: '定位对象 函数', exact: true }).click()
  await expect(
    panel.getByRole('button', { name: '定位对象 perf_fn_0000', exact: true })
  ).toBeVisible()
  expect(requests).toBe(1)
})
