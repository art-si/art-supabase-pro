import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

for (const oldOutcome of ['success', 'failure'] as const) {
  test(`库存调整来源A-B-A改选隔离旧${oldOutcome}`, async ({ page }, testInfo) => {
    await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
    await page.route('**/rest/v1/wms_inventory_batch?*', (route) =>
      route.fulfill({
        json: ['a', 'b'].map((key) => ({
          id: `batch-${key}`,
          tenant_id: 'tenant-test',
          warehouse_id: 'source-warehouse',
          material_id: 'material-test',
          batch_no: `BATCH-${key.toUpperCase()}`,
          quantity: 2,
          material: { material_name: `批次物料${key}`, serial_management_enabled: true }
        })),
        headers: { 'content-range': '0-1/2', 'access-control-expose-headers': 'content-range' }
      })
    )
    let aReads = 0
    let held = false
    let release = () => {}
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/rest/v1/wms_serial_number?*', async (route) => {
      const isA = new URL(route.request().url()).searchParams.get('batch_id') === 'eq.batch-a'
      if (isA) aReads++
      const old = isA && aReads === 1
      if (old) {
        held = true
        await pending
      }
      if (old && oldOutcome === 'failure')
        return route.fulfill({ status: 400, json: { code: 'P0001', message: '旧A资料失败' } })
      await route.fulfill({
        json: [
          {
            id: old ? 'old-a-sn' : isA ? 'current-a-sn' : 'b-sn',
            serial_no: old ? 'OLD-A-SN' : isA ? 'CURRENT-A-SN' : 'B-SN',
            status: 'in_stock',
            reserved_work_order_id: null
          }
        ]
      })
    })
    await page.goto('/tests/e2e/fixtures/wms-operation-retry.html')
    await page.getByRole('button', { name: '测试库存调整', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '办理库存调整', exact: true })
    await dialog.getByRole('combobox', { name: /调整类型/ }).click()
    await page.getByRole('option', { name: '批次转换', exact: true }).click()
    async function choose(key: string) {
      await dialog.getByPlaceholder('选择来源批次', { exact: true }).click()
      const picker = page.getByRole('dialog', { name: '选择来源库存', exact: true })
      await picker
        .locator('.el-table__body')
        .getByText(`批次物料${key} · BATCH-${key.toUpperCase()}`, { exact: true })
        .click()
      await picker.getByRole('button', { name: '确定', exact: true }).click()
    }
    await choose('a')
    await expect.poll(() => held).toBe(true)
    await choose('b')
    await expect(dialog.getByRole('button', { name: '确定', exact: true })).toBeEnabled()
    await choose('a')
    await expect.poll(() => aReads).toBe(2)
    await expect(dialog.getByRole('button', { name: '确定', exact: true })).toBeEnabled()
    const response = page.waitForResponse(
      (item) =>
        item.url().includes('wms_serial_number') &&
        new URL(item.url()).searchParams.get('batch_id') === 'eq.batch-a'
    )
    release()
    await (await response).finished()
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    )
    await expect(dialog.getByPlaceholder('选择来源批次', { exact: true })).toHaveValue(
      '批次物料a · BATCH-A'
    )
    await expect(
      dialog.getByText('库位、单位或序列号加载失败，请重试后再办理。', { exact: false })
    ).not.toBeVisible()
    await dialog.getByText('请选择操作序列号', { exact: true }).click()
    await expect(page.getByRole('option', { name: 'CURRENT-A-SN', exact: true })).toBeVisible()
    await expect(page.getByRole('option', { name: /^(OLD-A-SN|B-SN)$/ })).toHaveCount(0)
    await page.screenshot({
      path: testInfo.outputPath('adjustment-current-a-candidates.png'),
      animations: 'disabled'
    })
    await page.keyboard.press('Escape')
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
  })
}

for (const failedTable of ['mdm_warehouse_bin', 'mdm_unit_of_measure', 'wms_serial_number']) {
  test(`库存调整${failedTable}资料失败保留输入及原位重试`, async ({ page }, testInfo) => {
    await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
    await page.route('**/rest/v1/wms_inventory_batch?*', (route) =>
      route.fulfill({
        json: [
          {
            id: 'retry-batch',
            tenant_id: 'tenant-test',
            warehouse_id: 'source-warehouse',
            material_id: 'material-test',
            batch_no: 'RETRY-BATCH',
            quantity: 2,
            material: { material_name: '重试资料物料', serial_management_enabled: false }
          }
        ],
        headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
      })
    )
    let recovered = false
    let reads = 0
    await page.route(`**/rest/v1/${failedTable}?*`, (route) => {
      reads++
      return recovered
        ? route.fulfill({ json: [] })
        : route.fulfill({ status: 400, json: { code: 'P0001', message: '测试调整资料读取失败' } })
    })
    const payloads: Record<string, unknown>[] = []
    await page.route('**/rpc/wms_post_adjustment_secure', (route) => {
      payloads.push(route.request().postDataJSON().p_payload)
      return route.fulfill({ json: null })
    })
    await page.goto('/tests/e2e/fixtures/wms-operation-retry.html')
    await page.getByRole('button', { name: '测试库存调整', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '办理库存调整', exact: true })
    await dialog.getByRole('combobox', { name: /调整类型/ }).click()
    await page.getByRole('option', { name: '批次转换', exact: true }).click()
    await dialog.getByRole('textbox', { name: /新批号/ }).fill('RETRY-NEW')
    await dialog.getByRole('textbox', { name: '调整原因', exact: true }).fill('读取失败保留原因')
    await dialog.getByPlaceholder('选择来源批次', { exact: true }).click()
    const picker = page.getByRole('dialog', { name: '选择来源库存', exact: true })
    await picker
      .locator('.el-table__body')
      .getByText('重试资料物料 · RETRY-BATCH', { exact: true })
      .click()
    await picker.getByRole('button', { name: '确定', exact: true }).click()
    await expect(
      dialog.getByText('库位、单位或序列号加载失败，请重试后再办理。', { exact: false })
    ).toBeVisible()
    const confirm = dialog.getByRole('button', { name: '确定', exact: true })
    await expect(confirm).toBeDisabled()
    // 选择来源按既有规则清理目标字段，随后填写的用户输入应在重试中保留。
    await dialog.getByRole('textbox', { name: /新批号/ }).fill('RETRY-NEW')
    await expect(dialog.getByRole('textbox', { name: '调整原因', exact: true })).toHaveValue(
      '读取失败保留原因'
    )
    expect(payloads).toHaveLength(0)
    recovered = true
    await dialog.getByRole('button', { name: '重新加载', exact: true }).click()
    await expect(confirm).toBeEnabled()
    await expect(
      dialog.getByText('库位、单位或序列号加载失败，请重试后再办理。', { exact: false })
    ).not.toBeVisible()
    expect(reads).toBe(2)
    await expect(dialog.getByPlaceholder('选择来源批次', { exact: true })).toHaveValue(
      '重试资料物料 · RETRY-BATCH'
    )
    await expect(dialog.getByRole('textbox', { name: /新批号/ })).toHaveValue('RETRY-NEW')
    await dialog.getByRole('textbox', { name: '调整原因', exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({
      path: testInfo.outputPath('adjustment-details-retry-preserved.png'),
      animations: 'disabled'
    })
    await confirm.click()
    await expect(dialog).not.toBeVisible()
    expect(payloads).toHaveLength(1)
    expect(payloads[0]).toMatchObject({
      source_batch_id: 'retry-batch',
      quantity: 1,
      target_batch_no: 'RETRY-NEW',
      remark: '读取失败保留原因'
    })
  })
}

for (const action of ['type', 'reopen', 'clear'] as const) {
  for (const outcome of ['success', 'failure'] as const) {
    test(`库存调整资料加载中${action}隔离旧${outcome}`, async ({ page }, testInfo) => {
      await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
      await page.route('**/rest/v1/wms_inventory_batch?*', (route) =>
        route.fulfill({
          json: [
            {
              id: 'pending-batch',
              tenant_id: 'tenant-test',
              warehouse_id: 'source-warehouse',
              material_id: 'material-test',
              batch_no: 'PENDING-BATCH',
              quantity: 2,
              material: { material_name: '等待资料物料', serial_management_enabled: true }
            }
          ],
          headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
        })
      )
      let held = false
      let release = () => {}
      const pending = new Promise<void>((resolve) => {
        release = resolve
      })
      await page.route('**/rest/v1/wms_serial_number?*', async (route) => {
        held = true
        await pending
        await route.fulfill(
          outcome === 'failure'
            ? { status: 400, json: { code: 'P0001', message: '旧序列号资料失败' } }
            : {
                json: [
                  {
                    id: 'old-sn',
                    serial_no: 'OLD-SN',
                    status: 'in_stock',
                    reserved_work_order_id: null
                  }
                ]
              }
        )
      })
      await page.goto('/tests/e2e/fixtures/wms-operation-retry.html')
      await page.getByRole('button', { name: '测试库存调整', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: '办理库存调整', exact: true })
      await dialog.getByRole('textbox', { name: '调整原因', exact: true }).fill('切换类型保留原因')
      await dialog.getByPlaceholder('选择来源批次', { exact: true }).click()
      const picker = page.getByRole('dialog', { name: '选择来源库存', exact: true })
      await picker
        .locator('.el-table__body')
        .getByText('等待资料物料 · PENDING-BATCH', { exact: true })
        .click()
      await picker.getByRole('button', { name: '确定', exact: true }).click()
      await expect.poll(() => held).toBe(true)
      await expect(dialog.getByRole('button', { name: '确定', exact: true })).toBeDisabled()
      await expect(dialog.getByRole('textbox', { name: '调整原因', exact: true })).toBeVisible()
      if (action === 'reopen') {
        await dialog.getByRole('button', { name: /关闭|Close/ }).click()
        await page.getByRole('button', { name: '测试库存调整', exact: true }).click()
      }
      if (action === 'clear') {
        await dialog.getByRole('button', { name: '清空', exact: true }).first().click()
        await expect(dialog.getByRole('spinbutton', { name: /调整数量/ })).toHaveValue('1.000')
        await expect(
          dialog.getByText(
            '正在加载来源批次的库位、单位和序列号，可清空或改选来源，完成后再提交。',
            { exact: true }
          )
        ).not.toBeVisible()
        await expect(dialog.getByRole('button', { name: '确定', exact: true })).toBeEnabled()
      } else {
        await dialog.getByRole('combobox', { name: /调整类型/ }).click()
        await page.getByRole('option', { name: '批次转换', exact: true }).click()
      }
      await expect(dialog.getByPlaceholder('选择来源批次', { exact: true })).toHaveValue('')
      await expect(dialog.getByRole('combobox', { name: /操作序列号/ })).toHaveCount(0)
      const response = page.waitForResponse((item) => item.url().includes('wms_serial_number'))
      release()
      await (await response).finished()
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
      )
      await expect(dialog.getByRole('combobox', { name: /操作序列号/ })).toHaveCount(0)
      await expect(
        dialog.getByText('库位、单位或序列号加载失败，请重试后再办理。', { exact: false })
      ).not.toBeVisible()
      await expect(dialog.getByRole('textbox', { name: '调整原因', exact: true })).toHaveValue(
        action === 'reopen' ? '' : '切换类型保留原因'
      )
      await expect(dialog.getByRole('button', { name: '确定', exact: true })).toBeEnabled()
      await dialog.getByRole('textbox', { name: '调整原因', exact: true }).scrollIntoViewIfNeeded()
      await page.screenshot({
        path: testInfo.outputPath('adjustment-old-detail-ignored.png'),
        animations: 'disabled'
      })
      await dialog.getByRole('button', { name: '取消', exact: true }).click()
    })
  }
}
for (const kind of ['batch', 'attribute', 'bin', 'unit', 'material', 'status'] as const) {
  for (const mode of ['serial', 'pack'] as const) {
    test(`库存调整${kind}${mode}数量约束及失败重试保留`, async ({ page }, testInfo) => {
      await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
      await page.route('**/rest/v1/sys_dictionary?*', (route) =>
        route.fulfill({
          json: [
            {
              id: 'normal-condition',
              label: '正常',
              value: 'normal',
              status: '1',
              sort: 1,
              dict_type_table: { code: 'wmsAdjustmentCondition', name: '库存状态' }
            },
            {
              id: 'frozen-condition',
              label: '测试冻结状态',
              value: 'test_frozen',
              status: '1',
              sort: 2,
              dict_type_table: { code: 'wmsAdjustmentCondition', name: '库存状态' }
            }
          ]
        })
      )
      await page.route('**/rest/v1/mdm_material?*', (route) =>
        route.fulfill({
          json: [
            { id: 'material-test', material_code: 'SOURCE-MAT', material_name: '特殊调整物料' },
            { id: 'target-material', material_code: 'TARGET-MAT', material_name: '特殊目标物料' }
          ],
          headers: { 'content-range': '0-1/2', 'access-control-expose-headers': 'content-range' }
        })
      )
      await page.route('**/rest/v1/mdm_warehouse_bin?*', (route) =>
        route.fulfill({
          json: [
            { id: 'source-bin', bin_code: 'SOURCE', bin_name: '原库位', status: 'available' },
            { id: 'target-bin', bin_code: 'TARGET', bin_name: '新库位', status: 'available' },
            { id: 'disabled-bin', bin_code: 'DISABLED', bin_name: '停用库位', status: 'disabled' }
          ]
        })
      )
      await page.route('**/rest/v1/mdm_unit_of_measure?*', (route) =>
        route.fulfill({
          json: [
            { id: 'source-unit', unit_code: 'PCS', unit_name: '件' },
            { id: 'target-unit', unit_code: 'BOX', unit_name: '箱' },
            { id: 'invalid-unit', unit_code: 'KG', unit_name: '千克' }
          ]
        })
      )
      await page.route('**/rest/v1/wms_inventory_batch?*', (route) =>
        route.fulfill({
          json: [
            {
              id: 'adjust-batch',
              tenant_id: 'tenant-test',
              warehouse_id: 'source-warehouse',
              organization_id: 'source-org',
              material_id: 'material-test',
              batch_no: 'ADJUST-SPECIAL',
              bin_id: 'source-bin',
              quantity: 2,
              status: 'normal',
              project_id: null,
              construction_no: null,
              pack_id: mode === 'pack' ? 'adjust-pack' : null,
              material: {
                material_name: '特殊调整物料',
                serial_management_enabled: mode === 'serial',
                base_unit_id: 'source-unit',
                inventory_unit_id: 'source-unit',
                unit_conversions: [
                  { source_unit_id: 'target-unit', source_factor: 1, base_factor: 10 }
                ]
              }
            }
          ],
          headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
        })
      )
      await page.route('**/rest/v1/wms_serial_number?*', (route) =>
        route.fulfill({
          json:
            mode === 'serial'
              ? [1, 2, 3].map((index) => ({
                  id: `adjust-sn-${index}`,
                  tenant_id: 'tenant-test',
                  batch_id: 'adjust-batch',
                  serial_no: `ADJUST-SN-${index}`,
                  status: 'in_stock',
                  parent_serial_id: null,
                  reserved_work_order_id: index === 3 ? 'other-work-order' : null
                }))
              : []
        })
      )
      const payloads: Record<string, unknown>[] = []
      await page.route('**/rpc/wms_post_adjustment_secure', (route) => {
        payloads.push(route.request().postDataJSON().p_payload)
        return payloads.length === 1
          ? route.fulfill({ status: 400, json: { code: 'P0001', message: '测试特殊调整失败' } })
          : route.fulfill({ json: null })
      })
      await page.goto('/tests/e2e/fixtures/wms-operation-retry.html')
      await page.getByRole('button', { name: '测试库存调整', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: '办理库存调整', exact: true })
      const fillTarget = async () => {
        if (kind === 'batch')
          await dialog.getByRole('textbox', { name: /新批号/ }).fill('ADJUST-NEW')
        else if (kind === 'attribute') {
          await dialog.getByRole('textbox', { name: '跟踪号', exact: true }).fill('ATTRIBUTE-TRACK')
          await dialog.getByRole('textbox', { name: /^辅助属性/ }).fill('{"颜色":"灰色"}')
        } else if (kind === 'status') {
          await dialog.getByRole('combobox', { name: /目标状态/ }).click()
          await expect(page.getByRole('option', { name: '正常', exact: true })).toHaveCount(0)
          await page.getByRole('option', { name: '测试冻结状态', exact: true }).click()
        } else if (kind === 'material') {
          await dialog.getByPlaceholder('选择目标物料', { exact: true }).click()
          const materialPicker = page.getByRole('dialog', { name: /选择目标物料/ })
          await expect(
            materialPicker.locator('.el-table__body').getByText('特殊调整物料', { exact: true })
          ).toHaveCount(0)
          await materialPicker
            .locator('.el-table__body')
            .getByText('特殊目标物料', { exact: true })
            .click()
          await materialPicker.getByRole('button', { name: '确定', exact: true }).click()
          await dialog.getByRole('spinbutton', { name: /转换后数量/ }).fill('2')
          await dialog.getByRole('textbox', { name: /目标批号/ }).fill('MATERIAL-NEW')
        } else {
          await dialog
            .getByRole('combobox', { name: kind === 'bin' ? /目标库位/ : /目标显示单位/ })
            .click()
          await expect(
            page.getByRole('option', {
              name: kind === 'bin' ? 'SOURCE · 原库位' : '千克',
              exact: true
            })
          ).toHaveCount(0)
          if (kind === 'bin')
            await expect(
              page.getByRole('option', { name: 'DISABLED · 停用库位', exact: true })
            ).toHaveCount(0)
          await page
            .getByRole('option', { name: kind === 'bin' ? 'TARGET · 新库位' : '箱', exact: true })
            .click()
        }
      }
      await dialog.getByRole('combobox', { name: /调整类型/ }).click()
      await page
        .getByRole('option', {
          name: {
            batch: '批次转换',
            attribute: '其他属性转换',
            bin: '仓位移动',
            unit: '计量单位转换',
            material: '物料转换',
            status: '库存状态转换'
          }[kind],
          exact: true
        })
        .click()
      await dialog.getByPlaceholder('选择来源批次', { exact: true }).click()
      const picker = page.getByRole('dialog', { name: '选择来源库存', exact: true })
      await picker
        .locator('.el-table__body')
        .getByText('特殊调整物料 · ADJUST-SPECIAL', { exact: true })
        .click()
      await picker.getByRole('button', { name: '确定', exact: true }).click()
      const quantity = dialog.getByRole('spinbutton', { name: /调整数量/ })
      if (mode === 'pack') await expect(quantity).toBeDisabled()
      else {
        await quantity.fill('3')
        await quantity.press('Tab')
      }
      await expect(quantity).toHaveValue('2.000')
      await fillTarget()
      if (mode === 'serial') {
        await dialog.getByRole('button', { name: '确定', exact: true }).click()
        await expect(page.getByText('SN 件数必须与调整数量一致', { exact: true })).toBeVisible()
        expect(payloads).toHaveLength(0)
        await dialog.getByText('请选择操作序列号', { exact: true }).click()
        await expect(page.getByRole('option', { name: 'ADJUST-SN-3', exact: true })).toHaveCount(0)
        for (const index of [1, 2])
          await page.getByRole('option', { name: `ADJUST-SN-${index}`, exact: true }).click()
        await page.keyboard.press('Escape')
      }
      await dialog.getByRole('textbox', { name: '调整原因', exact: true }).fill('特殊调整保留说明')
      await dialog.getByRole('button', { name: '清空', exact: true }).first().click()
      await expect(dialog.getByPlaceholder('选择来源批次', { exact: true })).toHaveValue('')
      await expect(quantity).toBeEnabled()
      await expect(quantity).toHaveValue('1.000')
      await expect(dialog.getByRole('combobox', { name: /操作序列号/ })).toHaveCount(0)
      if (kind === 'batch')
        await expect(dialog.getByRole('textbox', { name: /新批号/ })).toHaveValue('')
      else if (kind === 'attribute') {
        await expect(dialog.getByRole('textbox', { name: '跟踪号', exact: true })).toHaveValue('')
        await expect(dialog.getByRole('textbox', { name: /^辅助属性/ })).toHaveValue('{}')
      } else if (kind === 'material') {
        await expect(dialog.getByPlaceholder('选择目标物料', { exact: true })).toHaveValue('')
        await expect(dialog.getByRole('spinbutton', { name: /转换后数量/ })).toHaveValue('1.000')
        await expect(dialog.getByRole('textbox', { name: /目标批号/ })).toHaveValue('')
      } else if (kind === 'status') {
        await expect(dialog.getByRole('combobox', { name: /目标状态/ })).toHaveValue('')
      } else {
        await expect(
          dialog.getByRole('combobox', { name: kind === 'bin' ? /目标库位/ : /目标显示单位/ })
        ).toHaveValue('')
      }
      await expect(dialog.getByRole('textbox', { name: '调整原因', exact: true })).toHaveValue(
        '特殊调整保留说明'
      )
      await dialog.getByPlaceholder('选择来源批次', { exact: true }).click()
      await picker
        .locator('.el-table__body')
        .getByText('特殊调整物料 · ADJUST-SPECIAL', { exact: true })
        .click()
      await picker.getByRole('button', { name: '确定', exact: true }).click()
      if (mode === 'serial') {
        await quantity.fill('2')
        await dialog.getByText('请选择操作序列号', { exact: true }).click()
        for (const index of [1, 2])
          await page.getByRole('option', { name: `ADJUST-SN-${index}`, exact: true }).click()
        await page.keyboard.press('Escape')
      }
      await fillTarget()
      await dialog.getByRole('button', { name: '确定', exact: true }).click()
      await expect.poll(() => payloads.length).toBe(1)
      await expect(quantity).toHaveValue('2.000')
      await expect(dialog.getByRole('textbox', { name: '调整原因', exact: true })).toHaveValue(
        '特殊调整保留说明'
      )
      await quantity.scrollIntoViewIfNeeded()
      await page.screenshot({
        path: testInfo.outputPath('adjustment-special-rejected.png'),
        animations: 'disabled'
      })
      await dialog.getByRole('button', { name: '确定', exact: true }).click()
      await expect(dialog).not.toBeVisible()
      expect(payloads).toHaveLength(2)
      expect(payloads[1]).toEqual(payloads[0])
      expect(payloads[1]).toMatchObject({
        adjustment_type: {
          batch: 'batch_convert',
          attribute: 'attribute_convert',
          bin: 'bin_move',
          unit: 'unit_convert',
          material: 'material_convert',
          status: 'status_convert'
        }[kind],
        source_batch_id: 'adjust-batch',
        quantity: 2,
        ...(kind === 'batch'
          ? { target_batch_no: 'ADJUST-NEW' }
          : kind === 'attribute'
            ? {
                tracking_no: 'ATTRIBUTE-TRACK',
                auxiliary_attributes: { 颜色: '灰色' },
                production_date: null,
                expiry_date: null
              }
            : kind === 'bin'
              ? { target_bin_id: 'target-bin' }
              : kind === 'unit'
                ? { target_display_unit_id: 'target-unit' }
                : kind === 'status'
                  ? { target_status: 'test_frozen' }
                  : {
                      target_material_id: 'target-material',
                      target_quantity: 2,
                      target_batch_no: 'MATERIAL-NEW'
                    }),
        serial_ids: mode === 'serial' ? ['adjust-sn-1', 'adjust-sn-2'] : [],
        remark: '特殊调整保留说明'
      })
    })
  }
}
