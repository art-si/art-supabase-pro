import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)
const tenantId = '00000000-0000-4000-8000-000000000001'
const userId = '00000000-0000-4000-8000-000000000002'
const definition = {
  id: '00000000-0000-4000-8000-000000000003',
  slug: 'order-summary',
  name: '订单汇总查询',
  description: '按当前账号和租户读取订单汇总',
  sql: 'SELECT :amount::numeric AS amount, :enabled::boolean AS enabled',
  tenantId,
  allowedUserIds: [userId],
  parameters: [
    { name: 'amount', type: 'number', required: true },
    { name: 'enabled', type: 'boolean', required: true }
  ],
  maxRows: 200,
  timeoutMs: 10000,
  enabled: true,
  updatedAt: '2026-10-30T00:00:00Z'
}

async function prepare(page: Page, project: string, ordinary = false) {
  page.setDefaultNavigationTimeout(60_000)
  page.setDefaultTimeout(15_000)
  await prepareIsolatedSession(page)
  await prepareAppearance(page, {
    theme: project.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !project.includes('shadow')
  })
  await page.route('**/functions/v1/execute-sql-with-columns', (route) =>
    route.fulfill({
      json: { schemas: [], tables: [], columns: [], functions: [], foreignKeys: [] }
    })
  )
  await page.route('**/rest/v1/sys_tenant?*', (route) =>
    route.fulfill({
      json: [{ id: tenantId, tenant_name: '测试租户', tenant_code: 'test', status: '1' }]
    })
  )
  await page.goto(
    `/tests/e2e/fixtures/sql-console-metadata.html?actor=${userId}&tenant=${tenantId}${ordinary ? '&ordinary=1' : ''}`
  )
}

test('ordinary users invoke granted APIs with precise typed parameters and placeholder-only examples', async ({
  page
}, info) => {
  const calls: Record<string, unknown>[] = []
  await page.route('**/functions/v1/sql-query-api**', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>
    if (body.action === 'list')
      return route.fulfill({ json: { definitions: [definition], canManage: false, users: [] } })
    calls.push(body)
    const params = body.params as Record<string, unknown>
    return route.fulfill({
      json: {
        status: 'ok',
        rows: [{ amount: params.amount, enabled: params.enabled }],
        columns: [{ name: 'amount' }, { name: 'enabled' }],
        rowCount: 1,
        truncated: false,
        durationMs: 4,
        maxRows: 200,
        timeoutMs: 10000
      }
    })
  })
  await prepare(page, info.project.name, true)
  await expect(page.getByRole('button', { name: '发布为查询 API', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '查询 API', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: '查询 API', exact: true })
  await expect(drawer.getByRole('button', { name: '新建查询 API', exact: true })).toHaveCount(0)
  await expect(drawer.getByRole('button', { name: '编辑与授权', exact: true })).toHaveCount(0)
  await drawer
    .getByRole('textbox', { name: 'API 参数 amount', exact: true })
    .fill('12345678901234567890.1234567890123456789')
  await drawer.getByRole('combobox', { name: 'API 参数 enabled', exact: true }).click()
  await page.getByRole('option', { name: 'false', exact: true }).click()
  await drawer.getByRole('button', { name: '调用 API', exact: true }).click()
  await expect(drawer).toContainText('返回 1 行 · 4 ms')
  await expect(drawer.getByRole('button', { name: '查看 amount 内容', exact: true })).toContainText(
    '12345678901234567890.1234567890123456789'
  )
  expect(calls).toEqual([
    {
      params: { amount: '12345678901234567890.1234567890123456789', enabled: false },
      requestId: expect.stringMatching(/^[a-f\d-]{36}$/i)
    }
  ])
  await page.screenshot({ path: info.outputPath('query-api-ordinary-result.png') })
  await drawer
    .getByRole('button', { name: '查看 amount 内容', exact: true })
    .scrollIntoViewIfNeeded()
  await page.screenshot({ path: info.outputPath('query-api-result-lower.png') })
  await drawer.getByRole('tab', { name: '接入说明', exact: true }).click()
  await expect(drawer).toContainText('Bearer YOUR_ACCESS_TOKEN')
  await expect(drawer).not.toContainText('refreshed-test-signature')
  await expect(drawer.getByRole('tab', { name: 'SQL 定义', exact: true })).toHaveCount(0)
  await drawer.getByRole('textbox', { name: '搜索查询 API', exact: true }).fill('does-not-exist')
  await expect(drawer).toContainText('未找到匹配 API')
  await drawer.getByRole('button', { name: '清空搜索', exact: true }).click()
  await expect(drawer.getByRole('tab', { name: '接入说明', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
})

test('administrators publish the current SQL, edit parameter definitions and disable a stable endpoint', async ({
  page
}, info) => {
  const definitions = [{ ...definition, parameters: [] }]
  const saved: Record<string, unknown>[] = []
  await page.route('**/functions/v1/sql-query-api**', (route) => {
    const body = route.request().postDataJSON() as {
      action?: string
      input?: Record<string, unknown>
    }
    if (body.action === 'list')
      return route.fulfill({
        json: { definitions, canManage: true, users: [{ id: userId, name: '测试账号', tenantId }] }
      })
    if (body.action === 'save' && body.input) {
      saved.push(body.input)
      const record = {
        ...body.input,
        id: body.input.id || '00000000-0000-4000-8000-000000000004',
        updatedAt: '2026-10-31T00:00:00Z'
      }
      return route.fulfill({ json: record })
    }
    return route.abort()
  })
  await prepare(page, info.project.name)
  const editor = page
    .locator('.monaco-editor')
    .getByRole('textbox', { name: 'SQL 编辑器', exact: true })
  await editor.focus()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText('SELECT :amount::numeric AS amount;')
  await page.getByRole('button', { name: '发布为查询 API', exact: true }).click()
  const form = page.getByRole('dialog', { name: '发布查询 API', exact: true })
  await expect(form.getByRole('textbox', { name: '查询 API SQL', exact: true })).toHaveValue(
    'SELECT :amount::numeric AS amount;'
  )
  await form.getByRole('textbox', { name: '查询 API 名称', exact: true }).fill('精确金额 API')
  await form.getByRole('textbox', { name: '查询 API 地址标识', exact: true }).fill('exact-amount')
  await form.getByRole('button', { name: '添加参数', exact: true }).click()
  const params = form.locator('.art-table')
  await params.getByRole('button', { name: '编辑第 1 行 参数名', exact: true }).click()
  await params.getByRole('textbox').fill('amount')
  await params.locator('.el-select').click()
  await page.getByRole('option', { name: 'number', exact: true }).click()
  await form.getByRole('textbox', { name: '查询 API 名称', exact: true }).click()
  await page.screenshot({ path: info.outputPath('query-api-publish-form.png') })
  await params.scrollIntoViewIfNeeded()
  await page.screenshot({ path: info.outputPath('query-api-parameters-lower.png') })
  await form.getByRole('button', { name: '发布 API', exact: true }).click()
  await expect(form).toHaveCount(0)
  expect(saved[0].parameters).toEqual([{ name: 'amount', type: 'number', required: true }])
  expect(saved[0].tenantId).toBe(tenantId)
  const manager = page.getByRole('dialog', { name: '查询 API', exact: true })
  await expect(manager).toContainText('POST https://')
  await manager.getByRole('button', { name: '编辑与授权', exact: true }).click()
  const edit = page.getByRole('dialog', { name: '编辑查询 API', exact: true })
  await expect(edit.getByRole('textbox', { name: '查询 API 地址标识', exact: true })).toBeDisabled()
  await edit.getByRole('tab', { name: '执行与授权', exact: true }).click()
  await edit.getByRole('switch', { name: '启用查询 API', exact: true }).press('Space')
  await edit.getByRole('button', { name: '保存 API', exact: true }).click()
  await expect(edit).toHaveCount(0)
  expect(saved[1].enabled).toBe(false)
  await expect(manager.getByRole('button', { name: '调用 API', exact: true })).toBeDisabled()
  await expect(manager).toContainText('此 API 已停用')
  await page.screenshot({ path: info.outputPath('query-api-disabled.png') })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
})

test('list failure can retry and tenant changes discard late invocation results', async ({
  page
}, info) => {
  let failed = true
  let release!: () => void
  let invoked = false
  await page.route('**/functions/v1/sql-query-api**', async (route) => {
    const body = route.request().postDataJSON() as { action?: string }
    if (body.action === 'list')
      return failed
        ? route.fulfill({ status: 503, json: { message: '查询 API 服务暂不可用，请稍后重试' } })
        : route.fulfill({
            json: { definitions: [{ ...definition, parameters: [] }], canManage: false, users: [] }
          })
    invoked = true
    await new Promise<void>((resolve) => {
      release = resolve
    })
    return route.fulfill({
      json: {
        status: 'ok',
        rows: [{ stale: true }],
        columns: [{ name: 'stale' }],
        rowCount: 1,
        truncated: false,
        durationMs: 1,
        maxRows: 200,
        timeoutMs: 10000
      }
    })
  })
  await prepare(page, info.project.name)
  await page.getByRole('button', { name: '查询 API', exact: true }).click()
  const manager = page.getByRole('dialog', { name: '查询 API', exact: true })
  await expect(manager).toContainText('查询 API 加载失败')
  await page.screenshot({ path: info.outputPath('query-api-retry.png') })
  failed = false
  await manager.getByRole('button', { name: '重新加载', exact: true }).click()
  await manager.getByRole('button', { name: '调用 API', exact: true }).click()
  await expect.poll(() => invoked).toBe(true)
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent('sql-preview-tenant-change', {
        detail: '00000000-0000-4000-8000-000000000005'
      })
    )
  )
  await expect(manager).toHaveCount(0)
  release()
  await expect(page.locator('.result-table-container')).toHaveCount(0)
})

test('cancelling API list refresh preserves a modified result copy and avoids a new list request', async ({
  page
}, info) => {
  let lists = 0
  await page.route('**/functions/v1/sql-query-api**', (route) => {
    const body = route.request().postDataJSON() as { action?: string }
    if (body.action === 'list') {
      lists++
      return route.fulfill({
        json: { definitions: [{ ...definition, parameters: [] }], canManage: false, users: [] }
      })
    }
    return route.fulfill({
      json: {
        status: 'ok',
        rows: [{ amount: '1.50' }],
        columns: [{ name: 'amount' }],
        rowCount: 1,
        truncated: false,
        durationMs: 1,
        maxRows: 200,
        timeoutMs: 10000
      }
    })
  })
  await prepare(page, info.project.name)
  await page.getByRole('button', { name: '查询 API', exact: true }).click()
  const manager = page.getByRole('dialog', { name: '查询 API', exact: true })
  await manager.getByRole('button', { name: '调用 API', exact: true }).click()
  const table = manager.locator('.result-table-container')
  await table.getByRole('button', { name: '编辑副本', exact: true }).click()
  await table.getByRole('button', { name: '编辑第 1 行 amount', exact: true }).dblclick()
  await page.getByRole('textbox', { name: '编辑值 amount', exact: true }).fill('modified-api-copy')
  await page.getByRole('button', { name: '保留修改', exact: true }).click()
  await manager.getByRole('button', { name: '刷新 API', exact: true }).click()
  const leave = page.getByRole('dialog', { name: '离开结果编辑', exact: true })
  await expect(leave).toBeVisible()
  await leave.getByRole('button', { name: '继续编辑', exact: true }).click()
  await expect(table).toContainText('已修改 1 行 / 1 处')
  await expect(table).toContainText('modified-api-copy')
  expect(lists).toBe(1)
  await manager.getByRole('button', { name: '刷新 API', exact: true }).click()
  await leave.getByRole('button', { name: '放弃修改并继续', exact: true }).click()
  await expect.poll(() => lists).toBe(2)
  await expect(table).toHaveCount(0)
})

test('cancelled invocation clears the previous result and allows a new call', async ({
  page
}, info) => {
  let invocations = 0
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/functions/v1/sql-query-api**', (route) => {
    const body = route.request().postDataJSON() as { action?: string }
    if (body.action === 'list')
      return route.fulfill({
        json: { definitions: [{ ...definition, parameters: [] }], canManage: false, users: [] }
      })
    invocations++
    return route.fulfill({
      json:
        invocations === 2
          ? { status: 'cancelled', message: '查询已取消', durationMs: 3 }
          : {
              status: 'ok',
              rows: [{ amount: String(invocations) }],
              columns: [{ name: 'amount' }],
              rowCount: 1,
              truncated: false,
              durationMs: 1,
              maxRows: 200,
              timeoutMs: 10000
            }
    })
  })
  await prepare(page, info.project.name, true)
  await page.getByRole('button', { name: '查询 API', exact: true }).click()
  const manager = page.getByRole('dialog', { name: '查询 API', exact: true })
  const call = manager.getByRole('button', { name: '调用 API', exact: true })
  const result = manager.locator('.result-table-container')
  await call.click()
  await expect(result).toBeVisible()
  await call.click()
  await expect(manager.getByLabel('API 调用状态', { exact: true })).toContainText('调用已取消')
  await expect(result).toHaveCount(0)
  await expect(call).toBeEnabled()
  await call.click()
  await expect(result).toBeVisible()
  await expect(result.getByRole('button', { name: '查看 amount 内容', exact: true })).toContainText(
    '3'
  )
  expect(invocations).toBe(3)
  expect(errors).toEqual([])
})

for (const appearance of ['light', 'dark'] as const) {
  test(`query editor tabs validate hidden fields and parameter rows before retrying save - ${appearance}`, async ({
    page
  }, info) => {
    await page.setViewportSize(
      appearance === 'dark' ? { width: 390, height: 844 } : { width: 1440, height: 900 }
    )
    const saves: Record<string, unknown>[] = []
    let failSave = true
    await page.route('**/functions/v1/sql-query-api**', (route) => {
      const body = route.request().postDataJSON() as {
        action?: string
        input?: Record<string, unknown>
      }
      if (body.action === 'list')
        return route.fulfill({
          json: {
            definitions: [definition],
            canManage: true,
            users: [{ id: userId, name: '测试账号', tenantId }]
          }
        })
      if (body.action === 'save' && body.input) {
        saves.push(body.input)
        return failSave
          ? route.fulfill({ status: 503, json: { message: '查询 API 暂时无法保存，请重试' } })
          : route.fulfill({ json: { ...body.input, updatedAt: '2026-11-01T00:00:00Z' } })
      }
      return route.abort()
    })
    await prepare(page, appearance)
    await page.getByRole('button', { name: '查询 API', exact: true }).click()
    const manager = page.getByRole('dialog', { name: '查询 API', exact: true })
    await manager.getByRole('button', { name: '编辑与授权', exact: true }).click()
    const editor = page.getByRole('dialog', { name: '编辑查询 API', exact: true })
    const name = editor.locator('input[aria-label="查询 API 名称"]')
    await expect(name).toBeVisible()
    await expect(editor.locator('.art-async-state[aria-busy="true"]')).toHaveCount(0)
    const query = editor.getByRole('tab', { name: '查询定义', exact: true })
    const access = editor.getByRole('tab', { name: '执行与授权', exact: true })
    const save = editor.getByRole('button', { name: '保存 API', exact: true })
    await name.fill('')
    await access.click()
    await expect(name).toBeAttached()
    await expect(name).toBeHidden()
    await save.click()
    await expect(query).toHaveAttribute('aria-selected', 'true')
    await expect(editor.getByText('请输入 API 名称', { exact: true })).toBeVisible()
    await expect(name).toBeFocused()
    expect(saves).toHaveLength(0)
    await name.fill('跨页签校验与重试 API')
    const table = editor.locator('.art-table')
    await table.getByRole('button', { name: '编辑第 1 行 参数名', exact: true }).click()
    await table.getByRole('textbox').fill('1bad')
    await access.click()
    await editor.getByRole('spinbutton', { name: '查询 API 返回行数', exact: true }).fill('321')
    await page.screenshot({
      path: info.outputPath(`query-editor-${appearance}-access.png`),
      timeout: 60000
    })
    await save.click()
    await expect(query).toHaveAttribute('aria-selected', 'true')
    await expect(
      page
        .locator('.el-message')
        .getByText('参数名以字母开头，仅支持字母、数字和下划线', { exact: true })
    ).toBeVisible()
    await expect(table.locator('.art-table__cell-content.is-validation-error')).toHaveCount(1)
    await expect(table.locator('.art-table__edit-error')).toHaveCount(0)
    await expect(
      table.locator('.art-table__cell-content.is-validation-error [role="alert"]')
    ).toHaveClass('sr-only')
    await expect(table.getByRole('textbox')).toBeFocused()
    await expect(
      table.getByRole('columnheader', { name: /参数名/ }).locator('.art-table__required-marker')
    ).toBeVisible()
    expect(saves).toHaveLength(0)
    await page.screenshot({
      path: info.outputPath(`query-editor-${appearance}-parameter-error.png`),
      timeout: 60000
    })
    await table.getByRole('textbox').fill('amount')
    await access.click()
    await save.click()
    await expect(page.getByText('查询 API 暂时无法保存，请重试', { exact: true })).toBeVisible()
    await expect(editor).toBeVisible()
    await expect(access).toHaveAttribute('aria-selected', 'true')
    await query.click()
    await expect(name).toHaveValue('跨页签校验与重试 API')
    await expect(editor.getByRole('textbox', { name: '查询 API SQL', exact: true })).toHaveValue(
      definition.sql
    )
    await access.click()
    failSave = false
    await save.click()
    await expect(editor).toHaveCount(0)
    expect(saves).toHaveLength(2)
    expect(saves[1]).toMatchObject({
      id: definition.id,
      tenantId,
      sql: definition.sql,
      parameters: definition.parameters,
      allowedUserIds: [userId],
      maxRows: 321,
      timeoutMs: 10000,
      enabled: true
    })
    expect(saves[0]).toEqual(saves[1])
    await manager.getByRole('button', { name: '编辑与授权', exact: true }).click()
    await expect(query).toHaveAttribute('aria-selected', 'true')
    await expect(name).toHaveValue('跨页签校验与重试 API')
    await editor.getByRole('button', { name: '取消', exact: true }).click()
    expect(saves).toHaveLength(2)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true
    )
  })
}
