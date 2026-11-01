import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import {
  formStandardDictionaries,
  formStandardCompensationPlan
} from './fixtures/form-standard-modules-data'
import { createEmployeeProfile } from '../../modules/art-supabase-hr/src/views/personnel/employee-profile/modules/employee-profile-model'

const tenantId = '11111111-1111-4111-8111-111111111111'
const employeeId = '22222222-2222-4222-8222-222222222222'
test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

async function openFixture(
  page: Page,
  entry: string,
  query: Record<string, string> = {},
  profile?: object
) {
  await prepareIsolatedSession(page)
  const writes: string[] = []
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (
      /\/(?:save|create|link|delete|update|hr_save)_/.test(url.pathname) ||
      (request.method() !== 'GET' && !url.pathname.includes('/rpc/'))
    )
      writes.push(url.pathname)
    let json: unknown = []
    if (url.pathname.endsWith('/hr_get_employee_profile_secure')) json = profile
    if (url.pathname.endsWith('/hr_list_compensation_records_secure'))
      json = { records: [formStandardCompensationPlan], total: 1, amountAccess: true }
    if (url.pathname.endsWith('/hr_list_compensation_options_secure')) {
      const body = request.postDataJSON()
      json =
        body.p_kind === 'component'
          ? formStandardCompensationPlan.items.map((item) => ({
              id: item.componentId,
              code: item.componentCode,
              name: item.componentName,
              category: item.category,
              amountType: item.amountType
            }))
          : body.p_kind === 'employee'
            ? [{ id: employeeId, name: '验收员工', code: 'EMP-TEST' }]
            : []
    }
    if (url.pathname.endsWith('/mdm_operation_template'))
      json = [
        {
          id: employeeId,
          tenant_id: tenantId,
          name: '验收作业模板',
          total_score: 100,
          enabled: true
        }
      ]
    if (url.pathname.endsWith('/wms_inventory_policy'))
      json = { stale_days: 90, auto_reserve_on_release: true }
    if (url.pathname.endsWith('/sys_tenant'))
      json = [{ id: tenantId, tenant_code: 'TEST', tenant_name: '验收租户', status: '1' }]
    if (url.pathname.endsWith('/sys_dictionary')) {
      const code = (url.searchParams.get('dict_type_table.code') || '').replace(/^eq\./, '')
      const options = formStandardDictionaries[code as keyof typeof formStandardDictionaries] || []
      json = options.map((option, index) => ({
        ...option,
        id: `${code}-${index}`,
        status: '1',
        sort: index,
        dict_type_table: { code, name: code }
      }))
    }
    await route.fulfill({ json })
  })
  await page.goto(
    `/tests/e2e/fixtures/form-standard-modules.html?${new URLSearchParams({ entry, ...query })}`
  )
  if (!['employee-profile', 'employee-detail'].includes(entry))
    await page.getByRole('button', { name: '打开真实业务入口', exact: true }).click()
  return { writes, errors }
}

test('HR每条履历由同一配置表单渲染金额与普通字段，切换页签保留输入', async ({ page }, info) => {
  const { writes, errors } = await openFixture(page, 'employee-profile', {
    sourceUserId: employeeId,
    tenantId
  })
  const profile = page.locator('.hr-profile-page')
  await expect(profile.getByRole('textbox', { name: /员工姓名/ })).toBeVisible({ timeout: 60_000 })
  for (const [tab, add, money] of [
    ['劳动合同', '新增合同', '月薪'],
    ['培训经历', '新增培训经历', '培训费用'],
    ['奖惩经历', '新增奖惩记录', '金额']
  ]) {
    await profile.getByRole('tab', { name: new RegExp(tab) }).click()
    await profile.getByRole('button', { name: add, exact: true }).first().click()
    const card = profile.locator('.el-tab-pane:visible .hr-history-card').last()
    await expect(card.locator('form')).toHaveCount(1)
    const amount = card.getByRole('spinbutton', { name: money, exact: true })
    await amount.fill('128.50')
    await amount.blur()
    await expect(amount).toHaveValue('128.50')
  }
  await profile.getByRole('tab', { name: /劳动合同/ }).click()
  await expect(profile.getByRole('spinbutton', { name: '月薪', exact: true })).toHaveValue('128.50')
  await page.screenshot({ path: info.outputPath('hr-unified-contract-form.png') })
  expect(writes).toEqual([])
  expect(errors).toEqual([])
})

for (const entity of ['plan', 'employee']) {
  test(`HR薪酬${entity}子记录复用同一表单配置渲染并保持金额与比例`, async ({ page }, info) => {
    const { writes, errors } = await openFixture(page, `hr-compensation-${entity}`)
    const dialog = page.getByRole('dialog', {
      name: entity === 'plan' ? '编辑薪酬方案' : '编辑员工薪酬',
      exact: true
    })
    await expect(dialog).toBeVisible({ timeout: 60_000 })
    await expect(dialog.locator('form')).toHaveCount(1)
    const amount = dialog.getByRole('spinbutton', {
      name: entity === 'plan' ? '默认金额' : '员工金额',
      exact: true
    })
    const rate = dialog.getByRole('spinbutton', {
      name: entity === 'plan' ? '默认比例' : '员工比例',
      exact: true
    })
    await expect(amount).toHaveValue('100.00', { timeout: 30_000 })
    await amount.fill('168.50')
    await amount.blur()
    await rate.fill('0.125')
    await rate.blur()
    await expect(amount).toHaveValue('168.50')
    await expect(rate).toHaveValue('0.125000')
    if (entity === 'plan') {
      await expect(
        dialog.getByRole('switch', { name: '员工必配', exact: true }).first()
      ).toBeChecked()
      await dialog.locator('[data-art-form-item-key="planItems.0.required"] .el-switch').click()
      await expect(
        dialog.getByRole('switch', { name: '员工必配', exact: true }).first()
      ).not.toBeChecked()
    }
    await rate.scrollIntoViewIfNeeded()
    await page.screenshot({ path: info.outputPath(`hr-compensation-${entity}-fields.png`) })
    expect(writes).toEqual([])
    expect(errors).toEqual([])
  })
}

test('MDM配置dataSelect保持单选选择器与字段回填', async ({ page }, info) => {
  const { writes, errors } = await openFixture(page, 'mdm-template-binding')
  const dialog = page.getByRole('dialog', { name: '绑定作业模板', exact: true })
  await expect(dialog).toBeVisible({ timeout: 60_000 })
  await dialog.getByPlaceholder('请选择启用的模板', { exact: true }).click()
  const selector = page.getByRole('dialog', { name: '选择作业模板', exact: true })
  await expect(selector).toBeVisible()
  await selector.getByText('验收作业模板', { exact: true }).first().click()
  await selector.getByRole('button', { name: /确定|确认选择/ }).click()
  await expect(dialog.getByPlaceholder('请选择启用的模板', { exact: true })).toHaveValue(
    '验收作业模板'
  )
  await page.screenshot({ path: info.outputPath('mdm-data-select-configured-field.png') })
  expect(writes).toEqual([])
  expect(errors).toEqual([])
})

test('MDM库存策略普通数字和开关字段使用同一配置表单', async ({ page }, info) => {
  const { writes, errors } = await openFixture(page, 'mdm-inventory-policy')
  const dialog = page.getByRole('dialog', { name: '配置呆滞库存口径', exact: true })
  await expect(dialog).toBeVisible({ timeout: 60_000 })
  await expect(dialog.locator('form')).toHaveCount(1)
  const days = dialog.getByRole('spinbutton', { name: '无活动天数（天）', exact: true })
  await expect(days).toHaveValue('90')
  await days.fill('120')
  await days.blur()
  const reserve = dialog.getByRole('switch', { name: '工单下达时自动预留原料', exact: true })
  await expect(reserve).toBeChecked()
  await dialog.locator('[data-art-form-item-key="autoReserveOnRelease"] .el-switch').click()
  await expect(reserve).not.toBeChecked()
  await expect(days).toHaveValue('120')
  await page.screenshot({ path: info.outputPath('mdm-inventory-policy-schema.png') })
  expect(writes).toEqual([])
  expect(errors).toEqual([])
})

test('MDM编码规则配置checkboxGroup保持独立业务范围布尔值', async ({ page }, info) => {
  const { writes, errors } = await openFixture(page, 'supply-rule')
  const dialog = page.getByRole('dialog', { name: '新增供应链编码规则', exact: true })
  await expect(dialog).toBeVisible({ timeout: 60_000 })
  const scope = dialog.locator('[data-art-form-item-key="scope"]')
  await expect(scope.getByRole('checkbox', { name: '适用批号', exact: true })).toBeChecked()
  await scope.getByText('适用序列号', { exact: true }).click()
  await expect(scope.getByRole('checkbox', { name: '适用序列号', exact: true })).toBeChecked()
  await expect(scope.getByRole('checkbox', { name: '适用批号', exact: true })).toBeChecked()
  await expect(scope.getByRole('checkbox', { name: '适用跟踪号', exact: true })).not.toBeChecked()
  await page.screenshot({ path: info.outputPath('mdm-code-scope-schema.png') })
  expect(writes).toEqual([])
  expect(errors).toEqual([])
})

test('MDM班次数字与自动计算字段复用父表单且切换保留手工值', async ({ page }, info) => {
  const { writes, errors } = await openFixture(page, 'mdm-shift-pattern')
  const dialog = page.getByRole('dialog', { name: '新增轮班模式', exact: true })
  await expect(dialog).toBeVisible({ timeout: 60_000 })
  await expect(dialog.locator('form')).toHaveCount(1)
  const minutes = dialog.getByRole('spinbutton', { name: '班次 1 交班分钟', exact: true })
  await expect(minutes).toBeDisabled()
  await dialog.getByText('自动计算', { exact: true }).click()
  await expect(minutes).toBeEnabled()
  await minutes.fill('15')
  await minutes.blur()
  await dialog.getByText('自动计算', { exact: true }).click()
  await expect(minutes).toBeDisabled()
  await dialog.getByText('自动计算', { exact: true }).click()
  await expect(minutes).toHaveValue('15')
  await dialog.getByRole('button', { name: '新增班次', exact: true }).click()
  await expect(
    dialog.getByRole('spinbutton', { name: '班次 2 交班分钟', exact: true })
  ).toBeDisabled()
  await page.screenshot({ path: info.outputPath('mdm-single-parent-shift-fields.png') })
  expect(writes).toEqual([])
  expect(errors).toEqual([])
})

for (const access of ['read', 'masked', 'hidden'] as const) {
  test(`HR金额字段保留${access}权限且不影响履历字段配置`, async ({ page }, info) => {
    const value = access === 'masked' ? '***' : 1250
    const profileData = {
      ...createEmployeeProfile(tenantId),
      id: employeeId,
      employeeNo: 'EMP-TEST',
      employeeName: '验收员工',
      fieldAccess: { careerRecords: 'edit', compensationDetails: access },
      contracts: [
        {
          contractNo: 'CT-TEST',
          contractType: 'fixed_term',
          contractStatus: 'active',
          startDate: '2026-11-01',
          monthlySalary: value,
          remark: ''
        }
      ]
    }
    const { writes, errors } = await openFixture(
      page,
      'employee-profile',
      { recordId: employeeId },
      profileData
    )
    const profile = page.locator('.hr-profile-page')
    await expect(profile.getByRole('heading', { name: '编辑员工档案' })).toBeVisible({
      timeout: 60_000
    })
    await profile.getByRole('tab', { name: /劳动合同/ }).click()
    const card = profile.locator('.el-tab-pane:visible .hr-history-card').first()
    await expect(card.locator('form')).toHaveCount(1)
    await expect(card.getByRole('spinbutton', { name: '月薪', exact: true })).toHaveCount(0)
    const field = card.locator('[data-art-form-item-key="monthlySalary"]')
    if (access === 'hidden') await expect(field).toHaveCount(0)
    else {
      await expect(field).toContainText(access === 'masked' ? '***' : '1,250.00')
      await field.scrollIntoViewIfNeeded()
      await expect(field.locator('.art-form-item__text')).toBeInViewport({ ratio: 1 })
    }
    await expect(card.getByRole('textbox', { name: '工作地点', exact: true })).toBeEnabled()
    await page.screenshot({ path: info.outputPath(`hr-compensation-${access}.png`) })
    expect(writes).toEqual([])
    expect(errors).toEqual([])
  })
}

for (const theme of ['light', 'dark']) {
  test(`员工详情页头和摘要采用与新增页一致的间距 · ${theme}`, async ({ page }, info) => {
    const profile = {
      ...createEmployeeProfile(tenantId),
      id: employeeId,
      employeeNo: 'EMP-TEST',
      employeeName: '验收员工',
      fieldAccess: {
        careerRecords: 'read',
        contactDetails: 'read',
        identityDetails: 'read',
        compensationDetails: 'hidden'
      }
    }
    const { writes, errors } = await openFixture(
      page,
      'employee-detail',
      { recordId: employeeId, theme },
      profile
    )
    const detail = page.locator('.employee-detail-page')
    await expect(detail.getByRole('heading', { name: '验收员工' }).first()).toBeVisible({
      timeout: 60_000
    })
    const gap = await detail.evaluate((element) => {
      const header = element.querySelector('.art-page-header')!.getBoundingClientRect()
      const summary = element
        .querySelector('.employee-detail-page__summary')!
        .getBoundingClientRect()
      return summary.top - header.bottom
    })
    expect(gap).toBe(12)
    await page.screenshot({ path: info.outputPath(`hr-detail-spacing-${theme}.png`) })
    expect(writes).toEqual([])
    expect(errors).toEqual([])
  })
}

test('MDM公式普通字段使用配置，复合画布仍能添加常量并生成预览', async ({ page }, info) => {
  const { writes, errors } = await openFixture(page, 'activity-formula-editor')
  const dialog = page.getByRole('dialog', { name: '新增活动公式', exact: true })
  await expect(dialog).toBeVisible({ timeout: 60_000 })
  await expect(dialog.getByRole('textbox', { name: /公式编码/ })).toBeVisible()
  await dialog.getByRole('button', { name: '创建活动公式', exact: true }).click()
  await expect(dialog.locator('.el-form-item.is-error').first()).toBeVisible()
  await dialog.getByPlaceholder('输入数字', { exact: true }).fill('3')
  await dialog.getByRole('button', { name: '添加', exact: true }).click()
  await expect(dialog.locator('.formula-canvas')).toContainText('3')
  await expect(dialog.locator('.formula-editor__preview-grid')).toContainText('3')
  await page.screenshot({ path: info.outputPath('mdm-formula-configured-fields.png') })
  expect(writes).toEqual([])
  expect(errors).toEqual([])
})

test('HR工单分派普通字段配置保留必填校验', async ({ page }, info) => {
  const { writes, errors } = await openFixture(page, 'hr-service-assignment')
  const dialog = page.getByRole('dialog', { name: '分派员工服务工单', exact: true })
  await expect(dialog).toBeVisible({ timeout: 60_000 })
  await expect(dialog.locator('form')).toHaveCount(1)
  await dialog.getByRole('textbox', { name: '分派说明', exact: true }).fill('验收说明')
  await dialog.getByRole('button', { name: '确认分派', exact: true }).click()
  await expect(dialog.getByText('请选择工单处理人', { exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('hr-service-assignment-schema.png') })
  expect(writes).toEqual([])
  expect(errors).toEqual([])
})
