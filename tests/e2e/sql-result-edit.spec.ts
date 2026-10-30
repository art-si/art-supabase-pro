import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { prepareIsolatedSession } from './support/isolated-session'
import { prepareAppearance, assertAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
const columnMetadata = [
  { name: 'id', dataType: 'integer', isNullable: false, isPrimaryKey: true },
  { name: 'tenant_id', dataType: 'text', isNullable: false },
  { name: 'amount', dataType: 'numeric', isNullable: true },
  { name: 'status', dataType: 'text', isNullable: true },
  { name: 'payload', dataType: 'jsonb', isNullable: true },
  { name: 'create_time', dataType: 'timestamp with time zone', isNullable: true },
  { name: 'enabled', dataType: 'boolean', isNullable: true }
]
const metadata = {
  schemas: ['public'],
  tables: [
    {
      tableSchema: 'public',
      tableName: 'orders',
      kind: 'table',
      description: '编辑验收订单',
      columns: columnMetadata
    }
  ],
  columns: columnMetadata.map((column, index) => ({
    tableSchema: 'public',
    tableName: 'orders',
    columnName: column.name,
    dataType: column.dataType,
    isNullable: column.isNullable ? 'YES' : 'NO',
    isPrimaryKey: column.isPrimaryKey,
    ordinalPosition: index + 1
  })),
  functions: [{ routineSchema: 'public', routineName: 'order_status', returnType: 'text' }],
  foreignKeys: []
}
const rows = Array.from({ length: 125 }, (_, index) => ({
  id: index + 1,
  tenant_id: 'tenant-a',
  amount: `${index + 1}.00`,
  status: `row-${String(index + 1).padStart(3, '0')}`,
  payload: { index: index + 1 },
  create_time: '2026-10-02T12:39:32.66889+00:00',
  enabled: true
}))

async function prepare(
  page: Page,
  project: string,
  query = 'SELECT * FROM public.orders LIMIT 200;'
) {
  page.setDefaultTimeout(12000)
  page.setDefaultNavigationTimeout(60000)
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
  let executions = 0
  await page.route('**/functions/v1/execute-sql-with-columns', (route) => {
    if (route.request().postDataJSON().action === 'metadata')
      return route.fulfill({ json: metadata })
    executions++
    return route.fulfill({
      json: {
        status: 'ok',
        rows,
        columns: columnMetadata.map((column) => ({
          name: column.name,
          type: column.dataType,
          nullable: column.isNullable
        })),
        rowCount: 125,
        durationMs: 3,
        commandTag: 'SELECT'
      }
    })
  })
  await page.goto('/tests/e2e/fixtures/sql-console-metadata.html?actor=result-edit&tenant=tenant-a')
  await assertAppearance(page, appearance)
  const editor = page.locator('.monaco-editor')
  await expect(editor).toBeVisible()
  await editor.getByRole('textbox', { name: 'SQL 编辑器', exact: true }).focus()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText(query)
  await page.getByRole('button', { name: '执行 SQL', exact: true }).click()
  await expect(page.locator('.result-table-container')).toBeVisible()
  return { executions: () => executions }
}

test('loaded results paginate locally and cross-page edits survive undo, preview, export and cancelled navigation', async ({
  page
}, info) => {
  test.setTimeout(180000)
  const calls = await prepare(page, info.project.name)
  const grid = page.locator('.result-table-container')
  await expect(grid.locator('.art-table-v2')).toBeVisible()
  await expect(grid.locator('.el-table-v2__main .el-vl__horizontal')).toBeVisible()
  const widths = await grid
    .locator('.el-table-v2__main .el-table-v2__header-cell')
    .evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().width))
  expect(Math.min(...widths)).toBeGreaterThanOrEqual(110)
  expect(Math.max(...widths)).toBeGreaterThanOrEqual(300)
  expect(await grid.locator('.el-table-v2__main .el-table-v2__row').count()).toBeLessThan(50)
  await expect(grid.locator('.el-pagination')).toContainText('125')
  await expect(grid.locator('.el-pagination')).toBeInViewport({ ratio: 1 })
  await grid.locator('.el-pagination .btn-next').click()
  await expect(grid).toContainText('row-051')
  expect(calls.executions()).toBe(1)
  await grid.locator('.el-pagination .btn-prev').click()
  await grid.getByRole('button', { name: '编辑副本', exact: true }).click()
  await expect(grid.getByRole('button', { name: '退出编辑', exact: true })).toBeVisible()
  await expect(grid.getByRole('button', { name: '编辑第 1 行 id', exact: true })).toHaveCount(0)
  await expect(
    grid.getByRole('button', { name: '编辑第 1 行 tenant_id', exact: true })
  ).toHaveCount(0)
  await grid.getByRole('button', { name: '编辑第 1 行 amount', exact: true }).dblclick()
  const amount = page.getByRole('textbox', { name: '编辑值 amount', exact: true })
  await amount.fill('12345678901234567890.1234')
  await page.getByRole('button', { name: '保留修改', exact: true }).click()
  await grid.getByRole('button', { name: '编辑第 1 行 status', exact: true }).dblclick()
  const status = page.getByRole('textbox', { name: '编辑值 status', exact: true })
  await status.fill("已核对'\\测试")
  await page.getByRole('button', { name: '保留修改', exact: true }).click()
  await expect(grid).toContainText('已修改 1 行 / 2 处')
  await grid.locator('.el-pagination .btn-next').click()
  await grid.getByRole('button', { name: '编辑第 51 行 amount', exact: true }).dblclick()
  await amount.fill('200.25')
  await page.getByRole('button', { name: '保留修改', exact: true }).click()
  await grid.getByText('仅看修改', { exact: true }).click()
  await expect(grid.locator('.el-table-v2__main .el-table-v2__row')).toHaveCount(2)
  await grid.getByRole('button', { name: '撤销结果修改', exact: true }).click()
  await expect(grid).toContainText('已修改 1 行 / 2 处')
  await grid.getByRole('button', { name: '重做结果修改', exact: true }).click()
  await expect(grid).toContainText('已修改 2 行 / 3 处')
  await expect(grid.locator('.el-pagination')).toBeInViewport({ ratio: 1 })
  const editor = page
    .locator('.monaco-editor')
    .getByRole('textbox', { name: 'SQL 编辑器', exact: true })
  await editor.focus()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText('SELECT * FROM public.another_table;')
  await page.screenshot({ path: info.outputPath('edited-result-pages.png') })
  await grid.getByRole('button', { name: '变更预览', exact: true }).click()
  const review = page.getByRole('dialog', { name: '结果变更预览', exact: true })
  await expect(review).toContainText('2 行 · 3 处修改')
  const jsonDownload = page.waitForEvent('download')
  await review.getByRole('button', { name: '下载变更 JSON', exact: true }).click()
  const json = await jsonDownload
  const jsonPath = info.outputPath(json.suggestedFilename())
  await json.saveAs(jsonPath)
  expect(JSON.parse(await readFile(jsonPath, 'utf8')).changes).toHaveLength(3)
  await review.getByRole('tab', { name: '更新 SQL', exact: true }).click()
  await expect(review.locator('code')).toContainText('12345678901234567890.1234')
  await expect(review.locator('code')).toContainText('"tenant_id" IS NOT DISTINCT FROM')
  await expect(review.locator('code')).toContainText('ROLLBACK;')
  await expect(review.locator('code .hljs-keyword').first()).toBeVisible()
  const sqlDownload = page.waitForEvent('download')
  await review.getByRole('button', { name: '下载更新 SQL', exact: true }).click()
  const sql = await sqlDownload
  expect(sql.suggestedFilename()).toBe('sql-result-update.sql')
  await page.screenshot({ path: info.outputPath('result-update-sql.png') })
  await review.getByRole('button', { name: '返回编辑', exact: true }).click()
  await page.getByRole('button', { name: '执行 SQL', exact: true }).click()
  const leave = page.getByRole('dialog', { name: '离开结果编辑', exact: true })
  await expect(leave).toBeVisible()
  await leave.getByRole('button', { name: '继续编辑', exact: true }).click()
  expect(calls.executions()).toBe(1)
  await expect(grid).toContainText('已修改 2 行 / 3 处')
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    '12345678901234567890.1234'
  )
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
})

test('JSON validation blocks SQL export and correction restores it', async ({ page }, info) => {
  test.setTimeout(150000)
  const calls = await prepare(page, info.project.name)
  const grid = page.locator('.result-table-container')
  await grid.getByRole('button', { name: '编辑副本', exact: true }).click()
  await grid.getByRole('button', { name: '编辑第 1 行 payload', exact: true }).dblclick()
  const input = page.getByRole('textbox', { name: 'JSON 字段编辑器', exact: true })
  await input.focus()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('Backspace')
  await page.keyboard.insertText('{bad}')
  await expect(page.getByRole('button', { name: '保留修改', exact: true })).toBeDisabled()
  // Outside close retains invalid local input for validation and correction.
  await page
    .locator('.monaco-editor')
    .first()
    .click({ position: { x: 70, y: 20 } })
  await grid.getByRole('button', { name: '变更预览', exact: true }).click()
  const review = page.getByRole('dialog', { name: '结果变更预览', exact: true })
  await expect(review).toContainText('JSON 格式不正确')
  await expect(review.getByRole('button', { name: '下载更新 SQL', exact: true })).toBeDisabled()
  await page.screenshot({ path: info.outputPath('invalid-json-change.png') })
  await review.getByRole('button', { name: '返回编辑', exact: true }).click()
  await grid.getByRole('button', { name: '编辑第 1 行 payload', exact: true }).dblclick()
  await input.focus()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('Backspace')
  await page.keyboard.insertText('{"index":1,"checked":true}')
  await page.getByRole('button', { name: '保留修改', exact: true }).click()
  await grid.getByRole('button', { name: '变更预览', exact: true }).click()
  await expect(review.getByRole('button', { name: '下载更新 SQL', exact: true })).toBeEnabled()
  expect(calls.executions()).toBe(1)
})

test('computed query results can keep local differences but cannot generate unsafe UPDATE scripts', async ({
  page
}, info) => {
  test.setTimeout(120000)
  const calls = await prepare(
    page,
    info.project.name,
    'SELECT amount * 2 AS amount FROM public.orders;'
  )
  const grid = page.locator('.result-table-container')
  await grid.getByRole('button', { name: '编辑副本', exact: true }).click()
  await grid.getByRole('button', { name: '编辑第 1 行 status', exact: true }).dblclick()
  await page.getByRole('textbox', { name: '编辑值 status', exact: true }).fill('只保留本地差异')
  await page.getByRole('button', { name: '保留修改', exact: true }).click()
  await grid.getByRole('button', { name: '变更预览', exact: true }).click()
  const review = page.getByRole('dialog', { name: '结果变更预览', exact: true })
  await expect(review.getByRole('button', { name: '下载变更 JSON', exact: true })).toBeEnabled()
  await expect(review.getByRole('button', { name: '下载更新 SQL', exact: true })).toBeDisabled()
  await review.getByRole('tab', { name: '更新 SQL', exact: true }).click()
  await expect(review).toContainText('计算列')
  expect(calls.executions()).toBe(1)
})

test('the selected SQL completion, matched word and secondary text keep readable contrast', async ({
  page
}, info) => {
  test.setTimeout(120000)
  await prepare(page, info.project.name)
  const editor = page.locator('.monaco-editor')
  await editor.getByRole('textbox', { name: 'SQL 编辑器', exact: true }).focus()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('whe')
  const selected = page.locator('.suggest-widget.visible .monaco-list-row.focused')
  await expect(selected).toHaveCount(1)
  const ratios = await selected.evaluate((row) => {
    const parse = (color: string) => (color.match(/[\d.]+/g) || []).slice(0, 3).map(Number)
    const luminance = (rgb: number[]) =>
      rgb
        .map((value) => {
          const s = value / 255
          return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
        })
        .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0)
    const background = luminance(parse(getComputedStyle(row).backgroundColor))
    return Array.from(
      row.querySelectorAll(
        '.monaco-highlighted-label, .monaco-highlighted-label .highlight, .monaco-icon-description-container'
      )
    )
      .filter((element) => element.textContent?.trim())
      .map((element) => {
        const foreground = luminance(parse(getComputedStyle(element).color))
        return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
      })
  })
  expect(ratios.length).toBeGreaterThan(1)
  for (const ratio of ratios) expect(ratio).toBeGreaterThanOrEqual(4.5)
  await page.screenshot({ path: info.outputPath('readable-sql-completion.png') })
})

test('ArtTable public editing APIs support grouped renderers, object slots, standard rules and cross-page activation', async ({
  page
}, info) => {
  test.setTimeout(150000)
  page.setDefaultTimeout(12000)
  page.setDefaultNavigationTimeout(60000)
  await prepareIsolatedSession(page)
  await prepareAppearance(page, {
    theme: info.project.name.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !info.project.name.includes('shadow')
  })
  await page.goto('/tests/e2e/fixtures/table-editing.html')
  const table = page.locator('.art-table')
  await expect(table.getByRole('button', { name: '编辑第 2 行 名称', exact: true })).toHaveCount(0)
  await table.getByRole('button', { name: '编辑第 1 行 数量', exact: true }).dblclick()
  await table.getByRole('spinbutton', { name: '第 1 行 数量', exact: true }).fill('0')
  await page.getByRole('button', { name: '校验', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('数量应在 1–99 之间')
  await expect(table.locator('.art-table__edit-error')).toContainText('数量应在 1–99 之间')
  await table.getByRole('spinbutton', { name: '第 1 行 数量', exact: true }).fill('9')
  await table.getByRole('spinbutton', { name: '第 1 行 数量', exact: true }).press('Tab')
  await table.getByRole('switch', { name: '第 1 行 启用', exact: true }).locator('..').click()
  await page.getByText('整行', { exact: true }).click()
  await expect(table.getByRole('textbox', { name: '第 1 行 名称', exact: true })).toBeVisible()
  const objectEditor = table.getByRole('textbox', { name: '自定义对象编辑器', exact: true })
  await objectEditor.scrollIntoViewIfNeeded()
  await objectEditor.fill('对象编辑成功')
  await page.getByRole('button', { name: '校验', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('校验通过')
  await expect(page.getByLabel('当前变更', { exact: true })).toContainText('对象编辑成功')
  await expect(page.getByLabel('原始首行', { exact: true })).toContainText('原始对象')
  await expect(page.getByLabel('原始首行', { exact: true })).not.toContainText('对象编辑成功')
  await page.getByRole('button', { name: '定位编辑第 26 行', exact: true }).click()
  await expect(table.getByRole('textbox', { name: '第 26 行 名称', exact: true })).toBeFocused()
  await page.getByRole('button', { name: '新增临时行', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('新增 1')
  await page.getByRole('button', { name: '移除临时行', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('新增 0 · 移除 0')
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('新增 1')
  await page.screenshot({ path: info.outputPath('art-table-edit-api.png') })
})

test('filtered table and function cards expose the same menus, pinning and shortcut actions as tree nodes', async ({
  page
}, info) => {
  test.setTimeout(120000)
  await prepare(page, info.project.name)
  const narrow = (page.viewportSize()?.width || 0) <= 900
  if (narrow) await page.getByRole('button', { name: '展开数据库资源', exact: true }).click()
  const panel = page.getByRole('complementary', { name: '数据库资源', exact: true })
  const search = panel.getByRole('textbox', { name: '搜索数据库资源', exact: true })
  await search.fill('order')
  await expect(
    panel.getByRole('button', { name: '查看对象 public.orders', exact: true })
  ).toBeVisible()
  await panel.getByRole('button', { name: '更多操作 orders', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: '生成行数统计', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await panel.getByRole('button', { name: '收藏对象 orders', exact: true }).click()
  await expect(
    panel.getByRole('button', { name: '取消收藏对象 orders', exact: true })
  ).toBeVisible()
  await panel
    .getByRole('button', { name: '查看对象 public.orders', exact: true })
    .click({ button: 'right' })
  await expect(
    page.getByRole('menuitem', { name: '新页签查询前 100 行', exact: true })
  ).toBeVisible()
  await page.keyboard.press('Escape')
  const fn = panel.getByRole('button', { name: '插入函数 public.order_status', exact: true })
  await fn.focus()
  await page.keyboard.press('Shift+F10')
  await expect(page.getByRole('menuitem', { name: '复制完整名称', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.screenshot({ path: info.outputPath('search-result-actions.png') })
})

test('typed cell popovers preserve JSON precision, use header arrow icons and save picked date and time', async ({
  page
}, info) => {
  test.setTimeout(180000)
  const calls = await prepare(page, info.project.name)
  const grid = page.locator('.result-table-container')
  await grid.getByRole('button', { name: '编辑副本', exact: true }).click()
  await grid.getByRole('button', { name: '编辑第 1 行 payload', exact: true }).dblclick()
  const jsonDialog = page.getByRole('dialog', { name: '编辑 payload', exact: true })
  const expand = jsonDialog.getByRole('button', { name: '放大编辑器', exact: true })
  await expect(expand.locator('svg')).toHaveClass(/iconify--dashicons/)
  const oldWidth = await jsonDialog.evaluate((element) => element.getBoundingClientRect().width)
  await expand.click()
  await expect(
    jsonDialog.getByRole('button', { name: '恢复编辑器大小', exact: true }).locator('svg')
  ).toHaveClass(/iconify--dashicons/)
  if ((page.viewportSize()?.width || 0) > 900)
    expect(
      await jsonDialog.evaluate((element) => element.getBoundingClientRect().width)
    ).toBeGreaterThan(oldWidth)
  const jsonInput = jsonDialog.getByRole('textbox', { name: 'JSON 字段编辑器', exact: true })
  await expect(jsonDialog.locator('.view-lines')).toContainText('"index"')
  await jsonInput.focus()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('Backspace')
  await page.keyboard.insertText('{"exact":12345678901234567890}')
  await jsonDialog.getByRole('button', { name: '格式化 JSON', exact: true }).click()
  await expect(jsonDialog.locator('.view-lines')).toContainText('12345678901234567890')
  await page.screenshot({ path: info.outputPath('typed-json-editor.png') })
  await jsonDialog.getByRole('button', { name: '保留修改', exact: true }).click()
  await grid.getByRole('button', { name: '编辑第 1 行 create_time', exact: true }).dblclick()
  const dateDialog = page.getByRole('dialog', { name: '编辑 create_time', exact: true })
  const raw = dateDialog.getByRole('textbox', { name: '编辑值 create_time', exact: true })
  await expect(raw).toHaveValue('2026-10-02T12:39:32.66889+00:00')
  await dateDialog.getByRole('combobox', { name: '选择日期时间 create_time', exact: true }).click()
  const picker = page.locator('.el-picker-panel:visible')
  await picker
    .locator('td.available:not(.prev-month):not(.next-month)')
    .filter({ hasText: /^15$/ })
    .click()
  const time = picker.locator('.el-date-picker__time-header input').nth(1)
  await time.fill('09:15:23')
  await time.press('Enter')
  await picker.getByRole('button', { name: '确定', exact: true }).click()
  await expect(raw).toHaveValue(/2026-10-15T09:15:23/)
  await expect(dateDialog.getByRole('button', { name: '保留修改', exact: true })).toBeEnabled()
  await page.screenshot({ path: info.outputPath('picked-datetime-editor.png') })
  await dateDialog.getByRole('button', { name: '保留修改', exact: true }).click()
  await grid.getByRole('button', { name: '编辑第 1 行 create_time', exact: true }).dblclick()
  await expect(raw).toHaveValue(/2026-10-15T09:15:23/)
  const datePicker = dateDialog.locator('.el-date-editor')
  await datePicker.hover()
  await datePicker.locator('.clear-icon').click()
  await expect(dateDialog.getByText('NULL', { exact: true })).toBeVisible()
  await expect(dateDialog.getByRole('button', { name: '保留修改', exact: true })).toBeEnabled()
  await dateDialog.getByRole('button', { name: '取消', exact: true }).click()
  await grid.getByRole('button', { name: '编辑第 1 行 enabled', exact: true }).dblclick()
  const booleanDialog = page.getByRole('dialog', { name: '编辑 enabled', exact: true })
  await booleanDialog.locator('.el-select__wrapper').click()
  await booleanDialog.getByRole('option', { name: 'FALSE', exact: true }).click()
  await booleanDialog.getByRole('button', { name: '保留修改', exact: true }).click()
  await expect(grid).toContainText('已修改 1 行 / 3 处')
  expect(calls.executions()).toBe(1)
})

test('opt-in Table V2 bounds DOM size and preserves selection, sorting, resizing and offscreen edit APIs', async ({
  page
}, info) => {
  test.setTimeout(120000)
  page.setDefaultTimeout(12000)
  await prepareIsolatedSession(page)
  await prepareAppearance(page, {
    theme: info.project.name.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !info.project.name.includes('shadow')
  })
  await page.goto('/tests/e2e/fixtures/table-editing.html?virtual=1')
  const table = page.locator('.art-table')
  await expect(table.locator('.art-table-v2')).toBeVisible()
  expect(await table.locator('.el-table-v2__main .el-table-v2__row').count()).toBeLessThan(30)
  await page.getByRole('button', { name: '检查渲染方式', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('"virtual":true')
  await table.getByRole('checkbox', { name: '选择第 1 行', exact: true }).locator('..').click()
  await expect(page.getByRole('status')).toContainText('已选 1 行')
  const resize = table.getByRole('button', { name: '调整名称列宽', exact: true })
  const header = resize.locator(
    'xpath=ancestor::div[contains(@class,"el-table-v2__header-cell")][1]'
  )
  const before = await header.evaluate((element) => element.getBoundingClientRect().width)
  await resize.focus()
  await resize.press('ArrowRight')
  await expect
    .poll(() => header.evaluate((element) => element.getBoundingClientRect().width))
    .toBeGreaterThan(before)
  await page.getByRole('button', { name: '定位编辑第 5000 行', exact: true }).click()
  const input = table.getByRole('textbox', { name: '第 5000 行 名称', exact: true })
  await expect(input).toBeFocused()
  await input.fill('末行编辑成功')
  await input.press('Tab')
  await expect(page.getByLabel('当前变更', { exact: true })).toContainText('末行编辑成功')
  const sortableHeader = table.locator('.el-table-v2__header-cell.is-sortable')
  await sortableHeader.click()
  await expect(sortableHeader.locator('.el-table-v2__sort-icon.is-sorting')).toBeVisible()
  expect(await table.locator('.el-table-v2__main .el-table-v2__row').count()).toBeLessThan(30)
  await page.screenshot({ path: info.outputPath('virtual-table-5000.png') })
})
