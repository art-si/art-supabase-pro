import { expect, test, type Locator, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { prepareIsolatedSession } from './support/isolated-session'
import { prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

const actorId = '00000000-0000-4000-8000-000000000003'
const tenantA = '00000000-0000-4000-8000-000000000001'
const tenantB = '00000000-0000-4000-8000-000000000002'
const previewUrl = `/tests/e2e/fixtures/sql-console-metadata.html?actor=${actorId}&tenant=${tenantA}`
const importTitle = '导入 SQL 文件'
interface SqlFile {
  name: string
  mimeType: string
  buffer: Buffer
}
const file = (name: string, buffer: Buffer | string): SqlFile => ({
  name,
  mimeType: 'text/plain',
  buffer: typeof buffer === 'string' ? Buffer.from(buffer) : buffer
})
const tabs = (page: Page) =>
  page.getByRole('tablist', { name: 'SQL 查询页签', exact: true }).getByRole('tab')
const importDialog = (page: Page) => page.getByRole('dialog', { name: importTitle, exact: true })
const metadata = {
  schemas: ['public'],
  tables: [
    {
      tableSchema: 'public',
      tableName: 'import_sample',
      kind: 'table',
      columns: [
        { name: 'id', dataType: 'integer', isPrimaryKey: true, isNullable: false },
        { name: 'tenant_id', dataType: 'uuid', isNullable: false },
        { name: 'label', dataType: 'text', isNullable: true }
      ]
    }
  ],
  columns: [
    {
      tableSchema: 'public',
      tableName: 'import_sample',
      columnName: 'id',
      dataType: 'integer',
      isPrimaryKey: true,
      isNullable: 'NO',
      ordinalPosition: 1
    },
    {
      tableSchema: 'public',
      tableName: 'import_sample',
      columnName: 'tenant_id',
      dataType: 'uuid',
      isNullable: 'NO',
      ordinalPosition: 2
    },
    {
      tableSchema: 'public',
      tableName: 'import_sample',
      columnName: 'label',
      dataType: 'text',
      isNullable: 'YES',
      ordinalPosition: 3
    }
  ],
  functions: [],
  foreignKeys: []
}

async function prepare(page: Page, project: string) {
  page.setDefaultTimeout(15_000)
  page.setDefaultNavigationTimeout(60_000)
  await prepareIsolatedSession(page)
  await prepareAppearance(page, {
    theme: project.includes('dark') ? 'dark' : 'light',
    boxBorderMode: true
  })
  await page.addInitScript(
    ({ tenantA }) => {
      sessionStorage.setItem('art-platform-tenant-scope-active', '1')
      sessionStorage.setItem('art-platform-tenant-scope-id', tenantA)
    },
    { tenantA }
  )
  const state = { executions: 0 }
  await routeSql(page, state)
  await page.goto(previewUrl)
  await expect(page.locator('.monaco-editor')).toBeVisible()
  return state
}

async function routeSql(page: Page, state: { executions: number }) {
  await page.route('**/functions/v1/execute-sql-with-columns', (route) => {
    if ((route.request().postDataJSON() as { action?: string }).action === 'metadata')
      return route.fulfill({ json: metadata })
    state.executions++
    return route.fulfill({
      json: {
        status: 'ok',
        rows: [{ id: 1, tenant_id: tenantA, label: 'original' }],
        columns: [
          { name: 'id', type: 'integer' },
          { name: 'tenant_id', type: 'uuid' },
          { name: 'label', type: 'text' }
        ],
        rowCount: 1,
        durationMs: 1,
        commandTag: 'SELECT'
      }
    })
  })
}

async function openTools(page: Page) {
  const tools = page
    .getByRole('tooltip')
    .filter({ has: page.getByRole('button', { name: '导入 SQL 文件', exact: true }) })
  if (!(await tools.isVisible()))
    await page.getByRole('button', { name: '编辑器工具', exact: true }).click()
  await expect(tools).toBeVisible()
  return tools
}

async function chooseFile(page: Page, selected: SqlFile) {
  const chooser = page.waitForEvent('filechooser')
  const dialog = importDialog(page)
  if (await dialog.isVisible())
    await dialog.getByRole('button', { name: '重新选择文件', exact: true }).click()
  else
    await (
      await openTools(page)
    )
      .getByRole('button', { name: '导入 SQL 文件', exact: true })
      .click()
  await (await chooser).setFiles(selected)
  return dialog
}

async function chooseEncoding(page: Page, dialog: Locator, encoding: string) {
  await dialog.getByRole('combobox', { name: 'SQL 文件编码', exact: true }).click()
  await page.getByRole('option', { name: encoding, exact: true }).click()
}

async function readEditor(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const path = '/src/utils/monaco-runtime.ts'
    const { monaco } = (await import(path)) as typeof import('../../src/utils/monaco-runtime')
    const editor = monaco.editor
      .getEditors()
      .find((item) => item.getContainerDomNode()?.closest('.editor-wrapper'))
    if (!editor) throw new Error('SQL 编辑器尚未挂载')
    return editor.getValue()
  })
}

async function writeEditor(page: Page, sql: string) {
  await page
    .locator('.monaco-editor')
    .getByRole('textbox', { name: 'SQL 编辑器', exact: true })
    .focus()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText(sql)
}

async function confirmImport(page: Page, count: number) {
  const dialog = importDialog(page)
  await expect(dialog.getByRole('button', { name: '导入新页签', exact: true })).toBeEnabled()
  await dialog.getByRole('button', { name: '导入新页签', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(tabs(page)).toHaveCount(count)
}

async function downloadSql(page: Page) {
  const tools = await openTools(page)
  const pending = page.waitForEvent('download')
  await tools.getByRole('button', { name: '下载 SQL 文件', exact: true }).click()
  const downloaded = await pending
  const path = await downloaded.path()
  if (!path) throw new Error('SQL 原文下载未生成文件')
  await expect(tools).toBeHidden()
  return readFile(path, 'utf8')
}

async function installReadControl(page: Page) {
  await page.evaluate(() => {
    const original = File.prototype.arrayBuffer
    const state = { reads: 0, failOnce: '', pending: [] as (() => Promise<void>)[] }
    Reflect.set(window, '__sqlFileReadFixture', state)
    File.prototype.arrayBuffer = function () {
      state.reads++
      if (state.failOnce === this.name) {
        state.failOnce = ''
        return Promise.reject(new DOMException('test read error', 'NotReadableError'))
      }
      if (!this.name.startsWith('pending-')) return original.call(this)
      const read = original.bind(this)
      return new Promise<ArrayBuffer>((resolve, reject) => {
        state.pending.push(async () => {
          try {
            resolve(await read())
          } catch (error) {
            reject(error)
          }
        })
      })
    }
  })
}

async function releaseReads(page: Page) {
  await page.evaluate(async () => {
    const state = Reflect.get(window, '__sqlFileReadFixture') as {
      pending: (() => Promise<void>)[]
    }
    await Promise.all(state.pending.splice(0).map((release) => release()))
  })
}

async function tenantAba(page: Page) {
  await page.evaluate(
    async ({ tenantA, tenantB }) => {
      const path = '/src/utils/tenant-scope-context.ts'
      const scope = (await import(path)) as typeof import('../../src/utils/tenant-scope-context')
      for (const tenant of [tenantB, tenantA]) {
        scope.writePlatformTenantScopeActive(true)
        scope.writeTenantScopeId(tenant)
        window.dispatchEvent(new CustomEvent('sql-preview-tenant-change', { detail: tenant }))
      }
    },
    { tenantA, tenantB }
  )
}

test('UTF-8 BOM import previews safely, cancels and loads the same file into a new unexecuted tab', async ({
  page
}, info) => {
  const state = await prepare(page, info.project.name)
  await expect(page.getByRole('button', { name: '选择 SQL 文件', exact: true })).toHaveCount(0)
  const original = 'SELECT 11 AS source_draft;'
  await writeEditor(page, original)
  const sql = "  -- 中文文件内容，只作预览\r\nSELECT '中文😀' AS title;  \r\n\t\r\n"
  const selected = file(
    '中文-preview.sql',
    Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(sql)])
  )
  let dialog = await chooseFile(page, selected)
  const preview = dialog.getByLabel('SQL 预览代码', { exact: true })
  await expect(preview).toContainText('中文😀')
  expect(await preview.evaluate((element) => (element as HTMLElement).isContentEditable)).toBe(
    false
  )
  await expect(dialog.getByText('UTF-8', { exact: true })).toBeVisible()
  await expect(tabs(page)).toHaveCount(1)
  for (const name of ['重新选择文件', '取消导入', '导入新页签'])
    await expect(dialog.getByRole('button', { name, exact: true })).toBeInViewport({ ratio: 1 })
  const encoding = dialog.getByRole('combobox', { name: 'SQL 文件编码', exact: true })
  await encoding.click()
  const gbOption = page.getByRole('option', { name: 'GB18030（兼容 GBK）', exact: true })
  await expect(gbOption).toBeInViewport({ ratio: 1 })
  const optionBox = await gbOption.boundingBox()
  expect(optionBox).not.toBeNull()
  expect(optionBox!.x).toBeGreaterThanOrEqual(0)
  expect(optionBox!.x + optionBox!.width).toBeLessThanOrEqual(page.viewportSize()!.width)
  await encoding.press('Escape')
  await expect(dialog).toBeVisible()
  await page.screenshot({
    path: info.outputPath('utf8-import-preview.png'),
    animations: 'disabled'
  })
  dialog = await chooseFile(page, selected)
  await expect(dialog.getByLabel('SQL 预览代码', { exact: true })).toContainText('中文😀')
  await dialog.getByRole('button', { name: '取消导入', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  expect(await readEditor(page)).toBe(original)
  dialog = await chooseFile(page, selected)
  await expect(dialog.getByLabel('SQL 预览代码', { exact: true })).toContainText('中文😀')
  await confirmImport(page, 2)
  expect(await downloadSql(page)).toBe(sql)
  await tabs(page).first().click()
  expect(await readEditor(page)).toBe(original)
  await tabs(page).nth(1).click()
  expect(await readEditor(page)).toBe(sql)
  expect(state.executions).toBe(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
})

test('legacy and UTF-16 encodings decode explicitly without guessing or overriding a BOM', async ({
  page
}, info) => {
  test.skip(info.project.name !== 'desktop-1440', '编码矩阵使用桌面代表视口')
  const state = await prepare(page, info.project.name)
  const utf16 = "SELECT '中文😀' AS utf16;\r\n"
  // GBK 中文 = D6 D0 CE C4; GB18030 😀 = 94 39 FC 36, verified with Python codecs.
  const cases = [
    {
      selected: file('plain.sql', 'SELECT 1 AS utf8;\n'),
      sql: 'SELECT 1 AS utf8;\n',
      encoding: 'UTF-8'
    },
    {
      selected: file(
        'gbk.sql',
        Buffer.from('53454c4543542027d6d0cec427204153207469746c653b0d0a', 'hex')
      ),
      sql: "SELECT '中文' AS title;\r\n",
      encoding: 'GB18030（兼容 GBK）',
      manual: true
    },
    {
      selected: file(
        'gb18030.sql',
        Buffer.from('53454c4543542027d6d0cec49439fc3627204153207469746c653b0d0a', 'hex')
      ),
      sql: "SELECT '中文😀' AS title;\r\n",
      encoding: 'GB18030（兼容 GBK）',
      manual: true
    },
    {
      selected: file(
        'utf16le-bom.sql',
        Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(utf16, 'utf16le')])
      ),
      sql: utf16,
      encoding: 'UTF-16 LE',
      mismatch: true
    },
    {
      selected: file(
        'utf16be-bom.sql',
        Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(utf16, 'utf16le').swap16()])
      ),
      sql: utf16,
      encoding: 'UTF-16 BE'
    },
    {
      selected: file('utf16le.sql', Buffer.from(utf16, 'utf16le')),
      sql: utf16,
      encoding: 'UTF-16 LE',
      manual: true
    },
    {
      selected: file('utf16be.sql', Buffer.from(utf16, 'utf16le').swap16()),
      sql: utf16,
      encoding: 'UTF-16 BE',
      manual: true
    }
  ]
  for (const [index, item] of cases.entries()) {
    const dialog = await chooseFile(page, item.selected)
    if (item.manual) {
      await expect(dialog.getByRole('button', { name: '导入新页签', exact: true })).toBeDisabled()
      await expect(dialog).toContainText(/文件无法按所选编码完整读取|文件含有空字符/)
      await chooseEncoding(page, dialog, item.encoding)
    } else await expect(dialog.getByText(item.encoding, { exact: true })).toBeVisible()
    if (item.mismatch) {
      await chooseEncoding(page, dialog, 'UTF-8')
      await expect(dialog).toContainText(/文件带有.*UTF-16 LE.*编码标记/)
      await expect(dialog.getByRole('button', { name: '导入新页签', exact: true })).toBeDisabled()
      await chooseEncoding(page, dialog, item.encoding)
    }
    await expect(dialog.getByLabel('SQL 预览代码', { exact: true })).toContainText(item.sql.trim())
    await confirmImport(page, index + 2)
    expect(await readEditor(page)).toBe(item.sql)
  }
  expect(state.executions).toBe(0)
})

test('invalid files stay unloaded and read failures retry or reselect the same file', async ({
  page
}, info) => {
  test.skip(info.project.name !== 'desktop-1440', '错误与重试使用桌面代表视口')
  const state = await prepare(page, info.project.name)
  const original = await readEditor(page)
  await chooseFile(page, file('renamed.txt', 'SELECT 1;'))
  await expect(page.getByText('请选择 .sql 文件', { exact: true })).toBeVisible()
  await expect(importDialog(page)).toHaveCount(0)
  await chooseFile(page, file('large.sql', Buffer.alloc(1_000_001, 32)))
  await expect(page.getByText('SQL 文件不能超过 1 MB', { exact: true })).toBeVisible()
  await expect(importDialog(page)).toHaveCount(0)
  for (const [buffer, message] of [
    [Buffer.from([0xc3, 0x28]), /文件无法按所选编码完整读取/],
    [Buffer.from('SELECT\0binary'), /文件含有空字符/],
    [Buffer.from([0xff, 0xfe, 0x00, 0x00, 0x53, 0, 0, 0]), /暂不支持的编码标记/],
    [Buffer.from(' \r\n\t'), /没有可载入的 SQL 文本/]
  ] as const) {
    const dialog = await chooseFile(page, file('bad.sql', buffer))
    await expect(dialog).toContainText(message)
    await expect(dialog.getByRole('button', { name: '导入新页签', exact: true })).toBeDisabled()
    await expect(tabs(page)).toHaveCount(1)
  }
  await installReadControl(page)
  await page.evaluate(() => {
    const state = Reflect.get(window, '__sqlFileReadFixture') as { failOnce: string }
    state.failOnce = 'read-error.sql'
  })
  const selected = file('read-error.sql', 'SELECT 23 AS retried;\n')
  let dialog = await chooseFile(page, selected)
  await expect(dialog.getByRole('button', { name: '重试读取', exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: '重试读取', exact: true }).click()
  await expect(dialog.getByLabel('SQL 预览代码', { exact: true })).toContainText(
    'SELECT 23 AS retried;'
  )
  await dialog.getByRole('button', { name: '取消导入', exact: true }).click()
  expect(await readEditor(page)).toBe(original)
  dialog = await chooseFile(page, selected)
  await expect(dialog.getByLabel('SQL 预览代码', { exact: true })).toContainText('retried')
  await confirmImport(page, 2)
  expect(await readEditor(page)).toBe('SELECT 23 AS retried;\n')
  expect(state.executions).toBe(0)
})

test('the bounded preview never truncates the complete one-megabyte imported SQL', async ({
  page
}, info) => {
  test.skip(info.project.name !== 'desktop-1440', '1MB完整性使用桌面代表视口')
  const state = await prepare(page, info.project.name)
  const head =
    '-- preview-head\n' +
    Array.from({ length: 120 }, (_, index) => `-- line ${index} ${'x'.repeat(245)}\n`).join('')
  const tail = '\nSELECT 987654 AS imported_tail;\n'
  const sql = head + '--' + 'x'.repeat(1_000_000 - Buffer.byteLength(head + '--' + tail)) + tail
  expect(Buffer.byteLength(sql)).toBe(1_000_000)
  const dialog = await chooseFile(page, file('one-megabyte.sql', sql))
  const preview = dialog.getByLabel('SQL 预览代码', { exact: true })
  await expect(preview).toContainText('preview-head')
  await expect(dialog).toContainText('确认后导入完整原文')
  const displayed = await preview.textContent()
  expect(displayed?.length).toBeLessThanOrEqual(20_000)
  expect(displayed?.split('\n').length).toBeLessThanOrEqual(100)
  expect(displayed).not.toContain('imported_tail')
  await confirmImport(page, 2)
  expect(await downloadSql(page)).toBe(sql)
  expect(state.executions).toBe(0)
})

test('capacity and cancelled discard keep the preview while a late discard cannot import into a changed scope', async ({
  page
}, info) => {
  test.skip(info.project.name !== 'desktop-1440', '页签容量与异步确认使用桌面代表视口')
  const state = await prepare(page, info.project.name)
  for (let index = 0; index < 7; index++)
    await page.getByRole('button', { name: '新建查询页签', exact: true }).click()
  await expect(tabs(page)).toHaveCount(8)
  const selected = file('guarded.sql', 'SELECT 29 AS guarded_import;\n')
  let dialog = await chooseFile(page, selected)
  await expect(dialog.getByRole('button', { name: '导入新页签', exact: true })).toBeEnabled()
  await dialog.getByRole('button', { name: '导入新页签', exact: true }).click()
  await expect(page.getByText('最多同时打开 8 个查询页签', { exact: true })).toBeVisible()
  await expect(dialog.getByLabel('SQL 预览代码', { exact: true })).toContainText('guarded_import')
  await expect(dialog.getByRole('button', { name: '导入新页签', exact: true })).toBeEnabled()
  await expect(tabs(page)).toHaveCount(8)
  await dialog.getByRole('button', { name: '取消导入', exact: true }).click()
  for (let count = 8; count > 1; count--)
    await page.getByRole('button', { name: `关闭查询页签 ${count}`, exact: true }).click()
  await expect(tabs(page)).toHaveCount(1)
  await writeEditor(page, 'SELECT * FROM public.import_sample;')
  await page.getByRole('button', { name: '执行 SQL', exact: true }).click()
  const grid = page.locator('.result-table-container')
  await grid.getByRole('button', { name: '编辑副本', exact: true }).click()
  await grid.getByRole('button', { name: '编辑第 1 行 label', exact: true }).dblclick()
  await page.getByRole('textbox', { name: '编辑值 label', exact: true }).fill('local-draft')
  await page.getByRole('button', { name: '保留修改', exact: true }).click()
  await expect(grid).toContainText('已修改 1 行 / 1 处')
  expect(state.executions).toBe(1)
  dialog = await chooseFile(page, selected)
  await dialog.getByRole('button', { name: '导入新页签', exact: true }).click()
  await page.getByRole('button', { name: '继续编辑', exact: true }).click()
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('SQL 预览代码', { exact: true })).toContainText('guarded_import')
  await expect(tabs(page)).toHaveCount(1)
  await expect(grid).toContainText('已修改 1 行 / 1 处')
  await dialog.getByRole('button', { name: '导入新页签', exact: true }).click()
  await expect(page.getByRole('button', { name: '放弃修改并继续', exact: true })).toBeVisible()
  await tenantAba(page)
  await expect(dialog).toHaveCount(0)
  await page.getByRole('button', { name: '放弃修改并继续', exact: true }).click()
  await expect(tabs(page)).toHaveCount(1)
  expect(await readEditor(page)).not.toContain('guarded_import')
  dialog = await chooseFile(page, selected)
  await expect(dialog.getByLabel('SQL 预览代码', { exact: true })).toContainText('guarded_import')
  await dialog.getByRole('button', { name: '导入新页签', exact: true }).click()
  await page.getByRole('button', { name: '放弃修改并继续', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(tabs(page)).toHaveCount(2)
  expect(await readEditor(page)).toBe('SELECT 29 AS guarded_import;\n')
  // The single execution above only creates the editable precondition; import never executes.
  expect(state.executions).toBe(1)
})

async function routeGateway(page: Page, state: { executions: number }) {
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
              id: '00000000-0000-4000-8000-000000000241',
              name: '导入隔离库',
              dialect: 'postgres',
              host: 'localhost',
              port: 5432,
              database: 'import_test',
              username: 'reader',
              tenantId: tenantA,
              allowedUserIds: [actorId],
              enabled: true,
              tls: false,
              updatedAt: '2026-10-31T00:00:00Z'
            }
          ]
        }
      })
    if (path.endsWith('/query')) state.executions++
    return route.fulfill({
      headers,
      json: path.endsWith('/metadata') ? metadata : { status: 'ok' }
    })
  })
}

test('late reads cannot revive after cancellation, synchronous tenant ABA, tab or database changes and reload', async ({
  page
}, info) => {
  test.skip(info.project.name !== 'desktop-1440', '迟到读取与作用域使用桌面代表视口')
  const state = await prepare(page, info.project.name)
  await routeGateway(page, state)
  await installReadControl(page)
  const chooser = page.waitForEvent('filechooser')
  await (await openTools(page)).getByRole('button', { name: '导入 SQL 文件', exact: true }).click()
  const nativePicker = await chooser
  await tenantAba(page)
  await nativePicker.setFiles(file('late-picker.sql', 'SELECT 48 AS late_picker_marker;'))
  await expect(importDialog(page)).toHaveCount(0)
  await expect(tabs(page)).toHaveCount(1)
  expect(
    await page.evaluate(
      () => (Reflect.get(window, '__sqlFileReadFixture') as { reads: number }).reads
    )
  ).toBe(0)
  expect(await readEditor(page)).not.toContain('late_picker_marker')
  const pending = file('pending-same.sql', 'SELECT 41 AS cancelled_read;\n')
  let dialog = await chooseFile(page, pending)
  await expect(dialog).toContainText('正在读取 SQL 文件')
  await dialog.getByRole('button', { name: '取消导入', exact: true }).click()
  dialog = await chooseFile(page, pending)
  await releaseReads(page)
  await expect(dialog.getByLabel('SQL 预览代码', { exact: true })).toContainText('cancelled_read')
  await expect(tabs(page)).toHaveCount(1)
  await dialog.getByRole('button', { name: '取消导入', exact: true }).click()
  const manual = "SELECT '中文' AS manual_encoding;\r\n"
  dialog = await chooseFile(page, file('pending-manual.sql', Buffer.from(manual, 'utf16le')))
  await chooseEncoding(page, dialog, 'UTF-16 LE')
  await releaseReads(page)
  await expect(dialog.getByLabel('SQL 预览代码', { exact: true })).toContainText('中文')
  await dialog.getByRole('button', { name: '取消导入', exact: true }).click()
  dialog = await chooseFile(page, file('pending-tenant.sql', 'SELECT 43 AS late_tenant_marker;'))
  await expect(dialog).toContainText('正在读取 SQL 文件')
  // One evaluate, no await between B and A: child props may never observe the intermediate value.
  await tenantAba(page)
  await expect(dialog).toHaveCount(0)
  await releaseReads(page)
  await expect(tabs(page)).toHaveCount(1)
  expect(await readEditor(page)).not.toContain('late_tenant_marker')

  await page.getByRole('button', { name: '新建查询页签', exact: true }).click()
  await tabs(page).first().click()
  const peer = await page.context().newPage()
  await peer.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await peer.route('**/auth/v1/user', (route) =>
    route.fulfill({
      json: { id: 'permission-test-auth', aud: 'authenticated', role: 'authenticated' }
    })
  )
  await routeSql(peer, state)
  await routeGateway(peer, state)
  await peer.goto(previewUrl)
  await expect(tabs(peer)).toHaveCount(2)
  dialog = await chooseFile(page, file('pending-tab.sql', 'SELECT 44 AS late_tab_marker;'))
  await expect(dialog).toContainText('正在读取 SQL 文件')
  await tabs(peer).nth(1).click()
  await expect(dialog).toHaveCount(0)
  await tabs(peer).first().click()
  await releaseReads(page)
  await expect(tabs(page)).toHaveCount(2)
  expect(await readEditor(page)).not.toContain('late_tab_marker')
  dialog = await chooseFile(
    page,
    file('pending-database.sql', 'SELECT 45 AS late_database_marker;')
  )
  await expect(dialog).toContainText('正在读取 SQL 文件')
  await peer.getByRole('button', { name: '连接管理', exact: true }).click()
  const manager = peer.getByRole('dialog', { name: '数据库连接', exact: true })
  await manager
    .locator('.connection-manager__item')
    .filter({ hasText: '导入隔离库' })
    .getByRole('button', { name: '使用', exact: true })
    .click()
  await expect(dialog).toHaveCount(0)
  await peer.locator('.sql-query-bar__connection').click()
  await peer.getByRole('option', { name: '当前 Supabase', exact: true }).click()
  await releaseReads(page)
  await expect(tabs(page)).toHaveCount(3)
  expect(await readEditor(page)).not.toContain('late_database_marker')
  await peer.close()

  dialog = await chooseFile(page, file('pending-account.sql', 'SELECT 46 AS late_account_marker;'))
  await expect(dialog).toContainText('正在读取 SQL 文件')
  await page.evaluate(async (actorId) => {
    const path = '/src/store/modules/user.ts'
    const { useUserStore } = (await import(path)) as typeof import('../../src/store/modules/user')
    const user = useUserStore()
    const current = { ...user.getUserInfo }
    user.setUserInfo({ ...current, userId: '00000000-0000-4000-8000-000000000004' })
    user.setUserInfo({ ...current, userId: actorId })
  }, actorId)
  await expect(dialog).toHaveCount(0)
  await releaseReads(page)
  await expect(tabs(page)).toHaveCount(3)
  expect(await readEditor(page)).not.toContain('late_account_marker')
  dialog = await chooseFile(page, file('pending-unmount.sql', 'SELECT 47 AS late_unmount_marker;'))
  await expect(dialog).toContainText('正在读取 SQL 文件')
  await page.reload()
  await expect(page.locator('.monaco-editor')).toBeVisible()
  await expect(importDialog(page)).toHaveCount(0)
  await expect(tabs(page)).toHaveCount(3)
  expect(await readEditor(page)).not.toContain('late_unmount_marker')
  expect(state.executions).toBe(0)
  await expect(page.locator('.el-message--error')).toHaveCount(0)
})
