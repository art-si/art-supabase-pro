import { expect, test, type Locator, type Page } from '@playwright/test'
import type { SqlQueryApiDefinition } from '../../src/types/sql-query-api'
import { prepareIsolatedSession } from './support/isolated-session'
import { assertAppearance, prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(150_000)

const actorA = '00000000-0000-4000-8000-000000000071'
const actorB = '00000000-0000-4000-8000-000000000072'
const tenantA = '00000000-0000-4000-8000-000000000073'
const tenantB = '00000000-0000-4000-8000-000000000074'
const precise = '12345678901234567890.1234567890123456789'
const definition: SqlQueryApiDefinition = {
  id: '00000000-0000-4000-8000-000000000075',
  slug: 'parameter-presets',
  name: '参数方案测试 API',
  description: '仅使用隔离数据测试个人本机参数方案',
  sql: 'SELECT :amount::numeric AS amount',
  tenantId: tenantA,
  allowedUserIds: [actorA, actorB],
  parameters: [
    { name: 'amount', type: 'number', required: true },
    { name: 'enabled', type: 'boolean', required: false },
    { name: 'note', type: 'string', required: false },
    { name: 'code', type: 'string', required: true },
    { name: 'empty', type: 'string', required: false }
  ],
  enabled: true,
  maxRows: 200,
  timeoutMs: 10000,
  updatedAt: '2026-11-01T00:00:00Z'
}
const secondary: SqlQueryApiDefinition = {
  ...definition,
  id: '00000000-0000-4000-8000-000000000076',
  slug: 'other-parameter-presets',
  name: '另一个参数 API'
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

function deferred() {
  let release!: () => void
  const wait = new Promise<void>((resolve) => {
    release = resolve
  })
  return { wait, release }
}

const picker = (page: Page) => page.getByRole('region', { name: 'API 参数方案', exact: true })
const saveDialog = (page: Page) => page.getByRole('dialog', { name: '保存参数方案', exact: true })
const preview = (page: Page) => page.getByRole('dialog', { name: '参数方案详情', exact: true })
const field = (drawer: Locator, name: string) =>
  drawer.getByRole('textbox', { name: `API 参数 ${name}`, exact: true })
const applyButton = (page: Page, name: string) =>
  picker(page).getByRole('button', { name: `填入参数方案 ${name}`, exact: true })

async function openPicker(page: Page, drawer: Locator) {
  if (!(await picker(page).isVisible()))
    await drawer.getByRole('button', { name: '参数方案', exact: true }).click()
  await expect(picker(page)).toBeVisible()
  return picker(page)
}

async function closePicker(page: Page) {
  if (await picker(page).isVisible())
    await picker(page).getByRole('button', { name: '关闭参数方案', exact: true }).click()
}

async function setBoolean(page: Page, drawer: Locator, value: boolean) {
  await drawer.getByRole('combobox', { name: 'API 参数 enabled', exact: true }).click()
  await page.getByRole('option', { name: String(value), exact: true }).click()
}

async function beginSave(page: Page, drawer: Locator, name: string) {
  await openPicker(page, drawer)
  await picker(page).getByRole('button', { name: '保存当前参数', exact: true }).click()
  await expect(saveDialog(page)).toBeVisible()
  await saveDialog(page).getByRole('textbox', { name: '方案名称', exact: true }).fill(name)
  return saveDialog(page)
}

async function save(page: Page, drawer: Locator, name: string) {
  const dialog = await beginSave(page, drawer, name)
  await dialog.getByRole('button', { name: '保存方案', exact: true }).click()
  await expect(dialog).toBeHidden()
  await openPicker(page, drawer)
  await expect(applyButton(page, name)).toBeEnabled()
  await closePicker(page)
}

async function showValues(page: Page, drawer: Locator, name: string) {
  await openPicker(page, drawer)
  await picker(page)
    .getByRole('button', { name: `查看参数方案 ${name}`, exact: true })
    .click()
  await expect(preview(page)).toBeVisible()
  const text = await preview(page).locator('pre[aria-label="单元格内容代码"] code').textContent()
  const values: unknown = JSON.parse(text || 'null')
  await preview(page).getByRole('button', { name: '关闭', exact: true }).last().click()
  await expect(preview(page)).toBeHidden()
  return values
}

/** Discover the genuinely saved local entry, without coupling to its key encoding. */
async function savedEntry(page: Page, name: string) {
  const records = await page.evaluate((name) => {
    const marker = JSON.stringify(name)
    return Object.entries(localStorage)
      .filter(([, value]) => value.includes(marker))
      .map(([key, value]) => ({ key, value }))
  }, name)
  expect(records, 'Exactly one personal preset store contains the saved name').toHaveLength(1)
  return records[0]
}

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
  const state = {
    definitions: [structuredClone(definition), structuredClone(secondary)],
    lists: 0,
    invokes: [] as Record<string, unknown>[],
    mutations: [] as Record<string, unknown>[],
    invocationWait: undefined as Promise<void> | undefined
  }
  await page.route('**/functions/v1/execute-sql-with-columns', (route) =>
    route.fulfill({
      json: { schemas: [], tables: [], columns: [], functions: [], foreignKeys: [] }
    })
  )
  await page.route('**/functions/v1/sql-query-api**', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>
    if (body.action === 'list') {
      state.lists++
      return route.fulfill({
        json: { definitions: state.definitions, canManage: !ordinary, users: [] }
      })
    }
    if (body.action) {
      state.mutations.push(body)
      return route.fulfill({ status: 400, json: { message: '个人方案不应调用服务端写操作' } })
    }
    state.invokes.push(body)
    await state.invocationWait
    return route.fulfill({
      json: {
        status: 'ok',
        rows: [{ label: '显式调用的结果' }],
        columns: [{ name: 'label' }],
        rowCount: 1,
        durationMs: 3,
        truncated: false,
        maxRows: 200,
        timeoutMs: 10000
      }
    })
  })
  const drawer = page.getByRole('dialog', { name: '查询 API', exact: true })
  const open = async () => {
    await page.getByRole('button', { name: '查询 API', exact: true }).click()
    await expect(drawer).toBeVisible()
    await expect(drawer.getByRole('button', { name: '参数方案', exact: true })).toBeEnabled()
  }
  const navigate = async (actor = actorA, tenant = tenantA, asOrdinary = ordinary) => {
    await page.goto(
      `/tests/e2e/fixtures/sql-console-metadata.html?actor=${actor}&tenant=${tenant}${asOrdinary ? '&ordinary=1' : ''}`
    )
    await expect(page.locator('.monaco-editor')).toBeVisible()
    await assertAppearance(page, appearance)
    await open()
  }
  const refresh = async () => {
    const previous = state.lists
    await drawer.getByRole('button', { name: '刷新 API', exact: true }).click()
    await expect.poll(() => state.lists).toBe(previous + 1)
    await expect(drawer.getByRole('button', { name: '刷新 API', exact: true })).toBeEnabled()
  }
  await navigate()
  return { state, drawer, open, navigate, refresh }
}

test('ordinary users save partial precise parameters, preview, fill, explicitly update and forget without hidden calls', async ({
  page
}, info) => {
  const { state, drawer } = await prepare(page, info.project.name)
  await expect(drawer.getByRole('button', { name: '新建查询 API', exact: true })).toHaveCount(0)
  await field(drawer, 'amount').fill(precise)
  await setBoolean(page, drawer, false)
  await field(drawer, 'note').fill('   ')
  await save(page, drawer, '精确金额方案')
  await openPicker(page, drawer)
  await page.screenshot({
    path: info.outputPath('api-presets-desktop.png'),
    animations: 'disabled'
  })
  await closePicker(page)
  expect(await showValues(page, drawer, '精确金额方案')).toEqual({
    amount: precise,
    enabled: false,
    note: '   '
  })
  const stored = await savedEntry(page, '精确金额方案')
  expect(stored.value).toContain(precise)
  expect(stored.value).not.toContain('test-signature')
  const duplicate = await beginSave(page, drawer, '精确金额方案')
  await page.screenshot({
    path: info.outputPath('api-presets-save-dialog.png'),
    animations: 'disabled'
  })
  await duplicate.getByRole('button', { name: '保存方案', exact: true }).click()
  await expect(duplicate).toBeVisible()
  await expect(page.getByText(/同名|名称.*重复|名称已存在|重名/).last()).toBeVisible()
  await duplicate.getByRole('button', { name: '取消', exact: true }).last().click()
  await field(drawer, 'amount').fill('9.01')
  await setBoolean(page, drawer, true)
  await field(drawer, 'note').fill('later')
  await field(drawer, 'code').fill('should-clear')
  await field(drawer, 'empty').fill('should-clear')
  await openPicker(page, drawer)
  await applyButton(page, '精确金额方案').click()
  await expect(field(drawer, 'amount')).toHaveValue(precise)
  await expect(field(drawer, 'note')).toHaveValue('   ')
  await expect(field(drawer, 'code')).toHaveValue('')
  await expect(field(drawer, 'empty')).toHaveValue('')
  expect(state.invokes).toHaveLength(0)
  await field(drawer, 'code').fill('MANUAL')
  await drawer.getByRole('button', { name: '调用 API', exact: true }).click()
  await expect(drawer.locator('.result-table-container')).toContainText('显式调用的结果')
  expect(state.invokes).toHaveLength(1)
  expect(state.invokes[0].params).toEqual({
    amount: precise,
    enabled: false,
    note: '   ',
    code: 'MANUAL'
  })
  await field(drawer, 'amount').fill('9.01')
  await field(drawer, 'note').fill('updated')
  await openPicker(page, drawer)
  await picker(page)
    .getByRole('button', { name: '用当前参数更新方案 精确金额方案', exact: true })
    .click()
  expect(await showValues(page, drawer, '精确金额方案')).toEqual({
    amount: '9.01',
    enabled: false,
    note: 'updated',
    code: 'MANUAL'
  })
  await openPicker(page, drawer)
  await picker(page)
    .getByRole('button', { name: '取消保存参数方案 精确金额方案', exact: true })
    .click()
  await expect(applyButton(page, '精确金额方案')).toHaveCount(0)
  await expect(field(drawer, 'amount')).toHaveValue('9.01')
  expect(state.invokes).toHaveLength(1)
  expect(state.mutations).toEqual([])
})

test('saved schemes survive reload and remain isolated by API, account and role while forged ordinary scope is ignored', async ({
  page
}, info) => {
  const { state, drawer, navigate, open } = await prepare(page, info.project.name)
  await field(drawer, 'amount').fill(precise)
  await save(page, drawer, '只属于当前身份')
  await page.reload()
  await open()
  await expect(field(drawer, 'amount')).toHaveValue('')
  await openPicker(page, drawer)
  await expect(applyButton(page, '只属于当前身份')).toBeEnabled()
  await page.evaluate((tenant) => {
    window.dispatchEvent(new CustomEvent('sql-preview-tenant-change', { detail: tenant }))
  }, tenantB)
  await expect(applyButton(page, '只属于当前身份')).toBeEnabled()
  await closePicker(page)
  await drawer
    .getByRole('navigation', { name: '查询 API 列表', exact: true })
    .getByRole('button', { name: /另一个参数 API/ })
    .click()
  await openPicker(page, drawer)
  await expect(applyButton(page, '只属于当前身份')).toHaveCount(0)
  await navigate(actorB)
  await openPicker(page, drawer)
  await expect(applyButton(page, '只属于当前身份')).toHaveCount(0)
  await navigate(actorA, tenantA, false)
  await openPicker(page, drawer)
  await expect(applyButton(page, '只属于当前身份')).toHaveCount(0)
  await closePicker(page)
  await field(drawer, 'amount').fill('500.00')
  await save(page, drawer, '平台具体范围')
  const selectedStore = await savedEntry(page, '平台具体范围')
  // Both the selected tenant and platform-all may legitimately list this API.
  await page.evaluate(async () => {
    const path = '/src/store/modules/tenant-scope.ts'
    const { useTenantScopeStore } = (await import(
      path
    )) as typeof import('../../src/store/modules/tenant-scope')
    useTenantScopeStore().selectedTenantId = null
  })
  await expect(drawer).toBeHidden()
  await open()
  await openPicker(page, drawer)
  await expect(applyButton(page, '平台具体范围')).toHaveCount(0)
  await closePicker(page)
  await field(drawer, 'amount').fill('900.00')
  await save(page, drawer, '平台全部范围')
  const allStore = await savedEntry(page, '平台全部范围')
  expect(allStore.key).not.toBe(selectedStore.key)
  await page.evaluate((tenant) => {
    window.dispatchEvent(new CustomEvent('sql-preview-tenant-change', { detail: tenant }))
  }, tenantA)
  await expect(drawer).toBeHidden()
  await open()
  await openPicker(page, drawer)
  await expect(applyButton(page, '平台具体范围')).toBeEnabled()
  await expect(applyButton(page, '平台全部范围')).toHaveCount(0)
  await navigate()
  await openPicker(page, drawer)
  await expect(applyButton(page, '只属于当前身份')).toBeEnabled()
  await applyButton(page, '只属于当前身份').click()
  await expect(field(drawer, 'amount')).toHaveValue(precise)
  expect(state.invokes).toEqual([])
  expect(state.mutations).toEqual([])
})

test('sorted parameter signatures tolerate reordering and version updates but changed definitions require an explicit update', async ({
  page
}, info) => {
  const { state, drawer, refresh } = await prepare(page, info.project.name)
  await field(drawer, 'amount').fill(precise)
  await save(page, drawer, '定义兼容方案')
  state.definitions[0].parameters.reverse()
  await refresh()
  await openPicker(page, drawer)
  await expect(applyButton(page, '定义兼容方案')).toBeEnabled()
  await closePicker(page)
  state.definitions[0].updatedAt = '2026-11-02T00:00:00Z'
  await refresh()
  await openPicker(page, drawer)
  await expect(applyButton(page, '定义兼容方案')).toBeEnabled()
  await expect(picker(page)).toContainText(/API 已更新.*核对/)
  await applyButton(page, '定义兼容方案').click()
  await expect(field(drawer, 'amount')).toHaveValue(precise)
  state.definitions[0].parameters = state.definitions[0].parameters.map((parameter) =>
    parameter.name === 'code' ? { ...parameter, required: false } : parameter
  )
  await refresh()
  await openPicker(page, drawer)
  await expect(applyButton(page, '定义兼容方案')).toBeDisabled()
  await expect(picker(page)).toContainText('参数定义已变化，请核对后重新保存')
  await closePicker(page)
  await field(drawer, 'amount').fill('20.0000000000000000001')
  await openPicker(page, drawer)
  await picker(page)
    .getByRole('button', { name: '用当前参数更新方案 定义兼容方案', exact: true })
    .click()
  await expect(applyButton(page, '定义兼容方案')).toBeEnabled()
  await expect(picker(page)).not.toContainText('参数定义已变化，请核对后重新保存')
  await applyButton(page, '定义兼容方案').click()
  await expect(field(drawer, 'amount')).toHaveValue('20.0000000000000000001')
  expect(state.invokes).toEqual([])
  expect(state.mutations).toEqual([])
})

test('browser quota and blocked writes preserve inputs and existing schemes without reporting a false save', async ({
  page
}, info) => {
  const { state, drawer } = await prepare(page, info.project.name)
  await field(drawer, 'amount').fill('1.50')
  await save(page, drawer, '仍可使用的旧方案')
  const stored = await savedEntry(page, '仍可使用的旧方案')
  for (const [errorName, failedName] of [
    ['SecurityError', '受限而未保存的方案'],
    ['QuotaExceededError', '超限而未保存的方案']
  ]) {
    await page.evaluate(
      ({ key, errorName }) => {
        const native = Storage.prototype.setItem
        Object.defineProperty(Storage.prototype, 'setItem', {
          configurable: true,
          value(this: Storage, nextKey: string, value: string) {
            if (nextKey === key)
              throw new DOMException('Simulated local storage failure', errorName)
            return native.call(this, nextKey, value)
          }
        })
        window.addEventListener(
          'sql-preset-storage-unblock',
          () => {
            Object.defineProperty(Storage.prototype, 'setItem', {
              configurable: true,
              value: native
            })
          },
          { once: true }
        )
      },
      { key: stored.key, errorName }
    )
    await field(drawer, 'amount').fill(precise)
    const dialog = await beginSave(page, drawer, failedName)
    await dialog.getByRole('button', { name: '保存方案', exact: true }).click()
    await expect(dialog).toBeVisible()
    await expect(dialog).not.toContainText('Simulated local storage failure')
    await expect(field(drawer, 'amount')).toHaveValue(precise)
    expect(await page.evaluate((key) => localStorage.getItem(key), stored.key)).toBe(stored.value)
    await dialog.getByRole('button', { name: '取消', exact: true }).last().click()
    await openPicker(page, drawer)
    await expect(picker(page)).not.toContainText('Simulated local storage failure')
    await expect(applyButton(page, failedName)).toHaveCount(0)
    await expect(applyButton(page, '仍可使用的旧方案')).toBeEnabled()
    await expect(
      picker(page).getByRole('button', {
        name: '取消保存参数方案 仍可使用的旧方案',
        exact: true
      })
    ).toBeEnabled()
    await closePicker(page)
    await page.evaluate(() => window.dispatchEvent(new Event('sql-preset-storage-unblock')))
  }
  await openPicker(page, drawer)
  await picker(page)
    .getByRole('button', {
      name: '取消保存参数方案 仍可使用的旧方案',
      exact: true
    })
    .click()
  await expect(applyButton(page, '仍可使用的旧方案')).toHaveCount(0)
  await expect(field(drawer, 'amount')).toHaveValue(precise)
  expect(state.invokes).toEqual([])
  expect(state.mutations).toEqual([])
})

test('corrupted local data explains recovery and re-reading a repaired store preserves current inputs', async ({
  page
}, info) => {
  const { state, drawer, open } = await prepare(page, info.project.name)
  await field(drawer, 'amount').fill('1.50')
  await save(page, drawer, '损坏前有效方案')
  const stored = await savedEntry(page, '损坏前有效方案')
  await page.evaluate((key) => localStorage.setItem(key, '{invalid-json'), stored.key)
  await page.reload()
  await open()
  await field(drawer, 'amount').fill(precise)
  await openPicker(page, drawer)
  await expect(applyButton(page, '损坏前有效方案')).toHaveCount(0)
  await expect(picker(page)).toContainText(/损坏|读取|无法/)
  await expect(
    picker(page).getByRole('button', { name: '重新读取方案', exact: true })
  ).toBeEnabled()
  await expect(
    picker(page).getByRole('button', {
      name: '重置此 API 的本机方案',
      exact: true
    })
  ).toBeEnabled()
  expect(await page.evaluate((key) => localStorage.getItem(key), stored.key)).toBe('{invalid-json')
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), stored)
  await picker(page).getByRole('button', { name: '重新读取方案', exact: true }).click()
  await expect(applyButton(page, '损坏前有效方案')).toBeEnabled()
  await expect(field(drawer, 'amount')).toHaveValue(precise)
  expect(state.invokes).toEqual([])
  expect(state.mutations).toEqual([])
})

test('same-tick tenant ABA invalidates pending save, picker and value preview without writing another owner', async ({
  page
}, info) => {
  const { state, drawer, open } = await prepare(page, info.project.name, false)
  await field(drawer, 'amount').fill('11.00')
  await save(page, drawer, '既有方案')
  await beginSave(page, drawer, '迟到的旧方案')
  const changeScope = () =>
    page.evaluate(
      ([away, back]) => {
        window.dispatchEvent(new CustomEvent('sql-preview-tenant-change', { detail: away }))
        window.dispatchEvent(new CustomEvent('sql-preview-tenant-change', { detail: back }))
      },
      [tenantB, tenantA]
    )
  await changeScope()
  await expect(saveDialog(page)).toBeHidden()
  await expect(picker(page)).toBeHidden()
  await expect(drawer).toBeHidden()
  await open()
  await openPicker(page, drawer)
  await expect(applyButton(page, '迟到的旧方案')).toHaveCount(0)
  await expect(applyButton(page, '既有方案')).toBeEnabled()
  await picker(page).getByRole('button', { name: '查看参数方案 既有方案', exact: true }).click()
  await expect(preview(page)).toBeVisible()
  await changeScope()
  await expect(preview(page)).toBeHidden()
  await expect(drawer).toBeHidden()
  await open()
  await expect(field(drawer, 'amount')).toHaveValue('')
  await openPicker(page, drawer)
  await expect(applyButton(page, '既有方案')).toBeEnabled()
  expect(state.invokes).toEqual([])
  expect(state.mutations).toEqual([])
})

test('resetting corrupt data confirms intent, preserves repaired data and invalidates across tenant ABA', async ({
  page
}, info) => {
  const { state, drawer, open } = await prepare(page, info.project.name, false)
  await field(drawer, 'amount').fill('1.50')
  await save(page, drawer, '重置保护方案')
  const stored = await savedEntry(page, '重置保护方案')
  await drawer
    .getByRole('navigation', { name: '查询 API 列表', exact: true })
    .getByRole('button', { name: /另一个参数 API/ })
    .click()
  await field(drawer, 'amount').fill('2.50')
  await save(page, drawer, '另一个 API 应保留')
  const untouched = await savedEntry(page, '另一个 API 应保留')
  const confirmation = page.getByRole('dialog', { name: '重置本机参数方案', exact: true })
  const corruptAndOpen = async (raw: string) => {
    await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: stored.key, raw })
    await page.reload()
    await open()
    await field(drawer, 'amount').fill(precise)
    await openPicker(page, drawer)
    await expect(
      picker(page).getByRole('button', {
        name: '重置此 API 的本机方案',
        exact: true
      })
    ).toBeEnabled()
  }
  const requestReset = async () => {
    await openPicker(page, drawer)
    await picker(page)
      .getByRole('button', {
        name: '重置此 API 的本机方案',
        exact: true
      })
      .click()
    await expect(confirmation).toBeVisible()
  }
  const originalCorruption = '{invalid-reset-cancel'
  await corruptAndOpen(originalCorruption)
  await page.screenshot({
    path: info.outputPath('api-presets-recovery.png'),
    animations: 'disabled'
  })
  await requestReset()
  await confirmation.getByRole('button', { name: '取消', exact: true }).click()
  await expect(confirmation).toBeHidden()
  // The confirmation click is outside the popover; wait for its scheduled close.
  await expect(picker(page)).toBeHidden()
  expect(await page.evaluate((key) => localStorage.getItem(key), stored.key)).toBe(
    originalCorruption
  )
  await expect(field(drawer, 'amount')).toHaveValue(precise)

  // The picker still displays its earlier read failure: this native same-tab
  // write intentionally sends no StorageEvent to the mounted component.
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), stored)
  await openPicker(page, drawer)
  await picker(page).getByRole('button', { name: '重置此 API 的本机方案', exact: true }).click()
  await expect(
    page.getByText('本机参数方案已恢复，请重新读取后继续使用', { exact: true })
  ).toBeVisible()
  await expect(confirmation).toBeHidden()
  expect(await page.evaluate((key) => localStorage.getItem(key), stored.key)).toBe(stored.value)
  await openPicker(page, drawer)
  await expect(applyButton(page, '重置保护方案')).toBeEnabled()
  await expect(field(drawer, 'amount')).toHaveValue(precise)
  await closePicker(page)

  await corruptAndOpen('{invalid-reset-pending-repair')
  await requestReset()
  // Another tab repairs the raw storage while confirmation is pending.
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), stored)
  await confirmation.getByRole('button', { name: '重置本机方案', exact: true }).click()
  await expect(confirmation).toBeHidden()
  await expect(picker(page)).toBeHidden()
  await expect(
    page.getByText('方案已在其他页面更新，请重新读取后再操作', { exact: true })
  ).toBeVisible()
  expect(await page.evaluate((key) => localStorage.getItem(key), stored.key)).toBe(stored.value)
  await openPicker(page, drawer)
  await expect(applyButton(page, '重置保护方案')).toBeEnabled()
  await expect(field(drawer, 'amount')).toHaveValue(precise)
  await closePicker(page)

  await corruptAndOpen('{invalid-reset-confirm')
  await requestReset()
  await confirmation.getByRole('button', { name: '重置本机方案', exact: true }).click()
  await expect(confirmation).toBeHidden()
  await expect(picker(page)).toBeHidden()
  await openPicker(page, drawer)
  await expect(applyButton(page, '重置保护方案')).toHaveCount(0)
  await expect(picker(page)).toContainText('暂无参数方案')
  await expect(
    picker(page).getByRole('button', {
      name: '重置此 API 的本机方案',
      exact: true
    })
  ).toHaveCount(0)
  const resetRaw = await page.evaluate((key) => localStorage.getItem(key), stored.key)
  if (resetRaw !== null) expect(JSON.parse(resetRaw)).toMatchObject({ version: 2, presets: [] })
  expect(await page.evaluate((key) => localStorage.getItem(key), untouched.key)).toBe(
    untouched.value
  )
  await expect(field(drawer, 'amount')).toHaveValue(precise)
  await closePicker(page)

  await save(page, drawer, '失效确认前的方案')
  await corruptAndOpen('{invalid-reset-owner')
  await requestReset()
  await page.evaluate(
    ([away, back]) => {
      window.dispatchEvent(new CustomEvent('sql-preview-tenant-change', { detail: away }))
      window.dispatchEvent(new CustomEvent('sql-preview-tenant-change', { detail: back }))
    },
    [tenantB, tenantA]
  )
  await expect(drawer).toBeHidden()
  if (await confirmation.isVisible())
    await confirmation.getByRole('button', { name: '重置本机方案', exact: true }).click()
  await expect(confirmation).toBeHidden()
  expect(await page.evaluate((key) => localStorage.getItem(key), stored.key)).toBe(
    '{invalid-reset-owner'
  )
  expect(await page.evaluate((key) => localStorage.getItem(key), untouched.key)).toBe(
    untouched.value
  )
  expect(state.invokes).toEqual([])
  expect(state.mutations).toEqual([])
})

test('calling disables personal scheme actions and narrow themed controls remain readable and keyboard operable', async ({
  page
}, info) => {
  const { state, drawer } = await prepare(page, info.project.name)
  await field(drawer, 'amount').fill(precise)
  await field(drawer, 'code').fill('MANUAL')
  await save(page, drawer, '窄屏参数方案')
  await openPicker(page, drawer)
  const gate = deferred()
  state.invocationWait = gate.wait
  try {
    await drawer.getByRole('button', { name: '调用 API', exact: true }).click()
    await expect.poll(() => state.invokes.length).toBe(1)
    await expect(picker(page)).toBeHidden()
    await expect(drawer.getByRole('button', { name: '参数方案', exact: true })).toBeDisabled()
  } finally {
    gate.release()
  }
  await expect(drawer.getByRole('button', { name: '参数方案', exact: true })).toBeEnabled()
  await expect(drawer.locator('.result-table-container')).toContainText('显式调用的结果')
  await page.setViewportSize({ width: 390, height: 844 })
  const trigger = drawer.getByRole('button', { name: '参数方案', exact: true })
  await trigger.scrollIntoViewIfNeeded()
  await trigger.focus()
  await page.keyboard.press('Enter')
  await expect(picker(page)).toBeVisible()
  for (const button of await picker(page).getByRole('button').all()) {
    await button.scrollIntoViewIfNeeded()
    await expect(button).toBeInViewport({ ratio: 0.99 })
    const box = await button.boundingBox()
    expect(box?.height).toBeGreaterThanOrEqual(24)
    expect(box?.width).toBeGreaterThanOrEqual(24)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
  await page.screenshot({ path: info.outputPath('api-presets-narrow.png'), animations: 'disabled' })
  await applyButton(page, '窄屏参数方案').focus()
  await page.keyboard.press('Enter')
  await expect(picker(page)).toBeHidden()
  await expect(field(drawer, 'amount')).toHaveValue(precise)
  expect(state.invokes).toHaveLength(1)
  expect(state.mutations).toEqual([])
})
