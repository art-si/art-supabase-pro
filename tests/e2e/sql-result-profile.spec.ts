import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { prepareIsolatedSession } from './support/isolated-session'
import { prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

interface ResultFixture {
  rows: Record<string, unknown>[]
  columns: { name: string; type: string }[]
  truncated?: boolean
}

const rows = [
  { region: '华东', amount: '0.1', note: null },
  { region: '华东', amount: '0.2', note: '' },
  { region: '华北', amount: '9007199254740993.01', note: '   ' },
  { region: null, amount: null, note: '重复' },
  { region: '', amount: '', note: '重复' },
  { region: '   ', amount: '1.0000000000000000001', note: '单次' },
  { region: '华东', amount: 'invalid', note: '尾值' },
  { region: '华北', amount: '-0.01', note: null }
].map((row, index) => ({ ...row, outside: index === 0 ? '1e4096' : null }))
const columns = [
  { name: 'region', type: 'text' },
  { name: 'amount', type: 'numeric' },
  { name: 'note', type: 'text' },
  { name: 'outside', type: 'numeric' }
]
const exactSum = '9007199254740994.3000000000000000001'

async function prepare(
  page: Page,
  project: string,
  initialResult: ResultFixture = { rows, columns, truncated: true }
) {
  page.setDefaultTimeout(15_000)
  page.setDefaultNavigationTimeout(60_000)
  await prepareIsolatedSession(page)
  await prepareAppearance(page, {
    theme: project.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !project.includes('shadow')
  })
  const state: { result: ResultFixture; requests: number; executions: number } = {
    result: initialResult,
    requests: 0,
    executions: 0
  }
  await page.route('**/functions/v1/execute-sql-with-columns', (route) => {
    state.requests++
    const body = route.request().postDataJSON() as { action?: string; mode?: string }
    if (body.action === 'metadata')
      return route.fulfill({
        json: {
          metadataMode: body.mode,
          schemas: [],
          tables: [],
          columns: [],
          functions: [],
          foreignKeys: []
        }
      })
    state.executions++
    return route.fulfill({
      json: {
        status: 'ok',
        ...state.result,
        commandTag: 'SELECT',
        rowCount: state.result.rows.length,
        durationMs: 2
      }
    })
  })
  await page.goto(
    '/tests/e2e/fixtures/sql-console-metadata.html?actor=profile-test&tenant=tenant-a'
  )
  await page.getByRole('button', { name: '执行 SQL', exact: true }).click()
  await expect(page.locator('.result-table-container')).toContainText(
    `本次已加载 ${state.result.rows.length} 行`
  )
  return state
}

test('field profiles use all original rows, retain decimals and export without another query', async ({
  page
}, info) => {
  const state = await prepare(page, info.project.name)
  const table = page.locator('.result-table-container')
  const search = table.getByRole('textbox', { name: '搜索已加载结果', exact: true })
  await search.fill('华北')
  await expect(table.getByRole('status')).toContainText('匹配 2 行')
  const requests = state.requests
  await table.getByRole('button', { name: '字段统计', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: '字段统计', exact: true })
  await expect(drawer).toContainText('本次已加载 8 行')
  await expect(drawer).toContainText('不能代表数据库全量')
  await expect(drawer).toContainText(/已加载行数\s*8/)
  await expect(drawer).toContainText(/非 NULL 行数\s*7/)
  await expect(drawer).toContainText(/NULL \/ 缺失值\s*1/)
  await expect(drawer).toContainText(/空字符串\s*1/)
  await expect(drawer).toContainText(/纯空白字符串\s*1/)
  await expect(drawer).toContainText(/不同值\s*4/)
  await expect(drawer).toContainText(/重复额外行数\s*3/)
  const topRow = drawer.getByRole('row', { name: /"华东"/ })
  await expect(topRow.getByRole('cell', { name: '3', exact: true })).toBeVisible()
  await expect(topRow).toContainText('37.5%')

  const field = drawer.getByRole('combobox', { name: '统计字段', exact: true })
  await field.click()
  await page.getByRole('option', { name: 'outside', exact: true }).click()
  await expect(drawer).toContainText('1 行超出安全计算范围')
  await expect(drawer).toContainText(/有效数值\s*0/)
  await field.click()
  await page.getByRole('option', { name: 'amount', exact: true }).click()
  const exactTotal = drawer.getByText(exactSum, { exact: true })
  await expect(exactTotal).toBeAttached()
  await exactTotal.scrollIntoViewIfNeeded()
  await expect(exactTotal).toBeVisible()
  await expect(drawer).toContainText('9007199254740993.01')
  const download = page.waitForEvent('download')
  await drawer.getByRole('button', { name: '下载当前字段统计 JSON', exact: true }).click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/\.json$/)
  const path = await file.path()
  expect(path).toBeTruthy()
  const exported: unknown = JSON.parse(await readFile(path!, 'utf8'))
  expect(exported).toMatchObject({
    column: { name: 'amount' },
    totalRows: 8,
    numeric: {
      count: 5,
      invalidCount: 2,
      min: '-0.01',
      max: '9007199254740993.01',
      sum: exactSum
    }
  })
  expect(state.requests).toBe(requests)
  expect(state.executions).toBe(1)
  expect(await drawer.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true
  )
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
  await page.screenshot({ path: info.outputPath('sql-result-profile-precise.png') })
  await drawer.getByRole('button', { name: '返回结果表', exact: true }).click()
  await expect(drawer).toBeHidden()
  await expect(search).toHaveValue('华北')
  await table.getByRole('button', { name: '字段统计', exact: true }).click()
  await expect(drawer).toContainText(/非 NULL 行数\s*7/)
  await expect(drawer.getByText(exactSum, { exact: true })).toHaveCount(0)
  expect(state.requests).toBe(requests)
})

test('scope replacement discards an open profile and null-only results start cleanly', async ({
  page
}, info) => {
  const state = await prepare(page, info.project.name)
  await page.getByRole('button', { name: '字段统计', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: '字段统计', exact: true })
  await expect(drawer).toContainText(/非 NULL 行数\s*7/)
  const requests = state.requests
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('sql-preview-tenant-change', { detail: 'tenant-b' }))
  })
  await expect(drawer).toHaveCount(0)
  await expect(page.locator('.result-table-container')).toHaveCount(0)
  await expect.poll(() => state.requests).toBe(requests + 1)
  expect(state.executions).toBe(1)
  state.result = {
    rows: [{ replacement: null }, { replacement: null }],
    columns: [{ name: 'replacement', type: 'text' }],
    truncated: false
  }
  await page.getByRole('button', { name: '执行 SQL', exact: true }).click()
  await page.getByRole('button', { name: '字段统计', exact: true }).click()
  await expect(drawer).toContainText(/已加载行数\s*2/)
  await expect(drawer).toContainText(/非 NULL 行数\s*0/)
  await expect(drawer).toContainText(/NULL \/ 缺失值\s*2/)
  await expect(drawer).not.toContainText('9007199254740993.01')
  await expect(drawer).not.toContainText('不能代表数据库全量')
  await drawer.getByRole('combobox', { name: '统计字段', exact: true }).click()
  await expect(page.getByRole('option', { name: 'replacement', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await page.keyboard.press('Escape')
  expect(state.requests).toBe(requests + 2)
  expect(state.executions).toBe(2)
  await page.screenshot({ path: info.outputPath('sql-result-profile-null-only.png') })
})

test('identical long previews open the correct original value and clear on scope change', async ({
  page
}, info) => {
  test.skip(info.project.name !== 'desktop-1440', '长值来源定位使用单个桌面场景验证')
  const prefix = '订单'.repeat(90)
  const first = `${prefix}-尾值甲`
  const second = `${prefix}-尾值乙-额外`
  // Top order is A, B, while original row order is B, A, A.
  const state = await prepare(page, info.project.name, {
    rows: [{ payload: second }, { payload: first }, { payload: first }],
    columns: [{ name: 'payload', type: 'text' }]
  })
  const requests = state.requests
  await page.getByRole('button', { name: '字段统计', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: '字段统计', exact: true })
  await expect(drawer).toContainText(/已加载行数\s*3/)
  await expect(drawer).toContainText(/不同值\s*2/)
  await expect(drawer).toContainText(/重复额外行数\s*1/)
  await expect(
    drawer.getByText(`${JSON.stringify(prefix.slice(0, 160))}…`, { exact: true })
  ).toHaveCount(2)
  const viewButtons = drawer.getByRole('button', { name: '查看完整值', exact: true })
  await expect(viewButtons).toHaveCount(2)
  const details = page.getByRole('dialog', { name: '单元格详情', exact: true })
  for (const [index, value] of [first, second].entries()) {
    await viewButtons.nth(index).click()
    await expect(details.getByLabel('单元格内容代码', { exact: true })).toHaveText(value)
    await expect(details.getByText(`${value.length} 字符`, { exact: true })).toBeVisible()
    await details.getByRole('button', { name: '启用自动换行', exact: true }).click()
    await page.screenshot({ path: info.outputPath(`sql-result-profile-full-value-${index}.png`) })
    await details.getByRole('button', { name: '关闭', exact: true }).last().click()
    await expect(details).toBeHidden()
    await expect(drawer).toContainText(/已加载行数\s*3/)
    await expect(drawer).toContainText(/不同值\s*2/)
    await expect(viewButtons).toHaveCount(2)
  }
  expect(state.requests).toBe(requests)
  expect(state.executions).toBe(1)
  await viewButtons.nth(1).click()
  await expect(details.getByLabel('单元格内容代码', { exact: true })).toHaveText(second)
  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('sql-preview-tenant-change', {
        detail: '00000000-0000-4000-8000-000000000002'
      })
    )
  })
  await expect(details).toHaveCount(0)
  await expect(drawer).toHaveCount(0)
  await expect(page.locator('.result-table-container')).toHaveCount(0)
  await expect.poll(() => state.requests).toBe(requests + 1)
  expect(state.executions).toBe(1)
})
