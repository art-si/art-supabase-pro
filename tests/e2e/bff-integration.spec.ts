import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import type { BffPublishedApi } from '../../src/types/platform/bff'

// This optional page is absent from the default Pro menu and requires its own enabled host.
test.skip(
  process.env.E2E_BFF_INTEGRATION !== 'true',
  'Set E2E_BFF_INTEGRATION=true with BFF enabled'
)

test.describe.configure({ timeout: 150_000 })

const sources: Array<[string, string]> = [
  ['java-demo', 'Java 服务'],
  ['supabase-demo', 'Supabase'],
  ['cloudbase-demo', 'CloudBase']
]
const catalog: BffPublishedApi[] = sources.map(([applicationCode, applicationName], index) => ({
  interfaceId: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  code: `${applicationCode}-orders`,
  name: `${applicationName} 订单列表`,
  method: 'GET',
  path: `/examples/${applicationCode}/orders`,
  environment: 'development',
  version: index + 1,
  applicationCode,
  applicationName,
  inputs: [
    { key: 'current', label: '当前页', location: 'query', type: 'number', required: true },
    { key: 'size', label: '每页条数', location: 'query', type: 'number', required: true }
  ],
  resultKind: 'page',
  outputs: [
    { key: 'id', label: '订单编号', type: 'string' },
    { key: 'name', label: '订单名称', type: 'string' }
  ],
  pagination: { currentInputKey: 'current', sizeInputKey: 'size' }
}))

interface MockState {
  requests: string[]
  pages: Array<{ current: number; size: number }>
  failNext: boolean
  leakNext: boolean
  errors: string[]
}

/** UI-only bridge mock; it does not prove BFF assertion, membership or database authorization. */
async function mockBridge(page: Page): Promise<MockState> {
  const state: MockState = { requests: [], pages: [], failNext: false, leakNext: false, errors: [] }
  page.on('pageerror', (error) => state.errors.push(error.message))
  await page.route('**/__bff_bridge', async (route) => {
    const payload = route.request().postDataJSON() as Record<string, unknown>
    if (payload.operation === 'catalog') {
      await new Promise((resolve) => setTimeout(resolve, 180))
      await route.fulfill({ json: { records: catalog } })
      return
    }
    if (payload.operation !== 'invoke' || typeof payload.applicationCode !== 'string') {
      await route.fulfill({ status: 400, json: { code: 'INVALID_INPUT' } })
      return
    }
    state.requests.push(payload.applicationCode)
    if (state.failNext) {
      state.failNext = false
      await route.fulfill({ status: 503, json: { code: 'GATEWAY_UNAVAILABLE' } })
      return
    }
    const source = catalog.find((item) => item.applicationCode === payload.applicationCode)
    if (!source) {
      await route.fulfill({ status: 404, json: { code: 'NOT_FOUND' } })
      return
    }
    const marker =
      source.applicationCode === 'java-demo'
        ? 'J'
        : source.applicationCode === 'supabase-demo'
          ? 'S'
          : 'C'
    const records: Array<Record<string, string>> = [
      { id: `${marker}-001`, name: `${source.applicationName} 记录一` },
      { id: `${marker}-002`, name: `${source.applicationName} 记录二` }
    ]
    if (state.leakNext) {
      state.leakNext = false
      records[0] = { ...records[0], privateToken: 'DO_NOT_DISPLAY' }
    }
    const query = payload.query as Record<string, number>
    const current = query.current
    const size = query.size
    state.pages.push({ current, size })
    await route.fulfill({
      json: {
        code: 200,
        msg: '成功',
        requestId: `20000000-0000-4000-8000-${String(state.requests.length).padStart(12, '0')}`,
        version: source.version,
        data: {
          records: records.slice((current - 1) * size, current * size),
          total: 2,
          current,
          size
        }
      }
    })
  })
  return state
}

async function selectAndRun(page: Page, source: string, firstId: string, secondId: string) {
  await page
    .getByRole('row')
    .filter({ hasText: `${source} 订单列表` })
    .getByRole('button', { name: '选择接口' })
    .click()
  await page.getByRole('button', { name: '查询分页记录' }).click()
  await expect(page.getByText(firstId, { exact: true })).toBeVisible()
  await expect(page.getByText(secondId, { exact: true })).toBeVisible()
  await expect(page.getByText('共 2 条')).toBeVisible()
}

test('declared pagination inputs initialize the result table request', async ({ page }) => {
  const state = await mockBridge(page)
  await page.goto('#/examples/bff-integration', { waitUntil: 'domcontentloaded' })
  await page
    .getByRole('row')
    .filter({ hasText: 'Java 服务 订单列表' })
    .getByRole('button', { name: '选择接口' })
    .click()
  await page.getByRole('spinbutton', { name: /当前页/ }).fill('2')
  await page.getByRole('spinbutton', { name: /每页条数/ }).fill('1')
  await page.getByRole('button', { name: '查询分页记录' }).click()
  await expect(page.getByText('J-002', { exact: true })).toBeVisible()
  await expect(page.getByText('J-001', { exact: true })).toHaveCount(0)
  expect(state.pages).toEqual([{ current: 2, size: 1 }])
  expect(state.errors).toEqual([])
})

test('synthetic bridge catalog renders three published sources and two real-result rows each', async ({
  page
}) => {
  test.setTimeout(150_000)
  const state = await mockBridge(page)
  await page.goto('#/examples/bff-integration', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'BFF 接入中心' })).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole('row').filter({ hasText: 'Java 服务 订单列表' })).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: 'Supabase 订单列表' })).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: 'CloudBase 订单列表' })).toBeVisible()
  const search = page.getByPlaceholder('搜索接口、应用或路径')
  await expect(search).toBeVisible()

  const evidence = path.resolve('.artifacts/ui/bff-integration')
  mkdirSync(evidence, { recursive: true })
  await page.screenshot({ path: path.join(evidence, 'catalog-light-1440.png') })

  await search.fill('不存在的接口')
  await page.getByRole('button', { name: '查询' }).click()
  await expect(page.getByText('没有符合条件的已发布接口')).toBeVisible()
  await page.getByRole('button', { name: '重置' }).click()
  await selectAndRun(page, 'Java 服务', 'J-001', 'J-002')
  await selectAndRun(page, 'Supabase', 'S-001', 'S-002')
  await selectAndRun(page, 'CloudBase', 'C-001', 'C-002')
  await expect(page.getByText(/^请求编号 /)).toBeVisible()
  await expect(page.getByText('运行版本 V3')).toBeVisible()
  await expect(page.getByText('DO_NOT_DISPLAY')).toHaveCount(0)
  expect(state.requests).toEqual(['java-demo', 'supabase-demo', 'cloudbase-demo'])

  await page.screenshot({ path: path.join(evidence, 'catalog-results-light-1440.png') })
  await page.getByRole('switch', { name: '进入专注模式' }).locator('..').click()
  await expect(page.locator('.bff-integration__catalog-scope > .art-table-query')).toHaveClass(
    /is-focus-mode/
  )
  await expect(page.getByRole('heading', { name: 'BFF 接入中心' })).toBeHidden()
  await expect(page.getByText('常见响应格式')).toBeHidden()
  await page.screenshot({ path: path.join(evidence, 'catalog-focus-1440.png') })
  await page.keyboard.press('Escape')
  await expect(page.locator('.bff-integration__catalog-scope > .art-table-query')).not.toHaveClass(
    /is-focus-mode/
  )
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.getByRole('button', { name: '切换深色模式' }).click()
  await selectAndRun(page, 'CloudBase', 'C-001', 'C-002')
  await page.getByText('实际调用结果').scrollIntoViewIfNeeded()
  await page.screenshot({ path: path.join(evidence, 'catalog-results-dark-1280.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      )
    )
    .toBeLessThanOrEqual(1)
  await page.screenshot({ path: path.join(evidence, 'catalog-mobile-390.png') })
  await page.getByText('实际调用结果').scrollIntoViewIfNeeded()
  await page.screenshot({ path: path.join(evidence, 'catalog-results-mobile-390.png') })
  expect(state.errors).toEqual([])
})

test('synthetic bridge failure retries and rejects undeclared output fields', async ({ page }) => {
  test.setTimeout(150_000)
  const state = await mockBridge(page)
  state.failNext = true
  await page.goto('#/examples/bff-integration', { waitUntil: 'domcontentloaded' })
  await page
    .getByRole('row')
    .filter({ hasText: 'Java 服务 订单列表' })
    .getByRole('button', { name: '选择接口' })
    .click()
  await page.getByRole('button', { name: '查询分页记录' }).click()
  await expect(page.getByText('BFF 接入服务暂时不可用，请稍后重试')).toBeVisible()
  const evidence = path.resolve('.artifacts/ui/bff-integration')
  mkdirSync(evidence, { recursive: true })
  await page.screenshot({ path: path.join(evidence, 'gateway-error-light-1440.png') })
  await page.getByRole('button', { name: '查询分页记录' }).click()
  await expect(page.getByText('J-001', { exact: true })).toBeVisible()
  state.leakNext = true
  await page.getByRole('button', { name: '查询分页记录' }).click()
  await expect(page.getByText('DO_NOT_DISPLAY')).toHaveCount(0)
  await expect(page.getByText('BFF 接入服务暂时不可用，请稍后重试')).toBeVisible()
  expect(state.errors).toEqual([])
})
