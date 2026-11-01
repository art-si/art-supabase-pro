import { expect, test, type Page, type Request } from '@playwright/test'
import type { SqlQueryApiDefinition } from '../../src/types/sql-query-api'
import { prepareIsolatedSession } from './support/isolated-session'
import { assertAppearance, prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(150_000)

const actor = '00000000-0000-4000-8000-000000000111'
const tenantA = '00000000-0000-4000-8000-000000000112'
const tenantB = '00000000-0000-4000-8000-000000000113'
const precise = '9007199254740993.01234567890123456789'
const definition: SqlQueryApiDefinition = {
  id: '00000000-0000-4000-8000-000000000114',
  slug: 'parameter-values-example',
  name: '三态参数示例',
  description: '隔离数据验证未提供、NULL 与空字符串',
  sql: `SELECT
  :required_text::text AS "PRIVATE_SQL_PARAMETER_VALUES",
  :optional_text::text AS optional_text,
  :amount::numeric AS amount,
  :enabled::boolean AS enabled,
  :omitted_text::text AS omitted_text,
  :whitespace::text AS whitespace,
  :nullable_number::numeric AS nullable_number,
  :constructor::text AS "constructor",
  :__proto__::text AS "__proto__",
  :toJSON::text AS "toJSON",
  :__v_raw::boolean AS "__v_raw",
  :day::date AS day,
  :entity::uuid AS entity`,
  tenantId: tenantA,
  allowedUserIds: [actor],
  parameters: [
    { name: 'required_text', type: 'string', required: true },
    { name: 'optional_text', type: 'string', required: false },
    { name: 'amount', type: 'number', required: true },
    { name: 'enabled', type: 'boolean', required: true },
    { name: 'omitted_text', type: 'string', required: false },
    { name: 'whitespace', type: 'string', required: false },
    { name: 'nullable_number', type: 'number', required: false },
    { name: 'constructor', type: 'string', required: false },
    { name: '__proto__', type: 'string', required: false },
    { name: 'toJSON', type: 'string', required: false },
    { name: '__v_raw', type: 'boolean', required: false },
    { name: 'day', type: 'date', required: false },
    { name: 'entity', type: 'uuid', required: false }
  ],
  enabled: true,
  maxRows: 200,
  timeoutMs: 10000,
  updatedAt: '2026-11-01T00:00:00Z'
}
const secondary: SqlQueryApiDefinition = {
  ...definition,
  id: '00000000-0000-4000-8000-000000000115',
  slug: 'other-parameter-values',
  name: '另一个三态参数示例'
}
type WireParams = Record<string, string | boolean | null>
const submittedParams: WireParams = Object.fromEntries([
  ['required_text', ''],
  ['optional_text', null],
  ['amount', precise],
  ['enabled', false],
  ['whitespace', '   '],
  ['nullable_number', null],
  ['constructor', 'constructor 原值'],
  ['__proto__', ''],
  ['toJSON', 'toJSON 原值'],
  ['__v_raw', false]
])
const requestIdPattern = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i

function gate<T>() {
  let release!: (value: T) => void
  const wait = new Promise<T>((resolve) => {
    release = resolve
  })
  return { wait, release }
}
interface PendingCall {
  request: Request
  body: Record<string, unknown>
  reply: ReturnType<typeof gate<object>>
  delivered: boolean
}
interface FixtureState {
  definitions: SqlQueryApiDefinition[]
  invokes: PendingCall[]
  mutations: unknown[]
  rawQueries: unknown[]
  lists: number
}
const runtimeErrors = new WeakMap<Page, string[]>()
test.beforeEach(({ page }) => {
  const errors: string[] = []
  runtimeErrors.set(page, errors)
  page.on('pageerror', (error) => errors.push(error.message))
})
test.afterEach(({ page }) => {
  expect(runtimeErrors.get(page) ?? [], 'Unhandled page runtime errors').toEqual([])
})

const manager = (page: Page) => page.getByRole('dialog', { name: '查询 API', exact: true })
const field = (page: Page, name: string) =>
  manager(page).getByRole('textbox', { name: `API 参数 ${name}`, exact: true })
const modeButton = (page: Page, name: string) =>
  manager(page).getByRole('button', { name: `参数 ${name} 的值方式`, exact: true })
const invokeButton = (page: Page) =>
  manager(page).getByRole('button', { name: '调用 API', exact: true })
const requestButton = (page: Page) =>
  manager(page).getByRole('button', { name: '查看本次请求', exact: true })
const requestViewer = (page: Page) => page.getByRole('dialog', { name: '本次请求', exact: true })
const picker = (page: Page) => page.getByRole('region', { name: 'API 参数方案', exact: true })
const presetViewer = (page: Page) => page.getByRole('dialog', { name: '参数方案详情', exact: true })
const applyPreset = (page: Page, name: string) =>
  picker(page).getByRole('button', { name: `填入参数方案 ${name}`, exact: true })
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

async function prepare(page: Page, project: string, ordinary = true) {
  page.setDefaultTimeout(15_000)
  page.setDefaultNavigationTimeout(60_000)
  await prepareIsolatedSession(page)
  const appearance = {
    theme: project.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !project.includes('shadow')
  } as const
  await prepareAppearance(page, appearance)
  await page.addInitScript((appearance) => {
    const apply = () => {
      document.documentElement.dataset.boxMode = appearance.boxBorderMode
        ? 'border-mode'
        : 'shadow-mode'
      document.documentElement.dataset.uiScope = 'admin'
    }
    if (document.documentElement) apply()
    else document.addEventListener('DOMContentLoaded', apply, { once: true })
  }, appearance)
  const state: FixtureState = {
    definitions: structuredClone([definition, secondary]),
    invokes: [],
    mutations: [],
    rawQueries: [],
    lists: 0
  }
  await page.route('**/functions/v1/execute-sql-with-columns', (route) => {
    const body: unknown = route.request().postDataJSON()
    if (!isRecord(body) || body.action !== 'metadata') state.rawQueries.push(body)
    return route.fulfill({
      json: { schemas: [], tables: [], columns: [], functions: [], foreignKeys: [] }
    })
  })
  await page.route('**/functions/v1/sql-query-api**', async (route) => {
    const request = route.request()
    const body: unknown = request.postDataJSON()
    if (isRecord(body) && body.action === 'list') {
      state.lists++
      return route.fulfill({
        json: { definitions: state.definitions, canManage: !ordinary, users: [] }
      })
    }
    if (isRecord(body) && isRecord(body.params) && !('action' in body)) {
      const call: PendingCall = { request, body, reply: gate<object>(), delivered: false }
      state.invokes.push(call)
      await route.fulfill({ json: await call.reply.wait })
      call.delivered = true
      return
    }
    state.mutations.push(body)
    return route.fulfill({ status: 400, json: { message: '参数操作不应修改服务端数据' } })
  })
  await page.goto(
    `/tests/e2e/fixtures/sql-console-metadata.html?actor=${actor}&tenant=${tenantA}&keepalive=1${ordinary ? '&ordinary=1' : ''}`
  )
  await assertAppearance(page, appearance)
  await openManager(page)
  await expect(requestButton(page)).toBeDisabled()
  return state
}

async function openManager(page: Page) {
  await page.getByRole('button', { name: '查询 API', exact: true }).click()
  await expect(manager(page)).toBeVisible()
  await expect(invokeButton(page)).toBeEnabled()
}

async function chooseMode(
  page: Page,
  name: string,
  mode: '未提供' | 'NULL' | '输入值' | '空字符串'
) {
  await modeButton(page, name).click()
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()
  await menu.getByRole('menuitem', { name: mode, exact: true }).click()
  await expect(menu).toBeHidden()
}

async function setBoolean(page: Page, name: string, value: boolean) {
  await manager(page)
    .getByRole('combobox', { name: `API 参数 ${name}`, exact: true })
    .click()
  await page.getByRole('option', { name: String(value), exact: true }).click()
}

async function fillRequired(page: Page, amount = precise) {
  await field(page, 'amount').fill(` ${amount} `)
  await setBoolean(page, 'enabled', false)
}

async function fillThreeStates(page: Page) {
  await fillRequired(page)
  await chooseMode(page, 'required_text', '空字符串')
  await chooseMode(page, 'optional_text', 'NULL')
  await chooseMode(page, 'omitted_text', '未提供')
  await field(page, 'whitespace').fill('   ')
  await chooseMode(page, 'nullable_number', 'NULL')
  await field(page, 'constructor').fill('constructor 原值')
  await chooseMode(page, '__proto__', '空字符串')
  await field(page, 'toJSON').fill('toJSON 原值')
  await setBoolean(page, '__v_raw', false)
}

async function dispatch(page: Page, state: FixtureState, params: WireParams) {
  const before = state.invokes.length
  await invokeButton(page).click()
  await expect.poll(() => state.invokes.length).toBe(before + 1)
  const call = state.invokes[before]
  expect(call.body).toEqual({ params, requestId: expect.stringMatching(requestIdPattern) })
  await expect(requestButton(page)).toBeEnabled()
  return call
}

async function finish(page: Page, call: PendingCall) {
  const received = page.waitForResponse((response) => response.request() === call.request)
  call.reply.release({
    status: 'ok',
    rows: [{ label: '明确调用后的结果' }],
    columns: [{ name: 'label' }],
    rowCount: 1,
    durationMs: 4,
    truncated: false,
    maxRows: 200,
    timeoutMs: 10000
  })
  await (await received).finished()
  await expect.poll(() => call.delivered).toBe(true)
  await expect(invokeButton(page)).toBeEnabled()
}

async function inspectRequest(page: Page, params: WireParams) {
  await requestButton(page).click()
  await expect(requestViewer(page)).toBeVisible()
  const code = requestViewer(page).locator('pre[aria-label="本次请求参数代码"] code')
  const text = (await code.textContent()) || ''
  const parsed: unknown = JSON.parse(text)
  expect(parsed).toEqual({ params })
  expect(text).toBe(JSON.stringify({ params }, null, 2))
  for (const privateValue of [
    actor,
    tenantA,
    definition.id,
    'PRIVATE_SQL_PARAMETER_VALUES',
    'requestId'
  ])
    expect(text).not.toContain(privateValue)
  return text
}

async function closeRequest(page: Page) {
  await requestViewer(page).getByRole('button', { name: '关闭', exact: true }).last().click()
  await expect(requestViewer(page)).toBeHidden()
}

async function openPicker(page: Page) {
  if (!(await picker(page).isVisible()))
    await manager(page).getByRole('button', { name: '参数方案', exact: true }).click()
  await expect(picker(page)).toBeVisible()
}

async function savePreset(page: Page, name: string) {
  await openPicker(page)
  await picker(page).getByRole('button', { name: '保存当前参数', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '保存参数方案', exact: true })
  await dialog.getByRole('textbox', { name: '方案名称', exact: true }).fill(name)
  await dialog.getByRole('button', { name: '保存方案', exact: true }).click()
  await expect(dialog).toBeHidden()
}

async function savedStore(page: Page, name: string) {
  const stores = await page.evaluate(
    (name) =>
      Object.entries(localStorage)
        .filter(([, value]) => value.includes(JSON.stringify(name)))
        .map(([key, value]) => ({ key, value })),
    name
  )
  expect(stores, 'Discover the genuine store written by the save UI').toHaveLength(1)
  return stores[0]
}

function storedRecord(raw: string) {
  const state: unknown = JSON.parse(raw)
  if (
    !isRecord(state) ||
    !Array.isArray(state.presets) ||
    state.presets.length !== 1 ||
    !isRecord(state.presets[0])
  )
    throw new Error('The expected single saved parameter scheme is unavailable')
  return { state, entry: state.presets[0] }
}

async function previewPreset(page: Page, name: string, expected: WireParams) {
  await openPicker(page)
  await picker(page)
    .getByRole('button', { name: `查看参数方案 ${name}`, exact: true })
    .click()
  await expect(presetViewer(page)).toBeVisible()
  const text =
    (await presetViewer(page).locator('pre[aria-label="单元格内容代码"] code').textContent()) || ''
  const parsed: unknown = JSON.parse(text)
  expect(parsed).toEqual(expected)
  await presetViewer(page).getByRole('button', { name: '关闭', exact: true }).last().click()
  await expect(presetViewer(page)).toBeHidden()
}

test('ordinary users explicitly dispatch empty strings, NULL and omissions with literal prototype fields', async ({
  page
}, info) => {
  const state = await prepare(page, info.project.name)
  await expect(manager(page).getByRole('button', { name: '编辑与授权', exact: true })).toHaveCount(
    0
  )
  await fillThreeStates(page)
  await expect(field(page, 'required_text')).toHaveAttribute('placeholder', '空字符串 ""')
  await expect(field(page, 'optional_text')).toHaveAttribute('placeholder', 'NULL')
  await expect(field(page, 'omitted_text')).toHaveAttribute('placeholder', '未提供')
  expect(state.invokes).toEqual([])
  const call = await dispatch(page, state, submittedParams)
  const text = await inspectRequest(page, submittedParams)
  expect(text).toContain('"__proto__": ""')
  await page.screenshot({
    path: info.outputPath('api-parameter-values-request.png'),
    animations: 'disabled'
  })
  await closeRequest(page)
  await finish(page, call)
  await expect(manager(page).locator('.result-table-container')).toContainText('明确调用后的结果')
  expect(state.invokes).toHaveLength(1)
  expect(state.mutations).toEqual([])
  expect(state.rawQueries).toEqual([])
})

test('required omissions are rejected while explicit required empty text and numeric zero remain valid', async ({
  page
}, info) => {
  const state = await prepare(page, info.project.name)
  await fillRequired(page, '0')
  await invokeButton(page).click()
  await expect(invokeButton(page)).toBeEnabled()
  await expect(manager(page)).toContainText('请填写参数 required_text')
  expect(state.invokes).toEqual([])
  await modeButton(page, 'required_text').click()
  await expect(
    page.getByRole('menu').getByRole('menuitem', { name: 'NULL', exact: true })
  ).toBeDisabled()
  await page.getByRole('menu').getByRole('menuitem', { name: '空字符串', exact: true }).click()
  await expect(page.getByRole('menu')).toBeHidden()
  await modeButton(page, 'amount').click()
  await expect(
    page.getByRole('menu').getByRole('menuitem', { name: '空字符串', exact: true })
  ).toHaveCount(0)
  await page.getByRole('menu').press('Escape')
  await expect(page.getByRole('menu')).toBeHidden()
  await field(page, 'amount').fill('')
  await expect(field(page, 'amount')).toHaveAttribute('placeholder', '未提供')
  await invokeButton(page).click()
  await expect(invokeButton(page)).toBeEnabled()
  await expect(manager(page)).toContainText('请填写参数 amount')
  expect(state.invokes).toEqual([])
  await field(page, 'amount').fill('0')
  await field(page, 'optional_text').fill('NULL')
  const params = { required_text: '', optional_text: 'NULL', amount: '0', enabled: false }
  const call = await dispatch(page, state, params)
  await finish(page, call)
  await inspectRequest(page, params)
  expect(state.invokes).toHaveLength(1)
  expect(state.mutations).toEqual([])
})

test('date and UUID controls preserve typed strings, explicit NULL and omission while rejecting an invalid UUID', async ({
  page
}, info) => {
  const state = await prepare(page, info.project.name)
  const dateInput = manager(page).getByRole('combobox', { name: 'API 参数 day', exact: true })
  const day = '2024-02-29'
  const entity = 'ABCDEFAB-1234-4ABC-8DEF-ABCDEFABCDEF'
  const base = { required_text: '', amount: precise, enabled: false }
  await fillRequired(page)
  await chooseMode(page, 'required_text', '空字符串')
  await dateInput.fill(day)
  await dateInput.press('Tab')
  await expect(dateInput).toHaveValue(day)
  await field(page, 'entity').fill(entity)
  await field(page, 'entity').press('Tab')
  const typedParams = { ...base, day, entity }
  const typed = await dispatch(page, state, typedParams)
  await expect(dateInput).toBeDisabled()
  await expect(field(page, 'entity')).toBeDisabled()
  await inspectRequest(page, typedParams)
  await page.screenshot({
    path: info.outputPath('api-parameter-date-uuid-request.png'),
    animations: 'disabled'
  })
  await closeRequest(page)
  await finish(page, typed)

  await chooseMode(page, 'day', 'NULL')
  await chooseMode(page, 'entity', 'NULL')
  await expect(dateInput).toHaveAttribute('placeholder', 'NULL')
  await expect(field(page, 'entity')).toHaveAttribute('placeholder', 'NULL')
  expect(state.invokes).toHaveLength(1)
  const explicitNull = await dispatch(page, state, { ...base, day: null, entity: null })
  await finish(page, explicitNull)

  await chooseMode(page, 'day', '未提供')
  await chooseMode(page, 'entity', '未提供')
  await expect(dateInput).toHaveAttribute('placeholder', '未提供')
  await expect(field(page, 'entity')).toHaveAttribute('placeholder', '未提供')
  await field(page, 'entity').fill('not-a-uuid')
  await field(page, 'entity').press('Tab')
  await invokeButton(page).click()
  await expect(invokeButton(page)).toBeEnabled()
  await expect(manager(page)).toContainText('参数 entity 请输入有效 UUID')
  await expect(requestButton(page)).toBeDisabled()
  expect(state.invokes).toHaveLength(2)

  await chooseMode(page, 'entity', '未提供')
  const omitted = await dispatch(page, state, base)
  await finish(page, omitted)
  await inspectRequest(page, base)
  expect(state.invokes).toHaveLength(3)
  expect(state.mutations).toEqual([])
  expect(state.rawQueries).toEqual([])
})

test('v2 personal schemes preserve empty strings and explicit NULL across reload, preview and fill', async ({
  page
}, info) => {
  const state = await prepare(page, info.project.name)
  const name = '三态方案 v2'
  await fillThreeStates(page)
  await savePreset(page, name)
  const store = await savedStore(page, name)
  const saved = storedRecord(store.value)
  expect(saved.state.version).toBe(2)
  expect(saved.entry.values).toEqual(submittedParams)
  expect(state.invokes).toEqual([])
  await page.reload()
  await openManager(page)
  await previewPreset(page, name, submittedParams)
  await openPicker(page)
  await applyPreset(page, name).click()
  await expect(field(page, 'required_text')).toHaveAttribute('placeholder', '空字符串 ""')
  await expect(field(page, 'optional_text')).toHaveAttribute('placeholder', 'NULL')
  await expect(field(page, 'omitted_text')).toHaveAttribute('placeholder', '未提供')
  await expect(field(page, 'whitespace')).toHaveValue('   ')
  expect(await page.evaluate((key) => localStorage.getItem(key), store.key)).toBe(store.value)
  expect(state.invokes).toEqual([])
  const call = await dispatch(page, state, submittedParams)
  await finish(page, call)
  expect(state.mutations).toEqual([])
  expect(state.rawQueries).toEqual([])
})

test('v1 schemes retain their old empty-string semantics without automatic writes and reject legacy NULL', async ({
  page
}, info) => {
  const state = await prepare(page, info.project.name)
  const name = '旧版兼容参数方案'
  await fillRequired(page)
  await savePreset(page, name)
  const store = await savedStore(page, name)
  const saved = storedRecord(store.value)
  const legacyValues = {
    required_text: '',
    optional_text: '',
    amount: precise,
    enabled: false,
    whitespace: '   ',
    constructor: '旧版原值'
  }
  const legacyRaw = JSON.stringify({
    ...saved.state,
    version: 1,
    presets: [{ ...saved.entry, values: legacyValues }]
  })
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
    key: store.key,
    value: legacyRaw
  })
  await page.reload()
  await openManager(page)
  const expected = { amount: precise, enabled: false, whitespace: '   ', constructor: '旧版原值' }
  await previewPreset(page, name, expected)
  await openPicker(page)
  await applyPreset(page, name).click()
  await expect(field(page, 'required_text')).toHaveAttribute('placeholder', '未提供')
  await expect(field(page, 'optional_text')).toHaveAttribute('placeholder', '未提供')
  expect(await page.evaluate((key) => localStorage.getItem(key), store.key)).toBe(legacyRaw)
  await invokeButton(page).click()
  await expect(invokeButton(page)).toBeEnabled()
  expect(state.invokes).toEqual([])
  await chooseMode(page, 'required_text', '空字符串')
  await openPicker(page)
  await picker(page)
    .getByRole('button', { name: `用当前参数更新方案 ${name}`, exact: true })
    .click()
  const updated = storedRecord((await savedStore(page, name)).value)
  expect(updated.state.version).toBe(2)
  expect(updated.entry.values).toEqual({ required_text: '', ...expected })
  await picker(page).getByRole('button', { name: '关闭参数方案', exact: true }).click()

  const invalidRaw = JSON.stringify({
    ...saved.state,
    version: 1,
    presets: [{ ...saved.entry, values: { ...legacyValues, optional_text: null } }]
  })
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
    key: store.key,
    value: invalidRaw
  })
  await page.reload()
  await openManager(page)
  await field(page, 'amount').fill('5.25')
  await openPicker(page)
  await expect(picker(page)).toContainText(/损坏|读取|无法/)
  await expect(applyPreset(page, name)).toHaveCount(0)
  await expect(
    picker(page).getByRole('button', { name: '重新读取方案', exact: true })
  ).toBeEnabled()
  await expect(field(page, 'amount')).toHaveValue('5.25')
  expect(await page.evaluate((key) => localStorage.getItem(key), store.key)).toBe(invalidRaw)
  expect(state.invokes).toEqual([])
  expect(state.mutations).toEqual([])
})

test('API selection, tenant ABA, KeepAlive and disabled definitions cannot retain old parameter modes', async ({
  page
}, info) => {
  const state = await prepare(page, info.project.name, false)
  for (const boundary of ['api', 'tenant-aba', 'keepalive', 'disabled'] as const) {
    await fillThreeStates(page)
    const call = await dispatch(page, state, submittedParams)
    await finish(page, call)
    await inspectRequest(page, submittedParams)
    if (boundary === 'api') {
      await closeRequest(page)
      await manager(page)
        .getByRole('navigation', { name: '查询 API 列表', exact: true })
        .getByRole('button', { name: new RegExp(secondary.name) })
        .click()
    } else if (boundary === 'tenant-aba') {
      await page.evaluate(
        ({ tenantA, tenantB }) => {
          window.dispatchEvent(new CustomEvent('sql-preview-tenant-change', { detail: tenantB }))
          window.dispatchEvent(new CustomEvent('sql-preview-tenant-change', { detail: tenantA }))
        },
        { tenantA, tenantB }
      )
      await expect(manager(page)).toBeHidden()
      await openManager(page)
    } else if (boundary === 'keepalive') {
      await page.evaluate(() =>
        window.dispatchEvent(new CustomEvent('sql-preview-active', { detail: false }))
      )
      await expect(manager(page)).toBeHidden()
      await page.evaluate(() =>
        window.dispatchEvent(new CustomEvent('sql-preview-active', { detail: true }))
      )
      await openManager(page)
    } else {
      await closeRequest(page)
      state.definitions = state.definitions.map((item) => ({
        ...item,
        enabled: false,
        updatedAt: '2026-11-01T02:00:00Z'
      }))
      const before = state.lists
      await manager(page).getByRole('button', { name: '刷新 API', exact: true }).click()
      await expect.poll(() => state.lists).toBe(before + 1)
      await expect(
        manager(page).getByRole('button', { name: '刷新 API', exact: true })
      ).toBeEnabled()
    }
    await expect(requestViewer(page)).toBeHidden()
    await expect(requestButton(page)).toBeDisabled()
    await expect(field(page, 'required_text')).toHaveAttribute('placeholder', '未提供')
    await expect(field(page, 'optional_text')).toHaveAttribute('placeholder', '未提供')
    if (boundary === 'disabled') {
      await expect(invokeButton(page)).toBeDisabled()
      await expect(modeButton(page, 'required_text')).toBeDisabled()
      await expect(field(page, 'required_text')).toBeDisabled()
    } else {
      await fillRequired(page)
      const before = state.invokes.length
      await invokeButton(page).click()
      await expect(invokeButton(page)).toBeEnabled()
      expect(state.invokes).toHaveLength(before)
    }
  }
  expect(state.invokes).toHaveLength(4)
  expect(state.mutations).toEqual([])
  expect(state.rawQueries).toEqual([])
})

test('390px keyboard value menus use compact targets and disable every input during a call', async ({
  page
}, info) => {
  const state = await prepare(page, info.project.name)
  await page.setViewportSize({ width: 390, height: 844 })
  const trigger = modeButton(page, 'required_text')
  await trigger.scrollIntoViewIfNeeded()
  await trigger.focus()
  await trigger.press('Enter')
  await expect(page.getByRole('menu')).toBeVisible()
  const box = await trigger.boundingBox()
  expect(box?.width).toBe(26)
  expect(box?.height).toBe(26)
  await page.screenshot({
    path: info.outputPath('api-parameter-mode-narrow.png'),
    animations: 'disabled'
  })
  await page
    .getByRole('menu')
    .getByRole('menuitem', { name: '空字符串', exact: true })
    .press('Enter')
  await expect(page.getByRole('menu')).toBeHidden()
  await expect(field(page, 'required_text')).toHaveAttribute('placeholder', '空字符串 ""')
  await fillRequired(page)
  const call = await dispatch(page, state, { required_text: '', amount: precise, enabled: false })
  for (const parameter of definition.parameters)
    await expect(modeButton(page, parameter.name)).toBeDisabled()
  await expect(field(page, 'required_text')).toBeDisabled()
  await expect(field(page, 'amount')).toBeDisabled()
  await expect(
    manager(page).getByRole('combobox', { name: 'API 参数 enabled', exact: true })
  ).toBeDisabled()
  await expect(manager(page).getByRole('button', { name: '参数方案', exact: true })).toBeDisabled()
  await inspectRequest(page, { required_text: '', amount: precise, enabled: false })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
  await page.screenshot({
    path: info.outputPath('api-parameter-values-narrow-request.png'),
    animations: 'disabled'
  })
  await closeRequest(page)
  await finish(page, call)
  await expect(trigger).toBeEnabled()
  expect(state.invokes).toHaveLength(1)
  expect(state.mutations).toEqual([])
  expect(state.rawQueries).toEqual([])
})
