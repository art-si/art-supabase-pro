import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const actorId = '00000000-0000-4000-8000-000000000003'
const tenantA = '00000000-0000-4000-8000-000000000001'
const tenantB = '00000000-0000-4000-8000-000000000002'
const lineSql = 'SELECT 1,\nSELCT 2;'
const lineMessage = 'SQL 语法错误，请检查关键字\nLINE 2: SELCT 2;\n        ^'

interface Reply {
  status?: number
  body: Record<string, unknown>
  wait?: Promise<void>
}

interface Marker {
  startLineNumber: number
  endLineNumber: number
  startColumn: number
  endColumn: number
  text: string
}

async function prepare(page: Page, project: string, replies: Reply[]) {
  page.setDefaultTimeout(15_000)
  page.setDefaultNavigationTimeout(60_000)
  await prepareIsolatedSession(page)
  await prepareAppearance(page, { theme: project.includes('dark') ? 'dark' : 'light' })
  await page.addInitScript((tenant) => {
    sessionStorage.setItem('art-platform-tenant-scope-active', '1')
    sessionStorage.setItem('art-platform-tenant-scope-id', tenant)
  }, tenantA)
  const state = { queries: [] as string[], replies: 0 }
  await page.route('**/functions/v1/execute-sql-with-columns', async (route) => {
    const body = route.request().postDataJSON() as { action?: string; query?: string }
    if (body.action === 'metadata')
      return route.fulfill({
        json: { schemas: ['public'], tables: [], columns: [], functions: [], foreignKeys: [] }
      })
    state.queries.push(body.query || '')
    const reply = replies[state.queries.length - 1]
    if (!reply) throw new Error('Unexpected SQL execution in error-location fixture')
    await reply.wait
    await route.fulfill({ status: reply.status ?? 500, json: reply.body })
    state.replies++
  })
  await page.goto(
    `/tests/e2e/fixtures/sql-console-metadata.html?actor=${actorId}&tenant=${tenantA}`
  )
  await expect(page.locator('.monaco-editor')).toBeVisible()
  return state
}

async function writeSql(page: Page, sql: string) {
  await page
    .locator('.monaco-editor')
    .getByRole('textbox', { name: 'SQL 编辑器', exact: true })
    .focus()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText(sql)
  // Monaco exposes EOL selection publicly. Keep the actual request CRLF where
  // the fixture tests PostgreSQL code-point positions across Windows newlines.
  await page.evaluate(async (crlf) => {
    const path = '/src/utils/monaco-runtime.ts'
    const { monaco } = (await import(path)) as typeof import('../../src/utils/monaco-runtime')
    const model = monaco.editor
      .getEditors()
      .find((editor) => editor.getContainerDomNode()?.closest('.editor-wrapper'))
      ?.getModel()
    if (!model) throw new Error('SQL editor model is not mounted')
    model.setEOL(crlf ? monaco.editor.EndOfLineSequence.CRLF : monaco.editor.EndOfLineSequence.LF)
  }, sql.includes('\r\n'))
}

async function markers(page: Page): Promise<Marker[]> {
  return page.evaluate(async () => {
    const path = '/src/utils/monaco-runtime.ts'
    const { monaco } = (await import(path)) as typeof import('../../src/utils/monaco-runtime')
    const model = monaco.editor
      .getEditors()
      .find((editor) => editor.getContainerDomNode()?.closest('.editor-wrapper'))
      ?.getModel()
    if (!model) throw new Error('SQL editor model is not mounted')
    return monaco.editor
      .getModelMarkers({ owner: 'sql-console', resource: model.uri })
      .map((item) => ({
        startLineNumber: item.startLineNumber,
        endLineNumber: item.endLineNumber,
        startColumn: item.startColumn,
        endColumn: item.endColumn,
        text: model.getValueInRange(item)
      }))
  })
}

const marker = (line: number, start: number, end: number, text: string): Marker => ({
  startLineNumber: line,
  endLineNumber: line,
  startColumn: start,
  endColumn: end,
  text
})

async function expectMarker(page: Page, expected: Marker) {
  await expect.poll(() => markers(page)).toEqual([expected])
}

async function run(page: Page) {
  await page.getByRole('button', { name: '执行 SQL', exact: true }).click()
  await expect(page.getByRole('button', { name: '执行 SQL', exact: true })).toBeEnabled()
  await expect(page.locator('.error-panel')).toBeVisible()
}

function deferred() {
  let release!: () => void
  const wait = new Promise<void>((resolve) => {
    release = resolve
  })
  return { wait, release }
}

test('LINE prefixes mark the second line at column one and edits clear real Monaco errors', async ({
  page
}, info) => {
  const state = await prepare(page, info.project.name, [
    { body: { status: 'error', errorCode: '42601', message: lineMessage } }
  ])
  await writeSql(page, lineSql)
  await run(page)
  expect(state.queries).toEqual([lineSql])
  await expectMarker(page, marker(2, 1, 2, 'S'))
  await expect(page.locator('.error-message')).toContainText('LINE 2: SELCT 2;')
  await expect(page.locator('.error-caret')).toHaveText('第 2 行，第 1 列\nSELCT 2;')
  await expect(page.locator('.monaco-editor .squiggly-error')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
  await page.screenshot({ path: info.outputPath('sql-error-line-two.png'), animations: 'disabled' })
  await writeSql(page, 'SELECT 2;')
  await expect.poll(() => markers(page)).toEqual([])
  expect(state.queries).toHaveLength(1)
})

test('structured code points, global positions, mid-line selections and EOF map to exact UTF-16 ranges', async ({
  page
}, info) => {
  const unicode = "SELECT '中😀',\r\n'🧪', missing;"
  const multiline = "SELECT '😀中',\nmissing;"
  const selected = "SELECT '中😀', bad;"
  const source = `SELECT 0;   ${selected} SELECT 9;`
  const eof = 'SELECT +'
  const error = 'SQL 语法错误，请检查表达式'
  const state = await prepare(page, info.project.name, [
    { body: { status: 'error', message: error, errorPosition: 16, errorQuery: unicode } },
    {
      status: 200,
      body: { status: 'error', error_message: error, error_position: '16', error_query: unicode }
    },
    { status: 200, body: { status: 'error', errorMessage: '查询字段无法识别\nPosition: 14' } },
    { body: { status: 'error', message: error, errorPosition: 14, errorQuery: selected } },
    { body: { status: 'error', message: error, errorPosition: 9, errorQuery: eof } }
  ])
  for (let index = 0; index < 2; index++) {
    await writeSql(page, unicode)
    await run(page)
    await expectMarker(page, marker(2, 2, 4, '🧪'))
    await expect(page.locator('.error-caret')).toHaveText("第 2 行，第 2 列\n'🧪', missing;")
  }
  await writeSql(page, multiline)
  await run(page)
  await expectMarker(page, marker(2, 1, 2, 'm'))
  await writeSql(page, source)
  await page.evaluate(async (selected) => {
    const path = '/src/utils/monaco-runtime.ts'
    const { monaco } = (await import(path)) as typeof import('../../src/utils/monaco-runtime')
    const editor = monaco.editor
      .getEditors()
      .find((item) => item.getContainerDomNode()?.closest('.editor-wrapper'))
    const model = editor?.getModel()
    if (!editor || !model) throw new Error('SQL editor model is not mounted')
    const start = model.getValue().indexOf(selected)
    const from = model.getPositionAt(start)
    const to = model.getPositionAt(start + selected.length)
    editor.setSelection(new monaco.Range(from.lineNumber, from.column, to.lineNumber, to.column))
    editor.focus()
  }, selected)
  await expect(page.locator('.sql-editor-tools__context')).toContainText('执行选中内容')
  await page.keyboard.press('ControlOrMeta+Enter')
  await expectMarker(page, marker(1, 27, 28, 'b'))
  await expect(page.locator('.error-caret')).toHaveText("第 1 行，第 15 列\nSELECT '中😀', bad;")
  await writeSql(page, eof)
  await run(page)
  await expectMarker(page, marker(1, 9, 9, ''))
  await expect(page.locator('.error-caret')).toHaveText('第 1 行，第 9 列\nSELECT +')
  expect(state.queries).toEqual([unicode, unicode, multiline, selected, eof])
})

test('late failures never mark edited or ABA-restored sources and tenant changes reject old results', async ({
  page
}, info) => {
  const first = deferred()
  const aba = deferred()
  const scoped = deferred()
  const sql = 'SELECT missing;'
  const reply = {
    status: 'error',
    message: '字段不存在，请检查查询',
    errorPosition: 8,
    errorQuery: sql
  }
  const state = await prepare(page, info.project.name, [
    { wait: first.wait, body: reply },
    { wait: aba.wait, body: reply },
    { wait: scoped.wait, body: { ...reply, message: '旧租户查询错误不应出现' } }
  ])
  await writeSql(page, sql)
  await page.getByRole('button', { name: '执行 SQL', exact: true }).click()
  await expect.poll(() => state.queries.length).toBe(1)
  await writeSql(page, 'SELECT updated_source;')
  first.release()
  await expect(page.locator('.error-message')).toContainText('字段不存在，请检查查询')
  await expect.poll(() => markers(page)).toEqual([])
  await expect(page.locator('.error-caret')).toHaveText('第 1 行，第 8 列\nSELECT missing;')
  await writeSql(page, sql)
  await page.getByRole('button', { name: '执行 SQL', exact: true }).click()
  await expect.poll(() => state.queries.length).toBe(2)
  await writeSql(page, 'SELECT changed_then_restored;')
  await writeSql(page, sql)
  aba.release()
  await expect.poll(() => state.replies).toBe(2)
  await expect(page.getByRole('button', { name: '执行 SQL', exact: true })).toBeEnabled()
  await expect.poll(() => markers(page)).toEqual([])
  await page.getByRole('button', { name: '执行 SQL', exact: true }).click()
  await expect.poll(() => state.queries.length).toBe(3)
  await page.evaluate((tenant) => {
    window.dispatchEvent(new CustomEvent('sql-preview-tenant-change', { detail: tenant }))
  }, tenantB)
  await expect(page.locator('.error-panel')).toHaveCount(0)
  scoped.release()
  await expect.poll(() => state.replies).toBe(3)
  await expect(page.getByText('旧租户查询错误不应出现', { exact: true })).toHaveCount(0)
  await expect(page.locator('.error-panel')).toHaveCount(0)
  await expect.poll(() => markers(page)).toEqual([])
})

test('unknown, internal, mismatched and invalid locations never create guessed markers', async ({
  page
}, info) => {
  const sql = 'SELECT missing;'
  const cases: Record<string, unknown>[] = [
    { message: '查询失败，请检查字段' },
    {
      message: '内部查询失败\nInternal Position: 8\nInternal Query: SELECT hidden;',
      internalPosition: 8
    },
    { message: '位置来源不同，请检查查询', errorPosition: 8, errorQuery: 'SELECT another_query;' },
    { message: '位置来源缺失，请检查查询', errorPosition: 8 },
    ...[0, -1, 1.5, '2x', 999].map((errorPosition) => ({
      message: '查询位置无效\nPosition: 8',
      errorPosition,
      errorQuery: sql
    })),
    { message: '查询位置超过实际文本\nPosition: 999' }
  ]
  const state = await prepare(
    page,
    info.project.name,
    cases.map((body, index) => ({
      status: index % 2 ? 200 : 500,
      body: { status: 'error', ...body }
    }))
  )
  await writeSql(page, sql)
  for (let index = 0; index < cases.length; index++) {
    await run(page)
    await expect.poll(() => state.replies).toBe(index + 1)
    await expect.poll(() => markers(page)).toEqual([])
    await expect(page.locator('.error-caret')).toHaveCount(0)
  }
  expect(state.queries).toEqual(cases.map(() => sql))
})
