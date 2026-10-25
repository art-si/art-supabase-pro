import { expect, test } from '@playwright/test'
import { expectInputTextUnclipped } from './support/input-text-width'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(420_000)
for (const kind of ['issue', 'return', 'finished_inbound', 'finished_return']) {
  test(`${kind}详情失败恢复及两行编辑复制保持布局`, async ({ page }, testInfo) => {
    let failure = true
    let serialFailure = true
    let batchSerialFailure = true
    const batchSerialRequests: string[] = []
    let writes = 0
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const outbound = kind === 'issue' || kind === 'finished_return'
    const negative = kind === 'return' || kind === 'finished_return'
    const lines = [1, 2].map((n) => ({
      id: `line-${n}`,
      line_no: n,
      material_id: `material-${n}`,
      material: {
        id: `material-${n}`,
        material_code: `MAT-${n}`,
        material_name: `测试生产物料 ${n}（完整规格和型号用于核对）`,
        unit_conversions: [],
        serial_management_enabled: true
      },
      work_order_id: null,
      project_id: null,
      construction_no: null,
      inventory_unit_id: 'unit-test',
      production_unit_id: null,
      requested_quantity: negative ? -2 : 2,
      actual_quantity: negative ? -2 : 2,
      base_unit_id: null,
      base_quantity: negative ? -2 : 2,
      batch_no: `BATCH-TEST-${n}`,
      warehouse_id: 'warehouse-test',
      bin_id: null,
      source_batch_id: outbound && n === 1 ? 'source-batch-test' : null,
      pack_id: null,
      source_line_id: null,
      return_type: negative ? 'good' : null,
      stock_type: 'normal',
      owner_type: n === 1 ? 'supplier' : 'customer',
      owner_id: n === 1 ? 'supplier-test' : 'customer-test',
      stock_status: 'available',
      keeper_id: null,
      auxiliary_unit_id: null,
      auxiliary_quantity: null as number | null,
      auxiliary_unit_2_id: null,
      auxiliary_quantity_2: null as number | null,
      production_date: null,
      expiry_date: null,
      tracking_no: null,
      fulfilled_quantity: 1,
      source_document: null,
      source_line_no: null,
      remark: `测试明细备注 ${n}`,
      serial_ids: outbound && n === 1 ? ['serial-1', 'serial-2'] : [],
      serial_nos: !outbound && n === 1 ? ['SN-TEST-001', 'SN-TEST-002'] : [],
      movement_id: null
    }))
    const document = {
      id: 'production-test',
      tenant_id: 'tenant-test',
      kind,
      document_no: `TEST-${kind.toUpperCase()}-001`,
      document_type_id: 'type-test',
      business_type_id: 'business-test',
      organization_id: 'org-test',
      business_date: '2026-10-05',
      warehouse_id: 'warehouse-test',
      work_order_id: null,
      project_id: null,
      customer_id: null,
      demand_date: null,
      applicant_id: null,
      department_id: null,
      keeper_id: null,
      status: 'draft',
      material_status: 'partial',
      remark: '测试单据备注：核对表头及两行明细，不写入真实业务数据。',
      created_at: '2026-10-05',
      updated_at: '2026-10-05',
      approved_at: null,
      lines
    }
    await page.route('**/rest/v1/**', (route) => {
      if (
        route.request().method() !== 'GET' &&
        !route.request().url().includes('/rpc/wms_work_order_options_secure')
      )
        writes++
      const table = new URL(route.request().url()).pathname.split('/').at(-1)
      return route.fulfill({
        headers: {
          'content-range': [
            'mdm_organization',
            'mdm_document_type',
            'mdm_business_type',
            'mdm_supplier',
            'mdm_customer'
          ].includes(table || '')
            ? '0-0/1'
            : '*/0',
          'access-control-expose-headers': 'content-range'
        },
        json:
          table === 'mdm_organization'
            ? [
                {
                  id: 'org-test',
                  tenant_id: 'tenant-test',
                  organization_code: 'ORG',
                  organization_name: '测试库存组织',
                  status: '1',
                  initialization: {
                    enabled_on: '2026-01-01',
                    is_default: true,
                    initialization_closed_at: '2026-01-02'
                  }
                }
              ]
            : table === 'mdm_document_type'
              ? [
                  {
                    id: 'type-test',
                    tenant_id: 'tenant-test',
                    document_type_code: 'TEST',
                    document_type_name: '测试单据类型',
                    is_default: true
                  }
                ]
              : table === 'mdm_business_type'
                ? [
                    {
                      id: 'business-test',
                      tenant_id: 'tenant-test',
                      business_type_code: 'TEST',
                      business_type_name: '测试业务类型',
                      is_default: true
                    }
                  ]
                : table === 'mdm_supplier'
                  ? [
                      {
                        id: 'supplier-test',
                        tenant_id: 'tenant-test',
                        supplier_code: 'SUP-TEST',
                        supplier_name: '测试生产供应商'
                      }
                    ]
                  : table === 'mdm_customer'
                    ? [
                        {
                          id: 'customer-test',
                          tenant_id: 'tenant-test',
                          customer_code: 'CUS-TEST',
                          customer_name: '测试生产客户'
                        }
                      ]
                    : []
      })
    })
    await page.route('**/rest/v1/sys_menu?*', (route) =>
      route.fulfill({ json: { id: 'menu-test' } })
    )
    await page.route('**/rest/v1/wms_production_material_document?*', (route) =>
      failure
        ? route.fulfill({ status: 503, json: { message: '测试单据读取失败', code: 'XX000' } })
        : route.fulfill({ json: document })
    )
    await page.route('**/rest/v1/mdm_warehouse?*', (route) =>
      route.fulfill({
        headers: { 'content-range': '0-1/2', 'access-control-expose-headers': 'content-range' },
        json: [1, 2].map((n) => ({
          id: n === 1 ? 'warehouse-test' : 'warehouse-second',
          tenant_id: 'tenant-test',
          organization_id: 'org-test',
          warehouse_code: `WH-${n}`,
          warehouse_name: `行内仓库${n}`,
          warehouse_type: 'raw_material',
          status: 'enabled',
          enable_locations: false
        }))
      })
    )
    await page.route('**/rest/v1/wms_inventory_batch?*', (route) =>
      route.fulfill({
        headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' },
        json: [
          {
            id: 'source-batch-new',
            tenant_id: 'tenant-test',
            material_id: 'material-1',
            warehouse_id: 'warehouse-test',
            batch_no: 'NEW-SOURCE-BATCH',
            quantity: 5,
            stock_type: 'normal',
            owner_type: 'self',
            owner_id: null,
            stock_status: 'available',
            status: 'normal',
            material: {
              material_code: 'MAT-1',
              material_name: '新来源物料',
              serial_management_enabled: true
            },
            warehouse: { warehouse_code: 'WH-1', warehouse_name: '行内仓库1' },
            bin: null
          }
        ]
      })
    )
    await page.route('**/rest/v1/wms_serial_number?*', (route) => {
      const url = new URL(route.request().url())
      if (url.searchParams.has('batch_id')) {
        batchSerialRequests.push(url.searchParams.get('batch_id')!)
        expect(['eq.source-batch-test', 'eq.source-batch-new']).toContain(
          url.searchParams.get('batch_id')
        )
        return batchSerialFailure
          ? route.fulfill({ status: 503, json: { code: 'XX000', message: '测试来源序列号失败' } })
          : route.fulfill({
              json: [1, 2].map((n) => ({
                id: `serial-${n}`,
                serial_no: `SN-TEST-00${n}`,
                status: 'in_stock'
              }))
            })
      }
      expect(url.searchParams.get('id')).toContain('serial-1')
      expect(url.searchParams.has('status')).toBe(false)
      if (serialFailure)
        return route.fulfill({
          status: 503,
          json: { message: '测试序列号读取失败', code: 'XX000' }
        })
      return route.fulfill({
        json: [1, 2].map((n) => ({
          id: `serial-${n}`,
          serial_no: `SN-TEST-00${n}`,
          status: 'consumed',
          project_id: null,
          construction_no: null
        }))
      })
    })
    await page.route('**/rest/v1/sys_dictionary?*', (route) => {
      const code = new URL(route.request().url()).searchParams
        .get('dict_type_table.code')
        ?.replace(/^eq\./, '')
      const samples: Record<string, Array<[string, string]>> = {
        wmsInitialStockType: [['normal', '普通']],
        wmsInitialStockCondition: [['available', '可用']],
        wmsFinishedQualityStatus: [
          ['available', '合格品'],
          ['defective', '不合格品'],
          ['scrapped', '报废品']
        ],
        mdmBusinessOwnerType: [
          ['self', '自有'],
          ['supplier', '供应商'],
          ['customer', '客户']
        ]
      }
      return route.fulfill({
        json: (samples[code || ''] || []).map(([value, label], index) => ({
          id: `${code}-${value}`,
          code: value,
          value,
          label,
          status: '1',
          sort: index,
          dict_type_table: { code, name: code }
        }))
      })
    })
    await page.goto(`/tests/e2e/fixtures/wms-operation-retry.html?kind=${kind}`)
    const originalBaseQuantity = lines[0].base_quantity
    lines[0].base_quantity = negative ? -12345678.1234 : 12345678.1234
    lines[0].auxiliary_quantity = lines[0].base_quantity
    lines[0].auxiliary_quantity_2 = lines[0].base_quantity
    await page.getByRole('button', { name: '测试生产单据 view', exact: true }).click()
    const drawer = page.locator('.el-drawer:visible')
    await expect(drawer.getByText('单据加载失败', { exact: true })).toBeVisible({
      timeout: 60_000
    })
    await expect(drawer.getByText('测试生产物料 1', { exact: false })).toHaveCount(0)
    failure = false
    await drawer.getByRole('button', { name: '重新加载', exact: true }).click()
    await expect(drawer.getByText(document.document_no, { exact: true }).first()).toBeVisible()
    if (kind === 'finished_inbound') {
      await expect(
        drawer.getByRole('columnheader', { name: '质量状态', exact: true })
      ).toBeAttached()
      await expect(drawer.getByText('合格品', { exact: true }).first()).toBeVisible()
    }
    const baseColumn = await drawer
      .getByRole('columnheader', { name: '基本数量', exact: true })
      .evaluate((cell) => (cell as HTMLTableCellElement).cellIndex)
    const baseCell = drawer
      .locator('.el-table__body tr')
      .first()
      .locator('td')
      .nth(baseColumn)
      .locator('.cell')
    await expect(baseCell).toHaveText(String(lines[0].base_quantity))
    expect(
      await baseCell.evaluate((element) => {
        const range = document.createRange()
        range.selectNodeContents(element)
        return (
          new Set(Array.from(range.getClientRects()).map((rect) => Math.round(rect.top))).size ===
            1 && element.scrollWidth <= element.clientWidth
        )
      }),
      '基本数量长值必须完整单行显示'
    ).toBe(true)
    lines[0].base_quantity = originalBaseQuantity
    await baseCell.scrollIntoViewIfNeeded()
    await baseCell.evaluate((element) => {
      const wrap = element.closest('.el-table')?.querySelector('.el-scrollbar__wrap')
      if (!(wrap instanceof HTMLElement)) throw new Error('基本数量滚动容器缺失')
      const left = Math.max(
        wrap.getBoundingClientRect().left,
        ...Array.from(
          element.closest('tr')?.querySelectorAll('.el-table-fixed-column--left') ?? []
        ).map((cell) => cell.getBoundingClientRect().right)
      )
      wrap.scrollLeft += element.getBoundingClientRect().left - left - 16
    })
    await page.screenshot({
      path: testInfo.outputPath('production-readonly-base-long.png'),
      animations: 'allow'
    })
    for (const label of ['辅助数量', '辅助数量2']) {
      const column = await drawer
        .getByRole('columnheader', { name: label, exact: true })
        .evaluate((cell) => (cell as HTMLTableCellElement).cellIndex)
      const cell = drawer
        .locator('.el-table__body tr')
        .first()
        .locator('td')
        .nth(column)
        .locator('.cell')
      await expect(cell).toHaveText(String(negative ? -12345678.1234 : 12345678.1234))
      expect(
        await cell.evaluate((element) => {
          const range = document.createRange()
          range.selectNodeContents(element)
          return (
            new Set(Array.from(range.getClientRects()).map((rect) => Math.round(rect.top))).size ===
              1 && element.scrollWidth <= element.clientWidth
          )
        }),
        `${label}长值必须完整单行显示`
      ).toBe(true)
      await cell.scrollIntoViewIfNeeded()
      await cell.evaluate((element) => {
        const wrap = element.closest('.el-table')?.querySelector('.el-scrollbar__wrap')
        if (!(wrap instanceof HTMLElement)) throw new Error('辅助数量滚动容器缺失')
        const left = Math.max(
          wrap.getBoundingClientRect().left,
          ...Array.from(
            element.closest('tr')?.querySelectorAll('.el-table-fixed-column--left') ?? []
          ).map((fixedCell) => fixedCell.getBoundingClientRect().right)
        )
        wrap.scrollLeft += element.getBoundingClientRect().left - left - 16
      })
      await expect
        .poll(() =>
          cell.evaluate((element) => {
            const rect = element.getBoundingClientRect()
            return element.contains(
              document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
            )
          })
        )
        .toBe(true)
      await page.screenshot({
        path: testInfo.outputPath(`production-readonly-${label}-long.png`),
        animations: 'allow'
      })
    }
    lines[0].auxiliary_quantity = null
    lines[0].auxiliary_quantity_2 = null
    await expect(drawer.locator('.art-descriptions table')).toHaveClass(/is-bordered/)
    const remarkRow = drawer.locator('.art-descriptions tr').filter({ hasText: document.remark })
    await expect(remarkRow.locator('td')).toHaveCount(2)
    await expect(drawer.getByRole('button', { name: '保存', exact: true })).toHaveCount(0)
    await expect(drawer.locator('.el-table__body').getByRole('checkbox')).toHaveCount(0)
    for (const [header, label] of [
      ['库存类型', '普通'],
      kind === 'finished_inbound' ? ['质量状态', '合格品'] : ['库存状态', '可用'],
      ['货主类型', '供应商']
    ]) {
      const column = await drawer
        .getByRole('columnheader', { name: new RegExp(header) })
        .evaluate((cell) => Array.from(cell.parentElement!.children).indexOf(cell))
      const cell = drawer.locator('.el-table__body tr').first().locator('td').nth(column)
      await cell.scrollIntoViewIfNeeded()
      await expect(cell.getByText(label, { exact: true })).toBeVisible()
    }
    await expect(
      drawer.locator('.el-table__body').getByText('测试生产供应商', { exact: true })
    ).toHaveCount(1)
    await expect(
      drawer.locator('.el-table__body').getByText('测试生产客户', { exact: true })
    ).toHaveCount(1)
    await expect(
      drawer.getByText(lines[1].material.material_name, { exact: true }).first()
    ).toBeVisible()
    expect(await drawer.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
    await drawer
      .locator('.el-table__body')
      .getByText('测试生产供应商', { exact: true })
      .scrollIntoViewIfNeeded()
    await page.screenshot({
      path: testInfo.outputPath('production-owner-names.png'),
      animations: 'disabled'
    })
    await page.screenshot({
      path: testInfo.outputPath('wms-production-view.png'),
      animations: 'disabled'
    })
    await drawer.getByRole('button', { name: '序列号 2', exact: true }).click()
    const serialDialog = page.locator('.el-dialog:visible')
    if (outbound) {
      await expect(serialDialog.getByText('序列号加载失败', { exact: true })).toBeVisible()
      serialFailure = false
      await serialDialog.getByRole('button', { name: '重新加载', exact: true }).click()
    }
    await expect(serialDialog.getByRole('textbox', { name: '当前明细序列号' })).toHaveValue(
      'SN-TEST-001\nSN-TEST-002'
    )
    await expect(serialDialog.getByRole('textbox', { name: '当前明细序列号' })).toHaveAttribute(
      'readonly',
      ''
    )
    await expect(serialDialog.getByRole('button', { name: '保存序列号', exact: true })).toHaveCount(
      0
    )
    await page.screenshot({
      path: testInfo.outputPath('wms-production-serials.png'),
      animations: 'disabled'
    })
    await serialDialog.getByRole('button', { name: '关闭此对话框', exact: true }).click()
    if (outbound) {
      let reopenReads = 0
      let releaseOld = () => {}
      const delayed = new Promise<void>((resolve) => {
        releaseOld = resolve
      })
      await page.route('**/rest/v1/wms_serial_number?*', async (route) => {
        if (!new URL(route.request().url()).searchParams.has('id') || reopenReads >= 2)
          return route.fallback()
        const read = ++reopenReads
        if (read === 1) await delayed
        if (read === 1 && kind === 'finished_return')
          return route.fulfill({
            status: 400,
            json: { code: 'P0001', message: '旧序列号读取失败' }
          })
        return route.fulfill({
          json: [1, 2].map((n) => ({
            id: `serial-${n}`,
            serial_no: read === 1 ? `OLD-SN-${n}` : `CURRENT-SN-${n}`,
            status: 'consumed'
          }))
        })
      })
      await drawer.getByRole('button', { name: '序列号 2', exact: true }).click()
      await expect.poll(() => reopenReads).toBe(1)
      await serialDialog.getByRole('button', { name: '关闭此对话框', exact: true }).click()
      await expect(serialDialog).toBeHidden()
      await drawer.getByRole('button', { name: '序列号 2', exact: true }).click()
      const currentText = serialDialog.getByRole('textbox', { name: '当前明细序列号', exact: true })
      await expect(currentText).toHaveValue('CURRENT-SN-1\nCURRENT-SN-2')
      const oldResponse = page.waitForResponse('**/rest/v1/wms_serial_number?*')
      releaseOld()
      await oldResponse
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
      )
      await expect(currentText).toHaveValue('CURRENT-SN-1\nCURRENT-SN-2')
      await expect(serialDialog.getByText('序列号加载失败', { exact: true })).toHaveCount(0)
      await serialDialog.getByRole('button', { name: '关闭此对话框', exact: true }).click()
    }
    await drawer.getByRole('button', { name: '序列号 0', exact: true }).click()
    await expect(serialDialog.getByText('暂无序列号', { exact: true })).toBeVisible()
    await serialDialog.getByRole('button', { name: '关闭此对话框', exact: true }).click()
    await drawer.getByRole('button', { name: '关闭此对话框', exact: true }).click()
    let optionReads = 0
    let releaseOptions!: () => void
    const heldOptions = new Promise<void>((resolve) => (releaseOptions = resolve))
    let finishOldOptions!: () => void
    const oldOptionsFinished = new Promise<void>((resolve) => (finishOldOptions = resolve))
    await page.route('**/rest/v1/mdm_warehouse?*', async (route) => {
      optionReads++
      if (optionReads !== 1) return route.fallback()
      await heldOptions
      if (kind === 'issue')
        await route.fulfill({
          json: [{ id: 'warehouse-old', warehouse_name: '已关闭窗口旧仓库', status: 'enabled' }]
        })
      else await route.fulfill({ status: 503, json: { code: 'XX000', message: '旧窗口读取失败' } })
      finishOldOptions()
    })
    await page.getByRole('button', { name: '测试生产单据 edit', exact: true }).click()
    await expect.poll(() => optionReads).toBe(1)
    await drawer.getByRole('button', { name: '关闭此对话框', exact: true }).click()
    await page.getByRole('button', { name: '测试生产单据 edit', exact: true }).click()
    await expect(drawer.getByRole('button', { name: '保存', exact: true })).toBeEnabled()
    releaseOptions()
    await oldOptionsFinished
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    )
    await expect(drawer.getByRole('button', { name: '保存', exact: true })).toBeEnabled()
    await expect(drawer.getByText(/^基础资料加载失败/)).toHaveCount(0)
    const reopenedTable = drawer.locator('.art-table.wms-editable-line-table')
    const reopenedWarehouseIndex = await reopenedTable
      .getByRole('columnheader', { name: /^仓库/ })
      .evaluate((cell) => Array.from(cell.parentElement!.children).indexOf(cell))
    const reopenedWarehouse = reopenedTable
      .locator('.el-table__body tr')
      .first()
      .locator('td')
      .nth(reopenedWarehouseIndex)
      .getByRole('combobox')
    await expect(
      reopenedTable
        .locator('.el-table__body tr')
        .first()
        .locator('td')
        .nth(reopenedWarehouseIndex)
        .getByText('行内仓库1', { exact: true })
    ).toBeVisible()
    if (kind === 'finished_return') await expect(reopenedWarehouse).toBeDisabled()
    else {
      await reopenedWarehouse.focus()
      await reopenedWarehouse.press('ArrowDown')
      await expect(page.getByRole('option', { name: '行内仓库1', exact: true })).toBeVisible()
      await expect(page.getByRole('option', { name: '已关闭窗口旧仓库', exact: true })).toHaveCount(
        0
      )
      await page.keyboard.press('Escape')
    }
    await drawer.getByRole('button', { name: '取消', exact: true }).click()
    for (const mode of ['edit', 'copy']) {
      await page.getByRole('button', { name: `测试生产单据 ${mode}`, exact: true }).click()
      await expect(
        drawer.getByText(lines[1].material.material_name, { exact: true }).first()
      ).toBeVisible()
      await expect(
        drawer.getByRole('button', { name: mode === 'copy' ? '保存副本' : '保存', exact: true })
      ).toBeEnabled()
      if (outbound) {
        batchSerialFailure = true
        const serialEntry = drawer.getByRole('button', { name: '序列号 2', exact: true })
        await serialEntry.click()
        const serialEdit = page.getByRole('dialog', { name: '第 1 行序列号', exact: true })
        await expect(serialEdit.getByText('序列号加载失败', { exact: true })).toBeVisible()
        await expect(
          serialEdit.getByRole('button', { name: '保存序列号', exact: true })
        ).toBeDisabled()
        batchSerialFailure = false
        await serialEdit.getByRole('button', { name: '重新加载', exact: true }).click()
        const selection = serialEdit.getByRole('combobox', {
          name: '录入或选择来源序列号',
          exact: true
        })
        await selection.focus()
        await selection.press('ArrowDown')
        await page.getByRole('option', { name: 'SN-TEST-001', exact: true }).click()
        await page.keyboard.press('Escape')
        await serialEdit.getByRole('button', { name: '保存序列号', exact: true }).click()
        await expect(page.getByText(/SN 数量须与.*一致且不能重复/)).toBeVisible()
        await serialEdit.getByRole('button', { name: '取消', exact: true }).click()
        await serialEntry.click()
        await expect(serialEdit.locator('.el-tag')).toHaveCount(2)
        await serialEdit.getByRole('button', { name: '保存序列号', exact: true }).click()
        await expect(serialEdit).toBeHidden()
      }
      if (!outbound) {
        const serialEntry = drawer.getByRole('button', { name: '序列号 2', exact: true })
        await serialEntry.click()
        const serialEdit = page.getByRole('dialog', { name: '第 1 行序列号', exact: true })
        const input = serialEdit.getByRole('textbox', { name: '逐行录入序列号', exact: true })
        await expect(input).toHaveValue('SN-TEST-001\nSN-TEST-002')
        await input.fill('取消草稿')
        await serialEdit.getByRole('button', { name: '取消', exact: true }).click()
        await serialEntry.click()
        await expect(input).toHaveValue('SN-TEST-001\nSN-TEST-002')
        await input.fill('DUPLICATE-SN\nDUPLICATE-SN')
        await serialEdit.getByRole('button', { name: '保存序列号', exact: true }).click()
        await expect(serialEdit).toBeVisible()
        await expect(page.getByText(/SN 数量须与.*一致且不能重复/)).toBeVisible()
        await input.fill('UPDATED-SN-1\nUPDATED-SN-2')
        await serialEdit.getByRole('button', { name: '保存序列号', exact: true }).click()
        await expect(serialEdit).toBeHidden()
        await serialEntry.click()
        await expect(input).toHaveValue('UPDATED-SN-1\nUPDATED-SN-2')
        await input.fill('SN-TEST-001\nSN-TEST-002')
        await serialEdit.getByRole('button', { name: '保存序列号', exact: true }).click()
      }
      if (kind === 'issue') {
        const editableTable = drawer.locator('.art-table.wms-editable-line-table')
        const batchIndex = await editableTable
          .getByRole('columnheader', { name: '来源库存批次', exact: true })
          .evaluate((cell) => Array.from(cell.parentElement!.children).indexOf(cell))
        await editableTable
          .locator('.el-table__body tr')
          .first()
          .locator('td')
          .nth(batchIndex)
          .getByRole('textbox')
          .click()
        const batchPicker = page.getByRole('dialog', { name: '选择来源库存批次', exact: true })
        await batchPicker.getByText('NEW-SOURCE-BATCH', { exact: true }).click()
        await batchPicker.getByRole('button', { name: '确定', exact: true }).click()
        await expect(batchPicker).toBeHidden()
        await expect(drawer.getByRole('button', { name: '序列号 2', exact: true })).toHaveCount(0)
        await expect(
          drawer.locator('.el-table__body tr').first().getByPlaceholder('批号')
        ).toHaveValue('NEW-SOURCE-BATCH')
        const serialReadCount = batchSerialRequests.filter(
          (id) => id === 'eq.source-batch-new'
        ).length
        await drawer
          .locator('.el-table__body tr')
          .first()
          .getByRole('button', { name: '序列号 0', exact: true })
          .click()
        const currentSerialDialog = page.getByRole('dialog', { name: '第 1 行序列号', exact: true })
        await expect
          .poll(() => batchSerialRequests.filter((id) => id === 'eq.source-batch-new').length)
          .toBe(serialReadCount + 1)
        await expect(
          currentSerialDialog.getByRole('button', { name: '保存序列号', exact: true })
        ).toBeEnabled()
        await currentSerialDialog.getByRole('button', { name: '取消', exact: true }).click()
      }
      if (kind !== 'finished_return') {
        const editableTable = drawer.locator('.art-table.wms-editable-line-table')
        const warehouseIndex = await editableTable
          .getByRole('columnheader', { name: /^仓库/ })
          .evaluate((cell) => Array.from(cell.parentElement!.children).indexOf(cell))
        expect(warehouseIndex).toBeGreaterThanOrEqual(0)
        const warehouse = editableTable
          .locator('.el-table__body tr')
          .first()
          .locator('td')
          .nth(warehouseIndex)
          .getByRole('combobox')
        await warehouse.focus()
        await warehouse.press('ArrowDown')
        await page.getByRole('option', { name: '行内仓库2', exact: true }).click()
        await expect(drawer.getByRole('button', { name: '序列号 2', exact: true })).toHaveCount(0)
        await warehouse.focus()
        await warehouse.press('ArrowDown')
        await page.getByRole('option', { name: '行内仓库1', exact: true }).click()
        await expect(drawer.getByRole('button', { name: '序列号 2', exact: true })).toHaveCount(0)
      }
      if (kind === 'issue' && mode === 'edit') {
        await page.route('**/rest/v1/mdm_warehouse_bin?*', (route) => {
          const second =
            new URL(route.request().url()).searchParams.get('warehouse_id') ===
            'eq.warehouse-second'
          return route.fulfill({
            json: [
              {
                id: second ? 'bin-second' : 'bin-first',
                bin_name: second ? '第二仓位' : '第一仓位',
                bin_code: second ? 'B2' : 'A1',
                status: 'available'
              }
            ]
          })
        })
        const table = drawer.locator('.art-table.wms-editable-line-table')
        const binColumn = await table
          .getByRole('columnheader', { name: '仓位', exact: true })
          .evaluate((cell) => (cell as HTMLTableCellElement).cellIndex)
        const warehouseColumn = await table
          .getByRole('columnheader', { name: /^仓库/ })
          .evaluate((cell) => (cell as HTMLTableCellElement).cellIndex)
        const rows = table.locator('.el-table__body tr')
        const firstBin = rows.first().locator('td').nth(binColumn).getByRole('combobox')
        await firstBin.focus()
        await firstBin.press('ArrowDown')
        await page.getByRole('option', { name: '第一仓位 · A1', exact: true }).click()
        const secondWarehouse = rows.nth(1).locator('td').nth(warehouseColumn).getByRole('combobox')
        await secondWarehouse.focus()
        await secondWarehouse.press('ArrowDown')
        await page.getByRole('option', { name: '行内仓库2', exact: true }).click()
        const secondBin = rows.nth(1).locator('td').nth(binColumn).getByRole('combobox')
        await secondBin.focus()
        await secondBin.press('ArrowDown')
        await page.getByRole('option', { name: '第二仓位 · B2', exact: true }).click()
        await expect(rows.first().locator('td').nth(binColumn)).toContainText('第一仓位 · A1')
        let releaseFirst = () => {}
        let firstPending = false
        const heldFirst = new Promise<void>((resolve) => {
          releaseFirst = resolve
        })
        await page.route('**/rest/v1/mdm_warehouse_bin?*', async (route) => {
          const first =
            new URL(route.request().url()).searchParams.get('warehouse_id') === 'eq.warehouse-test'
          if (first) {
            firstPending = true
            await heldFirst
          }
          return route.fulfill({
            json: [
              {
                id: first ? 'late-first' : 'current-second',
                bin_name: first ? '迟到第一行仓位' : '当前第二行仓位',
                bin_code: first ? 'OLD' : 'NEW',
                status: 'available'
              }
            ]
          })
        })
        await firstBin.focus()
        await firstBin.press('ArrowDown')
        await expect.poll(() => firstPending).toBe(true)
        await firstBin.press('Tab')
        await secondBin.focus()
        await secondBin.press('ArrowDown')
        await expect(
          page
            .locator('[id="' + (await secondBin.getAttribute('aria-controls')) + '"]')
            .getByRole('option', { name: '当前第二行仓位 · NEW', exact: true })
        ).toBeVisible()
        const oldResponse = page.waitForResponse(
          (response) =>
            response.url().includes('/mdm_warehouse_bin?') &&
            new URL(response.url()).searchParams.get('warehouse_id') === 'eq.warehouse-test'
        )
        releaseFirst()
        await oldResponse
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
            )
        )
        await expect(
          page
            .locator('[id="' + (await secondBin.getAttribute('aria-controls')) + '"]')
            .getByRole('option', { name: '当前第二行仓位 · NEW', exact: true })
        ).toBeVisible()
        await expect(
          page.getByRole('option', { name: '迟到第一行仓位 · OLD', exact: true })
        ).toHaveCount(0)
        await page.screenshot({
          path: testInfo.outputPath('production-row-bin-late-response.png'),
          animations: 'allow'
        })
        await secondBin.press('Tab')
      }
      if (testInfo.project.name.includes('mobile')) {
        await expect(
          drawer.locator(
            '.el-table__body td.el-table-fixed-column--left, .el-table__body td.el-table-fixed-column--right'
          )
        ).toHaveCount(0)
      }
      if (mode === 'copy')
        await expect(drawer.getByText('保存后自动生成', { exact: true })).toBeVisible()
      const table = drawer.locator('.art-table.wms-editable-line-table')
      await expect(page.locator('.el-message')).toHaveCount(0, { timeout: 10000 })
      for (const input of await table
        .locator('.el-table__body tr')
        .first()
        .getByRole('spinbutton')
        .all()) {
        if (await input.isDisabled()) continue
        const original = await input.inputValue()
        await input.fill('12345678.1234')
        await input.press('Tab')
        await expect(input).toHaveValue(negative ? '-12345678.1234' : '12345678.1234')
        await expectInputTextUnclipped(input)
        await input.focus()
        await input.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
            )
        )
        await page.screenshot({
          path: testInfo.outputPath(
            `production-long-quantity-${mode}-${await input.evaluate((element) => element.closest('td')?.cellIndex)}.png`
          ),
          animations: 'allow'
        })
        await input.fill(original)
        await input.press('Tab')
      }
      for (const label of ['生产日期', '有效期至']) {
        const column = await table
          .getByRole('columnheader', { name: label, exact: true })
          .evaluate((element) => (element as HTMLTableCellElement).cellIndex)
        const cell = table.locator('.el-table__body tr').first().locator('td').nth(column)
        const dateInput = cell.locator('.el-date-editor input')
        await dateInput.scrollIntoViewIfNeeded()
        await dateInput.fill('2026-10-07')
        await dateInput.press('Enter')
        await expect(page.locator('.el-message')).toHaveCount(0)
        await expect(dateInput).toHaveValue('2026-10-07')
        await dateInput.hover()
        await expectInputTextUnclipped(dateInput)
      }
      await page.screenshot({
        path: testInfo.outputPath(`wms-production-line-dates-${mode}.png`),
        animations: 'disabled'
      })
      await expect(table.locator('.art-table__required-marker')).toHaveCount(3)
      const sizes = await table.locator('.el-select').evaluateAll((els) =>
        els.map((el) => ({
          width: el.getBoundingClientRect().width,
          cell: el.closest('td')?.getBoundingClientRect().width || 0
        }))
      )
      expect(sizes.length).toBeGreaterThan(5)
      for (const size of sizes) {
        expect(size.width).toBeGreaterThan(80)
        expect(size.width / size.cell).toBeGreaterThan(0.6)
      }
      expect(await drawer.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
      if (mode === 'edit') {
        await drawer.getByRole('button', { name: '全屏', exact: true }).click()
        await expect(drawer).toHaveClass(/(?:^|\s)is-fullscreen(?:\s|$)/)
        const wrap = drawer.locator('.art-drawer__scrollbar > .el-scrollbar__wrap')
        await wrap.evaluate((el) => {
          el.scrollTop = el.scrollHeight
        })
        await expect
          .poll(() =>
            drawer.evaluate((el) => {
              const content = el.querySelector('.art-drawer__content')!.getBoundingClientRect()
              const footer = el.querySelector('.el-drawer__footer')!.getBoundingClientRect()
              return content.bottom <= footer.top + 1
            })
          )
          .toBe(true)
        await page.screenshot({
          path: testInfo.outputPath('production-fullscreen-bottom.png'),
          animations: 'disabled'
        })
        await drawer.getByRole('button', { name: '退出全屏', exact: true }).click()
        await expect(drawer).not.toHaveClass(/(?:^|\s)is-fullscreen(?:\s|$)/)
        await page.screenshot({
          path: testInfo.outputPath('wms-production-edit.png'),
          animations: 'disabled'
        })
        await table.scrollIntoViewIfNeeded()
        await page.screenshot({
          path: testInfo.outputPath('wms-production-edit-lower.png'),
          animations: 'disabled'
        })
      }
      const deleteLines = drawer.getByRole('button', { name: '批量删除', exact: true })
      await expect(deleteLines).toBeDisabled()
      if (mode === 'edit') {
        await table.locator('.el-table__body tr').first().locator('.el-checkbox').click()
        await deleteLines.click()
        await expect(table.locator('.el-table__body tr')).toHaveCount(1)
        await expect(table.locator('.el-table__body tr').first()).toContainText(
          lines[1].material.material_name
        )
        await expect(table.locator('.el-table__body tr').first().locator('td').nth(1)).toHaveText(
          '10'
        )
        await expect(deleteLines).toBeDisabled()
        await table.locator('.el-table__body tr').first().locator('.el-checkbox').click()
      } else {
        await table.locator('.el-table__header-wrapper .el-checkbox').click()
        await expect(table.locator('.el-table__body .el-checkbox.is-checked')).toHaveCount(2)
      }
      await deleteLines.click()
      await expect(table.locator('.el-table__body tr')).toHaveCount(0)
      await expect(deleteLines).toBeDisabled()
      expect(writes).toBe(0)
      await page.screenshot({
        path: testInfo.outputPath(`production-${mode}-delete-lines.png`),
        animations: 'disabled'
      })
      await drawer.getByRole('button', { name: '取消', exact: true }).click()
      await expect(drawer).toHaveCount(0)
    }
    expect(writes).toBe(0)
    await page.getByRole('button', { name: '测试生产单据 create', exact: true }).click()
    await expect(drawer.getByRole('button', { name: '保存', exact: true })).toBeEnabled()
    await expect(drawer.locator('.el-table__body tr')).toHaveCount(0)
    await expect(drawer.getByText(document.document_no, { exact: true })).toHaveCount(0)
    const createRemark = drawer.getByRole('textbox', { name: '备注', exact: true }).first()
    await expect(createRemark).toHaveValue('')
    await createRemark.fill('取消的生产草稿')
    await drawer.getByRole('button', { name: '取消', exact: true }).click()
    await page.getByRole('button', { name: '测试生产单据 create', exact: true }).click()
    await expect(createRemark).toHaveValue('')
    await expect(drawer.locator('.el-table__body tr')).toHaveCount(0)
    await drawer.getByRole('button', { name: '取消', exact: true }).click()
    expect(writes).toBe(0)
    const optionRows: Record<string, object[]> = {
      mdm_organization: [
        {
          id: 'org-test',
          tenant_id: 'tenant-test',
          organization_code: 'ORG-TEST',
          organization_name: '测试生产组织',
          initialization: {
            enabled_on: '2026-10-01',
            initialization_closed_at: '2026-10-02',
            is_default: true
          },
          status: '1'
        }
      ],
      wms_inventory_initialization: [
        {
          organization_id: 'org-test',
          enabled_on: '2026-10-01',
          initialization_closed_at: '2026-10-02',
          is_default: true
        }
      ],
      mdm_warehouse: [
        {
          id: 'warehouse-test',
          tenant_id: 'tenant-test',
          organization_id: 'org-test',
          warehouse_code: 'WH-TEST',
          warehouse_name: '测试生产仓库',
          status: 'enabled',
          warehouse_type: 'finished',
          enable_locations: false
        }
      ],
      mdm_unit_of_measure: [
        { id: 'unit-test', tenant_id: 'tenant-test', unit_code: 'PCS', unit_name: '件' }
      ],
      mdm_document_type: [
        {
          id: 'type-test',
          tenant_id: 'tenant-test',
          document_type_code: 'TYPE-TEST',
          document_type_name: '测试生产类型',
          is_default: true,
          status: 'enabled'
        }
      ],
      mdm_business_type: [
        {
          id: 'business-test',
          tenant_id: 'tenant-test',
          business_type_code: 'BUSINESS-TEST',
          business_type_name: '测试生产业务',
          document_type_id: 'type-test',
          is_default: true,
          status: 'enabled'
        }
      ]
    }
    for (const [tableName, rows] of Object.entries(optionRows))
      await page.route(`**/rest/v1/${tableName}?*`, (route) =>
        route.fulfill({
          json: rows,
          headers: {
            'content-range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0',
            'access-control-expose-headers': 'content-range'
          }
        })
      )
    await page.route('**/rest/v1/wms_production_material_document?*', (route) =>
      route.fulfill({
        json: {
          ...document,
          lines: lines.map((line) => ({
            ...line,
            material: { ...line.material, serial_management_enabled: false },
            work_order_id: 'order-test',
            production_unit_id: 'unit-test',
            source_line_id: negative ? 'source-line-test' : null,
            source_batch_id: kind === 'finished_return' ? 'source-batch-test' : null,
            available_inventory_quantity: 5
          }))
        }
      })
    )
    let saveFailed = true
    const saves: Array<{ p_payload: { save_action: string; kind: string; lines: unknown[] } }> = []
    await page.route('**/rpc/wms_save_production_material_secure', (route) => {
      saves.push(route.request().postDataJSON())
      return route.fulfill(
        saveFailed
          ? { status: 400, json: { code: 'P0001', message: '测试生产单据保存失败' } }
          : { json: 'saved-production-test' }
      )
    })
    for (const saveMode of ['edit', 'copy', 'edit-deleted', 'copy-deleted']) {
      saveFailed = true
      const mode = saveMode.startsWith('copy') ? 'copy' : 'edit'
      const deletedLine = saveMode.endsWith('-deleted')
      await page.getByRole('button', { name: `测试生产单据 ${mode}`, exact: true }).click()
      const saveButton = drawer.getByRole('button', {
        name: mode === 'copy' ? '保存副本' : '保存',
        exact: true
      })
      await expect(saveButton).toBeEnabled()
      await expect(drawer.getByText('测试生产类型', { exact: true })).toBeVisible()
      await expect(drawer.getByText('测试生产业务', { exact: true })).toBeVisible()
      if (deletedLine) {
        await drawer.locator('.el-table__body tr').first().locator('.el-checkbox').click()
        await drawer.getByRole('button', { name: '批量删除', exact: true }).click()
        await expect(drawer.locator('.el-table__body tr')).toHaveCount(1)
      }
      await saveButton.click()
      await expect(page.getByText('测试生产单据保存失败', { exact: true }).first()).toBeVisible()
      await expect(drawer.locator('.el-table__body tr')).toHaveCount(deletedLine ? 1 : 2)
      await expect(drawer.getByRole('textbox', { name: '备注', exact: true }).first()).toHaveValue(
        document.remark
      )
      await page.screenshot({
        path: testInfo.outputPath(`production-${saveMode}-save-error.png`),
        animations: 'disabled'
      })
      saveFailed = false
      await saveButton.click()
      await expect(drawer).toBeHidden()
    }
    expect(saves).toHaveLength(8)
    expect(saves[0]).toEqual(saves[1])
    expect(saves[2]).toEqual(saves[3])
    expect(saves[4]).toEqual(saves[5])
    expect(saves[6]).toEqual(saves[7])
    for (const entry of saves.slice(4)) {
      expect(entry.p_payload.lines).toHaveLength(1)
      expect(entry.p_payload.lines[0]).toMatchObject({
        material_id: 'material-2',
        serial_ids: [],
        serial_nos: []
      })
    }
    expect(saves.map((entry) => entry.p_payload.save_action)).toEqual([
      'edit',
      'edit',
      'copy',
      'copy',
      'edit',
      'edit',
      'copy',
      'copy'
    ])
    expect(
      saves.every(
        (entry, index) =>
          entry.p_payload.kind === kind && entry.p_payload.lines.length === (index < 4 ? 2 : 1)
      )
    ).toBe(true)
    {
      await page.route('**/rest/v1/mdm_material?*', (route) =>
        route.fulfill({
          json: [1, 2].map((n) => ({
            id: `new-material-${n}`,
            material_code: `NEW-MAT-${n}`,
            material_name: `新增生产物料${n}`,
            serial_management_enabled: false,
            inventory_unit_id: 'unit-test',
            production_unit_id: 'unit-test',
            unit_conversions: []
          })),
          headers: { 'content-range': '0-1/2', 'access-control-expose-headers': 'content-range' }
        })
      )
      await page.route('**/rpc/wms_work_order_options_secure', (route) =>
        route.fulfill({
          json: [1, 2].map((n) => ({
            id: `new-order-${n}`,
            work_order_no: `NEW-ORDER-${n}`,
            work_order_type_name: '测试工单类型',
            document_date: '2026-10-19',
            document_status: 'confirmed',
            material_id: `new-material-${n}`,
            material_code: `NEW-MAT-${n}`,
            specification_model: `SPEC-${n}`,
            drawing_no: `DRAW-${n}`,
            project_name: '测试工程',
            planner_name: '测试计划员',
            inbound_warehouse_name: '测试成品仓库',
            order_quantity: 5,
            completed_quantity: 4,
            warehoused_quantity: 1,
            pending_inbound_quantity: 4,
            returned_quantity: 2,
            qualified_inbound_quantity: 2,
            defective_inbound_quantity: 1,
            scrapped_inbound_quantity: 0,
            production_report_control: 'none',
            production_full_issue_control:
              kind === 'finished_inbound' ? (n === 1 ? 'warning' : 'strict') : 'none',
            production_full_issue_scope: 'all',
            production_full_issue_gaps:
              kind === 'finished_inbound'
                ? [
                    {
                      source_line_no: `bom-line-${n}`,
                      material_code: `BOM-MAT-${n}`,
                      material_name: `未领料组件${n}`,
                      required_quantity: 5,
                      issued_quantity: 3,
                      remaining_quantity: 2
                    }
                  ]
                : [],
            project_id: null,
            construction_no: null
          }))
        })
      )
      if (kind === 'finished_inbound') {
        await page.route('**/rest/v1/mes_work_order?*', (route) => {
          const isPublished = route.request().url().includes('new-order-1')
          return route.fulfill({
            json: {
              work_order_no: isPublished ? 'NEW-ORDER-1' : 'NEW-ORDER-2',
              packing_published_at: isPublished ? '2026-10-19T08:00:00Z' : null
            }
          })
        })
        await page.route('**/rest/v1/mes_work_order_pack?*', (route) =>
          route.fulfill({
            json: [
              {
                id: 'new-pack-1',
                work_order_id: 'new-order-1',
                pack_no: 'PK-TEST-001',
                area: 'A区',
                axis: '1轴',
                items: [{ board_id: 'new-board-1', pieces: 1 }]
              }
            ],
            headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
          })
        )
        await page.route('**/rest/v1/mes_work_order_detail?*', (route) =>
          route.fulfill({
            json: [
              {
                id: 'new-board-1',
                area: 'A区',
                number: '1轴-1',
                length_mm: 7000,
                area_sqm: 7
              }
            ],
            headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
          })
        )
      }
      await page.route('**/rest/v1/wms_finished_inbound_source_list?*', (route) =>
        route.fulfill({
          json: [1, 2].map((n) => ({
            id: `new-source-${n}`,
            document_no: `NEW-INBOUND-${n}`,
            line_no: n * 10,
            material_id: `new-material-${n}`,
            material_code: `NEW-MAT-${n}`,
            material_name: `新增生产物料${n}`,
            work_order_id: 'new-order-1',
            work_order_no: 'NEW-ORDER-1',
            warehouse_id: 'warehouse-test',
            inventory_unit_id: 'unit-test',
            production_unit_id: 'unit-test',
            inbound_quantity: 4,
            available_quantity: 4,
            source_batch_id: `new-batch-${n}`,
            stock_type: 'normal',
            owner_type: 'self',
            owner_id: null,
            stock_status: n === 2 ? 'defective' : 'available'
          })),
          headers: { 'content-range': '0-1/2', 'access-control-expose-headers': 'content-range' }
        })
      )
      for (const draft of [1, 2]) {
        await page.getByRole('button', { name: '测试生产单据 create', exact: true }).click()
        const warehouseField = drawer
          .locator('.el-form-item')
          .filter({ has: page.getByText('仓库', { exact: true }) })
        await warehouseField.getByRole('combobox').press('ArrowDown')
        await page.getByRole('option', { name: '测试生产仓库 · WH-TEST', exact: true }).click()
        await drawer
          .getByRole('button', {
            name:
              kind === 'finished_inbound'
                ? '选生产工单'
                : kind === 'finished_return'
                  ? '选单'
                  : '选择物料',
            exact: true
          })
          .click()
        const picker = page.locator('.el-dialog:visible')
        if (kind === 'finished_return') {
          await expect(
            picker.getByRole('columnheader', { name: '质量状态', exact: true })
          ).toBeAttached()
          await expect(picker.getByText('不合格品', { exact: true })).toBeVisible()
          await expect(
            picker.getByRole('columnheader', { name: '可退数量', exact: true })
          ).toBeAttached()
        }
        if (kind === 'finished_inbound') {
          for (const heading of [
            '工单类型',
            '单据日期',
            '单据状态',
            '物料编码',
            '规格型号',
            '图号',
            '项目名称',
            '施工号',
            '计划员',
            '入库仓库',
            '待入库数量',
            '退库数量',
            '合格品入库',
            '不合格品入库',
            '报废品入库'
          ]) {
            await expect(
              picker.getByRole('columnheader', { name: heading, exact: true })
            ).toBeAttached()
          }
          const lastQuantity = picker.getByRole('columnheader', {
            name: '报废品入库',
            exact: true
          })
          await picker
            .locator('.el-table__body-wrapper .el-scrollbar__wrap')
            .evaluate((element) => {
              element.scrollLeft = element.scrollWidth
            })
          await expect(lastQuantity).toBeInViewport()
          await expect
            .poll(() =>
              lastQuantity.evaluate((header) => {
                const columnClass = Array.from(header.classList).find((value) =>
                  /^el-table_.*_column_/.test(value)
                )!
                const cell = header
                  .closest('.el-table')!
                  .querySelector<HTMLElement>(
                    `.el-table__body-wrapper tbody tr:first-child td.${columnClass}`
                  )!
                return Math.abs(
                  header.getBoundingClientRect().left - cell.getBoundingClientRect().left
                )
              })
            )
            .toBeLessThanOrEqual(1)
          await picker.screenshot({
            path: testInfo.outputPath('production-work-order-picker-right.png'),
            animations: 'disabled'
          })
        }
        await expect(
          picker.getByText(
            kind === 'finished_inbound'
              ? 'NEW-ORDER-2'
              : kind === 'finished_return'
                ? 'NEW-INBOUND-2'
                : 'NEW-MAT-2',
            { exact: true }
          )
        ).toBeVisible()
        await picker.locator('.el-table__header-wrapper .el-checkbox').click()
        await expect(
          picker.getByRole('checkbox', { name: '选择所有行', exact: true })
        ).toBeChecked()
        if (draft === 1) {
          await picker.getByRole('button', { name: '取消', exact: true }).click()
          await expect(picker).toBeHidden()
          await expect(drawer.locator('.el-table__body tr')).toHaveCount(0)
          await drawer
            .getByRole('button', {
              name:
                kind === 'finished_inbound'
                  ? '选生产工单'
                  : kind === 'finished_return'
                    ? '选单'
                    : '选择物料',
              exact: true
            })
            .click()
          await expect(
            picker.getByRole('checkbox', { name: '选择所有行', exact: true })
          ).not.toBeChecked()
          await picker.locator('.el-table__header-wrapper .el-checkbox').click()
        }
        await page.screenshot({
          path: testInfo.outputPath(`production-new-picker-${draft}.png`),
          animations: 'disabled'
        })
        await picker.getByRole('button', { name: /确定|确认/ }).click()
        await expect(drawer.locator('.el-table__body tr')).toHaveCount(2)
        if (kind === 'finished_inbound') {
          if (draft === 1) {
            await drawer.getByRole('button', { name: '选排包单', exact: true }).click()
            const packPicker = page.locator('.el-dialog:visible')
            await expect(packPicker.getByText('NEW-ORDER-1', { exact: true })).toBeVisible()
            await packPicker.getByText('NEW-ORDER-2', { exact: true }).click()
            await expect(packPicker.getByText('PK-TEST-001', { exact: true })).toHaveCount(0)
            await packPicker.getByText('NEW-ORDER-1', { exact: true }).click()
            await expect(packPicker.getByText('PK-TEST-001', { exact: true })).toBeVisible()
            for (const heading of [
              '区域',
              '轴线',
              '板材编号',
              '长度 mm',
              '块数',
              '延米 m',
              '面积 ㎡'
            ])
              await expect(packPicker.getByRole('columnheader', { name: heading })).toBeAttached()
            await expect(packPicker.getByText('1轴-1', { exact: true })).toBeVisible()
            await packPicker.screenshot({
              path: testInfo.outputPath('production-pack-picker.png'),
              animations: 'disabled'
            })
            await packPicker
              .locator('.el-table__body-wrapper .el-scrollbar__wrap')
              .evaluate((element) => {
                element.scrollLeft = element.scrollWidth
              })
            await expect(packPicker.getByRole('columnheader', { name: '面积 ㎡' })).toBeInViewport()
            await packPicker.screenshot({
              path: testInfo.outputPath('production-pack-picker-right.png'),
              animations: 'disabled'
            })
            await packPicker.locator('.el-table__body tr').first().locator('.el-checkbox').click()
            await packPicker.getByRole('button', { name: /确定|确认/ }).click()
            await expect(drawer.locator('.el-table__body tr')).toHaveCount(3)
            await expect(drawer.getByText('PK-TEST-001', { exact: true })).toBeVisible()
            await drawer.locator('.el-table__body tr').last().locator('.el-checkbox').click()
            await drawer.getByRole('button', { name: '批量删除', exact: true }).click()
            await expect(drawer.locator('.el-table__body tr')).toHaveCount(2)
          }
          const fullIssueWarning = drawer.getByText(/BOM 组件未完全领料/)
          await expect(fullIssueWarning).toBeVisible()
          await expect(drawer.getByText(/审核和入库过账将被拦截/)).toBeVisible()
          await fullIssueWarning.scrollIntoViewIfNeeded()
          await page.screenshot({
            path: testInfo.outputPath('production-full-issue-warning.png'),
            animations: 'disabled'
          })
          const qualityColumn = await drawer
            .getByRole('columnheader', { name: '质量状态', exact: true })
            .evaluate((cell) => (cell as HTMLTableCellElement).cellIndex)
          const qualitySelect = drawer
            .locator('.el-table__body tr')
            .first()
            .locator('td')
            .nth(qualityColumn)
            .locator('.el-select')
          await qualitySelect.click()
          for (const label of ['合格品', '不合格品', '报废品'])
            await expect(page.getByRole('option', { name: label, exact: true })).toBeVisible()
          await page.getByRole('option', { name: '不合格品', exact: true }).click()
          await expect(qualitySelect).toContainText('不合格品')
          await qualitySelect.scrollIntoViewIfNeeded()
          await drawer.screenshot({
            path: testInfo.outputPath('production-quality-selection.png'),
            animations: 'disabled'
          })
        }
        for (const row of await drawer.locator('.el-table__body tr').all()) {
          for (const input of (await row.getByRole('spinbutton').all()).slice(0, 2)) {
            await input.fill('2')
            await input.press('Tab')
          }
        }
        await drawer
          .getByRole('textbox', { name: '备注', exact: true })
          .first()
          .fill(`新增生产测试单据${draft}`)
        saveFailed = true
        await drawer.getByRole('button', { name: '保存', exact: true }).click()
        await expect(page.getByText('测试生产单据保存失败', { exact: true }).first()).toBeVisible()
        await drawer.locator('.el-table__body tr').last().scrollIntoViewIfNeeded()
        await page.screenshot({
          path: testInfo.outputPath(`production-new-save-error-${draft}.png`),
          animations: 'disabled'
        })
        saveFailed = false
        await drawer.getByRole('button', { name: '保存', exact: true }).click()
        await expect(drawer).toBeHidden()
      }
      expect(saves).toHaveLength(12)
      expect(
        saves
          .slice(8)
          .every(
            (entry) => entry.p_payload.save_action === 'add' && entry.p_payload.lines.length === 2
          )
      ).toBe(true)
    }
    expect(errors).toEqual([])
  })
}
