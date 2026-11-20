import { expect, test, type Page, type Route } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { expectCompactOverlayLabel } from './support/overlay-label-layout'
import { assertAppearance, prepareAppearance } from './support/appearance'
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
  profile?: object,
  intercept?: (route: Route) => Promise<boolean>
) {
  await prepareIsolatedSession(
    page,
    query.ordinary === 'true' ? { tenantId, platformSuper: false } : undefined
  )
  const writes: string[] = []
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', async (route) => {
    if (await intercept?.(route)) return
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
  await page.setViewportSize({ width: 1440, height: 900 })
  const { writes, errors } = await openFixture(page, 'mdm-inventory-policy')
  const dialog = page.getByRole('dialog', { name: '配置呆滞库存口径', exact: true })
  await expect(dialog).toBeVisible({ timeout: 60_000 })
  const form = dialog.locator('form')
  await expect(form).toHaveCount(1)
  await expect(form).toHaveClass(/el-form--label-top/)
  const days = dialog.getByRole('spinbutton', { name: '无活动天数（天）', exact: true })
  await expect(days).toHaveValue('90')
  await days.fill('120')
  await days.blur()
  const label = '工单下达时自动预留原料'
  const field = dialog.locator('[data-art-form-item-key="autoReserveOnRelease"]')
  const reserve = field.getByRole('switch', { name: label, exact: true })
  await expect(reserve).toBeChecked()
  await field.locator('.el-switch').click()
  await expect(reserve).not.toBeChecked()
  await expect(days).toHaveValue('120')
  await page.screenshot({ path: info.outputPath('mdm-inventory-policy-schema.png') })

  const enterFocus = dialog.getByRole('button', { name: '进入专注填单', exact: true })
  const exitFocus = dialog.getByRole('button', { name: '退出专注填单', exact: true })
  await enterFocus.press('Enter')
  await expect(form).toHaveClass(/el-form--label-left/)
  const caption = await expectCompactOverlayLabel(field)
  const tooltip = page.getByRole('tooltip').filter({ hasText: label })
  await caption.hover()
  await expect(tooltip).toHaveText(label)
  await expect(reserve).toHaveAccessibleName(label)
  await page.screenshot({ path: info.outputPath('mdm-inventory-policy-focus-label.png') })
  await days.hover()
  await expect(tooltip).toBeHidden()

  await days.focus()
  await page.keyboard.press('Tab')
  await expect(reserve).toBeFocused()
  await expect(tooltip).toHaveText(label)
  await page.screenshot({ path: info.outputPath('mdm-inventory-policy-keyboard-label.png') })
  await page.keyboard.press('Shift+Tab')
  await expect(days).toBeFocused()
  await expect(tooltip).toBeHidden()
  await page.keyboard.press('Tab')
  await expect(reserve).toBeFocused()
  await expect(tooltip).toHaveText(label)
  await page.keyboard.down('Escape')
  try {
    await expect(tooltip).toBeHidden()
    await page.keyboard.down('Escape')
    await expect(dialog).toBeVisible()
    await expect(exitFocus).toBeVisible()
    await expect(reserve).toBeFocused()
  } finally {
    await page.keyboard.up('Escape')
  }

  await exitFocus.press('Enter')
  await expect(form).toHaveClass(/el-form--label-top/)
  await expect(enterFocus).toBeFocused()
  await expect(days).toHaveValue('120')
  await expect(reserve).not.toBeChecked()

  await page.setViewportSize({ width: 390, height: 844 })
  await enterFocus.click()
  await expect(exitFocus).toBeVisible()
  await expect(form).toHaveClass(/el-form--label-top/)
  await expect(caption).toHaveCount(0)
  const fullLabel = field.locator('.el-form-item__label')
  await expect(fullLabel).toHaveText(label)
  await fullLabel.scrollIntoViewIfNeeded()
  expect(
    await fullLabel.evaluate((element) => {
      const range = document.createRange()
      range.selectNodeContents(element)
      const text = range.getBoundingClientRect()
      const labelBounds = element.getBoundingClientRect()
      return text.left >= labelBounds.left && text.right <= labelBounds.right + 1
    })
  ).toBe(true)
  await expect(days).toHaveValue('120')
  await expect(reserve).not.toBeChecked()
  await page.screenshot({ path: info.outputPath('mdm-inventory-policy-focus-mobile.png') })
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
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

for (const feature of [
  {
    entry: 'mdm-inventory-policy',
    title: '配置呆滞库存口径',
    readPath: '/rest/v1/wms_inventory_policy',
    writePath: '/rest/v1/wms_inventory_policy',
    conflict: 'tenant_id',
    errorTitle: '库存口径加载失败'
  },
  {
    entry: 'mdm-package-placement',
    title: '垛包落位',
    readPath: '/rest/v1/mdm_warehouse_bin',
    writePath: '/rest/v1/wms_package_placement',
    conflict: 'tenant_id,pack_id',
    errorTitle: '库位加载失败'
  }
] as const) {
  for (const outcome of ['success', 'error'] as const) {
    test(`${feature.entry} 同键重开隔离旧${outcome}加载并保留当前编辑与重试`, async ({
      page
    }, info) => {
      const policy = feature.entry === 'mdm-inventory-policy'
      const narrow = info.project.name === 'mobile-390'
      const appearance = {
        theme: narrow ? ('dark' as const) : ('light' as const),
        boxBorderMode: !narrow
      }
      await prepareAppearance(page, appearance)
      await page.setViewportSize({ width: narrow ? 390 : 1440, height: narrow ? 844 : 900 })
      const gates = Array.from({ length: 4 }, () => Promise.withResolvers<void>())
      const readRequests: Array<{ path: string; query: Record<string, string> }> = []
      const mutations: Array<{ path: string; query: Record<string, string>; body: unknown }> = []
      const unexpected: Array<{ method: string; path: string }> = []
      const warehouseId = employeeId
      const binResponses = Array.from({ length: 4 }, (_, read) =>
        Array.from({ length: 2 }, (_, option) => ({
          id: `44444444-4444-4444-8444-${String(read * 2 + option + 1).padStart(12, '0')}`,
          tenant_id: tenantId,
          warehouse_id: warehouseId,
          zone_id: null,
          parent_id: null,
          bin_code: `LOAD-${read + 1}-${option + 1}`,
          bin_name: `第${read + 1}次${option === 0 ? '候选' : '保留'}库位`,
          bin_type: 'floor',
          shelf_code: null,
          level_no: null,
          column_no: null,
          max_weight_kg: null,
          max_area_sqm: null,
          max_quantity: null,
          fixed_material_id: null,
          allow_mix: false,
          supports_serial: false,
          status: 'available',
          sort: option,
          remark: null
        }))
      )
      const expectedReadQuery = policy
        ? { select: 'stale_days,auto_reserve_on_release', tenant_id: `eq.${tenantId}` }
        : { select: '*', warehouse_id: `eq.${warehouseId}`, order: 'sort.asc,bin_code.asc' }
      try {
        const { writes, errors } = await openFixture(
          page,
          feature.entry,
          { ordinary: 'true', theme: appearance.theme },
          undefined,
          async (route) => {
            const request = route.request()
            const url = new URL(request.url())
            if (request.method() === 'GET' && url.pathname === feature.readPath) {
              const read =
                readRequests.push({
                  path: url.pathname,
                  query: Object.fromEntries(url.searchParams)
                }) - 1
              const gate = gates[read]
              if (!gate) {
                unexpected.push({ method: request.method(), path: url.pathname })
                await route.fulfill({
                  status: 500,
                  json: { code: 'P0001', message: '隔离测试收到额外加载请求' }
                })
                return true
              }
              await gate.promise
              await route.fulfill(
                outcome === 'error' && (read === 0 || read === 2)
                  ? {
                      status: 403,
                      json: { code: '42501', message: '本次仓储配置读取暂未完成，请重试' }
                    }
                  : {
                      json: policy
                        ? { stale_days: (read + 1) * 111, auto_reserve_on_release: read % 2 === 1 }
                        : binResponses[read]
                    }
              )
              return true
            }
            if (request.method() === 'POST' && url.pathname === feature.writePath) {
              mutations.push({
                path: url.pathname,
                query: Object.fromEntries(url.searchParams),
                body: request.postDataJSON()
              })
              await route.fulfill({
                json: policy ? [{ tenant_id: tenantId }] : [{ id: warehouseId }]
              })
              return true
            }
            if (request.method() === 'POST' && url.pathname === '/rest/v1/rpc/current_is_super') {
              await route.fulfill({ json: false })
              return true
            }
            if (
              request.method() === 'POST' &&
              url.pathname === '/rest/v1/rpc/get_table_column_runtime'
            ) {
              await route.fulfill({ json: { enabled: false, profiles: [] } })
              return true
            }
            if (
              request.method() === 'POST' &&
              url.pathname === '/rest/v1/rpc/get_organization_list_secure'
            ) {
              await route.fulfill({ json: [] })
              return true
            }
            if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
              unexpected.push({ method: request.method(), path: url.pathname })
              await route.fulfill({
                status: 403,
                json: { code: '42501', message: '隔离测试已阻止未预期的写请求' }
              })
              return true
            }
            return false
          }
        )
        const dialog = page.getByRole('dialog', { name: feature.title, exact: true })
        const viewport = dialog.locator('.art-dialog__viewport')
        const content = dialog.locator('.art-dialog__content')
        const days = dialog.locator('[data-art-form-item-key="staleDays"] input')
        const reserve = dialog.locator(
          '[data-art-form-item-key="autoReserveOnRelease"] [role="switch"]'
        )
        const selection = dialog.locator('[data-art-form-item-key="binId"] .el-select')
        const primary = policy
          ? days
          : dialog.locator('[data-art-form-item-key="binId"] input').first()
        await assertAppearance(page, appearance)
        await expect(page.locator('html')).toHaveAttribute('data-ui-scope', 'workspace')
        await expect(page.locator('html')).toHaveAttribute('data-platform-super', 'false')
        await expect(dialog).toBeVisible({ timeout: 60_000 })
        await expect.poll(() => readRequests.length).toBe(1)
        await expect(viewport).toHaveAttribute('aria-busy', 'true')
        await dialog.getByRole('button', { name: '关闭弹窗', exact: true }).click()
        await expect(dialog).toBeHidden()
        await page.getByRole('button', { name: '打开真实业务入口', exact: true }).click()
        await expect.poll(() => readRequests.length).toBe(2)
        await expect(dialog).toBeVisible()
        await expect(viewport).toHaveAttribute('aria-busy', 'true')
        const waitingValue = await primary.inputValue()
        const waitingReserve = policy ? await reserve.isChecked() : false
        gates[0].resolve()
        await expect(page.getByTestId('open-completions')).toHaveText('1')
        await expect.soft(viewport).toHaveAttribute('aria-busy', 'true')
        await expect.soft(content).toHaveJSProperty('inert', true)
        await expect.soft(dialog.locator('.art-overlay-loading')).toHaveCount(1)
        await expect.soft(dialog.locator('.el-alert')).toHaveCount(0)
        expect.soft(await primary.inputValue()).toBe(waitingValue)
        if (policy) expect.soft(await reserve.isChecked()).toBe(waitingReserve)
        expect
          .soft(
            await primary.evaluate((element: HTMLElement) => {
              element.focus()
              return document.activeElement === element
            })
          )
          .toBe(false)
        gates[1].resolve()
        await expect(page.getByTestId('open-completions')).toHaveText('2')
        await expect(viewport).toHaveAttribute('aria-busy', 'false')
        await expect.soft(dialog.locator('.el-alert')).toHaveCount(0)
        if (policy) await expect(days).toHaveValue('222')
        else {
          await selection.click()
          await page
            .getByRole('option', {
              name: `${binResponses[1][0].bin_code} · ${binResponses[1][0].bin_name}`,
              exact: true
            })
            .click()
        }
        await dialog.getByRole('button', { name: '关闭弹窗', exact: true }).click()
        await expect(dialog).toBeHidden()
        await page.getByRole('button', { name: '打开真实业务入口', exact: true }).click()
        await expect.poll(() => readRequests.length).toBe(3)
        if (outcome === 'success') {
          await dialog.getByRole('button', { name: '关闭弹窗', exact: true }).click()
          await expect(dialog).toBeHidden()
          await page.getByRole('button', { name: '打开真实业务入口', exact: true }).click()
          await expect.poll(() => readRequests.length).toBe(4)
          gates[3].resolve()
          await expect(page.getByTestId('open-completions')).toHaveText('3')
        } else {
          gates[2].resolve()
          await expect(page.getByTestId('open-completions')).toHaveText('3')
          await expect(viewport).toHaveAttribute('aria-busy', 'false')
          await expect(dialog.getByText(feature.errorTitle, { exact: true })).toBeVisible()
          await dialog.getByRole('button', { name: '确定', exact: true }).click()
          await expect(dialog.getByRole('button', { name: '确定', exact: true })).toBeEnabled()
          expect(mutations).toEqual([])
          await dialog.getByRole('button', { name: '重新加载', exact: true }).click()
          await expect.poll(() => readRequests.length).toBe(4)
          await expect(viewport).toHaveAttribute('aria-busy', 'true')
          gates[3].resolve()
        }
        await expect(viewport).toHaveAttribute('aria-busy', 'false')
        await expect(dialog.locator('.el-alert')).toHaveCount(0)
        if (policy) {
          await expect(days).toHaveValue('444')
          await days.fill('445')
          await days.blur()
          await expect(reserve).toBeChecked()
          await dialog.locator('[data-art-form-item-key="autoReserveOnRelease"] .el-switch').click()
          await expect(reserve).not.toBeChecked()
        } else {
          await selection.click()
          await page
            .getByRole('option', {
              name: `${binResponses[3][1].bin_code} · ${binResponses[3][1].bin_name}`,
              exact: true
            })
            .click()
        }
        if (outcome === 'success') {
          gates[2].resolve()
          await expect(page.getByTestId('open-completions')).toHaveText('4')
          await expect.soft(viewport).toHaveAttribute('aria-busy', 'false')
          await expect.soft(dialog.locator('.el-alert')).toHaveCount(0)
          if (policy) {
            await expect.soft(days).toHaveValue('445')
            await expect.soft(reserve).not.toBeChecked()
          } else {
            await selection.click()
            await expect
              .soft(
                page.getByRole('option', {
                  name: `${binResponses[3][1].bin_code} · ${binResponses[3][1].bin_name}`,
                  exact: true
                })
              )
              .toBeVisible()
            await expect
              .soft(
                page.getByRole('option', {
                  name: `${binResponses[2][0].bin_code} · ${binResponses[2][0].bin_name}`,
                  exact: true
                })
              )
              .toHaveCount(0)
            await page.keyboard.press('Escape')
            await expect
              .soft(
                selection.getByText(
                  `${binResponses[3][1].bin_code} · ${binResponses[3][1].bin_name}`,
                  { exact: true }
                )
              )
              .toBeVisible()
          }
        }
        await page.screenshot({
          path: info.outputPath(
            `${feature.entry}-${outcome}-${narrow ? 'dark390' : 'light1440'}.png`
          )
        })
        await dialog.getByRole('button', { name: '确定', exact: true }).click()
        await expect(page.getByTestId('save-result')).toHaveText('已保存')
        await expect(dialog).toBeHidden()
        expect(mutations).toEqual([
          {
            path: feature.writePath,
            query: { on_conflict: feature.conflict, select: policy ? 'tenant_id' : 'id' },
            body: policy
              ? { tenant_id: tenantId, stale_days: 445, auto_reserve_on_release: false }
              : {
                  tenant_id: tenantId,
                  pack_id: warehouseId,
                  warehouse_id: warehouseId,
                  bin_id: binResponses[3][1].id
                }
          }
        ])
        expect(readRequests).toEqual(
          Array.from({ length: 4 }, () => ({ path: feature.readPath, query: expectedReadQuery }))
        )
        expect(unexpected).toEqual([])
        expect(writes).toEqual([])
        expect(errors).toEqual([])
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
        ).toBeLessThanOrEqual(1)
      } finally {
        gates.forEach((gate) => gate.resolve())
      }
    })
  }
}
