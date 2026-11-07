import { expect, test, type Page } from '@playwright/test'
import { installFixtures, meta, tenantId } from './support/inventory-fixtures'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })

const scenarios = [
  { kind: 'issue', path: 'production-issue', name: 'WmsProductionIssue', title: '生产领料单' },
  { kind: 'return', path: 'production-return', name: 'WmsProductionReturn', title: '生产退料单' },
  {
    kind: 'finished_inbound',
    path: 'finished-inbound',
    name: 'WmsFinishedInbound',
    title: '完工入库单'
  },
  {
    kind: 'finished_return',
    path: 'finished-return',
    name: 'WmsFinishedReturn',
    title: '完工退库单'
  }
] as const

type Scenario = (typeof scenarios)[number]

async function openProductionList(
  page: Page,
  scenario: Scenario,
  registerListRoute: () => Promise<void>
): Promise<void> {
  await installFixtures(page)
  const path = `/wms/production-inout/${scenario.path}`
  const menuId = `list-error-${scenario.kind}`
  await page.route('**/rpc/get_accessible_applications', (route) =>
    route.fulfill({
      json: [
        { code: 'platform', name: '平台', baseUrl: '/' },
        { code: 'wms', name: '仓储', baseUrl: '/wms/' }
      ]
    })
  )
  await mockApplicationMenus(page, {
    wms: [
      {
        id: menuId,
        parentId: null,
        name: scenario.name,
        path,
        component: path,
        type: 'menu',
        sort: 1,
        meta: meta(scenario.title)
      },
      {
        id: `${menuId}-view`,
        parentId: menuId,
        name: `${scenario.name}:View`,
        path: '',
        component: '',
        type: 'button',
        sort: 1,
        meta: meta('查看')
      }
    ]
  })
  await registerListRoute()
  await page.goto(`#${path}`)
}

function listRow(scenario: Scenario) {
  return {
    document_id: 'list-retry-document',
    line_id: 'list-retry-line',
    document_no: 'LIST-RETRY-001',
    tenant_id: tenantId,
    kind: scenario.kind,
    status: 'draft',
    material_status: 'pending',
    line_no: 1,
    business_date: '2026-11-07',
    material_code: 'MAT-LIST-001',
    material_description: '测试物料',
    requested_quantity: 1,
    actual_quantity: 1,
    fulfilled_quantity: 0
  }
}

for (const scenario of scenarios) {
  test(`${scenario.title}权限拒绝显示原因，重试后恢复列表`, async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    let reads = 0
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await openProductionList(page, scenario, () =>
      page.route('**/rest/v1/wms_production_material_list?*', (route) => {
        reads += 1
        if (reads === 1)
          return route.fulfill({
            status: 403,
            json: {
              code: '42501',
              message: 'permission denied for view wms_production_material_list',
              details: 'SELECT secret_column FROM private_table'
            }
          })
        return route.fulfill({
          json: [listRow(scenario)],
          headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
        })
      })
    )
    await expect(page.getByText('数据加载失败', { exact: true })).toBeVisible()
    await expect(page.getByText('当前账号没有此操作权限', { exact: true })).toBeVisible()
    await expect(page.getByText('permission denied for view')).toHaveCount(0)
    await expect(page.getByText('SELECT secret_column')).toHaveCount(0)
    if (scenario.kind === 'finished_inbound' && testInfo.project.name === 'desktop-1280')
      await page.screenshot({ path: '.artifacts/wms-list-repair/finished-inbound-1280.png' })
    await page.getByRole('button', { name: '重新加载' }).click()
    await expect(page.getByText('LIST-RETRY-001', { exact: true })).toBeVisible()
    await expect(page.getByText('数据加载失败', { exact: true })).toHaveCount(0)
    expect(reads).toBe(2)
    expect(pageErrors).toEqual([])
  })
}

test('完工入库单未知技术错误只显示友好提示', async ({ page }) => {
  const scenario = scenarios[2]
  await openProductionList(page, scenario, () =>
    page.route('**/rest/v1/wms_production_material_list?*', (route) =>
      route.fulfill({
        status: 500,
        json: {
          code: 'XX000',
          message: 'SQL failed: SELECT secret_column FROM private_table',
          details: 'stack trace: internal query context'
        }
      })
    )
  )
  await expect(page.getByText('数据加载失败', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '重新加载' })).toBeVisible()
  await expect(page.getByText('SQL failed')).toHaveCount(0)
  await expect(page.getByText('stack trace')).toHaveCount(0)
  await expect(page.locator('.art-table-query__error-state')).toContainText(
    '生产出入库单据加载失败，请重试'
  )
})

test('完工入库单查询超时提示可重试，恢复后显示数据', async ({ page }) => {
  const scenario = scenarios[2]
  let reads = 0
  await openProductionList(page, scenario, () =>
    page.route('**/rest/v1/wms_production_material_list?*', (route) => {
      reads += 1
      if (reads === 1)
        return route.fulfill({
          status: 500,
          json: {
            code: '57014',
            message: 'canceling statement due to statement timeout',
            details: 'SELECT secret_column FROM private_table'
          }
        })
      return route.fulfill({
        json: [listRow(scenario)],
        headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
      })
    })
  )
  await expect(page.getByText('数据加载失败', { exact: true })).toBeVisible()
  await expect(page.getByText('请求处理超时，请稍后重试', { exact: true })).toBeVisible()
  await expect(page.getByText('statement timeout')).toHaveCount(0)
  await expect(page.getByText('SELECT secret_column')).toHaveCount(0)
  await page.getByRole('button', { name: '重新加载' }).click()
  await expect(page.getByText('LIST-RETRY-001', { exact: true })).toBeVisible()
  await expect(page.getByText('数据加载失败', { exact: true })).toHaveCount(0)
  expect(reads).toBe(2)
})

test('完工入库单成功空列表显示空态', async ({ page }) => {
  const scenario = scenarios[2]
  await openProductionList(page, scenario, () =>
    page.route('**/rest/v1/wms_production_material_list?*', (route) =>
      route.fulfill({
        json: [],
        headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' }
      })
    )
  )
  await expect(page.getByText('当前范围暂无完工入库单')).toBeVisible()
  await expect(page.getByText('数据加载失败', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '重新加载' })).toHaveCount(0)
})
