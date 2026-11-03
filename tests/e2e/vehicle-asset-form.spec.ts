import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(180_000)

test.beforeEach(async ({ page }) => {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/sys_dictionary?*', (route) => {
    const code = new URL(route.request().url()).searchParams
      .get('dict_type_table.code')
      ?.replace(/^eq\./, '')
    const values: Record<string, Array<[string, string]>> = {
      vehicleOwnership: [
        ['self_operated', '自营车辆'],
        ['carrier', '承运商'],
        ['third_party', '第三方物流'],
        ['individual_affiliation', '个人挂靠']
      ],
      commonBoolean: [
        ['false', '否'],
        ['true', '是']
      ],
      vehiclePlateColor: [['yellow', '黄牌']],
      vehicleUsageNature: [['freight', '货运']],
      vehicleOperationStatus: [['operating', '营运']],
      vehicleType: [['半挂车', '半挂车']],
      vehicleTypeCategory: [['半挂车', '半挂车']],
      vehicleOriginType: [
        ['domestic', '国产'],
        ['imported', '进口']
      ]
    }
    return route.fulfill({
      json: Object.entries(values)
        .filter(([key]) => !code || key === code)
        .flatMap(([key, options]) =>
          options.map(([value, label], sort) => ({
            id: `${key}-${value}`,
            code: value,
            label,
            value,
            sort,
            status: '1',
            dict_type_table: { code: key, name: key }
          }))
        )
    })
  })
  await page.route('**/rest/v1/rpc/get_table_column_runtime', (route) =>
    route.fulfill({ json: { enabled: false, profiles: [] } })
  )
})

test('车辆公司可编辑、承运商联动与复制、新能源必选和重试', async ({ page, context }, info) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  let fail = true
  const companyRequests: unknown[] = []
  await page.route('**/rest/v1/rpc/vms_list_asset_company_options_secure', (route) => {
    companyRequests.push(route.request().postDataJSON())
    return fail
      ? route.fulfill({ status: 500, json: { message: 'internal failure' } })
      : route.fulfill({ json: [{ id: 'company-1', label: '验收法人公司', isDefault: true }] })
  })
  await page.route('**/rest/v1/rpc/vms_list_asset_carrier_options_secure', (route) =>
    route.fulfill({ json: [{ id: 'carrier-1', companyName: '验收承运商', carrierCode: 'CYS001' }] })
  )
  await page.goto(
    `/tests/e2e/fixtures/vehicle-asset-form.html${info.project.name.includes('dark') ? '?theme=dark' : ''}`
  )
  await expect(page.getByText('法人公司加载失败，请重试', { exact: true })).toBeVisible({
    timeout: 90_000
  })
  fail = false
  await page.getByRole('button', { name: '重新加载', exact: true }).click()
  const company = page.locator('[data-art-form-item-key="companyName"] input')
  await expect(company).toHaveValue('验收法人公司', { timeout: 90_000 })
  await company.fill('手工修改公司')
  await expect(company).toHaveValue('手工修改公司')
  const carrier = page.locator('[data-art-form-item-key="carrierId"] .el-select')
  const keyOrder = await page
    .locator('[data-art-form-item-key]')
    .evaluateAll((items) => items.map((item) => item.getAttribute('data-art-form-item-key')))
  expect(keyOrder.indexOf('carrierId')).toBeLessThan(keyOrder.indexOf('vehicleType'))
  expect(keyOrder.indexOf('companyName')).toBeLessThan(keyOrder.indexOf('vehiclePhotoUrl'))
  expect(keyOrder.indexOf('vehicleOwnership')).toBeLessThan(keyOrder.indexOf('vehiclePhotoUrl'))
  await carrier.scrollIntoViewIfNeeded()
  await page.screenshot({
    path: info.outputPath('vehicle-asset-form-top.png'),
    animations: 'disabled'
  })
  await carrier.click()
  await page.getByRole('option', { name: '验收承运商（CYS001）' }).click()
  await expect(company).toHaveValue('验收承运商')
  await expect(
    page
      .locator('[data-art-form-item-key="vehicleOwnership"]')
      .getByRole('radio', { name: '承运商', exact: true })
  ).toBeChecked()
  await page.getByRole('button', { name: '复制承运商名称' }).click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('验收承运商')
  const energy = page.locator('[data-art-form-item-key="isNewEnergy"]')
  await energy.scrollIntoViewIfNeeded()
  await expect(energy.locator('.el-form-item')).toHaveClass(/is-required/)
  await expect(energy.getByRole('radio', { name: '否', exact: true })).toBeChecked()
  await energy.getByText('是', { exact: true }).click()
  await expect(energy).toContainText('关联电卡档案及电卡流水')
  await page.screenshot({
    path: info.outputPath('vehicle-asset-form-energy.png'),
    animations: 'disabled'
  })
  await page.setViewportSize({ width: 1024, height: 768 })
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    .toBe(true)
  expect(companyRequests).toHaveLength(2)
})

test('完整档案分组和跨页签字段保留并进入同一保存请求', async ({ page }, info) => {
  let savedPayload: Record<string, unknown> | undefined
  await page.route('**/rest/v1/rpc/vms_list_asset_company_options_secure', (route) =>
    route.fulfill({ json: [{ id: 'company-1', label: '验收法人公司', isDefault: true }] })
  )
  await page.route('**/rest/v1/rpc/vms_list_asset_carrier_options_secure', (route) =>
    route.fulfill({ json: [{ id: 'carrier-1', companyName: '验收承运商', carrierCode: 'CYS001' }] })
  )
  await page.route('**/rest/v1/rpc/vms_list_vehicle_type_profiles_secure', (route) =>
    route.fulfill({
      json: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          tenant_id: '11111111-1111-4111-8111-111111111111',
          category: '半挂车',
          length_m: 13,
          volume_m3: 75,
          load_tons: 30,
          status: '1',
          sort: 1
        }
      ]
    })
  )
  await page.route('**/rest/v1/rpc/vms_create_vehicle_archive_secure', async (route) => {
    savedPayload = (route.request().postDataJSON() as { p_payload: Record<string, unknown> })
      .p_payload
    await route.fulfill({ json: '33333333-3333-4333-8333-333333333333' })
  })
  await page.goto('/tests/e2e/fixtures/vehicle-asset-form.html')
  await expect(page.locator('[data-art-form-item-key="companyName"] input')).toHaveValue(
    '验收法人公司'
  )
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(page.getByText('请输入车牌号', { exact: true })).toBeVisible()
  expect(savedPayload).toBeUndefined()
  await page.locator('[data-art-form-item-key="plateNo"] input').fill('测A完整001')
  await page.locator('[data-art-form-item-key="plateColor"] .el-select').click()
  await page.getByRole('option', { name: '黄牌', exact: true }).click()
  await page.locator('[data-art-form-item-key="carrierId"] .el-select').click()
  await page.getByRole('option', { name: '验收承运商（CYS001）' }).click()
  await page.getByRole('button', { name: /请选择车型与规格/ }).click()
  const picker = page.getByRole('dialog', { name: '参选车型', exact: true })
  await picker.locator('.vehicle-type-profile-picker__choice').first().click()
  await picker.getByRole('button', { name: '使用此车型', exact: true }).click()
  await page.locator('[data-art-form-item-key="vin"] input').fill('LSVAU2189N2000001')
  await page.locator('[data-art-form-item-key="remark"] textarea').fill('完整字段验收备注')
  await page.screenshot({ path: info.outputPath('basic-lower-fields.png'), animations: 'disabled' })
  await page.getByRole('tab', { name: '车身参数', exact: true }).click()
  await page.locator('[data-art-form-item-key="grossMass"] input').fill('18000')
  await page.getByRole('tab', { name: '发动机参数', exact: true }).click()
  await page.locator('[data-art-form-item-key="engineNo"] input').fill('TEST-ENGINE-001')
  await page.getByRole('tab', { name: '其他信息', exact: true }).click()
  await page.locator('[data-art-form-item-key="ownerPhone"] input').fill('13800000000')
  await page.locator('[data-art-form-item-key="operationRoute"] input').fill('验收线路甲—乙')
  await page.getByRole('tab', { name: '基础信息', exact: true }).click()
  await expect(page.locator('[data-art-form-item-key="vin"] input')).toHaveValue(
    'LSVAU2189N2000001'
  )
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect.poll(() => savedPayload).toBeDefined()
  expect(savedPayload).toMatchObject({
    plate_no: '测A完整001',
    carrier_id: 'carrier-1',
    company_name: '验收承运商',
    vehicle_ownership: 'carrier',
    is_new_energy: false,
    vehicle_type_profile_id: '22222222-2222-4222-8222-222222222222',
    vin: 'LSVAU2189N2000001',
    gross_mass: 18000,
    engine_no: 'TEST-ENGINE-001',
    owner_phone: '13800000000',
    operation_route: '验收线路甲—乙',
    remark: '完整字段验收备注'
  })
})

test('新增车辆显示挂车管理保存提示并保留返回后的基础信息', async ({ page }) => {
  await page.route('**/rest/v1/rpc/vms_list_asset_company_options_secure', (route) =>
    route.fulfill({ json: [{ id: 'company-1', label: '验收法人公司', isDefault: true }] })
  )
  await page.goto('/tests/e2e/fixtures/vehicle-asset-form.html')
  const plateNo = page.locator('[data-art-form-item-key="plateNo"] input')
  await expect(plateNo).toBeVisible({ timeout: 60_000 })
  await plateNo.fill('测A挂车页签001')
  await page.getByRole('tab', { name: '挂车管理', exact: true }).click()
  await expect(page.getByText('保存车辆档案后可管理挂车', { exact: true })).toBeVisible()
  await expect(
    page.getByText('先在基础信息中保存车辆草稿，再返回车辆档案维护关联挂车。')
  ).toBeVisible()
  await page.getByRole('button', { name: '返回基础信息', exact: true }).click()
  await expect(page.getByRole('tab', { name: '基础信息', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect(plateNo).toHaveValue('测A挂车页签001')
  await expect(page.getByRole('button', { name: '保存草稿', exact: true })).toBeVisible()
})
