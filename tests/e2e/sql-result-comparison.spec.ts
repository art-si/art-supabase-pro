import { expect, test, type Locator, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { prepareIsolatedSession } from './support/isolated-session'
import { prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

const tenantId = '00000000-0000-4000-8000-000000000001'
const tenantB = '00000000-0000-4000-8000-000000000002'
const actorId = '00000000-0000-4000-8000-000000000003'
const oldAmount = '12345678901234567890.1234567890123456789'
const newAmount = '12345678901234567890.1234567890123456788'
const oldJson = `{"note":"${'订单'.repeat(100)}","large":12345678901234567890,"decimal":0.1234567890123456789}`
const newJson = `{"note":"${'订单'.repeat(100)}","large":12345678901234567891,"decimal":0.1234567890123456788}`

interface ResultFixture {
  rows: Record<string, unknown>[]
  columns: { name: string; type?: string }[]
  truncated?: boolean
}
const columns = [
  { name: 'id', type: 'integer' },
  { name: 'label', type: 'text' },
  { name: 'amount', type: 'numeric' },
  { name: 'payload', type: 'jsonb' },
  { name: 'flag' },
  { name: 'optional', type: 'text' }
]
const row = (id: number, label: string, values: Record<string, unknown> = {}) => ({
  id,
  label,
  amount: '1.00',
  payload: null,
  flag: false,
  optional: null,
  ...values
})
const baseline: ResultFixture = {
  columns,
  truncated: true,
  rows: [
    row(1, 'stable'),
    row(2, 'precise', { amount: oldAmount }),
    row(3, 'json', { payload: oldJson }),
    row(4, 'typed', { flag: 1 }),
    row(5, 'presence'),
    row(6, 'removed')
  ]
}
const current: ResultFixture = {
  columns: columns.map((column) =>
    column.name === 'amount' ? { ...column, type: 'text' } : column
  ),
  truncated: true,
  rows: [
    { id: 5, label: 'presence', amount: '1.00', payload: null, flag: false },
    row(7, 'added'),
    row(3, 'json', { payload: newJson }),
    row(1, 'stable'),
    row(4, 'typed', { flag: '1' }),
    row(2, 'precise', { amount: newAmount })
  ]
}
const emptyMetadata = {
  schemas: ['public'],
  tables: [],
  columns: [],
  functions: [],
  foreignKeys: []
}

async function prepare(page: Page, project: string, initial = baseline, ordinary = false) {
  page.setDefaultTimeout(15_000)
  page.setDefaultNavigationTimeout(60_000)
  await prepareIsolatedSession(page)
  await prepareAppearance(page, {
    theme: project.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !project.includes('shadow')
  })
  await page.addInitScript(
    ({ ordinary, tenantId }) => {
      if (ordinary) {
        sessionStorage.removeItem('art-platform-tenant-scope-active')
        sessionStorage.removeItem('art-platform-tenant-scope-id')
      } else {
        sessionStorage.setItem('art-platform-tenant-scope-active', '1')
        sessionStorage.setItem('art-platform-tenant-scope-id', tenantId)
      }
    },
    { ordinary, tenantId }
  )
  const state = {
    result: initial,
    requests: 0,
    executions: 0,
    scopes: [] as (string | undefined)[]
  }
  await page.route('**/functions/v1/execute-sql-with-columns', (route) => {
    state.requests++
    const body = route.request().postDataJSON() as { action?: string; mode?: string }
    if (body.action === 'metadata')
      return route.fulfill({ json: { ...emptyMetadata, metadataMode: body.mode } })
    state.executions++
    state.scopes.push(route.request().headers()['x-art-tenant-scope'])
    return route.fulfill({
      json: {
        status: 'ok',
        ...state.result,
        rowCount: state.result.rows.length,
        commandTag: 'SELECT',
        durationMs: 2
      }
    })
  })
  await page.goto(
    `/tests/e2e/fixtures/sql-console-metadata.html?actor=${actorId}&tenant=${tenantId}${ordinary ? '&ordinary=1' : ''}`
  )
  await expect(page.locator('.monaco-editor')).toBeVisible()
  const sqlScope = page.locator('.result-section > .tabs-header')
  const execute = async (next = state.result) => {
    state.result = next
    const response = page.waitForResponse((response) => {
      const request = response.request()
      return (
        request.url().endsWith('/functions/v1/execute-sql-with-columns') &&
        (request.postDataJSON() as { action?: string }).action !== 'metadata'
      )
    })
    await page.getByRole('button', { name: '执行 SQL', exact: true }).click()
    await response
    await expect(sqlScope.getByRole('button', { name: '结果对比', exact: true })).toBeEnabled()
  }
  return { state, execute, sqlScope }
}

async function action(page: Page, scope: Locator, name: string) {
  await scope.getByRole('button', { name: '结果对比', exact: true }).click()
  await page.getByRole('menuitem', { name, exact: true }).click()
}

async function capture(page: Page, scope: Locator, count: number) {
  await action(page, scope, '设为对比基线')
  const trigger = scope.getByRole('button', { name: '结果对比', exact: true })
  await expect(trigger).toBeEnabled()
  await trigger.click()
  await expect(page.getByRole('menuitem', { name: new RegExp(`^基线 ${count} 行`) })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: '打开结果对比', exact: true })).toBeEnabled()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menuitem', { name: '打开结果对比', exact: true })).toBeHidden()
}

async function openComparison(page: Page, scope: Locator) {
  await action(page, scope, '打开结果对比')
  const drawer = page.getByRole('dialog', { name: '结果对比', exact: true })
  await expect(drawer).toBeVisible()
  return drawer
}

async function noBaseline(page: Page, scope: Locator) {
  await scope.getByRole('button', { name: '结果对比', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: '打开结果对比', exact: true })).toBeDisabled()
  await expect(page.getByRole('menuitem', { name: '清除对比基线', exact: true })).toBeDisabled()
  await page.keyboard.press('Escape')
}

async function selectKeys(page: Page, drawer: Locator, fields: string[], available: string[]) {
  const keys = drawer.getByRole('combobox', { name: '唯一匹配键', exact: true })
  await keys.focus()
  await keys.click()
  for (const field of available) {
    const option = page.getByRole('option', { name: field, exact: true })
    if ((await option.getAttribute('aria-selected')) === 'true') await option.click()
  }
  for (const field of fields) await page.getByRole('option', { name: field, exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(drawer).toBeVisible()
}

async function expectCounts(
  drawer: Locator,
  added: number,
  removed: number,
  modified: number,
  unchanged: number
) {
  for (const [name, count] of [
    ['新增', added],
    ['缺失', removed],
    ['修改', modified],
    ['未变', unchanged]
  ] as const)
    await expect(drawer.getByText(`${name} ${count}`, { exact: true })).toBeVisible()
}

async function expectTableActionReady(page: Page, scope: Locator, label: string) {
  const action = scope.getByRole('button', { name: label, exact: true }).first()
  const body = scope.locator('.el-table__body-wrapper').filter({
    has: page.getByRole('button', { name: label, exact: true })
  })
  await expect
    .poll(() => body.evaluate((element) => element.getBoundingClientRect().height))
    .toBeGreaterThan(20)
  await action.scrollIntoViewIfNeeded()
  await expect(action).toBeInViewport({ ratio: 1 })
}

test('comparison snapshots include filtered and hidden original rows and export every typed difference', async ({
  page
}, info) => {
  const { state, execute, sqlScope } = await prepare(page, info.project.name)
  await execute()
  const grid = page.locator('.result-table-container')
  await grid.getByRole('textbox', { name: '搜索已加载结果', exact: true }).fill('stable')
  await expect(grid.locator('.sql-result-tools').getByRole('status')).toContainText('匹配 1 行')
  await grid.getByRole('button', { name: '设置显示列', exact: true }).click()
  const columnPopup = page.locator('.el-popover:visible').filter({
    has: page.getByRole('group', { name: '列显示预设', exact: true })
  })
  await columnPopup.getByText('amount', { exact: true }).click()
  await columnPopup.getByRole('button', { name: '关闭列设置', exact: true }).click()
  await capture(page, sqlScope, 6)
  expect(
    await page.evaluate((value) => JSON.stringify(localStorage).includes(value), oldAmount)
  ).toBe(false)
  await page.getByRole('button', { name: '新建查询页签', exact: true }).click()
  await execute(current)
  const requests = state.requests
  const drawer = await openComparison(page, sqlScope)
  await expect(drawer).toContainText('基线与当前结果已达到返回上限')
  await expect(drawer).toContainText('不代表数据库物理删除')
  await drawer.getByRole('button', { name: '开始对比', exact: true }).click()
  await expectCounts(drawer, 1, 1, 4, 1)
  const schemaCard = drawer
    .locator('.art-section-card')
    .filter({ has: page.getByText('字段结构变化', { exact: true }) })
  await expect
    .poll(() =>
      schemaCard
        .locator('.el-table__body-wrapper')
        .evaluate((element) => element.getBoundingClientRect().height)
    )
    .toBeGreaterThan(20)
  await expect(schemaCard.getByRole('cell', { name: 'numeric', exact: true })).toBeVisible()
  await drawer.getByRole('combobox', { name: '差异状态', exact: true }).click()
  await page.getByRole('option', { name: '修改', exact: true }).click()
  const search = drawer.getByRole('textbox', { name: '搜索匹配键或字段', exact: true })
  await search.fill('amount')
  await expect(drawer.getByRole('button', { name: '查看详情', exact: true })).toHaveCount(1)
  await expectTableActionReady(page, drawer, '查看详情')
  await drawer.getByRole('button', { name: '查看详情', exact: true }).click()
  const details = page.getByRole('dialog', { name: '对比行详情', exact: true })
  await expectTableActionReady(page, details, '查看基线完整值')
  await expect(details).toContainText(oldAmount)
  await expect(details).toContainText(newAmount)
  await details.getByRole('button', { name: '返回对比', exact: true }).click()
  await search.fill('payload')
  await drawer.getByRole('button', { name: '查看详情', exact: true }).click()
  await details.getByRole('button', { name: '查看基线完整值', exact: true }).click()
  const value = page.getByRole('dialog', { name: '字段值详情', exact: true })
  await expect(value.getByLabel('字段值代码', { exact: true })).toHaveText(oldJson)
  await expect(value.getByLabel('字段值代码', { exact: true })).toContainText(
    '12345678901234567890'
  )
  await expect(value.getByLabel('字段值代码', { exact: true })).toContainText(
    '0.1234567890123456789'
  )
  await value.getByRole('button', { name: '启用自动换行', exact: true }).click()
  await page.screenshot({ path: info.outputPath('comparison-exact-json.png') })
  await value.getByRole('button', { name: '返回字段对照', exact: true }).click()
  await details.getByRole('button', { name: '返回对比', exact: true }).click()
  await search.fill('optional')
  await drawer.getByRole('button', { name: '查看详情', exact: true }).click()
  await expect(details).toContainText('NULL')
  await expect(details).toContainText('未返回属性')
  await details.getByRole('button', { name: '返回对比', exact: true }).click()
  const downloading = page.waitForEvent('download')
  await drawer.getByRole('button', { name: '下载对比 JSON', exact: true }).click()
  const download = await downloading
  const path = await download.path()
  if (!path) throw new Error('结果对比未生成 JSON 下载')
  const report: unknown = JSON.parse(await readFile(path, 'utf8'))
  await info.attach('full-diff-export', { path, contentType: 'application/json' })
  expect(report).toMatchObject({
    format: 'sql-result-comparison',
    scope: 'loaded-authorized-results',
    version: 1,
    baseline: { rowCount: 6 },
    current: { rowCount: 6 },
    keyFields: ['id'],
    schemaChanges: [
      { name: 'amount', kind: 'type-changed', beforeType: 'numeric', afterType: 'text' }
    ],
    addedCount: 1,
    removedCount: 1,
    modifiedCount: 4,
    unchangedCount: 1,
    added: [
      { after: { entries: expect.arrayContaining([['id', { type: 'number', value: '7' }]]) } }
    ],
    removed: [
      { before: { entries: expect.arrayContaining([['id', { type: 'number', value: '6' }]]) } }
    ],
    modified: expect.arrayContaining([
      expect.objectContaining({
        changedFields: ['amount'],
        before: {
          type: 'object',
          entries: expect.arrayContaining([['amount', { type: 'string', value: oldAmount }]])
        },
        after: {
          type: 'object',
          entries: expect.arrayContaining([['amount', { type: 'string', value: newAmount }]])
        }
      }),
      expect.objectContaining({
        changedFields: ['payload'],
        before: {
          type: 'object',
          entries: expect.arrayContaining([['payload', { type: 'string', value: oldJson }]])
        },
        after: {
          type: 'object',
          entries: expect.arrayContaining([['payload', { type: 'string', value: newJson }]])
        }
      }),
      expect.objectContaining({
        changedFields: ['flag'],
        before: {
          type: 'object',
          entries: expect.arrayContaining([['flag', { type: 'number', value: '1' }]])
        },
        after: {
          type: 'object',
          entries: expect.arrayContaining([['flag', { type: 'string', value: '1' }]])
        }
      }),
      expect.objectContaining({
        changedFields: ['optional'],
        before: {
          type: 'object',
          entries: expect.arrayContaining([['optional', { type: 'null' }]])
        },
        after: {
          type: 'object',
          entries: expect.not.arrayContaining([['optional', expect.anything()]])
        }
      })
    ])
  })
  expect(state.requests).toBe(requests)
  expect(state.executions).toBe(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
  await page.screenshot({ path: info.outputPath('comparison-loaded-differences.png') })
})

test('comparison own fields and nested Vue-shaped JSON keep their original values in details and downloads', async ({
  page
}, info) => {
  test.skip(info.project.name !== 'desktop-1440', '特殊字段比较使用桌面代表视口')
  const fields = [
    { name: 'id', type: 'integer' },
    { name: 'hasOwnProperty', type: 'text' },
    { name: 'payload', type: 'jsonb' },
    { name: 'label', type: 'text' },
    { name: '__v_isRef', type: 'boolean' },
    { name: '__v_skip', type: 'boolean' },
    { name: 'value', type: 'text' }
  ]
  const nested = (own: string) =>
    Object.fromEntries([
      ['hasOwnProperty', own],
      ['__proto__', 'nested-prototype'],
      ['constructor', 'nested-constructor'],
      ['__v_raw', { marker: 'nested-database-raw' }],
      ['__v_isRef', true],
      ['value', 'nested-database-value'],
      ['__v_isReactive', true],
      ['__v_isReadonly', false]
    ])
  const before: ResultFixture = {
    columns: fields,
    rows: [
      {
        id: 1,
        hasOwnProperty: 'before-own',
        payload: nested('before-nested-own'),
        label: 'stable'
      },
      { id: 2, hasOwnProperty: 'ordinary-own', payload: null, label: 'normal-before' },
      {
        id: 3,
        hasOwnProperty: 'flagged-own',
        payload: null,
        label: 'flagged',
        __v_isRef: true,
        __v_skip: false,
        value: 'before-row-value'
      }
    ]
  }
  const after: ResultFixture = {
    columns: fields,
    rows: [
      {
        id: 3,
        hasOwnProperty: 'flagged-own',
        payload: null,
        label: 'flagged',
        __v_isRef: true,
        __v_skip: false,
        value: 'after-row-value'
      },
      { id: 2, hasOwnProperty: 'ordinary-own', payload: null, label: 'normal-after' },
      { id: 1, hasOwnProperty: 'after-own', payload: nested('after-nested-own'), label: 'stable' }
    ]
  }
  const { state, execute, sqlScope } = await prepare(page, info.project.name, before)
  await execute()
  await capture(page, sqlScope, 3)
  await execute(after)
  const requests = state.requests
  const drawer = await openComparison(page, sqlScope)
  await drawer.getByRole('button', { name: '开始对比', exact: true }).click()
  await expectCounts(drawer, 0, 0, 3, 0)
  const search = drawer.getByRole('textbox', { name: '搜索匹配键或字段', exact: true })
  await search.fill('hasOwnProperty')
  await expect(drawer.getByRole('button', { name: '查看详情', exact: true })).toHaveCount(1)
  await drawer.getByRole('button', { name: '查看详情', exact: true }).click()
  const details = page.getByRole('dialog', { name: '对比行详情', exact: true })
  const ownRow = details.locator('.el-table__body-wrapper tbody tr').filter({
    has: page.getByText('hasOwnProperty', { exact: true })
  })
  await expect(ownRow).toContainText('before-own')
  await expect(ownRow).toContainText('after-own')
  await ownRow.getByRole('button', { name: '查看基线完整值', exact: true }).click()
  const value = page.getByRole('dialog', { name: '字段值详情', exact: true })
  await expect(value.getByLabel('字段值代码', { exact: true })).toHaveText('before-own')
  await value.getByRole('button', { name: '返回字段对照', exact: true }).click()
  const payloadRow = details.locator('.el-table__body-wrapper tbody tr').filter({
    has: page.getByText('payload', { exact: true })
  })
  await payloadRow.getByRole('button', { name: '查看基线完整值', exact: true }).click()
  const content = await value.getByLabel('字段值代码', { exact: true }).textContent()
  if (!content) throw new Error('嵌套字段完整值为空')
  const typed: unknown = JSON.parse(content)
  expect(typed).toMatchObject({
    type: 'object',
    entries: expect.arrayContaining([
      ['hasOwnProperty', { type: 'string', value: 'before-nested-own' }],
      ['__proto__', { type: 'string', value: 'nested-prototype' }],
      ['constructor', { type: 'string', value: 'nested-constructor' }],
      [
        '__v_raw',
        { type: 'object', entries: [['marker', { type: 'string', value: 'nested-database-raw' }]] }
      ],
      ['__v_isRef', { type: 'boolean', value: true }],
      ['value', { type: 'string', value: 'nested-database-value' }]
    ])
  })
  await page.screenshot({ path: info.outputPath('comparison-own-nested-value.png') })
  await value.getByRole('button', { name: '返回字段对照', exact: true }).click()
  await details.getByRole('button', { name: '返回对比', exact: true }).click()
  await search.fill('label')
  await drawer.getByRole('button', { name: '查看详情', exact: true }).click()
  await expect(details).toContainText('normal-before')
  await expect(details).toContainText('normal-after')
  await details.getByRole('button', { name: '返回对比', exact: true }).click()
  await search.fill('value')
  await drawer.getByRole('button', { name: '查看详情', exact: true }).click()
  await expect(details).toContainText('before-row-value')
  await expect(details).toContainText('after-row-value')
  await details.getByRole('button', { name: '查看当前完整值', exact: true }).click()
  await expect(value.getByLabel('字段值代码', { exact: true })).toHaveText('after-row-value')
  await value.getByRole('button', { name: '返回字段对照', exact: true }).click()
  await details.getByRole('button', { name: '返回对比', exact: true }).click()
  const pending = page.waitForEvent('download')
  await drawer.getByRole('button', { name: '下载对比 JSON', exact: true }).click()
  const path = await (await pending).path()
  if (!path) throw new Error('字段一致性比较未生成文件')
  const exported: unknown = JSON.parse(await readFile(path, 'utf8'))
  expect(exported).toMatchObject({
    modifiedCount: 3,
    modified: expect.arrayContaining([
      expect.objectContaining({
        changedFields: ['hasOwnProperty', 'payload'],
        before: {
          type: 'object',
          entries: expect.arrayContaining([
            ['hasOwnProperty', { type: 'string', value: 'before-own' }],
            ['payload', typed]
          ])
        },
        after: {
          type: 'object',
          entries: expect.arrayContaining([
            ['hasOwnProperty', { type: 'string', value: 'after-own' }],
            [
              'payload',
              {
                type: 'object',
                entries: expect.arrayContaining([
                  ['hasOwnProperty', { type: 'string', value: 'after-nested-own' }],
                  ['value', { type: 'string', value: 'nested-database-value' }]
                ])
              }
            ]
          ])
        }
      }),
      expect.objectContaining({
        changedFields: ['label'],
        after: {
          type: 'object',
          entries: expect.arrayContaining([['label', { type: 'string', value: 'normal-after' }]])
        }
      }),
      expect.objectContaining({
        changedFields: ['value'],
        before: {
          type: 'object',
          entries: expect.arrayContaining([
            ['id', { type: 'number', value: '3' }],
            ['__v_isRef', { type: 'boolean', value: true }],
            ['__v_skip', { type: 'boolean', value: false }],
            ['value', { type: 'string', value: 'before-row-value' }]
          ])
        },
        after: {
          type: 'object',
          entries: expect.arrayContaining([
            ['id', { type: 'number', value: '3' }],
            ['__v_isRef', { type: 'boolean', value: true }],
            ['__v_skip', { type: 'boolean', value: false }],
            ['value', { type: 'string', value: 'after-row-value' }]
          ])
        }
      })
    ])
  })
  expect(state.requests).toBe(requests)
  expect(state.executions).toBe(2)
})

test('comparison pagination stays usable and single-row filters shrink all result tables', async ({
  page
}, info) => {
  test.skip(info.project.name !== 'desktop-1440', '分页分支使用桌面代表视口')
  const fields = Array.from(
    { length: 25 },
    (_, index) => `field_${String(index + 1).padStart(2, '0')}`
  )
  const before: ResultFixture = {
    columns: [
      { name: 'id', type: 'integer' },
      ...fields.map((name) => ({ name, type: 'numeric' }))
    ],
    rows: Array.from({ length: 25 }, (_, index) => ({
      id: 1001 + index,
      ...Object.fromEntries(fields.map((name) => [name, '1.00']))
    }))
  }
  const after: ResultFixture = {
    columns: [{ name: 'id', type: 'integer' }, ...fields.map((name) => ({ name, type: 'text' }))],
    rows: before.rows.map((row) => ({ ...row, field_01: '2.00' }))
  }
  const { state, execute, sqlScope } = await prepare(page, info.project.name, before)
  await execute()
  await capture(page, sqlScope, 25)
  await execute(after)
  const requests = state.requests
  const drawer = await openComparison(page, sqlScope)
  await drawer.getByRole('button', { name: '开始对比', exact: true }).click()
  await expectCounts(drawer, 0, 0, 25, 0)
  const schemaCard = drawer
    .locator('.art-section-card')
    .filter({ has: page.getByText('字段结构变化', { exact: true }) })
  await expect(schemaCard.locator('.el-pagination')).toBeVisible()
  await expect(schemaCard.locator('.el-table__body-wrapper tbody tr')).toHaveCount(10)
  await schemaCard.locator('.el-pagination .el-pager .number').filter({ hasText: /^3$/ }).click()
  await expect(schemaCard.locator('.el-table__body-wrapper tbody tr')).toHaveCount(5)
  await expect(schemaCard.getByRole('cell', { name: 'field_25', exact: true })).toBeVisible()
  const changes = drawer
    .locator('.art-section-card')
    .filter({ has: page.getByText('结果差异', { exact: true }) })
  const body = changes.locator('.el-table__body-wrapper')
  const actions = changes.getByRole('button', { name: '查看详情', exact: true })
  await expect(actions).toHaveCount(20)
  await expect(changes.locator('.el-pagination')).toBeVisible()
  await expect
    .poll(() => body.evaluate((element) => element.getBoundingClientRect().height))
    .toBeGreaterThan(200)
  const pagedHeight = await body.evaluate((element) => element.getBoundingClientRect().height)
  await changes.locator('.el-pagination .btn-next').click()
  await expect(actions).toHaveCount(5)
  await expect(changes.locator('.el-pagination .el-pager .is-active')).toHaveText('2')
  await page.screenshot({ path: info.outputPath('comparison-multiple-pages.png') })
  const search = drawer.getByRole('textbox', { name: '搜索匹配键或字段', exact: true })
  await search.fill('1025')
  await expect(actions).toHaveCount(1)
  await expect(changes.locator('.el-pagination')).toHaveCount(0)
  await expect
    .poll(() => body.evaluate((element) => element.getBoundingClientRect().height))
    .toBeLessThan(pagedHeight - 100)
  await expectTableActionReady(page, changes, '查看详情')
  await actions.click()
  const detail = page.getByRole('dialog', { name: '对比行详情', exact: true })
  const detailBody = detail.locator('.el-table__body-wrapper')
  const onlyChanged = detail.getByRole('switch', { name: '仅看变更字段', exact: true })
  await expect(onlyChanged).toBeChecked()
  await expect(detail.locator('.el-table__body-wrapper tbody tr')).toHaveCount(1)
  await expect(detail.locator('.el-pagination')).toHaveCount(0)
  const singleHeight = await detailBody.evaluate(
    (element) => element.getBoundingClientRect().height
  )
  expect(singleHeight).toBeGreaterThan(20)
  await onlyChanged.locator('..').click()
  await expect(detail.locator('.el-pagination')).toBeVisible()
  await expect(detail.locator('.el-table__body-wrapper tbody tr')).toHaveCount(20)
  await expect
    .poll(() => detailBody.evaluate((element) => element.getBoundingClientRect().height))
    .toBeGreaterThan(singleHeight + 100)
  await detail.locator('.el-pagination .btn-next').click()
  await expect(detail.locator('.el-table__body-wrapper tbody tr')).toHaveCount(6)
  await expect(detail.getByRole('cell', { name: /^field_25/ })).toBeVisible()
  await page.screenshot({ path: info.outputPath('comparison-detail-pages.png') })
  await onlyChanged.locator('..').click()
  await expect(detail.locator('.el-table__body-wrapper tbody tr')).toHaveCount(1)
  await expect(detail.locator('.el-pagination')).toHaveCount(0)
  await expect(detail.getByRole('cell', { name: /^field_01/ })).toBeVisible()
  await expect
    .poll(() => detailBody.evaluate((element) => element.getBoundingClientRect().height))
    .toBeLessThan(singleHeight + 5)
  await detail.getByRole('button', { name: '返回对比', exact: true }).click()
  await search.clear()
  await expect(actions).toHaveCount(20)
  await expect(changes.locator('.el-pagination .el-pager .is-active')).toHaveText('1')
  expect(state.requests).toBe(requests)
  expect(state.executions).toBe(2)
})

test('invalid match keys recover with a composite key and zero current rows remain comparable', async ({
  page
}, info) => {
  test.skip(info.project.name !== 'desktop-1440', '键错误与空结果使用单个桌面场景验证')
  const keyColumns = ['id', 'group', 'code', 'nullable_key', 'value'].map((name) => ({ name }))
  const keyRows = [
    { id: 1, group: 'A', code: 'X', nullable_key: null, value: 'stable-a' },
    { id: 1, group: 'A', code: 'Y', nullable_key: null, value: 'before' },
    { id: 2, group: 'B', code: 'X', nullable_key: null, value: 'stable-b' },
    { id: 2, group: 'B', code: 'Y', nullable_key: null, value: 'stable-c' }
  ]
  const base = { columns: keyColumns, rows: keyRows, truncated: true }
  const { state, execute, sqlScope } = await prepare(page, info.project.name, base)
  await execute()
  await capture(page, sqlScope, 4)
  await execute({
    ...base,
    rows: [keyRows[3], keyRows[2], { ...keyRows[1], value: 'after' }, keyRows[0]]
  })
  const drawer = await openComparison(page, sqlScope)
  await drawer.getByRole('button', { name: '开始对比', exact: true }).click()
  await expect(drawer.locator('p').filter({ hasText: /唯一键重复/ })).toBeVisible()
  await selectKeys(
    page,
    drawer,
    ['nullable_key'],
    keyColumns.map(({ name }) => name)
  )
  await drawer.getByRole('button', { name: '开始对比', exact: true }).click()
  await expect(drawer.locator('p').filter({ hasText: /基线第 1 行的唯一键为空/ })).toBeVisible()
  await selectKeys(
    page,
    drawer,
    ['group', 'code'],
    keyColumns.map(({ name }) => name)
  )
  await drawer.getByRole('button', { name: '开始对比', exact: true }).click()
  await expectCounts(drawer, 0, 0, 1, 3)
  await page.screenshot({ path: info.outputPath('comparison-composite-recovered.png') })
  await drawer.getByRole('button', { name: '返回结果表', exact: true }).click()
  await execute({ ...base, rows: [] })
  const requests = state.requests
  await openComparison(page, sqlScope)
  await selectKeys(
    page,
    drawer,
    ['group', 'code'],
    keyColumns.map(({ name }) => name)
  )
  await drawer.getByRole('button', { name: '开始对比', exact: true }).click()
  await expectCounts(drawer, 0, 4, 0, 0)
  await expect(drawer.getByRole('button', { name: '查看详情', exact: true })).toHaveCount(4)
  await expect(drawer).toContainText('基线与当前结果已达到返回上限')
  expect(state.requests).toBe(requests)
  expect(state.executions).toBe(3)
  await page.screenshot({ path: info.outputPath('comparison-empty-current.png') })
})

test('ordinary API comparison retains a baseline across parameters and invalidates changed API ownership', async ({
  page
}, info) => {
  test.skip(info.project.name !== 'desktop-1440', '普通API所有权使用单个桌面场景验证')
  const apiBase = {
    description: '普通用户授权数据对比',
    sql: '',
    tenantId,
    allowedUserIds: [],
    parameters: [{ name: 'sample', type: 'string', required: true }],
    maxRows: 200,
    timeoutMs: 10000,
    enabled: true,
    updatedAt: '2026-10-31T01:00:00.000001Z'
  }
  const definitions = [
    {
      ...apiBase,
      id: '00000000-0000-4000-8000-000000000101',
      slug: 'comparison-orders-a',
      name: '普通对比 A'
    },
    {
      ...apiBase,
      id: '00000000-0000-4000-8000-000000000102',
      slug: 'comparison-orders-b',
      name: '普通对比 B'
    }
  ]
  let apiCalls = 0
  const apiScopes: (string | undefined)[] = []
  let pendingStarted = false
  let releaseInvocation: (() => void) | undefined
  await page.route('**/functions/v1/sql-query-api**', async (route) => {
    const body = route.request().postDataJSON() as {
      action?: string
      params?: Record<string, unknown>
    }
    if (body.action === 'list')
      return route.fulfill({ json: { definitions, canManage: false, users: [] } })
    apiCalls++
    apiScopes.push(route.request().headers()['x-art-tenant-scope'])
    if (body.params?.sample === 'pending') {
      pendingStarted = true
      await new Promise<void>((resolve) => {
        releaseInvocation = resolve
      })
    }
    return route.fulfill({
      json: {
        status: 'ok',
        rows:
          body.params?.sample === 'before'
            ? [
                { id: 1, amount: '1.00', tenant_id: tenantId },
                { id: 2, amount: '2.00', tenant_id: tenantId }
              ]
            : [
                { id: 2, amount: '3.00', tenant_id: tenantId },
                { id: 1, amount: '1.00', tenant_id: tenantId }
              ],
        columns: [{ name: 'id' }, { name: 'amount' }, { name: 'tenant_id' }],
        rowCount: 2,
        truncated: false,
        durationMs: 2,
        maxRows: 200,
        timeoutMs: 10000
      }
    })
  })
  const { state } = await prepare(page, info.project.name, baseline, true)
  await expect(page.getByRole('button', { name: '执行 SQL', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '查询 API', exact: true }).click()
  const manager = page.getByRole('dialog', { name: '查询 API', exact: true })
  const invoke = async (sample = 'after') => {
    await manager.getByRole('textbox', { name: 'API 参数 sample', exact: true }).fill(sample)
    const calls = apiCalls
    await manager.getByRole('button', { name: '调用 API', exact: true }).click()
    await expect.poll(() => apiCalls).toBe(calls + 1)
    await expect(manager.getByRole('button', { name: '调用 API', exact: true })).toBeEnabled()
    await expect(manager.getByRole('button', { name: '结果对比', exact: true })).toBeEnabled()
  }
  await invoke('before')
  await capture(page, manager, 2)
  const effectiveTenant = await page.evaluate(async (forgedTenant) => {
    const scopePath = '/src/utils/tenant-scope-context.ts'
    const scope = (await import(scopePath)) as typeof import('../../src/utils/tenant-scope-context')
    scope.writePlatformTenantScopeActive(true)
    scope.writeTenantScopeId(forgedTenant)
    const storePath = '/src/store/modules/tenant-scope.ts'
    const { useTenantScopeStore } = (await import(
      storePath
    )) as typeof import('../../src/store/modules/tenant-scope')
    return useTenantScopeStore().effectiveTenantId
  }, tenantB)
  expect(effectiveTenant).toBe(tenantId)
  await manager.getByRole('textbox', { name: 'API 参数 sample', exact: true }).fill('pending')
  await manager.getByRole('button', { name: '调用 API', exact: true }).click()
  await expect.poll(() => pendingStarted).toBe(true)
  await manager.getByRole('button', { name: '结果对比', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: '打开结果对比', exact: true })).toBeDisabled()
  await expect(page.getByRole('dialog', { name: '结果对比', exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  if (!releaseInvocation) throw new Error('API 调用未进入等待状态')
  releaseInvocation()
  await expect(manager.getByRole('button', { name: '调用 API', exact: true })).toBeEnabled()
  const drawer = await openComparison(page, manager)
  await drawer.getByRole('button', { name: '开始对比', exact: true }).click()
  await expectCounts(drawer, 0, 0, 1, 1)
  await expect(drawer.getByText('2 行 · 2 列', { exact: true })).toHaveCount(2)
  expect(apiScopes).toEqual([undefined, tenantB])
  const exported = page.waitForEvent('download')
  await drawer.getByRole('button', { name: '下载对比 JSON', exact: true }).click()
  const exportedPath = await (await exported).path()
  if (!exportedPath) throw new Error('普通用户对比未生成 JSON 下载')
  const exportedText = await readFile(exportedPath, 'utf8')
  expect(exportedText).not.toContain('tenant_id')
  expect(exportedText).not.toContain(tenantId)
  expect(apiCalls).toBe(2)
  await page.screenshot({ path: info.outputPath('comparison-ordinary-api.png') })
  await drawer.getByRole('button', { name: '返回结果表', exact: true }).click()
  definitions[0].updatedAt = '2026-10-31T01:00:00.000002Z'
  await manager.getByRole('button', { name: '刷新 API', exact: true }).click()
  await invoke()
  await noBaseline(page, manager)
  await capture(page, manager, 2)
  await manager.getByRole('button', { name: /普通对比 B/ }).click()
  await invoke()
  await noBaseline(page, manager)
  await capture(page, manager, 2)
  definitions[1].enabled = false
  await manager.getByRole('button', { name: '刷新 API', exact: true }).click()
  await expect(manager.getByRole('button', { name: '调用 API', exact: true })).toBeDisabled()
  definitions[1].enabled = true
  await manager.getByRole('button', { name: '刷新 API', exact: true }).click()
  await invoke()
  await noBaseline(page, manager)
  await capture(page, manager, 2)
  await openComparison(page, manager)
  await page.evaluate(async () => {
    const path = '/src/store/modules/user.ts'
    const { useUserStore } = (await import(path)) as typeof import('../../src/store/modules/user')
    const user = useUserStore()
    user.setUserInfo({ ...user.getUserInfo, userId: '00000000-0000-4000-8000-000000000004' })
  })
  await expect(drawer).toHaveCount(0)
  await expect(manager).toHaveCount(0)
  expect(state.executions).toBe(0)
})

test('role, tenant and database changes clear the open comparison and never restore an old baseline', async ({
  page
}, info) => {
  test.skip(info.project.name !== 'desktop-1440', '作用域清理使用单个桌面场景验证')
  let externalQueries = 0
  await page.route('http://127.0.0.1:4319/**', (route) => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization,content-type,x-art-tenant-scope'
    }
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (pathname === '/snapshot')
      return route.fulfill({
        headers,
        json: {
          canManage: true,
          users: [],
          connections: [
            {
              id: '00000000-0000-4000-8000-000000000201',
              name: '对比隔离库',
              dialect: 'postgres',
              host: 'localhost',
              port: 5432,
              database: 'comparison_test',
              username: 'reader',
              tenantId,
              allowedUserIds: [actorId],
              enabled: true,
              tls: false,
              updatedAt: '2026-10-31T00:00:00Z'
            }
          ]
        }
      })
    if (pathname.endsWith('/metadata')) return route.fulfill({ headers, json: emptyMetadata })
    if (pathname.endsWith('/query')) {
      externalQueries++
      return route.fulfill({
        headers,
        json: {
          status: 'ok',
          rows: [{ id: 99 }],
          columns: [{ name: 'id' }],
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
  const { state, execute, sqlScope } = await prepare(page, info.project.name)
  await execute()
  await capture(page, sqlScope, 6)
  const drawer = await openComparison(page, sqlScope)
  await drawer.getByRole('button', { name: '开始对比', exact: true }).click()
  await expectCounts(drawer, 0, 0, 0, 6)
  const setRole = (platformSuper: boolean) =>
    page.evaluate(async (platformSuper) => {
      const path = '/src/store/modules/user.ts'
      const { useUserStore } = (await import(path)) as typeof import('../../src/store/modules/user')
      const user = useUserStore()
      user.setUserInfo({ ...user.getUserInfo, platformSuper })
    }, platformSuper)
  await setRole(false)
  await expect(drawer).toHaveCount(0)
  await noBaseline(page, sqlScope)
  await setRole(true)
  await capture(page, sqlScope, 6)
  await page.evaluate(async () => {
    const path = '/src/store/modules/tenant-scope.ts'
    const { useTenantScopeStore } = (await import(
      path
    )) as typeof import('../../src/store/modules/tenant-scope')
    useTenantScopeStore().setTenantScope(null)
  })
  await execute()
  expect(state.scopes.at(-1)).toBeUndefined()
  await noBaseline(page, sqlScope)
  await capture(page, sqlScope, 6)
  await page.evaluate(async (tenant) => {
    const path = '/src/utils/tenant-scope-context.ts'
    const scope = (await import(path)) as typeof import('../../src/utils/tenant-scope-context')
    scope.writeTenantScopeId(tenant)
    window.dispatchEvent(new CustomEvent('sql-preview-tenant-change', { detail: tenant }))
  }, tenantB)
  await expect(page.locator('.result-table-container')).toHaveCount(0)
  await page.evaluate(async (tenant) => {
    const path = '/src/utils/tenant-scope-context.ts'
    const scope = (await import(path)) as typeof import('../../src/utils/tenant-scope-context')
    scope.writeTenantScopeId(tenant)
    window.dispatchEvent(new CustomEvent('sql-preview-tenant-change', { detail: tenant }))
  }, tenantId)
  await execute()
  await noBaseline(page, sqlScope)
  await capture(page, sqlScope, 6)
  await page.getByRole('button', { name: '连接管理', exact: true }).click()
  const manager = page.getByRole('dialog', { name: '数据库连接', exact: true })
  await manager
    .locator('.connection-manager__item')
    .filter({ hasText: '对比隔离库' })
    .getByRole('button', { name: '使用', exact: true })
    .click()
  await expect(manager).toHaveCount(0)
  await page.getByRole('button', { name: '执行 SQL', exact: true }).click()
  await expect.poll(() => externalQueries).toBe(1)
  await expect(sqlScope.getByRole('button', { name: '结果对比', exact: true })).toBeEnabled()
  await noBaseline(page, sqlScope)
  expect(state.executions).toBe(3)
  expect(state.scopes).toEqual([tenantId, undefined, tenantId])
})
