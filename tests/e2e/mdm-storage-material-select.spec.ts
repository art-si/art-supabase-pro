import { expect, test } from '@playwright/test'
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
