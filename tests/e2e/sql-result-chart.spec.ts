import { expect, test, type Locator } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { prepareIsolatedSession } from './support/isolated-session'
import { prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const columns = [
  { name: 'region', type: 'text' },
  { name: 'amount', type: 'numeric' },
  { name: 'quantity', type: 'integer' }
]
const rows = [
  { region: '华东', amount: '0.1', quantity: 1 },
  { region: '华东', amount: '0.2', quantity: 2 },
  { region: '华北', amount: '8.50', quantity: 3 },
  { region: '华南', amount: null, quantity: 4 },
  { region: '高精度', amount: '0.1234567890123456789', quantity: 5 }
]

async function expectChartData(
  drawer: Locator,
  category: string,
  exact: string,
  sourceRows: string
) {
  const pane = drawer.getByRole('tabpanel', { name: '图表数据', exact: true })
  await expect(pane).toBeVisible()
  const table = pane.locator('.art-table')
  for (const label of ['类别', '精确值', '来源行数']) {
    const header = table.getByRole('columnheader', { name: label, exact: true })
    await header.scrollIntoViewIfNeeded()
    await expect(header).toBeVisible()
    await expect(header).toBeInViewport({ ratio: 0.75 })
  }
  const body = table.locator('.el-table__body-wrapper')
  await expect
    .poll(() => body.evaluate((element) => element.getBoundingClientRect().height))
    .toBeGreaterThan(48)
  const firstRow = body.locator('tbody > tr').first()
  await expect(firstRow).toBeVisible()
  await expect(firstRow.getByRole('cell')).toHaveCount(3)
  for (const [index, text] of [category, exact, sourceRows].entries()) {
    const cell = firstRow.getByRole('cell').nth(index)
    await expect(cell).toHaveText(text)
    // Narrow drawers may scroll horizontally; each value must actually be inspectable.
    await cell.scrollIntoViewIfNeeded()
    await expect(cell).toBeVisible()
    await expect(cell).toBeInViewport({ ratio: 0.75 })
  }
}

test('result charts map fields, aggregate exactly, export PNG and return to untouched original rows', async ({
  page
}, info) => {
  page.setDefaultTimeout(15_000)
  page.setDefaultNavigationTimeout(60_000)
  await prepareIsolatedSession(page)
  await prepareAppearance(page, {
    theme: info.project.name.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !info.project.name.includes('shadow')
  })
  let executions = 0
  let resultRows = rows
  await page.route('**/functions/v1/execute-sql-with-columns', (route) => {
    const body = route.request().postDataJSON() as { action?: string }
    if (body.action === 'metadata')
      return route.fulfill({
        json: { schemas: [], tables: [], columns: [], functions: [], foreignKeys: [] }
      })
    executions++
    return route.fulfill({
      json: {
        status: 'ok',
        rows: resultRows,
        columns,
        commandTag: 'SELECT',
        rowCount: resultRows.length,
        truncated: true,
        durationMs: 3
      }
    })
  })
  await page.goto('/tests/e2e/fixtures/sql-console-metadata.html?actor=chart-test&tenant=tenant-a')
  await page.getByRole('button', { name: '执行 SQL', exact: true }).click()
  const table = page.locator('.result-table-container')
  await table.getByRole('textbox', { name: '搜索已加载结果', exact: true }).fill('华北')
  await table.getByRole('button', { name: '结果图表', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: '结果图表', exact: true })
  await expect(drawer).toContainText('本次已加载 5 行')
  await expect(drawer).toContainText('已排除 1 行空数值；已排除 1 行无效或超出绘图精度的数值')
  await expect(drawer).toContainText('同名类别按原始行分别展示，不自动合并')
  await drawer.getByRole('img', { name: /SQL 结果柱状图/ }).scrollIntoViewIfNeeded()
  await expect(drawer.locator('canvas')).toBeVisible()
  await drawer.getByText('按类别求和', { exact: true }).click()
  await expect(drawer).toContainText('2 个数据点')
  await drawer.getByRole('tab', { name: '图表数据', exact: true }).click()
  await expectChartData(drawer, '华东', '0.3', '2')
  await expect(drawer.getByRole('cell', { name: '0.3', exact: true })).toBeVisible()
  await expect(drawer.getByRole('cell', { name: '8.5', exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('sql-result-chart-exact-data.png') })
  await drawer.getByRole('tab', { name: '图表', exact: true }).click()
  await drawer.getByText('饼图', { exact: true }).click()
  await drawer.getByRole('img', { name: /SQL 结果饼图/ }).scrollIntoViewIfNeeded()
  await expect(drawer.getByRole('img', { name: /SQL 结果饼图/ })).toBeVisible()
  const downloaded = page.waitForEvent('download')
  await drawer.getByRole('button', { name: '下载图表 PNG', exact: true }).click()
  const file = await downloaded
  const filename = await file.path()
  expect(filename).toBeTruthy()
  expect((await readFile(filename!)).subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  )
  await page.screenshot({ path: info.outputPath('sql-result-chart-pie.png') })
  await drawer.getByText('散点图', { exact: true }).click()
  const x = drawer.getByRole('combobox', { name: '图表 X 轴数值', exact: true })
  await x.click()
  await page.getByRole('option', { name: 'quantity', exact: true }).click()
  await expect(drawer).toContainText('每行对应一个点')
  await drawer.getByRole('img', { name: /SQL 结果散点图/ }).scrollIntoViewIfNeeded()
  await expect(drawer.locator('canvas')).toBeVisible()
  await page.screenshot({ path: info.outputPath('sql-result-chart-scatter.png') })
  await drawer.getByRole('button', { name: '返回结果表', exact: true }).click()
  await expect(drawer).toBeHidden()
  await expect(table.getByRole('textbox', { name: '搜索已加载结果', exact: true })).toHaveValue(
    '华北'
  )
  await table.getByRole('button', { name: '结果图表', exact: true }).click()
  await drawer.getByRole('img', { name: /SQL 结果柱状图/ }).scrollIntoViewIfNeeded()
  await expect(drawer.locator('canvas')).toBeVisible()
  await expect(drawer.getByRole('img', { name: /SQL 结果柱状图/ })).toBeVisible()
  expect(executions).toBe(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )

  await drawer.getByRole('button', { name: '返回结果表', exact: true }).click()
  resultRows = Array.from({ length: 200 }, (_, index) => ({
    region: `类别${String(index + 1).padStart(3, '0')}`,
    amount: `${index + 1}.25`,
    quantity: index + 1
  }))
  await page.getByRole('button', { name: '执行 SQL', exact: true }).click()
  await expect(table).toContainText('本次已加载 200 行')
  await table.getByRole('button', { name: '结果图表', exact: true }).click()
  await expect(drawer).toContainText('200 个数据点')
  const dataTab = drawer.getByRole('tab', { name: '图表数据', exact: true })
  const chartTab = drawer.getByRole('tab', { name: '图表', exact: true })
  await dataTab.click()
  await expectChartData(drawer, '类别001', '1.25', '1')
  await chartTab.click()
  await drawer.getByRole('img', { name: /SQL 结果柱状图/ }).scrollIntoViewIfNeeded()
  await expect(drawer.locator('canvas')).toBeVisible()
  await dataTab.click()
  await expectChartData(drawer, '类别001', '1.25', '1')
  const dataPane = drawer.getByRole('tabpanel', { name: '图表数据', exact: true })
  await dataPane.locator('.el-pagination .btn-next').click()
  await expectChartData(drawer, '类别021', '21.25', '1')
  await chartTab.click()
  await dataTab.click()
  await expectChartData(drawer, '类别021', '21.25', '1')
  await dataPane.locator('.el-pagination .btn-prev').click()
  await expectChartData(drawer, '类别001', '1.25', '1')
  await page.screenshot({ path: info.outputPath('sql-result-chart-200-data.png') })
  await drawer.getByRole('button', { name: '返回结果表', exact: true }).click()
  expect(executions).toBe(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
})

test('text-only results recommend counts and unsupported pie values offer recovery', async ({
  page
}, info) => {
  page.setDefaultNavigationTimeout(60_000)
  await prepareIsolatedSession(page)
  await prepareAppearance(page, { theme: info.project.name.includes('dark') ? 'dark' : 'light' })
  await page.route('**/functions/v1/execute-sql-with-columns', (route) => {
    const body = route.request().postDataJSON() as { action?: string }
    return route.fulfill({
      json:
        body.action === 'metadata'
          ? { schemas: [], tables: [], columns: [], functions: [], foreignKeys: [] }
          : {
              status: 'ok',
              rows: [{ region: '华东' }, { region: '华东' }, { region: '华北' }],
              columns: [{ name: 'region', type: 'text' }],
              commandTag: 'SELECT',
              rowCount: 3,
              durationMs: 1
            }
    })
  })
  await page.goto(
    '/tests/e2e/fixtures/sql-console-metadata.html?actor=chart-count-test&tenant=tenant-a'
  )
  await page.getByRole('button', { name: '执行 SQL', exact: true }).click()
  await page.getByRole('button', { name: '结果图表', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: '结果图表', exact: true })
  await expect(drawer).toContainText('相同类别统计原始行数')
  await expect(drawer).toContainText('2 个数据点')
  await drawer.getByText('逐行展示', { exact: true }).click()
  await expect(drawer).toContainText('请选择数值字段，或切换为行数统计')
  await expect(drawer.getByRole('button', { name: '下载图表 PNG', exact: true })).toBeDisabled()
  await page.screenshot({ path: info.outputPath('sql-result-chart-empty.png') })
  await drawer.getByText('行数统计', { exact: true }).click()
  await drawer.getByRole('img', { name: /SQL 结果柱状图/ }).scrollIntoViewIfNeeded()
  await expect(drawer.locator('canvas')).toBeVisible()
})
