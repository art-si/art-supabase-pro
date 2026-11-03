import { expect, test } from '@playwright/test'
import { installFixtures, meta, tenantId } from './support/inventory-fixtures'
import { mockApplicationMenus } from './support/menu-rpc'
import { assertAppearance, prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })

for (const scenario of [
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
] as const) {
  test(`${scenario.title}按明细展示数量单位与排包来源`, async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    await installFixtures(page)
    await page.route('**/rest/v1/rpc/get_table_column_runtime', (route) =>
      route.fulfill({ json: { enabled: false, profiles: [] } })
    )
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const appearance = {
      theme: testInfo.project.use.colorScheme === 'dark' ? 'dark' : 'light',
      boxBorderMode: !testInfo.project.name.includes('shadow')
    } as const
    await prepareAppearance(page, appearance)
    const path = `/wms/production-inout/${scenario.path}`
    const menuId = `line-fields-${scenario.kind}`
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
    const firstLine = {
      document_id: 'line-fields-document',
      line_id: 'line-fields-line',
      document_no: 'FI-LINE-001',
      tenant_id: tenantId,
      kind: scenario.kind,
      status: 'approved',
      material_status: 'partial',
      line_no: 1,
      business_date: '2026-11-02',
      work_order_no: 'WO-LINE-001',
      work_order_quantity: 10,
      work_order_unit_name: '件',
      material_code: 'MAT-001',
      material_name: '保温板',
      material_description: '保温板',
      construction_no: 'C-102',
      keeper_name: '王仓管',
      actual_quantity: 10,
      requested_quantity: 10,
      fulfilled_quantity: 6,
      base_quantity: 10,
      base_unit_name: '件',
      auxiliary_quantity: 2.5,
      auxiliary_unit_name: '平方米',
      auxiliary_quantity_2: 1,
      auxiliary_unit_2_name: '包',
      inbound_quantity: 6,
      pending_inbound_quantity: 4,
      pack_no: 'PACK-001',
      pack_area: '北区',
      pack_details: [
        { boardId: 'board-1', area: '北区', boardNo: 'A-1', lengthMm: 7600, pieces: 10 },
        { boardId: 'board-2', area: '北区', boardNo: 'A-2', lengthMm: 7400, pieces: 6 }
      ]
    }
    await page.route('**/rest/v1/wms_production_material_list?*', (route) =>
      route.fulfill({
        json: [
          firstLine,
          {
            ...firstLine,
            line_id: 'line-fields-line-2',
            line_no: 2,
            keeper_name: '李仓管',
            pack_no: null,
            pack_area: null,
            pack_details: []
          }
        ],
        headers: {
          'content-range': '0-1/2',
          'access-control-expose-headers': 'content-range'
        }
      })
    )

    await page.goto(`#${path}`)
    await assertAppearance(page, appearance)
    await expect(page.getByText('FI-LINE-001', { exact: true })).toBeVisible({ timeout: 60_000 })
    await expect(page.getByRole('columnheader', { name: '基本数量' })).toHaveCount(0)
    await page.locator('.el-radio-button').filter({ hasText: '按明细' }).click()
    const headers = (await page.locator('.el-table__header-wrapper th').allTextContents()).map(
      (text) => text.trim()
    )
    for (const title of [
      '施工号',
      '仓管员',
      '基本数量',
      '基本单位',
      '辅助数量',
      '辅助单位',
      '辅助数量2',
      '辅助单位2',
      '已入库数量',
      '未入库数量',
      '包号',
      '区域',
      '编号',
      '长度 mm',
      '块数'
    ]) {
      expect(headers).toContain(title)
    }
    const row = page.locator('.el-table__body tr').filter({ hasText: 'FI-LINE-001' }).first()
    await expect(page.locator('.el-table__body tr')).toHaveCount(2)
    await expect(page.locator('.el-table__body tr').nth(1)).toContainText('李仓管')
    await expect(row).toContainText('C-102')
    await expect(row).toContainText('王仓管')
    await expect(row).toContainText('2.5')
    await expect(row).toContainText('6 件')
    await expect(row).toContainText('4 件')
    await expect(row).toContainText('PACK-001')
    await expect(row).toContainText('7600')
    await expect(row).toContainText('7400')
    const pendingCell = row.locator('td').nth(headers.indexOf('未入库数量'))
    await pendingCell.scrollIntoViewIfNeeded()
    await expect(pendingCell).toBeInViewport()
    await page.screenshot({ path: testInfo.outputPath(`${scenario.kind}-quantities.png`) })
    const lengthCell = row.locator('td').nth(headers.indexOf('长度 mm'))
    await lengthCell.scrollIntoViewIfNeeded()
    await expect(lengthCell).toBeInViewport()
    await page.screenshot({ path: testInfo.outputPath(`${scenario.kind}-packing.png`) })
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(
      false
    )
    expect(errors).toEqual([])
  })
}
