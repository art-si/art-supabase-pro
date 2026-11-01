import { expect, test, type Download, type Locator, type Page } from '@playwright/test'
import ExcelJS from 'exceljs'
import { readFile } from 'node:fs/promises'
import { prepareIsolatedSession } from './support/isolated-session'
import { prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

const tenantA = '00000000-0000-4000-8000-000000000001'
const tenantB = '00000000-0000-4000-8000-000000000002'
const actorId = '00000000-0000-4000-8000-000000000003'
const precise = '12345678901234567890.1234567890123456789'
const jsonText = '{"large":12345678901234567890,"decimal":0.1234567890123456789}'
const query = 'SELECT * FROM public.export_sample;'
const columns = [
  { name: 'id', type: 'integer' },
  { name: 'tenant_id', type: 'uuid' },
  { name: 'label', type: 'text' },
  { name: 'amount', type: 'numeric' },
  { name: '10', type: 'text' },
  { name: '2', type: 'text' },
  { name: 'nullable', type: 'text' },
  { name: 'payload', type: 'jsonb' },
  { name: 'formula', type: 'text' },
  { name: 'optional', type: 'text' },
  { name: '__proto__', type: 'text' },
  { name: 'constructor', type: 'text' },
  { name: 'hasOwnProperty', type: 'text' },
  { name: 'enabled', type: 'boolean' }
]
interface ResultFixture {
  rows: Record<string, unknown>[]
  columns: { name: string; type?: string }[]
  truncated?: boolean
}
const frameworkColumns = [
  { name: '__v_raw', type: 'jsonb' },
  { name: '__v_isRef', type: 'boolean' },
  { name: '__v_isReactive', type: 'boolean' },
  { name: '__v_isReadonly', type: 'boolean' },
  { name: '__v_skip', type: 'boolean' },
  { name: 'value', type: 'text' }
]
const ownNested = Object.fromEntries([
  ['hasOwnProperty', 'nested-original'],
  ['__proto__', 'nested-prototype'],
  ['constructor', 'nested-constructor'],
  ['__v_isRef', true],
  ['value', 'nested-database-value'],
  ['__v_raw', { marker: 'nested-database-raw' }]
])
const ownFields: ResultFixture = {
  columns: [
    ...columns.filter(({ name }) =>
      [
        'id',
        'tenant_id',
        'label',
        'hasOwnProperty',
        '__proto__',
        'constructor',
        'payload'
      ].includes(name)
    ),
    ...frameworkColumns
  ],
  rows: [
    Object.fromEntries([
      ['id', 1],
      ['tenant_id', tenantA],
      ['label', 'normal-first'],
      ['hasOwnProperty', 'raw-own-1'],
      ['__proto__', 'raw-prototype-1'],
      ['constructor', 'raw-constructor-1'],
      ['payload', ownNested],
      ['undeclared_extra', 'not-a-draft-field']
    ]),
    {
      id: 2,
      tenant_id: tenantA,
      label: 'flagged-second',
      hasOwnProperty: 'raw-own-2',
      __v_raw: { marker: 'database-raw-two' },
      __v_isRef: true,
      value: 'database-value-two',
      __v_isReactive: true,
      __v_isReadonly: false,
      __v_skip: false,
      payload: { hasOwnProperty: 'nested-two' }
    },
    {
      id: 3,
      tenant_id: tenantA,
      label: 'skipped-third',
      hasOwnProperty: 'raw-own-3',
      __v_skip: true,
      __v_isReadonly: true,
      __v_isReactive: false,
      payload: { value: 'ordinary-nested-value' }
    }
  ]
}
const raw: ResultFixture = {
  columns,
  truncated: true,
  rows: Array.from({ length: 4 }, (_, index) =>
    Object.fromEntries([
      ['id', index + 1],
      ['tenant_id', tenantA],
      ['label', `row-${index + 1}`],
      ['amount', index === 0 ? precise : `${index + 1}.00`],
      ['10', `ten-${index + 1}`],
      ['2', `two-${index + 1}`],
      ['nullable', null],
      ['payload', index === 0 ? jsonText : { exact: precise, nested: [true, null, 7] }],
      ['formula', ['=SUM(1,2)', '+SUM(1,2)', '-1+2', '@SUM(1,2)'][index]],
      ...(index === 1 ? [] : [['optional', 'present']]),
      ['__proto__', `prototype-${index + 1}`],
      ['constructor', `constructor-${index + 1}`],
      ['hasOwnProperty', `own-${index + 1}`],
      ['enabled', index % 2 === 0],
      ['unlisted_secret', 'never-export-this-property']
    ])
  )
}
const columnMetadata = [...columns, ...frameworkColumns].map((column) => ({
  name: column.name,
  dataType: column.type,
  isNullable: !['id', 'tenant_id'].includes(column.name),
  isPrimaryKey: column.name === 'id'
}))
const metadata = {
  schemas: ['public'],
  tables: [
    {
      tableSchema: 'public',
      tableName: 'export_sample',
      kind: 'table',
      columns: columnMetadata
    }
  ],
  columns: columnMetadata.map((column, index) => ({
    tableSchema: 'public',
    tableName: 'export_sample',
    columnName: column.name,
    dataType: column.dataType,
    isNullable: column.isNullable ? 'YES' : 'NO',
    isPrimaryKey: column.isPrimaryKey,
    ordinalPosition: index + 1
  })),
  functions: [],
  foreignKeys: []
}

async function prepare(page: Page, project: string, result = raw, ordinary = false) {
  page.setDefaultTimeout(15_000)
  page.setDefaultNavigationTimeout(60_000)
  await prepareIsolatedSession(page)
  await prepareAppearance(page, {
    theme: project.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !project.includes('shadow')
  })
  await page.addInitScript(
    ({ ordinary, tenantA }) => {
      if (ordinary) {
        sessionStorage.removeItem('art-platform-tenant-scope-active')
        sessionStorage.removeItem('art-platform-tenant-scope-id')
      } else {
        sessionStorage.setItem('art-platform-tenant-scope-active', '1')
        sessionStorage.setItem('art-platform-tenant-scope-id', tenantA)
      }
    },
    { ordinary, tenantA }
  )
  const state = { result, requests: 0, executions: 0, scopes: [] as (string | undefined)[] }
  await page.route('**/functions/v1/execute-sql-with-columns', (route) => {
    state.requests++
    const body = route.request().postDataJSON() as { action?: string }
    if (body.action === 'metadata') return route.fulfill({ json: metadata })
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
    `/tests/e2e/fixtures/sql-console-metadata.html?actor=${actorId}&tenant=${tenantA}${ordinary ? '&ordinary=1' : ''}`
  )
  const editor = page
    .locator('.monaco-editor')
    .getByRole('textbox', { name: 'SQL 编辑器', exact: true })
  await expect(page.locator('.monaco-editor')).toBeVisible()
  await editor.focus()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText(query)
  const scope = page.locator('.result-section > .tabs-header')
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
    await expect(scope.getByRole('button', { name: '导出查询结果', exact: true })).toBeEnabled()
  }
  return { state, execute, scope, editor }
}

async function exportResult(
  page: Page,
  scope: Locator,
  format: 'Excel' | 'JSON（保留类型）',
  trigger = '导出查询结果'
): Promise<Download> {
  await scope.getByRole('button', { name: trigger, exact: true }).click()
  const pending = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: `导出 ${format}`, exact: true }).click()
  return pending
}

async function downloadPath(download: Download) {
  const path = await download.path()
  if (!path) throw new Error('结果导出未生成文件')
  return path
}

async function readJson(download: Download) {
  const text = await readFile(await downloadPath(download), 'utf8')
  const json: unknown = JSON.parse(text)
  return { text, json }
}

async function readWorkbook(download: Download) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(await downloadPath(download))
  return workbook.worksheets[0]
}

async function delayExcelModule(page: Page) {
  let requested = false
  let release: (() => void) | undefined
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/src/utils/file/sheetjs.ts*', async (route) => {
    requested = true
    await gate
    await route.continue()
  })
  return {
    wait: () => expect.poll(() => requested).toBe(true),
    finish: async () => {
      release?.()
      await page.evaluate(async () => {
        const path = '/src/utils/file/sheetjs.ts'
        await import(path)
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
      })
    }
  }
}

test('raw Excel and typed JSON retain hidden filtered rows, exact text and original values during editing', async ({
  page
}, info) => {
  const { state, execute, scope, editor } = await prepare(page, info.project.name)
  await execute()
  const grid = page.locator('.result-table-container')
  await expect(grid.getByText('row-1', { exact: true })).toBeVisible()
  const requests = state.requests
  const search = grid.getByRole('textbox', { name: '搜索已加载结果', exact: true })
  await search.fill('own-2')
  await expect(grid.locator('.sql-result-tools').getByRole('status')).toContainText('匹配 1 行')
  const ownCell = grid.getByRole('button', { name: '查看 hasOwnProperty 内容', exact: true })
  await expect(ownCell).toHaveText('own-2')
  await ownCell.click()
  const detail = page.getByRole('dialog', { name: '单元格详情', exact: true })
  await expect(detail.locator('code')).toHaveText('own-2')
  await detail.getByRole('button', { name: '关闭', exact: true }).last().click()
  await search.fill('row-4')
  await expect(grid.locator('.sql-result-tools').getByRole('status')).toContainText('匹配 1 行')
  await expect(grid.getByText('row-4', { exact: true })).toBeVisible()
  await grid.getByRole('button', { name: '设置显示列', exact: true }).click()
  const popup = page.locator('.el-popover:visible').filter({
    has: page.getByRole('group', { name: '列显示预设', exact: true })
  })
  await popup.getByText('amount', { exact: true }).click()
  await popup.getByText('__proto__', { exact: true }).click()
  await popup.getByRole('button', { name: '关闭列设置', exact: true }).click()
  await scope.getByRole('button', { name: '导出查询结果', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: /已加载 4 行/ })).toContainText('已达返回上限')
  await page.screenshot({ path: info.outputPath('raw-export-menu.png') })
  await page.keyboard.press('Escape')
  const workbookDownload = await exportResult(page, scope, 'Excel')
  await info.attach('raw-result-workbook', {
    path: await downloadPath(workbookDownload),
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
  const sheet = await readWorkbook(workbookDownload)
  expect(sheet.rowCount).toBe(5)
  expect(sheet.getRow(1).values).toEqual([undefined, ...columns.map(({ name }) => name)])
  const cell = (row: number, name: string) =>
    sheet.getCell(row, columns.findIndex((column) => column.name === name) + 1)
  expect(cell(2, 'amount').value).toBe(precise)
  expect(cell(2, 'payload').value).toBe(jsonText)
  expect(cell(2, 'nullable').value).toBe('NULL')
  expect(cell(2, 'enabled').value).toBe('true')
  expect(cell(3, 'payload').value).toBe(JSON.stringify({ exact: precise, nested: [true, null, 7] }))
  for (let index = 0; index < 4; index++) {
    expect(cell(index + 2, 'formula').type).toBe(ExcelJS.ValueType.String)
    expect(cell(index + 2, 'formula').value).toBe(raw.rows[index].formula)
    expect(cell(index + 2, '__proto__').value).toBe(`prototype-${index + 1}`)
    expect(cell(index + 2, 'constructor').value).toBe(`constructor-${index + 1}`)
    expect(cell(index + 2, 'hasOwnProperty').value).toBe(`own-${index + 1}`)
  }
  const original = await readJson(await exportResult(page, scope, 'JSON（保留类型）'))
  expect(original.json).toMatchObject({
    format: 'sql-result-snapshot',
    version: 1,
    scope: 'loaded-authorized-results',
    query,
    truncated: true,
    rowCount: 4,
    capturedAt: expect.any(String),
    estimatedBytes: expect.any(Number),
    label: expect.any(String),
    columns: columns.map(({ name }) => ({ name })),
    rows: expect.arrayContaining([
      expect.objectContaining({
        type: 'object',
        entries: expect.arrayContaining([
          ['id', { type: 'number', value: '1' }],
          ['amount', { type: 'string', value: precise }],
          ['nullable', { type: 'null' }],
          ['payload', { type: 'string', value: jsonText }],
          ['__proto__', { type: 'string', value: 'prototype-1' }],
          ['enabled', { type: 'boolean', value: true }]
        ])
      }),
      expect.objectContaining({
        type: 'object',
        entries: expect.arrayContaining([
          ['id', { type: 'number', value: '2' }],
          [
            'payload',
            {
              type: 'object',
              entries: [
                ['exact', { type: 'string', value: precise }],
                [
                  'nested',
                  {
                    type: 'array',
                    value: [
                      { type: 'boolean', value: true },
                      { type: 'null' },
                      { type: 'number', value: '7' }
                    ]
                  }
                ]
              ]
            }
          ]
        ])
      })
    ])
  })
  expect(original.json).toHaveProperty('rows.length', 4)
  expect(original.json).toMatchObject({
    rows: [{}, { entries: expect.not.arrayContaining([['optional', expect.anything()]]) }, {}, {}]
  })
  expect(original.text).not.toContain('unlisted_secret')
  expect(original.text).not.toContain('never-export-this-property')
  await grid.getByRole('button', { name: '编辑副本', exact: true }).click()
  await grid.getByRole('button', { name: '编辑第 1 行 label', exact: true }).dblclick()
  await page.getByRole('textbox', { name: '编辑值 label', exact: true }).fill('draft-only')
  await page.getByRole('button', { name: '保留修改', exact: true }).click()
  await expect(grid).toContainText('已修改 1 行 / 1 处')
  await editor.focus()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText("SELECT 'unsent draft';")
  const edited = await readJson(await exportResult(page, scope, 'JSON（保留类型）'))
  expect(edited.json).toMatchObject({ query, rowCount: 4 })
  expect(edited.text).toContain('row-1')
  expect(edited.text).not.toContain('draft-only')
  expect(edited.text).not.toContain('unsent draft')
  expect(state.requests).toBe(requests)
  expect(state.executions).toBe(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
})

test('own fields and Vue-shaped database values survive draft editing, history and change downloads', async ({
  page
}, info) => {
  test.skip(info.project.name !== 'desktop-1440', '特殊字段编辑历史使用桌面代表视口')
  const { state, execute, scope } = await prepare(page, info.project.name, ownFields)
  await execute()
  const grid = page.locator('.result-table-container')
  const requests = state.requests
  const rawJson = await readJson(await exportResult(page, scope, 'JSON（保留类型）'))
  expect(rawJson.json).toMatchObject({
    rowCount: 3,
    rows: expect.arrayContaining([
      expect.objectContaining({
        entries: expect.arrayContaining([
          ['hasOwnProperty', { type: 'string', value: 'raw-own-1' }],
          [
            'payload',
            {
              type: 'object',
              entries: expect.arrayContaining([
                ['hasOwnProperty', { type: 'string', value: 'nested-original' }],
                ['__v_isRef', { type: 'boolean', value: true }],
                ['value', { type: 'string', value: 'nested-database-value' }]
              ])
            }
          ]
        ])
      }),
      expect.objectContaining({
        entries: expect.arrayContaining([
          ['id', { type: 'number', value: '2' }],
          [
            '__v_raw',
            { type: 'object', entries: [['marker', { type: 'string', value: 'database-raw-two' }]] }
          ],
          ['__v_isRef', { type: 'boolean', value: true }],
          ['__v_skip', { type: 'boolean', value: false }],
          ['value', { type: 'string', value: 'database-value-two' }]
        ])
      }),
      expect.objectContaining({
        entries: expect.arrayContaining([
          ['id', { type: 'number', value: '3' }],
          ['__v_skip', { type: 'boolean', value: true }],
          ['__v_isReadonly', { type: 'boolean', value: true }]
        ])
      })
    ])
  })
  expect(rawJson.text).not.toContain('undeclared_extra')
  await grid.getByRole('button', { name: '编辑副本', exact: true }).click()
  await expect(grid.getByRole('button', { name: '编辑第 2 行 __v_skip', exact: true })).toHaveText(
    'false'
  )
  await expect(grid.getByRole('button', { name: '编辑第 1 行 id', exact: true })).toHaveCount(0)
  await expect(
    grid.getByRole('button', { name: '编辑第 1 行 tenant_id', exact: true })
  ).toHaveCount(0)
  const edit = async (field: string, before: string, after: string, row = 1) => {
    await grid.getByRole('button', { name: `编辑第 ${row} 行 ${field}`, exact: true }).dblclick()
    const input = page.getByRole('textbox', { name: `编辑值 ${field}`, exact: true })
    await expect(input).toHaveValue(before)
    await input.fill(after)
    await page.getByRole('button', { name: '保留修改', exact: true }).click()
    await expect(
      grid.getByRole('button', { name: `编辑第 ${row} 行 ${field}`, exact: true })
    ).toHaveText(after)
  }
  await edit('hasOwnProperty', 'raw-own-1', 'edited-own-1')
  await grid.getByRole('button', { name: '撤销结果修改', exact: true }).click()
  await expect(grid).toContainText('已修改 0 行 / 0 处')
  await expect(
    grid.getByRole('button', { name: '编辑第 1 行 hasOwnProperty', exact: true })
  ).toHaveText('raw-own-1')
  await grid.getByRole('button', { name: '重做结果修改', exact: true }).click()
  await expect(
    grid.getByRole('button', { name: '编辑第 1 行 hasOwnProperty', exact: true })
  ).toHaveText('edited-own-1')
  await edit('__proto__', 'raw-prototype-1', 'edited-prototype-1')
  await edit('constructor', 'raw-constructor-1', 'edited-constructor-1')
  await edit('label', 'normal-first', 'normal-edited')
  await grid.getByRole('button', { name: '撤销结果修改', exact: true }).click()
  await expect(grid.getByRole('button', { name: '编辑第 1 行 label', exact: true })).toHaveText(
    'normal-first'
  )
  await grid.getByRole('button', { name: '重做结果修改', exact: true }).click()
  await expect(grid).toContainText('已修改 1 行 / 4 处')
  await edit('label', 'flagged-second', 'flagged-second-edited', 2)
  await expect(grid).toContainText('已修改 2 行 / 5 处')
  await grid.getByRole('button', { name: '编辑第 1 行 payload', exact: true }).dblclick()
  const payloadEditor = page.getByRole('dialog', { name: '编辑 payload', exact: true })
  await expect(payloadEditor.locator('.view-lines')).toContainText('nested-database-raw')
  const displayedJson = await payloadEditor.locator('.view-lines').innerText()
  const draftPayload: unknown = JSON.parse(displayedJson.replaceAll('\u00a0', ' '))
  expect(draftPayload).toEqual(ownNested)
  await payloadEditor.getByRole('button', { name: '取消', exact: true }).click()
  await grid.getByRole('button', { name: '变更预览', exact: true }).click()
  const review = page.getByRole('dialog', { name: '结果变更预览', exact: true })
  await expect(
    review.getByRole('button', { name: '查看第 1 行 hasOwnProperty原值', exact: true })
  ).toHaveText('raw-own-1')
  await expect(
    review.getByRole('button', { name: '查看第 1 行 hasOwnProperty新值', exact: true })
  ).toHaveText('edited-own-1')
  await review.getByRole('button', { name: '查看第 2 行 label原值', exact: true }).click()
  const valueDetail = page.getByRole('dialog', { name: '单元格详情', exact: true })
  await expect(valueDetail.locator('code')).toHaveText('flagged-second')
  await valueDetail.getByRole('button', { name: '关闭', exact: true }).last().click()
  const pending = page.waitForEvent('download')
  await review.getByRole('button', { name: '下载变更 JSON', exact: true }).click()
  const changes = await readJson(await pending)
  expect(changes.json).toMatchObject({
    databaseWritten: false,
    changes: expect.arrayContaining([
      {
        row: 1,
        keys: { id: '1' },
        field: 'hasOwnProperty',
        original: 'raw-own-1',
        value: 'edited-own-1'
      },
      {
        row: 1,
        keys: { id: '1' },
        field: '__proto__',
        original: 'raw-prototype-1',
        value: 'edited-prototype-1'
      },
      {
        row: 1,
        keys: { id: '1' },
        field: 'constructor',
        original: 'raw-constructor-1',
        value: 'edited-constructor-1'
      },
      {
        row: 1,
        keys: { id: '1' },
        field: 'label',
        original: 'normal-first',
        value: 'normal-edited'
      },
      {
        row: 2,
        keys: { id: '2' },
        field: 'label',
        original: 'flagged-second',
        value: 'flagged-second-edited'
      }
    ])
  })
  expect(changes.json).toHaveProperty('changes.length', 5)
  expect(changes.text).not.toContain('undeclared_extra')
  await page.screenshot({ path: info.outputPath('own-field-draft-changes.png') })
  await review.getByRole('button', { name: '返回编辑', exact: true }).click()
  const original = await readJson(await exportResult(page, scope, 'JSON（保留类型）'))
  expect(original.text).not.toContain('edited-own-1')
  expect(original.text).toContain('raw-own-1')
  expect(state.requests).toBe(requests)
  expect(state.executions).toBe(1)
})

test('ordinary API own fields remain data after a new response and export only authorized columns', async ({
  page
}, info) => {
  test.skip(info.project.name !== 'desktop-1440', '普通API响应式结果使用桌面代表视口')
  const definition = {
    id: '00000000-0000-4000-8000-000000000151',
    name: '字段一致性 API',
    slug: 'ordinary-own-fields',
    description: '',
    sql: '',
    tenantId: tenantA,
    allowedUserIds: [],
    parameters: [{ name: 'sample', type: 'string', required: true }],
    maxRows: 200,
    timeoutMs: 10000,
    enabled: true,
    updatedAt: '2026-10-31T01:00:00.000001Z'
  }
  let calls = 0
  await page.route('**/functions/v1/sql-query-api**', (route) => {
    const body = route.request().postDataJSON() as { action?: string; params?: { sample?: string } }
    if (body.action === 'list')
      return route.fulfill({ json: { definitions: [definition], canManage: false, users: [] } })
    calls++
    const result =
      body.params?.sample === 'next'
        ? {
            ...ownFields,
            rows: ownFields.rows.map((row, index) =>
              index === 0 ? { ...row, hasOwnProperty: 'raw-own-next', label: 'normal-next' } : row
            )
          }
        : ownFields
    return route.fulfill({
      json: {
        status: 'ok',
        ...result,
        rowCount: result.rows.length,
        truncated: false,
        durationMs: 2,
        maxRows: 200,
        timeoutMs: 10000
      }
    })
  })
  const { state } = await prepare(page, info.project.name, raw, true)
  await page.getByRole('button', { name: '查询 API', exact: true }).click()
  const manager = page.getByRole('dialog', { name: '查询 API', exact: true })
  const invoke = async (sample: string) => {
    await manager.getByRole('textbox', { name: 'API 参数 sample', exact: true }).fill(sample)
    await manager.getByRole('button', { name: '调用 API', exact: true }).click()
    await expect(manager.getByRole('button', { name: '导出结果', exact: true })).toBeEnabled()
  }
  await invoke('first')
  let grid = manager.locator('.result-table-container')
  await grid.getByRole('textbox', { name: '搜索已加载结果', exact: true }).fill('raw-own-1')
  await expect(grid.locator('.sql-result-tools').getByRole('status')).toContainText('匹配 1 行')
  await expect(
    grid.getByRole('button', { name: '查看 hasOwnProperty 内容', exact: true })
  ).toHaveText('raw-own-1')
  await grid.getByRole('button', { name: '查看 payload 内容', exact: true }).click()
  const detail = page.getByRole('dialog', { name: '单元格详情', exact: true })
  await expect(detail.locator('code')).toContainText('nested-original')
  await expect(detail.locator('code')).toContainText('nested-database-raw')
  await detail.getByRole('button', { name: '关闭', exact: true }).last().click()
  await invoke('next')
  grid = manager.locator('.result-table-container')
  const search = grid.getByRole('textbox', { name: '搜索已加载结果', exact: true })
  await expect(search).toHaveValue('')
  await search.fill('raw-own-next')
  await expect(grid.locator('.sql-result-tools').getByRole('status')).toContainText('匹配 1 行')
  await expect(
    grid.getByRole('button', { name: '查看 hasOwnProperty 内容', exact: true })
  ).toHaveText('raw-own-next')
  await expect(grid.getByRole('button', { name: '查看 label 内容', exact: true })).toHaveText(
    'normal-next'
  )
  const exported = await readJson(await exportResult(page, manager, 'JSON（保留类型）', '导出结果'))
  expect(exported.json).toMatchObject({
    query: '',
    rowCount: 3,
    rows: expect.arrayContaining([
      expect.objectContaining({
        entries: expect.arrayContaining([
          ['hasOwnProperty', { type: 'string', value: 'raw-own-next' }],
          ['label', { type: 'string', value: 'normal-next' }],
          [
            'payload',
            {
              type: 'object',
              entries: expect.arrayContaining([
                [
                  '__v_raw',
                  {
                    type: 'object',
                    entries: [['marker', { type: 'string', value: 'nested-database-raw' }]]
                  }
                ]
              ])
            }
          ]
        ])
      })
    ])
  })
  expect(exported.text).not.toContain('tenant_id')
  expect(exported.text).not.toContain(tenantA)
  expect(exported.text).not.toContain('undeclared_extra')
  const sheet = await readWorkbook(await exportResult(page, manager, 'Excel', '导出结果'))
  const names = ownFields.columns.map(({ name }) => name).filter((name) => name !== 'tenant_id')
  expect(sheet.getRow(1).values).toEqual([undefined, ...names])
  expect(sheet.getCell(2, names.indexOf('hasOwnProperty') + 1).value).toBe('raw-own-next')
  expect(sheet.getCell(2, names.indexOf('payload') + 1).value).toBe(JSON.stringify(ownNested))
  expect(calls).toBe(2)
  expect(state.executions).toBe(0)
  await page.screenshot({ path: info.outputPath('ordinary-own-field-response.png') })
})

test('zero-row SELECT exports both a header-only workbook and typed field information', async ({
  page
}, info) => {
  test.skip(info.project.name !== 'desktop-1440', '空结果双格式使用桌面代表视口')
  const fields = [
    { name: 'id', type: 'integer' },
    { name: 'amount', type: 'numeric' }
  ]
  const { state, execute, scope } = await prepare(page, info.project.name, {
    rows: [],
    columns: fields
  })
  await execute()
  const requests = state.requests
  await scope.getByRole('button', { name: '导出查询结果', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: /已加载 0 行/ })).toContainText('可导出字段信息')
  await page.screenshot({ path: info.outputPath('empty-result-export.png') })
  await page.keyboard.press('Escape')
  const sheet = await readWorkbook(await exportResult(page, scope, 'Excel'))
  expect(sheet.rowCount).toBe(1)
  expect(sheet.getRow(1).values).toEqual([undefined, 'id', 'amount'])
  const { json } = await readJson(await exportResult(page, scope, 'JSON（保留类型）'))
  expect(json).toMatchObject({
    format: 'sql-result-snapshot',
    rowCount: 0,
    columns: fields,
    rows: [],
    query
  })
  expect(state.requests).toBe(requests)
  expect(state.executions).toBe(1)
})

test('ordinary API export projects allowed fields and cancels an old file while a new invocation is loading', async ({
  page
}, info) => {
  test.skip(info.project.name !== 'desktop-1440', '普通用户与加载竞态使用桌面代表视口')
  const gate = await delayExcelModule(page)
  const downloads: Download[] = []
  page.on('download', (download) => downloads.push(download))
  const definition = {
    id: '00000000-0000-4000-8000-000000000101',
    name: '普通导出 API',
    slug: 'ordinary-export',
    description: '',
    sql: '',
    tenantId: tenantA,
    allowedUserIds: [],
    parameters: [{ name: 'sample', type: 'string', required: true }],
    maxRows: 200,
    timeoutMs: 10000,
    enabled: true,
    updatedAt: '2026-10-31T01:00:00.000001Z'
  }
  const scopes: (string | undefined)[] = []
  let releaseInvocation: (() => void) | undefined
  await page.route('**/functions/v1/sql-query-api**', async (route) => {
    const body = route.request().postDataJSON() as { action?: string; params?: { sample?: string } }
    if (body.action === 'list')
      return route.fulfill({ json: { definitions: [definition], canManage: false, users: [] } })
    scopes.push(route.request().headers()['x-art-tenant-scope'])
    if (body.params?.sample === 'pending')
      await new Promise<void>((resolve) => {
        releaseInvocation = resolve
      })
    return route.fulfill({
      json: {
        status: 'ok',
        rows: [
          { id: 1, amount: precise, tenant_id: tenantA, unlisted_secret: 'api-private-extra' }
        ],
        columns: [
          { name: 'id', type: 'integer' },
          { name: 'amount', type: 'numeric' },
          { name: 'tenant_id', type: 'uuid' }
        ],
        rowCount: 1,
        truncated: false,
        durationMs: 2,
        maxRows: 200,
        timeoutMs: 10000
      }
    })
  })
  const { state } = await prepare(page, info.project.name, raw, true)
  await expect(page.getByRole('button', { name: '执行 SQL', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '查询 API', exact: true }).click()
  const manager = page.getByRole('dialog', { name: '查询 API', exact: true })
  const invoke = async (sample: string) => {
    await manager.getByRole('textbox', { name: 'API 参数 sample', exact: true }).fill(sample)
    await manager.getByRole('button', { name: '调用 API', exact: true }).click()
    await expect(manager.getByRole('button', { name: '调用 API', exact: true })).toBeEnabled()
    await expect(manager.getByRole('button', { name: '导出结果', exact: true })).toBeEnabled()
  }
  await invoke('own')
  const own = await readJson(await exportResult(page, manager, 'JSON（保留类型）', '导出结果'))
  expect(own.json).toMatchObject({
    query: '',
    rowCount: 1,
    columns: [{ name: 'id' }, { name: 'amount' }]
  })
  expect(own.text).not.toContain('tenant_id')
  expect(own.text).not.toContain('api-private-extra')
  const effectiveTenant = await page.evaluate(async (forged) => {
    const path = '/src/utils/tenant-scope-context.ts'
    const scope = (await import(path)) as typeof import('../../src/utils/tenant-scope-context')
    scope.writePlatformTenantScopeActive(true)
    scope.writeTenantScopeId(forged)
    const storePath = '/src/store/modules/tenant-scope.ts'
    const { useTenantScopeStore } = (await import(
      storePath
    )) as typeof import('../../src/store/modules/tenant-scope')
    return useTenantScopeStore().effectiveTenantId
  }, tenantB)
  expect(effectiveTenant).toBe(tenantA)
  await invoke('forged')
  await manager.getByRole('button', { name: '导出结果', exact: true }).click()
  await page.getByRole('menuitem', { name: '导出 Excel', exact: true }).click()
  await gate.wait()
  await manager.getByRole('textbox', { name: 'API 参数 sample', exact: true }).fill('pending')
  await manager.getByRole('button', { name: '调用 API', exact: true }).click()
  await expect.poll(() => Boolean(releaseInvocation)).toBe(true)
  await expect(manager.getByRole('button', { name: '导出结果', exact: true })).toBeDisabled()
  await gate.finish()
  expect(downloads).toHaveLength(1)
  if (!releaseInvocation) throw new Error('API 未进入等待状态')
  releaseInvocation()
  await expect(manager.getByRole('button', { name: '导出结果', exact: true })).toBeEnabled()
  const forged = await readJson(await exportResult(page, manager, 'JSON（保留类型）', '导出结果'))
  expect(forged.json).toMatchObject({ query: '', columns: [{ name: 'id' }, { name: 'amount' }] })
  expect(forged.text).not.toContain('tenant_id')
  expect(forged.text).not.toContain(tenantA)
  expect(forged.text).not.toContain('api-private-extra')
  const sheet = await readWorkbook(await exportResult(page, manager, 'Excel', '导出结果'))
  expect(sheet.getRow(1).values).toEqual([undefined, 'id', 'amount'])
  expect(sheet.getCell(2, 2).value).toBe(precise)
  expect(scopes).toEqual([undefined, tenantB, tenantB])
  expect(state.executions).toBe(0)
  await expect(page.locator('.el-message--error')).toHaveCount(0)
  await manager.getByRole('button', { name: '导出结果', exact: true }).click()
  await page.screenshot({ path: info.outputPath('ordinary-api-export.png') })
})

test('replacing the SQL result during Excel loading never downloads the old source', async ({
  page
}, info) => {
  test.skip(info.project.name !== 'desktop-1440', '源替换竞态使用桌面代表视口')
  const gate = await delayExcelModule(page)
  const downloads: Download[] = []
  page.on('download', (download) => downloads.push(download))
  const { state, execute, scope } = await prepare(page, info.project.name)
  await execute()
  await scope.getByRole('button', { name: '导出查询结果', exact: true }).click()
  await page.getByRole('menuitem', { name: '导出 Excel', exact: true }).click()
  await gate.wait()
  await execute({ columns: [{ name: 'id', type: 'integer' }], rows: [{ id: 99 }] })
  await gate.finish()
  expect(downloads).toHaveLength(0)
  const { json } = await readJson(await exportResult(page, scope, 'JSON（保留类型）'))
  expect(json).toMatchObject({
    rowCount: 1,
    columns: [{ name: 'id' }],
    rows: [{ type: 'object', entries: [['id', { type: 'number', value: '99' }]] }]
  })
  expect(state.executions).toBe(2)
  await expect(page.locator('.el-message--error')).toHaveCount(0)
})

test('platform all and selected exports preserve their transport scope and account changes cancel pending files', async ({
  page
}, info) => {
  test.skip(info.project.name !== 'desktop-1440', '平台作用域与身份竞态使用桌面代表视口')
  const gate = await delayExcelModule(page)
  const downloads: Download[] = []
  page.on('download', (download) => downloads.push(download))
  const all: ResultFixture = {
    columns: columns.slice(0, 2),
    rows: [
      { id: 1, tenant_id: tenantA },
      { id: 2, tenant_id: tenantB }
    ]
  }
  const { state, execute, scope } = await prepare(page, info.project.name, all)
  await page.evaluate(async () => {
    const path = '/src/store/modules/tenant-scope.ts'
    const { useTenantScopeStore } = (await import(
      path
    )) as typeof import('../../src/store/modules/tenant-scope')
    useTenantScopeStore().setTenantScope(null)
  })
  await execute()
  const allExport = await readJson(await exportResult(page, scope, 'JSON（保留类型）'))
  expect(allExport.json).toMatchObject({
    rowCount: 2,
    columns: [{ name: 'id' }, { name: 'tenant_id' }]
  })
  expect(allExport.text).toContain(tenantA)
  expect(allExport.text).toContain(tenantB)
  await page.evaluate(async (selected) => {
    const path = '/src/utils/tenant-scope-context.ts'
    const scope = (await import(path)) as typeof import('../../src/utils/tenant-scope-context')
    scope.writePlatformTenantScopeActive(true)
    scope.writeTenantScopeId(selected)
    window.dispatchEvent(new CustomEvent('sql-preview-tenant-change', { detail: selected }))
  }, tenantA)
  await execute({ columns: all.columns, rows: [all.rows[0]] })
  const selectedExport = await readJson(await exportResult(page, scope, 'JSON（保留类型）'))
  expect(selectedExport.json).toMatchObject({
    rowCount: 1,
    columns: [{ name: 'id' }, { name: 'tenant_id' }]
  })
  expect(selectedExport.text).toContain(tenantA)
  expect(selectedExport.text).not.toContain(tenantB)
  await scope.getByRole('button', { name: '导出查询结果', exact: true }).click()
  await page.getByRole('menuitem', { name: '导出 Excel', exact: true }).click()
  await gate.wait()
  await page.evaluate(async () => {
    const path = '/src/store/modules/user.ts'
    const { useUserStore } = (await import(path)) as typeof import('../../src/store/modules/user')
    const user = useUserStore()
    user.setUserInfo({ ...user.getUserInfo, userId: '00000000-0000-4000-8000-000000000004' })
  })
  await gate.finish()
  expect(downloads).toHaveLength(2)
  expect(state.scopes).toEqual([undefined, tenantA])
  expect(state.executions).toBe(2)
  await expect(page.locator('.el-message--error')).toHaveCount(0)
})
