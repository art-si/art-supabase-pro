import { expect, test, type Locator, type Page } from '@playwright/test'
import ExcelJS from 'exceljs'
import { readFile } from 'node:fs/promises'
import { prepareIsolatedSession } from './support/isolated-session'
import { prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

const tenantA = '00000000-0000-4000-8000-000000000001'
const tenantB = '00000000-0000-4000-8000-000000000002'
const actorId = '00000000-0000-4000-8000-000000000003'
interface ResultFixture {
  columns: { name: string; type?: string }[]
  rows: Record<string, unknown>[]
  truncated?: boolean
}
const columns = [
  { name: 'amount', type: 'numeric' },
  { name: 'label', type: 'text' },
  { name: 'id', type: 'integer' },
  { name: 'tenant_id', type: 'uuid' }
]
const label = (index: number) => `batch-${String(index).padStart(3, '0')}`
const numeric: ResultFixture = {
  columns,
  truncated: true,
  rows: [
    ...Array.from({ length: 120 }, (_, index) => ({
      amount: `${120 - index}.0000000000000000001`,
      label: label(index + 1),
      id: index < 60 ? index + 1 : index % 3 === 0 ? 1 : null,
      tenant_id: tenantA
    })),
    { amount: '1.0000000000000000002', label: label(121), id: 1, tenant_id: tenantA },
    { amount: '1.0000000000000000001', label: label(122), id: null, tenant_id: tenantA },
    { amount: null, label: 'edge-null', id: null, tenant_id: tenantA },
    { amount: 9007199254740992, label: 'edge-unsafe', id: 1, tenant_id: tenantA },
    { amount: 'not-a-number', label: 'edge-invalid', id: 1, tenant_id: tenantA }
  ]
}

function metadata(result: ResultFixture) {
  const fields = result.columns.map(({ name, type }) => ({
    name,
    dataType: type,
    isNullable: name !== 'id' && name !== 'tenant_id',
    isPrimaryKey: name === 'id'
  }))
  return {
    schemas: ['public'],
    tables: [{ tableSchema: 'public', tableName: 'sort_sample', kind: 'table', columns: fields }],
    columns: fields.map((field, index) => ({
      tableSchema: 'public',
      tableName: 'sort_sample',
      columnName: field.name,
      dataType: field.dataType,
      isNullable: field.isNullable ? 'YES' : 'NO',
      isPrimaryKey: field.isPrimaryKey,
      ordinalPosition: index + 1
    })),
    functions: [],
    foreignKeys: []
  }
}

async function prepare(page: Page, project: string, initial = numeric, ordinary = false) {
  page.setDefaultTimeout(15_000)
  page.setDefaultNavigationTimeout(60_000)
  await prepareIsolatedSession(page)
  await prepareAppearance(page, {
    theme: project.includes('dark') ? 'dark' : 'light',
    boxBorderMode: true
  })
  await page.addInitScript(
    ({ tenantA, ordinary }) => {
      if (!ordinary) {
        sessionStorage.setItem('art-platform-tenant-scope-active', '1')
        sessionStorage.setItem('art-platform-tenant-scope-id', tenantA)
      }
    },
    { tenantA, ordinary }
  )
  const state = {
    result: initial,
    requests: 0,
    executions: 0,
    scopes: [] as (string | undefined)[]
  }
  await page.route('**/functions/v1/execute-sql-with-columns', (route) => {
    state.requests++
    if ((route.request().postDataJSON() as { action?: string }).action === 'metadata')
      return route.fulfill({ json: metadata(initial) })
    state.executions++
    state.scopes.push(route.request().headers()['x-art-tenant-scope'])
    return route.fulfill({
      json: {
        status: 'ok',
        ...state.result,
        rowCount: state.result.rows.length,
        durationMs: 2,
        commandTag: 'SELECT'
      }
    })
  })
  await page.goto(
    `/tests/e2e/fixtures/sql-console-metadata.html?actor=${actorId}&tenant=${tenantA}${ordinary ? '&ordinary=1' : ''}`
  )
  await expect(page.locator('.monaco-editor')).toBeVisible()
  const collapse = page.getByRole('button', { name: '收起数据库资源', exact: true }).first()
  if (await collapse.isVisible()) await collapse.click()
  await page
    .locator('.monaco-editor')
    .getByRole('textbox', { name: 'SQL 编辑器', exact: true })
    .focus()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText('SELECT * FROM public.sort_sample LIMIT 200;')
  const scope = page.locator('.result-section > .tabs-header')
  const grid = page.locator('.result-table-container')
  const execute = async (next = state.result) => {
    state.result = next
    const response = page.waitForResponse(
      (response) =>
        response.url().endsWith('/functions/v1/execute-sql-with-columns') &&
        (response.request().postDataJSON() as { action?: string }).action !== 'metadata'
    )
    await page.getByRole('button', { name: '执行 SQL', exact: true }).click()
    await response
    await expect(scope.getByRole('button', { name: '导出查询结果', exact: true })).toBeEnabled()
  }
  return { state, execute, grid, scope }
}

function sortButton(grid: Locator, field: string) {
  return grid.getByRole('button', { name: new RegExp(`^排序 ${field}：`) })
}

async function renderedValues(grid: Locator, field = 'label') {
  return grid.evaluate((root, field) => {
    const headers = Array.from(
      root.querySelectorAll('.el-table-v2__main .el-table-v2__header-cell')
    )
    const index = headers.findIndex((header) => header.getAttribute('data-key') === field)
    return Array.from(root.querySelectorAll('.el-table-v2__main .el-table-v2__row')).map(
      (row) => row.querySelectorAll('.el-table-v2__row-cell')[index]?.textContent?.trim() || ''
    )
  }, field)
}

async function expectPrefix(grid: Locator, values: string[], field = 'label') {
  await expect
    .poll(async () => (await renderedValues(grid, field)).slice(0, values.length))
    .toEqual(values)
}

async function expectTwoRowsReadable(grid: Locator) {
  const rows = grid.locator('.el-table-v2__main .el-table-v2__row')
  for (let index = 0; index < 2; index++)
    await expect(rows.nth(index).locator('.el-table-v2__row-cell').first()).toBeInViewport({
      ratio: 1
    })
  await expect
    .poll(() =>
      grid.evaluate((root) => {
        const body = root
          .querySelector('.el-table-v2__main .el-table-v2__body')
          ?.getBoundingClientRect()
        const bar = root
          .querySelector('.el-table-v2__main .el-vl__horizontal')
          ?.getBoundingClientRect()
        if (!body) return false
        const bottom = Math.min(body.bottom, bar && bar.height > 0 ? bar.top : body.bottom)
        const cells = Array.from(root.querySelectorAll('.el-table-v2__main .el-table-v2__row'))
          .slice(0, 2)
          .map((row) => row.querySelector('.el-table-v2__row-cell')?.getBoundingClientRect())
        return (
          cells.length === 2 &&
          cells.every((cell) => cell && cell.top >= body.top - 1 && cell.bottom <= bottom + 1)
        )
      })
    )
    .toBe(true)
}

async function openSortDetails(page: Page, grid: Locator) {
  await grid.getByRole('button', { name: '本地排序说明', exact: true }).click()
  const details = page.getByRole('region', { name: '本地排序说明', exact: true })
  await expect(details).toBeVisible()
  return details
}

async function expectSort(grid: Locator, field: string, direction: '升序' | '降序' | '未排序') {
  await expect(sortButton(grid, field)).toHaveAttribute(
    'aria-label',
    new RegExp(`当前${direction}`)
  )
  const header = grid.getByRole('columnheader', { name: new RegExp(`排序 ${field}：`) })
  await expect(header).toHaveAttribute(
    'aria-sort',
    direction === '未排序' ? 'none' : direction === '升序' ? 'ascending' : 'descending'
  )
  await expect
    .poll(() =>
      grid
        .getByRole('columnheader')
        .evaluateAll(
          (headers, activeField) =>
            headers
              .filter(
                (header) =>
                  header.getAttribute('data-key') !== activeField &&
                  header.querySelector('button[aria-label^="排序 "]')
              )
              .every((header) => header.getAttribute('aria-sort') === 'none'),
          field
        )
    )
    .toBe(true)
  const arrow = grid.locator(
    `.el-table-v2__main .el-table-v2__header-cell[data-key="${field}"] .el-table-v2__sort-icon`
  )
  if (direction === '未排序') await expect(arrow).not.toHaveClass(/is-sorting/)
  else await expect(arrow).toHaveClass(/is-sorting/)
}

async function setColumn(page: Page, grid: Locator, field: string, checked: boolean) {
  await grid.getByRole('button', { name: '设置显示列', exact: true }).click()
  const popup = page
    .locator('.el-popover:visible')
    .filter({ has: page.getByRole('group', { name: '列显示预设', exact: true }) })
  const checkbox = popup.getByRole('checkbox', { name: field, exact: true })
  if ((await checkbox.isChecked()) !== checked)
    await popup.getByText(field, { exact: true }).click()
  await popup.getByRole('button', { name: '关闭列设置', exact: true }).click()
}

async function download(
  page: Page,
  scope: Locator,
  format: 'Excel' | 'JSON（保留类型）',
  trigger = '导出查询结果'
) {
  await scope.getByRole('button', { name: trigger, exact: true }).click()
  const pending = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: `导出 ${format}`, exact: true }).click()
  const result = await pending
  const path = await result.path()
  if (!path) throw new Error('排序回归未生成导出文件')
  return path
}

test('loaded numeric sort is exact, stable and precedes local pagination while exports keep query order', async ({
  page
}, info) => {
  const { state, execute, grid, scope } = await prepare(page, info.project.name)
  await execute()
  const requests = state.requests
  await expectPrefix(grid, [1, 2, 3].map(label))
  await grid.locator('.el-pagination .btn-next').click()
  await expectPrefix(grid, [51, 52, 53].map(label))
  await sortButton(grid, 'amount').focus()
  await sortButton(grid, 'amount').press('Enter')
  await expectSort(grid, 'amount', '升序')
  await expect(grid.locator('.el-pagination .el-pager .is-active')).toHaveText('1')
  await expectPrefix(grid, [120, 122, 121].map(label))
  await expect(grid.getByRole('button', { name: '本地排序说明', exact: true })).toContainText(
    'amount'
  )
  const sortStatus = await openSortDetails(page, grid)
  await expect(sortStatus).toContainText('仅对本次已加载结果排序')
  await expect(sortStatus).toContainText('不重跑 SQL')
  await expect(sortStatus).toContainText(/NULL\/缺失\s*1 行/)
  await expect(sortStatus).toContainText(/未参与比较\s*2 行/)
  await page.screenshot({ path: info.outputPath('local-sort-details.png'), animations: 'disabled' })
  await sortStatus.getByRole('button', { name: '关闭排序说明', exact: true }).click()
  await expect(sortStatus).toBeHidden()
  await expect(grid.getByRole('button', { name: '本地排序说明', exact: true })).toBeFocused()
  await expectTwoRowsReadable(grid)
  await page.screenshot({ path: info.outputPath('loaded-numeric-sort.png') })
  await grid.locator('.el-pagination .btn-next').click()
  await expectPrefix(grid, [72, 71, 70].map(label))
  const search = grid.getByRole('textbox', { name: '搜索已加载结果', exact: true })
  await search.fill('batch-00')
  await expect(grid.locator('.el-pagination .el-pager .is-active')).toHaveText('1')
  await expectPrefix(grid, [9, 8, 7].map(label))
  await search.fill('edge-')
  await expectPrefix(grid, ['edge-null', 'edge-unsafe', 'edge-invalid'])
  await search.clear()
  await expectPrefix(grid, [120, 122, 121].map(label))
  await scope.getByRole('button', { name: '导出查询结果', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: /已加载 125 行/ })).toContainText(
    '不受筛选、排序或编辑副本影响'
  )
  await page.screenshot({ path: info.outputPath('raw-order-export-menu.png') })
  await page.keyboard.press('Escape')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(await download(page, scope, 'Excel'))
  const sheet = workbook.worksheets[0]
  expect(sheet.rowCount).toBe(126)
  expect(Array.from({ length: 125 }, (_, index) => sheet.getCell(index + 2, 2).value)).toEqual(
    numeric.rows.map((row) => row.label)
  )
  expect(sheet.getCell(121, 1).value).toBe('1.0000000000000000001')
  expect(sheet.getCell(122, 1).value).toBe('1.0000000000000000002')
  const exported: unknown = JSON.parse(
    await readFile(await download(page, scope, 'JSON（保留类型）'), 'utf8')
  )
  expect(exported).toMatchObject({ format: 'sql-result-snapshot', rowCount: 125, truncated: true })
  for (const [index, value] of [
    [0, label(1)],
    [119, label(120)],
    [120, label(121)],
    [121, label(122)],
    [124, 'edge-invalid']
  ] as const)
    expect(exported).toHaveProperty(
      `rows.${index}.entries`,
      expect.arrayContaining([['label', { type: 'string', value }]])
    )
  await search.fill('batch-12')
  await expectPrefix(grid, [120, 122, 121].map(label))
  await sortButton(grid, 'amount').press('Space')
  await expectSort(grid, 'amount', '降序')
  await expectPrefix(grid, [121, 120, 122].map(label))
  await sortButton(grid, 'amount').press('Enter')
  await expectSort(grid, 'amount', '未排序')
  await expectPrefix(grid, [120, 121, 122].map(label))
  const arrow = grid.locator(
    '.el-table-v2__main .el-table-v2__header-cell[data-key="amount"] .el-table-v2__sort-icon'
  )
  await sortButton(grid, 'amount').press('Enter')
  await expectSort(grid, 'amount', '升序')
  await expectPrefix(grid, [120, 122, 121].map(label))
  await arrow.click()
  await expectSort(grid, 'amount', '降序')
  await expectPrefix(grid, [121, 120, 122].map(label))
  await arrow.click()
  await expectSort(grid, 'amount', '未排序')
  await expectPrefix(grid, [120, 121, 122].map(label))
  await search.clear()
  await expectPrefix(grid, [1, 2, 3].map(label))
  await expectTwoRowsReadable(grid)
  await page.screenshot({ path: info.outputPath('restored-query-order.png') })
  expect(state.requests).toBe(requests)
  expect(state.executions).toBe(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
})

test('sort preferences pause for raw draft order and clear on hidden fields, results, tenant and database changes', async ({
  page
}, info) => {
  test.skip(info.project.name !== 'desktop-1440', '排序生命周期使用桌面代表视口')
  const unique = { ...numeric, rows: numeric.rows.map((row, index) => ({ ...row, id: index + 1 })) }
  let externalQueries = 0
  await page.route('http://127.0.0.1:4319/**', (route) => {
    const path = new URL(route.request().url()).pathname
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization,content-type,x-art-tenant-scope'
    }
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (path === '/snapshot')
      return route.fulfill({
        headers,
        json: {
          canManage: true,
          users: [],
          connections: [
            {
              id: '00000000-0000-4000-8000-000000000221',
              name: '排序隔离库',
              dialect: 'postgres',
              host: 'localhost',
              port: 5432,
              database: 'sort_test',
              username: 'reader',
              tenantId: tenantB,
              allowedUserIds: [actorId],
              enabled: true,
              tls: false,
              updatedAt: '2026-10-31T00:00:00Z'
            }
          ]
        }
      })
    if (path.endsWith('/metadata')) return route.fulfill({ headers, json: metadata(unique) })
    if (path.endsWith('/query')) {
      externalQueries++
      return route.fulfill({
        headers,
        json: {
          status: 'ok',
          columns,
          rows: [{ amount: '9.00', label: 'external-first', id: 990, tenant_id: tenantB }],
          rowCount: 1,
          durationMs: 1,
          commandTag: 'SELECT',
          maxRows: 200,
          timeoutMs: 10000,
          truncated: false
        }
      })
    }
    return route.fulfill({ headers, json: { status: 'ok' } })
  })
  const { state, execute, grid } = await prepare(page, info.project.name, unique)
  await execute()
  await sortButton(grid, 'amount').click()
  await expectPrefix(grid, [120, 122, 121].map(label))
  const requests = state.requests
  await grid.getByRole('button', { name: '编辑副本', exact: true }).click()
  await expectPrefix(grid, [1, 2, 3].map(label))
  await expect(sortButton(grid, 'amount')).toHaveCount(0)
  await expect(grid.getByRole('button', { name: '编辑第 1 行 id', exact: true })).toHaveCount(0)
  await expect(
    grid.getByRole('button', { name: '编辑第 1 行 tenant_id', exact: true })
  ).toHaveCount(0)
  await grid.getByRole('button', { name: '退出编辑', exact: true }).click()
  await expectSort(grid, 'amount', '升序')
  await expectPrefix(grid, [120, 122, 121].map(label))
  await setColumn(page, grid, 'amount', false)
  await expect(grid.getByRole('button', { name: '恢复查询顺序', exact: true })).toHaveCount(0)
  await expectPrefix(grid, [1, 2, 3].map(label))
  await setColumn(page, grid, 'amount', true)
  await expectSort(grid, 'amount', '未排序')
  await sortButton(grid, 'amount').click()
  await grid.getByRole('button', { name: '恢复查询顺序', exact: true }).click()
  await expectPrefix(grid, [1, 2, 3].map(label))
  await expectSort(grid, 'amount', '未排序')
  expect(state.requests).toBe(requests)
  await sortButton(grid, 'amount').click()
  await execute({ ...unique, rows: [...unique.rows].reverse() })
  await expectPrefix(grid, ['edge-invalid', 'edge-unsafe', 'edge-null'])
  await expectSort(grid, 'amount', '未排序')
  await sortButton(grid, 'amount').click()
  await page.evaluate(async (tenant) => {
    const path = '/src/utils/tenant-scope-context.ts'
    const scope = (await import(path)) as typeof import('../../src/utils/tenant-scope-context')
    scope.writePlatformTenantScopeActive(true)
    scope.writeTenantScopeId(tenant)
    window.dispatchEvent(new CustomEvent('sql-preview-tenant-change', { detail: tenant }))
  }, tenantB)
  await expect(grid).toHaveCount(0)
  await execute({
    columns,
    rows: [
      { amount: '9.00', label: 'tenant-b-first', id: 901, tenant_id: tenantB },
      { amount: '1.00', label: 'tenant-b-second', id: 902, tenant_id: tenantB }
    ]
  })
  await expectSort(grid, 'amount', '未排序')
  await expectPrefix(grid, ['tenant-b-first', 'tenant-b-second'])
  expect(state.scopes).toEqual([tenantA, tenantA, tenantB])
  expect(state.executions).toBe(3)
  await page.screenshot({ path: info.outputPath('sort-tenant-reset.png') })
  await sortButton(grid, 'amount').click()
  await expectPrefix(grid, ['tenant-b-second', 'tenant-b-first'])
  await page.getByRole('button', { name: '连接管理', exact: true }).click()
  const manager = page.getByRole('dialog', { name: '数据库连接', exact: true })
  await manager
    .locator('.connection-manager__item')
    .filter({ hasText: '排序隔离库' })
    .getByRole('button', { name: '使用', exact: true })
    .click()
  await expect(manager).toHaveCount(0)
  await page.getByRole('button', { name: '执行 SQL', exact: true }).click()
  await expect.poll(() => externalQueries).toBe(1)
  await expectPrefix(grid, ['external-first'])
  await expectSort(grid, 'amount', '未排序')
  expect(state.executions).toBe(3)
})

test('date and time sorting uses timezone instants and nanoseconds with stable equal values', async ({
  page
}, info) => {
  test.skip(info.project.name !== 'desktop-1440', '精确时间排序使用桌面代表视口')
  const result: ResultFixture = {
    columns: [
      { name: 'occurred_at', type: 'timestamp with time zone' },
      { name: 'at_time', type: 'time with time zone' },
      { name: 'day', type: 'date' },
      { name: 'label', type: 'text' }
    ],
    rows: [
      {
        label: 'time-1',
        occurred_at: '2026-01-01T00:30:00.000000002+08:00',
        at_time: '08:00:00.000000002+08:00',
        day: '2026-01-02'
      },
      {
        label: 'time-2',
        occurred_at: '2025-12-31T17:00:00Z',
        at_time: '01:00:00Z',
        day: '2025-12-31'
      },
      {
        label: 'time-3',
        occurred_at: '2025-12-31T16:30:00.000000001Z',
        at_time: '00:00:00.000000001Z',
        day: '2026-01-01'
      },
      {
        label: 'time-4',
        occurred_at: '2025-12-31T16:30:00.000000002Z',
        at_time: '00:00:00.000000002Z',
        day: '2026-01-01'
      },
      { label: 'time-5', occurred_at: null, at_time: null, day: null },
      {
        label: 'time-6',
        occurred_at: '2026-02-30T00:00:00Z',
        at_time: '24:00:00Z',
        day: '2026-02-30'
      }
    ]
  }
  const { state, execute, grid } = await prepare(page, info.project.name, result)
  await execute()
  const requests = state.requests
  for (const field of ['occurred_at', 'at_time']) {
    await sortButton(grid, field).click()
    await expectSort(grid, field, '升序')
    await expectPrefix(
      grid,
      [3, 1, 4, 2, 5, 6].map((id) => `time-${id}`)
    )
    await sortButton(grid, field).click()
    await expectSort(grid, field, '降序')
    await expectPrefix(
      grid,
      [2, 1, 4, 3, 5, 6].map((id) => `time-${id}`)
    )
  }
  await sortButton(grid, 'day').click()
  await expectPrefix(
    grid,
    [2, 3, 4, 1, 5, 6].map((id) => `time-${id}`)
  )
  await sortButton(grid, 'day').click()
  await expectPrefix(
    grid,
    [1, 3, 4, 2, 5, 6].map((id) => `time-${id}`)
  )
  const status = await openSortDetails(page, grid)
  await expect(status).toContainText(/NULL\/缺失\s*1 行/)
  await expect(status).toContainText(/未参与比较\s*1 行/)
  await page.keyboard.press('Escape')
  await expect(status).toBeHidden()
  expect(state.requests).toBe(requests)
  expect(state.executions).toBe(1)
  await page.screenshot({ path: info.outputPath('precise-date-sort.png') })
})

test('ordinary API text and boolean sort preserves raw exports and cannot restore tenant columns', async ({
  page
}, info) => {
  test.skip(info.project.name !== 'desktop-1440', '普通API排序使用桌面代表视口')
  const result: ResultFixture = {
    columns: [
      { name: 'name', type: 'text' },
      { name: 'enabled', type: 'boolean' },
      { name: 'label', type: 'text' },
      { name: 'tenant_id', type: 'uuid' }
    ],
    rows: ['delta', 'alpha', 'charlie', 'bravo', 'alpha', 'echo'].map((name, index) => ({
      name,
      enabled: [true, false, false, true, null, 'invalid'][index],
      label: `api-${index + 1}`,
      tenant_id: tenantA
    }))
  }
  let calls = 0
  const definition = {
    id: '00000000-0000-4000-8000-000000000171',
    slug: 'local-sort-test',
    name: '本地排序 API',
    sql: '',
    description: '',
    tenantId: tenantA,
    allowedUserIds: [],
    parameters: [],
    maxRows: 200,
    timeoutMs: 10000,
    enabled: true,
    updatedAt: '2026-10-31T01:00:00.000001Z'
  }
  await page.route('**/functions/v1/sql-query-api**', (route) => {
    if ((route.request().postDataJSON() as { action?: string }).action === 'list')
      return route.fulfill({ json: { definitions: [definition], canManage: false, users: [] } })
    calls++
    return route.fulfill({
      json: {
        status: 'ok',
        ...result,
        rows: calls === 1 ? result.rows : [...result.rows].reverse(),
        rowCount: 6,
        durationMs: 2,
        truncated: false,
        maxRows: 200,
        timeoutMs: 10000
      }
    })
  })
  const { state } = await prepare(page, info.project.name, result, true)
  await page.getByRole('button', { name: '查询 API', exact: true }).click()
  const manager = page.getByRole('dialog', { name: '查询 API', exact: true })
  await manager.getByRole('button', { name: '调用 API', exact: true }).click()
  const grid = manager.locator('.result-table-container')
  await expectPrefix(
    grid,
    [1, 2, 3, 4, 5, 6].map((id) => `api-${id}`)
  )
  await sortButton(grid, 'name').click()
  await expectPrefix(
    grid,
    [2, 5, 4, 3, 1, 6].map((id) => `api-${id}`)
  )
  await sortButton(grid, 'enabled').click()
  await expectPrefix(
    grid,
    [2, 3, 1, 4, 5, 6].map((id) => `api-${id}`)
  )
  await sortButton(grid, 'enabled').click()
  await expectPrefix(
    grid,
    [1, 4, 2, 3, 5, 6].map((id) => `api-${id}`)
  )
  const details = await openSortDetails(page, grid)
  await expect(details).toContainText('仅对本次已加载结果排序')
  await expect(details).toContainText(/NULL\/缺失\s*1 行/)
  await expect(details).toContainText(/未参与比较\s*1 行/)
  await page.screenshot({ path: info.outputPath('api-sort-details.png') })
  await details.getByRole('button', { name: '关闭排序说明', exact: true }).click()
  await expect(details).toBeHidden()
  await expect(grid.getByRole('button', { name: '本地排序说明', exact: true })).toBeFocused()
  await grid.getByRole('button', { name: '设置显示列', exact: true }).click()
  const popup = page
    .locator('.el-popover:visible')
    .filter({ has: page.getByRole('group', { name: '列显示预设', exact: true }) })
  await expect(popup.getByRole('checkbox', { name: 'tenant_id', exact: true })).toHaveCount(0)
  await popup.getByRole('button', { name: '完整视图', exact: true }).click()
  await popup.getByRole('button', { name: '关闭列设置', exact: true }).click()
  await expect(sortButton(grid, 'tenant_id')).toHaveCount(0)
  const exported: unknown = JSON.parse(
    await readFile(await download(page, manager, 'JSON（保留类型）', '导出结果'), 'utf8')
  )
  expect(exported).toHaveProperty(
    'rows.0.entries',
    expect.arrayContaining([['label', { type: 'string', value: 'api-1' }]])
  )
  expect(JSON.stringify(exported)).not.toContain('tenant_id')
  expect(calls).toBe(1)
  await manager.getByRole('button', { name: '调用 API', exact: true }).click()
  await expectPrefix(
    grid,
    [6, 5, 4, 3, 2, 1].map((id) => `api-${id}`)
  )
  await expectSort(grid, 'enabled', '未排序')
  expect(calls).toBe(2)
  expect(state.executions).toBe(0)
})

test('unsupported fields expose no sort action and zero-row results keep no stale order', async ({
  page
}, info) => {
  test.skip(info.project.name !== 'desktop-1440', '不支持类型和空结果使用桌面代表视口')
  const result: ResultFixture = {
    columns: [
      { name: 'id', type: 'integer' },
      { name: 'label', type: 'text' },
      { name: 'payload', type: 'jsonb' },
      { name: 'bytes', type: 'bytea' }
    ],
    rows: [
      { id: 2, label: 'second', payload: { value: 2 }, bytes: '\\x0203' },
      { id: 1, label: 'first', payload: { value: 1 }, bytes: '\\x0102' }
    ]
  }
  const { state, execute, grid } = await prepare(page, info.project.name, result)
  await execute()
  await expect(sortButton(grid, 'payload')).toHaveCount(0)
  await expect(sortButton(grid, 'bytes')).toHaveCount(0)
  await sortButton(grid, 'id').click()
  await expectPrefix(grid, ['first', 'second'])
  await execute({ columns: result.columns, rows: [] })
  await expect(page.getByText('执行成功，暂无数据行', { exact: true })).toBeVisible()
  await expect(grid).toHaveCount(0)
  await expect(page.getByRole('button', { name: '恢复查询顺序', exact: true })).toHaveCount(0)
  await execute(result)
  await expectPrefix(grid, ['second', 'first'])
  await expectSort(grid, 'id', '未排序')
  await execute({
    columns: [
      { name: 'numeric_value' },
      { name: 'text_value' },
      { name: 'enabled' },
      { name: 'label', type: 'text' }
    ],
    rows: [
      { numeric_value: 10, text_value: '2', enabled: true, label: 'inferred-10' },
      { numeric_value: 2, text_value: '10', enabled: false, label: 'inferred-2' }
    ]
  })
  await expect(
    grid
      .getByRole('columnheader', { name: /排序 numeric_value：/ })
      .getByText('numeric', { exact: true })
  ).toBeVisible()
  await sortButton(grid, 'numeric_value').click()
  await expectSort(grid, 'numeric_value', '升序')
  await expectPrefix(grid, ['inferred-2', 'inferred-10'])
  await expect(
    grid.getByRole('columnheader', { name: /排序 text_value：/ }).getByText('text', { exact: true })
  ).toBeVisible()
  await sortButton(grid, 'text_value').click()
  await expectPrefix(grid, ['inferred-2', 'inferred-10'])
  await expect(
    grid.getByRole('columnheader', { name: /排序 enabled：/ }).getByText('boolean', { exact: true })
  ).toBeVisible()
  await sortButton(grid, 'enabled').click()
  await expectPrefix(grid, ['inferred-2', 'inferred-10'])
  expect(state.executions).toBe(4)
})
