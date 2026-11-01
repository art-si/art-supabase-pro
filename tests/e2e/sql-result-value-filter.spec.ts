import { expect, test, type Locator, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { prepareIsolatedSession } from './support/isolated-session'
import { assertAppearance, prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

const runtimeErrorsByPage = new WeakMap<Page, string[]>()
test.beforeEach(({ page }) => {
  const errors: string[] = []
  runtimeErrorsByPage.set(page, errors)
  page.on('pageerror', (error) => errors.push(error.message))
})
test.afterEach(({ page }) => {
  expect(runtimeErrorsByPage.get(page) ?? [], 'Unhandled page runtime errors').toEqual([])
})

const tenantA = '00000000-0000-4000-8000-000000000001'
const tenantB = '00000000-0000-4000-8000-000000000002'
const actor = '00000000-0000-4000-8000-000000000003'
const precise = '12345678901234567890.1234567890123456789'

interface ResultFixture {
  columns: { name: string; type?: string }[]
  rows: Record<string, unknown>[]
  truncated?: boolean
}

const scalarResult: ResultFixture = {
  columns: [
    { name: 'label', type: 'text' },
    { name: 'value', type: 'numeric' }
  ],
  rows: [
    { label: 'case-string', value: '1' },
    { label: 'case-number', value: 1 },
    { label: 'case-precise', value: precise },
    { label: 'case-adjacent', value: '12345678901234567890.1234567890123456788' },
    { label: 'case-null', value: null },
    { label: 'case-empty', value: '' },
    { label: 'case-whitespace', value: '   ' },
    { label: 'case-text-null', value: 'NULL' },
    { label: 'case-json-text', value: '\ntrue\n' },
    { label: 'case-missing' }
  ]
}

async function prepare(page: Page, project: string, initial: ResultFixture, ordinary = false) {
  page.setDefaultTimeout(15_000)
  page.setDefaultNavigationTimeout(60_000)
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
  const state = {
    result: initial,
    executions: 0,
    invokes: 0,
    requests: 0,
    replyReady: undefined as Promise<void> | undefined
  }
  await page.route('**/functions/v1/execute-sql-with-columns', async (route) => {
    state.requests++
    if ((route.request().postDataJSON() as { action?: string }).action === 'metadata')
      return route.fulfill({
        json: { schemas: [], tables: [], columns: [], functions: [], foreignKeys: [] }
      })
    state.executions++
    if (state.replyReady) await state.replyReady
    return route.fulfill({
      json: {
        status: 'ok',
        truncated: false,
        ...state.result,
        rowCount: state.result.rows.length,
        durationMs: 1,
        commandTag: 'SELECT'
      }
    })
  })
  await page.route('**/functions/v1/sql-query-api**', (route) => {
    state.requests++
    if ((route.request().postDataJSON() as { action?: string }).action === 'list')
      return route.fulfill({
        json: {
          canManage: false,
          users: [],
          definitions: [
            {
              id: '00000000-0000-4000-8000-000000000004',
              slug: 'raw-value-view',
              name: '本租户原值查询',
              description: '隔离测试授权接口',
              sql: '',
              tenantId: tenantA,
              allowedUserIds: [actor],
              parameters: [],
              enabled: true,
              maxRows: 200,
              timeoutMs: 5000,
              updatedAt: '2026-10-31T00:00:00Z'
            }
          ]
        }
      })
    state.invokes++
    return route.fulfill({
      json: {
        status: 'ok',
        truncated: false,
        ...state.result,
        rowCount: state.result.rows.length,
        durationMs: 1,
        maxRows: 200,
        timeoutMs: 5000
      }
    })
  })
  await page.goto(
    `/tests/e2e/fixtures/sql-console-metadata.html?actor=${actor}&tenant=${tenantA}${ordinary ? '&ordinary=1' : ''}`
  )
  await assertAppearance(page, appearance)
  await expect(page.locator('.monaco-editor')).toBeVisible()
  const collapse = page.getByRole('button', { name: '收起数据库资源', exact: true }).first()
  if (await collapse.isVisible()) await collapse.click()
  let grid = page.locator('.result-table-container')
  if (ordinary) {
    await expect(page.getByRole('button', { name: '执行 SQL', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: '查询 API', exact: true }).click()
    grid = page
      .getByRole('dialog', { name: '查询 API', exact: true })
      .locator('.result-table-container')
  }
  const execute = async (result = state.result) => {
    state.result = result
    await page
      .getByRole('button', { name: ordinary ? '调用 API' : '执行 SQL', exact: true })
      .click()
    await expect(grid).toContainText(`本次已加载 ${result.rows.length} 行`)
    await expect(
      page.getByRole('button', { name: ordinary ? '调用 API' : '执行 SQL', exact: true })
    ).toBeEnabled()
  }
  await execute()
  return { state, execute, grid }
}

const filters = (grid: Locator) => grid.getByRole('region', { name: '原值筛选条件', exact: true })
const search = (grid: Locator) => grid.getByRole('textbox', { name: '搜索已加载结果', exact: true })

async function cell(grid: Locator, label: string, field: string) {
  const keys = await grid
    .locator('.el-table-v2__main .el-table-v2__header-cell')
    .evaluateAll((headers) => headers.map((header) => header.getAttribute('data-key')))
  const index = keys.indexOf(field)
  expect(index, `Visible result field ${field}`).toBeGreaterThanOrEqual(0)
  const target = grid
    .locator('.el-table-v2__main .el-table-v2__row')
    .filter({ has: grid.page().getByText(label, { exact: true }) })
    .locator('.el-table-v2__row-cell')
    .nth(index)
  await target.scrollIntoViewIfNeeded()
  return target
}

async function openMenu(page: Page, grid: Locator, label: string, field: string) {
  await (await cell(grid, label, field)).click({ button: 'right' })
  const menu = page
    .getByRole('menu')
    .filter({ has: page.getByRole('menuitem', { name: '复制', exact: true }) })
  await expect(menu).toBeVisible()
  return menu
}

async function addFilter(
  page: Page,
  grid: Locator,
  label: string,
  field: string,
  mode: 'keep' | 'exclude' = 'keep',
  nullValue = false
) {
  const menu = await openMenu(page, grid, label, field)
  const name = nullValue
    ? mode === 'keep'
      ? '仅保留 NULL'
      : '排除 NULL'
    : mode === 'keep'
      ? '仅保留相同原值'
      : '排除此原值'
  await menu.getByRole('menuitem', { name, exact: true }).click()
  await expect(filters(grid)).toBeVisible()
}

async function renderedLabels(grid: Locator) {
  return grid
    .locator('.el-table-v2__main .el-table-v2__row')
    .evaluateAll((rows) =>
      rows.map((row) => row.querySelector('.el-table-v2__row-cell')?.textContent?.trim())
    )
}

async function expectVisibleRows(grid: Locator, labels: string[]) {
  for (const label of labels)
    await expect(
      grid
        .locator('.el-table-v2__main .el-table-v2__row')
        .filter({ has: grid.page().getByText(label, { exact: true }) })
    ).toBeInViewport({ ratio: 1 })
}

async function clearFilters(grid: Locator) {
  await filters(grid).getByRole('button', { name: '清除原值筛选', exact: true }).click()
  await expect(filters(grid)).toHaveCount(0)
}

async function openColumns(page: Page, grid: Locator) {
  await grid.getByRole('button', { name: '设置显示列', exact: true }).click()
  const popup = page.locator('.el-popover:visible').filter({
    has: page.getByRole('group', { name: '列显示预设', exact: true })
  })
  await expect(popup).toBeVisible()
  return popup
}

test('raw scalar filters distinguish JS types, exact decimals, NULL, empty and whitespace strings', async ({
  page
}, info) => {
  const { grid, state } = await prepare(page, info.project.name, scalarResult)
  const requests = state.requests
  for (const label of [
    'case-string',
    'case-number',
    'case-precise',
    'case-null',
    'case-empty',
    'case-whitespace',
    'case-text-null',
    'case-json-text'
  ]) {
    await search(grid).fill(label)
    await addFilter(page, grid, label, 'value', 'keep', label === 'case-null')
    await search(grid).clear()
    await expect(grid.locator('.sql-result-tools')).toContainText('匹配 1 行')
    await expect.poll(() => renderedLabels(grid)).toEqual([label])
    if (['case-precise', 'case-whitespace', 'case-json-text'].includes(label)) {
      await filters(grid).getByRole('button', { name: '查看筛选原值 value', exact: true }).click()
      const detail = page.getByRole('dialog', { name: '单元格详情', exact: true })
      await expect
        .poll(() => detail.locator('code').textContent())
        .toBe(label === 'case-precise' ? precise : label === 'case-whitespace' ? '   ' : '\ntrue\n')
      await detail.getByRole('button', { name: '关闭', exact: true }).last().click()
    }
    await clearFilters(grid)
  }
  await search(grid).fill('case-null')
  await addFilter(page, grid, 'case-null', 'value', 'exclude', true)
  await search(grid).clear()
  await expect(grid.locator('.sql-result-tools')).toContainText('匹配 9 行')
  await expect(grid.locator('.el-pagination')).toContainText('9')
  await search(grid).fill('case-missing')
  await expect(grid.locator('.sql-result-tools')).toContainText('匹配 1 行')
  await expect.poll(() => renderedLabels(grid)).toEqual(['case-missing'])
  expect(state.requests).toBe(requests)
  expect(state.executions).toBe(1)
})

test('AND filters reset pages before sorting and copying all matches while export, profile and chart retain original rows', async ({
  page
}, info) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  const original: ResultFixture = {
    columns: [
      { name: 'label', type: 'text' },
      { name: 'group', type: 'text' },
      { name: 'status', type: 'text' },
      { name: 'amount', type: 'numeric' }
    ],
    truncated: true,
    rows: Array.from({ length: 125 }, (_, index) => ({
      label: `batch-${String(index + 1).padStart(3, '0')}`,
      group: index < 80 ? 'selected' : 'other',
      status: index % 8 === 0 ? 'skip' : 'keep',
      amount: `${125 - index}.0000000000000000001`
    }))
  }
  const { grid, state } = await prepare(page, info.project.name, original)
  await addFilter(page, grid, 'batch-001', 'group')
  await expect(grid.locator('.sql-result-tools')).toContainText('匹配 80 行')
  await grid.locator('.el-pagination .btn-next').click()
  await expect(grid.locator('.el-pagination .el-pager .is-active')).toHaveText('2')
  await addFilter(page, grid, 'batch-052', 'status')
  await expect(grid.locator('.sql-result-tools')).toContainText('匹配 70 行')
  await expect(grid.locator('.el-pagination .el-pager .is-active')).toHaveText('1')
  await grid.getByRole('button', { name: /^排序 amount：/ }).click()
  await expect
    .poll(async () => (await renderedLabels(grid)).slice(0, 2))
    .toEqual(['batch-080', 'batch-079'])
  await grid.locator('.el-pagination .btn-next').click()
  await grid.getByRole('button', { name: '复制当前结果视图', exact: true }).click()
  const copy = page.getByRole('region', { name: '复制结果视图', exact: true })
  await expect(copy).toContainText('当前匹配 70 行')
  await copy.getByRole('button', { name: '复制表格', exact: true }).click()
  await expect(page.locator('.el-message--success').last()).toContainText('70 行 / 4 列')
  await page.bringToFront()
  const copied = await page.evaluate(async () => {
    const item = (await navigator.clipboard.read())[0]
    const html = await (await item.getType('text/html')).text()
    const doc = new DOMParser().parseFromString(html, 'text/html')
    return [...doc.querySelectorAll('tbody tr')].map((row) =>
      [...row.querySelectorAll('td')].map((value) => value.textContent || '')
    )
  })
  expect(copied).toEqual(
    original.rows
      .slice(0, 80)
      .filter((row) => row.status === 'keep')
      .reverse()
      .map((row) => [row.label, row.group, row.status, row.amount])
  )
  if (await copy.isVisible())
    await copy.getByRole('button', { name: '关闭复制选项', exact: true }).click()
  const exportScope = page.locator('.result-section > .tabs-header')
  await exportScope.getByRole('button', { name: '导出查询结果', exact: true }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: '导出 JSON（保留类型）', exact: true }).click()
  const path = await (await download).path()
  if (!path) throw new Error('Raw result snapshot was not downloaded')
  const exported: unknown = JSON.parse(await readFile(path, 'utf8'))
  expect(exported).toMatchObject({ rowCount: 125, truncated: true })
  expect(exported).toHaveProperty(
    'rows.0.entries',
    expect.arrayContaining([['label', { type: 'string', value: 'batch-001' }]])
  )
  expect(exported).toHaveProperty(
    'rows.124.entries',
    expect.arrayContaining([['label', { type: 'string', value: 'batch-125' }]])
  )
  for (const name of ['字段统计', '结果图表']) {
    await grid.getByRole('button', { name, exact: true }).click()
    const drawer = page.getByRole('dialog', { name, exact: true })
    await expect(drawer).toContainText('本次已加载 125 行')
    await drawer.getByRole('button', { name: '返回结果表', exact: true }).click()
    await expect(drawer).toBeHidden()
  }
  expect(state.executions).toBe(1)
})

test('ordinary API search excludes tenant and undeclared data while literal keys and Vue flags retain own raw values', async ({
  page
}, info) => {
  const result: ResultFixture = {
    columns: ['label', 'literal.dot', '__proto__', '__v_raw', '__v_isRef', 'tenant_id'].map(
      (name) => ({ name })
    ),
    rows: [
      ['own-A', 'literal-A', 'proto-A', 'raw-A', false],
      ['own-B', 'literal-A', 'proto-B', 'raw-B', true],
      ['own-C', 'literal-C', 'proto-A', 'raw-C', false]
    ].map((values) =>
      Object.fromEntries([
        ...['label', 'literal.dot', '__proto__', '__v_raw', '__v_isRef'].map((key, index) => [
          key,
          values[index]
        ]),
        ['tenant_id', tenantA],
        ['undeclared_secret', 'never-search'],
        ['literal', { dot: 'not-the-literal-column' }]
      ])
    )
  }
  const { grid, state } = await prepare(page, info.project.name, result, true)
  for (const forbidden of [tenantA, 'never-search', 'not-the-literal-column']) {
    await search(grid).fill(forbidden)
    await expect(grid.locator('.sql-result-tools')).toContainText('匹配 0 行')
  }
  await search(grid).clear()
  await addFilter(page, grid, 'own-A', 'literal.dot')
  await expect(grid.locator('.sql-result-tools')).toContainText('匹配 2 行')
  let popup = await openColumns(page, grid)
  await expect(popup.getByRole('checkbox', { name: 'tenant_id', exact: true })).toHaveCount(0)
  await popup.getByText('literal.dot', { exact: true }).click()
  await popup.getByRole('button', { name: '关闭列设置', exact: true }).click()
  await expect(filters(grid)).toHaveCount(0)
  await search(grid).fill('literal-A')
  await expect(grid.locator('.sql-result-tools')).toContainText('匹配 2 行')
  await search(grid).clear()
  await addFilter(page, grid, 'own-A', '__proto__')
  await addFilter(page, grid, 'own-A', '__v_isRef')
  await addFilter(page, grid, 'own-A', '__v_raw')
  await expect.poll(() => renderedLabels(grid)).toEqual(['own-A'])
  const requests = state.requests
  await page.evaluate(
    (tenant) =>
      window.dispatchEvent(new CustomEvent('sql-preview-tenant-change', { detail: tenant })),
    tenantB
  )
  await expect(
    filters(grid).getByRole('button', { name: '查看筛选原值 __v_raw', exact: true })
  ).toBeVisible()
  await expect.poll(() => renderedLabels(grid)).toEqual(['own-A'])
  expect(state.requests).toBe(requests)
  expect(state.invokes).toBe(1)
  expect(state.executions).toBe(0)
  popup = await openColumns(page, grid)
  await expect(popup.getByRole('checkbox', { name: 'tenant_id', exact: true })).toHaveCount(0)
})

test('column hiding, edit entry, a new result and tenant ownership changes discard filters and stale menus', async ({
  page
}, info) => {
  const { grid, execute, state } = await prepare(page, info.project.name, scalarResult)
  await addFilter(page, grid, 'case-string', 'value')
  const popup = await openColumns(page, grid)
  await popup.getByText('value', { exact: true }).click()
  await popup.getByRole('button', { name: '关闭列设置', exact: true }).click()
  await expect(filters(grid)).toHaveCount(0)
  await grid.getByRole('button', { name: '重置列视图', exact: true }).click()
  await addFilter(page, grid, 'case-string', 'value')
  const editColumns = await openColumns(page, grid)
  await editColumns.getByText('value', { exact: true }).click()
  await editColumns.getByRole('button', { name: '关闭列设置', exact: true }).click()
  await expect(filters(grid)).toHaveCount(0)
  await addFilter(page, grid, 'case-string', 'label')
  await grid.getByRole('button', { name: '编辑副本', exact: true }).click()
  await expect(filters(grid)).toHaveCount(0)
  const editCell = grid.getByRole('button', { name: '编辑第 1 行 value', exact: true })
  await editCell.click({ button: 'right' })
  await expect(page.getByRole('menuitem', { name: '编辑此单元格', exact: true })).toBeEnabled()
  await expect(page.getByRole('menuitem', { name: '查看', exact: true })).toBeEnabled()
  await expect(page.getByRole('menuitem', { name: '仅保留相同原值', exact: true })).toHaveCount(0)
  await expect(page.getByRole('menuitem', { name: '排除此原值', exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await grid.getByRole('button', { name: '退出编辑', exact: true }).click()
  await expect
    .poll(async () => (await renderedLabels(grid)).slice(0, 3))
    .toEqual(scalarResult.rows.slice(0, 3).map((row) => row.label))
  await expect(grid.locator('.el-pagination')).toContainText('10')
  await grid.getByRole('button', { name: '重置列视图', exact: true }).click()
  let releaseReply = () => {}
  state.replyReady = new Promise<void>((resolve) => {
    releaseReply = resolve
  })
  const rerun = execute()
  try {
    await expect(page.getByRole('button', { name: '取消查询', exact: true })).toBeVisible()
    await expect(grid).toHaveCount(0)
    await expect(page.getByRole('menuitem', { name: '仅保留相同原值', exact: true })).toHaveCount(0)
    await expect(page.getByRole('menuitem', { name: '排除此原值', exact: true })).toHaveCount(0)
  } finally {
    releaseReply()
    await rerun
    state.replyReady = undefined
  }
  await page.keyboard.press('Escape')
  await addFilter(page, grid, 'case-string', 'value')
  await execute({
    columns: scalarResult.columns,
    rows: [{ label: 'replacement', value: 'new-value' }]
  })
  await expect(filters(grid)).toHaveCount(0)
  const oldMenu = await openMenu(page, grid, 'replacement', 'value')
  await page.evaluate(
    (tenant) =>
      window.dispatchEvent(new CustomEvent('sql-preview-tenant-change', { detail: tenant })),
    tenantB
  )
  await expect(grid).toHaveCount(0)
  await expect(oldMenu).toBeHidden()
  await execute({
    columns: scalarResult.columns,
    rows: [{ label: 'new-scope', value: 'new-scope-value' }]
  })
  await expect(filters(grid)).toHaveCount(0)
  await expect.poll(() => renderedLabels(grid)).toEqual(['new-scope'])
  await (await cell(grid, 'new-scope', 'value')).locator('.cell').evaluate((element, tenant) => {
    element.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 120,
        clientY: 120
      })
    )
    window.dispatchEvent(new CustomEvent('sql-preview-tenant-change', { detail: tenant }))
  }, tenantA)
  await expect(grid).toHaveCount(0)
  await expect(page.getByRole('menuitem', { name: '仅保留相同原值', exact: true })).toBeHidden()
  await execute({
    columns: scalarResult.columns,
    rows: [{ label: 'final-scope', value: 'final-value' }]
  })
  await expect(filters(grid)).toHaveCount(0)
  expect(state.executions).toBe(5)
})

test('unsupported cells and duplicate columns explain disabled actions, repeated predicates and the eight-condition limit cannot add filters', async ({
  page
}, info) => {
  const unsupported: ResultFixture = {
    columns: scalarResult.columns,
    rows: [
      { label: 'object', value: { nested: 'value' } },
      { label: 'array', value: ['value'] },
      { label: 'unsafe', value: 9007199254740992 },
      { label: 'missing' }
    ]
  }
  const { grid, execute } = await prepare(page, info.project.name, unsupported)
  for (const label of ['object', 'array', 'unsafe', 'missing']) {
    const menu = await openMenu(page, grid, label, 'value')
    await expect(menu.getByRole('menuitem', { name: '仅保留相同原值', exact: true })).toBeDisabled()
    await expect(menu.getByRole('menuitem', { name: '排除此原值', exact: true })).toBeDisabled()
    await expect(menu).toContainText(
      label === 'unsafe' ? /安全|精度/ : label === 'missing' ? /缺失|缺少|未返回/ : /复杂|对象|数组/
    )
    await page.keyboard.press('Escape')
    await expect(filters(grid)).toHaveCount(0)
  }
  await execute({
    columns: [{ name: 'label' }, { name: 'value' }, { name: 'value' }],
    rows: [{ label: 'ambiguous', value: 'x' }]
  })
  const duplicateMenu = await openMenu(page, grid, 'ambiguous', 'value')
  await expect(
    duplicateMenu.getByRole('menuitem', { name: '仅保留相同原值', exact: true })
  ).toBeDisabled()
  await expect(duplicateMenu).toContainText(/重名|唯一/)
  await page.keyboard.press('Escape')
  const bounded: ResultFixture = {
    columns: [{ name: 'label' }, { name: 'value' }, { name: 'shared' }],
    rows: Array.from({ length: 10 }, (_, index) => ({
      label: `limit-${index}`,
      value: `value-${index}`,
      shared: 'same'
    }))
  }
  await execute(bounded)
  await addFilter(page, grid, 'limit-0', 'shared')
  const repeated = await openMenu(page, grid, 'limit-0', 'shared')
  await expect(
    repeated.getByRole('menuitem', { name: '仅保留相同原值', exact: true })
  ).toBeDisabled()
  await expect(
    filters(grid).getByRole('button', { name: '查看筛选原值 shared', exact: true })
  ).toHaveCount(1)
  await page.keyboard.press('Escape')
  await clearFilters(grid)
  for (let index = 0; index < 8; index++)
    await addFilter(page, grid, `limit-${index}`, 'value', 'exclude')
  await expect(
    filters(grid).getByRole('button', { name: '查看筛选原值 value', exact: true })
  ).toHaveCount(8)
  const capacity = await grid.evaluate((root) => {
    const body = root
      .querySelector('.el-table-v2__main .el-table-v2__body')
      ?.getBoundingClientRect()
    const row = root.querySelector('.el-table-v2__main .el-table-v2__row')?.getBoundingClientRect()
    if (!body || !row) throw new Error('Filtered result viewport is missing')
    return { bodyHeight: body.height, rowHeight: row.height }
  })
  expect(capacity.bodyHeight).toBeGreaterThanOrEqual(capacity.rowHeight)
  await expectVisibleRows(grid, ['limit-8'])
  await page.screenshot({
    path: info.outputPath('raw-value-filter-eight-conditions.png'),
    animations: 'disabled'
  })
  const lastRow = grid
    .locator('.el-table-v2__main .el-table-v2__row')
    .filter({ has: page.getByText('limit-9', { exact: true }) })
  await lastRow.scrollIntoViewIfNeeded()
  // Native virtual-scroll alignment may leave a fractional border pixel clipped.
  await expect(lastRow).toBeInViewport({ ratio: 0.99 })
  await page.screenshot({
    path: info.outputPath('raw-value-filter-last-row.png'),
    animations: 'disabled'
  })
  const limited = await openMenu(page, grid, 'limit-8', 'value')
  await expect(limited.getByRole('menuitem', { name: '排除此原值', exact: true })).toBeDisabled()
  await expect(limited).toContainText(/8|八/)
})

test('zero matches keep removable conditions and clear recovers focus with readable narrow theme controls', async ({
  page
}, info) => {
  const { grid, state } = await prepare(page, info.project.name, {
    columns: scalarResult.columns,
    rows: [
      { label: 'same-A', value: 'same' },
      { label: 'same-B', value: 'same' },
      { label: 'other-C', value: 'other' }
    ]
  })
  await addFilter(page, grid, 'same-A', 'value')
  await expectVisibleRows(grid, ['same-A', 'same-B'])
  await page.screenshot({
    path: info.outputPath('raw-value-filter-two-desktop-rows.png'),
    animations: 'disabled'
  })
  await addFilter(page, grid, 'same-A', 'value', 'exclude')
  await expect(grid.locator('.sql-result-tools')).toContainText('匹配 0 行')
  await expect(
    filters(grid).getByRole('button', { name: '移除原值筛选 value', exact: true })
  ).toHaveCount(2)
  await page.setViewportSize({ width: 390, height: 844 })
  const controls = filters(grid).getByRole('button')
  for (const button of await controls.all()) {
    await expect(button).toBeInViewport({ ratio: 1 })
    const box = await button.boundingBox()
    expect(box?.height).toBeGreaterThanOrEqual(24)
    expect(box?.width).toBeGreaterThanOrEqual(24)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
  await page.screenshot({
    path: info.outputPath('raw-value-filter-empty-narrow.png'),
    animations: 'disabled'
  })
  await filters(grid)
    .getByRole('button', { name: '移除原值筛选 value', exact: true })
    .last()
    .focus()
  await page.keyboard.press('Enter')
  await expect(grid.locator('.sql-result-tools')).toContainText('匹配 2 行')
  await expect(
    filters(grid).getByRole('button', { name: '移除原值筛选 value', exact: true })
  ).toHaveCount(1)
  await page.screenshot({
    path: info.outputPath('raw-value-filter-narrow.png'),
    animations: 'disabled'
  })
  await filters(grid).getByRole('button', { name: '清除原值筛选', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(filters(grid)).toHaveCount(0)
  await expect(search(grid)).toBeFocused()
  await expect.poll(() => renderedLabels(grid)).toEqual(['same-A', 'same-B', 'other-C'])
  expect(state.executions).toBe(1)
})
