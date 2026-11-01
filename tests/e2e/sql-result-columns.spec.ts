import { expect, test, type Locator, type Page } from '@playwright/test'
import ExcelJS from 'exceljs'
import { prepareIsolatedSession } from './support/isolated-session'
import { prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

const columns = [
  { name: 'id', type: 'integer' },
  { name: 'tenant_id', type: 'text' },
  { name: 'region', type: 'text' },
  { name: 'amount', type: 'numeric' },
  { name: 'hidden_note', type: 'text' },
  ...Array.from({ length: 20 }, (_, index) => ({
    name: `field_${String(index + 1).padStart(2, '0')}`,
    type: 'text'
  }))
]
const names = columns.map((column) => column.name)
const rows = Array.from({ length: 125 }, (_, index) => ({
  id: index + 1,
  tenant_id: 'tenant-a',
  region: index % 2 ? '华北' : '华东',
  amount: `${index + 1}.00`,
  hidden_note: `hidden-secret-${String(index + 1).padStart(3, '0')}`,
  ...Object.fromEntries(
    columns.slice(5).map((column) => [column.name, `${column.name}-row-${index + 1}`])
  )
}))
const metadata = {
  schemas: ['public'],
  tables: [{ tableSchema: 'public', tableName: 'orders', kind: 'table' }],
  columns: columns.map((column, index) => ({
    tableSchema: 'public',
    tableName: 'orders',
    columnName: column.name,
    dataType: column.type,
    isPrimaryKey: column.name === 'id',
    isNullable: column.name === 'id' || column.name === 'tenant_id' ? 'NO' : 'YES',
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
  const state = { requests: 0, executions: 0 }
  await page.route('**/functions/v1/execute-sql-with-columns', (route) => {
    state.requests++
    const body = route.request().postDataJSON() as { action?: string }
    if (body.action === 'metadata') return route.fulfill({ json: metadata })
    state.executions++
    return route.fulfill({
      json: {
        status: 'ok',
        rows,
        columns,
        rowCount: rows.length,
        durationMs: 2,
        commandTag: 'SELECT'
      }
    })
  })
  await page.goto('/tests/e2e/fixtures/sql-console-metadata.html?actor=column-test&tenant=tenant-a')
  const editor = page.locator('.monaco-editor').getByRole('textbox', {
    name: 'SQL 编辑器',
    exact: true
  })
  await editor.focus()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText('SELECT * FROM public.orders LIMIT 200;')
  await page.getByRole('button', { name: '执行 SQL', exact: true }).click()
  const grid = page.locator('.result-table-container')
  await expect(grid).toContainText('本次已加载 125 行 · 显示 25/25 列')
  return { state, grid }
}

async function headerNames(grid: Locator) {
  return grid
    .locator('.el-table-v2__main .el-table-v2__header-cell .sql-result-column-header')
    .evaluateAll((headers) =>
      headers.map((header) => header.firstElementChild?.textContent?.trim() || '')
    )
}

async function firstRowValues(grid: Locator) {
  return grid
    .locator('.el-table-v2__main .el-table-v2__row')
    .first()
    .locator('.el-table-v2__row-cell')
    .allTextContents()
}

async function assertColumnAlignment(grid: Locator, count: number) {
  await expect
    .poll(() =>
      grid.evaluate((root) => {
        const headers = Array.from(
          root.querySelectorAll('.el-table-v2__main .el-table-v2__header-cell')
        )
        const cells = Array.from(
          root
            .querySelector('.el-table-v2__main .el-table-v2__row')
            ?.querySelectorAll('.el-table-v2__row-cell') || []
        )
        return {
          headerCount: headers.length,
          bodyCount: cells.length,
          mismatches: headers.flatMap((header, index) => {
            const head = header.getBoundingClientRect()
            const body = cells[index]?.getBoundingClientRect()
            if (
              body &&
              Math.abs(head.left - body.left) <= 1 &&
              Math.abs(head.width - body.width) <= 1
            )
              return []
            return [
              {
                field: header.querySelector('.sql-result-column-header')?.firstElementChild
                  ?.textContent,
                headerLeft: head.left,
                headerWidth: head.width,
                bodyLeft: body?.left,
                bodyWidth: body?.width
              }
            ]
          })
        }
      })
    )
    .toEqual({ headerCount: count, bodyCount: count, mismatches: [] })
}

async function openColumns(page: Page, grid: Locator) {
  await grid.getByRole('button', { name: '设置显示列', exact: true }).click()
  const popover = page.locator('.el-popover:visible').filter({
    has: page.getByRole('group', { name: '列显示预设', exact: true })
  })
  await expect(popover.getByRole('checkbox')).toHaveCount(columns.length)
  await expect
    .poll(async () => {
      const box = await popover.boundingBox()
      return box ? box.y + box.height : Number.POSITIVE_INFINITY
    })
    .toBeLessThanOrEqual((page.viewportSize()?.height || 0) + 1)
  const lastField = popover.getByText('field_20', { exact: true })
  await lastField.scrollIntoViewIfNeeded()
  await expect(lastField).toBeInViewport({ ratio: 1 })
  await popover.getByText('id', { exact: true }).scrollIntoViewIfNeeded()
  return popover
}

async function hideColumns(page: Page, grid: Locator, fields: string[]) {
  const popover = await openColumns(page, grid)
  for (const field of fields) await hideColumn(popover, field)
  await closeColumns(popover)
}

async function closeColumns(popover: Locator) {
  await popover.getByRole('button', { name: '关闭列设置', exact: true }).click()
  await expect(popover).toBeHidden()
}

async function hideColumn(popover: Locator, field: string) {
  await popover.getByText(field, { exact: true }).click()
  await expect(popover.getByRole('checkbox', { name: field, exact: true })).not.toBeChecked()
}

test('wide result columns keep values aligned through visibility, drag, keyboard order and recovery', async ({
  page
}, info) => {
  const { grid, state } = await prepare(page, info.project.name)
  const requests = state.requests
  await expect.poll(() => headerNames(grid)).toEqual(names)
  let popover = await openColumns(page, grid)
  await hideColumn(popover, 'hidden_note')
  await expect.poll(() => headerNames(grid)).toEqual(names.filter((name) => name !== 'hidden_note'))
  const source = popover.locator('.column-option').filter({
    has: page.getByRole('checkbox', { name: 'region', exact: true })
  })
  const target = popover.locator('.column-option').filter({
    has: page.getByRole('checkbox', { name: 'id', exact: true })
  })
  const from = await source.locator('.drag-icon').boundingBox()
  const to = await target.boundingBox()
  if (!from || !to) throw new Error('列拖拽控件不可见')
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 - 8, { steps: 3 })
  await page.mouse.move(to.x + 12, to.y + 4, { steps: 12 })
  await page.mouse.up()
  await expect.poll(async () => (await headerNames(grid)).indexOf('region')).toBeLessThan(2)
  const dragOrder = await headerNames(grid)
  expect(['region,id,tenant_id,amount', 'id,region,tenant_id,amount']).toContain(
    dragOrder.slice(0, 4).join(',')
  )
  expect(dragOrder.slice(4)).toEqual(names.slice(5))
  const firstRow: Record<string, unknown> = rows[0]
  await expect
    .poll(async () => (await firstRowValues(grid)).slice(0, 4))
    .toEqual(dragOrder.slice(0, 4).map((name) => String(firstRow[name])))
  await assertColumnAlignment(grid, dragOrder.length)
  const region = popover.getByRole('checkbox', { name: 'region', exact: true })
  const keyboardOrder = [...dragOrder]
  const regionIndex = keyboardOrder.indexOf('region')
  ;[keyboardOrder[regionIndex], keyboardOrder[regionIndex + 1]] = [
    keyboardOrder[regionIndex + 1],
    keyboardOrder[regionIndex]
  ]
  await region.focus()
  await page.keyboard.press('Alt+ArrowDown')
  await expect(region).toBeFocused()
  await expect.poll(() => headerNames(grid)).toEqual(keyboardOrder)
  await page.keyboard.press('Alt+ArrowUp')
  await expect(region).toBeFocused()
  await expect.poll(() => headerNames(grid)).toEqual(dragOrder)
  await popover.getByRole('button', { name: '完整视图', exact: true }).click()
  await expect.poll(async () => (await headerNames(grid)).length).toBe(columns.length)
  await page.screenshot({ path: info.outputPath('sql-columns-settings.png') })
  await closeColumns(popover)
  await expect(grid.getByRole('button', { name: '设置显示列', exact: true })).toBeFocused()
  popover = await openColumns(page, grid)
  await page.keyboard.press('Escape')
  await expect(popover).toBeHidden()
  await expect(grid.getByRole('button', { name: '设置显示列', exact: true })).toBeFocused()
  await grid.getByRole('button', { name: '重置列视图', exact: true }).click()
  await expect.poll(() => headerNames(grid)).toEqual(names)
  popover = await openColumns(page, grid)
  for (const name of names) await hideColumn(popover, name)
  await closeColumns(popover)
  await expect(grid).toContainText('所有结果列已隐藏')
  await expect(grid.getByRole('button', { name: '设置显示列', exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('sql-columns-all-hidden.png') })
  await grid.getByRole('button', { name: '显示全部结果列', exact: true }).click()
  await expect.poll(() => headerNames(grid)).toEqual(names)
  await expect
    .poll(async () => (await firstRowValues(grid)).slice(0, 5))
    .toEqual(['1', 'tenant-a', '华东', '1.00', 'hidden-secret-001'])
  expect(state.requests).toBe(requests)
  expect(state.executions).toBe(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
  await page.screenshot({ path: info.outputPath('sql-columns-restored.png') })
})

test('hidden columns remain in search, analysis and Excel while editing restores protected fields', async ({
  page
}, info) => {
  const { grid, state } = await prepare(page, info.project.name)
  const requests = state.requests
  const hidden = ['id', 'tenant_id', 'region', 'amount', 'hidden_note']
  await hideColumns(page, grid, hidden)
  await expect.poll(() => headerNames(grid)).toEqual(names.slice(hidden.length))
  const search = grid.getByRole('textbox', { name: '搜索已加载结果', exact: true })
  await search.fill('hidden-secret-125')
  await expect(grid.getByRole('status')).toContainText('匹配 1 行')
  await expect(grid).toContainText('field_01-row-125')
  await grid.getByRole('button', { name: '字段统计', exact: true }).click()
  const profile = page.getByRole('dialog', { name: '字段统计', exact: true })
  await profile.getByRole('combobox', { name: '统计字段', exact: true }).click()
  await page.getByRole('option', { name: 'amount', exact: true }).click()
  await expect(profile).toContainText('本次已加载 125 行 · 25 列')
  await expect(profile.getByText('7875', { exact: true })).toBeAttached()
  await profile.getByRole('button', { name: '返回结果表', exact: true }).click()
  await grid.getByRole('button', { name: '结果图表', exact: true }).click()
  const chart = page.getByRole('dialog', { name: '结果图表', exact: true })
  await expect(chart).toContainText('本次已加载 125 行 · 25 列')
  await chart.getByRole('combobox', { name: '图表类别字段', exact: true }).click()
  await page.getByRole('option', { name: 'region', exact: true }).click()
  await chart.getByText('行数统计', { exact: true }).click()
  await expect(chart).toContainText('2 个数据点')
  await chart.getByRole('tab', { name: '图表数据', exact: true }).click()
  await expect(chart.getByRole('row', { name: /华东/ })).toContainText('63')
  await expect(chart.getByRole('row', { name: /华北/ })).toContainText('62')
  await chart.getByRole('button', { name: '返回结果表', exact: true }).click()
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出查询结果', exact: true }).click()
  const download = await downloading
  const path = await download.path()
  if (!path) throw new Error('Excel 导出未生成文件')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(path)
  const sheet = workbook.worksheets[0]
  expect(sheet.rowCount).toBe(126)
  expect(sheet.getRow(1).values).toEqual([undefined, ...names])
  expect(sheet.getCell(126, 1).value).toBe('125')
  expect(sheet.getCell(126, 4).value).toBe('125.00')
  expect(sheet.getCell(126, 5).value).toBe('hidden-secret-125')
  expect(state.requests).toBe(requests)
  expect(state.executions).toBe(1)
  await grid.getByRole('button', { name: '编辑副本', exact: true }).click()
  await expect(grid.getByRole('button', { name: '退出编辑', exact: true })).toBeVisible()
  await expect.poll(() => headerNames(grid)).toEqual(names)
  await expect(grid.getByRole('button', { name: '编辑第 1 行 id', exact: true })).toHaveCount(0)
  await expect(
    grid.getByRole('button', { name: '编辑第 1 行 tenant_id', exact: true })
  ).toHaveCount(0)
  await expect(grid.getByRole('button', { name: '编辑第 1 行 amount', exact: true })).toBeVisible()
  await assertColumnAlignment(grid, columns.length)
  await page.screenshot({ path: info.outputPath('sql-columns-edit-protected.png') })
  await grid.getByRole('button', { name: '退出编辑', exact: true }).click()
  await expect.poll(() => headerNames(grid)).toEqual(names.slice(hidden.length))
  expect(state.requests).toBe(requests)
  await page.getByRole('button', { name: '执行 SQL', exact: true }).click()
  await expect.poll(() => headerNames(grid)).toEqual(names)
  expect(state.executions).toBe(2)
  await hideColumns(page, grid, ['id'])
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('sql-preview-tenant-change', { detail: 'tenant-b' }))
  })
  await expect(grid).toHaveCount(0)
  await page.getByRole('button', { name: '执行 SQL', exact: true }).click()
  await expect.poll(() => headerNames(grid)).toEqual(names)
  expect(state.executions).toBe(3)
})
