import { expect, test, type Locator } from '@playwright/test'
import { expectInputTextUnclipped } from './support/input-text-width'

async function checkLineDates(drawer: Locator, labels: string[]): Promise<void> {
  for (const label of labels) {
    const column = await drawer
      .getByRole('columnheader', { name: label, exact: true })
      .evaluate((element) => (element as HTMLTableCellElement).cellIndex)
    const input = drawer
      .locator('.el-table__body tr')
      .first()
      .locator('td')
      .nth(column)
      .locator('.el-date-editor input')
    await input.scrollIntoViewIfNeeded()
    await input.fill('2026-10-07')
    await input.press('Tab')
    await input.hover()
    await expect(input).toHaveValue('2026-10-07')
    await expectInputTextUnclipped(input)
  }
  for (const label of labels.includes('入库日期') ? ['单价'] : ['未税单价', '含税单价']) {
    const column = await drawer
      .getByRole('columnheader', { name: label, exact: true })
      .evaluate((cell) => (cell as HTMLTableCellElement).cellIndex)
    const input = drawer
      .locator('.el-table__body tr')
      .first()
      .locator('td')
      .nth(column)
      .getByRole('spinbutton')
    await input.scrollIntoViewIfNeeded()
    await input.fill('12345678.1234')
    await input.press('Tab')
    await expect(input).toHaveValue('12345678.1234')
    await input.scrollIntoViewIfNeeded()
    await expectInputTextUnclipped(input)
  }
}

async function expectErrorCellUncovered(drawer: Locator): Promise<void> {
  const covered = await drawer
    .locator('.is-validation-error')
    .first()
    .evaluate((cell) => {
      const target = cell.getBoundingClientRect()
      const fixedCells =
        cell
          .closest('tr')
          ?.querySelectorAll('td.el-table-fixed-column--left, td.el-table-fixed-column--right') ??
        []
      return Array.from(fixedCells).some((fixedCell) => {
        const fixed = fixedCell.getBoundingClientRect()
        return fixed.right > target.left + 1 && fixed.left < target.right - 1
      })
    })
  expect(covered, '错误字段应完整露出，不能与固定列重叠').toBe(false)
}

test.use({ storageState: { cookies: [], origins: [] } })
const scenarios = [
  { family: '库存', query: 'missingStockWarehouse=true', kind: 'stock' },
  { family: '库存', query: 'missingStockUnit=true', kind: 'stock-unit' },
  ...[
    'initial_outbound',
    'initial_return',
    'outbound',
    'return',
    'other_outbound',
    'other_return'
  ].map((kind) => ({ family: '销售', query: `salesKind=${kind}`, kind })),
  ...[
    'initial_inbound',
    'initial_return',
    'purchase_inbound',
    'purchase_return',
    'other_inbound',
    'other_return',
    'entrusted_processing_inbound',
    'entrusted_processing_return'
  ].map((kind) => ({ family: '采购', query: `purchaseKind=${kind}`, kind }))
]

for (const { family, query, kind } of scenarios) {
  test(`${family}-${kind}${kind.startsWith('stock') ? '缺失字段定位及重新打开清理' : '两行整单复制及只读详情'}`, async ({
    page
  }, testInfo) => {
    test.setTimeout(90_000)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    let writes = 0
    const tenantId = '11111111-1111-4111-8111-111111111111'
    const organizationId = '33333333-3333-4333-8333-333333333333'
    const documentTypeId = '44444444-4444-4444-8444-444444444444'
    const records: Record<string, object[]> = {
      mdm_organization: [
        {
          id: organizationId,
          tenant_id: tenantId,
          organization_code: 'TEST-ORG',
          organization_name: '测试库存组织',
          organization_type: 'company',
          status: '1',
          initialization: {
            organization_id: organizationId,
            enabled_on: '2026-10-30',
            is_default: true,
            initialization_closed_at:
              kind.startsWith('initial_') || kind.startsWith('stock') ? null : '2026-10-03'
          }
        }
      ],
      wms_inventory_initialization: [
        {
          organization_id: organizationId,
          enabled_on: '2026-10-30',
          is_default: true,
          initialization_closed_at:
            kind.startsWith('initial_') || kind.startsWith('stock') ? null : '2026-10-03'
        }
      ],
      mdm_document_type: [
        {
          id: documentTypeId,
          tenant_id: tenantId,
          document_type_code: kind === 'other_return' ? 'WMS_OTHER_RETURN' : 'TEST-DOC',
          document_type_name: kind === 'other_return' ? '测试退回单据类型' : '测试单据类型',
          menu_ids: ['variant-menu'],
          enabled: true,
          is_default: true
        }
      ],
      mdm_business_type: [
        {
          id: '55555555-5555-4555-8555-555555555555',
          tenant_id: tenantId,
          business_type_code: 'TEST-BIZ',
          business_type_name: '测试业务类型',
          document_type_ids: [documentTypeId],
          menu_ids: ['variant-menu'],
          enabled: true,
          is_default: true
        }
      ],
      mdm_customer: [
        {
          id: '66666666-6666-4666-8666-666666666666',
          tenant_id: tenantId,
          customer_code: 'TEST-CUSTOMER',
          customer_name: '测试客户'
        }
      ],
      mdm_supplier: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          tenant_id: tenantId,
          supplier_code: 'TEST-SUPPLIER',
          supplier_name: '测试供应商'
        }
      ],
      mdm_unit_of_measure: [
        {
          id: '88888888-8888-4888-8888-888888888888',
          tenant_id: tenantId,
          unit_code: 'EA',
          unit_name: '件'
        }
      ]
    }
    records.mdm_customer.push({
      id: '77777777-7777-4777-8777-777777777777',
      tenant_id: tenantId,
      customer_code: 'TEST-CUSTOMER-2',
      customer_name: '备选测试客户'
    })
    records.mdm_supplier.push({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      tenant_id: tenantId,
      supplier_code: 'TEST-SUPPLIER-2',
      supplier_name: '备选测试供应商'
    })
    records.mdm_warehouse = [
      {
        id: '99999999-9999-4999-8999-999999999999',
        tenant_id: tenantId,
        organization_id: organizationId,
        warehouse_code: 'TEST-WH',
        warehouse_name: '测试新增仓库',
        status: 'enabled'
      }
    ]
    records.mdm_material = [1, 2].map((index) => ({
      id: `cccccccc-cccc-4ccc-8ccc-ccccccccccc${index}`,
      tenant_id: tenantId,
      code: `NEW-MAT-${index}`,
      name: `新增测试物料 ${index}`,
      inventory_unit_id: '88888888-8888-4888-8888-888888888888',
      base_unit_id: '88888888-8888-4888-8888-888888888888',
      serial_management_enabled: false,
      unit_conversions: []
    }))
    const dictionaryRows = [
      ['commonDocumentReviewStatus', 'draft', '草稿'],
      ['wmsInitialStockType', 'normal', '正常库存'],
      ['wmsInitialStockType', 'entrusted_processing', '受托加工库存'],
      ['wmsInitialStockCondition', 'available', '可用'],
      ['mdmBusinessOwnerType', 'self', '自有'],
      ['mdmBusinessOwnerType', 'supplier', '供应商'],
      ['mdmBusinessOwnerType', 'customer', '客户'],
      ['wmsInitialSalesReturnType', 'return', '退货'],
      ['wmsInitialSalesReturnType', 'replace', '配置退补货']
    ].map(([code, value, label], index) => ({
      id: `dictionary-${index}`,
      value,
      label,
      status: '1',
      sort: index,
      dict_type_table: { code, name: code }
    }))
    records.sys_dictionary = dictionaryRows
    await page.route('**/rest/v1/**', (route) => {
      if (new URL(route.request().url()).pathname.endsWith('/rpc/wms_sales_choices_secure')) {
        return route.fulfill({
          json: {
            data: records.mdm_material.map((material, index) => ({
              id: `stock-${index}`,
              source_document_id: null,
              source_line_id: null,
              material_code: `NEW-MAT-${index + 1}`,
              material_description: `新增测试物料 ${index + 1}`,
              deliverable_quantity: 100,
              available_quantity: 100,
              allocated_quantity: 0,
              inventory_quantity: 100,
              inventory_unit: '件',
              serial_nos: [],
              unit_price: 0,
              tax_rate: 13,
              material,
              line: {
                warehouse_id: '99999999-9999-4999-8999-999999999999',
                stock_batch_id: `batch-${index}`,
                stock_status: 'available',
                stock_type: 'normal'
              }
            })),
            total: 2
          }
        })
      }
      if (route.request().method() !== 'GET') writes += 1
      if (new URL(route.request().url()).pathname.endsWith('/sys_menu')) {
        return route.fulfill({ json: { id: 'variant-menu' } })
      }
      if (new URL(route.request().url()).pathname.endsWith('/sys_dictionary')) {
        const filter = new URL(route.request().url()).searchParams.get('dict_type_table.code')
        return route.fulfill({
          json: filter
            ? dictionaryRows.filter(
                (row) => row.dict_type_table.code === filter.replace(/^eq\./, '')
              )
            : dictionaryRows
        })
      }
      const data = records[new URL(route.request().url()).pathname.split('/').at(-1) || ''] ?? []
      return route.fulfill({
        headers: {
          'content-range': data.length ? `0-${data.length - 1}/${data.length}` : '*/0',
          'access-control-expose-headers': 'content-range'
        },
        json: data
      })
    })
    await page.goto(
      `/tests/e2e/fixtures/wms-document-serials.html?${query}&twoLines=true&ownerNames=true`
    )
    if (kind.startsWith('stock')) {
      const open = page.getByRole('button', { name: '打开初始库存单', exact: true })
      await open.click()
      const stockDrawer = page.locator('.el-drawer:visible')
      const save = stockDrawer.getByRole('button', { name: '保存', exact: true })
      await expect(save).toBeEnabled()
      await expect(stockDrawer.locator('.el-table__body tr')).toHaveCount(2)
      await checkLineDates(stockDrawer, ['入库日期', '生产日期', '有效期至'])
      await page.screenshot({
        path: testInfo.outputPath('stock-line-dates.png'),
        animations: 'disabled'
      })
      if (kind === 'stock-unit') {
        await stockDrawer
          .locator('.el-table__body tr')
          .first()
          .locator('td')
          .last()
          .scrollIntoViewIfNeeded()
      }
      await save.click()
      await expect(stockDrawer.locator('.is-validation-error')).toHaveCount(2)
      await expectErrorCellUncovered(stockDrawer)
      await expect(page.locator('.el-message__content')).toHaveText(
        kind === 'stock-unit' ? '第 1 行“库存单位”不能为空' : '第 1 行“入库仓库”不能为空'
      )
      await page.screenshot({
        path: testInfo.outputPath(
          kind === 'stock-unit' ? 'stock-missing-unit.png' : 'stock-missing-warehouse.png'
        ),
        animations: 'disabled'
      })
      if (await page.locator('.el-select-dropdown:visible').count())
        await page.keyboard.press('Escape')
      await stockDrawer.getByRole('button', { name: '取消', exact: true }).click()
      await open.click()
      await expect(stockDrawer.locator('.is-validation-error')).toHaveCount(0)
      await stockDrawer.getByRole('button', { name: '取消', exact: true }).click()
      await page.getByRole('button', { name: '查看初始库存单', exact: true }).click()
      await expect(stockDrawer.locator('.el-descriptions')).toBeVisible()
      await expect(stockDrawer.locator('.el-table__body').getByRole('checkbox')).toHaveCount(0)
      for (const [header, label] of [
        ['库存类型', '正常库存'],
        ['库存状态', '可用'],
        ['货主类型', '供应商']
      ]) {
        const column = await stockDrawer
          .getByRole('columnheader', { name: header, exact: true })
          .evaluate((cell) => Array.from(cell.parentElement!.children).indexOf(cell))
        const cell = stockDrawer.locator('.el-table__body tr').first().locator('td').nth(column)
        await cell.scrollIntoViewIfNeeded()
        await expect(cell.getByText(label, { exact: true })).toBeVisible()
      }
      for (const name of ['复制', '编制', '删除', '序列号']) {
        await expect(
          stockDrawer
            .locator('.art-section-card')
            .filter({ hasText: '物料明细' })
            .getByRole('button', { name, exact: true })
        ).toHaveCount(0)
      }
      await expect(
        stockDrawer.locator('.el-table__body').getByText('测试供应商', { exact: true })
      ).toHaveCount(1)
      await expect(
        stockDrawer.locator('.el-table__body').getByText('测试客户', { exact: true })
      ).toHaveCount(1)
      await expect(stockDrawer.locator('.art-table__required-marker')).toHaveCount(0)
      await stockDrawer
        .locator('.el-table__body')
        .getByText('测试供应商', { exact: true })
        .scrollIntoViewIfNeeded()
      await page.screenshot({
        path: testInfo.outputPath('stock-owner-names.png'),
        animations: 'disabled'
      })
      await expect(stockDrawer.getByRole('button', { name: '保存', exact: true })).toHaveCount(0)
      await stockDrawer.getByRole('button', { name: 'Close this dialog', exact: true }).click()
      expect(writes).toBe(0)
      expect(errors).toEqual([])
      if (kind === 'stock') {
        records.mdm_material[0].serial_management_enabled = true
        test.setTimeout(120_000)
        let rejectStockSave = true
        const stockPayloads: Record<string, unknown>[] = []
        await page.route('**/rest/v1/rpc/wms_save_initial_stock_secure', (route) => {
          stockPayloads.push(route.request().postDataJSON())
          return route.fulfill(
            rejectStockSave
              ? { status: 400, json: { code: 'P0001', message: '测试初始库存保存失败' } }
              : { json: 'saved-initial-stock' }
          )
        })
        for (const draft of [1, 2]) {
          await page.getByRole('button', { name: '新增初始库存单', exact: true }).click()
          await expect(save).toBeEnabled()
          const remark = stockDrawer.getByRole('textbox', { name: '备注', exact: true }).first()
          await expect(remark).toHaveValue('')
          await expect(stockDrawer.locator('.el-table__body tr')).toHaveCount(0)
          await stockDrawer.getByRole('button', { name: '新增', exact: true }).click()
          const picker = page.locator('.el-dialog:visible')
          await expect(
            picker.locator('.el-table__body').getByText('NEW-MAT-1', { exact: true })
          ).toBeVisible()
          await picker.locator('.el-table__header-wrapper .el-checkbox').click()
          await picker.getByRole('button', { name: '确定', exact: true }).click()
          const rows = stockDrawer.locator('.el-table__body tr')
          await expect(rows).toHaveCount(2)
          const headers = await stockDrawer
            .locator('.el-table__header-wrapper th')
            .allTextContents()
          const columnIndex = (label: string) =>
            headers.findIndex(
              (text) => text.replace('*', '').replace('（必填）', '').trim() === label
            )
          const warehouseIndex = columnIndex('入库仓库')
          const quantityIndex = columnIndex('期初数量')
          expect(warehouseIndex).toBeGreaterThan(-1)
          expect(quantityIndex).toBeGreaterThan(-1)
          for (const row of await rows.all()) {
            const quantity = row.locator('td').nth(quantityIndex).getByRole('spinbutton')
            await quantity.fill(String(draft + 1))
            await quantity.press('Tab')
            const warehouse = row.locator('td').nth(warehouseIndex).getByRole('combobox')
            await warehouse.click()
            const dropdownId = await warehouse.getAttribute('aria-controls')
            expect(dropdownId).toBeTruthy()
            await page
              .locator(`[id="${dropdownId}"]`)
              .getByRole('option', { name: /测试新增仓库/ })
              .click()
          }
          await remark.fill(`初始库存新增 ${draft}`)
          const serialRow = rows.first()
          await serialRow.getByRole('button', { name: '序列号 0', exact: true }).click()
          const serialDialog = page.getByRole('dialog', { name: /^第 \d+ 行序列号$/ })
          const serialInput = serialDialog.getByPlaceholder('每行一个序列号', { exact: true })
          const serialSave = serialDialog.getByRole('button', { name: '保存序列号', exact: true })
          await expect(serialInput).toHaveValue('')
          await serialInput.fill(Array.from({ length: draft + 1 }, () => 'DUPLICATE-SN').join('\n'))
          await serialSave.click()
          await expect(
            page.getByText('SN 件数须与期初数量一致且不能重复', { exact: true })
          ).toBeVisible()
          await expect(serialDialog).toBeVisible()
          expect(stockPayloads).toHaveLength((draft - 1) * 2)
          await page.screenshot({
            path: testInfo.outputPath(`stock-new-${draft}-serial-validation.png`),
            animations: 'disabled'
          })
          const serialNos = Array.from(
            { length: draft + 1 },
            (_, index) => `INIT-${draft}-SN-${index + 1}`
          )
          await serialInput.fill(serialNos.join('\n'))
          await serialSave.click()
          await expect(serialDialog).toBeHidden()
          await expect(
            serialRow.getByRole('button', { name: `序列号 ${draft + 1}`, exact: true })
          ).toBeVisible()
          rejectStockSave = true
          await save.click()
          await expect(page.getByText('测试初始库存保存失败', { exact: true })).toBeVisible()
          await expect(remark).toHaveValue(`初始库存新增 ${draft}`)
          await expect(rows).toHaveCount(2)
          await serialRow.getByRole('button', { name: `序列号 ${draft + 1}`, exact: true }).click()
          await expect(serialInput).toHaveValue(serialNos.join('\n'))
          await serialDialog.getByRole('button', { name: '取消', exact: true }).click()
          await page.screenshot({
            path: testInfo.outputPath(`stock-new-${draft}-save-retry.png`),
            animations: 'disabled'
          })
          rejectStockSave = false
          await save.click()
          await expect(stockDrawer).toBeHidden()
          expect(stockPayloads).toHaveLength(draft * 2)
          expect(stockPayloads.at(-1)).toEqual(stockPayloads.at(-2))
          expect(stockPayloads.at(-1)?.p_payload).toMatchObject({
            organization_id: organizationId,
            remark: `初始库存新增 ${draft}`,
            lines: [1, 2].map((index) =>
              expect.objectContaining({
                material_id: `cccccccc-cccc-4ccc-8ccc-ccccccccccc${index}`,
                opening_quantity: draft + 1,
                serial_nos: index === 1 ? serialNos : [],
                warehouse_id: '99999999-9999-4999-8999-999999999999'
              })
            )
          })
        }
        expect(errors).toEqual([])
      }
      return
    }
    await page.getByRole('button', { name: `复制${family}单据`, exact: true }).click()
    const drawer = page.locator('.el-drawer:visible')
    await expect(drawer.getByRole('button', { name: '保存副本', exact: true })).toBeEnabled()
    await checkLineDates(drawer, ['生产日期', '有效期至'])
    await page.screenshot({
      path: testInfo.outputPath('trade-line-dates.png'),
      animations: 'disabled'
    })
    await expect(drawer.getByRole('button', { name: '保存副本', exact: true })).toBeVisible()
    await expect(drawer.getByRole('button', { name: '保存副本', exact: true })).toBeEnabled()
    await expect(drawer.getByRole('textbox', { name: '单据编号', exact: true })).toHaveValue('')
    await expect(drawer.getByText('测试业务类型', { exact: true })).toBeVisible()
    const partyName =
      family === '销售' || kind.startsWith('entrusted_processing_') ? '客户' : '供应商'
    const party = drawer.getByRole('textbox', { name: new RegExp(partyName) }).first()
    await expect(party).toHaveValue(new RegExp(`测试${partyName}`))
    await party.click()
    const picker = page.getByRole('dialog', { name: `选择${partyName}`, exact: true })
    await expect(picker).toBeVisible()
    await expect(
      picker.locator('.el-table__body').getByText(`测试${partyName}`, { exact: true })
    ).toBeVisible()
    await page.screenshot({
      path: testInfo.outputPath('variant-party-picker.png'),
      animations: 'disabled'
    })
    await picker.getByRole('button', { name: '取消', exact: true }).click()
    await expect(party).toHaveValue(new RegExp(`测试${partyName}`))
    await party.click()
    await picker
      .locator('.el-table__body tr')
      .filter({ hasText: `备选测试${partyName}` })
      .click()
    await picker.getByRole('button', { name: '确定', exact: true }).click()
    await expect(picker).toBeHidden()
    await expect(party).toHaveValue(new RegExp(`备选测试${partyName}`))
    await party.click()
    await expect(
      picker
        .locator('.el-table__body tr')
        .filter({ hasText: `备选测试${partyName}` })
        .getByRole('checkbox')
    ).toBeChecked()
    await page.screenshot({
      path: testInfo.outputPath('variant-party-selected.png'),
      animations: 'disabled'
    })
    await picker.getByRole('button', { name: '取消', exact: true }).click()
    await expect(party).toHaveValue(new RegExp(`备选测试${partyName}`))
    const table = drawer.locator('.art-table.wms-editable-line-table')
    await expect(table.locator('.el-table__body tr')).toHaveCount(2)
    expect(await drawer.evaluate((node) => node.scrollWidth > node.clientWidth + 1)).toBe(false)
    await page.screenshot({ path: testInfo.outputPath('variant-copy.png'), animations: 'disabled' })
    await table.scrollIntoViewIfNeeded()
    await page.screenshot({
      path: testInfo.outputPath('variant-copy-lines.png'),
      animations: 'disabled'
    })
    if (kind === 'initial_outbound' || kind === 'purchase_inbound') {
      await drawer.getByRole('button', { name: '保存副本', exact: true }).click()
      await expect(
        page
          .locator('.el-message__content')
          .getByText(
            family === '销售'
              ? '第 1 行序列号数量须与物料数量一致且不能重复'
              : '第 1 行“仓库”不能为空',
            { exact: true }
          )
      ).toBeVisible()
      await expect(drawer).toBeVisible()
      if (family === '采购') await expectErrorCellUncovered(drawer)
      expect(writes).toBe(0)
      await page.screenshot({
        path: testInfo.outputPath('variant-submit-validation.png'),
        animations: 'disabled'
      })
    }
    await drawer.getByRole('button', { name: '取消', exact: true }).click()
    await page.getByRole('button', { name: `查看${family}单据`, exact: true }).click()
    await expect(drawer).toBeVisible()
    await expect(drawer.locator('.el-descriptions')).toBeVisible()
    await expect(drawer.getByRole('button', { name: '保存', exact: true })).toHaveCount(0)
    await expect(drawer.locator('.el-table__body tr')).toHaveCount(2)
    if (family === '销售' && kind.includes('return')) {
      const column = await drawer
        .getByRole('columnheader', { name: '退货类型', exact: true })
        .evaluate((cell) => Array.from(cell.parentElement!.children).indexOf(cell))
      const cells = drawer.locator('.el-table__body tr').locator('td').nth(column)
      await cells.scrollIntoViewIfNeeded()
      await expect(cells.getByText('配置退补货', { exact: true })).toBeVisible()
      await expect(
        drawer.locator('.el-table__body tr').nth(1).locator('td').nth(column)
      ).toHaveText('--')
      await page.screenshot({
        path: testInfo.outputPath('sales-return-dictionary.png'),
        animations: 'disabled'
      })
    }
    await expect(
      drawer.locator('.el-table__body').getByText('测试供应商', { exact: true })
    ).toHaveCount(1)
    await expect(
      drawer.locator('.el-table__body').getByText('测试客户', { exact: true })
    ).toHaveCount(1)
    await expect(drawer.locator('.el-table__body .el-select')).toHaveCount(0)
    await expect(drawer.locator('.art-table__required-marker')).toHaveCount(0)
    await drawer
      .locator('.el-table__body')
      .getByText('测试供应商', { exact: true })
      .scrollIntoViewIfNeeded()
    await page.screenshot({
      path: testInfo.outputPath('variant-owner-names.png'),
      animations: 'disabled'
    })
    await page.screenshot({ path: testInfo.outputPath('variant-view.png'), animations: 'disabled' })
    await drawer.locator('.art-table').last().scrollIntoViewIfNeeded()
    await page.screenshot({
      path: testInfo.outputPath('variant-view-lines.png'),
      animations: 'disabled'
    })
    await drawer.getByRole('button', { name: 'Close this dialog', exact: true }).click()
    await expect(drawer).toBeHidden()
    expect(writes).toBe(0)
    let rejectSave = true
    const payloads: Record<string, unknown>[] = []
    await page.route('**/rest/v1/rpc/wms_save_*_document_secure', (route) => {
      payloads.push(route.request().postDataJSON())
      return route.fulfill(
        rejectSave
          ? { status: 400, json: { code: 'P0001', message: '测试保存失败，请重试' } }
          : { json: 'saved-test-document' }
      )
    })
    await page.goto(
      `/tests/e2e/fixtures/wms-document-serials.html?${query}&twoLines=true&validSave=true&storedReturnQuantity=true`
    )
    await page.getByRole('button', { name: `复制${family}单据`, exact: true }).click()
    await expect(drawer.getByRole('button', { name: '保存副本', exact: true })).toBeEnabled()
    await drawer.getByRole('button', { name: '保存副本', exact: true }).click()
    await expect(page.getByText('测试保存失败，请重试', { exact: true })).toBeVisible()
    await expect(drawer).toBeVisible()
    expect(payloads).toHaveLength(1)
    expect(payloads[0].p_payload).toMatchObject({
      kind,
      is_initialization: kind.startsWith('initial_'),
      lines: [0, 1].map((index) =>
        expect.objectContaining({
          quantity: 2,
          serial_nos: [`SN-SAVE-${index}-1`, `SN-SAVE-${index}-2`]
        })
      )
    })
    rejectSave = false
    await drawer.getByRole('button', { name: '保存副本', exact: true }).click()
    await expect(drawer).toBeHidden()
    expect(payloads).toHaveLength(2)
    expect(payloads[1]).toEqual(payloads[0])
    await page.getByRole('button', { name: `打开${family}单据`, exact: true }).click()
    const editSave = drawer.getByRole('button', { name: '保存', exact: true })
    await expect(editSave).toBeEnabled()
    const remark = drawer.getByRole('textbox', { name: '备注', exact: true }).first()
    await remark.fill('编辑保存重试验证')
    rejectSave = true
    await editSave.click()
    await expect(page.getByText('测试保存失败，请重试', { exact: true })).toBeVisible()
    await expect(remark).toHaveValue('编辑保存重试验证')
    await expect(editSave).toBeEnabled()
    expect(payloads).toHaveLength(3)
    expect(payloads[2].p_payload).toMatchObject({
      id: '22222222-2222-4222-8222-222222222222',
      tenant_id: tenantId,
      kind,
      is_initialization: kind.startsWith('initial_'),
      remark: '编辑保存重试验证',
      lines: [0, 1].map((index) =>
        expect.objectContaining({
          quantity: 2,
          serial_nos: [`SN-SAVE-${index}-1`, `SN-SAVE-${index}-2`]
        })
      )
    })
    rejectSave = false
    await editSave.click()
    await expect(drawer).toBeHidden()
    expect(payloads).toHaveLength(4)
    expect(payloads[3]).toEqual(payloads[2])
    const create = page.getByRole('button', { name: `新增${family}单据`, exact: true })
    await create.click()
    await expect(editSave).toBeEnabled()
    await expect(drawer.getByRole('textbox', { name: '单据编号', exact: true })).toHaveValue('')
    await expect(remark).toHaveValue('')
    await expect(drawer.locator('.el-table__body tr')).toHaveCount(0)
    await remark.fill('取消的新增草稿')
    await drawer.getByRole('button', { name: '取消', exact: true }).click()
    await create.click()
    await expect(editSave).toBeEnabled()
    await expect(remark).toHaveValue('')
    await expect(drawer.locator('.el-table__body tr')).toHaveCount(0)
    await drawer.getByRole('button', { name: '取消', exact: true }).click()
    expect(payloads).toHaveLength(4)
    for (const draft of [1, 2]) {
      await create.click()
      await party.click()
      await picker.locator('.el-table__body').getByText(`测试${partyName}`, { exact: true }).click()
      await picker.getByRole('button', { name: '确定', exact: true }).click()
      await expect(picker).toBeHidden()
      const stockPicker = family === '销售' && ['outbound', 'other_outbound'].includes(kind)
      if (stockPicker) {
        await drawer.getByRole('combobox', { name: '仓库号', exact: true }).click()
        await page.getByRole('option', { name: /测试新增仓库/ }).click()
      }
      await drawer.getByRole('button', { name: '添加物料', exact: true }).click()
      const materials = page.getByRole('dialog', {
        name: stockPicker ? '选择出库库存' : `选择${family}物料`,
        exact: true
      })
      await expect(
        materials.locator('.el-table__body').getByText('NEW-MAT-1', { exact: true })
      ).toBeVisible()
      await expect(materials.getByRole('button', { name: '确定', exact: true })).toBeEnabled()
      if (stockPicker) {
        await expect(materials.locator('.art-table')).toHaveAttribute('aria-busy', 'false')
        await materials.locator('.el-table__body .el-checkbox__inner').nth(0).click()
        await expect(
          materials.locator('.el-table__body').getByRole('checkbox').nth(0)
        ).toBeChecked()
        await materials.locator('.el-table__body .el-checkbox__inner').nth(1).click()
        await expect(
          materials.getByRole('complementary').getByText('已选 2', { exact: true })
        ).toBeVisible()
      } else await materials.locator('.el-table__header-wrapper .el-checkbox').click()
      await materials.getByRole('button', { name: '确定', exact: true }).click()
      const rows = drawer.locator('.el-table__body tr')
      await expect(rows).toHaveCount(2)
      const headers = await drawer.locator('.el-table__header-wrapper th').allTextContents()
      const warehouseIndex = headers.findIndex((text) =>
        /^(入库|出库)?仓库$/.test(text.replace('*', '').replace('（必填）', '').trim())
      )
      expect(warehouseIndex).toBeGreaterThan(-1)
      for (const row of await rows.all()) {
        await row.getByRole('spinbutton').first().fill('2')
        await row.getByRole('spinbutton').first().press('Tab')
        const warehouseControl = row.locator('td').nth(warehouseIndex).getByRole('combobox')
        await warehouseControl.click()
        const dropdownId = await warehouseControl.getAttribute('aria-controls')
        expect(dropdownId).toBeTruthy()
        await page
          .locator(`[id="${dropdownId}"]`)
          .getByRole('option', { name: /测试新增仓库/ })
          .click()
      }
      await remark.fill(`新增草稿 ${draft}`)
      const entrusted = kind.startsWith('entrusted_processing_')
      await expect(
        drawer.getByText(entrusted ? '受托加工库存' : '正常库存', { exact: true })
      ).toHaveCount(2)
      const lineBody = drawer.locator('.el-table__body')
      await expect(lineBody.getByText(entrusted ? '客户' : '自有', { exact: true })).toHaveCount(
        entrusted ? 2 : 4
      )
      if (entrusted) {
        const ownerIndex = headers.findIndex((text) => text.trim() === '货主')
        expect(ownerIndex).toBeGreaterThan(-1)
        for (const row of await rows.all()) {
          await expect(row.locator('td').nth(ownerIndex).getByRole('textbox')).toHaveValue(
            '测试客户'
          )
        }
      }
      rejectSave = true
      await editSave.click()
      await expect(page.getByText('测试保存失败，请重试', { exact: true })).toBeVisible()
      await expect(remark).toHaveValue(`新增草稿 ${draft}`)
      await expect(rows).toHaveCount(2)
      await page.screenshot({
        path: testInfo.outputPath(`new-${draft}-save-retry.png`),
        animations: 'disabled'
      })
      rejectSave = false
      await editSave.click()
      await expect(drawer).toBeHidden()
      expect(payloads).toHaveLength(4 + draft * 2)
      expect(payloads.at(-1)).toEqual(payloads.at(-2))
      expect(payloads.at(-1)?.p_payload).toMatchObject({
        kind,
        is_initialization: kind.startsWith('initial_'),
        remark: `新增草稿 ${draft}`
      })
      const saved = payloads.at(-1)?.p_payload
      expect(saved).toHaveProperty('lines')
      if (typeof saved === 'object' && saved !== null && 'lines' in saved) {
        expect(saved.lines).toHaveLength(2)
        expect(saved.lines).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              stock_type: entrusted ? 'entrusted_processing' : 'normal',
              owner_type: entrusted ? 'customer' : 'self'
            })
          ])
        )
      }
    }
    expect(errors).toEqual([])
  })
}
