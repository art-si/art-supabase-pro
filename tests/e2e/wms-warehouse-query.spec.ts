import { expect, test, type Page } from '@playwright/test'
import { installFixtures, meta, tenantId } from './support/inventory-fixtures'
import { mockApplicationMenus } from './support/menu-rpc'
import { expectWarehouseCodeVisible } from './support/warehouse-option'

const targets = [
  {
    name: 'WmsAssembly',
    title: '库存组装',
    path: '/wms/adjustment-business/assembly',
    table: 'wms_assembly_document',
    filterKey: 'warehouse_id',
    filterValue: 'eq.warehouse-b'
  },
  {
    name: 'WmsCount',
    title: '库存盘点',
    path: '/wms/count-business/count',
    table: 'wms_count_plan',
    filterKey: 'or',
    filterValue: '(warehouse_id.eq.warehouse-b,warehouse_ids.cs.{warehouse-b},warehouse_ids.eq.{})'
  }
]

async function mockWarehousePage(page: Page, target: (typeof targets)[number]) {
  await page.route('**/rpc/get_accessible_applications', (route) =>
    route.fulfill({ json: [{ code: 'wms', name: '仓储', baseUrl: '/wms/' }] })
  )
  const menu = {
    id: target.name,
    parentId: null,
    name: target.name,
    path: target.path,
    component: target.path,
    type: 'menu',
    sort: 1,
    meta: meta(target.title)
  }
  await mockApplicationMenus(page, {
    wms: [
      menu,
      {
        ...menu,
        id: `${menu.id}-view`,
        parentId: menu.id,
        name: `${menu.name}:View`,
        path: '',
        component: '',
        type: 'button',
        meta: meta('查看')
      }
    ]
  })
}

for (const target of targets) {
  test(`${target.title}窄屏可按编码区分同名仓库并按选中 ID 查询`, async ({ page }, info) => {
    test.setTimeout(90_000)
    await installFixtures(page)
    await mockWarehousePage(page, target)
    await page.setViewportSize({ width: 390, height: 844 })
    const name = '华东地区精密零部件生产配套及成品包装配送综合周转仓储服务中心'
    const warehouses = [
      { id: 'warehouse-a', name, code: 'WARE-A01' },
      { id: 'warehouse-b', name, code: 'WARE-B02' },
      { id: 'warehouse-without-code', name: '无编码仓库', code: '' }
    ]
    await page.route('**/rest/v1/mdm_warehouse?*', (route) =>
      route.fulfill({
        json: warehouses.map((warehouse) => ({
          id: warehouse.id,
          tenant_id: tenantId,
          organization_id: 'org-test',
          warehouse_code: warehouse.code,
          warehouse_name: warehouse.name,
          status: 'enabled'
        }))
      })
    )
    const requests: Array<string | null> = []
    await page.route(`**/rest/v1/${target.table}?*`, (route) => {
      requests.push(new URL(route.request().url()).searchParams.get(target.filterKey))
      return route.fulfill({ json: [], headers: { 'content-range': '*/0' } })
    })
    await page.goto(`#${target.path}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: target.title, exact: true })).toBeVisible({
      timeout: 60_000
    })
    const search = page.locator('.art-search-bar')
    const expand = search.getByRole('button', { name: '展开', exact: true })
    if (await expand.isVisible()) await expand.click()
    const field = search.locator('[data-art-form-item-key="warehouseId"]')
    await field.getByRole('combobox').click()
    const popup = page.locator('.el-select__popper.art-form-picker-popper:visible')
    for (const code of ['WARE-A01', 'WARE-B02']) {
      const option = popup.getByRole('option', { name: new RegExp(code) })
      await expectWarehouseCodeVisible(option, code)
      await expect(option).toHaveAttribute('title', `${code} · ${name}`)
    }
    await expect(popup.getByRole('option', { name: '无编码仓库', exact: true })).toBeVisible()
    const popupBounds = (await popup.boundingBox())!
    expect(popupBounds.x).toBeGreaterThanOrEqual(0)
    expect(popupBounds.x + popupBounds.width).toBeLessThanOrEqual(391)
    await page.screenshot({
      path: info.outputPath('warehouse-options-390.png'),
      animations: 'disabled'
    })
    const selectedLabel = `WARE-B02 · ${name}`
    await popup.getByRole('option', { name: selectedLabel, exact: true }).click()
    await expect(field.getByText(selectedLabel, { exact: true })).toHaveAttribute(
      'title',
      selectedLabel
    )
    await search.getByRole('button', { name: '查询', exact: true }).click()
    await expect.poll(() => requests.at(-1)).toBe(target.filterValue)
  })
}
