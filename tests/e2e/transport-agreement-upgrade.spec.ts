import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

const tenantId = '11111111-1111-4111-8111-111111111111'
const carrierId = '11111111-1111-4111-8111-111111111201'
const vehicleId = '11111111-1111-4111-8111-111111111301'
const driverId = '11111111-1111-4111-8111-111111111501'
const image = '/tests/e2e/fixtures/transport-certificate.svg'
const agreement = (id: string, no: string, approvalStatus: string) => ({
  id,
  tenantId,
  customerId: null,
  agreementNo: no,
  shipperName: '星河物流有限公司',
  carrierId,
  carrierName: '承运车队甲',
  contactPhone: '13800000001',
  vehicleId,
  plateNo: '湘A12345',
  vehicleType: '厢式货车',
  vehicleLengthM: 9.6,
  driverId: null,
  startsOn: '2026-11-01',
  endsOn: '2027-10-31',
  status: 'pending_signed',
  approvalStatus,
  contentHtml: '<p>承运方应按约定安全送达货物。</p>',
  idCardImages: [image],
  registrationImages: [image],
  driverLicenseImages: [image],
  roadPermitImages: [image],
  driverLicenseImage: null,
  roadPermitImage: null,
  partyASignatureUrl: null,
  partyASealUrl: null,
  partyBSignatureUrl: null,
  partyBSealUrl: null,
  partyASignedAt: null,
  partyBSignedAt: null,
  partyASeal: '',
  partyARepresentative: '',
  partyASignedOn: '',
  partyBSeal: '',
  partyBRepresentative: null,
  partyBSignedOn: '',
  createBy: '验收员',
  createTime: '2026-11-01T08:00:00+08:00',
  updateTime: '2026-11-01T08:00:00+08:00'
})

test('运输协议双记录：审批门禁、司机证照复用、预览与签署入口', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const records = [
    agreement('11111111-1111-4111-8111-111111111401', 'YSXY-DRAFT-001', 'draft'),
    agreement('11111111-1111-4111-8111-111111111402', 'YSXY-APPROVED-002', 'approved')
  ]
  let evidenceFails = false
  let evidenceVehicleId: unknown
  let submitCount = 0
  let editPayload: Record<string, unknown> | undefined
  let signingPayload: Record<string, unknown> | undefined
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const endpoint = url.pathname.split('/').at(-1)
    if (endpoint === 'tms_transport_agreement') {
      if (route.request().method() === 'PATCH') {
        editPayload = route.request().postDataJSON() as Record<string, unknown>
        return route.fulfill({ json: records[0], headers: { 'content-range': '0-0/1' } })
      }
      return route.fulfill({
        json: records,
        headers: { 'content-range': '0-1/2', 'access-control-expose-headers': 'content-range' }
      })
    }
    if (endpoint === 'tms_list_basic_carrier_options_secure')
      return route.fulfill({ json: [{ id: carrierId, tenantId, companyName: '承运车队甲' }] })
    if (endpoint === 'vms_list_vehicle_archive_options_secure')
      return route.fulfill({
        json: [
          {
            id: vehicleId,
            tenantId,
            carrierId,
            plateNo: '湘A12345',
              vehicleType: '厢式货车',
            vehicleLengthM: 9.6
          }
        ]
      })
    if (endpoint === 'tms_list_agreement_driver_options_secure')
      return route.fulfill({ json: [{ id: driverId, driverName: '周师傅' }] })
    if (endpoint === 'tms_get_agreement_driver_evidence_secure') {
      evidenceVehicleId = (route.request().postDataJSON() as Record<string, unknown>).p_vehicle_id
      return evidenceFails
        ? route.fulfill({ status: 503, json: { code: 'PGRST503', message: 'unavailable' } })
        : route.fulfill({
            json: {
              driverName: '周师傅',
              idCardImages: [image],
              registrationImages: [image],
              driverLicenseImages: [image],
              roadPermitImages: [image]
            }
          })
    }
    if (endpoint === 'tms_submit_transport_agreement_secure') {
      submitCount += 1
      records[0].approvalStatus = 'pending'
      return route.fulfill({ json: records[0] })
    }
    if (endpoint === 'tms_sign_transport_agreement_secure') {
      signingPayload = route.request().postDataJSON() as Record<string, unknown>
      return route.fulfill({ json: { ...records[1], status: 'signed' } })
    }
    if (endpoint === 'get_table_column_runtime')
      return route.fulfill({ json: { enabled: false, profiles: [] } })
    return route.fulfill({ json: [] })
  })

  await page.goto('/tests/e2e/fixtures/transport-agreement-upgrade.html', {
    waitUntil: 'domcontentloaded'
  })
  const draft = page.getByRole('row').filter({ hasText: 'YSXY-DRAFT-001' })
  const approved = page.getByRole('row').filter({ hasText: 'YSXY-APPROVED-002' })
  await expect(draft).toBeVisible({ timeout: 60_000 })
  await expect(approved).toBeVisible()
  await expect(draft.getByRole('button', { name: '编辑' })).toBeVisible()
  await expect(approved.getByRole('button', { name: '编辑' })).toHaveCount(0)
  await draft.getByRole('button', { name: '预览协议' }).click()
  const preview = page.getByRole('dialog', { name: '文书预览' })
  await expect(preview).toContainText('货物运输协议')
  await expect(preview).toContainText('托运方：')
  await expect(preview).toContainText('承运方：')
  await expect(preview).toContainText('车牌号码')
  await expect(preview).toContainText('证照附件')
  await expect(preview).toContainText('乙方（签章）')
  await preview.getByRole('button', { name: '关闭弹窗' }).click()

  await draft.getByRole('button', { name: '编辑' }).click()
  const form = page.getByRole('dialog', { name: '编辑运输协议 · YSXY-DRAFT-001' })
  await expect(form).toBeVisible()
  const driver = form.locator('.el-form-item').filter({ hasText: '乙方代表人（司机）' })
  await driver.getByRole('combobox').click()
  evidenceFails = true
  await page.getByRole('option', { name: '周师傅' }).click()
  await expect(form.getByText('司机证件读取失败，暂不能保存协议。')).toBeVisible()
  await expect(page.locator('.el-message')).toHaveCount(0)
  await form.getByRole('button', { name: '确定' }).click()
  expect(editPayload).toBeUndefined()
  evidenceFails = false
  await form.getByRole('button', { name: '重试读取证件' }).click()
  await expect(
    form
      .locator('.el-form-item')
      .filter({ hasText: /^乙方代表人$/ })
      .getByRole('textbox')
  ).toHaveValue('周师傅')
  expect(evidenceVehicleId).toBe(vehicleId)
  await form.getByRole('tab', { name: '证件附件' }).click()
  await expect(form.getByText('身份证（最多 5 张）')).toBeVisible()
  for (const label of ['身份证', '行驶证', '驾驶证', '道路运输证']) {
    const group = form.locator('.el-form-item').filter({ hasText: `${label}（最多 5 张）` })
    await expect(group.locator('.art-upload img').first()).toBeVisible()
  }
  await expect(page.locator('.el-message')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('transport-evidence.png') })
  await form.getByRole('button', { name: '确定' }).click()
  await expect(form).toBeHidden()
  expect(editPayload?.driver_id).toBe(driverId)
  expect(editPayload?.party_b_representative).toBe('周师傅')
  for (const field of [
    'id_card_images',
    'registration_images',
    'driver_license_images',
    'road_permit_images'
  ]) {
    expect(editPayload?.[field]).toEqual([image])
  }

  await draft.getByRole('button', { name: '更多操作' }).click()
  await page.getByText('提交审批', { exact: true }).click()
  await expect.poll(() => submitCount).toBe(1)
  await expect(draft.getByRole('button', { name: '编辑' })).toHaveCount(0)
  await approved.getByRole('button', { name: '更多操作' }).click()
  await page.getByText('签署协议', { exact: true }).click()
  const signing = page.getByRole('dialog', { name: '签署运输协议' })
  await expect(signing.getByText('手写签名', { exact: true })).toHaveCount(2)
  await expect(signing.getByText('电子印章', { exact: true })).toHaveCount(2)
  await expect(signing.locator('canvas')).toHaveCount(2)
  await page.screenshot({ path: info.outputPath('transport-signing.png') })
  await page.route('**/rest/v1/sys_attachment*', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: null })
    const uploaded = route.request().postDataJSON() as Record<string, unknown>
    return route.fulfill({ json: { id: 'transport-signature-resource', ...uploaded } })
  })
  await page.route('**/storage/v1/object/attachments/**', (route) =>
    route.fulfill({ json: { Key: 'transport-signature' } })
  )
  for (const canvas of await signing.locator('canvas').all()) {
    await canvas.scrollIntoViewIfNeeded()
    const box = await canvas.boundingBox()
    if (!box) throw new Error('运输协议签名画布不可见')
    await page.mouse.move(box.x + 30, box.y + 35)
    await page.mouse.down()
    await page.mouse.move(box.x + 100, box.y + 95, { steps: 8 })
    await page.mouse.up()
  }
  await signing.locator('label.el-checkbox').click()
  await signing.getByRole('button', { name: '确认签署' }).click()
  await expect(signing).toBeHidden()
  const evidence = signingPayload?.p_signatures as Record<string, unknown> | undefined
  expect(evidence?.party_a_signature_url).toContain(`/attachments/${tenantId}/`)
  expect(evidence?.party_b_signature_url).toContain(`/attachments/${tenantId}/`)
  await page.setViewportSize({ width: 1024, height: 768 })
  await approved.getByRole('button', { name: '预览协议' }).click()
  await expect(preview).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
    .toBe(true)
  await expect(page.locator('.el-message')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('transport-preview-narrow.png') })
  await preview.getByText('乙方（签章）').scrollIntoViewIfNeeded()
  await page.screenshot({ path: info.outputPath('transport-preview-signatures-narrow.png') })
  await page.keyboard.press('Escape')
  await expect(preview).toBeHidden()
  await page.getByRole('switch', { name: '进入专注模式' }).click()
  await expect(page.locator('.art-table-query')).toHaveClass(/is-focus-mode/)
  await expect(page.getByText('TRANSPORT AGREEMENTS')).toBeHidden()
  await expect(draft).toBeVisible()
  await page.screenshot({ path: info.outputPath('transport-focus-narrow.png') })
  await page.getByRole('button', { name: '退出专注模式' }).click()
  await expect(page.getByText('TRANSPORT AGREEMENTS')).toBeVisible()
  await page.getByRole('switch', { name: '进入专注模式' }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByText('TRANSPORT AGREEMENTS')).toBeVisible()
  expect(errors).toEqual([])
})
