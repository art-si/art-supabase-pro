import { expect, test, type Locator, type Page } from '@playwright/test'
import ExcelJS from 'exceljs'
import { prepareIsolatedSession } from './support/isolated-session'
import { prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(150_000)

const columns = [
  { name: 'id', type: 'integer' },
  { name: 'children', type: 'jsonb' },
  { name: 'hasChildren', type: 'boolean' }
]
const rows = [
  {
    id: 1,
    children: [
      { id: 999, label: 'child-999', nested: { exact: '12345678901234567890.123456789' } }
    ],
    hasChildren: true
  },
  { id: 2, children: [{ id: 998, label: 'child-998' }], hasChildren: true },
  { id: 3, children: [], hasChildren: false }
]
const metadata = {
  schemas: ['public'],
  tables: [{ tableSchema: 'public', tableName: 'orders', kind: 'table' }],
  columns: columns.map((column, index) => ({
    tableSchema: 'public',
    tableName: 'orders',
    columnName: column.name,
    dataType: column.type,
    isPrimaryKey: column.name === 'id',
    isNullable: column.name === 'id' ? 'NO' : 'YES',
    ordinalPosition: index + 1
  })),
  functions: [],
  foreignKeys: []
}

async function prepare(page: Page, project: string) {
  page.setDefaultNavigationTimeout(60_000)
  page.setDefaultTimeout(15_000)
  await prepareIsolatedSession(page)
  await prepareAppearance(page, {
    theme: project.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !project.includes('shadow')
  })
  const state = { executions: 0 }
  await page.route('**/functions/v1/execute-sql-with-columns', (route) => {
    const body = route.request().postDataJSON() as { action?: string }
    if (body.action === 'metadata') return route.fulfill({ json: metadata })
    state.executions++
    return route.fulfill({
      json: { status: 'ok', rows, columns, rowCount: 3, durationMs: 2, commandTag: 'SELECT' }
    })
  })
  await page.goto(
    '/tests/e2e/fixtures/sql-console-metadata.html?actor=flat-data-test&tenant=tenant-a'
  )
  const editor = page
    .locator('.monaco-editor')
    .getByRole('textbox', { name: 'SQL 编辑器', exact: true })
  await editor.focus()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText(
    'SELECT "id", "children", "hasChildren" FROM "public"."orders" ORDER BY "id";'
  )
  await page.getByRole('button', { name: '执行 SQL', exact: true }).click()
  const grid = page.locator('.result-table-container')
  await expect(grid).toContainText('本次已加载 3 行')
  await expect(grid.locator('.art-table-v2')).toBeVisible()
  return { grid, state }
}

async function expectTopLevelIds(grid: Locator, expected: string[]) {
  const rendered = grid.locator('.el-table-v2__main .el-table-v2__row')
  await expect(rendered).toHaveCount(expected.length)
  await expect
    .poll(() =>
      rendered.evaluateAll((elements) =>
        elements.map((element) =>
          element.querySelector('.el-table-v2__row-cell')?.textContent?.trim()
        )
      )
    )
    .toEqual(expected)
}

async function setIdPin(page: Page, grid: Locator, side: 'left' | 'right' | null) {
  await grid.getByRole('button', { name: '固定列', exact: true }).click()
  const popup = page.locator('.el-popover:visible').filter({
    has: page.getByRole('combobox', { name: '固定字段', exact: true })
  })
  await popup.getByRole('combobox', { name: '固定字段', exact: true }).click()
  await page.getByRole('option', { name: 'id', exact: true }).click()
  const label = side === 'left' ? '固定左侧' : side === 'right' ? '固定右侧' : '不固定'
  await expect(popup.getByRole('radio', { name: label, exact: true })).toBeEnabled()
  await popup.getByText(label, { exact: true }).click()
  await popup.getByRole('button', { name: '关闭固定列设置', exact: true }).click()
  await expect(popup).toBeHidden()
}

test('SQL children JSON and hasChildren boolean remain flat through viewing, search, pins, editing and export', async ({
  page
}, info) => {
  const { grid, state } = await prepare(page, info.project.name)
  await expectTopLevelIds(grid, ['1', '2', '3'])
  await expect(grid.locator('.el-table__expand-icon')).toHaveCount(0)
  await grid.getByRole('button', { name: '查看 children 内容', exact: true }).first().click()
  const detail = page.getByRole('dialog', { name: '单元格详情', exact: true })
  const detailJson = detail.locator('pre[aria-label="单元格内容代码"] code')
  await expect
    .poll(async () => JSON.parse((await detailJson.textContent()) || 'null'))
    .toEqual(rows[0].children)
  await detail.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(detail).toBeHidden()
  const search = grid.getByRole('textbox', { name: '搜索已加载结果', exact: true })
  await search.fill('child-999')
  await expect(grid.getByRole('status')).toContainText('匹配 1 行')
  await expectTopLevelIds(grid, ['1'])
  await search.fill('true')
  await expectTopLevelIds(grid, ['1', '2'])
  await search.clear()
  await expectTopLevelIds(grid, ['1', '2', '3'])
  if ((page.viewportSize()?.width || 0) >= 900) {
    await setIdPin(page, grid, 'left')
    await expect(
      grid.locator('.el-table-v2__left .el-table-v2__header-cell[data-key="id"]')
    ).toBeVisible()
    await setIdPin(page, grid, 'right')
    await expect(
      grid.locator('.el-table-v2__right .el-table-v2__header-cell[data-key="id"]')
    ).toBeVisible()
    await setIdPin(page, grid, null)
    await expect(grid.locator('.el-table-v2__left, .el-table-v2__right')).toHaveCount(0)
  }
  await grid.getByRole('button', { name: '编辑副本', exact: true }).click()
  await expect(grid.getByRole('button', { name: '退出编辑', exact: true })).toBeVisible()
  await expect(grid.locator('.art-table-v2')).toBeVisible()
  await expectTopLevelIds(grid, ['1', '2', '3'])
  await expect(grid.getByRole('button', { name: '编辑第 1 行 id', exact: true })).toHaveCount(0)
  await expect(grid.getByRole('button', { name: /编辑第 (?:4|999) 行/ })).toHaveCount(0)
  const children = grid.getByRole('button', { name: '编辑第 1 行 children', exact: true })
  await children.dblclick()
  const jsonEditor = page.getByRole('dialog', { name: '编辑 children', exact: true })
  const input = jsonEditor.getByRole('textbox', { name: 'JSON 字段编辑器', exact: true })
  await expect(jsonEditor.locator('.view-lines')).toContainText('child-999')
  await input.focus()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('Backspace')
  await expect(jsonEditor.locator('.view-lines')).not.toContainText('child-999')
  await page.keyboard.insertText('[{"id":999,"label":"child-999-edited"}]')
  await jsonEditor.getByRole('button', { name: '保留修改', exact: true }).click()
  await expect(grid).toContainText('已修改 1 行 / 1 处')
  await expect(children).toContainText('child-999-edited')
  await expectTopLevelIds(grid, ['1', '2', '3'])
  await grid.getByRole('button', { name: '撤销结果修改', exact: true }).click()
  await expect(grid).toContainText('已修改 0 行 / 0 处')
  await children.dblclick()
  await expect(jsonEditor.locator('.view-lines')).toContainText('child-999')
  // Monaco inserts presentation whitespace at narrow soft wraps; the full JSON is checked below.
  await expect(jsonEditor.locator('.view-lines')).toContainText(
    /12345678901234567890\.\s*123456789/
  )
  await expect(jsonEditor.locator('.view-lines')).not.toContainText('child-999-edited')
  await jsonEditor.getByRole('button', { name: '取消单元格编辑', exact: true }).click()
  await grid.getByRole('button', { name: '退出编辑', exact: true }).click()
  await expectTopLevelIds(grid, ['1', '2', '3'])
  await grid.getByRole('button', { name: '查看 children 内容', exact: true }).first().click()
  await expect
    .poll(async () => JSON.parse((await detailJson.textContent()) || 'null'))
    .toEqual(rows[0].children)
  await detail.getByRole('button', { name: '关闭', exact: true }).click()
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出查询结果', exact: true }).click()
  await page.getByRole('menuitem', { name: '导出 Excel', exact: true }).click()
  const path = await (await downloading).path()
  if (!path) throw new Error('查询结果未生成导出文件')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(path)
  const sheet = workbook.worksheets[0]
  expect(sheet.rowCount).toBe(4)
  expect([2, 3, 4].map((row) => sheet.getCell(row, 1).value)).toEqual(['1', '2', '3'])
  expect(JSON.parse(String(sheet.getCell(2, 2).value))).toEqual(rows[0].children)
  expect(state.executions).toBe(1)
  await page.screenshot({ path: info.outputPath('sql-json-fields-flat.png') })
})
