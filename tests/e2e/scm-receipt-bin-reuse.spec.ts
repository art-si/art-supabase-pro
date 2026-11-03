import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { prepareAppearance } from './support/appearance'

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

test('SCM 收料行物料与仓库切换保持序列号库位筛选及直存禁用', async ({ page }, info) => {
  const errors: string[] = []
  const unexpectedRequests: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await prepareIsolatedSession(page)
  const appearance = {
    theme: info.project.name.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !info.project.name.includes('shadow')
  } as const
  await prepareAppearance(page, appearance)
  const paged = (rows: unknown[]) => ({
    json: rows,
    headers: {
      'content-range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0',
      'access-control-expose-headers': 'content-range'
    }
  })
  await page.route('**/rest/v1/**', (route) => {
    const request = route.request()
    const name = new URL(request.url()).pathname.split('/').at(-1)
    if (request.method() === 'GET') {
      if (name === 'mdm_material')
        return route.fulfill(
          paged(
            [true, false].map((serialManagementEnabled, index) => ({
              id: `material-${index + 1}`,
              tenant_id: tenantId,
              material_code: `MAT-00${index + 1}`,
              material_name: serialManagementEnabled ? '序列号物料' : '普通物料',
              description: serialManagementEnabled ? '序列号物料' : '普通物料',
              basic_unit: '件',
              base_unit_id: 'unit-piece',
              purchase_unit_id: 'unit-piece',
              inventory_unit_id: 'unit-piece',
              serial_management_enabled: serialManagementEnabled,
              baseUnitRecord: { unit_name: '件' },
              purchaseUnit: { unit_name: '件' },
              inventoryUnit: { unit_name: '件' },
              unit_conversions: []
            }))
          )
        )
      if (name === 'mdm_warehouse')
        return route.fulfill(
          paged([
            {
              id: 'warehouse-1',
              warehouse_code: 'WH-1',
              warehouse_name: '测试仓库',
              enable_locations: true
            },
            {
              id: 'warehouse-2',
              warehouse_code: 'WH-2',
              warehouse_name: '另一仓库',
              enable_locations: true
            },
            {
              id: 'warehouse-direct',
              warehouse_code: 'WH-D',
              warehouse_name: '直存仓库',
              enable_locations: false
            }
          ])
        )
      if (name === 'mdm_warehouse_bin')
        return route.fulfill(
          paged([
            {
              id: 'bin-sn',
              warehouse_id: 'warehouse-1',
              bin_code: 'BIN-SN',
              bin_name: '序列号位',
              supports_serial: true
            },
            {
              id: 'bin-bulk',
              warehouse_id: 'warehouse-1',
              bin_code: 'BIN-BULK',
              bin_name: '普通位',
              supports_serial: false
            },
            {
              id: 'bin-other',
              warehouse_id: 'warehouse-2',
              bin_code: 'BIN-OTHER',
              bin_name: '其他仓库位',
              supports_serial: true
            }
          ])
        )
      if (name === 'sys_menu')
        return route.fulfill(paged([{ id: 'menu-receipt', name: 'ScmReceiptNotice' }]))
      if (
        [
          'mdm_project',
          'mdm_supplier',
          'mdm_document_type',
          'scm_purchase_document',
          'mdm_material_category',
          'mdm_customer',
          'mdm_project_construction',
          'sys_dictionary',
          'sys_dict_type',
          'mdm_unit_of_measure'
        ].includes(name || '')
      )
        return route.fulfill(paged([]))
    }
    if (
      ['material_unit_compatibility_options', 'scm_purchase_suppliers_secure'].includes(
        name || ''
      ) &&
      request.method() === 'POST'
    )
      return route.fulfill(paged([]))
    unexpectedRequests.push(`${request.method()} ${name}`)
    return route.abort()
  })
  await page.goto('/tests/e2e/fixtures/scm-receipt-bin-reuse.html', {
    waitUntil: 'domcontentloaded'
  })
  await expect
    .poll(() => page.evaluate(() => document.documentElement.classList.contains('dark')))
    .toBe(appearance.theme === 'dark')
  await page.getByRole('button', { name: '编辑收料通知单', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '编辑收料通知单 · RCPT-001', exact: true })
  await dialog.getByRole('button', { name: 'Expand this row', exact: true }).click()
  const expanded = dialog.locator('.el-table__expanded-cell')
  const warehouse = expanded.getByRole('combobox', { name: /^仓库/ })
  const bin = expanded.getByRole('combobox', { name: '仓位', exact: true })
  await expect(bin).toBeEnabled()
  await bin.click()
  await expect(page.getByRole('option', { name: 'BIN-SN · 序列号位', exact: true })).toBeVisible()
  await expect(page.getByRole('option', { name: 'BIN-BULK · 普通位', exact: true })).toHaveCount(0)
  await expect(
    page.getByRole('option', { name: 'BIN-OTHER · 其他仓库位', exact: true })
  ).toHaveCount(0)
  await page.getByRole('option', { name: 'BIN-SN · 序列号位', exact: true }).click()
  await dialog.getByRole('combobox', { name: '物料编码', exact: true }).click()
  await page.getByRole('option', { name: 'MAT-002 · 普通物料', exact: true }).click()
  await expect(expanded.getByText('BIN-SN · 序列号位', { exact: true })).toBeHidden()
  await bin.click()
  await expect(page.getByRole('option', { name: 'BIN-SN · 序列号位', exact: true })).toBeVisible()
  await page.getByRole('option', { name: 'BIN-BULK · 普通位', exact: true }).click()
  await warehouse.click()
  await page.getByRole('option', { name: 'WH-D · 直存仓库', exact: true }).click()
  await expect(bin).toBeDisabled()
  await expect(expanded.getByText('仓库直存', { exact: true })).toBeVisible()
  await expect(expanded.getByRole('button', { name: '自动选位', exact: true })).toBeDisabled()
  await warehouse.click()
  await page.getByRole('option', { name: 'WH-2 · 另一仓库', exact: true }).click()
  await expect(bin).toBeEnabled()
  await bin.click()
  await expect(page.getByRole('option', { name: 'BIN-SN · 序列号位', exact: true })).toHaveCount(0)
  await expect(page.getByRole('option', { name: 'BIN-BULK · 普通位', exact: true })).toHaveCount(0)
  await page.getByRole('option', { name: 'BIN-OTHER · 其他仓库位', exact: true }).click()
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  await dialog.screenshot({
    path: info.outputPath('warehouse-material-filter.png'),
    animations: 'disabled'
  })
  expect(errors).toEqual([])
  expect(unexpectedRequests).toEqual([])
})
