import { expect, test, type Locator, type Page } from '@playwright/test'
import ExcelJS from 'exceljs'
import { read, utils } from '../../src/vendor/sheetjs/xlsx.mjs'
import { prepareIsolatedSession } from './support/isolated-session'
import { prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

const tenantA = '00000000-0000-4000-8000-000000000001'
const tenantB = '00000000-0000-4000-8000-000000000002'
const actorId = '00000000-0000-4000-8000-000000000003'
const htmlField = 'html<&>'
const lineText = 'line1\t"quoted"\r\nline2'
interface ResultFixture {
  rows: Record<string, unknown>[]
  columns: { name: string; type?: string }[]
  truncated?: boolean
}
const raw: ResultFixture = {
  columns: [
    { name: 'amount', type: 'numeric' },
    { name: 'label', type: 'text' },
    { name: '__proto__', type: 'text' },
    { name: htmlField, type: 'text' },
    { name: 'line_text', type: 'text' },
    { name: 'nullable', type: 'text' },
    { name: 'formula', type: 'text' },
    { name: 'id', type: 'integer' },
    { name: 'tenant_id', type: 'uuid' },
    { name: 'hidden_text', type: 'text' }
  ],
  truncated: true,
  rows: Array.from({ length: 120 }, (_, index) =>
    Object.fromEntries([
      [
        'amount',
        index === 68
          ? '1.0000000000000000002'
          : index === 69
            ? '1.0000000000000000001'
            : `${120 - index}.0000000000000000001`
      ],
      ['label', `${index < 70 ? 'match' : 'other'}-${String(index + 1).padStart(3, '0')}`],
      ['__proto__', `own-${index + 1}`],
      [htmlField, '<img src=x onerror="window.clipboardXss=true"> & "中文"'],
      ['line_text', lineText],
      ...(index % 2 ? [] : [['nullable', null]]),
      ['formula', '=SUM(1,2)'],
      ['id', index + 1],
      ['tenant_id', tenantA],
      ['hidden_text', `hidden-${index + 1}`],
      ['undeclared_extra', 'not-a-result-column']
    ])
  )
}

async function prepare(page: Page, project: string, initial = raw, ordinary = false) {
  page.setDefaultTimeout(15_000)
  page.setDefaultNavigationTimeout(60_000)
  await prepareIsolatedSession(page)
  await prepareAppearance(page, { theme: project.includes('dark') ? 'dark' : 'light' })
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  const state = { result: initial, executions: 0, invokes: 0 }
  await page.route('**/functions/v1/execute-sql-with-columns', (route) => {
    if ((route.request().postDataJSON() as { action?: string }).action === 'metadata')
      return route.fulfill({
        json: { schemas: [], tables: [], columns: [], functions: [], foreignKeys: [] }
      })
    state.executions++
    return route.fulfill({
      json: {
        status: 'ok',
        ...state.result,
        rowCount: state.result.rows.length,
        durationMs: 1,
        commandTag: 'SELECT'
      }
    })
  })
  await page.route('**/functions/v1/sql-query-api**', (route) => {
    if ((route.request().postDataJSON() as { action?: string }).action === 'list')
      return route.fulfill({
        json: {
          canManage: false,
          users: [],
          definitions: [
            {
              id: '00000000-0000-4000-8000-000000000004',
              slug: 'clipboard-view',
              name: '本租户结果',
              description: '隔离测试授权接口',
              sql: '',
              tenantId: tenantA,
              allowedUserIds: [],
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
        ...state.result,
        rowCount: state.result.rows.length,
        durationMs: 1,
        maxRows: 200,
        timeoutMs: 5000,
        truncated: false
      }
    })
  })
  await page.goto(
    `/tests/e2e/fixtures/sql-console-metadata.html?actor=${actorId}&tenant=${tenantA}${ordinary ? '&ordinary=1' : ''}`
  )
  await expect(page.locator('.monaco-editor')).toBeVisible()
  const collapse = page.getByRole('button', { name: '收起数据库资源', exact: true }).first()
  if (await collapse.isVisible()) await collapse.click()
  const execute = async (result = state.result) => {
    state.result = result
    await page.getByRole('button', { name: '执行 SQL', exact: true }).click()
    await expect(page.locator('.result-table-container')).toContainText(
      `本次已加载 ${result.rows.length} 行`
    )
    await expect(page.getByRole('button', { name: '执行 SQL', exact: true })).toBeEnabled()
  }
  return { state, execute }
}

async function openColumns(page: Page, grid: Locator) {
  await grid.getByRole('button', { name: '设置显示列', exact: true }).click()
  const popup = page
    .locator('.el-popover:visible')
    .filter({ has: page.getByRole('group', { name: '列显示预设', exact: true }) })
  await expect(popup).toBeVisible()
  return popup
}

async function openCopy(page: Page, grid: Locator) {
  await grid.getByRole('button', { name: '复制当前结果视图', exact: true }).click()
  const popup = page.getByRole('region', { name: '复制结果视图', exact: true })
  await expect(popup).toBeVisible()
  return popup
}

async function setPin(page: Page, grid: Locator, field: string, side: '左' | '右') {
  await grid.getByRole('button', { name: '固定列', exact: true }).click()
  const popup = page.locator('.el-popover:visible').filter({
    has: page.getByRole('combobox', { name: '固定字段', exact: true })
  })
  await popup.getByRole('combobox', { name: '固定字段', exact: true }).click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText(field)
  await page.getByRole('option', { name: field, exact: true }).click()
  await expect(popup.getByRole('radio', { name: `固定${side}侧`, exact: true })).toBeEnabled()
  await popup.getByText(`固定${side}侧`, { exact: true }).click()
  await popup.getByRole('button', { name: '关闭固定列设置', exact: true }).click()
}

async function readClipboard(page: Page) {
  await page.bringToFront()
  return page.evaluate(async () => {
    const items = await navigator.clipboard.read()
    const item = items[0]
    if (!item) throw new Error('Native clipboard is empty')
    const text = item.types.includes('text/plain')
      ? await (await item.getType('text/plain')).text()
      : ''
    const html = item.types.includes('text/html')
      ? await (await item.getType('text/html')).text()
      : ''
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const table = doc.querySelector('table')
    return {
      itemCount: items.length,
      types: [...item.types],
      text,
      html,
      headers: [...(table?.querySelectorAll('thead th') || [])].map(
        (cell) => cell.textContent || ''
      ),
      rows: [...(table?.querySelectorAll('tbody tr') || [])].map((row) =>
        [...row.querySelectorAll('td')].map((cell) => cell.textContent || '')
      ),
      unsafeElements:
        table?.querySelectorAll('script,img,a,iframe,style,[onclick],[onerror]').length || 0
    }
  })
}

const normalize = (text: string) => text.replace(/\r\n/g, '\n')
function parseTsv(text: string): string[][] {
  const book = read(text, { type: 'string', raw: true, FS: '\t' })
  return utils
    .sheet_to_json<string[]>(book.Sheets[book.SheetNames[0]], { header: 1, raw: true, defval: '' })
    .map((row) => row.map((value) => normalize(String(value))))
}

async function copy(page: Page, grid: Locator, mode: '表格' | 'TSV') {
  const popup = await openCopy(page, grid)
  await popup
    .getByRole('button', { name: mode === '表格' ? '复制表格' : '复制 TSV', exact: true })
    .click()
  await expect(page.locator('.el-message--success').last()).toContainText(
    `已复制${mode === '表格' ? '表格' : ' TSV'}`
  )
  if (await popup.isVisible())
    await popup.getByRole('button', { name: '关闭复制选项', exact: true }).click()
  return readClipboard(page)
}

test('native rich clipboard copies the filtered sorted view across pages while raw exports keep query order', async ({
  page
}, info) => {
  const { state, execute } = await prepare(page, info.project.name)
  await execute()
  const grid = page.locator('.result-table-container')
  await grid.getByRole('textbox', { name: '搜索已加载结果', exact: true }).fill('match-')
  await expect(grid.locator('.sql-result-tools')).toContainText('匹配 70 行')
  await grid.getByRole('button', { name: /^排序 amount：/ }).click()
  const columns = await openColumns(page, grid)
  for (const field of ['id', 'tenant_id', 'hidden_text'])
    await columns.getByText(field, { exact: true }).click()
  const label = columns.getByRole('checkbox', { name: 'label', exact: true })
  await label.focus()
  await label.press('Alt+ArrowUp')
  await expect(label).toBeFocused()
  await columns.getByRole('button', { name: '关闭列设置', exact: true }).click()
  const viewport = page.viewportSize()!
  const narrow = viewport.width < 640
  if (narrow) await page.setViewportSize({ width: 1440, height: 900 })
  await setPin(page, grid, 'label', '右')
  await setPin(page, grid, 'amount', '左')
  await expect(grid.locator('.sql-result-tools')).toContainText('固定 2 列')
  await expect(
    grid.locator('.el-table-v2__left [role="columnheader"][data-key="amount"]')
  ).toBeVisible()
  await expect(
    grid.locator('.el-table-v2__right [role="columnheader"][data-key="label"]')
  ).toBeVisible()
  if (narrow) {
    await page.setViewportSize(viewport)
    await expect(grid.locator('.sql-result-tools')).toContainText('固定 0 列')
  }
  const headers = narrow
    ? ['label', 'amount', '__proto__', htmlField, 'line_text', 'nullable', 'formula']
    : ['amount', '__proto__', htmlField, 'line_text', 'nullable', 'formula', 'label']
  await grid.locator('.el-pagination .btn-next').click()
  const popup = await openCopy(page, grid)
  await expect(popup).toContainText('当前匹配 70 行 · 显示 7 列')
  await expect(popup).toContainText('文本')
  await expect(popup).toContainText('Excel')
  for (const name of ['复制表格', '复制 TSV', '关闭复制选项'])
    await expect(popup.getByRole('button', { name, exact: true })).toBeInViewport({ ratio: 1 })
  const popupBox = await popup.boundingBox()
  expect(popupBox).not.toBeNull()
  expect(popupBox!.x).toBeGreaterThanOrEqual(0)
  expect(popupBox!.y).toBeGreaterThanOrEqual(0)
  expect(popupBox!.x + popupBox!.width).toBeLessThanOrEqual(page.viewportSize()!.width)
  expect(popupBox!.y + popupBox!.height).toBeLessThanOrEqual(page.viewportSize()!.height)
  const trigger = grid.getByRole('button', { name: '复制当前结果视图', exact: true })
  const geometry = await trigger.evaluate((el) => {
    const rect = el.getBoundingClientRect()
    const icon = el.querySelector('svg')?.getBoundingClientRect()
    return {
      width: rect.width,
      height: rect.height,
      iconWidth: icon?.width,
      iconHeight: icon?.height
    }
  })
  expect(geometry).toEqual({ width: 26, height: 26, iconWidth: 16, iconHeight: 16 })
  await page.screenshot({ path: info.outputPath('copy-view-options.png'), animations: 'disabled' })
  await popup.getByRole('button', { name: '复制表格', exact: true }).click()
  await expect(page.locator('.el-message--success').last()).toContainText('70 行 / 7 列')
  const result = await readClipboard(page)
  const expected = raw.rows
    .slice(0, 70)
    .reverse()
    .map((row) =>
      headers.map((field) => {
        if (field === 'nullable') return row.nullable === null ? 'NULL' : ''
        if (field === 'line_text') return normalize(lineText)
        return String(Object.getOwnPropertyDescriptor(row, field)?.value)
      })
    )
  expect(result.itemCount).toBe(1)
  expect(result.types).toEqual(expect.arrayContaining(['text/html', 'text/plain']))
  expect(result.headers).toEqual(headers)
  expect(result.rows).toEqual(expected)
  expect(result.unsafeElements).toBe(0)
  expect(parseTsv(result.text)).toEqual([headers, ...expected])
  expect(result.text).toContain('""quoted""')
  expect(result.html).not.toMatch(/mso-|x:str|x:fmla|urn:schemas-microsoft/i)
  expect(await page.evaluate(() => Reflect.get(window, 'clipboardXss'))).toBeUndefined()
  if (await popup.isVisible())
    await popup.getByRole('button', { name: '关闭复制选项', exact: true }).click()

  await page
    .locator('.result-section > .tabs-header')
    .getByRole('button', { name: '导出查询结果', exact: true })
    .click()
  const pending = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: '导出 Excel', exact: true }).click()
  const path = await (await pending).path()
  if (!path) throw new Error('Raw workbook was not downloaded')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(path)
  const sheet = workbook.worksheets[0]
  expect(sheet.rowCount).toBe(121)
  expect(sheet.getRow(1).values).toEqual([undefined, ...raw.columns.map((column) => column.name)])
  expect(sheet.getCell('A2').value).toBe('120.0000000000000000001')
  expect(sheet.getCell('B2').value).toBe('match-001')
  expect(sheet.getCell('B121').value).toBe('other-120')
  await grid
    .getByRole('textbox', { name: '搜索已加载结果', exact: true })
    .fill('no-matching-result')
  const empty = await copy(page, grid, '表格')
  expect(empty.headers).toEqual(headers)
  expect(empty.rows).toEqual([])
  expect(parseTsv(empty.text)).toEqual([headers])
  const plain = await copy(page, grid, 'TSV')
  expect(plain.types).not.toContain('text/html')
  expect(parseTsv(plain.text)).toEqual([headers])
  expect(state.executions).toBe(1)
})

test('ordinary API clipboard uses only authorized visible columns even after a forged UI scope', async ({
  page
}, info) => {
  const result: ResultFixture = {
    columns: [{ name: 'tenant_id' }, { name: 'label' }, { name: 'amount' }],
    rows: [
      {
        tenant_id: tenantA,
        label: '本租户',
        amount: '000123.4500',
        undeclared_secret: 'never-copy'
      }
    ]
  }
  const { state } = await prepare(page, info.project.name, result, true)
  await expect(page.getByRole('button', { name: '执行 SQL', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '查询 API', exact: true }).click()
  const manager = page.getByRole('dialog', { name: '查询 API', exact: true })
  await manager.getByRole('button', { name: '调用 API', exact: true }).click()
  const grid = manager.locator('.result-table-container')
  await expect(grid).toContainText('显示 2/2 列')
  await page.evaluate(
    (tenant) =>
      window.dispatchEvent(new CustomEvent('sql-preview-tenant-change', { detail: tenant })),
    tenantB
  )
  const value = await copy(page, grid, '表格')
  expect(value.headers).toEqual(['label', 'amount'])
  expect(value.rows).toEqual([['本租户', '000123.4500']])
  expect(parseTsv(value.text)).toEqual([
    ['label', 'amount'],
    ['本租户', '000123.4500']
  ])
  expect(value.html + value.text).not.toMatch(/tenant_id|undeclared_secret|never-copy/)
  const cols = await openColumns(page, grid)
  await expect(cols.getByRole('checkbox', { name: 'tenant_id', exact: true })).toHaveCount(0)
  await cols.getByText('label', { exact: true }).click()
  await cols.getByText('amount', { exact: true }).click()
  await cols.getByRole('button', { name: '关闭列设置', exact: true }).click()
  const hidden = await openCopy(page, grid)
  await expect(hidden.getByRole('button', { name: '复制表格', exact: true })).toBeDisabled()
  await expect(hidden.getByRole('button', { name: '复制 TSV', exact: true })).toBeDisabled()
  expect(state.invokes).toBe(1)
  expect(state.executions).toBe(0)
})

test('clipboard failures stay explicit and oversized cells never replace the native clipboard', async ({
  page
}, info) => {
  const small: ResultFixture = {
    columns: [{ name: 'label', type: 'text' }],
    rows: [{ label: 'small' }]
  }
  const { execute } = await prepare(page, info.project.name, small)
  await execute()
  const grid = page.locator('.result-table-container')
  await grid.getByRole('button', { name: '编辑副本', exact: true }).click()
  await expect(grid).toContainText('编辑副本 · 已修改 0 行 / 0 处')
  const editing = await openCopy(page, grid)
  await expect(editing.getByRole('button', { name: '复制表格', exact: true })).toBeDisabled()
  await expect(editing.getByRole('button', { name: '复制 TSV', exact: true })).toBeDisabled()
  await editing.getByRole('button', { name: '关闭复制选项', exact: true }).click()
  await grid.getByRole('button', { name: '退出编辑', exact: true }).click()
  await page.evaluate(() => {
    Reflect.set(window, '__clipboardCalls', { write: 0, writeText: 0 })
    Object.defineProperty(navigator.clipboard, 'write', {
      configurable: true,
      value: async () => {
        Reflect.get(window, '__clipboardCalls').write++
        throw new DOMException('denied', 'NotAllowedError')
      }
    })
    Object.defineProperty(navigator.clipboard, 'writeText', {
      configurable: true,
      value: async () => {
        Reflect.get(window, '__clipboardCalls').writeText++
      }
    })
  })
  let popup = await openCopy(page, grid)
  await popup.getByRole('button', { name: '复制表格', exact: true }).click()
  await expect(popup.getByRole('alert')).toContainText('权限')
  await expect(page.locator('.el-message--success')).toHaveCount(0)
  expect(await page.evaluate(() => Reflect.get(window, '__clipboardCalls'))).toEqual({
    write: 1,
    writeText: 0
  })
  await popup.getByRole('button', { name: '关闭复制选项', exact: true }).click()
  // Simulate an older browser before mounting a fresh result component, rather
  // than changing a cached capability in an already mounted browser instance.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'ClipboardItem', { configurable: true, value: undefined })
  })
  await page.reload()
  await execute(small)
  popup = await openCopy(page, grid)
  await expect(popup.getByRole('button', { name: '复制表格', exact: true })).toBeDisabled()
  await expect(popup).toContainText('不支持')
  await popup.getByRole('button', { name: '复制 TSV', exact: true }).click()
  await expect
    .poll(async () => normalize(await page.evaluate(() => navigator.clipboard.readText())))
    .toBe('label\nsmall')
  if (await popup.isVisible())
    await popup.getByRole('button', { name: '关闭复制选项', exact: true }).click()
  await execute({ ...small, rows: [{ label: 'x'.repeat(32768) }] })
  await page.evaluate(() => navigator.clipboard.writeText('existing-clipboard'))
  popup = await openCopy(page, grid)
  await popup.getByRole('button', { name: '复制 TSV', exact: true }).click()
  await expect(popup.getByRole('alert')).toContainText('32767')
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('existing-clipboard')
  await popup.getByRole('button', { name: '关闭复制选项', exact: true }).click()
  await execute({ ...small, columns: [{ name: 'label' }, { name: 'label' }] })
  popup = await openCopy(page, grid)
  await expect(popup.getByRole('button', { name: '复制表格', exact: true })).toBeDisabled()
  await expect(popup.getByRole('button', { name: '复制 TSV', exact: true })).toBeDisabled()
})

test('a completed native write cannot toast into a different tenant when its acknowledgement arrives late', async ({
  page
}, info) => {
  const { state, execute } = await prepare(page, info.project.name, {
    columns: [{ name: 'label' }],
    rows: [{ label: 'old-owner-value' }]
  })
  await execute()
  await page.evaluate(() => {
    const native = navigator.clipboard.write.bind(navigator.clipboard)
    const state = { written: false, finished: false, release: () => {} }
    Reflect.set(window, '__clipboardLateWrite', state)
    Object.defineProperty(navigator.clipboard, 'write', {
      configurable: true,
      value: async (items: ClipboardItems) => {
        await native(items)
        state.written = true
        await new Promise<void>((resolve) => {
          state.release = resolve
        })
        state.finished = true
      }
    })
  })
  const grid = page.locator('.result-table-container')
  const popup = await openCopy(page, grid)
  await popup.getByRole('button', { name: '复制表格', exact: true }).click()
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, '__clipboardLateWrite').written))
    .toBe(true)
  await expect(page.locator('.el-message--success')).toHaveCount(0)
  await page.evaluate(
    (tenant) =>
      window.dispatchEvent(new CustomEvent('sql-preview-tenant-change', { detail: tenant })),
    tenantB
  )
  await expect(grid).toHaveCount(0)
  await expect(popup).toHaveCount(0)
  await page.evaluate(() => Reflect.get(window, '__clipboardLateWrite').release())
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, '__clipboardLateWrite').finished))
    .toBe(true)
  await page.getByRole('button', { name: '新建查询页签', exact: true }).click()
  await expect(page.getByRole('tablist', { name: 'SQL 查询页签' }).getByRole('tab')).toHaveCount(2)
  await expect(page.locator('.el-message--success')).toHaveCount(0)
  expect((await readClipboard(page)).rows).toEqual([['old-owner-value']])
  expect(state.executions).toBe(1)
})
