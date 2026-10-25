import { expect, test } from '@playwright/test'
import { installFixtures, meta, tenantId } from './support/inventory-fixtures'
import { mockApplicationMenus } from './support/menu-rpc'
import { expectInputTextUnclipped } from './support/input-text-width'
import { prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.describe.configure({ timeout: 240_000 })

const scenarios = [
  ['stock', 'stock', 'WmsStock', '即时库存'],
  ['movement', 'inventory-ledger', 'WmsInventoryLedger', '库存流水'],
  ['ledger', 'stock-ledger', 'WmsStockLedger', '库存台账'],
  ['receipt-issue', 'material-receipt-issue', 'WmsMaterialReceiptIssue', '物料收发明细表']
] as const

for (const authority of ['super', 'ordinary'] as const) {
  for (const [kind, segment, name, title] of scenarios) {
    test(`${authority}${title}查询失败恢复、空态与专注模式`, async ({ page }, testInfo) => {
      test.setTimeout(240_000)
      await installFixtures(page)
      const dark = testInfo.project.name.includes('dark')
      const shadow = testInfo.project.name.includes('shadow')
      await prepareAppearance(page, { theme: dark ? 'dark' : 'light', boxBorderMode: !shadow })
      if (authority === 'ordinary') {
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
      const locationRequests: string[] = []
      await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
        route.fulfill({
          json: [
            { code: 'platform', name: '测试平台', baseUrl: '/' },
            { code: 'wms', name: 'WMS仓储管理', baseUrl: '/wms/' }
          ]
        })
      )
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
      const path = `inventory-trace/${segment}`
      const menu = {
        id: 'report-menu',
        parentId: root.id,
        name,
        path,
        component: `/wms/${path}`,
        type: 'menu',
        sort: 1,
        meta: meta(title)
      }
      await mockApplicationMenus(page, {
        wms: [
          root,
          menu,
          {
            id: 'report-view',
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
      let state: 'data' | 'error' | 'empty' = 'data'
      const requests: Record<string, unknown>[] = []
      const row = {
        id: 'report-test',
        batch_id: 'batch-test',
        material_code: 'TEST-MAT',
        material_name: '测试库存物料',
        warehouse_id: 'warehouse-test',
        warehouse_name: '测试仓库',
        inventory_quantity: 1,
        basic_factor: 2,
        auxiliary_factor: 3,
        auxiliary_factor2: 4,
        opening_quantity: 0,
        inbound_quantity: 1,
        outbound_quantity: 0,
        closing_quantity: 1,
        document_type:
          kind === 'movement' || kind === 'receipt-issue' ? 'sales_out' : 'purchase_in',
        document_status: kind === 'stock' ? null : kind === 'ledger' ? '汇总' : '已过账',
        document_no:
          kind === 'movement' || kind === 'receipt-issue' ? 'TEST-SALES-001' : 'TEST-PURCHASE-001',
        source_document_id:
          kind === 'movement' || kind === 'receipt-issue' ? 'sales-source-test' : null,
        source_document_kind: kind === 'movement' || kind === 'receipt-issue' ? 'outbound' : null,
        source_line_no: kind === 'movement' || kind === 'receipt-issue' ? 10 : null
      }
      await page.route('**/rest/v1/rpc/wms_inventory_report_secure', (route) => {
        requests.push(route.request().postDataJSON())
        return route.fulfill(
          state === 'error'
            ? { status: 503, json: { message: '测试报表读取失败', code: 'XX000' } }
            : {
                json: {
                  data:
                    state === 'data'
                      ? [row, { ...row, id: 'report-unzoned', material_code: 'TEST-UNZONED' }]
                      : [],
                  total: state === 'data' ? 2 : 0,
                  navigation:
                    state === 'data'
                      ? [
                          {
                            warehouse_id: 'warehouse-test',
                            zone_id: 'zone-test',
                            bin_id: 'bin-test',
                            count: 1
                          },
                          {
                            warehouse_id: 'warehouse-test',
                            zone_id: null,
                            bin_id: 'bin-unzoned',
                            count: 1
                          }
                        ]
                      : []
                }
              }
        )
      })
      let locationFailed = false
      for (const [tableName, rows] of [
        [
          'mdm_warehouse',
          [{ id: 'warehouse-test', warehouse_code: 'WH-TEST', warehouse_name: '测试仓库' }]
        ],
        [
          'mdm_warehouse_zone',
          [
            {
              id: 'zone-test',
              warehouse_id: 'warehouse-test',
              zone_code: 'ZONE-TEST',
              zone_name: '测试库区'
            }
          ]
        ],
        [
          'mdm_warehouse_bin',
          [
            {
              id: 'bin-test',
              warehouse_id: 'warehouse-test',
              zone_id: 'zone-test',
              bin_code: 'BIN-TEST',
              bin_name: '测试仓位'
            },
            {
              id: 'bin-unzoned',
              warehouse_id: 'warehouse-test',
              zone_id: null,
              bin_code: 'BIN-UNZONED',
              bin_name: '未分区仓位'
            }
          ]
        ]
      ] as const)
        await page.route(`**/rest/v1/${tableName}?*`, (route) => {
          locationRequests.push(route.request().url())
          return route.fulfill(
            locationFailed
              ? { status: 400, json: { code: 'P0001', message: '测试位置资料读取失败' } }
              : { json: rows }
          )
        })
      await page.goto(
        process.env.WMS_REPORT_ISOLATED === 'true'
          ? `/tests/e2e/fixtures/wms-inventory-report.html?kind=${kind}&authority=${authority}`
          : `#/wms/${path}`,
        { waitUntil: 'domcontentloaded' }
      )
      await expect(page.locator('html')).toHaveAttribute(
        'data-box-mode',
        shadow ? 'shadow-mode' : 'border-mode'
      )
      if (dark) await expect(page.locator('html')).toHaveClass(/dark/)
      else await expect(page.locator('html')).not.toHaveClass(/dark/)
      if (await page.getByRole('button', { name: '知道了', exact: true }).isVisible()) {
        await page.getByRole('button', { name: '知道了', exact: true }).click()
      }
      const header = page.locator('.business-workspace-header')
      const table = page.locator('.art-table-query')
      await expect(page.getByText('TEST-MAT', { exact: true })).toBeVisible({ timeout: 120_000 })
      if (kind === 'movement' || kind === 'receipt-issue') {
        const link = table.getByRole('link', { name: 'TEST-SALES-001', exact: true }).first()
        if (authority === 'super') {
          await expect(link).toHaveAttribute('href', /sales-outbound\?documentId=sales-source-test/)
          await link.scrollIntoViewIfNeeded()
          await page.screenshot({
            path: testInfo.outputPath('report-source-link.png'),
            animations: 'disabled'
          })
        } else await expect(link).toHaveCount(0)
        await expect(table.getByText('业务明细行号', { exact: true })).toBeAttached()
        for (const source of [
          {
            kind: 'production_issue',
            id: 'production-source-test',
            no: 'TEST-ISSUE-001',
            path: /production-issue\?documentId=production-source-test/,
            movementLabel: '生产领料'
          },
          {
            kind: 'inbound_purchase_inbound',
            id: 'purchase-source-test',
            no: 'TEST-PURCHASE-001',
            path: /purchase-inbound\?documentId=purchase-source-test/,
            movementLabel: '采购入库'
          }
        ]) {
          row.source_document_kind = source.kind
          row.source_document_id = source.id
          row.document_no = source.no
          row.document_type = source.kind
          const before = requests.length
          await page.getByRole('button', { name: '查询', exact: true }).click()
          await expect.poll(() => requests.length).toBeGreaterThan(before)
          const sourceLink = table.getByRole('link', { name: source.no, exact: true }).first()
          if (authority === 'super') await expect(sourceLink).toHaveAttribute('href', source.path)
          else await expect(sourceLink).toHaveCount(0)
          await expect(table.getByText(source.movementLabel, { exact: true }).first()).toBeVisible()
        }
        row.source_document_kind = 'outbound'
        row.source_document_id = 'sales-source-test'
        row.document_no = 'TEST-SALES-001'
        row.document_type = 'sales_out'
        await page.getByRole('button', { name: '查询', exact: true }).click()
      }
      if (kind !== 'stock') {
        const status = table
          .locator('.el-table__body tr')
          .first()
          .getByText(kind === 'ledger' ? '汇总' : '已过账', { exact: true })
        await status.scrollIntoViewIfNeeded()
        await expect(status).toBeInViewport()
        await page.screenshot({
          path: testInfo.outputPath('report-document-status.png'),
          animations: 'disabled'
        })
      }
      await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
      await expect(header).toBeHidden()
      await expect(page.locator('.inventory-location-navigator')).toBeVisible()
      await expect(table).toHaveClass(/is-focus-mode/)
      await page.screenshot({
        path: testInfo.outputPath('report-focus.png'),
        animations: 'disabled'
      })
      await table
        .getByRole('button', { name: '退出专注模式', exact: true })
        .scrollIntoViewIfNeeded()
      await page.screenshot({
        path: testInfo.outputPath('report-focus-table.png'),
        animations: 'disabled'
      })
      await page.keyboard.press('Escape')
      await expect(header).toBeVisible()
      await expect(table).not.toHaveClass(/is-focus-mode/)
      const materialCode = page.getByRole('textbox', { name: '物料编码', exact: true })
      await materialCode.fill('TEST-MAT')
      state = 'error'
      await page.getByRole('button', { name: '查询', exact: true }).click()
      await expect(table.getByText('数据加载失败', { exact: true })).toBeVisible()
      await expect(materialCode).toHaveValue('TEST-MAT')
      await table.getByText('数据加载失败', { exact: true }).scrollIntoViewIfNeeded()
      await page.screenshot({
        path: testInfo.outputPath('report-error.png'),
        animations: 'disabled'
      })
      state = 'data'
      await table.getByRole('button', { name: '重新加载', exact: true }).click()
      await expect(page.getByText('TEST-MAT', { exact: true })).toBeVisible()
      expect(requests.at(-1)?.p_kind).toBe(kind)
      expect(requests.at(-1)?.p_material_code).toBe('TEST-MAT')
      state = 'empty'
      await page.getByRole('button', { name: '查询', exact: true }).click()
      await expect(table.getByText(`当前范围暂无${title}数据`, { exact: true })).toBeVisible()
      await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
      await expect(header).toBeHidden()
      await expect(table.getByText(`当前范围暂无${title}数据`, { exact: true })).toBeVisible()
      await page.getByRole('button', { name: '退出专注模式', exact: true }).click()
      await expect(header).toBeVisible()
      await expect(materialCode).toHaveValue('TEST-MAT')
      expect(
        await page
          .locator('.business-workspace-page')
          .evaluate((node) => node.scrollWidth - node.clientWidth)
      ).toBeLessThanOrEqual(1)
      await table.getByText(`当前范围暂无${title}数据`, { exact: true }).scrollIntoViewIfNeeded()
      await page.screenshot({
        path: testInfo.outputPath('report-empty-restored.png'),
        animations: 'disabled'
      })
      const filters = [
        ['物料编码', 'p_material_code', 'TEST-MAT'],
        ['物料描述', 'p_material_description', '测试库存物料'],
        ['规格型号', 'p_specification_model', 'SPEC-01'],
        ['项目全称', 'p_project_name', '测试工程'],
        ['批号', 'p_batch_no', 'BATCH-001']
      ] as const
      for (const [label, , value] of filters)
        await page.getByRole('textbox', { name: label, exact: true }).fill(value)
      const startDate = page.getByPlaceholder('开始日期', { exact: true })
      const endDate = page.getByPlaceholder('结束日期', { exact: true })
      await startDate.fill('2026-09-01')
      await endDate.fill('2026-09-30')
      await endDate.press('Enter')
      await page.keyboard.press('Escape')
      await expectInputTextUnclipped(page.locator('.el-date-editor input.el-range-input'))
      const dismissGuide = page.getByRole('button', { name: '知道了', exact: true })
      if (await dismissGuide.isVisible()) await dismissGuide.click()
      await page.getByRole('textbox', { name: '物料编码', exact: true }).click()
      await page.keyboard.press('Escape')
      await expect(page.locator('.el-date-range-picker:visible')).toHaveCount(0)
      await page.screenshot({
        path: testInfo.outputPath('report-date-values.png'),
        animations: 'disabled'
      })
      state = 'data'
      await page.getByRole('button', { name: '查询', exact: true }).click()
      await expect(page.getByText('TEST-MAT', { exact: true })).toBeVisible()
      expect(requests.at(-1)).toMatchObject({
        p_date_start: '2026-09-01',
        p_date_end: '2026-09-30'
      })
      for (const [, key, value] of filters) expect(requests.at(-1)?.[key]).toBe(value)
      const beforeReset = requests.length
      await page.getByRole('button', { name: '重置', exact: true }).click()
      for (const [label] of filters)
        await expect(page.getByRole('textbox', { name: label, exact: true })).toHaveValue('')
      await expect.poll(() => requests.length).toBeGreaterThan(beforeReset)
      for (const [, key] of filters) expect(requests.at(-1)?.[key]).toBeNull()
      await expect(startDate).toHaveValue('')
      await expect(endDate).toHaveValue('')
      expect(requests.at(-1)).toMatchObject({ p_date_start: null, p_date_end: null })
      await expect(page.getByText('TEST-MAT', { exact: true })).toBeVisible()
      await page.screenshot({
        path: testInfo.outputPath('report-reset-filters.png'),
        animations: 'disabled'
      })
      const navigator = page.locator('.inventory-location-navigator')
      const steps = [
        ['测试仓库', null, null],
        ['测试库区', 'zone-test', null],
        ...(kind === 'stock' ? [['测试仓位', 'zone-test', 'bin-test']] : [])
      ]
      for (const [label, zoneId, binId] of steps) {
        const before = requests.length
        await navigator.locator('strong').getByText(label!, { exact: true }).click()
        await expect.poll(() => requests.length).toBeGreaterThan(before)
        expect(requests.at(-1)).toMatchObject({
          p_warehouse_id: 'warehouse-test',
          p_zone_id: zoneId,
          p_bin_id: binId,
          p_unzoned: false
        })
      }
      const beforeUnzoned = requests.length
      await navigator.locator('strong').getByText('未分区', { exact: true }).click()
      await expect.poll(() => requests.length).toBeGreaterThan(beforeUnzoned)
      expect(requests.at(-1)).toMatchObject({
        p_warehouse_id: 'warehouse-test',
        p_zone_id: null,
        p_bin_id: null,
        p_unzoned: true
      })
      if (kind === 'stock') {
        const beforeBin = requests.length
        await navigator.locator('strong').getByText('未分区仓位', { exact: true }).click()
        await expect.poll(() => requests.length).toBeGreaterThan(beforeBin)
        expect(requests.at(-1)).toMatchObject({
          p_warehouse_id: 'warehouse-test',
          p_zone_id: null,
          p_bin_id: 'bin-unzoned',
          p_unzoned: true
        })
      }
      await navigator.scrollIntoViewIfNeeded()
      await navigator
        .locator('strong')
        .getByText(kind === 'stock' ? '未分区仓位' : '未分区', { exact: true })
        .locator('xpath=ancestor::div[contains(@class, "el-tree-node__content")][1]')
        .scrollIntoViewIfNeeded()
      await page.screenshot({
        path: testInfo.outputPath('report-unzoned-selection.png'),
        animations: 'disabled'
      })
      const beforeKeyword = requests.length
      await navigator
        .getByRole('textbox', { name: '搜索仓库、库区或库位', exact: true })
        .fill('NO-MATCH-LOCATION')
      await expect(navigator.getByText('未找到匹配的仓储位置', { exact: true })).toBeVisible()
      expect(requests.length).toBe(beforeKeyword)
      await navigator.getByRole('button', { name: '清除位置搜索', exact: true }).click()
      await page.getByRole('button', { name: '重置', exact: true }).click()
      await expect(navigator.getByRole('button', { name: /全部仓库/ })).toHaveClass(/is-active/)
      await expect(navigator.locator('.el-tree-node.is-current')).toHaveCount(0)
      await expect.poll(() => requests.at(-1)?.p_warehouse_id).toBeNull()
      expect(requests.at(-1)).toMatchObject({ p_zone_id: null, p_bin_id: null, p_unzoned: false })
      await navigator.scrollIntoViewIfNeeded()
      await page.screenshot({
        path: testInfo.outputPath('report-location-reset.png'),
        animations: 'disabled'
      })
      await materialCode.fill('TEST-MAT')
      locationFailed = true
      await navigator.getByRole('button', { name: '刷新仓储位置', exact: true }).click()
      await expect(navigator.getByText('仓储位置加载失败，请重试', { exact: true })).toBeVisible()
      await expect(materialCode).toHaveValue('TEST-MAT')
      await expect(page.getByText('TEST-MAT', { exact: true })).toBeVisible()
      await navigator.scrollIntoViewIfNeeded()
      await page.screenshot({
        path: testInfo.outputPath('report-location-error.png'),
        animations: 'disabled'
      })
      locationFailed = false
      await navigator.getByRole('button', { name: '重新加载', exact: true }).click()
      await expect(navigator.getByText('仓储位置加载失败，请重试', { exact: true })).toHaveCount(0)
      await expect(navigator.locator('strong').getByText('测试仓库', { exact: true })).toBeVisible()
      await expect(materialCode).toHaveValue('TEST-MAT')
      await page.screenshot({
        path: testInfo.outputPath('report-location-recovered.png'),
        animations: 'disabled'
      })
      const summary = page
        .locator('.el-form-item')
        .filter({ has: page.locator('.el-form-item__label').getByText('汇总值', { exact: true }) })
        .locator('.el-select')
      const beforeSummary = requests.length
      await summary.click()
      for (const option of ['库存数量', '基本数量', '辅助数量', '辅助数量(2)']) {
        await page.getByRole('option', { name: option, exact: true }).click()
      }
      await page.keyboard.press('Escape')
      const headers = table.locator('.el-table__header-wrapper th')
      await expect(headers.getByText('计量单位', { exact: true })).toHaveCount(1)
      if (kind === 'stock') await expect(headers.getByText('数量', { exact: true })).toHaveCount(1)
      await expect(headers.getByText('库存单位', { exact: true })).toHaveCount(0)
      await expect(headers.getByText('基本单位', { exact: true })).toHaveCount(0)
      await expect(headers.getByText('辅助单位', { exact: true })).toHaveCount(1)
      await expect(headers.getByText('辅助单位(2)', { exact: true })).toHaveCount(1)
      await expect(headers.getByText('库存数量', { exact: true })).toHaveCount(0)
      await expect(headers.getByText('基本数量', { exact: true })).toHaveCount(0)
      expect(await headers.getByText('辅助数量', { exact: true }).count()).toBeGreaterThan(0)
      expect(await headers.getByText('辅助数量(2)', { exact: true }).count()).toBeGreaterThan(0)
      expect(requests.length).toBe(beforeSummary)
      for (const [label, factor] of [
        ['辅助数量', 3],
        ['辅助数量(2)', 4]
      ] as const) {
        const expected =
          kind === 'stock'
            ? [String(factor)]
            : kind === 'ledger'
              ? ['0', String(factor), '0', String(factor)]
              : [String(factor), '0']
        await expect
          .poll(() =>
            headers.getByText(label, { exact: true }).evaluateAll((elements) =>
              elements.map((element) => {
                const th = element.closest('th')!
                const columnClass = Array.from(th.classList).find((value) =>
                  /^el-table_.*_column_/.test(value)
                )!
                const row = th.closest('.el-table')!.querySelector('.el-table__body tr')!
                return Array.from(row.querySelectorAll('td'))
                  .find((cell) => cell.classList.contains(columnClass))
                  ?.textContent?.trim()
              })
            )
          )
          .toEqual(expected)
      }
      const auxiliaryHeader = headers.getByText('辅助数量', { exact: true }).first()
      const auxiliaryClass = await auxiliaryHeader.evaluate((element) =>
        Array.from(element.closest('th')!.classList).find((value) =>
          /^el-table_.*_column_/.test(value)
        )!
      )
      const auxiliaryCell = table
        .locator('.el-table__body tr')
        .first()
        .locator(`td.${auxiliaryClass}`)
      await auxiliaryCell.scrollIntoViewIfNeeded()
      await expect
        .poll(async () => {
          const headerBounds = await auxiliaryHeader.locator('xpath=ancestor::th[1]').boundingBox()
          const cellBounds = await auxiliaryCell.boundingBox()
          return Math.abs(headerBounds!.x - cellBounds!.x)
        })
        .toBeLessThanOrEqual(1)

      await page.screenshot({
        path: testInfo.outputPath('report-summary-auxiliary.png'),
        animations: 'disabled'
      })
      await summary.hover()
      await summary.locator('.el-select__clear').click()
      await expect(headers.getByText('辅助单位', { exact: true })).toHaveCount(0)
      await expect(headers.getByText('辅助单位(2)', { exact: true })).toHaveCount(0)
      await expect(headers.getByText('库存单位', { exact: true })).toHaveCount(1)
      await expect(headers.getByText('基本单位', { exact: true })).toHaveCount(1)
      await expect(headers.getByText('辅助数量', { exact: true })).toHaveCount(0)
      await expect(headers.getByText('辅助数量(2)', { exact: true })).toHaveCount(0)
      expect(await headers.getByText('库存数量', { exact: true }).count()).toBeGreaterThan(0)
      expect(await headers.getByText('基本数量', { exact: true }).count()).toBeGreaterThan(0)
      expect(requests.length).toBe(beforeSummary)
      await page.getByRole('button', { name: '重置', exact: true }).click()
      await expect(summary.getByText('库存数量', { exact: true })).toBeVisible()
      await summary.scrollIntoViewIfNeeded()
      await page.screenshot({
        path: testInfo.outputPath('report-summary-reset.png'),
        animations: 'disabled'
      })
      if (authority === 'ordinary') {
        expect(requests.length).toBeGreaterThan(5)
        for (const request of requests) expect(request.p_tenant_id).toBe(tenantId)
        expect(locationRequests.length).toBeGreaterThanOrEqual(9)
        for (const url of locationRequests)
          expect(new URL(url).searchParams.get('tenant_id')).toBe(`eq.${tenantId}`)
        await expect(page.getByRole('button', { name: '全部租户', exact: true })).toHaveCount(0)
      }
    })
  }
}
