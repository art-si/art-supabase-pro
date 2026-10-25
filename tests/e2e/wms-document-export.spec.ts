import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'
import { mockApplicationMenus } from './support/menu-rpc'
import { tenantId, meta, material, installFixtures } from './support/inventory-fixtures'

for (const scenario of [
  {
    path: 'count-business/count-gain',
    name: 'WmsCountGain',
    title: '盘盈单',
    table: 'wms_count_adjustment_list',
    kind: 'gain'
  },
  {
    path: 'count-business/count-loss',
    name: 'WmsCountLoss',
    title: '盘亏单',
    table: 'wms_count_adjustment_list',
    kind: 'loss'
  },
  {
    path: 'transfer-business/transfer-request',
    name: 'WmsTransfer',
    title: '调拨申请单',
    table: 'wms_transfer_request_list',
    kind: ''
  },
  {
    path: 'production-inout/production-issue',
    name: 'WmsProductionIssue',
    title: '生产领料单',
    table: 'wms_production_material_list',
    kind: 'issue'
  },
  {
    path: 'production-inout/production-return',
    name: 'WmsProductionReturn',
    title: '生产退料单',
    table: 'wms_production_material_list',
    kind: 'return'
  },
  {
    path: 'production-inout/finished-inbound',
    name: 'WmsFinishedInbound',
    title: '完工入库单',
    table: 'wms_production_material_list',
    kind: 'finished_inbound'
  },
  {
    path: 'production-inout/finished-return',
    name: 'WmsFinishedReturn',
    title: '完工退库单',
    table: 'wms_production_material_list',
    kind: 'finished_return'
  },
  {
    path: 'initialization/initial-sales-outbound',
    name: 'WmsInitialSalesOutbound',
    title: '期初销售出库单',
    table: 'wms_sales_document_list',
    kind: 'initial_outbound'
  },
  {
    path: 'initialization/initial-sales-return',
    name: 'WmsInitialSalesReturn',
    title: '期初销售退货单',
    table: 'wms_sales_document_list',
    kind: 'initial_return'
  },
  {
    path: 'initialization/initial-purchase-inbound',
    name: 'WmsInitialPurchaseInbound',
    title: '期初采购入库单',
    table: 'wms_purchase_document_list',
    kind: 'initial_inbound'
  },
  {
    path: 'initialization/initial-purchase-return',
    name: 'WmsInitialPurchaseReturn',
    title: '期初采购退料单',
    table: 'wms_purchase_document_list',
    kind: 'initial_return'
  },
  {
    path: 'outbound-business/outbound-request',
    name: 'WmsIssueRequest',
    title: '出库申请单',
    table: 'wms_issue_request_list',
    kind: ''
  },
  ...[
    ['outbound-business/sales-outbound', 'WmsSalesOutbound', '销售出库单', 'outbound'],
    ['outbound-business/sales-return', 'WmsSalesReturnDocument', '销售退货单', 'return'],
    ['outbound-business/other-outbound', 'WmsOtherOutbound', '其他出库单', 'other_outbound']
  ].map(([path, name, title, kind]) => ({
    path,
    name,
    title,
    kind,
    table: 'wms_sales_document_list'
  })),
  ...[
    ['inbound-business/purchase-inbound', 'WmsPurchaseInbound', '采购入库单', 'purchase_inbound'],
    ['inbound-business/purchase-return', 'WmsPurchaseReturn', '采购退货单', 'purchase_return'],
    ['inbound-business/other-inbound', 'WmsOtherInbound', '其他入库单', 'other_inbound'],
    [
      'inbound-business/entrusted-processing-inbound',
      'WmsEntrustedProcessingInbound',
      '受托加工材料入库单',
      'entrusted_processing_inbound'
    ],
    [
      'inbound-business/entrusted-processing-return',
      'WmsEntrustedProcessingReturn',
      '受托加工材料退料单',
      'entrusted_processing_return'
    ]
  ].map(([path, name, title, kind]) => ({
    path,
    name,
    title,
    kind,
    table: 'wms_purchase_document_list'
  }))
]) {
  const ordinaryExportScenario = [
    'wms_production_material_list',
    'wms_count_adjustment_list',
    'wms_transfer_request_list',
    'wms_sales_document_list',
    'wms_purchase_document_list',
    'wms_issue_request_list'
  ].includes(scenario.table)
  for (const exportPermission of ordinaryExportScenario ? ['allow', 'deny'] : ['allow']) {
    test(`${scenario.title}${ordinaryExportScenario ? `普通用户导出${exportPermission}` : ''}跨页导出保留展示模式与列表状态`, async ({
      page
    }, testInfo) => {
      test.setTimeout(180_000)
      await installFixtures(page)
      const expectedKindFilter = ['other_outbound', 'other_inbound'].includes(scenario.kind)
        ? `in.(${scenario.kind},other_return)`
        : `eq.${scenario.kind}`
      if (ordinaryExportScenario) {
        await page.route('**/rest/v1/rpc/current_is_super', (route) =>
          route.fulfill({ json: false })
        )
        await page.route('**/rest/v1/sys_user?*', (route) =>
          route.fulfill({
            json: {
              id: 'wms-test-user',
              auth_user_id: '705ddd8d-4959-4dc1-aeb0-08caed7ab51a',
              user_name: '普通仓储用户',
              user_type: '2',
              user_roles: ['R_USER'],
              status: '1',
              tenant_id: tenantId,
              tenant: { id: tenantId, tenant_code: 'DEMO', tenant_name: '示例工厂' }
            }
          })
        )
      }
      const menu = {
        id: `export-${scenario.name}`,
        parentId: null,
        name: scenario.name,
        path: `/wms/${scenario.path}`,
        component: `/wms/${scenario.path}`,
        type: 'menu',
        sort: 1,
        meta: meta(scenario.title)
      }
      const buttons = (exportPermission === 'allow' ? ['View', 'Export'] : ['View']).map(
        (action) => ({
          id: `${menu.id}-${action}`,
          parentId: menu.id,
          name: `${scenario.name}:${action}`,
          path: '',
          component: '',
          type: 'button',
          sort: 1,
          meta: meta(action)
        })
      )
      await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
        route.fulfill({
          json: [
            { code: 'platform', name: '测试平台', baseUrl: '/' },
            { code: 'wms', name: 'WMS仓储管理', baseUrl: '/wms/' }
          ]
        })
      )
      await mockApplicationMenus(page, { wms: [menu, ...buttons] })
      const rows = Array.from({ length: 1002 }, (_, index) => ({
        line_id: `line-${index}`,
        document_id: `document-${Math.floor(index / 2)}`,
        tenant_id: tenantId,
        document_no: `EXPORT-${String(Math.floor(index / 2)).padStart(4, '0')}`,
        line_no: (index % 2) + 1,
        business_date: '2026-10-02',
        application_date: '2026-10-02',
        status: 'draft',
        material_status: 'pending',
        material_code: `M-${index}`,
        material_description: '分页导出物料',
        specification_model: '测试规格',
        kind: scenario.kind,
        quantity: 1,
        requested_quantity: ['return', 'finished_return'].includes(scenario.kind) ? -1 : 1,
        actual_quantity: ['return', 'finished_return'].includes(scenario.kind) ? -1 : 1,
        fulfilled_quantity: 0,
        work_order_quantity: 1,
        base_quantity: 1,
        book_quantity: 1,
        counted_quantity: scenario.kind === 'loss' ? 0 : 2,
        variance_quantity: scenario.kind === 'loss' ? -1 : 1,
        amount: 1
      }))
      const includesOtherReturns = ['other_outbound', 'other_inbound'].includes(scenario.kind)
      if (includesOtherReturns) {
        for (const [index, row] of rows.entries()) {
          const documentIndex = Math.floor(index / 2)
          if (documentIndex % 2 === 1 || documentIndex === 500) {
            row.kind = 'other_return'
            row.status = 'submitted'
            row.quantity = -1
            row.base_quantity = -1
            row.amount = -1
          }
        }
      }
      const offsets: number[] = []
      const issueRequest = scenario.table === 'wms_issue_request_list'
      const issueStatuses = [
        ['draft', '暂存'],
        ['submitted', '待审核'],
        ['approved', '待领料'],
        ['partially_issued', '部分领料'],
        ['fulfilled', '已领完'],
        ['rejected', '已驳回'],
        ['cancelled', '已取消']
      ] as const
      const issueTypes = [
        ['damage_outbound', '货损出库'],
        ['consumables_outbound', '耗材出库'],
        ['scrap_outbound', '报废出库'],
        ['welfare_use', '福利领用'],
        ['office_supplies_use', '办公用品领用'],
        ['labor_protection_use', '劳保用品领用']
      ] as const
      const records = issueRequest
        ? rows
            .filter((_, index) => index % 2 === 0)
            .map((row, index) => ({
              ...row,
              id: row.document_id,
              status: issueStatuses[index % issueStatuses.length][0],
              request_type: issueTypes[index % issueTypes.length][0],
              material_codes: '单据汇总编码',
              material_descriptions: '单据汇总物料'
            }))
        : rows
      if (issueRequest) {
        await page.route('**/rest/v1/wms_issue_request_line?*', (route) => {
          const params = new URL(route.request().url()).searchParams
          const ids = new Set(
            (params.get('request_id') || '').slice(4, -1).replaceAll('"', '').split(',')
          )
          const offset = Number(params.get('offset') || 0)
          const limit = Number(params.get('limit') || 500)
          const lines = rows
            .filter((row) => ids.has(row.document_id))
            .map((row) => ({
              id: row.line_id,
              request_id: row.document_id,
              requested_quantity: 1,
              issued_quantity: 0,
              material: {
                material_code: row.material_code,
                material_name: row.material_description
              }
            }))
          return route.fulfill({ json: lines.slice(offset, offset + limit) })
        })
      }
      let parentPageReads = 0
      let scopedLineReads = 0
      let unrelatedLineReads = 0
      let rejectExportPage = false
      let releaseExportPage: (() => void) | undefined
      let downloadCount = 0
      page.on('download', () => downloadCount++)
      if (scenario.table === 'wms_purchase_document_list') {
        await page.route('**/rest/v1/wms_purchase_document?*', async (route) => {
          const params = new URL(route.request().url()).searchParams
          expect(params.get('tenant_id')).toBe(`eq.${tenantId}`)
          parentPageReads++
          expect(params.get('kind')).toBe(expectedKindFilter)
          const offset = Number(params.get('offset') || 0)
          if (rejectExportPage && offset > 0) {
            await new Promise<void>((resolve) => {
              releaseExportPage = resolve
            })
            return route.fulfill({
              status: 400,
              json: { code: 'P0001', message: '导出分页读取失败，请重试' }
            })
          }
          const limit = Number(params.get('limit') || 20)
          const parents = params.has('matchingLines.material.material_code')
            ? [{ id: 'document-0' }]
            : Array.from({ length: 501 }, (_, index) => ({ id: `document-${index}` }))
          const data = parents.slice(offset, offset + limit)
          return route.fulfill({
            json: data,
            headers: {
              'content-range': `${offset}-${offset + data.length - 1}/${parents.length}`,
              'access-control-expose-headers': 'content-range'
            }
          })
        })
      }
      await page.route(`**/rest/v1/${scenario.table}?*`, async (route) => {
        const params = new URL(route.request().url()).searchParams
        if (ordinaryExportScenario) {
          expect(params.get('tenant_id')).toBe(`eq.${tenantId}`)
        }
        if (scenario.kind) expect(params.get('kind')).toBe(expectedKindFilter)
        const offset = Number(params.get('offset') || 0)
        const limit = Math.min(Number(params.get('limit') || 1000), 1000)
        offsets.push(offset)
        if (rejectExportPage && offset > 0) {
          await new Promise<void>((resolve) => {
            releaseExportPage = resolve
          })
          return route.fulfill({
            status: 400,
            json: { code: 'P0001', message: '导出分页读取失败，请重试' }
          })
        }
        const parentFilter = params.get('document_id')
        const parentIds = parentFilter?.startsWith('in.(')
          ? new Set(parentFilter.slice(4, -1).replaceAll('"', '').split(','))
          : null
        if (parentIds) {
          scopedLineReads++
          expect(parentIds.size).toBeLessThanOrEqual(20)
        }
        if (!parentIds && !params.has('material_code')) unrelatedLineReads++
        const scopedRecords = records.filter(
          (row) =>
            (!parentIds || parentIds.has(row.document_id)) &&
            (!params.has('material_code') || row.material_code === 'M-0')
        )
        const data = scopedRecords.slice(offset, offset + limit)
        return route.fulfill({
          status: 200,
          headers: {
            'content-range': `${offset}-${offset + data.length - 1}/${scopedRecords.length}`,
            'access-control-expose-headers': 'content-range'
          },
          json: data
        })
      })
      await page.goto(`#/wms/${scenario.path}`, { waitUntil: 'domcontentloaded' })
      await expect(page.getByRole('heading', { name: scenario.title, exact: true })).toBeVisible({
        timeout: 120_000
      })
      if (ordinaryExportScenario) {
        await expect(page.getByRole('button', { name: /^新增/ })).toHaveCount(0)
        await expect(page.getByRole('button', { name: '导入', exact: true })).toHaveCount(0)
        await expect(page.locator('.el-table__body-wrapper').first()).toContainText('EXPORT-0000')
        if (exportPermission === 'deny') {
          await expect(page.getByRole('button', { name: '导出当前范围', exact: true })).toHaveCount(
            0
          )
          expect(downloadCount).toBe(0)
          await page.screenshot({
            path: testInfo.outputPath('production-export-viewonly.png'),
            animations: 'disabled'
          })
          return
        }
      }
      for (const mode of ['按单据', '按明细']) {
        await page.locator('.el-radio-button').filter({ hasText: mode }).click()
        await expect(page.getByRole('radio', { name: mode, exact: true })).toBeChecked()
        const body = page.locator('.el-table__body-wrapper').first()
        await expect(body).toContainText('EXPORT-0000')
        await expect(body).toContainText(
          mode === '按明细' ? '分页导出物料' : issueRequest ? '单据汇总物料' : '共 2 项物料'
        )
        if (scenario.table === 'wms_purchase_document_list' && mode === '按单据') {
          expect(parentPageReads).toBeGreaterThan(0)
          expect(scopedLineReads).toBeGreaterThan(0)
        }
        const before = await body.innerText()
        if (ordinaryExportScenario) {
          rejectExportPage = true
          releaseExportPage = undefined
          const previousDownloads = downloadCount
          const exportButton = page.getByRole('button', {
            name: '导出当前范围',
            exact: true
          })
          await exportButton.click()
          await expect.poll(() => Boolean(releaseExportPage)).toBe(true)
          await expect(exportButton).toBeDisabled()
          await expect.poll(() => body.innerText()).toBe(before)
          releaseExportPage!()
          await expect(page.locator('.el-message')).toContainText('导出分页读取失败，请重试')
          await expect(exportButton).toBeEnabled()
          await expect.poll(() => body.innerText()).toBe(before)
          expect(downloadCount).toBe(previousDownloads)
          await page.screenshot({
            path: testInfo.outputPath(`production-export-${mode}-error.png`),
            animations: 'disabled'
          })
          await expect(page.locator('.el-message')).toHaveCount(0, { timeout: 10_000 })
          rejectExportPage = false
        }
        offsets.length = 0
        const downloadPromise = page.waitForEvent('download')
        await page.getByRole('button', { name: '导出当前范围', exact: true }).click()
        const download = await downloadPromise
        const downloadPath = await download.path()
        expect(downloadPath).not.toBeNull()
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.readFile(downloadPath!)
        const sheet = workbook.worksheets[0]
        expect(sheet.rowCount).toBe(mode === '按单据' ? 502 : 1003)
        expect(sheet.getCell('A2').text).toBe('EXPORT-0000')
        if (
          [
            'wms_sales_document_list',
            'wms_purchase_document_list',
            'wms_count_adjustment_list',
            'wms_transfer_request_list'
          ].includes(scenario.table)
        ) {
          expect(sheet.getCell('C2').text).toBe('暂存')
        }
        if (issueRequest) {
          for (const [index, [, label]] of issueStatuses.entries()) {
            const rowNumber = 2 + index * (mode === '按单据' ? 1 : 2)
            expect(sheet.getCell(`D${rowNumber}`).text).toBe(label)
            if (mode === '按明细') expect(sheet.getCell(`D${rowNumber + 1}`).text).toBe(label)
          }
          for (const [index, [, label]] of issueTypes.entries()) {
            const rowNumber = 2 + index * (mode === '按单据' ? 1 : 2)
            expect(sheet.getCell(`B${rowNumber}`).text).toBe(label)
            if (mode === '按明细') expect(sheet.getCell(`B${rowNumber + 1}`).text).toBe(label)
          }
        }
        if (scenario.table === 'wms_production_material_list') {
          expect(sheet.getCell('F2').text).toBe('暂存')
          expect(sheet.getCell('G2').text).toBe(
            {
              issue: '待领料',
              return: '待退料',
              finished_inbound: '待入库',
              finished_return: '待退库'
            }[scenario.kind]
          )
          if (mode === '按明细') {
            expect(Number(sheet.getCell('K2').text)).toBe(scenario.kind === 'return' ? -1 : 1)
            expect(Number(sheet.getCell('L2').text)).toBe(
              ['return', 'finished_return'].includes(scenario.kind) ? -1 : 1
            )
          }
        }
        expect(sheet.getCell(`A${sheet.rowCount}`).text).toBe('EXPORT-0500')
        if (scenario.table === 'wms_count_adjustment_list') {
          expect(Number(sheet.getCell('G2').text)).toBe(mode === '按单据' ? 2 : 1)
          expect(Number(sheet.getCell('H2').text)).toBe(
            scenario.kind === 'loss' ? 0 : mode === '按单据' ? 4 : 2
          )
          expect(Number(sheet.getCell('I2').text)).toBe(
            (scenario.kind === 'loss' ? -1 : 1) * (mode === '按单据' ? 2 : 1)
          )
        }
        if (includesOtherReturns) {
          expect(sheet.getCell(`C${sheet.rowCount}`).text).toBe('已提交')
          expect(Number(sheet.getCell(`J${sheet.rowCount}`).text)).toBe(-1)
          const returnedRows = Array.from(
            { length: sheet.rowCount - 1 },
            (_, index) => index + 2
          ).filter((rowNumber) => sheet.getCell(`C${rowNumber}`).text === '已提交')
          expect(returnedRows).toHaveLength(mode === '按单据' ? 251 : 502)
          for (const rowNumber of returnedRows) {
            expect(Number(sheet.getCell(`J${rowNumber}`).text)).toBe(-1)
          }
        }
        expect(offsets).toContain(issueRequest ? 500 : 1000)
        if (issueRequest && mode === '按明细') {
          expect(new Set(sheet.getColumn(6).values.slice(2)).size).toBe(1002)
        }
        await expect.poll(() => body.innerText()).toBe(before)
      }
      const documentModeResponse = page.waitForResponse((response) =>
        response.url().includes(`/rest/v1/${scenario.table}?`)
      )
      await page.locator('.el-radio-button').filter({ hasText: '按单据' }).click()
      await documentModeResponse
      await expect(page.locator('.el-loading-mask:visible')).toHaveCount(0)
      const documentRows = page
        .locator('.el-table__body-wrapper')
        .first()
        .locator('tr.el-table__row')
      await expect(documentRows).toHaveCount(20)
      await expect(documentRows.nth(19)).toContainText('EXPORT-0019')
      const identifiers = await documentRows
        .locator('td')
        .filter({ hasText: /EXPORT-\d{4}/ })
        .allTextContents()
      expect(new Set(identifiers).size).toBe(20)
      if (scenario.table === 'wms_purchase_document_list') {
        await page.getByRole('button', { name: '展开', exact: true }).click()
        await page.getByPlaceholder('物料编码', { exact: true }).fill('M-0')
        await page.getByRole('button', { name: '查询', exact: true }).click()
        const body = page.locator('.el-table__body-wrapper').first()
        await expect(body).toContainText('共 2 项物料')
        await expect(body).not.toContainText('EXPORT-0001')
        const readsBeforeExport = unrelatedLineReads
        const downloadPromise = page.waitForEvent('download')
        await page.getByRole('button', { name: '导出当前范围', exact: true }).click()
        const download = await downloadPromise
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.readFile((await download.path())!)
        const sheet = workbook.worksheets[0]
        expect(sheet.rowCount).toBe(2)
        expect(sheet.getCell('A2').text).toBe('EXPORT-0000')
        expect(Number(sheet.getCell('N2').text)).toBe(2)
        expect(unrelatedLineReads).toBe(readsBeforeExport)
      }
    })
  }
}

test('初始库存单带出默认组织及多关联单据下的业务类型', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  await installFixtures(page)
  const root = {
    id: 'wms-stock-root',
    parentId: null,
    name: 'WmsWarehouseManagement',
    path: '/wms',
    component: '/index/index',
    type: 'folder',
    sort: 1,
    meta: meta('WMS仓储管理')
  }
  const folder = {
    id: 'wms-stock-folder',
    parentId: root.id,
    name: 'WmsInitialization',
    path: 'initialization',
    component: '',
    type: 'folder',
    sort: 1,
    meta: meta('初始化')
  }
  const menu = {
    id: 'stock-menu',
    parentId: folder.id,
    name: 'WmsInitialStock',
    path: 'initial-stock',
    component: '/wms/initialization/initial-stock',
    type: 'menu',
    sort: 1,
    meta: meta('初始库存单')
  }
  const buttons = ['View', 'Add', 'Copy', 'Edit', 'Delete', 'Export'].map((action) => ({
    id: `wms-stock-${action}`,
    parentId: menu.id,
    name: `WmsInitialStock:${action}`,
    path: '',
    component: '',
    type: 'button',
    sort: 1,
    meta: meta(action),
    children: []
  }))
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({
      json: [
        { code: 'platform', name: '测试平台', baseUrl: '/' },
        { code: 'wms', name: 'WMS仓储管理', baseUrl: '/wms/' }
      ]
    })
  )
  await mockApplicationMenus(page, { wms: [root, folder, menu, ...buttons] })
  await page.route('**/rest/v1/sys_menu?*', (route) => route.fulfill({ json: { id: menu.id } }))
  await page.route('**/rest/v1/mdm_organization?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'default-stock-org',
          tenant_id: tenantId,
          parent_id: null,
          organization_code: 'DEFAULT-ORG',
          organization_name: '默认库存组织',
          organization_type: 'company',
          status: '1',
          sort: 1,
          is_system: false
        }
      ]
    })
  )
  await page.route('**/rest/v1/wms_inventory_initialization?*', (route) =>
    route.fulfill({
      json: [
        {
          organization_id: 'default-stock-org',
          enabled_on: '2026-10-02',
          is_default: true,
          initialization_closed_at: null
        }
      ]
    })
  )
  await page.route('**/rest/v1/wms_initial_stock_document?*', (route) =>
    route.fulfill({ status: 200, headers: { 'content-range': '*/0' }, json: [] })
  )
  await page.route('**/rest/v1/mdm_document_type?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'initial-document-type',
          tenant_id: tenantId,
          menu_ids: ['stock-menu'],
          document_type_code: 'WMS_INITIAL_STOCK',
          document_type_name: '标准初始库存单',
          is_default: true,
          enabled: true
        },
        {
          id: 'other-document-type',
          tenant_id: tenantId,
          menu_ids: ['stock-menu'],
          document_type_code: 'OTHER_STOCK',
          document_type_name: '其他库存单据',
          is_default: false,
          enabled: true
        }
      ]
    })
  )
  await page.route('**/rest/v1/mdm_business_type?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'initial-business-type',
          tenant_id: tenantId,
          document_type_id: 'other-document-type',
          document_type_ids: ['other-document-type', 'initial-document-type'],
          menu_ids: ['stock-menu'],
          business_type_code: 'WMS_INITIAL_STOCK',
          business_type_name: '初始化库存',
          is_default: true,
          enabled: true
        }
      ]
    })
  )
  await page.route('**/rest/v1/mdm_material?*', (route) =>
    route.fulfill({
      json: [{ ...material, code: material.material_code, name: material.material_name }]
    })
  )
  await page.goto('#/wms/initialization/initial-stock', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '初始库存单', exact: true })).toBeVisible({
    timeout: 120_000
  })
  await page.getByRole('button', { name: '新增初始库存单' }).click()
  const drawer = page.locator('.el-drawer:visible')
  await expect(drawer.getByText('默认库存组织')).toBeVisible()
  await expect(drawer.getByText('标准初始库存单')).toBeVisible()
  await expect(drawer.getByText('初始化库存')).toBeVisible()
  await expect(drawer.getByText('新增', { exact: true })).toBeVisible()
  await expect(drawer.getByText('复制', { exact: true })).toBeVisible()
  await expect(drawer.getByText('编制', { exact: true })).toBeVisible()
  await expect(drawer.getByText('删除', { exact: true })).toBeVisible()
  await expect(drawer.getByText('序列号', { exact: true })).toBeVisible()
  const visualDir = join(process.cwd(), '.artifacts', 'wms-visual', testInfo.project.name)
  mkdirSync(visualDir, { recursive: true })
  await page.waitForTimeout(350)
  await page.screenshot({ path: join(visualDir, 'wms-initial-stock-defaults.png'), fullPage: true })
  await drawer.getByRole('button', { name: '新增', exact: true }).click()
  const materialPicker = page.locator('.el-dialog:visible').last()
  await expect(materialPicker.locator('.el-table__body tr').first()).toBeVisible()
  await materialPicker.locator('.el-table__body tr .el-checkbox').first().click()
  await materialPicker.getByRole('button', { name: '确定', exact: true }).click()
  await expect(
    drawer.locator('.wms-editable-line-table .el-table__body tr:first-child .el-select').first()
  ).toBeVisible()
  const selectWidths = await drawer
    .locator('.art-table.wms-editable-line-table')
    .evaluate((table) => {
      const headings = Array.from(table.querySelectorAll('.el-table__header th')).map((cell) =>
        cell.textContent?.replace(/^\s*\*\s*|\s*（必填）\s*$/g, '').trim()
      )
      const cells = table.querySelectorAll('.el-table__body tr:first-child td')
      return ['库存类型', '库存状态', '货主类型'].map((label) => {
        const index = headings.indexOf(label)
        const cell = cells[index]
        const control = cell?.querySelector('.el-select')
        return {
          label,
          index,
          ratio:
            cell && control
              ? control.getBoundingClientRect().width / cell.getBoundingClientRect().width
              : 0
        }
      })
    })
  for (const field of selectWidths) expect(field.ratio, field.label).toBeGreaterThan(0.7)
  await drawer
    .locator('.wms-editable-line-table .el-table__body tr')
    .first()
    .locator('td')
    .nth(selectWidths[0].index)
    .scrollIntoViewIfNeeded()
  await page.screenshot({ path: join(visualDir, 'wms-initial-stock-line-width.png') })
  await drawer.getByRole('button', { name: '取消', exact: true }).click()
  await expect(drawer).not.toBeVisible()

  const documents = Array.from({ length: 501 }, (_, index) => ({
    id: `export-document-${index}`,
    tenant_id: tenantId,
    document_no: `EXPORT-${String(index).padStart(4, '0')}`,
    business_date: '2026-10-02',
    status: 'draft',
    lines: [0, 1].map((line) => ({
      id: `export-line-${index}-${line}`,
      opening_quantity: index + line + 1,
      material: { code: `M-${index}-${line}`, name: '导出验证物料' }
    }))
  }))
  const offsets: number[] = []
  await page.route('**/rest/v1/wms_initial_stock_document?*', (route) => {
    const params = new URL(route.request().url()).searchParams
    const offset = Number(params.get('offset') || 0)
    const limit = Number(params.get('limit') || 500)
    offsets.push(offset)
    const rows = documents.slice(offset, offset + limit)
    return route.fulfill({
      status: 200,
      headers: {
        'content-range': `${offset}-${offset + rows.length - 1}/${documents.length}`,
        'access-control-expose-headers': 'content-range'
      },
      json: rows
    })
  })
  for (const mode of ['按单据', '按明细']) {
    if (mode === '按明细') {
      await page.locator('.el-radio-button').filter({ hasText: mode }).click()
      await expect(page.getByRole('radio', { name: mode, exact: true })).toBeChecked()
    }
    offsets.length = 0
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: '导出筛选结果', exact: true }).click()
    const download = await downloadPromise
    const downloadPath = await download.path()
    expect(downloadPath).not.toBeNull()
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(downloadPath!)
    const sheet = workbook.worksheets[0]
    expect(sheet.rowCount).toBe(1003)
    expect(sheet.getCell('A2').text).toBe('EXPORT-0000')
    expect(sheet.getCell('A1003').text).toBe('EXPORT-0500')
    expect(new Set(sheet.getColumn(4).values.slice(2)).size).toBe(1002)
    expect(offsets).toContain(500)
  }
})

test('期初销售出库单按菜单和多关联单据带出默认值', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  await installFixtures(page)
  const root = {
    id: 'sales-root',
    parentId: null,
    name: 'WmsWarehouseManagement',
    path: '/wms',
    component: '/index/index',
    type: 'folder',
    sort: 1,
    meta: meta('WMS仓储管理')
  }
  const folder = {
    id: 'sales-folder',
    parentId: root.id,
    name: 'WmsInitialization',
    path: 'initialization',
    component: '',
    type: 'folder',
    sort: 1,
    meta: meta('初始化')
  }
  const menu = {
    id: 'initial-sales-menu',
    parentId: folder.id,
    name: 'WmsInitialSalesOutbound',
    path: 'initial-sales-outbound',
    component: '/wms/initialization/initial-sales-outbound',
    type: 'menu',
    sort: 1,
    meta: meta('期初销售出库单')
  }
  const buttons = ['View', 'Add', 'Copy', 'Edit', 'Delete', 'Export'].map((action) => ({
    id: `initial-sales-${action}`,
    parentId: menu.id,
    name: `WmsInitialSalesOutbound:${action}`,
    path: '',
    component: '',
    type: 'button',
    sort: 1,
    meta: meta(action),
    children: []
  }))
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({
      json: [
        { code: 'platform', name: '测试平台', baseUrl: '/' },
        { code: 'wms', name: 'WMS仓储管理', baseUrl: '/wms/' }
      ]
    })
  )
  await mockApplicationMenus(page, { wms: [root, folder, menu, ...buttons] })
  await page.route('**/rest/v1/sys_menu?*', (route) => route.fulfill({ json: { id: menu.id } }))
  await page.route('**/rest/v1/mdm_organization?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'default-sales-org',
          tenant_id: tenantId,
          parent_id: null,
          organization_code: 'SALES-ORG',
          organization_name: '销售默认库存组织',
          organization_type: 'company',
          status: '1',
          sort: 1,
          is_system: false
        }
      ]
    })
  )
  await page.route('**/rest/v1/wms_inventory_initialization?*', (route) =>
    route.fulfill({
      json: [
        {
          organization_id: 'default-sales-org',
          enabled_on: '2026-10-06',
          is_default: true,
          initialization_closed_at: null
        }
      ]
    })
  )
  await page.route('**/rest/v1/mdm_document_type?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'sales-document-type',
          tenant_id: tenantId,
          menu_ids: [menu.id, 'other-menu'],
          document_type_code: 'SALES_INITIAL',
          document_type_name: '期初销售默认单据',
          is_default: true,
          enabled: true
        },
        {
          id: 'other-document-type',
          tenant_id: tenantId,
          menu_ids: [menu.id],
          document_type_code: 'OTHER_SALES',
          document_type_name: '其他销售单据',
          is_default: false,
          enabled: true
        }
      ]
    })
  )
  await page.route('**/rest/v1/mdm_business_type?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'sales-business-type',
          tenant_id: tenantId,
          document_type_id: 'other-document-type',
          document_type_ids: ['other-document-type', 'sales-document-type'],
          menu_ids: [menu.id],
          business_type_code: 'SALES_INITIAL',
          business_type_name: '期初销售默认业务',
          is_default: true,
          enabled: true
        },
        {
          id: 'unrelated-business-type',
          tenant_id: tenantId,
          document_type_id: 'sales-document-type',
          document_type_ids: ['sales-document-type'],
          menu_ids: ['other-menu'],
          business_type_code: 'UNRELATED',
          business_type_name: '其他菜单业务',
          is_default: true,
          enabled: true
        }
      ]
    })
  )
  await page.route('**/rest/v1/wms_initial_sales_document?*', (route) =>
    route.fulfill({ status: 200, headers: { 'content-range': '*/0' }, json: [] })
  )
  await page.goto('#/wms/initialization/initial-sales-outbound', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '期初销售出库单', exact: true })).toBeVisible({
    timeout: 120_000
  })
  await page.getByRole('button', { name: '新增期初销售出库单' }).click()
  const drawer = page.locator('.el-drawer:visible')
  const visualDir = join(process.cwd(), '.artifacts', 'wms-visual', testInfo.project.name)
  mkdirSync(visualDir, { recursive: true })
  await page.screenshot({ path: join(visualDir, 'wms-initial-sales-defaults.png'), fullPage: true })
  await expect(drawer.getByText('销售默认库存组织')).toBeVisible()
  await expect(drawer.getByText('期初销售默认单据')).toBeVisible()
  await expect(drawer.getByText('期初销售默认业务')).toBeVisible()
  await expect(drawer.getByText('其他菜单业务')).toHaveCount(0)
})
