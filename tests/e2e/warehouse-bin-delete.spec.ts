import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
for (const scenario of ['success', 'blocked', 'inspection-error', 'concurrent'] as const) {
  test(`缩层删除先检查引用并处理 ${scenario}`, async ({ page }, testInfo) => {
    await prepareIsolatedSession(page)
    let saved = false
    let rejected = false
    const events: string[] = []
    await page.route('**/rest/v1/mdm_warehouse?**', (route) =>
      route.fulfill({
        json: [
          {
            id: 'warehouse-1',
            tenant_id: 'test-tenant',
            warehouse_code: 'WH01',
            warehouse_name: '测试仓库',
            enable_locations: true,
            enable_zones: false,
            status: 'enabled'
          }
        ]
      })
    )
    await page.route('**/rest/v1/mdm_warehouse_bin?**', (route) =>
      route.fulfill({
        json: Array.from({ length: saved ? 1 : 2 }, (_, index) => ({
          id: `bin-${index + 1}`,
          tenant_id: 'test-tenant',
          warehouse_id: 'warehouse-1',
          zone_id: null,
          parent_id: null,
          bin_code: `A1-0${index + 1}-01`,
          bin_name: `A1 · ${index + 1} 层 1 列`,
          bin_type: 'shelf',
          shelf_code: 'A1',
          level_no: index + 1,
          column_no: 1,
          code_separator: '-',
          status: 'available',
          sort: index + 1
        }))
      })
    )
    await page.route('**/rest/v1/rpc/wms_storage_overview_secure**', (route) =>
      route.fulfill({ json: { stale_days: 90, zones: [], bins: [] } })
    )
    await page.route('**/rest/v1/rpc/get_record_delete_dependency_details**', (route) => {
      events.push('inspect')
      expect(route.request().postDataJSON()).toMatchObject({
        p_table: 'mdm_warehouse_bin',
        p_ids: ['bin-2']
      })
      if (scenario === 'inspection-error')
        return route.fulfill({ status: 403, json: { code: '42501', message: '无权检查关联' } })
      return route.fulfill({
        json:
          scenario === 'blocked' || rejected
            ? [
                {
                  resource_id: 'bin-2',
                  source_table: 'wms_inventory_batch',
                  record_id: 'batch-1',
                  target_id: 'batch-1',
                  record_no: 'BATCH-001',
                  record_summary: '测试库存批次',
                  record_status: 'available',
                  created_at: null
                }
              ]
            : []
      })
    })
    await page.route('**/rest/v1/rpc/mdm_update_warehouse_shelf_secure**', (route) => {
      events.push('save')
      expect(route.request().postDataJSON()).toMatchObject({
        p_levels: 1,
        p_columns: 1,
        p_expected_bin_ids: ['bin-1', 'bin-2']
      })
      if (scenario === 'concurrent') {
        rejected = true
        return route.fulfill({ status: 409, json: { code: '23503', message: '库位已有业务引用' } })
      }
      saved = true
      return route.fulfill({ json: null })
    })
    await page.goto('/tests/e2e/fixtures/warehouse-bin-delete.html')
    await page.getByRole('button', { name: '编辑货架', exact: true }).click()
    const editor = page.getByRole('dialog', { name: '编辑货架 · A1' })
    await editor.getByRole('spinbutton', { name: /层数/ }).fill('1')
    await editor.getByRole('button', { name: '保存货架', exact: true }).click()
    if (scenario === 'blocked' || scenario === 'inspection-error') {
      const guard = page.getByRole('dialog', { name: /暂时无法删除|删除检查未完成/ })
      await expect(guard).toContainText(scenario === 'blocked' ? 'BATCH-001' : '重试')
      expect(events).toEqual(['inspect'])
      await expect(page.locator('.el-message-box')).toHaveCount(0)
    } else {
      const confirmation = page.locator('.el-message-box')
      await expect(confirmation).toContainText('1 个超出层列范围的库位')
      expect(events).toEqual(['inspect'])
      await confirmation.getByRole('button', { name: /确定|删除/ }).click()
      if (scenario === 'concurrent') {
        await expect(page.getByRole('dialog', { name: '暂时无法删除库位' })).toContainText(
          'BATCH-001'
        )
        expect(events).toEqual(['inspect', 'save', 'inspect'])
      } else {
        await expect(editor).toBeHidden()
        expect(events).toEqual(['inspect', 'save'])
      }
    }
    await page.screenshot({
      path: testInfo.outputPath(`shelf-shrink-${scenario}.png`),
      animations: 'disabled'
    })
  })
}

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('生成货架按层列预览编码，保留分隔符且失败后可重试', async ({ page }, testInfo) => {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/mdm_warehouse?**', (route) =>
    route.fulfill({
      json: [
        {
          id: 'warehouse-1',
          tenant_id: 'test-tenant',
          warehouse_code: 'WH01',
          warehouse_name: '测试仓库',
          enable_locations: true,
          enable_zones: false,
          status: 'enabled'
        }
      ]
    })
  )
  await page.route('**/rest/v1/mdm_warehouse_bin?**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/rpc/wms_storage_overview_secure**', (route) =>
    route.fulfill({ json: { stale_days: 90, zones: [], bins: [] } })
  )
  let writes = 0
  await page.route('**/rest/v1/rpc/mdm_generate_warehouse_shelf_secure**', (route) => {
    writes++
    expect(route.request().postDataJSON()).toEqual({
      p_warehouse_id: 'warehouse-1',
      p_zone_id: null,
      p_shelf_code: 'A1',
      p_levels: 4,
      p_columns: 3,
      p_max_quantity: null,
      p_separator: '_'
    })
    return writes === 1
      ? route.fulfill({
          status: 400,
          json: { code: '23505', message: '库位编码已被占用，请检查货架编码后重试' }
        })
      : route.fulfill({ json: 12 })
  })
  await page.goto('/tests/e2e/fixtures/warehouse-bin-delete.html')
  await page.getByRole('button', { name: '生成货架', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '批量生成货架库位' })
  await expect(dialog).not.toContainText('编号规则')
  await expect(dialog).toContainText('A1-01-01、A1-01-02、A1-02-01')
  await dialog.getByRole('textbox', { name: '货架编码' }).fill('a1')
  const separator = dialog.getByRole('textbox', { name: '段间分隔符' })
  await separator.fill('')
  await expect(dialog).toContainText('A10101、A10102、A10201')
  await separator.fill('/')
  await dialog.getByRole('button', { name: '生成库位', exact: true }).click()
  await expect(dialog).toContainText('请输入 -、_ 或留空')
  expect(writes).toBe(0)
  await separator.fill('_')
  await separator.blur()
  await expect(dialog.locator('.el-form-item__error')).toHaveCount(0)
  await expect(dialog).toContainText('A1_01_01、A1_01_02、A1_02_01')
  await page.screenshot({
    path: testInfo.outputPath('shelf-position-code.png'),
    animations: 'disabled'
  })
  await dialog.getByRole('button', { name: '生成库位', exact: true }).click()
  await expect.poll(() => writes).toBe(1)
  await expect(dialog).toBeVisible()
  await expect(separator).toHaveValue('_')
  await dialog.getByRole('button', { name: '生成库位', exact: true }).click()
  await expect.poll(() => writes).toBe(2)
  await expect(dialog).toBeHidden()
})

for (const scenario of ['success', 'blocked', 'inspection-error', 'concurrent', 'dense'] as const) {
  test(`库位整架批量删除 ${scenario}`, async ({ page }, testInfo) => {
    await prepareIsolatedSession(page)
    let deleted = false
    let rejected = false
    const events: string[] = []
    await page.route('**/rest/v1/mdm_warehouse?**', (route) =>
      route.fulfill({
        json: [
          {
            id: 'warehouse-1',
            tenant_id: 'test-tenant',
            warehouse_code: 'WH01',
            warehouse_name: '测试仓库',
            enable_locations: true,
            enable_zones: false,
            status: 'enabled'
          }
        ]
      })
    )
    await page.route('**/rest/v1/mdm_warehouse_zone?**', (route) => route.fulfill({ json: [] }))
    await page.route('**/rest/v1/rpc/wms_storage_overview_secure**', (route) =>
      route.fulfill({ json: { stale_days: 90, zones: [], bins: [] } })
    )
    await page.route('**/rest/v1/rpc/mdm_delete_warehouse_bins_secure**', (route) => {
      events.push('delete')
      expect(route.request().postDataJSON()).toEqual({ p_ids: ['bin-1', 'bin-2'] })
      if (scenario === 'concurrent') {
        rejected = true
        return route.fulfill({ status: 409, json: { code: '23503', message: '存在库存引用' } })
      }
      deleted = true
      return route.fulfill({
        json: 2
      })
    })
    await page.route('**/rest/v1/mdm_warehouse_bin?**', (route) => {
      return route.fulfill({
        json: deleted
          ? []
          : Array.from({ length: scenario === 'dense' ? 75 : 2 }, (_, i) => i + 1).map((n) => ({
              id: `bin-${n}`,
              tenant_id: 'test-tenant',
              warehouse_id: 'warehouse-1',
              zone_id: null,
              parent_id: null,
              bin_code:
                scenario === 'dense'
                  ? `C1001-C1001-01-HJ02-L${Math.ceil(n / 15)}-C${((n - 1) % 15) + 1}`
                  : `WH01-S01-L1-C${n}`,
              bin_name: `S01 · 1 层 ${n} 列`,
              bin_type: 'shelf',
              shelf_code: 'S01',
              level_no: scenario === 'dense' ? Math.ceil(n / 15) : 1,
              column_no: scenario === 'dense' ? ((n - 1) % 15) + 1 : n,
              status: 'available',
              sort: n
            }))
      })
    })
    await page.route('**/rest/v1/rpc/get_record_delete_dependency_details**', (route) => {
      events.push('inspect')
      expect(route.request().postDataJSON()).toMatchObject({
        p_table: 'mdm_warehouse_bin',
        p_ids: ['bin-1', 'bin-2']
      })
      if (scenario === 'inspection-error')
        return route.fulfill({ status: 403, json: { code: '42501', message: '无权检查关联' } })
      return route.fulfill({
        json:
          scenario === 'blocked' || rejected
            ? [
                {
                  resource_id: 'bin-1',
                  source_table: 'wms_inventory_batch',
                  record_id: 'batch-1',
                  target_id: 'batch-1',
                  record_no: 'BATCH-001',
                  record_summary: '测试物料库存批次',
                  record_status: 'available',
                  created_at: null
                }
              ]
            : []
      })
    })
    await page.goto('/tests/e2e/fixtures/warehouse-bin-delete.html')
    await page.getByRole('button', { name: '批量删除', exact: true }).click()
    await page.getByText('选择整架', { exact: true }).click()
    const count = scenario === 'dense' ? 75 : 2
    await expect(page.getByRole('button', { name: `删除选中（${count}）` })).toBeEnabled()
    if (scenario === 'dense') {
      const cell = page.locator('.rack-cell').first()
      await cell.hover()
      const tile = await cell.locator('.storage-tile').boundingBox()
      const checkbox = await cell.locator('.el-checkbox').boundingBox()
      const more = await cell.getByRole('button', { name: /操作/ }).boundingBox()
      expect(tile).not.toBeNull()
      for (const box of [checkbox, more]) {
        expect(box).not.toBeNull()
        expect(box!.x).toBeGreaterThanOrEqual(tile!.x)
        expect(box!.y).toBeGreaterThanOrEqual(tile!.y)
        expect(box!.x + box!.width).toBeLessThanOrEqual(tile!.x + tile!.width)
        expect(box!.y + box!.height).toBeLessThanOrEqual(tile!.y + tile!.height)
      }
    }
    await page.screenshot({
      path: testInfo.outputPath('selected.png'),
      animations: 'disabled',
      timeout: 15_000
    })
    if (scenario === 'dense') return
    await page.getByRole('button', { name: '删除选中（2）' }).click()
    if (scenario === 'blocked') {
      await expect(page.getByRole('dialog')).toContainText('BATCH-001')
      await expect(page.locator('.el-message-box')).toHaveCount(0)
      expect(events).toEqual(['inspect'])
    } else if (scenario === 'inspection-error') {
      await expect(page.getByRole('dialog')).toContainText('重试')
      await expect(page.locator('.el-message-box')).toHaveCount(0)
      expect(events).toEqual(['inspect'])
    } else {
      await expect(page.locator('.el-message-box')).toContainText('2 个库位')
      await page
        .locator('.el-message-box')
        .getByRole('button', { name: /删除|确定/ })
        .click()
      if (scenario === 'concurrent') {
        await expect(page.getByRole('dialog', { name: '暂时无法删除库位' })).toContainText(
          'BATCH-001'
        )
        expect(events).toEqual(['inspect', 'delete', 'inspect'])
      } else {
        await expect(page.getByText('已删除 2 个库位')).toBeVisible()
        await expect(page.getByText('暂无匹配库位')).toBeVisible()
        expect(events).toEqual(['inspect', 'delete'])
      }
    }
  })
}
