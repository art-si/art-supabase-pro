import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

test('完工入库选工单和排包明细遵循表头工单，切换后不残留旧选择', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await prepareIsolatedSession(page)
  const packReads: string[] = []
  let failPacks = false
  let emptyPacks = false
  let releasePacks: (() => void) | undefined
  const pendingPacks = new Promise<void>((resolve) => {
    releasePacks = resolve
  })
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const resource = url.pathname.split('/').at(-1)
    const orderId = url.searchParams.get('work_order_id')?.replace('eq.', '') || 'order-004'
    let json: unknown
    if (resource === 'mdm_organization')
      json = [
        {
          id: 'scope-org',
          tenant_id: 'scope-tenant',
          organization_code: 'ORG',
          organization_name: '测试组织',
          status: '1',
          initialization: {
            enabled_on: '2026-01-01',
            initialization_closed_at: '2026-01-02',
            is_default: true
          }
        }
      ]
    if (resource === 'mdm_warehouse')
      json = [
        {
          id: 'scope-warehouse',
          tenant_id: 'scope-tenant',
          organization_id: 'scope-org',
          warehouse_name: '测试成品仓',
          warehouse_code: 'WH',
          warehouse_type: 'finished',
          status: 'enabled',
          business_scopes: []
        }
      ]
    if (resource === 'sys_menu') json = { id: 'scope-menu' }
    if (resource === 'wms_work_order_options_secure')
      json = ['004', '007'].map((number) => ({
        id: `order-${number}`,
        tenant_id: 'scope-tenant',
        organization_id: 'scope-org',
        work_order_no: `MO202609${number}`,
        material_id: `material-${number}`,
        material_name: `测试成品${number}`,
        order_quantity: 10,
        completed_quantity: 10,
        warehoused_quantity: 0,
        pending_inbound_quantity: 10,
        production_report_control: 'none',
        production_full_issue_control: 'none',
        production_full_issue_gaps: []
      }))
    if (resource === 'mes_work_order')
      json = { work_order_no: 'MO202609004', packing_published_at: '2026-10-23T00:00:00Z' }
    if (resource === 'mes_work_order_pack') {
      packReads.push(orderId)
      await pendingPacks
      if (failPacks)
        return route.fulfill({ status: 500, json: { code: 'XX000', message: 'test failure' } })
      json = emptyPacks
        ? []
        : [
            {
              id: `pack-${orderId}`,
              work_order_id: orderId,
              pack_no: `PACK-${orderId}`,
              area: '测试区域',
              axis: 'A',
              items: [{ board_id: 'board-1', pieces: 2 }]
            }
          ]
    }
    if (resource === 'mes_work_order_detail')
      json = [
        { id: 'board-1', area: '测试区域', number: 'BOARD-001', length_mm: 1000, area_sqm: 1 }
      ]
    if (resource === 'mdm_material')
      json = ['004', '007'].map((number) => ({
        id: `material-${number}`,
        material_code: `MAT-${number}`,
        material_name: `测试成品${number}`,
        inventory_unit_id: 'unit-1',
        production_unit_id: 'unit-1',
        base_unit_id: 'unit-1',
        unit_conversions: []
      }))
    if (json === undefined) return route.fallback()
    return route.fulfill({
      json,
      headers: {
        'content-range': `0-0/${Array.isArray(json) ? json.length : 1}`,
        'access-control-expose-headers': 'content-range'
      }
    })
  })
  await page.goto('/tests/e2e/fixtures/wms-finished-order-scope.html', {
    waitUntil: 'domcontentloaded'
  })
  const optionsLoaded = page.waitForResponse('**/rest/v1/rpc/wms_work_order_options_secure', {
    timeout: 20_000
  })
  await page.getByRole('button', { name: '打开完工入库单', exact: true }).click()
  await optionsLoaded
  const drawer = page.locator('.el-drawer:visible')
  const openOrders = drawer.getByRole('button', { name: '选生产工单', exact: true })
  const openPacks = drawer.getByRole('button', { name: '选排包单', exact: true })
  const dialog = page.locator('.el-dialog:visible')
  await openOrders.click()
  await expect(dialog).toContainText('MO202609004')
  await expect(dialog).not.toContainText('MO202609007')
  await dialog.locator('.el-table__body-wrapper .el-checkbox').first().click()
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect(
    drawer.locator('.wms-editable-line-table .el-table__body-wrapper tbody tr')
  ).toHaveCount(1)
  await openPacks.click()
  await expect.poll(() => packReads.length).toBe(1)
  await expect(dialog.getByRole('button', { name: '确定', exact: true })).toBeDisabled()
  await page.screenshot({ path: info.outputPath('pack-loading.png') })
  releasePacks?.()
  await expect(dialog).toContainText('PACK-order-004')
  await expect(dialog.locator('.art-data-select-dialog__navigation')).not.toContainText(
    'MO202609007'
  )
  await dialog.locator('.el-table__body-wrapper .el-checkbox').first().click()
  await expect(dialog).toContainText('已选 1')
  await page.screenshot({ path: info.outputPath('order-004-packs.png') })
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect(
    drawer.locator('.wms-editable-line-table .el-table__body-wrapper tbody tr')
  ).toHaveCount(2)
  await expect(drawer).toContainText('PACK-order-004')
  const workOrderField = drawer
    .locator('.el-form-item')
    .filter({ hasText: '生产工单（单工单模式）' })
  await workOrderField.getByRole('combobox').click()
  await page.getByRole('option', { name: 'MO202609007', exact: true }).click()
  await openOrders.click()
  await expect(dialog).toContainText('MO202609007')
  await expect(dialog).not.toContainText('MO202609004')
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  failPacks = true
  await openPacks.click()
  await expect(dialog.getByRole('button', { name: /重试|重新加载/ })).toBeVisible()
  await expect(dialog.getByRole('button', { name: '确定', exact: true })).toBeDisabled()
  await page.screenshot({ path: info.outputPath('pack-error.png') })
  failPacks = false
  await dialog.getByRole('button', { name: /重试|重新加载/ }).click()
  await expect(dialog).toContainText('PACK-order-007')
  await expect(dialog).not.toContainText('PACK-order-004')
  await expect(dialog).toContainText('已选 0')
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  emptyPacks = true
  await openPacks.click()
  await expect(dialog).toContainText('暂无数据')
  await page.screenshot({ path: info.outputPath('pack-empty.png') })
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await workOrderField.locator('.el-select__wrapper').hover()
  await workOrderField.locator('.el-select__clear').click()
  await openOrders.click()
  await expect(dialog).toContainText('MO202609004')
  await expect(dialog).toContainText('MO202609007')
  expect(packReads).toEqual(['order-004', 'order-007', 'order-007', 'order-007'])
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  expect(errors).toEqual([])
})
