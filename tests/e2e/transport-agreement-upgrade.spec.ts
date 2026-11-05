import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(420_000)

const tenantId = '11111111-1111-4111-8111-111111111111'
const carrierId = '11111111-1111-4111-8111-111111111201'
const vehicleId = '11111111-1111-4111-8111-111111111301'
const driverId = '11111111-1111-4111-8111-111111111501'
const privateImages = {
  idCard: `${tenantId}/${driverId}/11111111-1111-4111-8111-111111111601.png`,
  registration: `${tenantId}/${vehicleId}/11111111-1111-4111-8111-111111111602.png`,
  driverLicense: `${tenantId}/${driverId}/11111111-1111-4111-8111-111111111603.png`,
  roadPermit: `${tenantId}/${vehicleId}/11111111-1111-4111-8111-111111111604.png`
}
const certificateSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="108"><rect width="180" height="108" fill="#edf3f8"/><rect x="15" y="17" width="150" height="74" rx="6" fill="#fff" stroke="#9caec2"/><path d="M28 42h83M28 54h112M28 66h67" stroke="#627b99" stroke-width="4"/></svg>'
const attachment = '/tests/e2e/fixtures/transport-certificate.svg'
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
  attachments: [attachment],
  idCardImages: [privateImages.idCard],
  registrationImages: [privateImages.registration],
  driverLicenseImages: [privateImages.driverLicense],
  roadPermitImages: [privateImages.roadPermit],
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
  let detailFetchCount = 0
  let signingCount = 0
  const signedBuckets = new Set<string>()
  const loadedBuckets = new Set<string>()
  let detailFails = false
  let delayNextDetail = false
  let releaseDetail: (() => void) | undefined
  await page.goto('/tests/e2e/fixtures/transport-agreement-upgrade.html', {
    waitUntil: 'domcontentloaded'
  })
  await page.route('**/storage/v1/object/sign/**', async (route) => {
    const bucket = new URL(route.request().url()).pathname.split('/')[5]
    if (route.request().method() === 'GET') {
      loadedBuckets.add(bucket)
      return route.fulfill({ contentType: 'image/svg+xml', body: certificateSvg })
    }
    signedBuckets.add(bucket)
    signingCount += 1
    const body = route.request().postDataJSON() as { paths: string[] }
    return route.fulfill({
      json: body.paths.map((path) => ({
        path,
        signedURL: `/object/sign/${bucket}/${path}?token=preview-${signingCount}`
      }))
    })
  })
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const endpoint = url.pathname.split('/').at(-1)
    if (endpoint === 'tms_transport_agreement') {
      if (route.request().method() === 'PATCH') {
        editPayload = route.request().postDataJSON() as Record<string, unknown>
        Object.assign(records[0], {
          driverId: editPayload.driver_id,
          partyBRepresentative: editPayload.party_b_representative,
          attachments: editPayload.attachments,
          idCardImages: editPayload.id_card_images,
          registrationImages: editPayload.registration_images,
          driverLicenseImages: editPayload.driver_license_images,
          roadPermitImages: editPayload.road_permit_images
        })
        return route.fulfill({ json: records[0], headers: { 'content-range': '0-0/1' } })
      }
      const requestedId = url.searchParams.get('id')?.replace(/^eq\./, '')
      if (requestedId) {
        detailFetchCount += 1
        if (delayNextDetail) {
          delayNextDetail = false
          await new Promise<void>((resolve) => {
            releaseDetail = resolve
          })
        }
        if (detailFails)
          return route.fulfill({ status: 503, json: { code: 'PGRST503', message: 'unavailable' } })
        return route.fulfill({ json: records.find((record) => record.id === requestedId) ?? null })
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
              idCardImages: [privateImages.idCard],
              registrationImages: [privateImages.registration],
              driverLicenseImages: [privateImages.driverLicense],
              roadPermitImages: [privateImages.roadPermit]
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
      const signatures = signingPayload.p_signatures as Record<string, string>
      Object.assign(records[1], {
        status: 'signed',
        partyASignatureUrl: signatures.party_a_signature_url,
        partyBSignatureUrl: signatures.party_b_signature_url,
        partyASignedAt: '2026-11-05T09:30:00+08:00',
        partyBSignedAt: '2026-11-05T09:31:00+08:00',
        partyASignedOn: null,
        partyBSignedOn: null
      })
      return route.fulfill({ json: records[1] })
    }
    if (endpoint === 'get_table_column_runtime')
      return route.fulfill({ json: { enabled: false, profiles: [] } })
    return route.fulfill({ json: [] })
  })

  await page.getByRole('button', { name: '加载运输协议' }).click()
  const draft = page.getByRole('row').filter({ hasText: 'YSXY-DRAFT-001' })
  const approved = page.getByRole('row').filter({ hasText: 'YSXY-APPROVED-002' })
  await expect(draft).toBeVisible({ timeout: 60_000 })
  await expect(approved).toBeVisible()
  await expect(draft.getByRole('button', { name: '编辑' })).toBeVisible()
  await expect(approved.getByRole('button', { name: '编辑' })).toHaveCount(0)
  detailFails = true
  await draft.getByRole('button', { name: '预览协议' }).click()
  await expect(page.getByRole('dialog', { name: '文书预览' })).toBeHidden()
  await expect(page.locator('.el-message')).toContainText('协议证照读取失败')
  detailFails = false
  await page.locator('.el-message').waitFor({ state: 'hidden' })
  await draft.getByRole('button', { name: '预览协议' }).click()
  const preview = page.getByRole('dialog', { name: '文书预览' })
  await expect(preview).toBeVisible({ timeout: 60_000 })
  await expect(preview).toContainText('货物运输协议')
  await expect(preview).toContainText('托运方：')
  await expect(preview).toContainText('承运方：')
  await expect(preview).toContainText('车牌号码')
  await expect(preview).toContainText('证照附件')
  await expect(preview).toContainText('transport-certificate.svg')
  await expect(preview).toContainText('乙方（签章）')
  await expect
    .poll(() =>
      preview
        .locator('img[src*="/storage/v1/object/sign/tms-driver-private/"]')
        .first()
        .evaluate((element: HTMLImageElement) => element.naturalWidth)
    )
    .toBeGreaterThan(0)
  expect(detailFetchCount).toBeGreaterThanOrEqual(2)
  expect(signingCount).toBeGreaterThan(0)
  expect(signedBuckets).toEqual(new Set(['tms-driver-private', 'vms-vehicle-private']))
  expect(loadedBuckets).toEqual(new Set(['tms-driver-private', 'vms-vehicle-private']))
  await preview.getByRole('button', { name: '关闭弹窗' }).click()

  await draft.getByRole('button', { name: 'YSXY-DRAFT-001' }).click()
  const detail = page.getByRole('dialog', { name: '运输协议 · YSXY-DRAFT-001' })
  await expect(detail).toBeVisible()
  await detail.getByRole('tab', { name: '证件与附件' }).click()
  await expect(detail).toContainText('transport-certificate.svg')
  await expect(
    detail.locator('img[src*="/storage/v1/object/sign/tms-driver-private/"]')
  ).toHaveCount(2)
  await expect(
    detail.locator('img[src*="/storage/v1/object/sign/vms-vehicle-private/"]')
  ).toHaveCount(2)
  await detail.getByRole('button', { name: '关闭弹窗' }).click()

  delayNextDetail = true
  detailFails = true
  await draft.getByRole('button', { name: '编辑' }).click()
  const form = page.getByRole('dialog', { name: '编辑运输协议 · YSXY-DRAFT-001' })
  await expect(form).toBeVisible()
  await expect(form.locator('.art-dialog__viewport')).toHaveAttribute('aria-busy', 'true')
  await expect(form.getByRole('button', { name: '确定' })).toBeDisabled()
  await page.screenshot({ path: info.outputPath('transport-edit-loading.png') })
  releaseDetail?.()
  await expect(
    form.getByText('运输协议读取失败，请重试或关闭弹窗。', { exact: true })
  ).toBeVisible()
  await expect(form.getByRole('button', { name: '确定' })).toBeDisabled()
  await page.screenshot({ path: info.outputPath('transport-edit-retry.png') })
  detailFails = false
  await form.getByRole('button', { name: '重新加载' }).click()
  await expect(form.locator('.art-dialog__viewport')).toHaveAttribute('aria-busy', 'false')
  const driver = form.locator('.el-form-item').filter({ hasText: '乙方代表人' })
  await driver.getByRole('combobox').click()
  evidenceFails = true
  await page.getByRole('option', { name: '周师傅' }).click()
  await expect(form.getByText('司机证件读取失败，暂不能保存协议。')).toBeVisible()
  await expect(page.locator('.el-message')).toHaveCount(0)
  await form.getByRole('button', { name: '确定' }).click()
  expect(editPayload).toBeUndefined()
  evidenceFails = false
  await form.getByRole('button', { name: '重试读取证件' }).click()
  await expect(driver).toContainText('周师傅')
  expect(evidenceVehicleId).toBe(vehicleId)
  await page.screenshot({ path: info.outputPath('transport-representative.png') })
  await form.getByText('协议附件', { exact: true }).scrollIntoViewIfNeeded()
  await expect(form).toContainText('transport-certificate.svg')
  await page.screenshot({ path: info.outputPath('transport-attachments.png') })
  await form.getByRole('tab', { name: '证件附件' }).click()
  await expect(form.getByText('身份证（最多 5 张）')).toBeVisible()
  for (const [label, bucket] of [
    ['身份证', 'tms-driver-private'],
    ['行驶证', 'vms-vehicle-private'],
    ['驾驶证', 'tms-driver-private'],
    ['道路运输证', 'vms-vehicle-private']
  ]) {
    const group = form.locator('.el-form-item').filter({ hasText: `${label}（最多 5 张）` })
    await expect(group.locator('.art-upload img').first()).toBeVisible()
    await expect(group.locator('.art-upload img').first()).toHaveAttribute(
      'src',
      new RegExp(`/storage/v1/object/sign/${bucket}/`)
    )
  }
  await expect(page.locator('.el-message')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('transport-evidence.png') })
  await form.getByRole('button', { name: '确定' }).click()
  await expect(form).toBeHidden()
  expect(editPayload?.driver_id).toBe(driverId)
  expect(editPayload?.party_b_representative).toBe('周师傅')
  expect(editPayload?.attachments).toEqual([attachment])
  expect(editPayload?.id_card_images).toEqual([privateImages.idCard])
  expect(editPayload?.registration_images).toEqual([privateImages.registration])
  expect(editPayload?.driver_license_images).toEqual([privateImages.driverLicense])
  expect(editPayload?.road_permit_images).toEqual([privateImages.roadPermit])
  await draft.getByRole('button', { name: '预览协议' }).click()
  await expect(preview).toBeVisible()
  await expect(preview.getByText('transport-certificate.svg')).toBeVisible()
  await expect(
    preview.locator('img[src*="/storage/v1/object/sign/tms-driver-private/"]')
  ).toHaveCount(2)
  await expect(
    preview.locator('img[src*="/storage/v1/object/sign/vms-vehicle-private/"]')
  ).toHaveCount(2)
  await preview.getByRole('button', { name: '关闭弹窗' }).click()

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
  await page.route('**/storage/v1/object/public/attachments/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="80" viewBox="0 0 180 80"><path d="M10 53 Q36 8 47 54 T89 36 T132 49 M47 60 Q115 20 170 38" fill="none" stroke="#25354b" stroke-width="3" stroke-linecap="round"/></svg>'
    })
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
  await approved.getByRole('button', { name: 'YSXY-APPROVED-002' }).click()
  const signedDetail = page.getByRole('dialog', { name: '运输协议 · YSXY-APPROVED-002' })
  await signedDetail.getByRole('tab', { name: '签署信息' }).click()
  await expect(signedDetail).toContainText('2026-11-05')
  await signedDetail.getByRole('button', { name: '关闭弹窗' }).click()
  await page.setViewportSize({ width: 1024, height: 768 })
  await approved.getByRole('button', { name: '预览协议' }).click()
  await expect(preview).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
    .toBe(true)
  await expect(page.locator('.el-message')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('transport-preview-narrow.png') })
  await preview.getByText('乙方（签章）').scrollIntoViewIfNeeded()
  await expect(preview.getByText('签署日期：2026-11-05', { exact: true })).toHaveCount(2)
  await expect
    .poll(() =>
      preview
        .getByAltText('甲方手写签名')
        .evaluate((element: HTMLImageElement) => element.naturalWidth)
    )
    .toBeGreaterThan(0)
  await expect
    .poll(() =>
      preview
        .getByAltText('乙方手写签名')
        .evaluate((element: HTMLImageElement) => element.naturalWidth)
    )
    .toBeGreaterThan(0)
  await page.screenshot({ path: info.outputPath('transport-preview-signatures-narrow.png') })
  await page.keyboard.press('Escape')
  await expect(preview).toBeHidden()
  await page
    .locator('.business-table-workspace-actions__toggle')
    .filter({ hasText: '专注模式' })
    .locator('.el-switch')
    .click()
  await expect(page.locator('.art-table-query')).toHaveClass(/is-focus-mode/)
  await expect(page.getByText('TRANSPORT AGREEMENTS')).toBeHidden()
  await expect(draft).toBeVisible()
  await page.screenshot({ path: info.outputPath('transport-focus-narrow.png') })
  await page.getByRole('button', { name: '退出专注模式' }).click()
  await expect(page.getByText('TRANSPORT AGREEMENTS')).toBeVisible()
  await page
    .locator('.business-table-workspace-actions__toggle')
    .filter({ hasText: '专注模式' })
    .locator('.el-switch')
    .click()
  await page.keyboard.press('Escape')
  await expect(page.getByText('TRANSPORT AGREEMENTS')).toBeVisible()

  await page.getByRole('button', { name: '新增运输协议' }).click()
  const createForm = page.getByRole('dialog', { name: '新增运输协议' })
  await createForm.getByRole('combobox', { name: '* 承运方' }).click()
  await page.getByRole('option', { name: '承运车队甲' }).click()
  await createForm.getByRole('combobox', { name: '* 车牌号' }).click()
  await page.getByRole('option', { name: '湘A12345' }).click()
  await expect(createForm.getByRole('textbox', { name: '车长' })).toHaveValue(
    '保存后按车辆档案读取'
  )
  await createForm.getByRole('button', { name: '取消' }).click()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出' }).click()
  const download = await downloadPromise
  const exportPath = info.outputPath('transport-agreement-export.xlsx')
  await download.saveAs(exportPath)
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(exportPath)
  const sheet = workbook.worksheets[0]
  const findColumn = (title: string): number => {
    for (let column = 1; column <= sheet.columnCount; column += 1) {
      if (sheet.getRow(1).getCell(column).text === title) return column
    }
    throw new Error(`导出文件缺少列：${title}`)
  }
  const agreementColumn = findColumn('协议号')
  const partyADateColumn = findColumn('甲方签订日期')
  const partyBDateColumn = findColumn('乙方签订日期')
  let signedRow = 0
  for (let index = 2; index <= sheet.rowCount; index += 1) {
    if (sheet.getRow(index).getCell(agreementColumn).text === 'YSXY-APPROVED-002') {
      signedRow = index
      break
    }
  }
  expect(signedRow).toBeGreaterThan(1)
  expect(sheet.getRow(signedRow).getCell(partyADateColumn).text).toBe('2026-11-05')
  expect(sheet.getRow(signedRow).getCell(partyBDateColumn).text).toBe('2026-11-05')
  expect(errors).toEqual([])
})
