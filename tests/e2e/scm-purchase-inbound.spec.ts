import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(120_000)

for (const kind of ['purchase_order', 'receipt_notice'] as const) {
  test(`${kind} 按单据和明细下推、分批数量与收料撤回`, async ({ page }, testInfo) => {
    const tenantId = '11111111-1111-4111-8111-111111111111'
    const organizationId = '33333333-3333-4333-8333-333333333333'
    const sourceLines = [1, 2].map((index) => ({
      line_id: `line-${index}`,
      line_no: index * 10,
      material_id: `material-${index}`,
      material_code: `MAT-${index}`,
      material_description: `测试物料 ${index}`,
      quantity: 10 * index,
      unit: '件',
      unit_price: 5,
      tax_rate: 13,
      discount_rate: 0,
      gift: false,
      source_document_no: 'PO-ROOT',
      source_line_no: index * 10,
      warehouse_id: 'warehouse',
      batch_no: 'BATCH-001'
    }))
    const sources = [1, 2].map((index) => ({
      id: `document-${index}`,
      tenant_id: tenantId,
      kind,
      document_no: `QA-${kind}-${index}`,
      document_date: '2026-10-10',
      status: kind === 'purchase_order' ? 'approved' : 'submitted',
      project_id: 'project',
      supplier_id: 'supplier',
      source_id: null,
      details: { buyer: null, keeper: null },
      lines: sourceLines,
      total_amount: 169.5,
      remark: ''
    }))
    const records: Record<string, unknown[]> = {
      scm_purchase_document: sources,
      mdm_project: [
        { id: 'project', tenant_id: tenantId, project_code: 'PJ', project_name: '测试项目' }
      ],
      mdm_supplier: [
        { id: 'supplier', tenant_id: tenantId, supplier_code: 'SUP', supplier_name: '测试供应商' }
      ],
      mdm_material: sourceLines.map((line) => ({
        id: line.material_id,
        tenant_id: tenantId,
        code: line.material_code,
        name: line.material_description,
        inventory_unit_id: 'unit',
        base_unit_id: 'unit',
        material_code: line.material_code,
        material_name: line.material_description,
        basic_unit: 'EA',
        serial_management_enabled: false,
        unit_conversions: []
      })),
      mdm_organization: [
        {
          id: organizationId,
          tenant_id: tenantId,
          organization_code: 'ORG',
          organization_name: '测试库存组织',
          organization_type: 'company',
          status: '1',
          initialization: {
            organization_id: organizationId,
            enabled_on: '2026-10-01',
            is_default: true,
            initialization_closed_at: '2026-10-02'
          }
        }
      ],
      wms_inventory_initialization: [
        {
          organization_id: organizationId,
          enabled_on: '2026-10-01',
          is_default: true,
          initialization_closed_at: '2026-10-02'
        }
      ],
      mdm_warehouse: [
        {
          id: 'warehouse',
          tenant_id: tenantId,
          organization_id: organizationId,
          warehouse_code: 'WH',
          warehouse_name: '测试仓库',
          status: 'enabled'
        }
      ],
      mdm_unit_of_measure: [{ id: 'unit', tenant_id: tenantId, unit_code: 'EA', unit_name: '件' }],
      mdm_document_type: [
        {
          id: 'type',
          tenant_id: tenantId,
          document_type_code: 'WMS_PURCHASE_INBOUND',
          document_type_name: '采购入库单',
          menu_ids: ['inbound-menu'],
          enabled: true,
          is_default: true
        }
      ],
      mdm_business_type: [
        {
          id: 'business',
          tenant_id: tenantId,
          business_type_code: 'NORMAL',
          business_type_name: '标准采购',
          document_type_ids: ['type'],
          menu_ids: ['inbound-menu'],
          enabled: true,
          is_default: true
        }
      ]
    }
    let received = 3
    let failProgress = false
    let failReferences = false
    const pushes: Array<{
      p_selections: Array<{ document_id: string; line_ids: string[] | null }>
    }> = []
    const actions: Array<{
      p_action: string
      p_selections: Array<{ document_id: string; line_ids: string[] | null }>
    }> = []
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', async (route) => {
      const url = new URL(route.request().url())
      const name = url.pathname.split('/').at(-1)!
      let data: unknown = records[name] ?? []
      if (name === 'sys_menu') data = { id: 'inbound-menu' }
      if (name === 'scm_purchase_suppliers_secure') data = records.mdm_supplier
      if (name === 'scm_purchase_delete_dependencies_secure') {
        if (failReferences)
          return route.fulfill({ status: 500, json: { code: 'XX000', message: 'internal error' } })
        data = []
      }
      if (name === 'scm_purchase_batch_secure') {
        const action = route.request().postDataJSON()
        actions.push(action)
        if (action.p_action === 'withdraw')
          sources.forEach((source) => {
            source.status = 'draft'
          })
        data = 2
      }
      if (name === 'scm_purchase_line_progress_secure') {
        if (failProgress)
          return route.fulfill({ status: 500, json: { code: 'XX000', message: 'internal error' } })
        data = sources.flatMap((source) =>
          sourceLines.map((line) => ({
            document_id: source.id,
            line_id: line.line_id,
            delivered_quantity: 6,
            received_quantity: received,
            returned_quantity: 1
          }))
        )
      }
      if (name === 'scm_prepare_purchase_inbound_secure') {
        const request = route.request().postDataJSON()
        pushes.push(request)
        data = request.p_selections.map(
          (selection: { document_id: string; line_ids: string[] | null }) => ({
            target_id: `target-${selection.document_id}`,
            source_line_ids: selection.line_ids ?? sourceLines.map((line) => line.line_id)
          })
        )
      }
      if (name === 'scm_order_target_document') {
        const id = url.searchParams.get('id')!.replace('eq.', '')
        const source = sources.find((row) => `target-${row.id}` === id)!
        data = {
          id,
          tenant_id: tenantId,
          document_no: id,
          project_id: 'project',
          supplier_id: 'supplier',
          status: 'partial',
          source: { document_no: source.document_no, details: source.details }
        }
      }
      if (name === 'scm_order_target_line')
        data = sourceLines.map((line) => ({
          id: `target-line-${line.line_id}`,
          source_line_id: line.line_id,
          line_snapshot: line
        }))
      if (name === 'wms_purchase_order_target_remaining')
        data = sourceLines.map((line) => ({
          target_line_id: `target-line-${line.line_id}`,
          ordered_quantity: line.quantity,
          received_quantity: received,
          remaining_quantity: line.quantity - received - (kind === 'purchase_order' ? 1 : 0)
        }))
      return route.fulfill({
        json: data,
        headers: {
          'content-range':
            Array.isArray(data) && data.length ? `0-${data.length - 1}/${data.length}` : '*/0',
          'access-control-expose-headers': 'content-range'
        }
      })
    })
    await page.goto(`/tests/e2e/fixtures/scm-purchase-inbound.html?kind=${kind}`)
    const rows = page.locator('.el-table__body-wrapper tbody tr')
    await expect(rows).toHaveCount(2)
    const hero = page.getByRole('heading', {
      name: kind === 'purchase_order' ? '采购订单' : '收料通知单',
      exact: true
    })
    await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
    await expect(hero).not.toBeVisible()
    await expect(page.getByRole('button', { name: '查询', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '退出专注模式', exact: true }).click()
    await expect(hero).toBeVisible()
    await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
    await page.keyboard.press('Escape')
    await expect(hero).toBeVisible()
    for (const label of ['下推收料入库', '下推资产应付', '确认收料', '下推 WMS 采购入库'])
      await expect(page.getByRole('button', { name: label, exact: true })).toHaveCount(0)
    await page.locator('.el-table__header-wrapper').getByRole('checkbox').locator('..').click()
    await expect(page.getByRole('button', { name: '批量删除', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '下推采购入库单', exact: true }).click()
    const drawer = page.getByRole('dialog', { name: '新增采购入库单', exact: true })
    await expect(drawer).toBeVisible()
    await expect(drawer.locator('.el-table__body tr')).toHaveCount(4)
    expect(pushes[0].p_selections).toEqual(
      sources.map((source) => ({ document_id: source.id, line_ids: null }))
    )
    await expect(drawer).toContainText(sources[0].document_no)
    await expect(drawer).toContainText(sources[1].document_no)
    await expect(drawer.getByRole('button', { name: '保存', exact: true })).toBeEnabled()
    await page.screenshot({
      path: testInfo.outputPath(`${kind}-multi-inbound.png`),
      animations: 'disabled'
    })
    await drawer.getByRole('button', { name: '取消', exact: true }).click()
    await page.getByRole('radio', { name: '按明细' }).locator('..').click()
    await expect(rows).toHaveCount(4)
    await rows.nth(1).getByRole('checkbox').locator('..').click()
    await page.getByRole('button', { name: '下推采购入库单', exact: true }).click()
    await expect(drawer.locator('.el-table__body tr')).toHaveCount(1)
    expect(pushes[1].p_selections).toEqual([{ document_id: sources[0].id, line_ids: ['line-2'] }])
    const quantityColumn = await drawer
      .getByRole('columnheader', { name: '数量', exact: true })
      .evaluate((cell) => (cell as HTMLTableCellElement).cellIndex)
    const quantity = drawer
      .locator('.el-table__body tr')
      .first()
      .locator('td')
      .nth(quantityColumn)
      .getByRole('spinbutton')
    await expect(quantity).toHaveValue(kind === 'purchase_order' ? '16.0000' : '17.0000')
    await quantity.fill('2')
    await quantity.press('Tab')
    await expect(quantity).toHaveValue('2.0000')
    await drawer.getByRole('button', { name: '取消', exact: true }).click()
    received = 5
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await rows.nth(1).getByRole('checkbox').locator('..').click()
    await page.getByRole('button', { name: '下推采购入库单', exact: true }).click()
    await expect(quantity).toHaveValue(kind === 'purchase_order' ? '14.0000' : '15.0000')
    await drawer.getByRole('button', { name: '取消', exact: true }).click()
    if (kind === 'receipt_notice') {
      await page.getByRole('radio', { name: '按单据' }).locator('..').click()
      await rows.nth(0).getByRole('checkbox').locator('..').click()
      await page.getByRole('button', { name: '撤回', exact: true }).click()
      await page.getByRole('button', { name: '确定', exact: true }).click()
      await expect.poll(() => actions.map((action) => action.p_action)).toContain('withdraw')
      await page.getByRole('radio', { name: '按明细' }).locator('..').click()
      await rows.nth(1).getByRole('checkbox').locator('..').click()
      failReferences = true
      await page.getByRole('button', { name: '批量删除', exact: true }).click()
      const referenceDialog = page.getByRole('dialog', { name: '删除检查未完成' })
      await expect(referenceDialog).toBeVisible()
      expect(actions.filter((action) => action.p_action === 'delete')).toHaveLength(0)
      failReferences = false
      await referenceDialog.getByRole('button', { name: /重新检查|重试/ }).click()
      await expect(referenceDialog).not.toBeVisible()
      await page.getByRole('button', { name: '批量删除', exact: true }).click()
      await page.getByRole('button', { name: '确认删除', exact: true }).click()
      await expect
        .poll(() => actions.filter((action) => action.p_action === 'delete').length)
        .toBe(1)
      expect(actions.find((action) => action.p_action === 'delete')?.p_selections).toEqual([
        { document_id: sources[0].id, line_ids: ['line-2'] }
      ])
      await page.getByRole('radio', { name: '按单据' }).locator('..').click()
    }
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    await page.screenshot({
      path: testInfo.outputPath(`${kind}-narrow.png`),
      animations: 'disabled'
    })
    failProgress = true
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await expect(page.getByText(/加载失败|重试/).first()).toBeVisible()
    failProgress = false
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await expect(rows).toHaveCount(kind === 'receipt_notice' ? 2 : 4)
    expect(errors).toEqual([])
  })
}
