import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { installFixtures, meta, tenantId } from './support/inventory-fixtures'
import { mockApplicationMenus } from './support/menu-rpc'
import type { WmsProjectSummary } from '../../modules/art-supabase-wms/src/api/warehouse.types'

async function verifyLastReportColumn(page: Page, testInfo: TestInfo, tab: string): Promise<void> {
  const cell = page.locator('.el-table__body tr').first().locator('td').last()
  await cell.scrollIntoViewIfNeeded()
  await expect(cell).toBeInViewport()
  const geometry = await cell.evaluate((element) => {
    const viewport = element.closest('.el-table')!.getBoundingClientRect()
    const rect = element.getBoundingClientRect()
    return { left: rect.left - viewport.left, right: viewport.right - rect.right }
  })
  expect(geometry.left).toBeGreaterThanOrEqual(-1)
  expect(geometry.right).toBeGreaterThanOrEqual(-1)
  await page.screenshot({
    path: testInfo.outputPath(`project-last-column-${tab}.png`),
    animations: 'disabled'
  })
}

for (const kind of ['inventory', 'project']) {
  test(`${kind}流水显示中文业务类型`, async ({ page }, testInfo) => {
    test.setTimeout(90_000)
    await installFixtures(page)
    await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
      route.fulfill({
        json: [
          { code: 'platform', name: '测试平台', baseUrl: '/' },
          { code: 'wms', name: 'WMS仓储管理', baseUrl: '/wms/' }
        ]
      })
    )
    const path =
      kind === 'inventory' ? 'inventory-trace/inventory-ledger' : 'project-warehouse/project-report'
    const name = kind === 'inventory' ? 'WmsInventoryLedger' : 'WmsProjectReport'
    const root = {
      id: 'wms-root',
      parentId: null,
      name: 'WmsWarehouseManagement',
      path: '/wms',
      component: '/index/index',
      type: 'folder',
      sort: 1,
      meta: meta('WMS仓储管理')
    }
    const menu = {
      id: 'movement-menu',
      parentId: root.id,
      name,
      path,
      component: `/wms/${path}`,
      type: 'menu',
      sort: 1,
      meta: meta('测试流水页面')
    }
    await mockApplicationMenus(page, {
      wms: [
        root,
        menu,
        {
          id: 'movement-view',
          parentId: menu.id,
          name: `${name}:View`,
          path: '',
          component: '',
          type: 'button',
          sort: 1,
          meta: meta('查看')
        }
      ]
    })
    const row = {
      id: 'movement-test',
      batch_id: 'batch-test',
      material_code: 'TEST-MAT',
      material_name: '测试物料',
      warehouse_id: 'warehouse-test',
      warehouse_name: '测试仓库',
      inventory_quantity: 1,
      opening_quantity: 0,
      inbound_quantity: 1,
      outbound_quantity: 0,
      closing_quantity: 1,
      document_type: 'purchase_in',
      document_no: 'TEST-PURCHASE-001',
      movement_type: 'purchase_in',
      reference_no: 'TEST-PURCHASE-001',
      material: { material_code: 'TEST-MAT', material_name: '测试物料' },
      quantity: 1,
      occurred_at: '2026-10-05T01:02:03Z'
    }
    await page.route('**/rest/v1/rpc/wms_inventory_report_secure', (route) =>
      route.fulfill({ json: { data: [row], total: 1, navigation: [] } })
    )
    await page.route('**/rest/v1/rpc/wms_project_movement_page_secure', (route) =>
      route.fulfill({ json: { data: [row], total: 1 } })
    )
    await page.route('**/rest/v1/mdm_project?*', (route) =>
      route.fulfill({
        json: [
          {
            id: 'project-test',
            tenant_id: tenantId,
            project_code: 'TEST-PROJECT',
            project_name: '测试项目',
            enabled: true
          }
        ]
      })
    )
    const summary: WmsProjectSummary = {
      stockQuantity: 1,
      finishedStockQuantity: 0,
      finishedStockMaterialCount: 0,
      boardAreaSqm: 0,
      packCount: 0,
      materialCount: 1,
      reservedQuantity: 0,
      reservedMaterialCount: 0,
      workOrderCount: 0,
      wipQuantity: 0,
      issuedQuantity: 0,
      issuedMaterialCount: 0,
      shippedQuantity: 0,
      shippedMaterialCount: 0,
      returnedQuantity: 0,
      netShippedQuantity: 0,
      serialCount: 0,
      movementCount: 1
    }
    await page.route('**/rest/v1/rpc/wms_project_summary_secure', (route) =>
      route.fulfill({ json: summary })
    )
    await page.route('**/rest/v1/mdm_project_construction?*', (route) =>
      route.fulfill({
        json: [
          {
            id: 'section-review',
            tenant_id: tenantId,
            project_id: 'project-test',
            construction_no: 'REVIEW-01',
            section_name: '复盘分区',
            status: 'active'
          }
        ]
      })
    )
    await page.goto(`#/wms/${path}`)
    if (kind === 'project') {
      await page.getByRole('combobox', { name: /^项目名称/ }).click()
      await page.getByRole('option', { name: '测试项目 · TEST-PROJECT', exact: true }).click()
      await page.getByRole('tab', { name: '收发存记录', exact: true }).click()
    }
    const label = page.locator('.el-table__body').getByText('采购入库', { exact: true })
    await expect(label).toBeVisible()
    await label.scrollIntoViewIfNeeded()
    if (kind === 'project') {
      const time = page.locator('.el-table__body').getByText('2026-10-05 09:02:03', { exact: true })
      await time.scrollIntoViewIfNeeded()
      await expect(time).toBeVisible()
    }
    await page.screenshot({
      path: testInfo.outputPath('movement-type-label.png'),
      animations: 'disabled'
    })
    if (kind === 'project') {
      const requests: Array<{ tab: string; offset: number; section: string | null }> = []
      const populated = [
        {
          tab: '库存与垛包',
          endpoint: '**/rest/v1/wms_inventory_batch?*',
          marker: '复盘库存物料',
          row: {
            id: 'review-stock',
            tenant_id: tenantId,
            project_id: 'project-test',
            material_id: 'review-material',
            batch_no: 'REVIEW-BATCH',
            quantity: 12,
            construction_no: 'REVIEW-01',
            area_sqm: 6,
            length_mm: 1200,
            width_mm: 600,
            thickness_mm: 50,
            material: { material_code: 'REVIEW-MAT', material_name: '复盘库存物料' },
            pack: { pack_no: 'REVIEW-PACK' }
          }
        },
        {
          tab: '物料占用',
          endpoint: '**/rpc/wms_project_material_page_secure',
          marker: '复盘占用物料',
          row: {
            id: 'review-material',
            material_id: 'review-material',
            material_code: 'REVIEW-MAT',
            material_name: '复盘占用物料',
            base_unit_name: 'kg',
            quantity_unit_name: '块',
            stock_quantity: 12,
            reserved_quantity: 2,
            issued_quantity: 4,
            wip_quantity: 3,
            shipped_quantity: 5,
            returned_quantity: 1,
            net_shipped_quantity: 4,
            stock_area_sqm: 6,
            serial_count: 12
          }
        },
        {
          tab: '垛包履历',
          endpoint: '**/rpc/wms_project_pack_page_secure',
          marker: 'REVIEW-PACK',
          row: {
            id: 'review-pack',
            pack_no: 'REVIEW-PACK',
            work_order_no: 'REVIEW-ORDER',
            material_name: '复盘垛包产品',
            construction_no: 'REVIEW-01',
            origin_project_id: 'project-test',
            origin_construction_no: 'REVIEW-01',
            confirmed: true,
            planned_quantity: 10,
            planned_area_sqm: 5,
            received_quantity: 10,
            transferred_in_quantity: 0,
            transferred_out_quantity: 0,
            stock_quantity: 6,
            shipped_quantity: 5,
            returned_quantity: 1,
            net_shipped_quantity: 4,
            shipped_area_sqm: 2.5,
            returned_area_sqm: 0.5,
            net_shipped_area_sqm: 2,
            spec_count: 1,
            length_mm: 1200,
            width_mm: 600,
            thickness_mm: 50
          }
        }
      ]
      for (const entry of populated) {
        await page.route(entry.endpoint, (route) => {
          const rpc = entry.endpoint.includes('/rpc/')
          const url = new URL(route.request().url())
          const payload = rpc ? route.request().postDataJSON() : null
          const offset = rpc ? payload.p_offset : Number(url.searchParams.get('offset') || 0)
          requests.push({
            tab: entry.tab,
            offset,
            section: rpc ? payload.p_construction_no : url.searchParams.get('construction_no')
          })
          return route.fulfill({
            json: rpc
              ? { data: [entry.row], total: 21 }
              : [
                  entry.row,
                  {
                    ...entry.row,
                    id: 'review-stock-missing',
                    batch_no: 'REVIEW-MISSING',
                    material_id: '88888888-8888-4888-8888-888888888888',
                    material: null
                  },
                  {
                    ...entry.row,
                    id: 'review-stock-code',
                    batch_no: 'REVIEW-CODE',
                    material_id: '99999999-9999-4999-8999-999999999999',
                    material: { material_code: 'STOCK-CODE-ONLY', material_name: '' }
                  }
                ],
            headers: {
              'content-range': `${offset}-${offset}/21`,
              'access-control-expose-headers': 'content-range'
            }
          })
        })
        await page.getByRole('tab', { name: entry.tab, exact: true }).click()
        const marker = page.locator('.el-table__body').getByText(entry.marker, { exact: true })
        await marker.scrollIntoViewIfNeeded()
        await expect(marker).toBeVisible()
        const next = page.locator('.el-pagination .btn-next')
        await expect(next).toBeEnabled()
        await next.click()
        await expect
          .poll(() => requests.filter((request) => request.tab === entry.tab).at(-1)?.offset)
          .toBeGreaterThan(0)
        if (entry.tab === '库存与垛包') {
          const stockBody = page.locator('.el-table__body')
          await expect(stockBody.getByText('物料资料不可用', { exact: true })).toBeVisible()
          await expect(
            stockBody.getByText('STOCK-CODE-ONLY', { exact: true }).first()
          ).toBeVisible()
          await expect(stockBody).not.toContainText('88888888-8888-4888-8888-888888888888')
          await expect(stockBody).not.toContainText('99999999-9999-4999-8999-999999999999')
          await stockBody.getByText('物料资料不可用', { exact: true }).scrollIntoViewIfNeeded()
          await page.screenshot({
            path: testInfo.outputPath('project-stock-material-fallback.png'),
            animations: 'disabled'
          })
          await page.getByRole('combobox', { name: /^施工号/ }).click()
          await page.getByRole('option', { name: 'REVIEW-01 · 复盘分区', exact: true }).click()
          await expect
            .poll(() => requests.filter((request) => request.tab === entry.tab).at(-1))
            .toMatchObject({ offset: 0, section: 'eq.REVIEW-01' })
        } else {
          expect(requests.filter((request) => request.tab === entry.tab).at(-1)?.section).toBe(
            'REVIEW-01'
          )
        }
        await expect(page.locator('.el-table .el-loading-mask')).toBeHidden()
        await marker.scrollIntoViewIfNeeded()
        await expect(marker).toBeInViewport()
        await page.screenshot({
          path: testInfo.outputPath(`project-populated-${entry.tab}.png`),
          animations: 'disabled'
        })
        await verifyLastReportColumn(page, testInfo, entry.tab)
      }
      let orderOffset = 0
      let serialOffset = 0
      let movementOffset = 0
      await page.route('**/rest/v1/mes_work_order?*', (route) => {
        const url = new URL(route.request().url())
        orderOffset = Number(url.searchParams.get('offset') || 0)
        expect(url.searchParams.get('construction_no')).toBe('eq.REVIEW-01')
        return route.fulfill({
          json: [
            {
              id: 'order-test',
              work_order_no: 'WO-STATUS-001',
              order_status: 'released',
              material_name_snapshot: '复盘工单产品',
              specification_snapshot: '1200×600×50',
              construction_no: 'REVIEW-01',
              order_quantity: 20,
              completed_quantity: 12,
              warehoused_quantity: 10,
              planned_end_date: '2026-10-10'
            }
          ],
          headers: {
            'content-range': `${orderOffset}-${orderOffset}/21`,
            'access-control-expose-headers': 'content-range'
          }
        })
      })
      await page.route('**/rpc/wms_project_serial_page_secure', (route) => {
        const payload = route.request().postDataJSON()
        serialOffset = payload.p_offset
        expect(payload.p_construction_no).toBe('REVIEW-01')
        return route.fulfill({
          json: {
            data: [
              {
                id: 'serial-test',
                serial_no: 'SN-STATUS-001',
                parent_serial_id: 'parent-unavailable',
                status: 'in_stock',
                construction_no: 'REVIEW-01',
                create_time: '2026-10-05T01:02:03Z',
                material: { material_code: 'REVIEW-MAT', material_name: '复盘序列号物料' },
                child_serial_nos: []
              },
              {
                id: 'serial-independent',
                material_id: '44444444-4444-4444-8444-444444444444',
                serial_no: 'SN-INDEPENDENT',
                status: 'in_stock',
                parent_serial_id: null,
                child_serial_nos: []
              },
              {
                id: 'serial-parent-readable',
                material_id: '55555555-5555-4555-8555-555555555555',
                material: { material_code: 'CODE-ONLY-MATERIAL', material_name: '' },
                serial_no: 'SN-PARENT-READABLE',
                status: 'in_stock',
                parent_serial_id: 'parent-readable',
                parent: { serial_no: 'SN-READABLE-PARENT' },
                child_serial_nos: []
              }
            ],
            total: 21
          }
        })
      })
      for (const [tab, status] of [
        ['生产工单', '已下达'],
        ['序列号', '在库']
      ]) {
        await page.getByRole('tab', { name: tab, exact: true }).click()
        const cell = page.locator('.el-table__body').getByText(status, { exact: true }).first()
        await cell.scrollIntoViewIfNeeded()
        await expect(cell).toBeVisible()
        await page.locator('.el-pagination .btn-next').click()
        await expect
          .poll(() => (tab === '生产工单' ? orderOffset : serialOffset))
          .toBeGreaterThan(0)
        await expect(page.locator('.el-table .el-loading-mask')).toBeHidden()
        await cell.scrollIntoViewIfNeeded()
        await page.screenshot({
          path: testInfo.outputPath(`project-status-${tab}.png`),
          animations: 'disabled'
        })
        await verifyLastReportColumn(page, testInfo, tab)
        if (tab === '序列号') {
          for (const [serial, material] of [
            ['SN-INDEPENDENT', '物料资料不可用'],
            ['SN-PARENT-READABLE', 'CODE-ONLY-MATERIAL']
          ]) {
            const materialCell = page
              .locator('.el-table__body tr')
              .filter({
                has: page.getByText(serial, { exact: true })
              })
              .getByText(material, { exact: true })
            await materialCell.scrollIntoViewIfNeeded()
            await expect(materialCell).toBeVisible()
          }
          await expect(
            page.getByText('44444444-4444-4444-8444-444444444444', { exact: true })
          ).toHaveCount(0)
          if ((page.viewportSize()?.width ?? 0) >= 768) {
            await page
              .locator('.el-table .el-scrollbar__wrap')
              .first()
              .evaluate((element) => {
                element.scrollLeft = 0
              })
            await expect(
              page.locator('.el-table__body').getByText('CODE-ONLY-MATERIAL', { exact: true })
            ).toBeInViewport()
          }
          await page.screenshot({
            path: testInfo.outputPath('project-serial-material-fallback.png'),
            animations: 'disabled'
          })
          for (const [serial, parent] of [
            ['SN-STATUS-001', '父件资料不可用'],
            ['SN-INDEPENDENT', '独立件 / 主机'],
            ['SN-PARENT-READABLE', 'SN-READABLE-PARENT']
          ]) {
            const row = page.locator('.el-table__body tr').filter({
              has: page.getByText(serial, { exact: true })
            })
            const parentCell = row.getByText(parent, { exact: true })
            await parentCell.scrollIntoViewIfNeeded()
            await expect(parentCell).toBeVisible()
          }
          await page.screenshot({
            path: testInfo.outputPath('project-serial-parent-states.png'),
            animations: 'disabled'
          })
        }
      }
      await page.route('**/rpc/wms_project_movement_page_secure', (route) => {
        const payload = route.request().postDataJSON()
        movementOffset = payload.p_offset
        expect(payload.p_construction_no).toBe('REVIEW-01')
        return route.fulfill({
          json: {
            data: [
              row,
              {
                ...row,
                id: 'movement-missing-material',
                reference_no: 'MISSING-MATERIAL-MOVEMENT',
                movement_type: 'other_in',
                material_id: '66666666-6666-4666-8666-666666666666',
                material: null
              },
              {
                ...row,
                id: 'movement-code-only',
                reference_no: 'CODE-ONLY-MOVEMENT',
                movement_type: 'other_out',
                material: { material_code: 'MOVEMENT-MATERIAL-CODE', material_name: '' }
              }
            ],
            total: 21
          }
        })
      })
      await page.getByRole('tab', { name: '收发存记录', exact: true }).click()
      await expect(page.locator('.el-pagination .btn-next')).toBeEnabled()
      await page.locator('.el-pagination .btn-next').click()
      await expect.poll(() => movementOffset).toBeGreaterThan(0)
      await expect(page.locator('.el-table .el-loading-mask')).toBeHidden()
      await label.scrollIntoViewIfNeeded()
      await page.screenshot({
        path: testInfo.outputPath('project-populated-收发存记录.png'),
        animations: 'disabled'
      })
      await verifyLastReportColumn(page, testInfo, '收发存记录')
      for (const [reference, material] of [
        ['MISSING-MATERIAL-MOVEMENT', '物料资料不可用'],
        ['CODE-ONLY-MOVEMENT', 'MOVEMENT-MATERIAL-CODE']
      ]) {
        const materialCell = page
          .locator('.el-table__body tr')
          .filter({
            has: page.getByText(reference, { exact: true })
          })
          .getByText(material, { exact: true })
        await materialCell.scrollIntoViewIfNeeded()
        await expect(materialCell).toBeVisible()
      }
      await expect(
        page.getByText('66666666-6666-4666-8666-666666666666', { exact: true })
      ).toHaveCount(0)
      if ((page.viewportSize()?.width ?? 0) >= 768)
        await page
          .locator('.el-table .el-scrollbar__wrap')
          .first()
          .evaluate((element) => {
            element.scrollLeft = 0
          })
      await page.screenshot({
        path: testInfo.outputPath('project-movement-material-fallback.png'),
        animations: 'disabled'
      })
      for (const rpc of ['material', 'pack', 'movement', 'serial']) {
        await page.route(`**/rpc/wms_project_${rpc}_page_secure`, (route) =>
          route.fulfill({ json: { data: [], total: 0 } })
        )
      }
      for (const table of ['wms_inventory_batch', 'mes_work_order']) {
        await page.route(`**/rest/v1/${table}?*`, (route) =>
          route.fulfill({
            json: [],
            headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' }
          })
        )
      }
      const tabs = [
        ['库存与垛包', '该范围暂无库存'],
        ['物料占用', '该范围暂无物料占用或流转记录'],
        ['垛包履历', '该范围暂无排包记录'],
        ['生产工单', '该范围暂无工单'],
        ['序列号', '该范围暂无序列号'],
        ['收发存记录', '该范围暂无流水']
      ]
      for (const [tab, empty] of tabs) {
        await page.getByRole('tab', { name: tab, exact: true }).click()
        await expect(page.getByText(empty, { exact: true })).toBeVisible()
        await page.getByText(empty, { exact: true }).scrollIntoViewIfNeeded()
        await page.screenshot({
          path: testInfo.outputPath(`project-empty-${tab}.png`),
          animations: 'disabled'
        })
      }
      let release!: () => void
      for (const [tab, empty, endpoint] of [
        ['库存与垛包', '该范围暂无库存', '**/rest/v1/wms_inventory_batch?*'],
        ['物料占用', '该范围暂无物料占用或流转记录', '**/rpc/wms_project_material_page_secure'],
        ['垛包履历', '该范围暂无排包记录', '**/rpc/wms_project_pack_page_secure'],
        ['生产工单', '该范围暂无工单', '**/rest/v1/mes_work_order?*'],
        ['序列号', '该范围暂无序列号', '**/rpc/wms_project_serial_page_secure'],
        ['收发存记录', '该范围暂无流水', '**/rpc/wms_project_movement_page_secure']
      ]) {
        let failed = true
        await page.route(endpoint, (route) =>
          failed
            ? route.fulfill({ status: 503, json: { message: '测试明细暂时不可用' } })
            : route.fulfill({
                json: endpoint.includes('/rpc/') ? { data: [], total: 0 } : [],
                headers: {
                  'content-range': '*/0',
                  'access-control-expose-headers': 'content-range'
                }
              })
        )
        await page.getByRole('tab', { name: tab, exact: true }).click()
        const retry = page.getByRole('button', { name: '重新加载', exact: true })
        await expect(retry).toBeVisible()
        await retry.scrollIntoViewIfNeeded()
        await page.screenshot({
          path: testInfo.outputPath(`project-error-${tab}.png`),
          animations: 'disabled'
        })
        failed = false
        await retry.click()
        await expect(page.getByText(empty, { exact: true })).toBeVisible()
        await expect(retry).toHaveCount(0)
      }
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      await page.route('**/rest/v1/rpc/wms_project_summary_secure', async (route) => {
        await held
        await route.fulfill({ json: summary })
      })
      const request = page.waitForRequest('**/rpc/wms_project_summary_secure')
      const refresh = page.getByRole('button', { name: '刷新项目台账', exact: true })
      await refresh.click()
      await request
      await expect(refresh).toHaveClass(/is-loading/)
      const project = page.getByRole('combobox', { name: /^项目名称/ })
      const projectSelect = page.locator('.el-select').filter({ has: project })
      await projectSelect.hover()
      await projectSelect.locator('.el-select__clear').click()
      await expect(refresh).not.toHaveClass(/is-loading/)
      await expect(refresh).toBeDisabled()
      await expect(page.getByText('请选择项目', { exact: true })).toBeVisible()
      const response = page.waitForResponse('**/rpc/wms_project_summary_secure')
      release()
      await (await response).finished()
      await expect(page.getByText('请选择项目', { exact: true })).toBeVisible()
      await expect(page.getByRole('tab', { name: '收发存记录', exact: true })).toHaveCount(0)
      await page.screenshot({
        path: testInfo.outputPath('project-cleared-pending.png'),
        animations: 'disabled'
      })
    }
  })
}
