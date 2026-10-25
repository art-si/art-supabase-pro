import { expect, test } from '@playwright/test'
import { installFixtures, meta, tenantId } from './support/inventory-fixtures'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })
for (const permission of [
  'workflow',
  'viewonly',
  'submitonly',
  'approveonly',
  'push',
  'import'
] as const) {
  for (const [path, name, title, table, rpc, kind] of [
    ...[
      [
        'initialization/initial-sales-outbound',
        'WmsInitialSalesOutbound',
        '期初销售出库单',
        'initial_outbound'
      ],
      [
        'initialization/initial-sales-return',
        'WmsInitialSalesReturn',
        '期初销售退货单',
        'initial_return'
      ],
      ['outbound-business/sales-outbound', 'WmsSalesOutbound', '销售出库单', 'outbound'],
      ['outbound-business/sales-return', 'WmsSalesReturnDocument', '销售退货单', 'return'],
      ['outbound-business/other-outbound', 'WmsOtherOutbound', '其他出库单', 'other_outbound']
    ].map(([path, name, title, kind]) => [
      path,
      name,
      title,
      'wms_sales_document_list',
      'wms_change_sales_document_status_secure',
      kind
    ]),
    ...(permission === 'import' || permission === 'viewonly'
      ? ([
          [
            'production-inout/production-issue',
            'WmsProductionIssue',
            '生产领料单',
            'wms_production_material_list',
            'wms_change_production_material_status_secure',
            'issue'
          ],
          [
            'production-inout/production-return',
            'WmsProductionReturn',
            '生产退料单',
            'wms_production_material_list',
            'wms_change_production_material_status_secure',
            'return'
          ],
          [
            'production-inout/finished-inbound',
            'WmsFinishedInbound',
            '完工入库单',
            'wms_production_material_list',
            'wms_change_production_material_status_secure',
            'finished_inbound'
          ]
        ] as const)
      : []),
    ...[
      [
        'initialization/initial-purchase-inbound',
        'WmsInitialPurchaseInbound',
        '期初采购入库单',
        'initial_inbound'
      ],
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
    ].map(([path, name, title, kind]) => [
      path,
      name,
      title,
      'wms_purchase_document_list',
      'wms_change_purchase_document_status_secure',
      kind
    ]),
    [
      'count-business/count-gain',
      'WmsCountGain',
      '盘盈单',
      'wms_count_adjustment_list',
      'wms_change_count_adjustment_status_secure',
      'gain'
    ],
    [
      'count-business/count-loss',
      'WmsCountLoss',
      '盘亏单',
      'wms_count_adjustment_list',
      'wms_change_count_adjustment_status_secure',
      'loss'
    ],
    [
      'transfer-business/transfer-request',
      'WmsTransfer',
      '调拨申请单',
      'wms_transfer_request_list',
      'wms_change_transfer_request_status_secure',
      ''
    ]
  ] as const) {
    const tradeDocument =
      table === 'wms_sales_document_list' || table === 'wms_purchase_document_list'
    if (tradeDocument && permission === 'push') continue
    if (permission === 'push' && name !== 'WmsTransfer') continue
    test(`${permission}${title}普通用户两张单据${permission === 'workflow' ? '提交审核取消及失败重试' : '流程权限组合'}`, async ({
      page
    }, testInfo) => {
      test.setTimeout(120_000)
      await installFixtures(page)
      await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: false }))
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
            id: 'flow-menu',
            parentId: null,
            name,
            path: `/wms/${path}`,
            component: `/wms/${path}`,
            type: 'menu',
            sort: 1,
            meta: meta(title)
          },
          ...(permission === 'import'
            ? ['View', 'Import']
            : permission === 'push'
              ? ['View', 'Push']
              : permission === 'workflow'
                ? ['View', 'Submit', 'Approve']
                : permission === 'viewonly'
                  ? ['View']
                  : ['View', permission === 'submitonly' ? 'Submit' : 'Approve']
          ).map((action) => ({
            id: `flow-${action}`,
            parentId: 'flow-menu',
            name: `${name}:${action}`,
            path: '',
            component: '',
            type: 'button',
            sort: 1,
            meta: meta(action)
          })),
          ...(permission === 'push'
            ? (['direct', 'step'] as const).flatMap((targetKind) => {
                const targetName = targetKind === 'direct' ? 'WmsDirectTransfer' : 'WmsStepTransfer'
                const targetPath = `transfer-business/${targetKind}-transfer`
                return [
                  {
                    id: `flow-${targetName}`,
                    parentId: null,
                    name: targetName,
                    path: `/wms/${targetPath}`,
                    component: `/wms/${targetPath}`,
                    type: 'menu' as const,
                    sort: 2,
                    meta: meta(targetName)
                  },
                  ...(['View', 'Create'] as const).map((action) => ({
                    id: `flow-${targetName}-${action}`,
                    parentId: `flow-${targetName}`,
                    name: `${targetName}:${action}`,
                    path: '',
                    component: '',
                    type: 'button' as const,
                    sort: 1,
                    meta: meta(action)
                  }))
                ]
              })
            : [])
        ]
      })
      const states = new Map(
        [1, 2].map((n) => [
          `flow-doc-${n}`,
          permission === 'push'
            ? 'approved'
            : permission !== 'workflow' && n === 2
              ? 'submitted'
              : 'draft'
        ])
      )
      if (table === 'wms_purchase_document_list') {
        await page.route('**/rest/v1/wms_purchase_document?*', (route) => {
          expect(new URL(route.request().url()).searchParams.get('tenant_id')).toBe(
            `eq.${tenantId}`
          )
          return route.fulfill({
            json: [1, 2].map((n) => ({ id: `flow-doc-${n}`, kind })),
            headers: { 'content-range': '0-1/2', 'access-control-expose-headers': 'content-range' }
          })
        })
      }
      await page.route(`**/rest/v1/${table}?*`, (route) =>
        route.fulfill({
          json: [1, 2].map((n) => ({
            document_id: `flow-doc-${n}`,
            line_id: `flow-line-${n}`,
            tenant_id: tenantId,
            document_no: `FLOW-DOC-${n}`,
            status: states.get(`flow-doc-${n}`),
            material_status: 'pending',
            pushed_at: pushed.has(`flow-doc-${n}`) ? '2026-10-06T00:00:00Z' : null,
            pushed_document_id: pushed.has(`flow-doc-${n}`) ? `target-doc-${n}` : null,
            business_date: '2026-10-06',
            kind,
            line_no: 10,
            quantity: 2,
            variance_quantity: kind === 'loss' ? -2 : 2,
            requested_quantity: 2,
            material_code: 'FLOW-MAT',
            material_description: '流程测试物料'
          })),
          headers: { 'content-range': '0-1/2', 'access-control-expose-headers': 'content-range' }
        })
      )
      let rejected = true
      const writes: Array<{ p_document_id: string; p_action: string }> = []
      await page.route(`**/rpc/${rpc}`, (route) => {
        const payload = route.request().postDataJSON()
        writes.push(payload)
        if (rejected)
          return route.fulfill({
            status: 400,
            json: { code: 'P0001', message: '测试流程办理失败' }
          })
        states.set(payload.p_document_id, payload.p_action === 'submit' ? 'submitted' : 'approved')
        return route.fulfill({ json: null })
      })
      const pushed = new Set<string>()
      const pushWrites: Array<{ p_request_id: string; p_kind: string; p_line_ids: string[] }> = []
      let releasePush: (() => void) | undefined
      let pushFailed = true
      let holdPush = true
      await page.route(
        '**/rpc/wms_create_transfer_business_grouped_from_request_secure',
        async (route) => {
          const payload = route.request().postDataJSON()
          pushWrites.push(payload)
          if (holdPush)
            await new Promise<void>((resolve) => {
              releasePush = resolve
            })
          if (pushFailed)
            return route.fulfill({ status: 400, json: { code: 'P0001', message: '测试下推失败' } })
          pushed.add(payload.p_request_id)
          const suffix = payload.p_request_id.slice(-1)
          return route.fulfill({
            json: [
              ...(suffix === '2'
                ? [
                    {
                      id: 'target-doc-2a',
                      documentNo: 'TARGET-DOC-2A',
                      sourceOrganizationName: '来源组织',
                      targetOrganizationName: '同组织目标',
                      lineCount: 1
                    }
                  ]
                : []),
              {
                id: `target-doc-${suffix}`,
                documentNo: `TARGET-DOC-${suffix}`,
                sourceOrganizationName: '来源组织',
                targetOrganizationName: suffix === '2' ? '跨组织目标' : '目标组织',
                lineCount: 1
              }
            ]
          })
        }
      )
      if (permission === 'push') {
        await page.route('**/rest/v1/sys_menu?*', (route) =>
          route.fulfill({ json: { id: 'flow-menu' } })
        )
        await page.route('**/rest/v1/wms_transfer_business_list?*', (route) => {
          const filter = new URL(route.request().url()).searchParams.get('document_id')
          const id = filter?.replace('eq.', '')
          const n = id?.slice(-1)
          if (!id || !n) return route.fulfill({ json: [] })
          return route.fulfill({
            json: [
              {
                id,
                document_id: id,
                line_id: `target-line-${n}`,
                tenant_id: tenantId,
                kind: n === '1' ? 'direct' : 'step',
                document_no: `TARGET-DOC-${n}`,
                document_type_id: 'flow-type',
                business_type_id: 'flow-business',
                business_date: '2026-10-15',
                source_organization_id: 'flow-org',
                target_organization_id: 'flow-org',
                status: 'draft',
                line: {
                  id: `target-line-${n}`,
                  line_no: 10,
                  material_id: 'flow-material',
                  source_batch_id: null,
                  quantity: 2,
                  inventory_unit_id: 'flow-unit',
                  source_organization_id: 'flow-org',
                  source_warehouse_id: 'flow-source-warehouse',
                  target_organization_id: 'flow-org',
                  target_warehouse_id: 'flow-target-warehouse',
                  owner_type: 'self',
                  stock_type: 'normal',
                  stock_status: 'available',
                  serial_ids: [],
                  returned_quantity: 0
                },
                material_code: 'FLOW-MAT',
                material_description: '流程测试物料',
                source_warehouse_name: '来源仓库',
                target_warehouse_name: '目标仓库',
                document_type_name: '标准调拨',
                business_type_name: '转储'
              }
            ]
          })
        })
      }
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(`#/wms/${path}`, { waitUntil: 'domcontentloaded' })
      await expect(page.getByText('FLOW-DOC-1', { exact: true })).toBeVisible({ timeout: 60_000 })
      if (permission === 'import') {
        await expect(page.getByRole('button', { name: `新增${title}`, exact: true })).toHaveCount(0)
        if (tradeDocument) {
          await page.route('**/rest/v1/mdm_organization?*', (route) =>
            route.fulfill({
              json: [
                {
                  id: 'import-organization',
                  tenant_id: tenantId,
                  organization_code: 'IMPORT-ORG',
                  organization_name: '导入测试库存组织',
                  organization_type: 'company',
                  status: '1',
                  initialization: {
                    enabled_on: '2026-01-01',
                    is_default: true,
                    initialization_closed_at: kind.startsWith('initial_') ? null : '2026-01-02'
                  }
                }
              ],
              headers: {
                'content-range': '0-0/1',
                'access-control-expose-headers': 'content-range'
              }
            })
          )
        }
        await page.route('**/rest/v1/sys_menu?*', (route) =>
          route.fulfill({ json: { id: 'flow-menu' } })
        )
        await page.getByRole('button', { name: '导入', exact: true }).click()
        const drawer = page.getByRole('dialog', { name: `新增${title}`, exact: true })
        await expect(
          drawer.getByText(
            table === 'wms_production_material_list'
              ? /先选择仓库.*点击“导入明细”.*必填列为物料编码/
              : tradeDocument
                ? /先选择库存组织及.*点击“导入明细”/
                : /先核对.*再在“物料明细”点击“导入明细”/
          )
        ).toBeVisible()
        await expect(drawer.getByRole('button', { name: '导入明细', exact: true })).toBeEnabled()
        await page.screenshot({
          path: testInfo.outputPath('menu-import-guidance.png'),
          animations: 'disabled'
        })
        await drawer.getByRole('button', { name: '取消', exact: true }).click()
        expect(writes).toHaveLength(0)
        expect(errors).toEqual([])
        return
      }
      if (permission === 'push') {
        await page.getByText('按明细', { exact: true }).click()
        const firstLine = page.locator('.el-table__body tr').filter({ hasText: 'FLOW-DOC-1' })
        await firstLine.locator('.el-checkbox').first().click()
        await page.getByRole('button', { name: '下推所选明细', exact: true }).click()
        const selectedDialog = page.getByRole('dialog', { name: '下推调拨申请', exact: true })
        await expect(selectedDialog).toContainText('已选 1 行')
        await selectedDialog.getByRole('button', { name: '关闭此对话框', exact: true }).click()
        await page.getByText('按单据', { exact: true }).click()
        for (const [n, mode, label] of [
          [1, 'direct', '直接调拨'],
          [2, 'in_transit', '调出在途']
        ] as const) {
          const row = page.locator('.el-table__body tr').filter({ hasText: `FLOW-DOC-${n}` })
          const openPush = async () => {
            await row.getByRole('button', { name: '更多操作', exact: true }).click()
            await page.getByRole('menuitem', { name: '下推调拨', exact: true }).click()
          }
          await openPush()
          const dialog = page.getByRole('dialog', { name: '下推调拨申请', exact: true })
          await expect(dialog).toContainText(`FLOW-DOC-${n}`)
          await dialog.getByRole('button', { name: '关闭此对话框', exact: true }).click()
          await expect(dialog).toBeHidden()
          expect(pushWrites).toHaveLength((n - 1) * 2)
          await openPush()
          pushFailed = true
          holdPush = true
          await dialog.getByRole('button', { name: label, exact: true }).click()
          await expect.poll(() => pushWrites.length).toBe((n - 1) * 2 + 1)
          await expect(dialog.getByRole('button', { name: '直接调拨', exact: true })).toBeDisabled()
          await expect(dialog.getByRole('button', { name: '调出在途', exact: true })).toBeDisabled()
          releasePush?.()
          await expect(page.getByText('测试下推失败', { exact: true }).first()).toBeVisible()
          await expect(dialog.getByRole('button', { name: label, exact: true })).toBeEnabled()
          await page.screenshot({
            path: testInfo.outputPath(`push-${mode}-error.png`),
            animations: 'disabled'
          })
          pushFailed = false
          holdPush = false
          await dialog.getByRole('button', { name: label, exact: true }).click()
          await expect(dialog).toBeHidden()
          if (n === 2) {
            const resultDialog = page.getByRole('dialog', { name: '已生成调拨单', exact: true })
            await expect(resultDialog).toContainText('生成 2 张暂存单')
            await expect(resultDialog).toContainText('TARGET-DOC-2A')
            await expect(resultDialog).toContainText('同组织目标')
            await expect(resultDialog).toContainText('TARGET-DOC-2')
            await expect(resultDialog).toContainText('跨组织目标')
            await page.screenshot({
              path: testInfo.outputPath('push-step-grouped-result.png'),
              animations: 'disabled'
            })
            await resultDialog
              .getByText('TARGET-DOC-2', { exact: true })
              .locator('../..')
              .getByRole('button', { name: '打开单据' })
              .click()
          }
          await expect.poll(() => pushWrites.length).toBe(n * 2)
          expect(pushWrites[n * 2 - 1]).toEqual(pushWrites[n * 2 - 2])
          expect(pushWrites[n * 2 - 1]).toEqual({
            p_request_id: `flow-doc-${n}`,
            p_kind: mode === 'direct' ? 'direct' : 'step',
            p_line_ids: []
          })
          await expect(page).toHaveURL(
            new RegExp(
              `transfer-business/${mode === 'direct' ? 'direct-transfer' : 'step-transfer'}`
            )
          )
          const targetDrawer = page.getByRole('dialog', {
            name: n === 1 ? '编辑直接调拨单' : '编辑分步调拨单',
            exact: true
          })
          await expect(targetDrawer).toBeVisible()
          await expect(targetDrawer.getByText('流程测试物料', { exact: true })).toBeVisible()
          await targetDrawer.getByRole('button', { name: '取消', exact: true }).click()
          await page.goto(`#/wms/${path}`, { waitUntil: 'domcontentloaded' })
          await expect(row.getByRole('button', { name: '更多操作', exact: true })).toBeVisible()
          await row.getByRole('button', { name: '更多操作', exact: true }).click()
          await expect(
            page.getByRole('menuitem', { name: '下推（明细已处理）', exact: true })
          ).toBeDisabled()
          await page.keyboard.press('Escape')
        }
        expect(errors).toEqual([])
        return
      }
      if (permission !== 'workflow') {
        await expect(page.getByRole('button', { name: '导入', exact: true })).toHaveCount(0)
        for (const [n, status] of [
          [1, '暂存'],
          [2, '已提交']
        ] as const) {
          const row = page.locator('.el-table__body tr').filter({ hasText: `FLOW-DOC-${n}` })
          await expect(row.getByText(status, { exact: true })).toBeVisible()
          const allowed =
            (permission === 'submitonly' && n === 1) || (permission === 'approveonly' && n === 2)
          const more = row.getByRole('button', { name: '更多操作', exact: true })
          await expect(more).toHaveCount(allowed ? 1 : 0)
          if (allowed) {
            await more.click()
            const label = permission === 'submitonly' ? '提交' : '审核'
            await expect(
              page.locator('.el-dropdown-menu:visible').getByRole('menuitem')
            ).toHaveCount(1)
            await page.getByRole('menuitem', { name: `${label}单据`, exact: true }).click()
            const confirmation = page.locator('.el-message-box')
            await expect(confirmation).toContainText(`FLOW-DOC-${n}`)
            await confirmation.getByRole('button', { name: '取消', exact: true }).click()
          }
        }
        await expect(page.getByRole('button', { name: /^新增/ })).toHaveCount(0)
        expect(writes).toHaveLength(0)
        expect(errors).toEqual([])
        await page.screenshot({
          path: testInfo.outputPath('workflow-viewonly-two-statuses.png'),
          animations: 'disabled'
        })
        return
      }
      for (const n of [1, 2]) {
        const row = page.locator('.el-table__body tr').filter({ hasText: `FLOW-DOC-${n}` })
        for (const [action, label, status] of [
          ['submit', '提交', '已提交'],
          ['approve', '审核', '已审核']
        ] as const) {
          const openAction = async () => {
            await row.getByRole('button', { name: '更多操作', exact: true }).click()
            await page.getByRole('menuitem', { name: `${label}单据`, exact: true }).click()
          }
          const before = writes.length
          await openAction()
          const confirmation = page.locator('.el-message-box')
          await expect(confirmation).toContainText(`FLOW-DOC-${n}`)
          await confirmation.getByRole('button', { name: '取消', exact: true }).click()
          expect(writes).toHaveLength(before)
          rejected = true
          await openAction()
          await confirmation.getByRole('button', { name: `确定${label}`, exact: true }).click()
          await expect(page.getByText('测试流程办理失败', { exact: true }).first()).toBeVisible()
          rejected = false
          await openAction()
          await confirmation.getByRole('button', { name: `确定${label}`, exact: true }).click()
          await expect.poll(() => writes.length).toBe(before + 2)
          expect(writes[before]).toEqual({ p_document_id: `flow-doc-${n}`, p_action: action })
          expect(writes[before + 1]).toEqual(writes[before])
          await expect(row.getByText(status, { exact: true })).toBeVisible()
        }
      }
      expect(writes).toHaveLength(8)
      expect(errors).toEqual([])
      if (!tradeDocument)
        await expect(page.getByText('共 1 项物料 · 未设置单据类型', { exact: true })).toHaveCount(2)
      await expect(page.getByText(/undefined/)).toHaveCount(0)
      await page.screenshot({
        path: testInfo.outputPath('workflow-two-approved.png'),
        animations: 'disabled'
      })
    })
  }
}
