import { expect, test } from '@playwright/test'
test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(90000)
const tenant = '11111111-1111-4111-8111-111111111111'
const org = '33333333-3333-4333-8333-333333333333'
const kinds = [
  'purchase_inbound',
  'purchase_return',
  'other_inbound',
  'entrusted_processing_inbound',
  'entrusted_processing_return'
] as const
for (const kind of kinds) {
  test(`${kind} 两条单据、参选、打印和暂存`, async ({ page }, info) => {
    const returned = kind.endsWith('_return')
    const entrusted = kind.startsWith('entrusted')
    const otherInbound = kind === 'other_inbound'
    const titles = {
      purchase_inbound: '采购入库单',
      purchase_return: '采购退货单',
      other_inbound: '其他入库单',
      entrusted_processing_inbound: '受托加工材料入库单',
      entrusted_processing_return: '受托加工材料退料单'
    }
    const materials = [1, 2, 3].map((n) => ({
      id: `material-${n}`,
      tenant_id: tenant,
      code: `MAT-${n}`,
      name: `项目物料${n}`,
      description: `项目物料${n}`,
      specification_model: 'M16',
      inventory_unit_id: 'unit',
      base_unit_id: 'unit',
      unit_conversions: [],
      serial_management_enabled: false,
      batch_management_enabled: false
    }))
    const documents = [1, 2].map((n) => ({
      id: `document-${n}`,
      tenant_id: tenant,
      organization_id: org,
      kind,
      document_no: `QA-${kind}-${n}`,
      document_type_id: 'type',
      business_type_id: 'business',
      business_date: '2026-10-10',
      status: 'draft',
      supplier_id: entrusted ? null : 'supplier',
      customer_id: entrusted ? 'customer' : null,
      warehouse_id: 'warehouse',
      supplier: { supplier_name: '测试供应商', supplier_code: 'SUP' },
      customer: { customer_name: '项目委托客户', customer_code: 'CUS' },
      remark: '机房装修项目材料',
      lines: [
        {
          id: `line-${n}`,
          tenant_id: tenant,
          document_id: `document-${n}`,
          line_no: 10,
          material_id: materials[0].id,
          material: materials[0],
          project_id: entrusted || otherInbound ? 'project' : null,
          project:
            entrusted || otherInbound ? { id: 'project', name: '机房装修工程', code: 'PJ' } : null,
          construction_no: null,
          inventory_unit_id: 'unit',
          base_unit_id: 'unit',
          quantity: returned ? -2 : 2,
          base_quantity: returned ? -2 : 2,
          unit_price: 10,
          tax_rate: 13,
          tax_inclusive_unit_price: 11.3,
          amount: returned ? -20 : 20,
          tax_amount: returned ? -2.6 : 2.6,
          total_amount: returned ? -22.6 : 22.6,
          warehouse_id: 'warehouse',
          stock_type: 'normal',
          stock_status: 'available',
          owner_type: entrusted ? 'customer' : 'self',
          owner_id: entrusted ? 'customer' : null,
          gift: false,
          discount_method: 'none',
          unit_discount_rate: 0,
          serial_nos: [],
          batch_no: `BATCH-${n}`
        }
      ]
    }))
    const list = documents.map((d) => ({
      document_id: d.id,
      line_id: d.lines[0].id,
      tenant_id: tenant,
      organization_id: org,
      kind,
      document_no: d.document_no,
      line_no: 10,
      status: d.status,
      business_date: d.business_date,
      document_type: { document_type_name: titles[kind] },
      business_type: { business_type_name: '标准业务' },
      supplier_name: '测试供应商',
      customer_name: '项目委托客户',
      project_name: entrusted ? '机房装修工程' : null,
      material_code: 'MAT-1',
      material_description: '项目物料1',
      inventory_unit_name: '件',
      base_unit_name: '件',
      quantity: d.lines[0].quantity,
      base_quantity: d.lines[0].quantity,
      unit_price: 10,
      amount: d.lines[0].amount,
      tax_amount: d.lines[0].tax_amount,
      total_amount: d.lines[0].total_amount,
      warehouse_name: '原材料仓',
      batch_no: 'BATCH-1'
    }))
    const records: Record<string, unknown> = {
      mdm_organization: [
        {
          id: org,
          tenant_id: tenant,
          organization_name: '测试库存组织',
          organization_code: 'ORG',
          organization_type: 'company',
          status: '1',
          initialization: {
            organization_id: org,
            enabled_on: '2026-10-01',
            initialization_closed_at: '2026-10-02',
            is_default: true
          }
        }
      ],
      wms_inventory_initialization: [
        {
          organization_id: org,
          enabled_on: '2026-10-01',
          initialization_closed_at: '2026-10-02',
          is_default: true
        }
      ],
      mdm_warehouse: [
        {
          id: 'warehouse',
          tenant_id: tenant,
          organization_id: org,
          warehouse_code: 'WH',
          warehouse_name: '原材料仓',
          status: 'enabled'
        }
      ],
      mdm_unit_of_measure: [{ id: 'unit', tenant_id: tenant, unit_code: 'EA', unit_name: '件' }],
      mdm_project: [
        { id: 'project', tenant_id: tenant, project_code: 'PJ', project_name: '机房装修工程' }
      ],
      mdm_supplier: [
        { id: 'supplier', tenant_id: tenant, supplier_name: '测试供应商', supplier_code: 'SUP' }
      ],
      mdm_customer: [
        { id: 'customer', tenant_id: tenant, customer_name: '项目委托客户', customer_code: 'CUS' }
      ],
      mdm_material: materials,
      mdm_document_type: [
        {
          id: 'type',
          tenant_id: tenant,
          document_type_code: 'TYPE',
          document_type_name: titles[kind],
          menu_ids: ['menu'],
          enabled: true,
          is_default: true
        },
        ...(otherInbound
          ? [
              {
                id: 'return-type',
                tenant_id: tenant,
                document_type_code: 'WE34',
                document_type_name: '标准其他入库退回单',
                menu_ids: ['menu'],
                enabled: true,
                is_default: false
              }
            ]
          : [])
      ],
      mdm_business_type: [
        {
          id: 'business',
          tenant_id: tenant,
          business_type_code: 'BUS',
          business_type_name: '标准业务',
          stock_movement: 'inbound',
          document_type_ids: ['type'],
          menu_ids: ['menu'],
          enabled: true,
          is_default: true
        },
        ...(otherInbound
          ? [
              {
                id: 'return-business',
                tenant_id: tenant,
                business_type_code: 'M105',
                business_type_name: '其他入库退回',
                stock_movement: 'outbound',
                document_type_ids: ['return-type'],
                menu_ids: ['menu'],
                enabled: true,
                is_default: true
              }
            ]
          : [])
      ],
      mdm_project_construction: [{ construction_no: 'SG-01', section_name: '机房区域' }]
    }
    const saves: Array<{
      p_payload: {
        kind: string
        document_type_id: string
        business_type_id: string
        lines: Array<{ construction_no: string | null; source_line_no: string | null }>
        warehouse_id: string
      }
    }> = []
    const stockRequests: Array<{ p_warehouse_id: string; p_kind: string }> = []
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.route('**/rest/v1/**', (route) => {
      const url = new URL(route.request().url())
      const name = url.pathname.split('/').at(-1)
      let data: unknown = records[name || ''] ?? []
      if (name === 'sys_menu') data = { id: 'menu' }
      if (name === 'wms_purchase_source_picker_secure')
        data = {
          data: [2, 3].map((n) => ({
            id: `source-line-${n}`,
            line_id: `source-line-${n}`,
            document_id: 'source-order',
            document_no: 'PO-202610-001',
            document_type: '采购订单',
            line_no: n * 10,
            material_code: `MAT-${n}`,
            material_description: `项目物料${n}`,
            quantity: 10,
            unit: '件',
            received_quantity: 3,
            unreceived_quantity: 7,
            delivered_quantity: 5,
            undelivered_quantity: 5,
            unit_price: 10,
            tax_rate: 13,
            total_amount: 113,
            supplier_name: '测试供应商'
          })),
          total: 2
        }
      if (name === 'scm_prepare_purchase_inbound_secure')
        data = [{ target_id: 'target', source_line_ids: ['source-line-2', 'source-line-3'] }]
      if (name === 'scm_order_target_document')
        data = {
          id: 'target',
          tenant_id: tenant,
          document_no: 'TARGET-001',
          supplier_id: 'supplier',
          status: 'partial',
          source: { document_no: 'PO-202610-001', details: {} }
        }
      if (name === 'scm_order_target_line')
        data = [2, 3].map((n) => ({
          id: `target-line-${n}`,
          source_line_id: `source-line-${n}`,
          line_snapshot: {
            line_no: n * 10,
            material_id: `material-${n}`,
            material_code: `MAT-${n}`,
            material_description: `项目物料${n}`,
            quantity: 10,
            unit: '件',
            unit_price: 10,
            tax_rate: 13,
            warehouse_id: 'warehouse'
          }
        }))
      if (name === 'wms_purchase_order_target_remaining')
        data = [2, 3].map((n) => ({
          target_line_id: `target-line-${n}`,
          ordered_quantity: 10,
          received_quantity: 3,
          remaining_quantity: 7
        }))
      if (name === 'wms_purchase_document')
        data = url.searchParams.get('id')?.startsWith('eq.')
          ? documents.find((d) => d.id === url.searchParams.get('id')?.slice(3))
          : documents.map((d) => ({ id: d.id }))
      if (name === 'wms_purchase_document_list') data = list
      if (name === 'wms_save_purchase_document_secure') {
        saves.push(route.request().postDataJSON())
        data = 'saved-document'
      }
      if (name === 'wms_purchase_return_stock_picker_secure') {
        stockRequests.push(route.request().postDataJSON())
        data = {
          data: materials.map((m, n) => ({
            id: `batch-${n}`,
            material_id: m.id,
            material: m,
            material_code: m.code,
            material_description: m.description,
            specification_model: 'M16',
            project_id: entrusted ? 'project' : null,
            project_name: entrusted ? '机房装修工程' : null,
            construction_no: null,
            quantity: 5,
            available_quantity: 4,
            reserved_quantity: 1,
            inventory_unit_id: 'unit',
            inventory_unit: '件',
            batch_no: `STOCK-${n}`,
            serial_nos: [],
            unit_price: 10,
            amount: 50,
            warehouse_id: 'warehouse',
            warehouse_name: '原材料仓',
            owner_type: entrusted ? 'customer' : 'self',
            owner_id: entrusted ? 'customer' : null,
            stock_type: 'normal',
            stock_status: 'available',
            material_source: '采购入库'
          })),
          total: 3
        }
      }
      return route.fulfill({
        json: data,
        headers: {
          'content-range':
            Array.isArray(data) && data.length ? `0-${data.length - 1}/${data.length}` : '*/0',
          'access-control-expose-headers': 'content-range'
        }
      })
    })
    await page.goto(`/tests/e2e/fixtures/wms-purchase-enhancements.html?kind=${kind}`)
    const rows = page.locator('.el-table__body-wrapper tbody tr')
    await expect(rows).toHaveCount(2)
    await expect(rows.first().getByRole('button', { name: '更多操作', exact: true })).toHaveCount(1)
    await expect(rows.nth(1).getByRole('button', { name: '更多操作', exact: true })).toHaveCount(1)
    await expect(page.getByRole('button', { name: '批量打印', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '承接订单', exact: true })).toHaveCount(0)
    if (otherInbound)
      await expect(page.getByRole('button', { name: '选单', exact: true })).toHaveCount(0)
    await expect(page.locator('th').filter({ hasText: '单据类型' })).toHaveCount(1)
    await expect(page.locator('th').filter({ hasText: '业务类型' })).toHaveCount(1)
    await page.screenshot({ path: info.outputPath(`${kind}-list.png`), fullPage: true })
    await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
    await expect(page.getByRole('heading', { name: titles[kind], exact: true })).not.toBeVisible()
    await page.keyboard.press('Escape')
    await rows.first().getByRole('checkbox').locator('..').click()
    await expect(page.getByRole('button', { name: '批量删除', exact: true })).toBeVisible()
    await expect(
      page
        .locator('.art-table-query__selection-bar')
        .getByRole('button', { name: '批量打印', exact: true })
    ).toBeVisible()
    await rows.nth(1).getByRole('button', { name: '更多操作', exact: true }).click()
    await expect(page.getByRole('menuitem', { name: '导出当前范围', exact: true })).toHaveCount(0)
    await expect(page.getByRole('menuitem', { name: '打印', exact: true })).toBeVisible()
    await expect(
      page.getByRole('menuitem', { name: '删除单据', exact: true }).locator('div')
    ).toHaveAttribute('style', /color: var\(--el-color-danger\)/)
    await page.screenshot({ path: info.outputPath(`${kind}-row-menu.png`), fullPage: true })
    await page.evaluate(() => {
      window.print = () => undefined
    })
    await page.getByRole('menuitem', { name: '打印', exact: true }).click()
    await expect(page.locator('.wms-purchase-print-sheet')).toHaveCount(1)
    await expect(page.locator('.wms-purchase-print-sheet')).toContainText(`QA-${kind}-2`)
    await expect(page.locator('.wms-purchase-print-sheet')).not.toContainText(`QA-${kind}-1`)
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
    await expect(rows.first().getByRole('checkbox')).toBeChecked()
    await expect(rows.nth(1).getByRole('checkbox')).not.toBeChecked()
    if (kind === 'purchase_inbound') {
      await page.getByRole('button', { name: '下推', exact: true }).click()
      await expect(page.getByRole('menuitem', { name: '暂估应付单', exact: true })).toBeVisible()
      await expect(page.getByRole('menuitem', { name: '财务应付单', exact: true })).toBeVisible()
      await page.keyboard.press('Escape')
    }
    await page.evaluate(() => {
      window.print = () => undefined
    })
    await page.getByRole('button', { name: '批量打印', exact: true }).click()
    await expect(page.locator('.wms-purchase-print-sheet')).toHaveCount(1)
    await page.emulateMedia({ media: 'print' })
    await expect(page.locator('.wms-purchase-print-sheet')).toContainText('原材料仓')
    await expect(page.locator('.wms-purchase-print-sheet')).toContainText('件')
    if (entrusted)
      await expect(page.locator('.wms-purchase-print-sheet')).toContainText('机房装修工程')
    await page.screenshot({ path: info.outputPath(`${kind}-print.png`), fullPage: true })
    await page.emulateMedia({ media: 'screen' })
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
    await page.getByRole('radio', { name: '按明细' }).locator('..').click()
    await expect(rows).toHaveCount(2)
    await rows.first().getByRole('button', { name: /更多/ }).click()
    await page.getByRole('menuitem', { name: '编辑单据', exact: true }).click()
    const drawer = page.getByRole('dialog', { name: `编辑${titles[kind]}`, exact: true })
    await expect(drawer).toBeVisible()
    await expect(drawer.getByRole('button', { name: '保存', exact: true })).toBeEnabled()
    if (kind === 'purchase_inbound') {
      await drawer.getByRole('button', { name: '选单', exact: true }).click()
      await page.getByRole('menuitem', { name: '采购订单', exact: true }).click()
      const picker = page.getByRole('dialog').last()
      await expect(picker).toContainText('未入库数量')
      const sourceRows = picker.locator('.el-table__body-wrapper tbody tr')
      await expect(sourceRows).toHaveCount(2)
      await sourceRows.nth(0).getByRole('checkbox').locator('..').click()
      await sourceRows.nth(1).getByRole('checkbox').locator('..').click()
      await picker.getByRole('button', { name: '确定', exact: true }).click()
      await expect(drawer.locator('.el-table__body-wrapper tbody tr')).toHaveCount(3)
      await expect(drawer).toContainText('项目物料3')
    }
    if (returned) {
      await drawer.getByRole('button', { name: '添加物料', exact: true }).click()
      const picker = page.getByRole('dialog').last()
      await expect(picker).toContainText('可用库存量')
      const stocks = picker.locator('.el-table__body-wrapper tbody tr')
      await expect(stocks).toHaveCount(3)
      await expect(stocks.first().getByRole('checkbox')).toBeDisabled()
      await stocks.nth(1).getByRole('checkbox').locator('..').click()
      await stocks.nth(2).getByRole('checkbox').locator('..').click()
      await picker.getByRole('button', { name: '确定', exact: true }).click()
      await expect(drawer.locator('.el-table__body-wrapper tbody tr')).toHaveCount(3)
      expect(stockRequests[0]).toMatchObject({ p_warehouse_id: 'warehouse', p_kind: kind })
    }
    await page.screenshot({ path: info.outputPath(`${kind}-edit.png`), fullPage: true })
    if (entrusted || otherInbound) {
      const construction = drawer.getByPlaceholder('可选，允许为空').first()
      await construction.click()
      const picker = page.getByRole('dialog', { name: '选择施工号', exact: true })
      await expect(picker).toContainText('SG-01')
      await picker.getByRole('button', { name: '取消', exact: true }).click()
      await drawer.getByRole('button', { name: '保存', exact: true }).click()
      await expect.poll(() => saves.length).toBe(1)
      expect(saves[0].p_payload.lines.every((l) => !l.construction_no)).toBe(true)
    } else await drawer.getByRole('button', { name: '取消', exact: true }).click()
    if (otherInbound) {
      documents[0].status = 'approved'
      documents[0].lines.push({
        ...documents[0].lines[0],
        id: 'second-source-line',
        line_no: 20,
        material_id: materials[1].id,
        material: materials[1]
      })
      list[0].status = 'approved'
      list.push({
        ...list[0],
        line_id: 'second-source-line',
        line_no: 20,
        material_code: 'MAT-2',
        material_description: '项目物料2'
      })
      await page.getByRole('button', { name: '查询', exact: true }).click()
      await expect(rows).toHaveCount(3)
      const source = rows.filter({ hasText: 'QA-other_inbound-1' }).first()
      await source.getByRole('button', { name: '更多操作', exact: true }).click()
      await page.getByRole('menuitem', { name: '下推其他入库退回', exact: true }).click()
      const returnedDrawer = page.getByRole('dialog', { name: '新增其他入库退回单', exact: true })
      await expect(returnedDrawer).toBeVisible()
      await expect(returnedDrawer).toContainText('标准其他入库退回单')
      await expect(returnedDrawer).toContainText('其他入库退回')
      await expect(returnedDrawer.locator('.el-table__body-wrapper tbody tr')).toHaveCount(1)
      await returnedDrawer.getByRole('button', { name: '保存', exact: true }).click()
      await expect.poll(() => saves.length).toBe(2)
      expect(saves[1].p_payload).toMatchObject({
        kind: 'other_return',
        document_type_id: 'return-type',
        business_type_id: 'return-business'
      })
      expect(saves[1].p_payload.lines).toHaveLength(1)
      expect(saves[1].p_payload.lines[0].source_line_no).toBe('10')
    }
    expect(errors).toEqual([])
  })
}
