import { expect, test, type Page } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 20_000 })
test.setTimeout(180_000)

const tenantId = '11111111-1111-4111-8111-111111111111'
const driverId = '33333333-3333-4333-8333-333333333333'

async function setup(page: Page): Promise<void> {
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  const dicts: Record<string, Array<[string, string]>> = {
    tmsDriverRegistrationStatus: [
      ['unregistered', '未注册'],
      ['registered', '已注册']
    ],
    tmsDriverAuthStatus: [
      ['unverified', '未认证'],
      ['verified', '已认证'],
      ['internal_saved', '企业内保存']
    ],
    tmsDriverType: [['primary', '主驾']],
    tmsDriverOwnership: [['self', '自营司机']],
    tmsDriverStatus: [['on_duty', '在岗']],
    tmsDriverLicenseType: [['A2', 'A2']],
    commonBoolean: [
      ['true', '启用'],
      ['false', '停用']
    ],
    sex: [['male', '男']],
    tmsServiceType: [
      ['complaint', '投诉'],
      ['consultation', '咨询']
    ],
    tmsComplaintType: [['timeliness', '时效']],
    tmsServiceCaseStatus: [['pending', '待回复']],
    tmsDispatchOperatorMode: [
      ['carrier', '承运方'],
      ['self_operated', '自营'],
      ['individual_driver', '个体司机']
    ]
  }
  await page.route('**/rest/v1/sys_dictionary?**', (route) => {
    const code =
      new URL(route.request().url()).searchParams
        .get('dict_type_table.code')
        ?.replace(/^eq\./, '') || ''
    return route.fulfill({
      json: (dicts[code] ?? []).map(([value, label], index) => ({
        id: `dict-${code}-${index}`,
        type_id: `type-${code}`,
        code: value,
        label,
        value,
        status: '1',
        sort: index + 1,
        tag_type: 'primary',
        dict_type_table: { code, name: code }
      }))
    })
  })
  await page.route('**/rest/v1/rpc/get_table_column_runtime', (route) =>
    route.fulfill({ json: { enabled: false, profiles: [] } })
  )
}

test('货物新增参选使用分类、物料与已选三栏，单位显示名称', async ({ page }, testInfo) => {
  await setup(page)
  await page.route('**/rest/v1/mdm_material_category?**', (route) =>
    route.fulfill({
      json: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          parent_id: null,
          category_code: 'C',
          category_name: '产品品类'
        }
      ],
      headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
    })
  )
  await page.route('**/rest/v1/mdm_material?**', (route) =>
    route.fulfill({
      json: [
        {
          id: '55555555-5555-4555-8555-555555555555',
          tenant_id: tenantId,
          material_code: 'M-001',
          material_name: '验收物料一',
          description: '测试物料',
          specification_model: 'A型',
          basic_unit: 'kg',
          material_group_id: null,
          category_id: '44444444-4444-4444-8444-444444444444',
          category: { category_name: '产品品类' },
          baseUnit: { unit_name: '千克' }
        },
        {
          id: '66666666-6666-4666-8666-666666666666',
          tenant_id: tenantId,
          material_code: 'M-002',
          material_name: '验收物料二',
          description: '测试物料',
          specification_model: 'B型',
          basic_unit: 'pcs',
          material_group_id: null,
          category_id: '44444444-4444-4444-8444-444444444444',
          category: { category_name: '产品品类' },
          baseUnit: { unit_name: '件' }
        }
      ],
      headers: { 'content-range': '0-1/2', 'access-control-expose-headers': 'content-range' }
    })
  )
  await page.goto('/tests/e2e/fixtures/tms-cargo-driver-service.html?kind=cargo', {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.getByText('新增货物', { exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: '参选 MDM 物料编码' }).click()
  await expect(page.getByText('产品品类')).toBeVisible()
  await expect(page.getByRole('columnheader', { name: '物料编码' })).toBeVisible()
  const picker = page.getByRole('dialog', { name: '参选物料编码' })
  await expect(picker.getByText('已选 0', { exact: true })).toBeVisible()
  await expect(page.getByText('千克', { exact: true })).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('cargo-picker-three-pane.png'),
    fullPage: true
  })
  await picker.getByRole('row', { name: /M-001/ }).locator('.el-checkbox').click()
  await picker.getByRole('row', { name: /M-002/ }).locator('.el-checkbox').click()
  await expect(picker.getByText('已选 2', { exact: true })).toBeVisible()
  await picker.getByRole('button', { name: '确定' }).click()
  await expect(page.getByRole('group', { name: '计量单位' }).getByText('千克')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('cargo-picker.png'), fullPage: true })
})

test('货物编辑以 MDM 单位名称展示持久化单位代码', async ({ page }, testInfo) => {
  await setup(page)
  await page.goto('/tests/e2e/fixtures/tms-cargo-driver-service.html?kind=cargo-edit', {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.getByText('编辑货物', { exact: true })).toBeVisible()
  const unit = page.getByRole('group', { name: '计量单位' })
  await expect(unit.getByText('件', { exact: true })).toBeVisible()
  await expect(unit).not.toContainText('U05')
  await page.screenshot({ path: testInfo.outputPath('cargo-edit-unit-name.png'), fullPage: true })
})

test('司机姓名查看沿用编辑弹窗布局并禁止写入', async ({ page }, testInfo) => {
  await setup(page)
  await page.route('**/rest/v1/rpc/tms_get_driver_secure', (route) =>
    route.fulfill({
      json: {
        id: driverId,
        tenant_id: tenantId,
        carrier_id: null,
        driver_name: '验收司机',
        phone: '138****0001',
        gender: 'male',
        license_type: 'A2',
        driver_type: 'primary',
        enabled: true,
        company_name: '验收运输公司'
      }
    })
  )
  await page.route('**/rest/v1/rpc/tms_get_driver_profile_secure', (route) =>
    route.fulfill({
      json: {
        driver_ownership: 'self',
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
        reason: null,
        reviewedAt: null,
        identityStatus: 'unverified',
        licenseStatus: 'unverified',
        qualificationStatus: 'unverified',
        canReview: false
      }
    })
  )
  await page.goto('/tests/e2e/fixtures/tms-cargo-driver-service.html?kind=driver', {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.getByText('查看司机', { exact: true })).toBeVisible()
  await expect(page.getByText('验收运输公司')).toBeVisible()
  await expect(page.getByRole('tab', { name: '身份证信息' })).toBeVisible()
  await expect(page.getByRole('button', { name: '确定' })).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('driver-readonly.png'), fullPage: true })
})

test('司机列表展示归属、公司、认证与紧急联系人，黑名单姓名可查看', async ({ page }, testInfo) => {
  await setup(page)
  const driverRow = {
    id: driverId,
    tenant_id: tenantId,
    carrier_id: null,
    driver_name: '验收司机',
    phone: '138****0001',
    gender: 'male',
    license_type: 'A2',
    driver_type: 'primary',
    enabled: false,
    company_name: '验收运输公司',
    driver_ownership: 'self',
    portrait_url: null,
    registration_status: 'unregistered',
    identity_auth_status: 'unverified',
    license_auth_status: 'internal_saved',
    qualification_auth_status: 'unverified',
    emergency_contact_name: '应急联系人',
    emergency_contact_phone: '139****0002',
    is_blacklisted: true,
    assigned_vehicles: [],
    field_access: {
      contactPhone: 'read',
      emergencyContact: 'read',
      homeAddress: 'hidden',
      identityDocuments: 'read'
    }
  }
  await page.route('**/rest/v1/rpc/tms_list_drivers_secure', (route) =>
    route.fulfill({
      json: { records: [driverRow], total: 1, fieldAccess: driverRow.field_access }
    })
  )
  await page.route('**/rest/v1/rpc/tms_get_driver_secure', (route) =>
    route.fulfill({ json: driverRow })
  )
  await page.route('**/rest/v1/rpc/tms_get_driver_profile_secure', (route) =>
    route.fulfill({
      json: {
        driver_ownership: 'self',
        registration_status: 'unregistered',
        identity_auth_status: 'unverified',
        license_auth_status: 'internal_saved',
        qualification_auth_status: 'unverified'
      }
    })
  )
  await page.route('**/rest/v1/rpc/tms_get_driver_certification_secure', (route) =>
    route.fulfill({
      json: {
        required: false,
        certified: false,
        reason: null,
        reviewedAt: null,
        identityStatus: 'unverified',
        licenseStatus: 'internal_saved',
        qualificationStatus: 'unverified',
        canReview: false
      }
    })
  )
  await page.goto('/tests/e2e/fixtures/tms-cargo-driver-service.html?kind=driver-list', {
    waitUntil: 'domcontentloaded'
  })
  for (const label of [
    '照片',
    '司机归属',
    '所属公司',
    '注册状态',
    '身份证状态',
    '驾驶证状态',
    '从业资格证状态',
    '紧急联系人',
    '紧急联系人电话'
  ]) {
    await expect(page.getByRole('columnheader', { name: label, exact: true })).toHaveCount(1)
  }
  await expect(page.locator('.tms-driver__blocked').getByText('黑名单')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('driver-list.png'), fullPage: true })
  await page.locator('.tms-driver__blocked').getByRole('button', { name: '验收司机' }).click()
  await expect(page.getByText('查看司机', { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('driver-list-readonly.png'), fullPage: true })
})

test('服务单参选原运单并带出调度信息', async ({ page }, testInfo) => {
  await setup(page)
  await page.route('**/rest/v1/rpc/tms_list_service_case_waybill_options_secure', (route) =>
    route.fulfill({
      json: {
        records: [
          {
            id: '77777777-7777-4777-8777-777777777777',
            tenant_id: tenantId,
            order_no: 'YD-2026-001',
            waybill_no: 'DD-2026-001',
            dispatch_mode: 'self_operated',
            origin_station: '上海',
            destination_station: '苏州',
            dispatch_plate_no: '沪A12345',
            dispatch_driver_name: '验收司机',
            dispatch_driver_phone: '138****0001'
          }
        ],
        total: 1
      }
    })
  )
  await page.goto('/tests/e2e/fixtures/tms-cargo-driver-service.html?kind=service', {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.getByText('新增投诉咨询', { exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: '运单号' }).click()
  await expect(page.getByRole('columnheader', { name: '调度运单号' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: '线路' })).toBeVisible()
  await expect(page.getByText('YD-2026-001')).toBeVisible()
  const picker = page.getByRole('dialog', { name: '参选运单' })
  await expect(picker.getByText('自营', { exact: true })).toBeVisible()
  await picker
    .getByRole('row', { name: /YD-2026-001/ })
    .locator('.el-checkbox')
    .click()
  await picker.getByRole('button', { name: '确定' }).click()
  await expect(page.getByRole('group', { name: '调度方式' }).getByText('自营')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('service-waybill-picker.png'), fullPage: true })
})

test('服务单沟通记录支持回复及提及对象', async ({ page }, testInfo) => {
  await setup(page)
  const caseId = '88888888-8888-4888-8888-888888888888'
  const userId = '99999999-9999-4999-8999-999999999999'
  const caseRow = {
    id: caseId,
    tenant_id: tenantId,
    service_no: 'FW-2026-001',
    organization_name: '验收运输公司',
    service_type: 'complaint',
    complaint_types: ['timeliness'],
    title: '时效反馈',
    waybill_id: null,
    waybill_no: null,
    contact_name: '测试联系人',
    contact_phone: '138****0000',
    content: '请核对送达时间',
    attachments: [],
    remark: null,
    status: 'pending',
    submitted_at: '2026-11-02T08:00:00Z',
    submitted_by: '测试用户',
    create_by: '测试用户',
    create_time: '2026-11-02T08:00:00Z',
    update_time: '2026-11-02T08:00:00Z'
  }
  const replies = [
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      tenant_id: tenantId,
      service_case_id: caseId,
      reply_to_id: null,
      content: '此前已联系司机',
      attachments: [],
      mentions: [],
      author_user_id: userId,
      author_name: '测试用户',
      create_time: '2026-11-02T08:20:00Z'
    }
  ]
  const submissions: Record<string, unknown>[] = []
  await page.route('**/rest/v1/tms_service_case?**', (route) =>
    route.fulfill({
      json: [caseRow],
      headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
    })
  )
  await page.route('**/rest/v1/tms_service_case_reply?**', (route) => {
    if (route.request().method() === 'POST') {
      const submitted = route.request().postDataJSON() as Record<string, unknown>
      submissions.push(submitted)
      replies.push({
        ...replies[0],
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        content: String(submitted.content),
        mentions: submitted.mentions as [],
        create_time: '2026-11-02T08:30:00Z'
      })
      return route.fulfill({ json: replies.at(-1) })
    }
    return route.fulfill({ json: replies })
  })
  await page.route('**/rest/v1/rpc/tms_list_service_case_mention_targets_secure', (route) =>
    route.fulfill({
      json: {
        users: [{ value: userId, label: '测试用户' }],
        organizations: [],
        roles: []
      }
    })
  )
  await page.goto('/tests/e2e/fixtures/tms-cargo-driver-service.html?kind=service-detail', {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.getByRole('button', { name: 'FW-2026-001' })).toBeVisible()
  await page.getByRole('button', { name: 'FW-2026-001' }).click()
  await page.getByRole('tab', { name: '沟通记录' }).click()
  await expect(page.getByText('此前已联系司机')).toBeVisible()
  await page.getByRole('textbox', { name: '回复内容' }).fill('已核实送达时间，正在反馈。')
  await page.getByText('选择要提及的用户', { exact: true }).click()
  await page.getByText('测试用户', { exact: true }).last().click()
  await page.getByRole('button', { name: '发送回复' }).click()
  await expect.poll(() => submissions.at(-1)?.content).toBe('已核实送达时间，正在反馈。')
  expect(submissions.at(-1)?.mentions).toEqual([{ kind: 'user', id: userId, label: '测试用户' }])
  await page.screenshot({ path: testInfo.outputPath('service-conversation.png'), fullPage: true })
})
