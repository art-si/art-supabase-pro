import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import type { TableColumnCatalog } from '../../src/types/table-column-config'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(180_000)

const tenantId = '11111111-1111-4111-8111-111111111111'
const catalogs = JSON.parse(
  readFileSync('src/config/table-column-catalog.generated.json', 'utf8')
) as TableColumnCatalog[]
const unknownId = '11111111-1111-4111-8111-111111111103'
const vehicles = [
  {
    id: '11111111-1111-4111-8111-111111111101',
    plateNo: '测A·已知',
    vehicleType: 'heavy_truck',
    vehicleOwnership: 'self_operated'
  },
  {
    id: '11111111-1111-4111-8111-111111111102',
    plateNo: '测A·历史',
    vehicleType: '半挂车',
    vehicleOwnership: 'third_party'
  },
  {
    id: unknownId,
    plateNo: '测A·未知',
    vehicleType: 'legacy_半挂车',
    vehicleOwnership: 'legacy_owner_unknown'
  }
].map((row) => ({
  ...row,
  tenantId,
  companyName: '测试物流公司',
  operationStatus: 'operating',
  auditStatus: 'draft',
  fieldAccess: { documents: 'read', vehicleIdentifiers: 'read' }
}))

test('车辆档案与查询保留中文历史车型，未知字典不露 code 且树筛选保留原始 ID', async ({
  page
}, testInfo) => {
  const selectedIds: Array<string[] | null> = []
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url())
    const endpoint = url.pathname.split('/').at(-1)
    if (endpoint === 'get_table_column_runtime') {
      const requestedPath = route.request().postDataJSON().p_route_path
      const catalog = catalogs.find((item) => item.routePath === requestedPath)
      if (!catalog) return route.fulfill({ json: { enabled: false, profiles: [] } })
      return route.fulfill({
        json: {
          enabled: true,
          catalog,
          profiles: [
            {
              id: 'vehicle-type-filter-profile',
              menuId: catalog.menuId,
              scope: 'platform',
              tenantId: null,
              subjectId: null,
              source: 'configured',
              columns: catalog.columns.map((column) => ({
                ...column,
                ...(column.key === 'vehicleType' ? { filterType: 'select' } : {})
              })),
              priority: 0,
              revision: 1,
              updatedAt: ''
            }
          ]
        }
      })
    }
    if (endpoint === 'vms_list_vehicle_archives_secure') {
      const ids = (route.request().postDataJSON() as { p_ids?: string[] | null }).p_ids ?? null
      selectedIds.push(ids)
      const records = ids ? vehicles.filter((row) => ids.includes(row.id)) : vehicles
      return route.fulfill({ json: { records, total: records.length, fieldAccess: {} } })
    }
    if (endpoint === 'vms_list_vehicle_archive_navigation_secure')
      return route.fulfill({
        json: vehicles.map(({ id, vehicleType, vehicleOwnership }) => ({
          id,
          vehicleType,
          vehicleOwnership
        }))
      })
    if (endpoint === 'sys_dictionary') {
      const requestedType = url.searchParams.get('dict_type_table.code')?.replace(/^eq\./, '')
      const requestedValue = url.searchParams.get('value')?.replace(/^eq\./, '')
      const labels = [
        { type: 'vehicleType', value: 'heavy_truck', label: '重型货车' },
        { type: 'vehicleOwnership', value: 'self_operated', label: '自营车辆' },
        { type: 'vehicleOwnership', value: 'third_party', label: '第三方物流' }
      ]
      const rows = labels
        .filter(
          (item) =>
            (!requestedType || item.type === requestedType) &&
            (!requestedValue || item.value === requestedValue)
        )
        .map((item, index) => ({
          id: `dict-${index}`,
          code: item.value,
          value: item.value,
          label: item.label,
          sort: index,
          status: '1',
          dict_type_table: { code: item.type, name: item.type }
        }))
      return route.fulfill({ json: rows })
    }
    return route.fulfill({ json: [] })
  })

  for (const pageName of ['archive', 'query'] as const) {
    const route = pageName === 'archive' ? '?page=archive' : ''
    await page.goto(`/tests/e2e/fixtures/vehicle-query-visual.html${route}`, {
      waitUntil: 'domcontentloaded'
    })
    const workspace = page.locator(
      pageName === 'archive' ? '.vehicle-archive-manage' : '.vehicle-query-page'
    )
    const navigation = workspace.locator(
      pageName === 'archive'
        ? '.vehicle-archive-manage__navigation'
        : '.vehicle-query-page__navigation'
    )
    await expect(workspace).toBeVisible({ timeout: 60_000 })
    await expect(workspace.getByText('测A·未知', { exact: true })).toBeVisible()
    const table = workspace.locator('.el-table__body-wrapper').first()
    await expect(table.getByRole('row').filter({ hasText: '测A·已知' })).toContainText('重型货车')
    await expect(table.getByRole('row').filter({ hasText: '测A·历史' })).toContainText('半挂车')
    await expect(table.getByRole('row').filter({ hasText: '测A·未知' })).toContainText('未识别')
    await expect(navigation).toContainText('重型货车')
    await expect(navigation).toContainText('半挂车')
    await expect(navigation).toContainText(/未识别|待核对/)
    await expect(workspace).not.toContainText('legacy_半挂车')
    await expect(workspace).not.toContainText('legacy_owner_unknown')
    await expect(workspace).toContainText('自营车辆')
    await page.screenshot({
      path: testInfo.outputPath(`vehicle-type-${pageName}.png`),
      fullPage: true
    })
    await workspace.getByRole('button', { name: '车型过滤', exact: true }).click()
    await page.locator('.el-checkbox').filter({ hasText: '重型货车' }).click()
    await expect(page.getByRole('checkbox', { name: '重型货车', exact: true })).toBeChecked()
    await page.getByRole('button', { name: '应用过滤', exact: true }).click()
    await expect(table.getByRole('row').filter({ hasText: '测A·已知' })).toBeVisible()
    await expect(table.getByRole('row').filter({ hasText: '测A·历史' })).toHaveCount(0)
    await workspace.getByRole('button', { name: '车型过滤', exact: true }).click()
    await page.getByRole('button', { name: '清空', exact: true }).click()
    await expect(table.getByRole('row').filter({ hasText: '测A·历史' })).toBeVisible()
    await navigation
      .locator('.el-tree-node__content')
      .filter({ hasText: /未识别|待核对/ })
      .last()
      .click()
    await expect.poll(() => selectedIds.at(-1)).toEqual([unknownId])
    await expect(workspace.getByText('测A·未知', { exact: true })).toBeVisible()
    await expect(workspace.getByText('测A·已知', { exact: true })).toHaveCount(0)
    for (const exit of ['control', 'escape']) {
      await workspace
        .locator('.business-table-workspace-actions__toggle')
        .filter({ hasText: '专注模式' })
        .locator('.el-switch')
        .click()
      await expect(workspace.locator('.business-workspace-header')).toBeHidden()
      await expect(workspace.locator('.art-search-bar')).toBeVisible()
      await expect(workspace.locator('.el-pagination')).toBeVisible()
      await expect(workspace.getByText('测A·未知', { exact: true })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      )
      if (exit === 'control')
        await page.getByRole('button', { name: '退出专注模式', exact: true }).click()
      else await page.keyboard.press('Escape')
      await expect(workspace.locator('.business-workspace-header')).toBeVisible()
    }
  }
})
