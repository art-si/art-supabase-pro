import { expect, test, type Locator, type Page } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
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
const rows = Array.from({ length: 80 }, (_, index) => ({
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
  await page.goto('/tests/e2e/fixtures/sql-console-metadata.html?actor=pin-test&tenant=tenant-a')
  const editor = page
    .locator('.monaco-editor')
    .getByRole('textbox', { name: 'SQL 编辑器', exact: true })
  await editor.focus()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText('SELECT * FROM public.orders LIMIT 200;')
  await page.getByRole('button', { name: '执行 SQL', exact: true }).click()
  const grid = page.locator('.result-table-container')
  await expect(grid).toContainText('本次已加载 80 行')
  return { state, grid }
}

function fixedHeader(grid: Locator, side: 'left' | 'right', field: string) {
  return grid.locator(`.el-table-v2__${side} .el-table-v2__header-cell[data-key="${field}"]`)
}

async function setVisible(page: Page, grid: Locator, field: string, visible: boolean) {
  await grid.getByRole('button', { name: '设置显示列', exact: true }).click()
  const popover = page.locator('.el-popover:visible').filter({
    has: page.getByRole('group', { name: '列显示预设', exact: true })
  })
  const checkbox = popover.getByRole('checkbox', { name: field, exact: true })
  if ((await checkbox.isChecked()) !== visible)
    await popover.getByText(field, { exact: true }).click()
  await expect(checkbox).toBeChecked({ checked: visible })
  await popover.getByRole('button', { name: '关闭列设置', exact: true }).click()
  await expect(popover).toBeHidden()
}

async function hideAllColumns(page: Page, grid: Locator) {
  await grid.getByRole('button', { name: '设置显示列', exact: true }).click()
  const popover = page.locator('.el-popover:visible').filter({
    has: page.getByRole('group', { name: '列显示预设', exact: true })
  })
  for (const column of columns) {
    await popover.getByText(column.name, { exact: true }).click()
    await expect(
      popover.getByRole('checkbox', { name: column.name, exact: true })
    ).not.toBeChecked()
  }
  await popover.getByRole('button', { name: '关闭列设置', exact: true }).click()
  await expect(grid).toContainText('所有结果列已隐藏')
}

async function assertFixedValues(grid: Locator) {
  const left = grid.locator('.el-table-v2__left')
  const right = grid.locator('.el-table-v2__right')
  await expect(fixedHeader(grid, 'left', 'region')).toBeInViewport({ ratio: 1 })
  await expect(fixedHeader(grid, 'right', 'hidden_note')).toBeInViewport({ ratio: 1 })
  await expect(
    left.getByRole('button', { name: '查看 region 内容', exact: true }).first()
  ).toHaveText('华东')
  await expect(
    right.getByRole('button', { name: '查看 hidden_note 内容', exact: true }).first()
  ).toHaveText('hidden-secret-001')
}

async function scrollHorizontally(page: Page, grid: Locator) {
  const marker = grid.locator('.el-table-v2__main .el-table-v2__header-cell[data-key="field_10"]')
  const before = await marker.boundingBox()
  const frame = await grid.boundingBox()
  const row = await grid.locator('.el-table-v2__main .el-table-v2__row').first().boundingBox()
  if (!before || !frame || !row) throw new Error('结果表格尚未完成布局')
  await page.mouse.move(frame.x + frame.width / 2, row.y + row.height / 2)
  await page.mouse.wheel(1400, 0)
  await expect
    .poll(async () => (await marker.boundingBox())?.x ?? before.x)
    .toBeLessThan(before.x - 100)
}

async function dragColumnWider(page: Page, grid: Locator, field: string, distance: number) {
  const handle = grid.locator('.el-table-v2__left').getByRole('button', {
    name: `调整${field}列宽`,
    exact: true
  })
  const box = await handle.boundingBox()
  if (!box) throw new Error('固定列的宽度调整控件不可见')
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  const target = await page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y)
    return { tag: element?.tagName, label: element?.closest('button')?.getAttribute('aria-label') }
  }, point)
  const evidence = test.info().outputPath('fixed-column-resize-hit-target.json')
  await writeFile(evidence, JSON.stringify({ box, point, target }, null, 2))
  await test
    .info()
    .attach('fixed-column-resize-hit-target', { path: evidence, contentType: 'application/json' })
  expect(target.label).toBe(`调整${field}列宽`)
  await handle.hover({ position: { x: box.width / 2, y: box.height / 2 } })
  await page.mouse.move(point.x, point.y)
  await page.mouse.down()
  await page.mouse.move(point.x + distance, point.y, { steps: 20 })
  await page.mouse.up()
}

async function openPins(page: Page, grid: Locator) {
  await grid.getByRole('button', { name: '固定列', exact: true }).click()
  const popover = page.locator('.el-popover:visible').filter({
    has: page.getByRole('combobox', { name: '固定字段', exact: true })
  })
  await expect(popover).toBeVisible()
  await expect
    .poll(async () => {
      const box = await popover.boundingBox()
      return box ? box.y + box.height : Number.POSITIVE_INFINITY
    })
    .toBeLessThanOrEqual((page.viewportSize()?.height || 0) + 1)
  return popover
}

async function setPin(page: Page, grid: Locator, field: string, side: 'left' | 'right' | null) {
  const popover = await openPins(page, grid)
  await selectPinField(page, popover, field)
  const label = side === 'left' ? '固定左侧' : side === 'right' ? '固定右侧' : '不固定'
  await expect(popover.getByRole('radio', { name: label, exact: true })).toBeEnabled()
  await popover.getByText(label, { exact: true }).click()
  await popover.getByRole('button', { name: '关闭固定列设置', exact: true }).click()
  await expect(popover).toBeHidden()
}

async function selectPinField(page: Page, popover: Locator, field: string) {
  await popover.getByRole('combobox', { name: '固定字段', exact: true }).click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText(field)
  await page.getByRole('option', { name: field, exact: true }).click()
}

async function assertToolbarMetrics(grid: Locator, pinned: boolean) {
  const labels = ['设置显示列', '重置列视图', '固定列', '字段统计', '结果图表']
  await expect(grid.getByRole('button', { name: '固定列', exact: true })).toHaveAttribute(
    'aria-pressed',
    String(pinned)
  )
  const measurements = []
  for (const label of labels) {
    const control = grid.getByRole('button', { name: label, exact: true })
    await expect(control).toBeVisible()
    await expect(control.locator('svg')).toHaveCount(1)
    const metrics = await control.evaluate((button) => {
      const style = getComputedStyle(button)
      const box = button.getBoundingClientRect()
      const icon = button.querySelector('svg')!
      const iconStyle = getComputedStyle(icon)
      const iconBox = icon.getBoundingClientRect()
      return {
        width: box.width,
        height: box.height,
        computedWidth: Number.parseFloat(style.width),
        computedHeight: Number.parseFloat(style.height),
        iconWidth: iconBox.width,
        iconHeight: iconBox.height,
        computedIconWidth: Number.parseFloat(iconStyle.width),
        computedIconHeight: Number.parseFloat(iconStyle.height)
      }
    })
    measurements.push({ label, ...metrics })
    const iconOnly = label === '设置显示列' || label === '重置列视图'
    expect(metrics.height, `${label} rendered height, pinned=${pinned}`).toBeCloseTo(
      iconOnly ? 26 : 24,
      1
    )
    expect(metrics.computedHeight, `${label} CSS height, pinned=${pinned}`).toBeCloseTo(
      iconOnly ? 26 : 24,
      1
    )
    if (iconOnly) {
      expect(metrics.width, `${label} rendered width`).toBeCloseTo(26, 1)
      expect(metrics.computedWidth, `${label} CSS width`).toBeCloseTo(26, 1)
      expect(metrics.iconWidth, `${label} rendered icon width`).toBeCloseTo(16, 1)
      expect(metrics.iconHeight, `${label} rendered icon height`).toBeCloseTo(16, 1)
      expect(metrics.computedIconWidth, `${label} CSS icon width`).toBeCloseTo(16, 1)
      expect(metrics.computedIconHeight, `${label} CSS icon height`).toBeCloseTo(16, 1)
    }
  }
  const heights = measurements
    .filter(({ label }) => ['固定列', '字段统计', '结果图表'].includes(label))
    .map(({ height }) => height)
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(0.1)
  return measurements
}

test('both fixed sides preserve field identity through scrolling, menus, editing and result replacement', async ({
  page
}, info) => {
  test.skip((page.viewportSize()?.width || 0) < 900, '两侧固定在桌面验证，窄屏另测暂停说明')
  const { grid, state } = await prepare(page, info.project.name)
  const requests = state.requests
  const unpinnedMetrics = await assertToolbarMetrics(grid, false)
  await setPin(page, grid, 'region', 'left')
  await setPin(page, grid, 'hidden_note', 'right')
  await assertFixedValues(grid)
  const pinnedMetrics = await assertToolbarMetrics(grid, true)
  const metricsPath = info.outputPath('sql-result-toolbar-metrics.json')
  await writeFile(
    metricsPath,
    JSON.stringify({ unpinned: unpinnedMetrics, pinned: pinnedMetrics }, null, 2)
  )
  await info.attach('sql-result-toolbar-metrics', {
    path: metricsPath,
    contentType: 'application/json'
  })
  const leftBefore = await fixedHeader(grid, 'left', 'region').boundingBox()
  const rightBefore = await fixedHeader(grid, 'right', 'hidden_note').boundingBox()
  await scrollHorizontally(page, grid)
  await assertFixedValues(grid)
  expect((await fixedHeader(grid, 'left', 'region').boundingBox())?.x).toBeCloseTo(leftBefore!.x, 0)
  expect((await fixedHeader(grid, 'right', 'hidden_note').boundingBox())?.x).toBeCloseTo(
    rightBefore!.x,
    0
  )
  await page.screenshot({ path: info.outputPath('sql-column-pins-scrolled.png') })

  await fixedHeader(grid, 'right', 'hidden_note').click({ button: 'right' })
  await page.getByRole('menuitem', { name: '固定到左侧', exact: true }).click()
  await expect(fixedHeader(grid, 'left', 'hidden_note')).toBeInViewport({ ratio: 1 })
  await expect(grid.locator('.el-table-v2__right')).toHaveCount(0)
  const pinnedValue = grid
    .locator('.el-table-v2__left')
    .getByRole('button', {
      name: '查看 hidden_note 内容',
      exact: true
    })
    .first()
  await pinnedValue.click({ button: 'right' })
  await page.getByRole('menuitem', { name: '查看', exact: true }).click()
  const details = page.getByRole('dialog', { name: '单元格详情', exact: true })
  await expect(details.getByText('hidden_note', { exact: true })).toBeVisible()
  await expect(details.getByLabel('单元格内容代码', { exact: true })).toHaveText(
    'hidden-secret-001'
  )
  await details.getByRole('button', { name: '关闭', exact: true }).last().click()
  await pinnedValue.click({ button: 'right' })
  await page.getByRole('menuitem', { name: '固定到右侧', exact: true }).click()
  await assertFixedValues(grid)

  await setVisible(page, grid, 'id', false)
  await setVisible(page, grid, 'tenant_id', false)
  await grid.getByRole('button', { name: '字段统计', exact: true }).click()
  const profile = page.getByRole('dialog', { name: '字段统计', exact: true })
  await expect(profile).toContainText('本次已加载 80 行 · 25 列')
  await profile.getByRole('button', { name: '返回结果表', exact: true }).click()
  await grid.getByRole('button', { name: '结果图表', exact: true }).click()
  const chart = page.getByRole('dialog', { name: '结果图表', exact: true })
  await expect(chart).toContainText('本次已加载 80 行 · 25 列')
  await chart.getByRole('button', { name: '返回结果表', exact: true }).click()
  const resizeWhileEditing = info.project.name.includes('dark')
  if (resizeWhileEditing) {
    // Keep identical read/edit column keys so exit alone cannot trigger a new layout event.
    await setVisible(page, grid, 'id', true)
    await setVisible(page, grid, 'tenant_id', true)
    await assertFixedValues(grid)
  }
  await grid.getByRole('button', { name: '编辑副本', exact: true }).click()
  await expect(grid.getByRole('button', { name: '退出编辑', exact: true })).toBeVisible()
  await expect(grid.locator('.el-table-v2__left, .el-table-v2__right')).toHaveCount(0)
  await expect(grid.getByRole('button', { name: '编辑第 1 行 id', exact: true })).toHaveCount(0)
  await expect(
    grid.getByRole('button', { name: '编辑第 1 行 tenant_id', exact: true })
  ).toHaveCount(0)
  await expect(grid.getByRole('button', { name: '编辑第 1 行 amount', exact: true })).toBeVisible()
  if (resizeWhileEditing) await page.setViewportSize({ width: 600, height: 900 })
  await grid.getByRole('button', { name: '退出编辑', exact: true }).click()
  if (resizeWhileEditing) {
    await expect(grid.locator('.el-table-v2__left, .el-table-v2__right')).toHaveCount(0)
    await expect(grid.locator('.sql-result-tools').getByRole('status')).toContainText('固定 0 列')
    await expect(grid).toContainText('当前工作区较窄，固定列已暂停')
    await page.screenshot({ path: info.outputPath('sql-column-pins-edit-narrow-exit.png') })
    await page.setViewportSize({ width: 1440, height: 900 })
  }
  await assertFixedValues(grid)
  expect(state.requests).toBe(requests)
  expect(state.executions).toBe(1)

  await grid.getByRole('button', { name: '重置列视图', exact: true }).click()
  await expect(grid.locator('.el-table-v2__left, .el-table-v2__right')).toHaveCount(0)
  await setPin(page, grid, 'region', 'left')
  await page.getByRole('button', { name: '执行 SQL', exact: true }).click()
  await expect(grid.locator('.art-table-v2')).toBeVisible()
  await expect(grid.locator('.el-table-v2__left, .el-table-v2__right')).toHaveCount(0)
  expect(state.executions).toBe(2)
  await setPin(page, grid, 'region', 'left')
  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('sql-preview-tenant-change', {
        detail: '00000000-0000-4000-8000-000000000002'
      })
    )
  })
  await expect(grid).toHaveCount(0)
  await page.getByRole('button', { name: '执行 SQL', exact: true }).click()
  await expect(grid.locator('.art-table-v2')).toBeVisible()
  await expect(grid.locator('.el-table-v2__left, .el-table-v2__right')).toHaveCount(0)
  expect(state.executions).toBe(3)
})

test('real viewport and resized widths suspend pins while hidden fields release the budget', async ({
  page
}, info) => {
  test.skip((page.viewportSize()?.width || 0) < 900, '预算与拖宽在桌面验证')
  const { grid, state } = await prepare(page, info.project.name)
  const requests = state.requests
  await setPin(page, grid, 'region', 'left')
  await setPin(page, grid, 'hidden_note', 'right')
  await assertFixedValues(grid)
  await setPin(page, grid, 'id', 'left')
  await expect(
    page.getByText('固定后空间不足，请减少固定列或缩小列宽后重试。', { exact: true })
  ).toBeVisible()
  await expect(fixedHeader(grid, 'left', 'id')).toHaveCount(0)
  await assertFixedValues(grid)

  await page.setViewportSize({ width: 800, height: 900 })
  await expect(fixedHeader(grid, 'right', 'hidden_note')).toHaveCount(0)
  await expect(grid).toContainText('部分固定列已暂停')
  await setVisible(page, grid, 'region', false)
  await expect(fixedHeader(grid, 'right', 'hidden_note')).toBeInViewport({ ratio: 1 })
  await expect(fixedHeader(grid, 'left', 'region')).toHaveCount(0)
  await setVisible(page, grid, 'region', true)
  await expect(fixedHeader(grid, 'right', 'hidden_note')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('sql-column-pins-narrow-paused.png') })

  await page.setViewportSize({ width: 1440, height: 900 })
  await assertFixedValues(grid)
  await hideAllColumns(page, grid)
  const hiddenPins = await openPins(page, grid)
  await expect(hiddenPins).toContainText('当前没有显示的字段，请先在列设置中恢复字段。')
  for (const field of ['region', 'hidden_note'])
    await expect(
      hiddenPins.getByRole('button', { name: `取消固定 ${field}`, exact: true })
    ).toBeEnabled()
  await expect(hiddenPins.getByRole('button', { name: '取消全部固定', exact: true })).toBeEnabled()
  await page.screenshot({ path: info.outputPath('sql-column-pins-all-hidden-options.png') })
  await hiddenPins.getByRole('button', { name: '关闭固定列设置', exact: true }).click()
  await grid.getByRole('button', { name: '显示全部结果列', exact: true }).click()
  await assertFixedValues(grid)
  const header = grid.locator('.el-table-v2__main .el-table-v2__header-cell[data-key="region"]')
  const before = await fixedHeader(grid, 'left', 'region').evaluate(
    (element) => element.getBoundingClientRect().width
  )
  await dragColumnWider(page, grid, 'region', 600)
  await expect
    .poll(() => header.evaluate((element) => element.getBoundingClientRect().width))
    .toBeGreaterThan(before + 400)
  await expect(fixedHeader(grid, 'left', 'region')).toHaveCount(0)
  await expect(fixedHeader(grid, 'right', 'hidden_note')).toBeInViewport({ ratio: 1 })
  await expect(grid).toContainText('部分固定列已暂停')
  expect(state.requests).toBe(requests)
  expect(state.executions).toBe(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
  await page.screenshot({ path: info.outputPath('sql-column-pins-resize-paused.png') })
})

test('narrow workspaces explain paused pinning and keep original results available', async ({
  page
}, info) => {
  test.skip((page.viewportSize()?.width || 1440) >= 640, '窄屏说明只在390px场景验证')
  const { grid, state } = await prepare(page, info.project.name)
  const requests = state.requests
  const popover = await openPins(page, grid)
  await selectPinField(page, popover, 'region')
  await expect(popover).toContainText('当前工作区较窄，固定列已暂停')
  await expect(popover.getByRole('radio', { name: '固定左侧', exact: true })).toBeDisabled()
  await expect(popover.getByRole('radio', { name: '固定右侧', exact: true })).toBeDisabled()
  await page.screenshot({ path: info.outputPath('sql-column-pins-mobile-explanation.png') })
  await popover.getByRole('button', { name: '关闭固定列设置', exact: true }).click()
  await expect(grid.locator('.el-table-v2__left, .el-table-v2__right')).toHaveCount(0)
  await expect(grid.getByRole('button', { name: '查看 id 内容', exact: true }).first()).toHaveText(
    '1'
  )
  expect(state.requests).toBe(requests)
  expect(state.executions).toBe(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
})
