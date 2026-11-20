import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { assertAppearance, prepareAppearance } from './support/appearance'
import { captureBusinessEvidence } from './support/capture-business-evidence'
import {
  installActionFeedbackHistory,
  readActionFeedbackHistory
} from './support/action-feedback-history'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const tenantId = '11111111-1111-4111-8111-111111111111'
const supplierId = '22222222-2222-4222-8222-222222222222'
const recordId = '33333333-3333-4333-8333-333333333333'
const equipmentId = '44444444-4444-4444-8444-444444444444'
const reporterId = '55555555-5555-4555-8555-555555555555'
const groupId = '66666666-6666-4666-8666-666666666666'
const categoryId = '77777777-7777-4777-8777-777777777777'
const departmentId = '88888888-8888-4888-8888-888888888888'
const dictionaries = {
  sex: [{ label: '未知', value: 'unknown', status: '1' }],
  mdmCurrency: [{ label: '人民币', value: 'CNY', status: '1' }],
  pmisRepairUrgency: [{ label: '普通', value: 'normal', status: '1' }],
  pmisRepairStatus: [{ label: '已报修', value: 'reported', status: '1' }],
  supplierCategory: [{ label: '物料供应商', value: 'material', status: '1' }],
  supplierType: [{ label: '普通供应商', value: 'general', status: '1' }],
  enterpriseNature: [{ label: '民营企业', value: 'private', status: '1' }],
  supplierIndustry: [{ label: '制造业', value: 'manufacturing', status: '1' }],
  commonEnabledStatus: [{ label: '启用', value: 'enabled', status: '1' }],
  mdmEquipmentOperationStatus: [{ label: '正常', value: 'normal', status: '1' }],
  commonEnabledDisabledStatus: [{ label: '启用', value: 'enabled', status: '1' }],
  scmExpenseTagStyle: [{ label: '朴素', value: 'plain', status: '1' }]
}
const scenarios = [
  {
    entry:
      'modules/art-supabase-mdm/src/views/purchase-master/supplier/modules/supplier-contact-dialog.vue',
    name: '供应商联系人',
    title: '编辑联系人',
    confirm: '保存更改',
    loading: '正在保存联系人…',
    permissions: ['MdmPurchaseSupplier:View', 'MdmPurchaseSupplier:ManageContact'],
    args: [
      {
        supplierId,
        row: {
          id: recordId,
          name: '原联系人',
          phone: '13800138000',
          email: 'contact@example.invalid',
          remark: '联系人资料确认'
        }
      }
    ],
    endpoint: '/rest/v1/mdm_supplier_contact',
    method: 'PATCH',
    response: [{ id: recordId }],
    primary: 'name',
    primaryPayload: 'name',
    primaryTab: '联系人身份',
    secondary: 'phone',
    secondaryPayload: 'phone',
    secondaryTab: '联系方式',
    first: ['待保存联系人甲', '13800138001'],
    second: ['重试联系人乙', '13800138002'],
    payload: {
      supplier_id: supplierId,
      alias: null,
      gender: null,
      position: null,
      department: null,
      fax: null,
      wechat: null,
      qq: null,
      email: 'contact@example.invalid',
      remark: '联系人资料确认'
    }
  },
  {
    entry:
      'modules/art-supabase-mdm/src/views/purchase-master/supplier/modules/supplier-bank-dialog.vue',
    name: '供应商银行信息',
    title: '编辑银行信息',
    confirm: '保存更改',
    loading: '正在保存银行信息…',
    permissions: ['MdmPurchaseSupplier:View', 'MdmPurchaseSupplier:ManageBank'],
    args: [
      {
        supplierId,
        row: {
          id: recordId,
          bankAccount: '6222000000000000',
          accountName: '原收款账户',
          bankName: '验收银行',
          currencyCode: 'CNY',
          payeeAddress: '上海市浦东新区验收路100号',
          payeePhone: '13800138000'
        }
      }
    ],
    endpoint: '/rest/v1/mdm_supplier_bank',
    method: 'PATCH',
    response: [{ id: recordId }],
    primary: 'accountName',
    primaryPayload: 'account_name',
    primaryTab: '',
    secondary: 'payeePhone',
    secondaryPayload: 'payee_phone',
    secondaryTab: '',
    first: ['待保存收款账户甲', '13800138001'],
    second: ['重试收款账户乙', '13800138002'],
    payload: {
      supplier_id: supplierId,
      bank_account: '6222000000000000',
      iban: null,
      bank_name: '验收银行',
      currency_code: 'CNY',
      payee_address: '上海市浦东新区验收路100号'
    }
  },
  {
    entry: 'modules/art-supabase-pmis/src/views/components/repair-task-dialog.vue',
    name: '维修工单',
    title: '编辑维修工单',
    confirm: '保存工单',
    loading: '正在保存维修工单…',
    permissions: ['PmisRepairTask:View', 'PmisRepairTask:Edit'],
    args: [
      {
        tenantId,
        row: {
          id: recordId,
          tenantId,
          workOrderNo: 'REPAIR-1',
          equipment: {
            id: equipmentId,
            tenantId,
            equipmentCode: 'EQ-1',
            equipmentName: '验收设备',
            operationStatus: 'operating',
            status: 'enabled'
          },
          urgency: 'normal',
          faultSymptom: '设备有异响',
          faultPhotoFiles: [],
          reporter: {
            id: reporterId,
            tenantId,
            employeeNo: 'EMP-1',
            employeeName: '验收员工',
            employmentStatus: 'active'
          },
          repairer: null,
          confirmer: null,
          faultAnalysis: '',
          faultCause: '',
          solution: '',
          repairPhotoFiles: [],
          status: 'reported'
        }
      }
    ],
    endpoint: '/rest/v1/rpc/pmis_save_repair_task_secure',
    method: 'POST',
    response: recordId,
    primary: 'faultSymptom',
    primaryPayload: 'fault_symptom',
    primaryTab: '报修信息',
    secondary: 'solution',
    secondaryPayload: 'solution',
    secondaryTab: '维修处置',
    first: ['待保存的设备异响现象', '检查传动组件并记录复测结果'],
    second: ['重试后确认的设备异响现象', '更换传动组件并完成复测'],
    payload: {
      tenant_id: tenantId,
      equipment_id: equipmentId,
      urgency: 'normal',
      fault_photo_files: [],
      reporter_employee_id: reporterId,
      repairer_employee_id: null,
      confirmer_employee_id: null,
      fault_analysis: null,
      fault_cause: null,
      repair_photo_files: [],
      status: 'reported'
    }
  },
  {
    entry:
      'modules/art-supabase-mdm/src/views/purchase-master/supplier/modules/supplier-dialog.vue',
    name: '供应商档案',
    title: '编辑供应商',
    confirm: '保存更改',
    loading: '正在保存供应商档案…',
    permissions: ['MdmPurchaseSupplier:View', 'MdmPurchaseSupplier:Edit'],
    args: [
      {
        tenantId,
        tenantOptions: [{ label: '测试租户', value: tenantId }],
        groups: [
          {
            id: groupId,
            tenantId,
            domain: 'supplier',
            parentId: null,
            code: 'EQUIPMENT',
            name: '设备供应商',
            enabled: true,
            sort: 10,
            remark: ''
          }
        ],
        row: {
          id: recordId,
          tenantId,
          groupId,
          supplierCode: 'SUP_PENDING',
          supplierName: '验收供应商档案',
          supplierCategory: 'material',
          supplierType: 'general',
          supplierGroup: '设备供应商',
          enterpriseNature: 'private',
          industry: 'manufacturing',
          contactPerson: '验收联系人',
          contactPhone: '13800138000',
          region: '上海市/上海市/浦东新区',
          regionAdcode: '310115',
          addressDetail: '上海市浦东新区验收路100号',
          longitude: 121.5,
          latitude: 31.2,
          coordinateSystem: 'gcj02',
          remark: '供应商档案确认'
        }
      }
    ],
    endpoint: '/rest/v1/rpc/smis_save_supplier_secure',
    method: 'POST',
    response: recordId,
    primary: 'supplierName',
    primaryPayload: 'supplier_name',
    primaryTab: '单位信息',
    secondary: 'contactPhone',
    secondaryPayload: 'contact_phone',
    secondaryTab: '联系与位置',
    composite: {
      placeholder: '输入地址后地图检索，或直接打开地图选点',
      value: '上海市浦东新区验收路100号'
    },
    first: ['待保存供应商档案甲', '13800138001'],
    second: ['重试供应商档案乙', '13800138002'],
    payload: {
      tenant_id: tenantId,
      group_id: groupId,
      supplier_code: 'SUP_PENDING',
      supplier_category: 'material',
      supplier_type: 'general',
      supplier_group: '设备供应商',
      enterprise_nature: 'private',
      industry: 'manufacturing',
      contact_person: '验收联系人',
      region: '上海市/上海市/浦东新区',
      region_adcode: '310115',
      address_detail: '上海市浦东新区验收路100号',
      longitude: 121.5,
      latitude: 31.2,
      coordinate_system: 'gcj02',
      remark: '供应商档案确认'
    }
  },
  {
    entry:
      'modules/art-supabase-mdm/src/views/engineering/production-equipment/modules/equipment-dialog.vue',
    name: '生产设备',
    title: '编辑生产设备',
    confirm: '保存设备',
    loading: '正在保存生产设备…',
    permissions: ['MdmProductionEquipment:View', 'MdmProductionEquipment:Edit'],
    args: [
      {
        targetTenantId: tenantId,
        tenantOptions: [{ label: '测试租户', value: tenantId }],
        references: {
          categories: [
            { id: categoryId, tenantId, parentId: null, code: 'ASSEMBLY', name: '装配设备' }
          ],
          departments: [
            { id: departmentId, tenantId, parentId: null, code: 'LINE-01', name: '总装产线' }
          ],
          locations: [],
          workCenters: [],
          suppliers: []
        },
        row: {
          id: recordId,
          tenantId,
          equipmentCode: 'EQ-PENDING',
          equipmentName: '验收生产设备',
          categoryId,
          productionDepartmentId: departmentId
        }
      }
    ],
    endpoint: '/rest/v1/rpc/mdm_save_production_equipment_secure',
    method: 'POST',
    response: recordId,
    primary: 'equipmentName',
    primaryPayload: 'equipment_name',
    primaryTab: '基础资料',
    secondary: 'remark',
    secondaryPayload: 'remark',
    secondaryTab: '治理设置',
    readonlyField: 'equipmentCode',
    first: ['待保存生产设备甲', '设备采集基线已经复核'],
    second: ['重试生产设备乙', '设备采集基线复核后重试'],
    payload: {
      tenant_id: tenantId,
      category_id: categoryId,
      production_department_id: departmentId,
      location_id: '',
      work_center_id: '',
      responsible_employee_id: null,
      supplier_id: '',
      equipment_code: 'EQ-PENDING',
      photo_url: '',
      equipment_brand: '',
      model: '',
      manufacturer: '',
      factory_no: '',
      fixed_asset_no: '',
      manufacture_date: null,
      installation_date: null,
      acceptance_date: null,
      enable_date: null,
      traffic_light_card_no: '',
      andon_box_no: '',
      pulse_interval_seconds: 60,
      standard_utilization: null,
      sync_work_center: false,
      operation_status: 'normal',
      status: 'enabled',
      sort: 10
    }
  },
  {
    entry:
      'modules/art-supabase-scm/src/views/sales-quotation/expense-definition/modules/expense-dialog.vue',
    name: '报价费用',
    title: '编辑报价费用 · 验收报价费用',
    confirm: '保存更改',
    loading: '正在保存报价费用…',
    permissions: ['ScmQuoteExpense:View', 'ScmQuoteExpense:Edit'],
    args: [
      {
        effectiveTenantId: tenantId,
        tenantOptions: [{ label: '测试租户', value: tenantId }],
        record: {
          id: recordId,
          tenantId,
          expenseCode: 'EXP-PENDING',
          expenseName: '验收报价费用',
          enabled: true,
          remark: '费用资料确认',
          sortOrder: 100,
          textColor: '',
          tagStyle: 'plain'
        }
      }
    ],
    endpoint: '/rest/v1/scm_quote_expense',
    method: 'PATCH',
    response: {
      id: recordId,
      tenant_id: tenantId,
      expense_code: 'EXP-PENDING',
      expense_name: '重试报价费用乙',
      enabled: true,
      remark: '费用资料复核后重试',
      sort_order: 100,
      text_color: '',
      tag_style: 'plain'
    },
    primary: 'expenseName',
    primaryPayload: 'expense_name',
    primaryTab: '',
    secondary: 'remark',
    secondaryPayload: 'remark',
    secondaryTab: '',
    first: ['待保存报价费用甲', '费用资料已经复核'],
    second: ['重试报价费用乙', '费用资料复核后重试'],
    payload: {
      expense_code: 'EXP-PENDING',
      enabled: true,
      sort_order: 100,
      text_color: '',
      tag_style: 'plain'
    }
  }
] as const

for (const scenario of scenarios) {
  test(`${scenario.name} 保存等待冻结正文，503保值后修改并精确重试`, async ({ page }, info) => {
    const narrow = info.project.name === 'mobile-390'
    const appearance = {
      theme: narrow ? ('dark' as const) : ('light' as const),
      boxBorderMode: !narrow
    }
    await prepareIsolatedSession(page, { tenantId, platformSuper: false })
    await prepareAppearance(page, appearance)
    await page.setViewportSize({ width: narrow ? 390 : 1440, height: narrow ? 844 : 900 })
    await page.addInitScript(
      (input) => {
        window.formsMigrationInput = input
      },
      {
        args: [...scenario.args],
        permissions: [...scenario.permissions],
        admin: false,
        dicts: dictionaries
      }
    )
    const gate = Promise.withResolvers<void>()
    const writes: unknown[] = []
    const unexpectedWrites: { method: string; path: string; body: unknown }[] = []
    const errors: string[] = []
    const failureText = '本次保存暂未完成，请保留填写内容后重试'
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.pathname === scenario.endpoint && request.method() === scenario.method) {
        if (scenario.method === 'PATCH') expect(url.searchParams.get('id')).toBe(`eq.${recordId}`)
        const count = writes.push(request.postDataJSON())
        if (count === 1) {
          await gate.promise
          return route.fulfill({ status: 503, json: { code: 'P0001', message: failureText } })
        }
        return route.fulfill({ json: scenario.response })
      }
      if (request.method() === 'POST' && url.pathname === '/rest/v1/rpc/get_table_column_runtime')
        return route.fulfill({ json: { enabled: false, profiles: [] } })
      if (request.method() === 'POST' && url.pathname === '/rest/v1/rpc/current_is_super')
        return route.fulfill({ json: false })
      if (
        request.method() === 'POST' &&
        url.pathname === '/rest/v1/rpc/get_organization_list_secure'
      )
        return route.fulfill({ json: [] })
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
        unexpectedWrites.push({
          method: request.method(),
          path: url.pathname,
          body: request.postData()
        })
        return route.fulfill({
          status: 403,
          json: { code: '42501', message: '隔离测试已阻止未预期的写请求' }
        })
      }
      if (url.pathname.endsWith('/sys_dictionary')) {
        const code = url.searchParams.get('dict_type_table.code')?.replace(/^eq\./, '')
        const value = url.searchParams.get('value')?.replace(/^eq\./, '')
        return route.fulfill({
          json: Object.entries(dictionaries).flatMap(([type, items]) =>
            !code || type === code
              ? items
                  .filter((item) => value === undefined || item.value === value)
                  .map((item) => ({
                    ...item,
                    id: `${type}-${item.value}`,
                    dict_type_table: { code: type, name: type }
                  }))
              : []
          )
        })
      }
      return route.fallback()
    })
    await page.goto(
      `/tests/e2e/fixtures/forms-migration-business.html?entry=${encodeURIComponent(scenario.entry)}&theme=${appearance.theme}`
    )
    await assertAppearance(page, appearance)
    await expect(page.locator('html')).toHaveAttribute('data-ui-scope', 'workspace')
    await expect(page.getByTestId('open-error')).toHaveText('')
    const dialog = page.getByRole('dialog', { name: scenario.title, exact: true })
    await expect(dialog).toBeVisible({ timeout: 60_000 })
    expect(unexpectedWrites).toEqual([])
    const content = dialog.locator('.art-dialog__content')
    const viewport = dialog.locator('.art-dialog__viewport')
    const primary = dialog
      .locator(`[data-art-form-item-key="${scenario.primary}"]`)
      .locator('input:not([type="hidden"]),textarea')
      .first()
    const secondary = dialog
      .locator(`[data-art-form-item-key="${scenario.secondary}"]`)
      .locator('input:not([type="hidden"]),textarea')
      .first()
    const save = dialog.getByRole('button', { name: scenario.confirm, exact: true })
    const cancel = dialog.getByRole('button', { name: '取消', exact: true })
    await expect(viewport).toHaveAttribute('aria-busy', 'false')
    if ('readonlyField' in scenario) {
      await expect(
        dialog.locator(`[data-art-form-item-key="${scenario.readonlyField}"] input`)
      ).toBeDisabled()
    }
    if ('composite' in scenario) {
      await dialog.getByRole('tab', { name: scenario.secondaryTab, exact: true }).click()
      await expect(dialog.getByPlaceholder(scenario.composite.placeholder)).toHaveValue(
        scenario.composite.value
      )
      await dialog.getByRole('tab', { name: scenario.primaryTab, exact: true }).click()
    }
    await primary.clear()
    if (scenario.secondaryTab)
      await dialog.getByRole('tab', { name: scenario.secondaryTab, exact: true }).click()
    await save.click()
    await expect(primary).toBeFocused()
    await expect(content).toHaveJSProperty('inert', false)
    await expect(viewport).toHaveAttribute('aria-busy', 'false')
    expect(writes).toEqual([])
    await primary.fill(scenario.first[0])
    if (scenario.secondaryTab)
      await dialog.getByRole('tab', { name: scenario.secondaryTab, exact: true }).click()
    await secondary.fill(scenario.first[1])
    await installActionFeedbackHistory(page)
    const firstPayload = {
      ...scenario.payload,
      [scenario.primaryPayload]: scenario.first[0],
      [scenario.secondaryPayload]: scenario.first[1]
    }
    const secondPayload = {
      ...scenario.payload,
      [scenario.primaryPayload]: scenario.second[0],
      [scenario.secondaryPayload]: scenario.second[1]
    }
    const firstBody =
      scenario.method === 'POST' ? { p_id: recordId, p_payload: firstPayload } : firstPayload
    const secondBody =
      scenario.method === 'POST' ? { p_id: recordId, p_payload: secondPayload } : secondPayload
    let completion: ReturnType<typeof page.waitForResponse>
    try {
      await save.click()
      await expect.poll(() => writes.length).toBe(1)
      await expect(save).toBeDisabled()
      await expect(cancel).toBeDisabled()
      expect(writes).toEqual([firstBody])
      const pending = await viewport.evaluate((element) => ({
        busy: element.getAttribute('aria-busy'),
        inert: element.querySelector('.art-dialog__content')?.hasAttribute('inert'),
        hidden: element.querySelector('.art-dialog__content')?.getAttribute('aria-hidden'),
        loaders: element.querySelectorAll('.art-overlay-loading').length,
        loadingText: element.querySelector('.art-overlay-loading')?.textContent?.trim()
      }))
      await info.attach('pending-state', {
        body: JSON.stringify(pending, null, 2),
        contentType: 'application/json'
      })
      expect.soft(pending).toMatchObject({ busy: 'true', inert: true, hidden: 'true', loaders: 1 })
      expect.soft(pending.loadingText).toContain(scenario.loading)
      expect.soft(await dialog.locator('.art-overlay-loading').count()).toBe(1)
      expect
        .soft(
          await secondary.evaluate((element: HTMLElement) => {
            element.focus()
            return document.activeElement === element
          })
        )
        .toBe(false)
      await page.keyboard.type('保存期间禁止改写')
      await page.keyboard.press('Enter')
      await save.dispatchEvent('click')
      expect(writes).toEqual([firstBody])
      expect.soft(await primary.inputValue()).toBe(scenario.first[0])
      expect.soft(await secondary.inputValue()).toBe(scenario.first[1])
      if ('composite' in scenario) {
        const composite = dialog.getByPlaceholder(scenario.composite.placeholder)
        expect
          .soft(
            await composite.evaluate((element: HTMLElement) => {
              element.focus()
              return document.activeElement === element
            })
          )
          .toBe(false)
        await expect(composite).toHaveValue(scenario.composite.value)
      }
      await captureBusinessEvidence(page, {
        path: info.outputPath(`pending-${narrow ? 'dark390' : 'light1440'}.png`)
      })
    } finally {
      completion = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === scenario.endpoint &&
          response.request().method() === scenario.method
      )
      gate.resolve()
    }
    await (await completion).finished()
    await expect(save).toBeEnabled()
    await expect(cancel).toBeEnabled()
    await expect(dialog).toBeVisible()
    await expect(content).toHaveJSProperty('inert', false)
    await expect(viewport).toHaveAttribute('aria-busy', 'false')
    await expect(dialog.locator('.art-overlay-loading')).toHaveCount(0)
    await expect
      .poll(async () =>
        (await readActionFeedbackHistory(page))
          .filter((item) => item.kind === 'error')
          .map((item) => item.text)
      )
      .toContain(failureText)
    expect.soft(await primary.inputValue()).toBe(scenario.first[0])
    expect.soft(await secondary.inputValue()).toBe(scenario.first[1])
    await expect(page.getByTestId('successes')).toHaveText('0')
    if ('readonlyField' in scenario) {
      await expect(
        dialog.locator(`[data-art-form-item-key="${scenario.readonlyField}"] input`)
      ).toBeDisabled()
    }
    if (scenario.primaryTab)
      await dialog.getByRole('tab', { name: scenario.primaryTab, exact: true }).click()
    await primary.fill(scenario.second[0])
    if (scenario.secondaryTab)
      await dialog.getByRole('tab', { name: scenario.secondaryTab, exact: true }).click()
    await secondary.fill(scenario.second[1])
    await save.focus()
    await page.keyboard.press('Enter')
    await expect.poll(() => writes.length).toBe(2)
    expect(writes).toEqual([firstBody, secondBody])
    await expect(page.getByTestId('successes')).toHaveText('1')
    await expect(dialog).toBeHidden()
    expect(unexpectedWrites).toEqual([])
    expect(errors).toEqual([])
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
  })
}

test('供应商联系人旧保存结束后保留同实例重开草稿的等待锁', async ({ page }, info) => {
  const scenario = scenarios[0]
  const narrow = info.project.name === 'mobile-390'
  const appearance = {
    theme: narrow ? ('dark' as const) : ('light' as const),
    boxBorderMode: !narrow
  }
  await prepareIsolatedSession(page, { tenantId, platformSuper: false })
  await prepareAppearance(page, appearance)
  await page.setViewportSize({ width: narrow ? 390 : 1440, height: narrow ? 844 : 900 })
  await page.addInitScript(
    (input) => {
      window.formsMigrationInput = input
    },
    {
      args: [...scenario.args],
      permissions: [...scenario.permissions],
      admin: false,
      dicts: dictionaries
    }
  )
  const firstGate = Promise.withResolvers<void>()
  const secondGate = Promise.withResolvers<void>()
  const writes: unknown[] = []
  const unexpectedWrites: { method: string; path: string; body: unknown }[] = []
  const errors: string[] = []
  const failureText = '前一次联系人保存未完成，请核对后重试'
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname === scenario.endpoint && request.method() === scenario.method) {
      expect(url.searchParams.get('id')).toBe(`eq.${recordId}`)
      const count = writes.push(request.postDataJSON())
      if (count === 1) {
        await firstGate.promise
        return route.fulfill({ status: 503, json: { code: 'P0001', message: failureText } })
      }
      if (count === 2) {
        await secondGate.promise
        return route.fulfill({ json: scenario.response })
      }
    }
    if (request.method() === 'POST' && url.pathname === '/rest/v1/rpc/get_table_column_runtime')
      return route.fulfill({ json: { enabled: false, profiles: [] } })
    if (request.method() === 'POST' && url.pathname === '/rest/v1/rpc/current_is_super')
      return route.fulfill({ json: false })
    if (request.method() === 'POST' && url.pathname === '/rest/v1/rpc/get_organization_list_secure')
      return route.fulfill({ json: [] })
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      unexpectedWrites.push({
        method: request.method(),
        path: url.pathname,
        body: request.postData()
      })
      return route.fulfill({
        status: 403,
        json: { code: '42501', message: '隔离测试已阻止未预期的写请求' }
      })
    }
    if (url.pathname.endsWith('/sys_dictionary')) {
      const code = url.searchParams.get('dict_type_table.code')?.replace(/^eq\./, '')
      const value = url.searchParams.get('value')?.replace(/^eq\./, '')
      return route.fulfill({
        json: Object.entries(dictionaries).flatMap(([type, items]) =>
          !code || type === code
            ? items
                .filter((item) => value === undefined || item.value === value)
                .map((item) => ({
                  ...item,
                  id: `${type}-${item.value}`,
                  dict_type_table: { code: type, name: type }
                }))
            : []
        )
      })
    }
    return route.fallback()
  })
  await page.goto(
    `/tests/e2e/fixtures/forms-migration-business.html?entry=${encodeURIComponent(scenario.entry)}&theme=${appearance.theme}`
  )
  await assertAppearance(page, appearance)
  await expect(page.locator('html')).toHaveAttribute('data-ui-scope', 'workspace')
  await expect(page.getByTestId('open-error')).toHaveText('')
  const dialog = page.getByRole('dialog', { name: scenario.title, exact: true })
  await expect(dialog).toBeVisible({ timeout: 60_000 })
  const viewport = dialog.locator('.art-dialog__viewport')
  const content = dialog.locator('.art-dialog__content')
  const primary = dialog.locator('[data-art-form-item-key="name"] input:not([type="hidden"])')
  const secondary = dialog.locator('[data-art-form-item-key="phone"] input:not([type="hidden"])')
  const save = dialog.getByRole('button', { name: scenario.confirm, exact: true })
  const cancel = dialog.getByRole('button', { name: '取消', exact: true })
  const firstPayload = { ...scenario.payload, name: scenario.first[0], phone: scenario.first[1] }
  const secondPayload = { ...scenario.payload, name: scenario.second[0], phone: scenario.second[1] }
  await installActionFeedbackHistory(page)
  try {
    await dialog.getByRole('tab', { name: scenario.primaryTab, exact: true }).click()
    await primary.fill(scenario.first[0])
    await dialog.getByRole('tab', { name: scenario.secondaryTab, exact: true }).click()
    await secondary.fill(scenario.first[1])
    await save.click()
    await expect.poll(() => writes.length).toBe(1)
    expect(writes).toEqual([firstPayload])
    await expect(viewport).toHaveAttribute('aria-busy', 'true')
    await expect(content).toHaveJSProperty('inert', true)
    await expect(dialog.locator('.art-overlay-loading')).toHaveCount(1)
    await dialog.getByRole('button', { name: '关闭弹窗', exact: true }).click()
    await expect(dialog).toBeHidden()

    await page.getByTestId('open-entry').click()
    await expect(page.getByTestId('open-error')).toHaveText('')
    await expect(dialog).toBeVisible()
    await expect(viewport).toHaveAttribute('aria-busy', 'false')
    await dialog.getByRole('tab', { name: scenario.primaryTab, exact: true }).click()
    await primary.fill(scenario.second[0])
    await dialog.getByRole('tab', { name: scenario.secondaryTab, exact: true }).click()
    await secondary.fill(scenario.second[1])
    await save.click()
    await expect.poll(() => writes.length).toBe(2)
    expect(writes).toEqual([firstPayload, secondPayload])
    await expect(viewport).toHaveAttribute('aria-busy', 'true')
    await expect(content).toHaveJSProperty('inert', true)
    await expect(dialog.locator('.art-overlay-loading')).toHaveCount(1)
    await expect(save).toBeDisabled()
    await expect(cancel).toBeDisabled()
    const focusedInSecondSession = await page.evaluateHandle(() => document.activeElement)
    const firstCompleted = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === scenario.endpoint && response.status() === 503
    )
    firstGate.resolve()
    await (await firstCompleted).finished()
    // 旧保存失败的 API 反馈保留其原有含义；等待它完成后再核对新会话状态。
    await expect
      .poll(async () => (await readActionFeedbackHistory(page)).map((item) => item.text))
      .toContain(failureText)
    const firstFeedback = await readActionFeedbackHistory(page)
    await info.attach('old-save-feedback-before-new-save-completion', {
      body: JSON.stringify(firstFeedback, null, 2),
      contentType: 'application/json'
    })
    expect
      .soft(await focusedInSecondSession.evaluate((element) => document.activeElement === element))
      .toBe(true)
    await focusedInSecondSession.dispose()
    await expect(dialog).toBeVisible()
    await expect.soft(viewport).toHaveAttribute('aria-busy', 'true')
    await expect.soft(content).toHaveJSProperty('inert', true)
    await expect.soft(content).toHaveAttribute('aria-hidden', 'true')
    await expect.soft(dialog.locator('.art-overlay-loading')).toHaveCount(1)
    await expect.soft(dialog.locator('.art-overlay-loading')).toContainText(scenario.loading)
    await expect(save).toBeDisabled()
    await expect(cancel).toBeDisabled()
    expect
      .soft(
        await secondary.evaluate((element: HTMLElement) => {
          element.focus()
          return document.activeElement === element
        })
      )
      .toBe(false)
    await page.keyboard.type('旧请求结束后禁止改写新草稿')
    await save.dispatchEvent('click')
    expect.soft(await primary.inputValue()).toBe(scenario.second[0])
    expect.soft(await secondary.inputValue()).toBe(scenario.second[1])
    expect(writes).toEqual([firstPayload, secondPayload])
    expect(unexpectedWrites).toEqual([])
    await expect(page.getByTestId('successes')).toHaveText('0')
    await captureBusinessEvidence(page, {
      path: info.outputPath(`reopened-pending-${narrow ? 'dark390' : 'light1440'}.png`)
    })

    const secondCompleted = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === scenario.endpoint && response.status() === 200
    )
    secondGate.resolve()
    await (await secondCompleted).finished()
    await expect(page.getByTestId('successes')).toHaveText('1')
    await expect(dialog).toBeHidden()
    expect(writes).toEqual([firstPayload, secondPayload])
    expect(unexpectedWrites).toEqual([])
    expect(errors).toEqual([])
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
  } finally {
    firstGate.resolve()
    secondGate.resolve()
  }
})
