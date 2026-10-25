import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(150_000)

const scenarios = [
  [
    'inbound-business/other-inbound',
    'WmsOtherInbound',
    '其他入库单',
    'wms_purchase_document',
    'wms_purchase_document_list',
    'purchase_document',
    'other_return'
  ],
  [
    'outbound-business/other-outbound',
    'WmsOtherOutbound',
    '其他出库单',
    'wms_sales_document',
    'wms_sales_document_list',
    'sales_document',
    'other_return'
  ],
  ...[
    [
      'initialization/initial-purchase-return',
      'WmsInitialPurchaseReturn',
      '期初采购退料单',
      'initial_return'
    ],
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
  ].map(
    ([path, name, title, kind]) =>
      [
        path,
        name,
        title,
        'wms_purchase_document',
        'wms_purchase_document_list',
        'purchase_document',
        kind
      ] as const
  ),
  [
    'initialization/initial-stock',
    'WmsInitialStock',
    '初始库存单',
    'wms_initial_stock_document',
    'wms_initial_stock_document',
    'initial_stock',
    ''
  ],
  [
    'initialization/initial-sales-outbound',
    'WmsInitialSalesOutbound',
    '期初销售出库单',
    'wms_sales_document',
    'wms_sales_document_list',
    'sales_document',
    'initial_outbound'
  ],
  [
    'initialization/initial-purchase-inbound',
    'WmsInitialPurchaseInbound',
    '期初采购入库单',
    'wms_purchase_document',
    'wms_purchase_document_list',
    'purchase_document',
    'initial_inbound'
  ],
  [
    'initialization/initial-sales-return',
    'WmsInitialSalesReturn',
    '期初销售退货单',
    'wms_sales_document',
    'wms_sales_document_list',
    'sales_document',
    'initial_return'
  ],
  [
    'outbound-business/sales-outbound',
    'WmsSalesOutbound',
    '销售出库单',
    'wms_sales_document',
    'wms_sales_document_list',
    'sales_document',
    'outbound'
  ],
  [
    'outbound-business/sales-return',
    'WmsSalesReturnDocument',
    '销售退货单',
    'wms_sales_document',
    'wms_sales_document_list',
    'sales_document',
    'return'
  ],
  [
    'outbound-business/other-outbound',
    'WmsOtherOutbound',
    '其他出库单',
    'wms_sales_document',
    'wms_sales_document_list',
    'sales_document',
    'other_outbound'
  ],
  [
    'production-inout/production-issue',
    'WmsProductionIssue',
    '生产领料单',
    'wms_production_material_document',
    'wms_production_material_list',
    'production_material',
    'issue'
  ],
  [
    'production-inout/production-return',
    'WmsProductionReturn',
    '生产退料单',
    'wms_production_material_document',
    'wms_production_material_list',
    'production_material',
    'return'
  ],
  [
    'production-inout/finished-inbound',
    'WmsFinishedInbound',
    '完工入库单',
    'wms_production_material_document',
    'wms_production_material_list',
    'production_material',
    'finished_inbound'
  ],
  [
    'production-inout/finished-return',
    'WmsFinishedReturn',
    '完工退库单',
    'wms_production_material_document',
    'wms_production_material_list',
    'production_material',
    'finished_return'
  ],
  [
    'transfer-business/transfer-request',
    'WmsTransfer',
    '调拨申请单',
    'wms_transfer_request_document',
    'wms_transfer_request_list',
    'transfer_request',
    ''
  ],
  [
    'count-business/count-gain',
    'WmsCountGain',
    '盘盈单',
    'wms_count_adjustment_document',
    'wms_count_adjustment_list',
    'count_adjustment',
    'gain'
  ],
  [
    'count-business/count-loss',
    'WmsCountLoss',
    '盘亏单',
    'wms_count_adjustment_document',
    'wms_count_adjustment_list',
    'count_adjustment',
    'loss'
  ],
  [
    'outbound-business/outbound-request',
    'WmsIssueRequest',
    '出库申请单',
    'wms_issue_request',
    'wms_issue_request_list',
    'issue_request',
    ''
  ]
] as const

for (const [path, name, title, table, list, rpc, kind] of scenarios) {
  for (const authority of ['super', 'ordinary']) {
    test(`${authority}${title}删除检查失败、重试与并发引用阻止删除-${kind}`, async ({
      page
    }, testInfo) => {
      const tenant = await prepareIsolatedSession(page)
      if (authority === 'ordinary')
        await page.route('**/rest/v1/rpc/current_is_super', (route) =>
          route.fulfill({ json: false })
        )
      const menu = {
        id: `test-${name}`,
        parentId: null,
        name,
        path: `/wms/${path}`,
        component: `/wms/${path}`,
        type: 'menu',
        sort: 1,
        meta: { title, is_enable: true, is_hide: false, roles: [] }
      }
      await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
        route.fulfill({
          json: [{ code: 'wms', name: 'WMS仓储管理', baseUrl: '/wms/' }]
        })
      )
      await mockApplicationMenus(page, {
        wms: [
          menu,
          ...['View', 'Delete'].map((action) => ({
            ...menu,
            id: `${name}-${action}`,
            parentId: menu.id,
            name: `${name}:${action}`,
            type: 'button',
            path: '',
            component: ''
          }))
        ]
      })
      const id = '00000000-0000-4000-8000-000000000001'
      const row = {
        id,
        document_id: id,
        line_id: 'test-line',
        tenant_id: tenant.id,
        document_no: 'WMS-TEST-001',
        business_date: '2026-10-05',
        status: 'draft',
        material_status: 'pending',
        request_type: 'consumables_outbound',
        kind,
        line_no: 1,
        quantity: 1,
        amount: 0,
        material_code: 'TEST-M01',
        material_description: '测试物料',
        lines: [
          {
            id: 'test-line',
            line_no: 1,
            opening_quantity: 1,
            material: { code: 'TEST-M01', name: '测试物料' }
          }
        ]
      }
      const retainedRow = {
        ...row,
        id: '00000000-0000-4000-8000-000000000002',
        document_id: '00000000-0000-4000-8000-000000000002',
        line_id: 'retained-line',
        document_no: 'WMS-TEST-002'
      }
      let deleted = false
      if (table === 'wms_purchase_document') {
        await page.route('**/rest/v1/wms_purchase_document?*', (route) =>
          route.fulfill({
            json: deleted ? [{ id: retainedRow.id }] : [{ id }, { id: retainedRow.id }],
            headers: {
              'content-range': deleted ? '0-0/1' : '0-1/2',
              'access-control-expose-headers': 'content-range'
            }
          })
        )
      }
      await page.route(`**/rest/v1/${list}?*`, (route) =>
        route.fulfill({
          headers: {
            'content-range': deleted ? '0-0/1' : '0-1/2',
            'access-control-expose-headers': 'content-range'
          },
          json: new URL(route.request().url()).searchParams.has('id')
            ? row
            : deleted
              ? [retainedRow]
              : [row, retainedRow]
        })
      )
      let failure = true
      let blocked = true
      let checks = 0
      let deletes = 0
      await page.route('**/rest/v1/rpc/get_record_delete_dependency_details?**', (route) => {
        checks++
        expect(route.request().postDataJSON()).toMatchObject({ p_table: table, p_ids: [id] })
        if (failure)
          return route.fulfill({
            status: 503,
            json: { code: 'XX000', message: '测试关联检查失败' }
          })
        const ownedLines =
          table === 'wms_issue_request'
            ? [
                {
                  resourceId: id,
                  sourceTable: 'wms_issue_request_line',
                  recordId: 'test-line',
                  targetId: 'test-line',
                  recordNo: '测试申请明细',
                  recordStatus: 'draft',
                  createdAt: '2026-10-05'
                }
              ]
            : []
        return route.fulfill({
          json: blocked
            ? [
                {
                  resourceId: id,
                  sourceTable:
                    table === 'wms_issue_request'
                      ? 'wms_issue_request_allocation'
                      : 'wms_inventory_movement',
                  recordId: 'test-movement',
                  targetId: 'test-movement',
                  recordNo: 'MOVEMENT-TEST-001',
                  recordSummary: '测试并发引用',
                  recordStatus: 'approved',
                  createdAt: '2026-10-05'
                }
              ]
            : ownedLines
        })
      })
      await page.route('**/rest/v1/wms_issue_request_allocation?*', (route) =>
        route.fulfill({
          json: [
            {
              id: 'test-movement',
              request_id: id,
              batch_id: 'test-batch',
              quantity: 2,
              batch: { batch_no: 'BATCH-TEST-001' },
              movement: { reference_no: 'MOVEMENT-TEST-001' }
            }
          ]
        })
      )
      const deleteRpc =
        table === 'wms_issue_request'
          ? 'wms_delete_issue_request_secure'
          : `wms_change_${rpc}_status_secure`
      await page.route(`**/rest/v1/rpc/${deleteRpc}`, (route) => {
        deletes++
        expect(route.request().postDataJSON()).toMatchObject(
          table === 'wms_issue_request'
            ? { p_request_id: id }
            : { p_document_id: id, p_action: 'delete' }
        )
        if (deletes > 1) {
          deleted = true
          return route.fulfill({ json: { id } })
        }
        blocked = true
        return route.fulfill({
          status: 400,
          json: { code: '23503', message: '测试期间新增了业务引用' }
        })
      })
      await page.goto(`#/wms/${path}`)
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible({
        timeout: 90_000
      })
      const remove = async () => {
        if (table === 'wms_issue_request') {
          await page
            .locator('.el-table__body-wrapper')
            .getByRole('button', { name: '删除', exact: true })
            .first()
            .click()
          return
        }
        const more = page
          .locator('.el-table__body-wrapper')
          .getByRole('button', { name: '更多操作' })
          .first()
        await more.click()
        await page.getByRole('menuitem', { name: /删除/ }).click()
      }
      await remove()
      await expect(page.getByText('关联资料未完成核验，删除已停止')).toBeVisible()
      expect(deletes).toBe(0)
      failure = false
      await page.getByRole('button', { name: '重新检查', exact: true }).click()
      await expect(page.getByText('MOVEMENT-TEST-001', { exact: true })).toBeVisible()
      expect(deletes).toBe(0)
      await page.getByRole('button', { name: '关闭', exact: true }).click()
      blocked = false
      await remove()
      await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()
      expect(deletes).toBe(0)
      await remove()
      const previousChecks = checks
      await page
        .getByRole('dialog')
        .getByRole('button', {
          name: table === 'wms_issue_request' ? '确认删除' : '确定删除',
          exact: true
        })
        .click()
      await expect(page.getByText('MOVEMENT-TEST-001', { exact: true })).toBeVisible()
      expect(deletes).toBe(1)
      if (
        [
          'wms_production_material_document',
          'wms_count_adjustment_document',
          'wms_sales_document',
          'wms_purchase_document'
        ].includes(table)
      )
        await expect(
          page.getByRole('heading', {
            name: `暂时无法删除${kind === 'other_return' ? (title === '其他入库单' ? '其他入库退回单' : '其他出库退回单') : title}`,
            exact: true
          })
        ).toBeVisible()
      expect(checks).toBeGreaterThan(previousChecks)
      await page.screenshot({
        path: testInfo.outputPath('wms-delete-blocked.png'),
        animations: 'disabled'
      })
      if (table !== 'wms_issue_request') {
        await page.getByRole('button', { name: '关闭', exact: true }).click()
        blocked = false
        await remove()
        await page
          .getByRole('dialog')
          .getByRole('button', { name: '确定删除', exact: true })
          .click()
        await expect.poll(() => deletes).toBe(2)
        await expect(
          page.locator('.el-table__body tr').filter({ hasText: 'WMS-TEST-001' })
        ).toHaveCount(0)
        await expect(page.getByRole('dialog')).toHaveCount(0)
        await expect(
          page.locator('.el-table__body tr').filter({ hasText: 'WMS-TEST-002' })
        ).toHaveCount(1)
        await page.screenshot({
          path: testInfo.outputPath('wms-delete-success-empty.png'),
          animations: 'disabled'
        })
      }
      if (table === 'wms_issue_request') {
        await expect(
          page.getByText('批次 BATCH-TEST-001 · 已出库 2 · 已出库', { exact: true })
        ).toBeVisible()
        await page.getByRole('button', { name: '查看关联', exact: true }).click()
        await expect(page.getByRole('heading', { name: '领料申请详情', exact: true })).toBeVisible()
        await expect(page.getByText('申请信息', { exact: true })).toBeVisible()
        await page
          .getByRole('dialog', { name: '领料申请详情', exact: true })
          .getByRole('button', { name: /关闭.*对话框|Close this dialog/ })
          .click()
        await expect(page.getByRole('dialog')).toHaveCount(0)
        await expect(
          page.locator('.el-table__body tr').filter({ hasText: 'WMS-TEST-002' })
        ).toHaveCount(1)
        blocked = false
        await remove()
        await page
          .getByRole('dialog')
          .getByRole('button', { name: '确认删除', exact: true })
          .click()
        await expect.poll(() => deletes).toBe(2)
        await expect(
          page.locator('.el-table__body tr').filter({ hasText: 'WMS-TEST-001' })
        ).toHaveCount(0)
        await expect(page.getByRole('dialog')).toHaveCount(0)
        await page.screenshot({
          path: testInfo.outputPath('wms-delete-success-empty.png'),
          animations: 'disabled'
        })
      }
    })
  }
}
