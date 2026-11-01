import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)
const tables = [
  {
    tableSchema: 'public',
    tableName: 'orders',
    description: '订单档案',
    kind: 'table',
    columns: [],
    indexes: [],
    detailsLoaded: false,
    columnCount: 2
  },
  {
    tableSchema: 'public',
    tableName: 'customers',
    description: '客户档案',
    kind: 'table',
    columns: [],
    indexes: [],
    detailsLoaded: false,
    columnCount: 1
  }
]
const columns = [
  { name: 'id', dataType: 'integer', isNullable: false, isPrimaryKey: true },
  { name: 'customer_note', dataType: 'text', isNullable: true, description: '客户备注' }
]
const catalog = { schemas: ['public'], tables, columns: [], functions: [], foreignKeys: [] }
const details = {
  ...catalog,
  tables: [
    {
      ...tables[0],
      detailsLoaded: true,
      columns,
      indexes: [
        {
          name: 'orders_pkey',
          columns: ['id'],
          isPrimary: true,
          isUnique: true,
          definition: 'CREATE UNIQUE INDEX orders_pkey ON public.orders(id)'
        }
      ]
    }
  ],
  columns: columns.map((column, index) => ({
    tableSchema: 'public',
    tableName: 'orders',
    columnName: column.name,
    dataType: column.dataType,
    isNullable: column.isNullable ? 'YES' : 'NO',
    isPrimaryKey: column.isPrimaryKey,
    description: column.description,
    ordinalPosition: index + 1
  }))
}

async function prepare(page: Page, project: string) {
  page.setDefaultNavigationTimeout(60_000)
  page.setDefaultTimeout(15_000)
  await prepareIsolatedSession(page)
  await prepareAppearance(page, {
    theme: project.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !project.includes('shadow')
  })
  await page.goto(
    '/tests/e2e/fixtures/sql-console-metadata.html?actor=lazy-metadata&tenant=tenant-a'
  )
}
async function resourcePanel(page: Page) {
  const expand = page.getByRole('button', { name: '展开数据库资源', exact: true })
  if (await expand.isVisible()) await expand.click()
  return page.getByRole('complementary', { name: '数据库资源', exact: true })
}

test('catalog stays lightweight, table details load on expansion and function groups load independently', async ({
  page
}, info) => {
  const requests: { mode?: string; tables?: { schema: string; name: string }[] }[] = []
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/functions/v1/execute-sql-with-columns', async (route) => {
    const body = route.request().postDataJSON() as {
      action: string
      mode?: string
      tables?: { schema: string; name: string }[]
    }
    requests.push(body)
    if (body.mode === 'tables') {
      await gate
      return route.fulfill({ json: details })
    }
    if (body.mode === 'functions')
      return route.fulfill({
        json: {
          ...catalog,
          tables: [],
          functions: [
            { routineSchema: 'public', routineName: 'order_total', returnType: 'numeric' }
          ],
          functionsTruncated: true
        }
      })
    return route.fulfill({ json: catalog })
  })
  await prepare(page, info.project.name)
  const panel = await resourcePanel(page)
  await expect(panel.getByRole('button', { name: '定位对象 public', exact: true })).toBeVisible()
  expect(requests.map((request) => request.mode)).toEqual(['catalog'])
  await panel.getByRole('button', { name: '定位对象 public', exact: true }).click()
  await panel.getByRole('button', { name: '定位对象 表', exact: true }).click()
  await expect(panel.getByRole('button', { name: '定位对象 customers', exact: true })).toBeVisible()
  expect(requests.filter((request) => request.mode === 'tables')).toHaveLength(0)
  await panel.getByRole('button', { name: '定位对象 orders', exact: true }).click()
  await expect(panel.getByRole('status', { name: '正在加载 orders', exact: true })).toBeVisible()
  await expect(panel.getByRole('button', { name: '定位对象 customers', exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('table-detail-loading.png') })
  release()
  await panel.getByRole('button', { name: '定位对象 字段 · 2', exact: true }).click()
  await expect(
    panel.getByRole('button', { name: '插入 customer_note · text', exact: true })
  ).toBeVisible()
  await panel.getByRole('button', { name: '定位对象 orders', exact: true }).click()
  await panel.getByRole('button', { name: '定位对象 orders', exact: true }).click()
  expect(requests.filter((request) => request.mode === 'tables')).toHaveLength(1)
  await panel.getByRole('button', { name: '定位对象 函数', exact: true }).click()
  await expect(panel.getByRole('button', { name: '插入 order_total', exact: true })).toBeVisible()
  expect(requests.filter((request) => request.mode === 'functions')).toHaveLength(1)
  await expect(panel).toContainText('仅展示前 2000 个函数，请搜索名称缩小范围')
  await page.screenshot({ path: info.outputPath('lazy-metadata-tree.png') })
})

test('unloaded field comments are found by server search and a search-row action waits for complete table details', async ({
  page
}, info) => {
  const requests: string[] = []
  await page.route('**/functions/v1/execute-sql-with-columns', (route) => {
    const body = route.request().postDataJSON() as { mode?: string; keyword?: string }
    requests.push(body.mode || 'full')
    if (body.mode === 'search')
      return route.fulfill({
        json: {
          ...catalog,
          tables: [{ ...tables[0], matchedColumns: ['customer_note'] }],
          searchTruncated: false
        }
      })
    if (body.mode === 'tables') return route.fulfill({ json: details })
    return route.fulfill({ json: catalog })
  })
  await prepare(page, info.project.name)
  const panel = await resourcePanel(page)
  await panel.getByRole('textbox', { name: '搜索数据库资源', exact: true }).fill('客户备注')
  await expect(panel).toContainText('数据库目录搜索')
  await expect(panel).toContainText('customer_note')
  await panel.getByRole('button', { name: '更多操作 orders', exact: true }).click()
  await page.getByRole('menuitem', { name: '按主键查询', exact: true }).click()
  expect(requests).toContain('search')
  expect(requests.filter((mode) => mode === 'tables')).toHaveLength(1)
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('WHERE')
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('"id"')
  await page.screenshot({ path: info.outputPath('metadata-server-search.png') })
})

test('structure drawer loads one expanded table, exposes retry and searches unloaded columns remotely', async ({
  page
}, info) => {
  let failed = true
  const requested: string[] = []
  await page.route('**/functions/v1/execute-sql-with-columns', (route) => {
    const body = route.request().postDataJSON() as { mode?: string }
    requested.push(body.mode || 'full')
    if (body.mode === 'tables')
      return failed
        ? route.fulfill({ status: 503, json: { message: '临时失败' } })
        : route.fulfill({ json: details })
    if (body.mode === 'search')
      return route.fulfill({
        json: {
          ...catalog,
          tables: [{ ...tables[0], matchedColumns: ['customer_note'] }],
          searchTruncated: true
        }
      })
    return route.fulfill({ json: catalog })
  })
  await prepare(page, info.project.name)
  await page.getByRole('button', { name: '数据库结构', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: '数据库结构', exact: true })
  await drawer.getByText('orders', { exact: true }).click()
  await expect(drawer).toContainText('对象详情加载失败')
  failed = false
  await drawer.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(drawer.getByRole('button', { name: '生成主键筛选查询', exact: true })).toBeVisible()
  await expect(drawer).toContainText('customer_note')
  expect(requested.filter((mode) => mode === 'tables')).toHaveLength(2)
  await drawer.getByRole('textbox', { name: '搜索数据库结构', exact: true }).fill('客户备注')
  await expect(drawer).toContainText('数据库目录搜索')
  await expect(drawer).toContainText('结果已截断，请缩小关键词')
  await drawer.getByText('orders', { exact: true }).click()
  await expect(drawer).toContainText('customer_note')
  expect(requested.filter((mode) => mode === 'tables')).toHaveLength(2)
  await page.screenshot({ path: info.outputPath('metadata-drawer-loaded.png') })
})
