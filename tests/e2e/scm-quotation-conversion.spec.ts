import { expect, test, type Route } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)
test.beforeEach(async ({ page }, testInfo) => {
  await prepareIsolatedSession(page)
  await page.addInitScript((dark) => {
    document.addEventListener('DOMContentLoaded', () =>
      document.documentElement.classList.toggle('dark', dark)
    )
  }, testInfo.project.name.includes('dark'))
  await page.route('**/rest/v1/rpc/scm_quotation_conversion_quantities', (route) =>
    route.fulfill({ json: [] })
  )
})

test('项目报价单选项超时结束等待，重试保持表单且迟到请求不覆盖', async ({ page }) => {
  const pending: Route[] = []
  let hold = true
  await page.route('**/rest/v1/mdm_project?*', (route) => {
    if (hold) {
      pending.push(route)
      return
    }
    return route.fulfill({ json: [] })
  })
  await page.clock.install()
  await page.goto('/tests/e2e/fixtures/quotation-conversion.html')
  await page.getByRole('button', { name: '新增项目报价单验证', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '新增项目报价单', exact: true })
  await expect(
    dialog.getByText('正在读取单据类型、项目、客户与物料选项，请稍候…', { exact: true })
  ).toBeVisible()
  await expect.poll(() => pending.length).toBe(1)
  await page.clock.fastForward(30_001)
  await expect(
    dialog.getByText('关联资料读取超时，请重新加载；已填写内容会保留', { exact: true })
  ).toBeVisible()
  hold = false
  await dialog.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(dialog.getByText('单据选项加载失败', { exact: true })).toBeHidden()
  await pending[0].fulfill({
    json: [{ id: 'stale-project', project_code: 'STALE', project_name: '旧项目' }]
  })
  await expect(
    dialog.getByText('正在读取单据类型、项目、客户与物料选项，请稍候…', { exact: true })
  ).toBeHidden()
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(dialog).toBeHidden()
})

test('报价列表按单据和明细选择均提供批量操作并支持专注恢复', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  const documents = ['a', 'b'].map((id) => ({
    id: `quote-${id}`,
    tenant_id: 'tenant-a',
    kind: 'sales_quotation',
    document_no: `QUOTE-${id}`,
    status: 'draft',
    document_date: '2026-10-08',
    currency: 'CNY',
    details: {},
    lines: [10, 20].map((lineNo) => ({
      line_id: `line-${lineNo}`,
      line_no: lineNo,
      material_id: 'material-a',
      material_code: 'MAT-A',
      material_description: `物料${lineNo}`,
      quantity: 2,
      unit_price: 1,
      tax_rate: 0
    })),
    fees: [],
    payment_plans: [],
    delivery_plans: [],
    clauses: [],
    subtotal: 4,
    fee_total: 0,
    tax_amount: 0,
    cost_total: 0,
    total_amount: 4,
    gross_profit: 0,
    gross_margin: 0,
    created_at: '',
    updated_at: ''
  }))
  await page.route('**/rest/v1/scm_sales_document?**', (route) =>
    route.fulfill({
      json: documents,
      headers: { 'content-range': '0-1/2', 'access-control-expose-headers': 'content-range' }
    })
  )
  await page.goto('/tests/e2e/fixtures/quotation-conversion.html')
  await page.getByRole('button', { name: '报价列表验证', exact: true }).click()
  const workspace = page.locator('.business-workspace-page')
  await expect(workspace).toBeVisible({ timeout: 120_000 })
  await expect(workspace.getByRole('button', { name: '新增', exact: true })).toBeVisible()
  await expect(workspace.getByText('QUOTE-a', { exact: true })).toBeVisible()
  await workspace.locator('tbody .el-checkbox').first().check()
  for (const name of ['生成物料编码', '批量删除', '转生产工单', '转报价BOM']) {
    await expect(workspace.getByRole('button', { name, exact: true })).toBeVisible()
  }
  await workspace.getByText('按明细', { exact: true }).click()
  await expect(workspace.locator('tbody tr')).toHaveCount(4)
  await workspace.locator('tbody .el-checkbox').first().check()
  await expect(workspace.getByRole('button', { name: '批量删除', exact: true })).toBeEnabled()
  await page.screenshot({
    path: testInfo.outputPath('quotation-detail-selection.png'),
    animations: 'disabled'
  })
  await workspace.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
  await expect(workspace.getByText('销售业务', { exact: true })).toBeHidden()
  await expect(workspace.getByRole('button', { name: '批量删除', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(workspace.getByText('销售业务', { exact: true })).toBeVisible()
  await workspace.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
  await workspace.getByRole('button', { name: '退出专注模式', exact: true }).click()
  await expect(workspace.getByText('销售业务', { exact: true })).toBeVisible()
})

test('分批转单显示剩余数量并保留失败重试的幂等编号', async ({ page }, testInfo) => {
  let failRead = true
  const submissions: Record<string, unknown>[] = []
  await page.route('**/rest/v1/rpc/scm_quotation_conversion_quantities', (route) =>
    failRead
      ? route.fulfill({ status: 500, json: { code: 'XX000', message: 'quantity read failure' } })
      : route.fulfill({ json: [{ target_kind: 'sales_order', line_id: 'line-a', quantity: 1.25 }] })
  )
  await page.route('**/rest/v1/rpc/scm_convert_quotation_lines', (route) => {
    submissions.push(route.request().postDataJSON())
    return submissions.length === 1
      ? route.fulfill({
          status: 500,
          json: { code: 'XX000', message: 'temporary conversion failure' }
        })
      : route.fulfill({
          json: {
            id: 'target-partial',
            document_no: 'SO-PARTIAL',
            target_kind: 'sales_order',
            reused: true
          }
        })
  })
  await page.goto('/tests/e2e/fixtures/quotation-conversion.html')
  await page.getByRole('button', { name: '销售转单', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('已转数量加载失败，请重试', { exact: true })).toBeVisible()
  failRead = false
  await dialog.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(dialog.getByText('0.75', { exact: true })).toBeVisible()
  await expect(dialog.getByText(/下达前必须填写/)).toBeVisible()
  await dialog.locator('thead .el-checkbox').check()
  await dialog.getByRole('spinbutton', { name: '第10行本次转单数量' }).fill('0.5')
  await dialog.getByRole('spinbutton', { name: '第10行本次转单数量' }).blur()
  await page.screenshot({
    path: testInfo.outputPath('partial-conversion.png'),
    animations: 'disabled'
  })
  await dialog.getByRole('button', { name: '生成目标单据', exact: true }).click()
  await expect.poll(() => submissions.length).toBe(1)
  await expect(dialog.getByRole('button', { name: '生成目标单据', exact: true })).toBeEnabled()
  await dialog.getByRole('button', { name: '生成目标单据', exact: true }).click()
  await expect(page.getByTestId('success-count')).toHaveText('1')
  expect(submissions[0].requested_lines).toEqual([{ line_id: 'line-a', quantity: 0.5 }])
  expect(submissions[1].request_id).toEqual(submissions[0].request_id)
})

test('物料编码按所选明细生成并优先继承来源单位规格品牌', async ({ page }, testInfo) => {
  await page.route('**/rest/v1/sys_dictionary?**', (route) =>
    route.fulfill({ json: [{ id: 'source', label: '自制', value: 'self_made', sort: 1 }] })
  )
  const references: Record<string, Record<string, string>[]> = {
    mdm_material_category: [
      { id: 'category-a', tenant_id: 'tenant-a', category_code: 'CAT', category_name: '配件' }
    ],
    mdm_material_type: [
      { id: 'type-a', tenant_id: 'tenant-a', type_code: 'TYPE', type_name: '半成品' }
    ],
    mdm_unit_of_measure: [
      { id: 'unit-a', tenant_id: 'tenant-a', unit_code: 'PCS', unit_name: '件' },
      { id: 'unit-b', tenant_id: 'tenant-a', unit_code: 'M', unit_name: '米' }
    ],
    mdm_material_code_rule: [
      { id: 'rule-a', tenant_id: 'tenant-a', rule_code: 'RULE', rule_name: '半成品编码' }
    ]
  }
  for (const [table, rows] of Object.entries(references))
    await page.route(`**/rest/v1/${table}?**`, (route) => route.fulfill({ json: rows }))
  let payload: Record<string, unknown> | undefined
  await page.route('**/rest/v1/rpc/scm_batch_quotation_action', (route) => {
    payload = route.request().postDataJSON()
    return route.fulfill({
      json: [
        {
          quotation_id: 'quote-a',
          result: [{ line_id: 'line-a', material_id: 'new-material', material_code: 'M-001' }]
        }
      ]
    })
  })
  await page.goto('/tests/e2e/fixtures/quotation-conversion.html')
  await page.getByRole('button', { name: '物料编码', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('M10×30', { exact: true })).toBeVisible()
  await expect(dialog.getByText('测试品牌', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('combobox', { name: '第10行基本单位' })).toBeVisible()
  await expect(
    dialog
      .getByRole('combobox', { name: '第10行销售单位' })
      .locator('xpath=ancestor::*[contains(@class,"el-select__wrapper")][1]')
  ).toContainText('米')
  await dialog.locator('tbody .el-checkbox').first().check()
  await page.screenshot({
    path: testInfo.outputPath('material-partial.png'),
    animations: 'disabled'
  })
  await dialog.getByRole('button', { name: '执行生成', exact: true }).click()
  await expect(page.getByTestId('success-count')).toHaveText('1')
  expect(payload?.p_groups).toEqual([{ quotation_id: 'quote-a', line_ids: ['line-a'] }])
  expect(payload?.p_config).toMatchObject({
    line_configs: [
      {
        line_id: 'line-a',
        base_unit_id: 'unit-b',
        purchase_unit_id: 'unit-b',
        sales_unit_id: 'unit-b',
        inventory_unit_id: 'unit-b',
        production_unit_id: 'unit-b',
        cost_unit_id: 'unit-b'
      }
    ]
  })
})
test('路由离开强制关闭后不接收旧转单成功事件', async ({ page }) => {
  let pending: Route | undefined
  await page.route('**/rest/v1/rpc/scm_convert_quotation_lines', (route) => {
    pending = route
  })
  await page.goto('/tests/e2e/fixtures/quotation-conversion.html')
  await page.getByRole('button', { name: '销售转单', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('thead .el-checkbox').check()
  await dialog.getByRole('button', { name: '生成目标单据', exact: true }).click()
  await expect.poll(() => Boolean(pending)).toBe(true)
  // Activate the fixture navigation command without testing a pointer click through the modal mask.
  await page
    .getByRole('button', { name: '离开报价页面', exact: true })
    .evaluate((element) => element.click())
  await expect(dialog).not.toBeVisible()
  const oldResponse = page.waitForResponse('**/rest/v1/rpc/scm_convert_quotation_lines')
  await pending!.fulfill({
    json: { id: 'target-a', document_no: 'ORDER-A', target_kind: 'sales_order', reused: false }
  })
  await oldResponse
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
  await expect(page.getByTestId('success-count')).toHaveText('0')
})
test('转单成功仅通知当前弹窗且旧提交不关闭新弹窗', async ({ page }) => {
  const pending: Route[] = []
  let hold = true
  const response = {
    id: 'target-a',
    document_no: 'ORDER-A',
    target_kind: 'sales_order',
    reused: false
  }
  await page.route('**/rest/v1/rpc/scm_convert_quotation_lines', (route) => {
    expect(route.request().postDataJSON()).toEqual({
      quotation_id: 'quote-a',
      target_kind: 'sales_order',
      supplier_id: null,
      requested_lines: [{ line_id: 'line-a', quantity: 2 }],
      request_id: expect.any(String)
    })
    if (hold) {
      pending.push(route)
      return
    }
    return route.fulfill({ json: response })
  })
  await page.goto('/tests/e2e/fixtures/quotation-conversion.html')
  await page.getByRole('button', { name: '销售转单', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('thead .el-checkbox').check()
  await dialog.getByRole('button', { name: '生成目标单据', exact: true }).click()
  await expect.poll(() => pending.length).toBe(1)
  await dialog.getByRole('button', { name: 'Close this dialog', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await page.getByRole('button', { name: '销售转单', exact: true }).click()
  await expect(dialog).toBeVisible()
  const oldResponse = page.waitForResponse('**/rest/v1/rpc/scm_convert_quotation_lines')
  await pending[0].fulfill({ json: response })
  await oldResponse
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
  await expect(page.getByTestId('success-count')).toHaveText('0')
  await expect(dialog).toBeVisible()
  hold = false
  await dialog.locator('thead .el-checkbox').check()
  await dialog.getByRole('button', { name: '生成目标单据', exact: true }).click()
  await expect(page.getByTestId('success-count')).toHaveText('1')
  await expect(dialog).not.toBeVisible()
})
test('物料编码引用重试后恢复默认配置', async ({ page }, testInfo) => {
  let fail = true
  await page.route('**/rest/v1/sys_dictionary?**', (route) =>
    route.fulfill({ json: [{ id: 'source-a', label: '自制', value: 'self_made', sort: 1 }] })
  )
  const references: Record<string, Record<string, string>[]> = {
    mdm_material_category: [
      { id: 'category-a', tenant_id: 'tenant-a', category_code: 'CAT', category_name: '配件' }
    ],
    mdm_material_type: [
      { id: 'type-a', tenant_id: 'tenant-a', type_code: 'TYPE', type_name: '半成品' }
    ],
    mdm_unit_of_measure: [
      { id: 'unit-a', tenant_id: 'tenant-a', unit_code: 'UNIT', unit_name: '件' }
    ],
    mdm_material_code_rule: [
      { id: 'rule-a', tenant_id: 'tenant-a', rule_code: 'RULE', rule_name: '半成品编码' }
    ]
  }
  for (const [table, rows] of Object.entries(references))
    await page.route(`**/rest/v1/${table}?**`, (route) => {
      expect(new URL(route.request().url()).searchParams.get('tenant_id')).toBe('eq.tenant-a')
      return fail && table === 'mdm_material_type'
        ? route.fulfill({
            status: 500,
            json: { code: 'XX000', message: 'technical reference failure' }
          })
        : route.fulfill({ json: rows })
    })
  await page.goto('/tests/e2e/fixtures/quotation-conversion.html')
  await page.getByRole('button', { name: '物料编码', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('物料主数据加载失败，请重试', { exact: true })).toBeVisible()
  await expect(dialog.getByText('待编码物料', { exact: true })).toBeVisible()
  fail = false
  await dialog.getByRole('button', { name: '重新加载', exact: true }).click()
  for (const label of ['半成品', '配件 · CAT', '件', '半成品编码'])
    await expect(dialog.getByText(label, { exact: true }).first()).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('material-recovered.png'),
    animations: 'disabled'
  })
})

test('工单类型失败重试后保留报价明细并恢复默认类型', async ({ page }, testInfo) => {
  let fail = true
  await page.route('**/rest/v1/sys_menu?**', (route) =>
    route.fulfill({ json: { id: 'work-menu' } })
  )
  await page.route('**/rest/v1/mdm_document_type?**', (route) => {
    expect(new URL(route.request().url()).searchParams.get('tenant_id')).toBe('eq.tenant-a')
    return fail
      ? route.fulfill({ status: 500, json: { code: 'XX000', message: 'technical type failure' } })
      : route.fulfill({
          json: [
            {
              id: 'work-type',
              tenant_id: 'tenant-a',
              document_type_name: '标准生产工单',
              document_type_code: 'WO',
              is_default: true
            }
          ]
        })
  })
  await page.goto('/tests/e2e/fixtures/quotation-conversion.html')
  await page.getByRole('button', { name: '生产工单', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('工单类型加载失败，请重试', { exact: true })).toBeVisible()
  await expect(dialog.getByText('工单组件', { exact: true })).toBeVisible()
  fail = false
  await dialog.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(dialog.getByText('标准生产工单', { exact: true })).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('work-order-recovered.png'),
    animations: 'disabled'
  })
})
test('报价 BOM 引用失败保留明细且可原地重试', async ({ page }, testInfo) => {
  let fail = true
  let holdSubmit = true
  let pendingSubmit: Route | undefined
  const bomResult = { id: 'bom-a', bom_code: 'BOM-A', reused: false }
  await page.route('**/rest/v1/rpc/scm_batch_quotation_action', (route) => {
    expect(route.request().postDataJSON()).toEqual({
      p_action: 'bom',
      p_groups: [{ quotation_id: 'quote-a', line_ids: ['line-a'] }],
      p_config: { parent_material_id: 'parent-a' }
    })
    if (holdSubmit) {
      pendingSubmit = route
      return
    }
    return route.fulfill({ json: bomResult })
  })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/mdm_material?**', (route) => {
    expect(new URL(route.request().url()).searchParams.get('tenant_id')).toBe('eq.tenant-a')
    return fail
      ? route.fulfill({
          status: 500,
          json: { code: 'XX000', message: 'technical material failure' }
        })
      : route.fulfill({
          json: [
            {
              id: 'parent-a',
              tenant_id: 'tenant-a',
              material_code: 'P1',
              material_name: '测试父件',
              description: '测试父件',
              base_unit_id: 'unit-a',
              baseUnitRecord: { unit_name: '件' }
            }
          ]
        })
  })
  await page.goto('/tests/e2e/fixtures/quotation-conversion.html')
  await page.getByRole('button', { name: '报价 BOM', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('父件物料加载失败，请重试', { exact: true })).toBeVisible()
  await expect(dialog.getByText('测试组件', { exact: true })).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('bom-reference-error.png'),
    animations: 'disabled'
  })
  fail = false
  await dialog.getByRole('button', { name: '重新加载', exact: true }).click()
  await dialog.getByRole('combobox').click()
  await page.getByRole('option', { name: 'P1 · 测试父件', exact: true }).click()
  await expect(dialog.getByText('P1 · 测试父件', { exact: true })).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('bom-reference-recovered.png'),
    animations: 'disabled'
  })
  await dialog.locator('thead .el-checkbox').check()
  await dialog.getByRole('button', { name: '执行生成', exact: true }).click()
  await expect.poll(() => Boolean(pendingSubmit)).toBe(true)
  await dialog.getByRole('button', { name: 'Close this dialog', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await page.getByRole('button', { name: '报价 BOM', exact: true }).click()
  await expect(dialog.getByRole('combobox')).toBeVisible()
  const oldResponse = page.waitForResponse('**/rest/v1/rpc/scm_batch_quotation_action')
  await pendingSubmit!.fulfill({ json: bomResult })
  await oldResponse
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
  await expect(page.getByTestId('success-count')).toHaveText('0')
  await expect(dialog).toBeVisible()
  holdSubmit = false
  await dialog.getByRole('combobox').click()
  await page.getByRole('option', { name: 'P1 · 测试父件', exact: true }).click()
  await dialog.locator('thead .el-checkbox').check()
  await dialog.getByRole('button', { name: '执行生成', exact: true }).click()
  await expect(page.getByTestId('success-count')).toHaveText('1')
  await expect(dialog).not.toBeVisible()
  expect(errors).toEqual([])
})
test('报价转单供应商按需加载、重试与旧响应失效', async ({ page }, testInfo) => {
  let fail = true
  let hold = false
  let reads = 0
  const pending: Route[] = []
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/rpc/scm_purchase_suppliers_secure', (route) => {
    reads++
    if (hold) {
      hold = false
      pending.push(route)
      return
    }
    return fail
      ? route.fulfill({ status: 403, json: { code: '42501', message: 'permission denied' } })
      : route.fulfill({
          json: [{ id: 'supplier-a', supplier_name: '当前供应商', supplier_code: 'S1' }]
        })
  })
  await page.goto('/tests/e2e/fixtures/quotation-conversion.html')
  await page.getByRole('button', { name: '销售转单', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(
    dialog.getByText('将自动生成销售订单草稿。单据类型可在草稿中补充，下达前必须填写。', {
      exact: true
    })
  ).toBeVisible()
  expect(reads).toBe(0)
  await dialog.getByText('采购订单', { exact: true }).click()
  await expect(dialog.getByText('当前账号没有此操作权限', { exact: true })).toBeVisible()
  fail = false
  await dialog.getByRole('button', { name: '重新加载', exact: true }).click()
  await dialog.getByRole('combobox').click()
  await page.getByRole('option', { name: '当前供应商 · S1', exact: true }).click()
  await expect(dialog.getByText('当前供应商 · S1', { exact: true })).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('supplier-recovered.png'),
    animations: 'disabled'
  })
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  hold = true
  await page.getByRole('button', { name: '采购转单', exact: true }).click()
  await expect.poll(() => pending.length).toBe(1)
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await page.getByRole('button', { name: '采购转单', exact: true }).click()
  await expect(dialog.getByRole('combobox')).toBeVisible()
  await pending[0].fulfill({
    json: [{ id: 'old-supplier', supplier_name: '旧供应商', supplier_code: 'OLD' }]
  })
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
  await dialog.getByRole('combobox').click()
  await expect(page.getByRole('option', { name: '当前供应商 · S1', exact: true })).toBeVisible()
  await expect(page.getByRole('option', { name: '旧供应商 · OLD', exact: true })).toHaveCount(0)
  expect(errors).toEqual([])
})
