import { expect, test } from '@playwright/test'
import { expectOverlayTabPanel } from './support/overlay-tab-card'

test.use({ storageState: { cookies: [], origins: [] } })
const tenantId = '11111111-1111-4111-8111-111111111111'
const driverId = '33333333-3333-4333-8333-333333333333'

test('司机档案在窄屏可核对关联车辆刷新失败并用键盘重试', async ({ page }, info) => {
  test.setTimeout(120_000)
  const carrierId = '11111111-1111-4111-8111-111111111502'
  const reads: Record<string, unknown>[] = []
  const writes: string[] = []
  await page.route('**/rest/v1/**', (route) => {
    const request = route.request()
    const endpoint = new URL(request.url()).pathname.split('/').at(-1)
    switch (endpoint) {
      case 'tms_get_driver_secure':
        return route.fulfill({
          json: {
            id: driverId,
            tenantId,
            carrierId,
            driverName: '验收承运商司机',
            phone: '13800000001',
            driverType: 'primary',
            enabled: true,
            assignedVehicles: [{ plateNo: '测A·旧001' }],
            fieldAccess: {}
          }
        })
      case 'tms_get_driver_profile_secure':
        return route.fulfill({ json: { driverOwnership: 'carrier' } })
      case 'tms_get_driver_certification_secure':
        return route.fulfill({ json: { required: false } })
      case 'tms_list_carrier_options_secure':
        return route.fulfill({ json: [{ id: carrierId, companyName: '验收承运商', tenantId }] })
      case 'vms_list_driver_assigned_vehicles_secure':
        reads.push(request.postDataJSON())
        return reads.length === 1
          ? route.fulfill({ status: 503, json: { message: '验收模拟暂不可用' } })
          : route.fulfill({ json: [{ plateNo: '测A·新002' }] })
      case 'tms_update_driver_secure':
        writes.push(endpoint)
        return route.fulfill({ json: { id: driverId } })
      default:
        return route.fulfill({ json: [] })
    }
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/tests/e2e/fixtures/tms-cargo-driver-service.html?kind=driver-review', {
    waitUntil: 'domcontentloaded'
  })
  const dialog = page.getByRole('dialog', { name: '编辑司机', exact: true })
  const vehicles = dialog.locator('[data-art-form-item-key="carrierVehiclePlates"]')
  const oldPlate = vehicles.getByText('测A·旧001', { exact: true })
  await expect(oldPlate).toBeVisible({ timeout: 60_000 })
  await expect.poll(() => reads.length).toBe(1)
  await vehicles.scrollIntoViewIfNeeded()
  await dialog.screenshot({ path: info.outputPath('assigned-vehicles-unavailable-390.png') })
  await expect(vehicles.getByText('关联车辆加载失败', { exact: true })).toBeVisible()
  const retry = vehicles.getByRole('button', { name: '重新读取关联车辆', exact: true })
  await expect(retry).toBeInViewport()
  await retry.press('Enter')
  await expect(vehicles.getByText('测A·新002', { exact: true })).toBeVisible()
  await expect(oldPlate).toHaveCount(0)
  await expect(vehicles.getByText('关联车辆加载失败', { exact: true })).toHaveCount(0)
  await expect(retry).toBeFocused()
  expect(reads).toEqual(
    Array.from({ length: 2 }, () => ({ p_driver_id: driverId, p_carrier_id: carrierId }))
  )
  expect(writes).toEqual([])
  await dialog.screenshot({ path: info.outputPath('assigned-vehicles-recovered-390.png') })
})

for (const documentAccess of ['edit', 'read', 'hidden']) {
  test('个人司机编辑驾照可保存且不回写受控资料：证件权限 ' + documentAccess, async ({ page }) => {
    test.setTimeout(180_000)
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
    const dictionaries: Record<string, Array<[string, string]>> = {
      sex: [['male', '男']],
      tmsDriverOwnership: [['individual', '个体司机']],
      tmsDriverType: [['primary', '主司机']],
      tmsDriverStatus: [['on_duty', '在岗']],
      tmsDriverLicenseType: [['A2', 'A2']],
      commonBoolean: [
        ['true', '是'],
        ['false', '否']
      ],
      tmsDriverRegistrationStatus: [['unregistered', '未注册']],
      tmsDriverAuthStatus: [['unverified', '未认证']]
    }
    await page.route('**/rest/v1/sys_dictionary?**', (route) => {
      const code =
        new URL(route.request().url()).searchParams
          .get('dict_type_table.code')
          ?.replace(/^eq\./, '') || ''
      return route.fulfill({
        json: (dictionaries[code] || []).map(([value, label], sort) => ({
          id: code + '-' + value,
          type_id: code,
          code: value,
          value,
          label,
          name: label,
          status: '1',
          sort,
          dict_type_table: { code, name: code }
        }))
      })
    })
    await page.route('**/rest/v1/rpc/tms_get_driver_secure', (route) =>
      route.fulfill({
        json: {
          id: driverId,
          tenant_id: tenantId,
          carrier_id: null,
          driver_name: '验收个人司机',
          phone: '138****0001',
          id_card_no: '**************0019',
          gender: 'male',
          license_type: 'A2',
          license_expire_date: '2030-11-30',
          driver_type: 'primary',
          enabled: true,
          field_access: {
            contactPhone: 'masked',
            idCardNo: 'read',
            homeAddress: 'hidden',
            emergencyContact: 'hidden',
            identityDocuments: documentAccess,
            financialAccount: 'hidden'
          }
        }
      })
    )
    await page.route('**/rest/v1/rpc/tms_get_driver_profile_secure', (route) =>
      route.fulfill({
        json: {
          driver_ownership: 'individual',
          driver_status: 'on_duty',
          license_classes: ['A2'],
          license_archive_no: '',
          license_issuer: '',
          license_valid_from: null,
          license_long_term: false,
          registration_status: 'unregistered',
          identity_auth_status: 'unverified',
          license_auth_status: 'unverified',
          qualification_auth_status: 'unverified'
        }
      })
    )
    await page.route('**/rest/v1/rpc/tms_get_driver_certification_secure', (route) =>
      route.fulfill({
        json: {
          required: false,
          certified: false,
          canReview: false,
          identityStatus: 'unverified',
          licenseStatus: 'unverified',
          qualificationStatus: 'unverified'
        }
      })
    )
    let saved: Record<string, unknown> | undefined
    await page.route('**/rest/v1/rpc/tms_update_driver_secure', (route) => {
      const body = route.request().postDataJSON()
      saved = body.p_payload
      const payload = body.p_payload as Record<string, unknown>
      const profile = payload.profile as Record<string, unknown>
      const forbidden = [
        'phone',
        'id_card_no',
        'home_address',
        'emergency_contact_name',
        'emergency_contact_phone'
      ]
      const finance = [
        'finance_invoice_name',
        'finance_tax_no',
        'finance_bank_name',
        'finance_bank_account',
        'finance_bank_branch',
        'finance_default_account'
      ]
      const protectedDocs = [
        'portrait_url',
        'license_archive_no',
        'license_classes',
        'license_issuer',
        'license_valid_from',
        'license_long_term',
        'license_back_extra_url',
        'qualification_type',
        'qualification_no',
        'qualification_valid_to',
        'qualification_front_url',
        'qualification_assessment_url'
      ]
      const rejected =
        forbidden.some((key) => Object.hasOwn(payload, key)) ||
        finance.some((key) => Object.hasOwn(profile, key)) ||
        (documentAccess !== 'edit' &&
          (protectedDocs.some((key) => Object.hasOwn(profile, key)) ||
            [
              'id_card_front_url',
              'id_card_back_url',
              'driver_license_front_url',
              'driver_license_back_url'
            ].some((key) => Object.hasOwn(payload, key))))
      if (rejected)
        return route.fulfill({
          status: 403,
          json: { code: '42501', message: 'No edit permission for driver protected fields' }
        })
      return route.fulfill({
        json: {
          id: driverId,
          driver_name: '验收个人司机',
          license_expire_date: payload.license_expire_date
        }
      })
    })
    await page.goto('/tests/e2e/fixtures/tms-cargo-driver-service.html?kind=driver-review', {
      waitUntil: 'domcontentloaded'
    })
    const dialog = page.getByRole('dialog', { name: '编辑司机', exact: true })
    await expect(dialog).toBeVisible({ timeout: 120_000 })
    await expect(dialog.getByRole('tab', { name: '财务信息', exact: true })).toHaveCount(0)
    await dialog.getByRole('tab', { name: '驾驶证信息', exact: true }).click()
    const license = await expectOverlayTabPanel(dialog, '驾驶证信息')
    const expiry = license.getByRole('combobox', { name: /驾照有效期$/ })
    await expect(expiry).toBeEditable()
    await expiry.fill('2031-11-30')
    await expiry.press('Tab')
    if (documentAccess === 'read')
      await expect(license.getByRole('textbox', { name: '档案编号', exact: true })).toBeDisabled()
    await dialog.getByRole('tab', { name: '基本信息', exact: true }).click()
    await expectOverlayTabPanel(dialog, '基本信息')
    await dialog.getByRole('tab', { name: '驾驶证信息', exact: true }).click()
    await expect(expiry).toHaveValue('2031-11-30')
    await page.screenshot({
      path: '.artifacts/driver-edit-permission-' + documentAccess + '.png',
      fullPage: true
    })
    await dialog.getByRole('button', { name: '确定', exact: true }).click()
    await expect.poll(() => saved?.license_expire_date).toBe('2031-11-30')
    await expect(dialog).toBeHidden()
    await expect(page.locator('.el-message--error')).toHaveCount(0)
    expect(pageErrors).toEqual([])
  })
}
