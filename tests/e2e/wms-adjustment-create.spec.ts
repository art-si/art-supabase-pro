import { expect, test, type Page } from '@playwright/test'
import { installFixtures, meta, tenantId } from './support/inventory-fixtures'
import { mockApplicationMenus } from './support/menu-rpc'
import { prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })

async function installAdjustmentMenu(
  page: Page,
  savedRecords: Record<string, unknown>[],
  canPost = true
) {
  await installFixtures(page)
  await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: false }))
  await page.route('**/rest/v1/sys_user?*', (route) =>
    route.fulfill({
      json: {
        id: 'ordinary-adjustment-user',
        auth_user_id: '705ddd8d-4959-4dc1-aeb0-08caed7ab51a',
        user_name: '库存调整用户',
        user_email: 'adjustment@example.invalid',
        user_type: '2',
        user_roles: ['R_USER'],
        status: '1',
        tenant_id: tenantId,
        tenant: { id: tenantId, tenant_code: 'DEMO', tenant_name: '示例工厂' }
      }
    })
  )
  await prepareAppearance(page, { theme: 'light', boxBorderMode: true })
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
        id: 'adjustment-menu',
        parentId: null,
        name: 'WmsAdjustment',
        path: '/wms/adjustment-business/adjustment',
        component: '/wms/adjustment-business/adjustment',
        type: 'menu',
        sort: 1,
        meta: meta('库存调整')
      },
      ...['View', ...(canPost ? ['Post'] : [])].map((action) => ({
        id: `adjustment-${action}`,
        parentId: 'adjustment-menu',
        name: `WmsAdjustment:${action}`,
        path: '',
        component: '',
        type: 'button',
        sort: 1,
        meta: meta(action)
      }))
    ]
  })
  await page.route('**/rest/v1/wms_adjustment_document?*', (route) =>
    route.fulfill({
      json: savedRecords,
      headers: {
        'content-range': `0-${Math.max(0, savedRecords.length - 1)}/${savedRecords.length}`,
        'access-control-expose-headers': 'content-range'
      }
    })
  )
  await page.route('**/rest/v1/sys_dictionary?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'condition-normal',
          label: '正常',
          value: 'normal',
          status: '1',
          sort: 1,
          dict_type_table: { code: 'wmsAdjustmentCondition', name: '库存状态' }
        },
        {
          id: 'condition-frozen',
          label: '测试冻结状态',
          value: 'test_frozen',
          status: '1',
          sort: 2,
          dict_type_table: { code: 'wmsAdjustmentCondition', name: '库存状态' }
        }
      ]
    })
  )
}

test('库存调整仅查看菜单隐藏办理入口', async ({ page }) => {
  await installAdjustmentMenu(page, [], false)
  await page.goto('#/wms/adjustment-business/adjustment')
  await expect(page.getByRole('heading', { name: '库存调整', exact: true })).toBeVisible()
  await expect(page.getByText('当前范围暂无库存调整单', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '办理调整', exact: true })).toHaveCount(0)
})

test('属性转换菜单两张新增格式校验失败重试及重开清理', async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  const savedRecords: Record<string, unknown>[] = []
  let writes = 0
  const payloads: unknown[] = []
  let failed = true
  await installAdjustmentMenu(page, savedRecords)
  await page.route('**/rest/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (!path.endsWith('/wms_inventory_batch')) return route.fallback()
    return route.fulfill({
      json: path.endsWith('/wms_inventory_batch')
        ? [
            {
              id: 'batch-test',
              tenant_id: tenantId,
              warehouse_id: 'source-warehouse',
              material_id: 'material-test',
              batch_no: 'ATTRIBUTE-001',
              quantity: 10,
              material: { material_name: '测试属性物料', serial_management_enabled: false }
            }
          ]
        : [],
      headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
    })
  })
  await page.route('**/rpc/wms_post_adjustment_secure', (route) => {
    writes++
    payloads.push(route.request().postDataJSON())
    if (!failed) {
      const payload = route.request().postDataJSON().p_payload
      savedRecords.push({
        id: `attribute-saved-${savedRecords.length + 1}`,
        tenant_id: tenantId,
        document_no: payload.document_no,
        adjustment_type: payload.adjustment_type,
        source_batch_id: payload.source_batch_id,
        target_batch_id: 'attribute-target',
        source_material_id: 'material-test',
        target_material_id: 'material-test',
        source_quantity: payload.quantity,
        target_quantity: payload.quantity,
        project_id: null,
        construction_no: null,
        source_movement_id: 'attribute-out',
        target_movement_id: 'attribute-in',
        remark: null,
        created_at: '2026-10-06T01:00:00Z',
        sourceMaterial: { material_code: 'ATTRIBUTE-MAT', material_name: '测试属性物料' },
        targetMaterial: { material_code: 'ATTRIBUTE-MAT', material_name: '测试属性物料' },
        sourceBatch: {
          batch_no: 'ATTRIBUTE-001',
          warehouse_id: 'source-warehouse',
          status: 'normal'
        },
        targetBatch: {
          batch_no: 'ATTRIBUTE-TARGET',
          warehouse_id: 'source-warehouse',
          status: 'normal',
          production_date: payload.production_date,
          expiry_date: payload.expiry_date,
          tracking_no: payload.tracking_no
        }
      })
    }
    return failed
      ? route.fulfill({ status: 400, json: { code: 'P0001', message: '测试属性调整失败' } })
      : route.fulfill({ json: null })
  })
  await page.goto('#/wms/adjustment-business/adjustment')
  for (const documentIndex of [1, 2]) {
    failed = true
    await page.getByRole('button', { name: '办理调整', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: /办理库存调整/ })
    await expect(dialog.getByPlaceholder('选择来源批次', { exact: true })).toHaveValue('')
    await dialog.getByRole('combobox', { name: /调整类型/ }).click()
    await page.getByRole('option', { name: '其他属性转换', exact: true }).click()
    await dialog.getByPlaceholder('选择来源批次', { exact: true }).click()
    const picker = page.getByRole('dialog', { name: /选择来源库存/ })
    await picker
      .locator('.el-table__body')
      .getByText('测试属性物料 · ATTRIBUTE-001', { exact: true })
      .click()
    await picker.getByRole('button', { name: '确定', exact: true }).click()
    const attributes = dialog.getByRole('textbox', { name: /辅助属性/ })
    await expect(attributes).toHaveValue('{}')
    await expect(dialog.getByRole('combobox', { name: /生产日期/ })).toHaveValue('')
    await expect(dialog.getByRole('combobox', { name: /到期日期/ })).toHaveValue('')
    await expect(dialog.getByRole('textbox', { name: /跟踪号/ })).toHaveValue('')
    await dialog.getByRole('spinbutton', { name: /调整数量/ }).fill(String(documentIndex + 1))
    for (const [value, message] of [
      ['{invalid', '辅助属性格式无效，请填写字段名与值组成的对象'],
      ['[]', '辅助属性须为字段名与值组成的对象'],
      ['null', '辅助属性须为字段名与值组成的对象']
    ]) {
      await attributes.fill(value)
      await dialog.getByRole('button', { name: '确定', exact: true }).click()
      await expect(dialog.getByText(message, { exact: true })).toBeVisible()
      await expect(attributes).toBeInViewport()
      expect(writes).toBe((documentIndex - 1) * 2)
    }
    await page.screenshot({
      path: testInfo.outputPath(`adjustment-attribute-${documentIndex}-error.png`),
      animations: 'disabled'
    })
    await attributes.fill('{"颜色":"灰色"}')
    await attributes.blur()
    await expect(dialog.locator('.el-form-item__error')).toHaveCount(0)
    for (const date of await dialog.locator('.el-date-editor').all()) {
      expect(
        await date.evaluate(
          (element) =>
            element.getBoundingClientRect().width /
            element.closest('.el-form-item__content')!.getBoundingClientRect().width
        )
      ).toBeGreaterThan(0.95)
    }
    const productionDate = dialog.getByRole('combobox', { name: /生产日期/ })
    const expiryDate = dialog.getByRole('combobox', { name: /到期日期/ })
    await productionDate.fill('2026-10-01')
    await productionDate.press('Tab')
    await expiryDate.fill('2027-10-01')
    await expiryDate.press('Tab')
    const tracking = dialog.getByRole('textbox', { name: /跟踪号/ })
    await tracking.fill(` TRACK-00${documentIndex} `)
    await dialog.getByRole('button', { name: '确定', exact: true }).click()
    await expect(page.getByText('测试属性调整失败', { exact: false }).first()).toBeVisible()
    await expect(attributes).toHaveValue('{"颜色":"灰色"}')
    await expect(productionDate).toHaveValue('2026-10-01')
    await expect(expiryDate).toHaveValue('2027-10-01')
    await expect(tracking).toHaveValue(` TRACK-00${documentIndex} `)
    await page.screenshot({
      path: testInfo.outputPath(`adjustment-attribute-${documentIndex}-rejected.png`),
      animations: 'disabled'
    })
    failed = false
    await dialog.getByRole('button', { name: '确定', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    const saved = savedRecords[documentIndex - 1]
    const savedRow = page
      .locator('.el-table__body tr')
      .filter({ hasText: String(saved.document_no) })
    await expect(savedRow).toHaveCount(1)
    const result = savedRow.getByText(
      `生产 2026-10-01 · 到期 2027-10-01 · 跟踪 TRACK-00${documentIndex}`,
      { exact: true }
    )
    await expect(result).toBeVisible()
    await result.scrollIntoViewIfNeeded()
    await expect(result).toBeInViewport()
    await page.screenshot({
      path: testInfo.outputPath(`attribute-${documentIndex}-saved-list.png`),
      animations: 'disabled'
    })
    await expect(page.locator('.el-table__body tr')).toHaveCount(documentIndex)
    expect(writes).toBe(documentIndex * 2)
    expect(payloads[documentIndex * 2 - 2]).toEqual(payloads[documentIndex * 2 - 1])
    expect(payloads[documentIndex * 2 - 1]).toMatchObject({
      p_payload: {
        adjustment_type: 'attribute_convert',
        source_batch_id: 'batch-test',
        quantity: documentIndex + 1,
        production_date: '2026-10-01',
        expiry_date: '2027-10-01',
        tracking_no: `TRACK-00${documentIndex}`,
        auxiliary_attributes: { 颜色: '灰色' }
      }
    })
  }
  await page.locator('.el-radio-button').filter({ hasText: '按明细' }).click()
  const detailRows = page.locator('.el-table__body tr')
  await expect(detailRows).toHaveCount(4)
  for (const [index, record] of savedRecords.entries()) {
    const source = detailRows.nth(index * 2)
    const target = detailRows.nth(index * 2 + 1)
    await expect(source.getByText('调出', { exact: true })).toBeVisible()
    await expect(target.getByText('调入', { exact: true })).toBeVisible()
    await expect(source.getByText('ATTRIBUTE-001', { exact: true })).toBeVisible()
    await expect(target.getByText('ATTRIBUTE-TARGET', { exact: true })).toBeVisible()
    for (const row of [source, target]) {
      await expect(row.getByText('测试属性物料', { exact: true })).toBeVisible()
      await expect(row.getByText(String(record.source_quantity), { exact: true })).toBeVisible()
    }
  }
  const result = detailRows
    .nth(2)
    .getByText('生产 2026-10-01 · 到期 2027-10-01 · 跟踪 TRACK-002', { exact: true })
  await result.scrollIntoViewIfNeeded()
  await expect(result).toBeInViewport()
  await page.screenshot({
    path: testInfo.outputPath('attribute-saved-line-mode.png'),
    animations: 'disabled'
  })
  await page.locator('.el-radio-button').filter({ hasText: '按单据' }).click()
  await expect(page.locator('.el-table__body tr')).toHaveCount(2)
  expect(writes).toBe(4)
})

for (const entry of ['component', 'menu'] as const) {
  for (const kind of [
    'batch_convert',
    'bin_move',
    'material_convert',
    'unit_convert',
    'status_convert'
  ]) {
    test(`${entry}-${kind}两张新增必填与有效提交失败恢复`, async ({ page }, testInfo) => {
      test.setTimeout(90_000)
      const payloads: unknown[] = []
      const savedRecords: Record<string, unknown>[] = []
      let failed = true
      if (entry === 'component')
        await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
      else {
        await installAdjustmentMenu(page, savedRecords)
      }
      await page.route('**/rest/v1/mdm_unit_of_measure?*', (route) =>
        route.fulfill({
          json: [
            { id: 'source-unit', unit_code: 'PCS', unit_name: '件' },
            { id: 'target-unit', unit_code: 'BOX', unit_name: '箱' },
            { id: 'invalid-unit', unit_code: 'KG', unit_name: '千克' }
          ]
        })
      )
      await page.route('**/rest/v1/mdm_material?*', (route) =>
        route.fulfill({
          json: [
            { id: 'material-test', material_code: 'SOURCE-MAT', material_name: '测试转换物料' },
            { id: 'target-material', material_code: 'TARGET-MAT', material_name: '测试目标物料' }
          ],
          headers: { 'content-range': '0-1/2', 'access-control-expose-headers': 'content-range' }
        })
      )
      await page.route('**/rest/v1/wms_inventory_batch?*', (route) =>
        route.fulfill({
          json: [
            {
              id: 'batch-test',
              tenant_id: entry === 'component' ? 'tenant-test' : tenantId,
              warehouse_id: 'source-warehouse',
              material_id: 'material-test',
              batch_no: 'ADJUST-BATCH-001',
              bin_id: 'source-bin',
              quantity: 10,
              status: 'normal',
              material: {
                material_name: '测试转换物料',
                serial_management_enabled: false,
                base_unit_id: 'source-unit',
                inventory_unit_id: 'source-unit',
                unit_conversions: [
                  { source_unit_id: 'target-unit', source_factor: 1, base_factor: 10 }
                ]
              },
              warehouse: { warehouse_name: '测试仓库' }
            }
          ],
          headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
        })
      )
      await page.route('**/rest/v1/mdm_warehouse_bin?*', (route) =>
        route.fulfill({
          json: [
            { id: 'source-bin', bin_code: 'SOURCE-BIN', bin_name: '原库位', status: 'available' },
            { id: 'target-bin', bin_code: 'TARGET-BIN', bin_name: '目标库位', status: 'available' },
            {
              id: 'disabled-bin',
              bin_code: 'DISABLED-BIN',
              bin_name: '停用库位',
              status: 'disabled'
            }
          ]
        })
      )
      await page.route('**/rpc/wms_post_adjustment_secure', (route) => {
        payloads.push(route.request().postDataJSON())
        if (!failed && entry === 'menu') {
          const payload = route.request().postDataJSON().p_payload
          savedRecords.push({
            id: `saved-adjustment-${savedRecords.length + 1}`,
            tenant_id: tenantId,
            document_no: payload.document_no,
            adjustment_type: payload.adjustment_type,
            source_batch_id: payload.source_batch_id,
            target_batch_id: 'target-batch',
            source_material_id: 'material-test',
            target_material_id: payload.target_material_id || 'material-test',
            source_quantity: payload.quantity,
            target_quantity: payload.target_quantity || payload.quantity,
            project_id: null,
            construction_no: null,
            source_movement_id: 'source-movement',
            target_movement_id: 'target-movement',
            remark: null,
            created_at: '2026-10-06T01:00:00Z',
            sourceMaterial: { material_code: 'SOURCE-MAT', material_name: '测试转换物料' },
            targetMaterial: { material_code: 'TARGET-MAT', material_name: '测试目标物料' },
            sourceBatch: {
              batch_no: 'ADJUST-BATCH-001',
              warehouse_id: 'source-warehouse',
              bin_id: 'source-bin',
              status: 'normal'
            },
            targetBatch: {
              batch_no: payload.target_batch_no || 'TARGET-BATCH',
              warehouse_id: 'source-warehouse',
              bin_id: payload.target_bin_id || 'source-bin',
              status: payload.target_status || 'normal'
            }
          })
        }
        return failed
          ? route.fulfill({ status: 400, json: { code: 'P0001', message: '测试批次调整失败' } })
          : route.fulfill({ json: null })
      })
      await page.goto(
        entry === 'component'
          ? '/tests/e2e/fixtures/wms-operation-retry.html'
          : '#/wms/adjustment-business/adjustment'
      )
      for (const documentIndex of [1, 2]) {
        failed = true
        await page
          .getByRole('button', {
            name: entry === 'component' ? '测试库存调整' : '办理调整',
            exact: true
          })
          .click()
        const dialog = page.getByRole('dialog', { name: /办理库存调整/ })
        await expect(dialog.getByPlaceholder('选择来源批次', { exact: true })).toHaveValue('')
        await expect(dialog.getByRole('spinbutton', { name: /调整数量/ })).toHaveValue('1.000')
        await dialog.getByRole('combobox', { name: /调整类型/ }).click()
        await page
          .getByRole('option', {
            name:
              kind === 'batch_convert'
                ? '批次转换'
                : kind === 'bin_move'
                  ? '仓位移动'
                  : kind === 'material_convert'
                    ? '物料转换'
                    : kind === 'unit_convert'
                      ? '计量单位转换'
                      : '库存状态转换',
            exact: true
          })
          .click()
        await dialog.getByPlaceholder('选择来源批次', { exact: true }).click()
        const picker = page.getByRole('dialog', { name: /选择来源库存/ })
        await picker
          .locator('.el-table__body')
          .getByText('测试转换物料 · ADJUST-BATCH-001', { exact: true })
          .click()
        await picker.getByRole('button', { name: '确定', exact: true }).click()
        await dialog.getByRole('spinbutton', { name: /调整数量/ }).fill(String(documentIndex + 1))
        if (kind === 'batch_convert') {
          const batch = dialog.getByRole('textbox', { name: /新批号/ })
          await batch.fill('   ')
          await dialog.getByRole('button', { name: '确定', exact: true }).click()
          await expect(dialog.getByText('请填写新批号', { exact: true })).toBeVisible()
          expect(payloads).toHaveLength((documentIndex - 1) * 2)
          await page.screenshot({
            path: testInfo.outputPath(`adjustment-${documentIndex}-blank-batch.png`),
            animations: 'disabled'
          })
          await batch.fill(' NEW-BATCH-001 ')
        } else if (kind === 'bin_move') {
          await dialog.getByRole('button', { name: '确定', exact: true }).click()
          await expect(dialog.getByText('请选择目标库位', { exact: true })).toBeVisible()
          expect(payloads).toHaveLength((documentIndex - 1) * 2)
          await dialog.getByRole('combobox', { name: /目标库位/ }).click()
          await expect(page.getByRole('option', { name: /SOURCE-BIN|DISABLED-BIN/ })).toHaveCount(0)
          await page.getByRole('option', { name: /TARGET-BIN/ }).click()
        } else if (kind === 'status_convert') {
          await dialog.getByRole('button', { name: '确定', exact: true }).click()
          await expect(dialog.getByText('请选择目标状态', { exact: true })).toBeVisible()
          expect(payloads).toHaveLength((documentIndex - 1) * 2)
          await dialog.getByRole('combobox', { name: /目标状态/ }).click()
          await expect(page.getByRole('option', { name: '正常', exact: true })).toHaveCount(0)
          await page.getByRole('option', { name: '测试冻结状态', exact: true }).click()
        } else if (kind === 'unit_convert') {
          await dialog.getByRole('button', { name: '确定', exact: true }).click()
          await expect(dialog.getByText('请选择目标单位', { exact: true })).toBeVisible()
          expect(payloads).toHaveLength((documentIndex - 1) * 2)
          await dialog.getByRole('combobox', { name: /目标显示单位/ }).click()
          await expect(page.getByRole('option', { name: /^(件|千克)$/ })).toHaveCount(0)
          await page.getByRole('option', { name: '箱', exact: true }).click()
        } else {
          await dialog.getByRole('button', { name: '确定', exact: true }).click()
          await expect(dialog.getByText('请选择目标物料', { exact: true })).toBeVisible()
          expect(payloads).toHaveLength((documentIndex - 1) * 2)
          await dialog.getByPlaceholder('选择目标物料', { exact: true }).click()
          const materialPicker = page.getByRole('dialog', { name: /选择目标物料/ })
          await expect(
            materialPicker.locator('.el-table__body').getByText('测试转换物料', { exact: true })
          ).toHaveCount(0)
          await materialPicker
            .locator('.el-table__body')
            .getByText('测试目标物料', { exact: true })
            .click()
          await materialPicker.getByRole('button', { name: '确定', exact: true }).click()
          const quantity = dialog.getByRole('spinbutton', { name: /转换后数量/ })
          await quantity.fill('')
          await dialog.getByRole('button', { name: '确定', exact: true }).click()
          await expect(dialog.getByText('请输入有效转换后数量', { exact: true })).toBeVisible()
          expect(payloads).toHaveLength((documentIndex - 1) * 2)
          await quantity.fill('2')
          await quantity.blur()
        }
        await dialog.getByRole('button', { name: '确定', exact: true }).click()
        await expect(page.getByText('测试批次调整失败', { exact: false }).first()).toBeVisible()
        await expect(dialog.locator('.el-form-item__error')).toHaveCount(0)
        if (kind === 'batch_convert')
          await expect(dialog.getByRole('textbox', { name: /新批号/ })).toHaveValue(
            ' NEW-BATCH-001 '
          )
        else if (kind === 'bin_move')
          await expect(dialog.getByText('TARGET-BIN · 目标库位', { exact: true })).toBeVisible()
        else if (kind === 'status_convert')
          await expect(dialog.getByText('测试冻结状态', { exact: true })).toBeVisible()
        else if (kind === 'unit_convert')
          await expect(dialog.getByText('箱', { exact: true })).toBeVisible()
        else
          await expect(dialog.getByPlaceholder('选择目标物料', { exact: true })).toHaveValue(
            '测试目标物料'
          )
        await page.screenshot({
          path: testInfo.outputPath(`adjustment-${documentIndex}-submit-rejected.png`),
          animations: 'disabled'
        })
        failed = false
        await dialog.getByRole('button', { name: '确定', exact: true }).click()
        await expect(dialog).not.toBeVisible()
        if (entry === 'menu') {
          const saved = savedRecords[documentIndex - 1]
          const row = page
            .locator('.el-table__body tr')
            .filter({ hasText: String(saved.document_no) })
          await expect(row).toHaveCount(1)
          await expect(
            row.getByText(`${saved.source_quantity} → ${saved.target_quantity}`, { exact: true })
          ).toBeVisible()
          expect(saved.adjustment_type).toBe(kind)
          expect(savedRecords).toHaveLength(documentIndex)
          if (kind === 'status_convert') {
            const result = row.getByText('正常 → 测试冻结状态', { exact: true })
            await expect(result).toBeVisible()
            await result.scrollIntoViewIfNeeded()
            await expect(result).toBeInViewport()
            await page.screenshot({
              path: testInfo.outputPath(`adjustment-${documentIndex}-saved-status.png`),
              animations: 'disabled'
            })
          }
        }
        expect(payloads).toHaveLength(documentIndex * 2)
        expect(payloads[documentIndex * 2 - 2]).toEqual(payloads[documentIndex * 2 - 1])
        expect(payloads[documentIndex * 2 - 1]).toMatchObject({
          p_payload: {
            adjustment_type: kind,
            source_batch_id: 'batch-test',
            quantity: documentIndex + 1,
            ...(kind === 'batch_convert'
              ? { target_batch_no: 'NEW-BATCH-001' }
              : kind === 'bin_move'
                ? { target_bin_id: 'target-bin' }
                : kind === 'status_convert'
                  ? { target_status: 'test_frozen' }
                  : kind === 'unit_convert'
                    ? { target_display_unit_id: 'target-unit' }
                    : { target_material_id: 'target-material', target_quantity: 2 })
          }
        })
      }
      if (entry === 'menu') {
        await page.locator('.el-radio-button').filter({ hasText: '按明细' }).click()
        const detailRows = page.locator('.el-table__body tr')
        await expect(detailRows).toHaveCount(4)
        await expect(detailRows.getByText('调出', { exact: true })).toHaveCount(2)
        await expect(detailRows.getByText('调入', { exact: true })).toHaveCount(2)
        for (const [index, record] of savedRecords.entries()) {
          const source = detailRows.nth(index * 2)
          const target = detailRows.nth(index * 2 + 1)
          await expect(source.getByText('测试转换物料', { exact: true })).toBeVisible()
          await expect(source.getByText('ADJUST-BATCH-001', { exact: true })).toBeVisible()
          await expect(
            source.getByText(String(record.source_quantity), { exact: true })
          ).toBeVisible()
          await expect(target.getByText('测试目标物料', { exact: true })).toBeVisible()
          await expect(
            target.getByText(String(record.target_quantity), { exact: true })
          ).toBeVisible()
        }
        const lastCell = detailRows.last().locator('td').last()
        await page.locator('.el-table__body-wrapper .el-scrollbar__wrap').evaluate((element) => {
          element.scrollLeft = element.scrollWidth
        })
        await lastCell.scrollIntoViewIfNeeded()
        await expect(lastCell).toBeInViewport({ ratio: 1 })
        await page.screenshot({
          path: testInfo.outputPath('adjustment-saved-line-last-column.png'),
          animations: 'disabled'
        })
        await page.locator('.el-radio-button').filter({ hasText: '按单据' }).click()
        await expect(page.locator('.el-table__body tr')).toHaveCount(2)
      }
    })
  }
}
