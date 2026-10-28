import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

const tenantId = '11111111-1111-4111-8111-111111111111'

test('SCM 收料自动选位复用主仓接口，失败只提示一次并可重试成功', async ({ page }, info) => {
  const errors: string[] = []
  const recommendations: Array<Record<string, unknown>> = []
  page.on('pageerror', (error) => errors.push(error.message))
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const table = url.pathname.split('/').at(-1)
    if (table === 'wms_recommend_bin_secure') {
      recommendations.push(request.postDataJSON())
      if (recommendations.length === 1)
        return route.fulfill({
          status: 400,
          json: { code: 'P0001', message: '自动选位失败，请稍后重试' }
        })
      return route.fulfill({ json: 'bin-1' })
    }
    if (table === 'mdm_material')
      return route.fulfill({
        headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' },
        json: [
          {
            id: 'material-1',
            tenant_id: tenantId,
            material_code: 'MAT-001',
            material_name: '测试物料',
            description: '测试物料',
            basic_unit: '件',
            base_unit_id: 'unit-piece',
            purchase_unit_id: 'unit-piece',
            inventory_unit_id: 'unit-piece',
            baseUnitRecord: { unit_name: '件' },
            purchaseUnit: { unit_name: '件' },
            inventoryUnit: { unit_name: '件' },
            unit_conversions: []
          }
        ]
      })
    if (table === 'mdm_warehouse')
      return route.fulfill({
        headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' },
        json: [
          {
            id: 'warehouse-1',
            warehouse_code: 'WH-1',
            warehouse_name: '测试仓库',
            enable_locations: true
          }
        ]
      })
    if (table === 'mdm_warehouse_bin') {
      const bin = {
        id: 'bin-1',
        warehouse_id: 'warehouse-1',
        bin_code: 'BIN-1',
        bin_name: '推荐仓位',
        supports_serial: true
      }
      if (url.searchParams.get('id') === 'eq.bin-1') return route.fulfill({ json: bin })
      return route.fulfill({
        headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' },
        json: []
      })
    }
    if (table === 'sys_menu')
      return route.fulfill({ json: [{ id: 'menu-receipt', name: 'ScmReceiptNotice' }] })
    return route.fulfill({
      headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' },
      json: []
    })
  })

  await page.goto('/tests/e2e/fixtures/scm-receipt-bin-reuse.html', {
    waitUntil: 'domcontentloaded'
  })
  await page.getByRole('button', { name: '编辑收料通知单' }).click()
  const dialog = page.getByRole('dialog', { name: '编辑收料通知单 · RCPT-001' })
  await dialog.getByRole('button', { name: 'Expand this row' }).click()
  const recommend = dialog.getByRole('button', { name: '自动选位' })
  await expect(recommend).toBeEnabled({ timeout: 120_000 })
  await expect(page.locator('.el-message--error')).toHaveCount(0)

  await recommend.click()
  await expect.poll(() => recommendations.length).toBe(1)
  expect(recommendations[0]).toEqual({
    p_warehouse_id: 'warehouse-1',
    p_material_id: 'material-1',
    p_quantity: 5,
    p_area_sqm: null
  })
  await expect(page.locator('.el-message--error')).toHaveCount(1)
  await expect(page.locator('.el-message--error')).toContainText('自动选位')
  await dialog.screenshot({ path: info.outputPath('recommendation-error.png') })

  await expect(recommend).toBeEnabled()
  await recommend.click()
  await expect.poll(() => recommendations.length).toBe(2)
  await expect(dialog.getByText('BIN-1 · 推荐仓位')).toBeVisible()
  await dialog.screenshot({ path: info.outputPath('recommendation-success.png') })
  expect(errors).toEqual([])
})
