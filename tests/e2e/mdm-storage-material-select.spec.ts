import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

const tenantId = '11111111-1111-4111-8111-111111111111'
const material = {
  id: 'material-fert',
  tenant_id: tenantId,
  material_code: 'MAT-001',
  material_name: '成品物料',
  specification_model: '规格 A',
  description: '测试成品物料',
  material_source: 'self',
  material_type: 'FERT',
  inbound_warehouse_id: 'finished-warehouse',
  category_id: null,
  gross_weight: 12
}

test('库位物料选择失败可页内重试，预留和序列号继续使用同一分页资料', async ({ page }, info) => {
  let materialRequests = 0
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) => {
    const table = new URL(route.request().url()).pathname.split('/').at(-1)
    if (table === 'mdm_material') {
      materialRequests++
      if (materialRequests === 1)
        return route.fulfill({ status: 500, json: { code: 'PGRST500', message: 'unavailable' } })
      return route.fulfill({
        headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' },
        json: [material]
      })
    }
    return route.fulfill({
      headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' },
      json: []
    })
  })
  await page.goto('/tests/e2e/fixtures/mdm-storage-material-select.html', {
    waitUntil: 'domcontentloaded'
  })

  for (const [index, scenario] of [
    { button: '新增库位', dialog: '新增库位', picker: '选择定容物料' },
    { button: '新增预留', dialog: '新增库存预留', picker: '选择预留物料' },
    { button: '新增序列号', dialog: '新增序列号', picker: '选择序列号物料' }
  ].entries()) {
    await page.getByRole('button', { name: scenario.button, exact: true }).click()
    const dialog = page.getByRole('dialog', { name: scenario.dialog })
    await expect(dialog).toBeVisible()
    if (index === 0) await dialog.getByRole('tab', { name: '货架与容量', exact: true }).click()
    await dialog.locator('.art-data-select__single-input').click()
    const picker = page.getByRole('dialog', { name: scenario.picker })
    if (index === 0) {
      await expect(picker.getByText('可选数据加载失败', { exact: true })).toBeVisible()
      await expect(page.locator('.el-message--error')).toHaveCount(0)
      await picker.getByRole('button', { name: '重新加载' }).click()
    }
    await expect(picker.getByRole('row').filter({ hasText: 'MAT-001' })).toBeVisible()
    await picker.getByRole('row').filter({ hasText: 'MAT-001' }).click()
    await picker.getByRole('button', { name: '确定', exact: true }).click()
    await expect(dialog.locator('.art-data-select__single-input input')).toHaveValue('成品物料')
    if (index === 0) {
      await expect(dialog.locator('.art-async-state__skeleton')).toHaveCount(0)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
      ).toBeLessThanOrEqual(1)
      await dialog.screenshot({ path: info.outputPath('bin-material-selected.png') })
    }
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
  }
  expect(materialRequests).toBeGreaterThanOrEqual(4)
  expect(errors).toEqual([])
})

test('生产入库保留物料类型与默认成品仓元数据', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) => {
    const table = new URL(route.request().url()).pathname.split('/').at(-1)
    if (table === 'sys_dictionary')
      return route.fulfill({
        json: [
          {
            id: 'movement-type-production-in',
            value: 'production_in',
            label: '生产入库',
            name: '生产入库',
            status: '1',
            dict_type_table: { code: 'mdmInventoryMovementType', name: '库存业务类型' }
          }
        ]
      })
    if (table === 'mdm_material')
      return route.fulfill({
        headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' },
        json: [material]
      })
    if (table === 'mdm_warehouse')
      return route.fulfill({
        json: [
          {
            id: 'source-warehouse',
            tenant_id: tenantId,
            warehouse_code: 'SRC',
            warehouse_name: '原料仓',
            warehouse_type: 'raw',
            business_scopes: ['picking'],
            enable_locations: false,
            enable_zones: false,
            status: 'enabled'
          },
          {
            id: 'finished-warehouse',
            tenant_id: tenantId,
            warehouse_code: 'FIN',
            warehouse_name: '成品仓',
            warehouse_type: 'finished',
            business_scopes: ['production_in'],
            enable_locations: false,
            enable_zones: false,
            status: 'enabled'
          }
        ]
      })
    return route.fulfill({
      headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' },
      json: []
    })
  })
  await page.goto('/tests/e2e/fixtures/mdm-storage-material-select.html', {
    waitUntil: 'domcontentloaded'
  })
  await page.getByRole('button', { name: '生产入库', exact: true }).click()
  const dialog = page.locator('.el-dialog:visible').last()
  await dialog.locator('.art-data-select__single-input').click()
  const picker = page.getByRole('dialog', { name: '选择入库物料' })
  await picker.getByRole('row').filter({ hasText: 'MAT-001' }).click()
  await picker.getByRole('button', { name: '确定', exact: true }).click()
  await expect(dialog.getByText('入库目标：成品仓 · FIN')).toBeVisible()
  await expect(dialog.locator('.art-async-state__skeleton')).toHaveCount(0)
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  await dialog.screenshot({ path: info.outputPath('finished-warehouse-from-material.png') })
  expect(errors).toEqual([])
})

async function mockMovement(page: Page, locations: boolean, writes: unknown[]) {
  await page.route('**/rest/v1/**', async (route) => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
    if (endpoint === 'wms_post_inventory_movement_secure') {
      writes.push(route.request().postDataJSON())
      return route.fulfill({ json: null })
    }
    if (endpoint === 'sys_dictionary')
      return route.fulfill({
        json: [
          {
            id: 'movement-production',
            value: 'production_in',
            label: '生产入库',
            name: '生产入库',
            status: '1',
            dict_type_table: { code: 'mdmInventoryMovementType', name: '库存业务类型' }
          }
        ]
      })
    if (endpoint === 'mdm_material')
      return route.fulfill({
        headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' },
        json: [material]
      })
    if (endpoint === 'mdm_warehouse')
      return route.fulfill({
        json: [
          {
            id: 'source-warehouse',
            tenant_id: tenantId,
            warehouse_code: 'SRC',
            warehouse_name: '原料仓',
            warehouse_type: 'raw',
            business_scopes: ['picking'],
            enable_locations: false,
            enable_zones: false,
            status: 'enabled'
          },
          {
            id: 'finished-warehouse',
            tenant_id: tenantId,
            warehouse_code: 'FIN',
            warehouse_name: '成品仓',
            warehouse_type: 'finished',
            business_scopes: ['production_in'],
            enable_locations: locations,
            enable_zones: locations,
            status: 'enabled'
          }
        ]
      })
    const isFinished =
      new URL(route.request().url()).searchParams.get('warehouse_id') === 'eq.finished-warehouse'
    if (endpoint === 'mdm_warehouse_zone')
      return route.fulfill({
        json:
          isFinished && locations
            ? [
                {
                  id: 'finished-zone',
                  warehouse_id: 'finished-warehouse',
                  zone_code: 'ZONE-FIN',
                  zone_name: '成品库区',
                  status: 'enabled',
                  abnormal: false
                }
              ]
            : []
      })
    if (endpoint === 'mdm_warehouse_bin')
      return route.fulfill({
        json:
          isFinished && locations
            ? [
                {
                  id: 'finished-bin',
                  warehouse_id: 'finished-warehouse',
                  zone_id: 'finished-zone',
                  bin_code: 'BIN-FIN',
                  bin_name: '成品库位',
                  status: 'available'
                }
              ]
            : []
      })
    return route.fulfill({
      headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' },
      json: []
    })
  })
}

async function selectFinishedMaterial(page: Page) {
  const dialog = page.locator('.el-dialog:visible').last()
  await dialog.locator('.art-data-select__single-input').click()
  const picker = page.getByRole('dialog', { name: '选择入库物料' })
  await picker.getByRole('row').filter({ hasText: 'MAT-001' }).click()
  await picker.getByRole('button', { name: '确定', exact: true }).click()
  await expect(dialog.getByText('入库目标：成品仓 · FIN')).toBeVisible()
  return dialog
}

for (const profile of [
  { theme: 'light', width: 1440, height: 1000 },
  { theme: 'dark', width: 390, height: 844 }
] as const) {
  test(`短库存操作保持零页签且生产入库按物料默认仓保存 ${profile.theme}`, async ({
    page
  }, info) => {
    const writes: unknown[] = []
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await prepareIsolatedSession(page)
    await mockMovement(page, false, writes)
    await page.setViewportSize({ width: profile.width, height: profile.height })
    await page.goto(`/tests/e2e/fixtures/mdm-storage-material-select.html?theme=${profile.theme}`)
    for (const name of ['库存出库', '库存调拨']) {
      await page.getByRole('button', { name, exact: true }).click()
      const dialog = page.locator('.el-dialog:visible').last()
      await expect(dialog.getByRole('tab')).toHaveCount(0)
      await expect(dialog.getByText('来源批次', { exact: true })).toBeVisible()
      await dialog.getByRole('button', { name: '取消', exact: true }).click()
    }
    await page.getByRole('button', { name: '生产入库', exact: true }).click()
    const dialog = await selectFinishedMaterial(page)
    await expect(dialog.getByRole('tab')).toHaveCount(0)
    await expect(
      dialog
        .locator('.el-form-item')
        .filter({ hasText: '入库仓库' })
        .locator('.el-select__selection')
    ).toContainText('成品仓 · FIN')
    await dialog.getByRole('textbox', { name: '* 批号', exact: true }).fill('COMPACT-FIN-001')
    await dialog.getByRole('textbox', { name: '备注', exact: true }).fill('紧凑库存操作')
    await dialog.screenshot({ path: info.outputPath(`movement-compact-${profile.theme}.png`) })
    await dialog.getByRole('button', { name: '确定', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    expect(writes).toEqual([
      expect.objectContaining({
        p_payload: expect.objectContaining({
          movement_type: 'production_in',
          material_id: material.id,
          warehouse_id: 'finished-warehouse',
          batch_no: 'COMPACT-FIN-001',
          remark: '紧凑库存操作',
          zone_id: null,
          bin_id: null
        })
      })
    ])
    expect(errors).toEqual([])
  })

  test(`多字段入库只保留两组并定位隐藏库位错误后保存 ${profile.theme}`, async ({ page }, info) => {
    const writes: unknown[] = []
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await prepareIsolatedSession(page)
    await mockMovement(page, true, writes)
    await page.setViewportSize({ width: profile.width, height: profile.height })
    await page.goto(`/tests/e2e/fixtures/mdm-storage-material-select.html?theme=${profile.theme}`)
    await page.getByRole('button', { name: '生产入库', exact: true }).click()
    const dialog = await selectFinishedMaterial(page)
    await expect(dialog.getByRole('tab')).toHaveCount(2)
    await expect(dialog.locator('.el-tab-pane')).toHaveCount(2)
    await expect(dialog.getByRole('tab', { name: '物料与数量', exact: true })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    await dialog.getByRole('textbox', { name: '* 批号', exact: true }).fill('LOCATED-FIN-001')
    await dialog.getByRole('button', { name: '确定', exact: true }).click()
    const destination = dialog.getByRole('tab', { name: '库区与库位', exact: true })
    await expect(destination).toHaveAttribute('aria-selected', 'true')
    expect(writes).toEqual([])
    const zone = dialog.locator('.el-form-item').filter({ hasText: '入库库区' })
    await expect(zone.locator('input')).toBeFocused()
    await zone.locator('.el-select').click()
    await page.getByRole('option', { name: '成品库区 · ZONE-FIN', exact: true }).click()
    await dialog.getByRole('button', { name: '确定', exact: true }).click()
    const bin = dialog.locator('.el-form-item').filter({ hasText: '入库库位' })
    await expect(bin.locator('input')).toBeFocused()
    expect(writes).toEqual([])
    await bin.locator('.el-select').click()
    await page.getByRole('option', { name: 'BIN-FIN · 成品库位', exact: true }).click()
    await dialog.getByRole('textbox', { name: '备注', exact: true }).fill('入库目标与说明同组')
    await dialog.screenshot({ path: info.outputPath(`movement-destination-${profile.theme}.png`) })
    await dialog.getByRole('tab', { name: '物料与数量', exact: true }).click()
    await expect(dialog.getByRole('textbox', { name: '* 批号', exact: true })).toHaveValue(
      'LOCATED-FIN-001'
    )
    await dialog.getByRole('button', { name: '确定', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    expect(writes).toEqual([
      expect.objectContaining({
        p_payload: expect.objectContaining({
          movement_type: 'production_in',
          material_id: material.id,
          warehouse_id: 'finished-warehouse',
          zone_id: 'finished-zone',
          bin_id: 'finished-bin',
          batch_no: 'LOCATED-FIN-001',
          remark: '入库目标与说明同组'
        })
      })
    ])
    expect(errors).toEqual([])
  })
}
