import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(180_000)

test('挂车选择承运商后仍可修改所属公司且保留承运商', async ({ page, context }) => {
  await prepareIsolatedSession(page)
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.route('**/rest/v1/rpc/vms_list_asset_company_options_secure', (route) =>
    route.fulfill({
      json: [
        { id: 'company-1', label: '租户法人公司', isDefault: true },
        { id: 'company-2', label: '另一所属公司', isDefault: false }
      ]
    })
  )
  await page.route('**/rest/v1/rpc/vms_list_asset_carrier_options_secure', (route) =>
    route.fulfill({
      json: [{ id: 'carrier-1', companyName: '验收承运商', carrierCode: 'CYS001' }]
    })
  )
  await page.goto('/tests/e2e/fixtures/trailer-company-edit.html')
  await page.getByRole('button', { name: '打开挂车表单' }).click()
  await page.getByRole('tab', { name: '归属与关系' }).click()
  const carrier = page.locator('[data-art-form-item-key="carrierId"] .el-select')
  await carrier.click()
  await page.getByRole('option', { name: '验收承运商' }).click()
  await expect(
    page.locator('[data-art-form-item-key="ownership"]').getByRole('radio', { name: '承运商' })
  ).toBeChecked()
  const company = page.locator('[data-art-form-item-key="companyName"] input')
  await expect(company).toHaveValue('验收承运商')
  await page.getByRole('button', { name: '复制承运商名称' }).click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('验收承运商')
  await company.fill('另一所属公司')
  await expect(company).toHaveValue('另一所属公司')
  await expect(page.getByRole('button', { name: '复制承运商名称' })).toBeEnabled()
  await page.getByRole('button', { name: '复制承运商名称' }).click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('验收承运商')
  await page.setViewportSize({ width: 1024, height: 768 })
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    .toBe(true)
})

test('挂车牵引车可多选且默认值只有一辆', async ({ page }) => {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/rpc/vms_list_asset_company_options_secure', (route) =>
    route.fulfill({ json: [{ id: 'company-1', label: '租户法人公司', isDefault: true }] })
  )
  await page.route('**/rest/v1/rpc/vms_list_trailer_tractor_options_secure', (route) =>
    route.fulfill({
      json: {
        records: [
          {
            id: 'tractor-1',
            plateNo: '冀A00001',
            vehicleType: '半挂车',
            ownership: 'self_operated',
            carrierName: '承运商甲',
            driverName: '司机甲',
            driverPhone: '13800000001',
            companyName: '所属公司甲',
            isDefault: false
          },
          {
            id: 'tractor-2',
            plateNo: '冀A00002',
            vehicleType: '平板车',
            ownership: 'carrier',
            carrierName: '承运商乙',
            driverName: '司机乙',
            driverPhone: '13800000002',
            companyName: '所属公司乙',
            isDefault: false
          }
        ],
        total: 2
      }
    })
  )
  await page.goto('/tests/e2e/fixtures/trailer-company-edit.html')
  await page.getByRole('button', { name: '打开挂车表单' }).click()
  await page.getByRole('tab', { name: '归属与关系' }).click()
  await page.getByPlaceholder('请选择牵引车（可多选）').click()
  const picker = page.getByRole('dialog', { name: '参选牵引车' })
  for (const heading of ['车辆归属', '所属承运商', '司机', '电话', '默认值']) {
    await expect(picker.getByText(heading, { exact: true })).toBeVisible()
  }
  await picker.getByRole('row', { name: /冀A00001/ }).click()
  await picker.getByRole('row', { name: /冀A00002/ }).click()
  await picker.getByRole('button', { name: '确定' }).click()
  const selected = page.locator('[data-art-form-item-key="tractorIds"]')
  await expect(selected).toContainText('冀A00001')
  await expect(selected).toContainText('冀A00002')
  const defaultField = page.locator('[data-art-form-item-key="defaultTractorId"]')
  await expect(defaultField.getByRole('radio', { name: '冀A00001' })).toBeChecked()
  await defaultField.getByText('冀A00002', { exact: true }).click()
  await expect(defaultField.getByRole('radio', { name: '冀A00001' })).not.toBeChecked()
  await expect(defaultField.getByRole('radio', { name: '冀A00002' })).toBeChecked()
})

test('车辆档案关联挂车删除先展示牵引关系并阻止提交', async ({ page }) => {
  await prepareIsolatedSession(page)
  let deletes = 0
  await page.route('**/rest/v1/sys_dictionary?*', (route) => {
    const code = new URL(route.request().url()).searchParams
      .get('dict_type_table.code')
      ?.replace(/^eq\./, '')
    return route.fulfill({
      json:
        code === 'vehicleOperationStatus'
          ? [
              {
                id: 'operation-operating',
                code: 'operating',
                label: '营运',
                value: 'operating',
                sort: 0,
                status: '1',
                dict_type_table: { code, name: code }
              }
            ]
          : []
    })
  })
  await page.route('**/rest/v1/rpc/vms_list_vehicle_trailers_secure', (route) =>
    route.fulfill({
      json: [
        {
          id: 'trailer-1',
          tenant_id: '11111111-1111-4111-8111-111111111111',
          plate_no: '冀D8A10挂',
          plate_color: 'yellow',
          trailer_type: '半挂车',
          ownership: 'self_operated',
          status: 'active'
        }
      ]
    })
  )
  await page.route('**/rest/v1/rpc/vms_get_trailer_delete_dependencies_secure', (route) =>
    route.fulfill({
      json: [
        {
          resource_id: 'trailer-1',
          dependency_code: 'vehicle_trailer_tractor',
          record_id: 'link-1',
          target_id: 'tractor-1',
          record_no: '冀A00001',
          record_summary: '半挂车',
          record_status: 'operating',
          created_at: '2026-11-02T00:00:00Z',
          cleanup_allowed: false
        }
      ]
    })
  )
  await page.route('**/rest/v1/rpc/vms_delete_trailer_secure', (route) => {
    deletes += 1
    return route.fulfill({ json: 1 })
  })
  await page.goto('/tests/e2e/fixtures/trailer-company-edit.html?panel=1')
  await expect(page.getByText('冀D8A10挂', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '删除' }).click()
  const guard = page.locator('.master-delete-guard')
  await expect(guard.getByText('冀A00001', { exact: true })).toBeVisible()
  await expect(guard.getByText('营运', { exact: true })).toBeVisible()
  await expect(page.getByRole('dialog', { name: '删除确认' })).toHaveCount(0)
  expect(deletes).toBe(0)
})
