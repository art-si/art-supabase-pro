import { expect, test, type Locator, type Page } from '@playwright/test'
import { sqlQueryApiSamples } from '../../src/views/data-center/sql-console/modules/query-api-samples'
import type { SqlQueryApiDefinition, SqlQueryApiInput } from '../../src/types/sql-query-api'
import { prepareIsolatedSession } from './support/isolated-session'
import { prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const tenantId = '00000000-0000-4000-8000-000000000001'
const userId = '00000000-0000-4000-8000-000000000002'
const hint = '已填入示例参数，尚未调用；请点击“调用 API”运行。'
const helloName = '示例 1：参数问候'
const amountName = '示例 2：订单金额试算'
const trendName = '示例 3：7 日销售趋势'

// Reuse the production examples only to build API DTOs. UI input/output expectations
// below are independent literals; these routes do not test server authorization.
const definitions = (): SqlQueryApiDefinition[] =>
  sqlQueryApiSamples.map((sample, index) => ({
    id: `00000000-0000-4000-8000-00000000001${index}`,
    slug: sample.slug,
    name: sample.name,
    description: sample.description,
    sql: sample.sql,
    parameters: structuredClone(sample.parameters),
    tenantId,
    allowedUserIds: [],
    maxRows: sample.maxRows,
    timeoutMs: sample.timeoutMs,
    enabled: true,
    updatedAt: '2026-10-31T01:00:00.000001Z'
  }))

interface Invocation {
  slug: string
  body: Record<string, unknown>
}

async function prepare(
  page: Page,
  project: string,
  records: SqlQueryApiDefinition[],
  ordinary = false
) {
  page.setDefaultTimeout(15_000)
  page.setDefaultNavigationTimeout(60_000)
  await prepareIsolatedSession(page)
  await prepareAppearance(page, { theme: project.includes('dark') ? 'dark' : 'light' })
  const state = { calls: [] as Invocation[], saves: [] as SqlQueryApiInput[], executions: 0 }
  await page.route('**/functions/v1/execute-sql-with-columns', (route) => {
    const body = route.request().postDataJSON() as { action?: string }
    if (body.action !== 'metadata') state.executions++
    return route.fulfill({
      json: { schemas: [], tables: [], columns: [], functions: [], foreignKeys: [] }
    })
  })
  await page.route('**/rest/v1/sys_tenant?*', (route) =>
    route.fulfill({
      json: [{ id: tenantId, tenant_name: '测试租户', tenant_code: 'test', status: '1' }]
    })
  )
  await page.route('**/functions/v1/sql-query-api**', (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>
    if (body.action === 'list')
      return route.fulfill({
        json: { definitions: records, canManage: !ordinary, users: [] }
      })
    if (body.action === 'save') {
      const input = body.input as SqlQueryApiInput
      state.saves.push(input)
      const record: SqlQueryApiDefinition = {
        ...input,
        id: '00000000-0000-4000-8000-000000000090',
        updatedAt: '2026-10-31T02:00:00.000001Z'
      }
      records.unshift(record)
      return route.fulfill({ json: record })
    }
    const slug = new URL(route.request().url()).pathname.split('/').at(-1) || ''
    state.calls.push({ slug, body })
    const params = body.params as Record<string, unknown>
    const record = records.find((item) => item.slug === slug)
    const kind = record?.parameters[0]?.name
    const rows =
      kind === 'quantity'
        ? [{ quantity: '3', unit_price: '19.90', total_amount: '59.70' }]
        : kind === 'start_date'
          ? [
              { sale_date: '2026-01-01', sales_amount: '1200.00', order_count: 12 },
              { sale_date: '2026-01-02', sales_amount: '1580.00', order_count: 15 },
              { sale_date: '2026-01-03', sales_amount: '980.00', order_count: 9 },
              { sale_date: '2026-01-04', sales_amount: '2100.00', order_count: 21 },
              { sale_date: '2026-01-05', sales_amount: '1750.00', order_count: 16 },
              { sale_date: '2026-01-06', sales_amount: '2600.00', order_count: 24 },
              { sale_date: '2026-01-07', sales_amount: '1950.00', order_count: 17 }
            ]
          : [{ message: `你好，${String(params.name)}`, note: '你已成功调用查询 API' }]
    return route.fulfill({
      json: {
        status: 'ok',
        rows,
        columns: Object.keys(rows[0]).map((name) => ({ name })),
        rowCount: rows.length,
        durationMs: 4,
        maxRows: 20,
        timeoutMs: 5000,
        truncated: false
      }
    })
  })
  await page.goto(
    `/tests/e2e/fixtures/sql-console-metadata.html?actor=${userId}&tenant=${tenantId}${ordinary ? '&ordinary=1' : ''}`
  )
  await page.getByRole('button', { name: '查询 API', exact: true }).click()
  const manager = page.getByRole('dialog', { name: '查询 API', exact: true })
  await expect(manager).toBeVisible()
  await expect(manager.getByText('使用说明与示例', { exact: true })).toBeVisible()
  return { state, manager }
}

async function expandGuide(manager: Locator) {
  const button = manager.getByRole('button', { name: '展开使用说明与示例', exact: true })
  if (await button.count()) await button.click()
  await expect(manager.getByRole('article', { name: amountName, exact: true })).toBeVisible()
}

async function noOverflow(page: Page, manager: Locator) {
  expect(
    await manager
      .locator('.art-drawer__content')
      .evaluate((el) => el.scrollWidth <= el.clientWidth + 1)
  ).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
}

test('published examples teach, fill and explicitly invoke amount without hidden requests', async ({
  page
}, info) => {
  const { state, manager } = await prepare(page, info.project.name, definitions())
  await expect(manager.getByRole('article')).toHaveCount(0)
  await expect(
    manager.getByRole('navigation', { name: '查询 API 列表' }).getByRole('button')
  ).toHaveCount(3)
  await page.screenshot({
    path: info.outputPath('query-api-guide-collapsed.png'),
    animations: 'disabled'
  })
  await expandGuide(manager)
  const amount = manager.getByRole('article', { name: amountName, exact: true })
  await expect(amount).toContainText('quantity = 3，unit_price = 19.90')
  await expect(amount).toContainText('total_amount = 59.70')
  await amount.scrollIntoViewIfNeeded()
  await noOverflow(page, manager)
  await page.screenshot({
    path: info.outputPath('query-api-guide-expanded.png'),
    animations: 'disabled'
  })
  await amount.getByRole('button', { name: '打开并填入参数', exact: true }).click()
  const detail = manager.getByRole('region', { name: '查询 API 详情', exact: true })
  await expect(detail.getByRole('textbox', { name: 'API 参数 quantity', exact: true })).toHaveValue(
    '3'
  )
  await expect(
    detail.getByRole('textbox', { name: 'API 参数 unit_price', exact: true })
  ).toHaveValue('19.90')
  await expect(detail.getByRole('status')).toContainText(hint)
  expect(state.calls).toHaveLength(0)
  expect(state.saves).toHaveLength(0)
  await detail.getByRole('button', { name: '调用 API', exact: true }).click()
  await expect(
    detail.getByRole('button', { name: '查看 total_amount 内容', exact: true })
  ).toContainText('59.70')
  expect(state.calls).toEqual([
    {
      slug: 'demo-order-amount',
      body: {
        params: { quantity: '3', unit_price: '19.90' },
        requestId: expect.stringMatching(/^[a-f\d-]{36}$/i)
      }
    }
  ])
  await detail
    .getByRole('button', { name: '查看 total_amount 内容', exact: true })
    .scrollIntoViewIfNeeded()
  await page.screenshot({
    path: info.outputPath('query-api-demo-amount-result.png'),
    animations: 'disabled'
  })
  await detail.getByRole('textbox', { name: 'API 参数 quantity', exact: true }).fill('9')
  await detail.getByRole('button', { name: '填入示例参数', exact: true }).click()
  await expect(detail.getByRole('textbox', { name: 'API 参数 quantity', exact: true })).toHaveValue(
    '3'
  )
  await expect(detail).toContainText('已有结果不会自动更新。')
  expect(state.calls).toHaveLength(1)
  await detail.getByRole('tab', { name: '接入说明', exact: true }).click()
  const request = detail.getByLabel('请求参数示例代码', { exact: true })
  await expect(request).toBeVisible()
  expect(JSON.parse(await request.innerText())).toEqual({
    params: { quantity: '3', unit_price: '19.90' }
  })
  await expect(detail.getByLabel('cURL 调用示例代码', { exact: true })).toContainText(
    '/sql-query-api/demo-order-amount'
  )
  await expect(detail).toContainText('Bearer YOUR_ACCESS_TOKEN')
  await expect(detail).not.toContainText('test-signature')
  await request.scrollIntoViewIfNeeded()
  await noOverflow(page, manager)
  await page.screenshot({
    path: info.outputPath('query-api-demo-integration.png'),
    animations: 'disabled'
  })

  if (info.project.name === 'desktop-1440') {
    const trend = manager.getByRole('article', { name: trendName, exact: true })
    await trend.getByRole('button', { name: '打开并填入参数', exact: true }).click()
    await expect(
      detail.getByRole('textbox', { name: 'API 参数 min_amount', exact: true })
    ).toHaveValue('0')
    expect(state.calls).toHaveLength(1)
    await detail.getByRole('button', { name: '调用 API', exact: true }).click()
    await expect(detail).toContainText('返回 7 行 · 4 ms')
    expect(state.calls[1]).toEqual({
      slug: 'demo-sales-trend',
      body: {
        params: { start_date: '2026-01-01', min_amount: '0' },
        requestId: expect.stringMatching(/^[a-f\d-]{36}$/i)
      }
    })
    await detail.getByRole('button', { name: '结果图表', exact: true }).click()
    const chart = page.getByRole('dialog', { name: '结果图表', exact: true })
    await expect(chart).toContainText('7 个数据点')
    await chart.getByRole('img', { name: /SQL 结果折线图，7 个数据点/ }).scrollIntoViewIfNeeded()
    await expect(chart.locator('canvas')).toBeVisible()
    await page.screenshot({
      path: info.outputPath('query-api-demo-trend-chart.png'),
      animations: 'disabled'
    })
    await chart.getByRole('button', { name: '返回结果表', exact: true }).click()
    expect(state.calls).toHaveLength(2)
  }
  expect(state.executions).toBe(0)
})

test('ordinary empty lists still teach all examples without publishing or invoking', async ({
  page
}, info) => {
  const { state, manager } = await prepare(page, info.project.name, [], true)
  await expect(manager.getByRole('article')).toHaveCount(3)
  await expect(manager).toContainText('暂无可用查询 API')
  await expect(manager).toContainText('1. 选择 API')
  await expect(manager).toContainText('2. 填参并调用')
  await expect(manager).toContainText('3. 接入应用')
  await expect(manager.getByRole('button', { name: '新建查询 API', exact: true })).toHaveCount(0)
  await expect(manager.getByRole('button', { name: '用此示例新建', exact: true })).toHaveCount(0)
  await expect(manager.getByRole('button', { name: '打开并填入参数', exact: true })).toHaveCount(0)
  const trend = manager.getByRole('article', { name: trendName, exact: true })
  await expect(trend).toContainText('当前未获此示例 API 授权，请联系平台管理员。')
  await trend.scrollIntoViewIfNeeded()
  await noOverflow(page, manager)
  await page.screenshot({
    path: info.outputPath('query-api-guide-ordinary-empty.png'),
    animations: 'disabled'
  })
  expect(state.calls).toEqual([])
  expect(state.saves).toEqual([])
  expect(state.executions).toBe(0)
})

test('a sample creates a tenant-owned draft and only explicit publication saves it', async ({
  page
}, info) => {
  const { state, manager } = await prepare(page, info.project.name, [])
  const amount = manager.getByRole('article', { name: amountName, exact: true })
  await amount.getByRole('button', { name: '用此示例新建', exact: true }).click()
  const form = page.getByRole('dialog', { name: '发布查询 API', exact: true })
  await expect(form.getByRole('textbox', { name: '查询 API 名称', exact: true })).toHaveValue(
    amountName
  )
  await expect(form.getByRole('textbox', { name: '查询 API 地址标识', exact: true })).toHaveValue(
    /^demo-order-amount-[a-f0-9]{8}$/
  )
  await expect(form.getByRole('textbox', { name: '查询 API SQL', exact: true })).toHaveValue(
    /round\(CAST\(:quantity AS numeric\) \* CAST\(:unit_price AS numeric\), 2\)/
  )
  await expect(
    form.getByRole('spinbutton', { name: '查询 API 返回行数', exact: true })
  ).toHaveValue('20')
  await expect(
    form.getByRole('spinbutton', { name: '查询 API 超时毫秒', exact: true })
  ).toHaveValue('5000')
  expect(state.saves).toHaveLength(0)
  await form
    .locator('.art-dialog__footer')
    .getByRole('button', { name: '取消', exact: true })
    .click()
  await expect(form).toHaveCount(0)
  expect(state.saves).toHaveLength(0)
  await amount.getByRole('button', { name: '用此示例新建', exact: true }).click()
  await form.getByRole('button', { name: '发布 API', exact: true }).click()
  await expect(form).toHaveCount(0)
  expect(state.saves).toHaveLength(1)
  expect(state.saves[0]).toMatchObject({
    tenantId,
    allowedUserIds: [],
    maxRows: 20,
    timeoutMs: 5000,
    enabled: true,
    parameters: [
      { name: 'quantity', type: 'number', required: true },
      { name: 'unit_price', type: 'number', required: true }
    ]
  })
  expect(state.calls).toHaveLength(0)
  await manager.getByRole('button', { name: '填入示例参数', exact: true }).click()
  await manager.getByRole('button', { name: '调用 API', exact: true }).click()
  await expect(
    manager.getByRole('button', { name: '查看 total_amount 内容', exact: true })
  ).toContainText('59.70')
  expect(state.calls).toEqual([
    {
      slug: state.saves[0].slug,
      body: {
        params: { quantity: '3', unit_price: '19.90' },
        requestId: expect.stringMatching(/^[a-f\d-]{36}$/i)
      }
    }
  ])
  expect(state.executions).toBe(0)
})

test('ordinary granted canonical examples fill redacted definitions without exposing SQL', async ({
  page
}, info) => {
  const [hello] = definitions()
  const { state, manager } = await prepare(
    page,
    info.project.name,
    [{ ...hello, sql: '', allowedUserIds: [] }],
    true
  )
  await expandGuide(manager)
  await manager
    .getByRole('article', { name: helloName, exact: true })
    .getByRole('button', { name: '打开并填入参数', exact: true })
    .click()
  await expect(manager.getByRole('textbox', { name: 'API 参数 name', exact: true })).toHaveValue(
    '亿企工场'
  )
  expect(state.calls).toHaveLength(0)
  await manager.getByRole('button', { name: '调用 API', exact: true }).click()
  await expect(
    manager.getByRole('button', { name: '查看 message 内容', exact: true })
  ).toContainText('你好，亿企工场')
  await expect(manager.getByRole('tab', { name: 'SQL 定义', exact: true })).toHaveCount(0)
  await expect(manager.getByRole('button', { name: '编辑与授权', exact: true })).toHaveCount(0)
  await manager.getByRole('tab', { name: '接入说明', exact: true }).click()
  const request = manager.getByLabel('请求参数示例代码', { exact: true })
  expect(JSON.parse(await request.innerText())).toEqual({ params: { name: '亿企工场' } })
  await expect(manager).not.toContainText("SELECT '你好，'")
  await expect(manager).not.toContainText('test-signature')
  expect(state.calls).toEqual([
    {
      slug: 'demo-hello',
      body: { params: { name: '亿企工场' }, requestId: expect.stringMatching(/^[a-f\d-]{36}$/i) }
    }
  ])
  expect(state.executions).toBe(0)
})
