import { expect, test, type Locator, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { formStandardDictionaries } from './fixtures/form-standard-modules-data'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 30_000 })
test.setTimeout(90_000)
const entries = [
  'industry',
  'component',
  'bom-group',
  'bom',
  'supplier',
  'supplier-contact',
  'supplier-bank',
  'master-group',
  'master-customer',
  'reference',
  'attributes',
  'code-rule',
  'supply-rule',
  'business-type',
  'document-type',
  'person',
  'department',
  'workstation',
  'category',
  'route',
  'warehouse',
  'movement-type',
  'zone',
  'bin',
  'change',
  'scheduling',
  'packing',
  'scm-expense'
]
const compactEntries = new Set([
  'industry',
  'component',
  'bom-group',
  'supplier-bank',
  'master-group',
  'supply-rule',
  'department',
  'workstation',
  'movement-type',
  'scm-expense',
  'document-type'
])

interface Write {
  path: string
  payload: unknown
  method?: string
  query?: string
}
async function open(page: Page, entry: string, query = '', writes?: Write[]) {
  page.on('pageerror', (error) => console.error('business fixture pageerror:', error.message))
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path.endsWith('/sys_dictionary')) {
      const code = (new URL(request.url()).searchParams.get('dict_type_table.code') || '').replace(
        /^eq\./,
        ''
      )
      const items = formStandardDictionaries[code as keyof typeof formStandardDictionaries] || []
      return route.fulfill({
        json: items.map((item, index) => ({
          ...item,
          id: `${code}-${index}`,
          status: '1',
          sort: index,
          dict_type_table: { code, name: code }
        }))
      })
    }
    if (
      request.method() === 'GET' &&
      ['/mdm_customer', '/mdm_production_department', '/mdm_work_center'].some((table) =>
        path.endsWith(table)
      )
    )
      return route.fulfill({
        json: [
          {
            id: '22222222-2222-4222-8222-222222222222',
            tenant_id: '11111111-1111-4111-8111-111111111111',
            department_id: '22222222-2222-4222-8222-222222222222',
            code: 'REF-TEST',
            name: '验收引用'
          }
        ]
      })
    if (path.endsWith('/mdm_process_route_references'))
      return route.fulfill({
        json: {
          groups: [],
          operations: [],
          controlCodes: [],
          units: [{ id: '33333333-3333-4333-8333-333333333333', code: 'PC', name: '件' }],
          departments: [],
          workCenters: [],
          activityFormulas: [],
          suppliers: [],
          esopDocuments: []
        }
      })
    if (request.method() !== 'GET' && !path.includes('/rpc/')) {
      writes?.push({
        path,
        payload: request.postDataJSON(),
        method: request.method(),
        query: new URL(request.url()).search
      })
      return route.fulfill({
        json: [{ id: '22222222-2222-4222-8222-222222222222' }],
        headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
      })
    }
    if (/(save|create|post)_/.test(path)) {
      writes?.push({
        path,
        payload: request.postDataJSON(),
        method: request.method(),
        query: new URL(request.url()).search
      })
      return route.fulfill({ json: '22222222-2222-4222-8222-222222222222' })
    }
    return route.fallback()
  })
  await page.goto(`/tests/e2e/fixtures/form-standard-modules.html?entry=${entry}${query}`)
  await page.getByRole('button', { name: '打开真实业务入口', exact: true }).click()
  const dialog = page.getByRole('dialog').last()
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.art-dialog__viewport')).toHaveAttribute('aria-busy', 'false')
  if (query.includes('&readonly=true'))
    await expect(dialog.locator('.art-dialog__footer-actions button')).toHaveCount(0)
  else await expect(dialog.locator('.art-dialog__footer-actions button').last()).toBeEnabled()
  await expect(dialog.locator('.art-form .art-async-state[aria-busy="true"]')).toHaveCount(0)
  return dialog
}

function field(dialog: Locator, label: string) {
  return dialog
    .getByText(label, { exact: true })
    .locator('xpath=ancestor::div[contains(@class,"el-form-item")][1]')
}

async function tabs(dialog: Locator) {
  return dialog.getByRole('tablist').first().getByRole('tab')
}

for (const entry of entries)
  test(`${entry} 真实入口横向分类、切换保值与跨页签必填定位`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const dialog = await open(page, entry)
    const navigation = await tabs(dialog)
    if (compactEntries.has(entry)) await expect(navigation).toHaveCount(0)
    else expect(await navigation.count()).toBeGreaterThanOrEqual(2)
    const bounds = await navigation.evaluateAll((items) =>
      items.map((item) => item.getBoundingClientRect().y)
    )
    if (bounds.length) expect(Math.max(...bounds) - Math.min(...bounds)).toBeLessThanOrEqual(1)
    if (entry === 'industry')
      await page.screenshot({
        path: info.outputPath('industry-compact-normal.png'),
        timeout: 60_000
      })
    const input = dialog
      .locator(
        '.el-form-item.is-required .el-input__inner:not([readonly]):not([disabled]):not([role="spinbutton"]):not(.el-date-editor input)'
      )
      .first()
    if (await input.count()) {
      const paneId = await input.evaluate((element) => element.closest('.el-tab-pane')?.id)
      const ownerTab = paneId
        ? dialog.locator(`[role="tab"][aria-controls="${paneId}"]`)
        : undefined
      await ownerTab?.click()
      await expect(input).toBeVisible()
      await input.fill('')
      if (bounds.length) await navigation.last().click()
      await dialog.locator('.art-dialog__footer-actions button').last().click()
      await expect(dialog.locator('.el-form-item.is-error:visible').first()).toBeVisible()
      if (entry === 'industry') {
        await expect(dialog.getByText('请输入分组编码', { exact: true })).toBeVisible()
        await expect(dialog.getByText('请输入分组名称', { exact: true })).toBeVisible()
        await page.screenshot({
          path: info.outputPath('industry-compact-validation.png'),
          timeout: 60_000
        })
      }
      if (bounds.length)
        await expect(dialog.locator('.el-form-item.is-error:visible input').first()).toBeFocused()
      await ownerTab?.click()
      await input.fill('TEST01')
      if (bounds.length) {
        await navigation.last().click()
        await ownerTab?.click()
      }
      await expect(input).toHaveValue('TEST01')
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    await page.screenshot({
      path: info.outputPath(`${entry}-tabs.png`),
      fullPage: true,
      timeout: 60_000
    })
    expect(errors).toEqual([])
  })

test('供应商跨页签完整校验后纠正并保存真实业务负载', async ({ page }) => {
  const writes: Write[] = []
  const dialog = await open(page, 'supplier', '', writes)
  await field(dialog, '单位名称').getByRole('textbox').fill('验收供应商')
  for (const label of ['供应商类别', '企业性质', '行业']) {
    await field(dialog, label).getByRole('combobox').click()
    await page.getByRole('option').first().click()
  }
  await dialog.getByRole('tab', { name: '联系与位置', exact: true }).click()
  await page.getByPlaceholder('输入地址后地图检索，或直接打开地图选点').fill('上海市验收路1号')
  await dialog.locator('.art-dialog__footer-actions button').last().click()
  await expect(dialog.getByRole('tab', { name: '单位信息', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect(field(dialog, '单位编码').getByRole('textbox')).toBeFocused()
  await expect(field(dialog, '单位编码')).toHaveClass(/is-error/)
  expect(writes).toHaveLength(0)
  await field(dialog, '单位编码').getByRole('textbox').fill('sup_valid')
  await dialog.getByRole('tab', { name: '联系与位置', exact: true }).click()
  await dialog.locator('.art-dialog__footer-actions button').last().click()
  await expect(page.getByTestId('save-result')).toHaveText('已保存')
  expect(writes).toHaveLength(1)
  expect(writes[0].payload).toMatchObject({
    p_payload: {
      supplier_code: 'SUP_VALID',
      supplier_name: '验收供应商',
      address_detail: '上海市验收路1号'
    }
  })
})

test('计量单位跨页保存保留标识与换算信息', async ({ page }) => {
  const writes: Write[] = []
  const dialog = await open(page, 'reference', '', writes)
  await field(dialog, '单位编码').getByRole('textbox').fill('PC_TEST')
  await field(dialog, '单位名称').getByRole('textbox').fill('验收件')
  await dialog.getByRole('tab', { name: '精度与换算', exact: true }).click()
  await dialog.locator('.art-dialog__footer-actions button').last().click()
  await expect(page.getByTestId('save-result')).toHaveText('已保存')
  expect(writes).toHaveLength(1)
  expect(writes[0].payload).toMatchObject({ unit_code: 'PC_TEST', unit_name: '验收件' })
})

test('供应商仅详细地址错误时从单位页定位到联系页的嵌套控件', async ({ page }, info) => {
  const writes: Write[] = []
  const dialog = await open(page, 'supplier', '&valid=true', writes)
  await dialog.getByRole('tab', { name: '联系与位置', exact: true }).click()
  const address = page.getByPlaceholder('输入地址后地图检索，或直接打开地图选点')
  await address.fill('')
  await dialog.getByRole('tab', { name: '单位信息', exact: true }).click()
  await dialog.locator('.art-dialog__footer-actions button').last().click()
  await expect(dialog.getByRole('tab', { name: '联系与位置', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect(address).toBeFocused()
  await expect(dialog.getByText('请输入详细地址', { exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('nested-address-validation.png') })
  expect(writes).toHaveLength(0)
})

for (const entry of ['route', 'bom']) {
  test(`${entry} 真实编辑入口在非当前页签确认时保存完整已有资料`, async ({ page }) => {
    const writes: Write[] = []
    const dialog = await open(page, entry, '&valid=true', writes)
    await dialog.getByRole('tablist').first().getByRole('tab').last().click()
    await dialog.locator('.art-dialog__footer-actions button').last().click()
    await expect(page.getByTestId('save-result')).toHaveText('已保存')
    expect(writes).toHaveLength(1)
    if (entry === 'bom')
      expect(writes[0].payload).toMatchObject({
        p_header: { version: 'A', material_id: '22222222-2222-4222-8222-222222222222' },
        p_items: []
      })
    else
      expect(writes[0].payload).toMatchObject({
        material_id: '22222222-2222-4222-8222-222222222222',
        version: 'A'
      })
  })
}

for (const entry of [
  'industry',
  'component',
  'bom-group',
  'supplier-contact',
  'supplier-bank',
  'master-group',
  'master-customer',
  'supply-rule',
  'department',
  'workstation',
  'person',
  'category',
  'warehouse',
  'movement-type',
  'scm-expense',
  'zone',
  'bin',
  'scheduling',
  'packing',
  'attributes',
  'code-rule',
  'business-type',
  'document-type',
  'master-project',
  'master-formula',
  'master-control',
  'master-operation',
  'master-workstation',
  'material-type',
  'document-production',
  'document-payable'
]) {
  test(`${entry} 完整资料修改后确认保存业务字段`, async ({ page }) => {
    const writes: Write[] = []
    const dialog = await open(page, entry, '&valid=true', writes)
    const labels: Record<string, string> = {
      component: '组件类型',
      'supplier-contact': '姓名',
      'supplier-bank': '账户名称',
      'master-customer': '客户名称',
      'supply-rule': '规则名称',
      department: '部门名称',
      workstation: '工位名称',
      person: '姓名',
      category: '分类名称',
      warehouse: '仓库名称',
      'movement-type': '移动类型名称',
      'scm-expense': '费用名称',
      zone: '库区名称',
      bin: '库位名称',
      scheduling: '规则名称',
      packing: '规则名称',
      attributes: '属性组名称',
      'code-rule': '规则名称',
      'business-type': '业务类型名称',
      'document-type': '单据类型名称',
      'master-project': '项目名称',
      'master-formula': '公式名称',
      'master-control': '控制码名称',
      'master-operation': '工序名称',
      'master-workstation': '工位名称',
      'material-type': '类型名称',
      'document-production': '单据类型名称',
      'document-payable': '单据类型名称'
    }
    const label = labels[entry] || '分组名称'
    await field(dialog, label).getByRole('textbox').fill('更新后的验收资料')
    const navigation = await tabs(dialog)
    if (await navigation.count()) await navigation.last().click()
    await dialog.locator('.art-dialog__footer-actions button').last().click()
    await expect(page.getByTestId('save-result')).toHaveText('已保存')
    expect(writes).toHaveLength(1)
    const payloads: Record<string, unknown> = {
      industry: {
        p_id: '22222222-2222-4222-8222-222222222222',
        p_payload: {
          code: 'PANEL',
          name: '更新后的验收资料',
          tenant_id: '11111111-1111-4111-8111-111111111111'
        }
      },
      component: {
        component_type_code: 'OUTER_PANEL',
        component_type_name: '更新后的验收资料',
        group_id: '22222222-2222-4222-8222-222222222222',
        tenant_id: '11111111-1111-4111-8111-111111111111'
      },
      'bom-group': {
        p_id: '22222222-2222-4222-8222-222222222222',
        p_payload: {
          code: 'PRODUCT_BOM',
          name: '更新后的验收资料',
          tenant_id: '11111111-1111-4111-8111-111111111111'
        }
      },
      'supplier-contact': {
        supplier_id: '22222222-2222-4222-8222-222222222222',
        name: '更新后的验收资料',
        phone: '13800000000',
        email: 'contact@example.com'
      },
      'supplier-bank': {
        supplier_id: '22222222-2222-4222-8222-222222222222',
        bank_account: '6222000000000000',
        account_name: '更新后的验收资料',
        bank_name: '验收银行',
        currency_code: 'CNY'
      },
      'master-group': { domain: 'customer', code: 'CUSTOMERS', name: '更新后的验收资料' },
      'master-customer': {
        customer_code: 'CUSTOMER-TEST',
        customer_name: '更新后的验收资料',
        address_detail: '上海市验收路2号'
      },
      'supply-rule': {
        p_tenant_id: '11111111-1111-4111-8111-111111111111',
        p_payload: {
          rule_code: 'BATCH_TEST',
          rule_name: '更新后的验收资料',
          segments: [
            { attribute_code: 'CONSTANT', use_mode: 'configured', configured_value: 'TEST' }
          ]
        }
      },
      department: {
        tenant_id: '11111111-1111-4111-8111-111111111111',
        code: 'DEPT-TEST',
        name: '更新后的验收资料',
        factory: '验收工厂'
      },
      workstation: {
        tenant_id: '11111111-1111-4111-8111-111111111111',
        workstation_code: 'WS-TEST',
        workstation_name: '更新后的验收资料',
        department_id: '22222222-2222-4222-8222-222222222222',
        work_center_id: '22222222-2222-4222-8222-222222222222'
      },
      person: {
        tenant_id: '11111111-1111-4111-8111-111111111111',
        name: '更新后的验收资料',
        employee_no: 'EMP-TEST',
        barcode: 'EMP-TEST',
        department_id: '22222222-2222-4222-8222-222222222222'
      },
      category: {
        tenant_id: '11111111-1111-4111-8111-111111111111',
        category_code: 'CAT-TEST',
        category_name: '更新后的验收资料',
        composition_columns: ['material_name', 'specification_model']
      },
      warehouse: {
        p_id: '22222222-2222-4222-8222-222222222222',
        p_payload: {
          organization_id: '22222222-2222-4222-8222-222222222222',
          warehouse_code: 'WH-TEST',
          warehouse_name: '更新后的验收资料',
          business_scopes: ['picking', 'availability']
        }
      },
      'movement-type': {
        p_id: '22222222-2222-4222-8222-222222222222',
        p_tenant_id: '11111111-1111-4111-8111-111111111111',
        p_payload: {
          tenant_id: '11111111-1111-4111-8111-111111111111',
          movement_code: 'MOVE-TEST',
          movement_name: '更新后的验收资料',
          direction: 'inbound'
        }
      },
      'scm-expense': {
        expense_code: 'EXP-TEST',
        expense_name: '更新后的验收资料',
        tag_style: 'plain'
      },
      zone: {
        tenant_id: '11111111-1111-4111-8111-111111111111',
        warehouse_id: '22222222-2222-4222-8222-222222222222',
        zone_code: 'ZONE-TEST',
        zone_name: '更新后的验收资料'
      },
      bin: {
        tenant_id: '11111111-1111-4111-8111-111111111111',
        warehouse_id: '22222222-2222-4222-8222-222222222222',
        bin_code: 'BIN-TEST',
        bin_name: '更新后的验收资料',
        bin_type: 'floor'
      },
      scheduling: {
        p_id: '22222222-2222-4222-8222-222222222222',
        p_payload: {
          tenant_id: '11111111-1111-4111-8111-111111111111',
          code: 'SCHED-TEST',
          name: '更新后的验收资料',
          priority_weight: 50,
          due_date_weight: 30,
          critical_operation_weight: 20
        }
      },
      packing: {
        p_id: '22222222-2222-4222-8222-222222222222',
        p_payload: {
          tenant_id: '11111111-1111-4111-8111-111111111111',
          rule_code: 'ROCK_BOARD',
          rule_name: '更新后的验收资料',
          max_pieces: 8,
          max_stack_height: 600,
          same_area: true
        }
      },
      attributes: {
        p_id: '22222222-2222-4222-8222-222222222222',
        p_payload: {
          group_code: 'ATTR-TEST',
          group_name: '更新后的验收资料',
          attributes: [
            { key: 'color', name: '颜色', values: ['白色', '蓝色'], required: true, enabled: true }
          ]
        }
      },
      'code-rule': {
        p_id: '22222222-2222-4222-8222-222222222222',
        p_payload: {
          rule_code: 'CODE-TEST',
          rule_name: '更新后的验收资料',
          sequence_digits: 4,
          next_value: 1,
          segments: [{ source: 'material_type' }, { source: 'fixed', value: '-' }]
        }
      },
      'business-type': {
        business_type_code: 'BUS-TEST',
        business_type_name: '更新后的验收资料',
        document_type_ids: ['22222222-2222-4222-8222-222222222222'],
        menu_ids: ['88888888-8888-4888-8888-888888888888']
      },
      'document-type': {
        document_type_code: 'DOC-TEST',
        document_type_name: '更新后的验收资料',
        menu_ids: ['88888888-8888-4888-8888-888888888888']
      },
      'master-project': {
        project_code: 'PROJECT-TEST',
        project_name: '更新后的验收资料',
        customer_id: '22222222-2222-4222-8222-222222222222'
      },
      'master-formula': {
        code: 'FORMULA-TEST',
        name: '更新后的验收资料',
        purpose: 'report_preparation',
        activity_types: ['machine'],
        formula_expression: '3 + 4'
      },
      'master-control': {
        control_code: 'CTRL-TEST',
        control_code_name: '更新后的验收资料',
        participates_scheduling: false
      },
      'master-operation': {
        code: 'OP-TEST',
        name: '更新后的验收资料',
        department_id: '22222222-2222-4222-8222-222222222222',
        work_center_ids: ['22222222-2222-4222-8222-222222222222'],
        price: 5
      },
      'master-workstation': {
        workstation_code: 'SHARED-WS-TEST',
        workstation_name: '更新后的验收资料',
        department_id: '22222222-2222-4222-8222-222222222222',
        work_center_id: '22222222-2222-4222-8222-222222222222'
      },
      'material-type': { type_code: 'RAW-TEST', type_name: '更新后的验收资料', code_prefix: 'R' },
      'document-production': {
        document_type_code: 'PROD-TEST',
        document_type_name: '更新后的验收资料',
        allowed_issue_warehouse_types: ['raw_material'],
        packing_enabled: true,
        packing_thickness_field_key: 'thickness',
        extension_fields: [
          { key: 'thickness', label: '板厚', valueType: 'number', sourceComponentTypeId: null }
        ]
      },
      'document-payable': {
        document_type_code: 'PAY-TEST',
        document_type_name: '更新后的验收资料',
        payable_standard_purchase: false,
        financial_payable_type_id: '22222222-2222-4222-8222-222222222222'
      }
    }
    expect(writes[0].payload).toMatchObject(payloads[entry])
    if (
      [
        'scm-expense',
        'business-type',
        'document-type',
        'document-production',
        'document-payable'
      ].includes(entry)
    ) {
      expect(writes[0].method).toBe('PATCH')
      expect(writes[0].query).toContain('id=eq.22222222-2222-4222-8222-222222222222')
      expect(writes[0].payload).not.toHaveProperty('tenant_id')
    }
  })
}

test('变更申请完整填写跨页签字段后创建真实草稿负载', async ({ page }) => {
  const writes: Write[] = []
  const dialog = await open(page, 'change', '', writes)
  await field(dialog, '主档类型').getByRole('combobox').click()
  await page.getByRole('option').first().click()
  await field(dialog, '来源记录 ID')
    .getByRole('textbox')
    .fill('22222222-2222-4222-8222-222222222222')
  await dialog.getByRole('tab', { name: '申请内容', exact: true }).click()
  await field(dialog, '变更标题').getByRole('textbox').fill('验收主数据变更')
  await field(dialog, '业务原因').getByRole('textbox').fill('核实并更新测试主数据名称')
  await field(dialog, '拟变更数据（JSON）').getByRole('textbox').fill('{"name":"验收名称"}')
  await dialog.getByRole('tab', { name: '变更范围', exact: true }).click()
  await dialog.locator('.art-dialog__footer-actions button').last().click()
  await expect(page.getByTestId('save-result')).toHaveText('已保存')
  expect(writes).toHaveLength(1)
  expect(writes[0].payload).toMatchObject({
    p_domain_key: 'organization',
    p_source_record_id: '22222222-2222-4222-8222-222222222222',
    p_operation: 'update',
    p_title: '验收主数据变更',
    p_reason: '核实并更新测试主数据名称',
    p_before_data: {},
    p_proposed_data: { name: '验收名称' }
  })
})

test('供应商详情可切换分类并重新打开回首栏，查看不写业务数据', async ({ page }) => {
  const writes: Write[] = []
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) => {
    if (route.request().method() !== 'GET' && !route.request().url().includes('/rpc/'))
      writes.push({ path: route.request().url(), payload: route.request().postDataJSON() })
    return route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/form-standard-modules.html?entry=supplier-detail')
  await page.getByRole('button', { name: '打开真实业务入口', exact: true }).click()
  const dialog = page.getByRole('dialog').last()
  for (const tab of await dialog.getByRole('tab').all()) {
    await tab.click()
    await expect(dialog.getByRole('tabpanel').filter({ visible: true })).toHaveCount(1)
  }
  expect(writes).toHaveLength(0)
  await dialog.getByRole('button', { name: '关闭抽屉', exact: true }).click()
  await page.getByRole('button', { name: '打开真实业务入口', exact: true }).click()
  await expect(dialog.getByRole('tab', { name: '基本信息', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
})

test('BOM 组件空用量按表格规则标红并聚焦，修正后保存组件负载', async ({ page }, info) => {
  const writes: Write[] = []
  const dialog = await open(page, 'bom', '&valid=true&components=true', writes)
  await dialog.getByRole('tab', { name: '组件明细', exact: true }).click()
  const quantity = dialog.getByRole('spinbutton', { name: '组件用量', exact: true })
  await quantity.fill('')
  await quantity.press('Tab')
  await dialog.getByRole('tablist').first().getByRole('tab').first().click()
  await dialog.locator('.art-dialog__footer-actions button').last().click()
  await expect(dialog.getByRole('tab', { name: '组件明细', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect(quantity).toBeFocused()
  const cell = quantity.locator(
    'xpath=ancestor::div[contains(@class,"art-table__cell-content")][1]'
  )
  await expect(cell).toHaveClass(/is-validation-error/)
  expect(writes).toHaveLength(0)
  await page.screenshot({ path: info.outputPath('bom-component-required.png') })
  await quantity.fill('2')
  await quantity.press('Tab')
  await expect(cell).not.toHaveClass(/is-validation-error/)
  await dialog.locator('.art-dialog__footer-actions button').last().click()
  await expect(page.getByTestId('save-result')).toHaveText('已保存')
  expect(writes).toHaveLength(1)
  expect(writes[0].payload).toMatchObject({
    p_items: [
      {
        component_material_id: '44444444-4444-4444-8444-444444444444',
        quantity: 2,
        unit_id: '33333333-3333-4333-8333-333333333333'
      }
    ]
  })
})

for (const entry of [
  'supplier',
  'reference',
  'attributes',
  'code-rule',
  'category',
  'master-customer',
  'master-project',
  'master-formula',
  'master-control',
  'master-operation',
  'master-workstation',
  'material-type',
  'document-type',
  'document-production',
  'document-payable'
]) {
  for (const mode of ['light', 'narrow-dark']) {
    test(`${entry} ${mode} 每页签内容与可用宽度`, async ({ page }, info) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.setViewportSize({ width: mode === 'light' ? 1440 : 390, height: 900 })
      const dialog = await open(
        page,
        entry,
        `&valid=true&theme=${mode === 'light' ? 'light' : 'dark'}`
      )
      const navigation = await tabs(dialog)
      if (!(await navigation.count())) {
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
        ).toBeLessThanOrEqual(1)
        await page.screenshot({
          path: info.outputPath(`${entry}-${mode}-compact.png`),
          timeout: 60_000
        })
      }
      for (let index = 0; index < (await navigation.count()); index++) {
        await navigation.nth(index).click()
        await expect(dialog.getByRole('tabpanel').filter({ visible: true })).toHaveCount(1)
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
        ).toBeLessThanOrEqual(1)
        await page.screenshot({
          path: info.outputPath(`${entry}-${mode}-pane-${index + 1}.png`),
          timeout: 60_000
        })
      }
      expect(errors).toEqual([])
    })
  }
}

for (const entry of ['master-project', 'master-workstation']) {
  test(`${entry} 只读窄屏暗色详情`, async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 900 })
    const writes: Write[] = []
    const dialog = await open(page, entry, '&valid=true&readonly=true&theme=dark', writes)
    const navigation = await tabs(dialog)
    const count = await navigation.count()
    for (let index = 0; index < Math.max(count, 1); index++) {
      if (count) await navigation.nth(index).click()
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
      ).toBeLessThanOrEqual(1)
      await page.screenshot({
        path: info.outputPath(`${entry}-readonly-dark-${index + 1}.png`),
        timeout: 60_000
      })
    }
    expect(writes).toHaveLength(0)
  })
}

for (const entry of [
  'master-customer',
  'master-project',
  'master-formula',
  'master-control',
  'master-operation',
  'master-workstation'
]) {
  test(`${entry} 分类只读详情保留全部分类且不触发写入`, async ({ page }, info) => {
    const writes: Write[] = []
    const dialog = await open(page, entry, '&valid=true&readonly=true', writes)
    const navigation = await tabs(dialog)
    const expectedTabs: Record<string, number> = {
      'master-customer': 3,
      'master-project': 3,
      'master-formula': 2,
      'master-control': 2,
      'master-operation': 2,
      'master-workstation': 0
    }
    await expect(navigation).toHaveCount(expectedTabs[entry])
    if (await navigation.count()) {
      for (let index = 0; index < (await navigation.count()); index++) {
        await navigation.nth(index).click()
        await expect(dialog.getByRole('tabpanel').filter({ visible: true })).toHaveCount(1)
        await page.screenshot({
          path: info.outputPath(`${entry}-readonly-${index + 1}.png`),
          timeout: 60_000
        })
      }
    } else
      await page.screenshot({
        path: info.outputPath(`${entry}-readonly-compact.png`),
        timeout: 60_000
      })
    expect(writes).toHaveLength(0)
    await dialog.getByRole('button', { name: '关闭弹窗', exact: true }).click()
    await page.getByRole('button', { name: '打开真实业务入口', exact: true }).click()
    if (expectedTabs[entry])
      await expect(navigation.first()).toHaveAttribute('aria-selected', 'true')
    expect(writes).toHaveLength(0)
  })
}
