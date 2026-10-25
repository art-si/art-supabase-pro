import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

test('生产员工适配器规范化布尔权限并拒绝非法范围', async ({ page }) => {
  let calls = 0
  await page.route('**/rest/v1/**', (route) => {
    calls++
    expect(new URL(route.request().url()).pathname).toBe(
      '/rest/v1/rpc/mdm_list_production_employees'
    )
    expect(route.request().postDataJSON()).toEqual({ p_from: 0, p_to: 9, p_keyword: null })
    return route.fulfill({
      json: {
        records: [],
        total: 0,
        field_access: { contactDetails: calls === 1, identityDetails: calls === 2 }
      }
    })
  })
  await page.goto('/tests/e2e/fixtures/production-pagination.html')
  await page.getByRole('button', { name: '校验生产员工字段权限' }).click()
  await expect(page.getByTestId('result')).toHaveText(
    JSON.stringify({
      rejected: 2,
      permissions: [
        { contactDetails: 'read', identityDetails: 'hidden' },
        { contactDetails: 'hidden', identityDetails: 'read' }
      ]
    })
  )
  expect(calls).toBe(2)
})

test('主仓和 HR 员工选择器共享范围、筛选和字段权限契约', async ({ page }) => {
  let calls = 0
  await page.route('**/rest/v1/**', (route) => {
    calls++
    expect(new URL(route.request().url()).pathname).toBe(
      '/rest/v1/rpc/hr_list_employee_selector_secure'
    )
    expect(route.request().postDataJSON()).toEqual({
      p_tenant_id: 'tenant-a',
      p_keyword: '员工',
      p_from: 20,
      p_to: 39
    })
    return route.fulfill({
      json: {
        records: [{ id: 'employee-a', employee_no: 'EMP-001', employee_name: '测试员工' }],
        total: 1,
        field_access: { contactDetails: 'masked', identityDetails: 'hidden' }
      }
    })
  })
  await page.goto('/tests/e2e/fixtures/production-pagination.html')
  await page.getByRole('button', { name: '校验员工选择器复用' }).click()
  await expect(page.getByTestId('result')).toHaveText(/^\{/)
  await expect
    .poll(async () => JSON.parse(await page.getByTestId('result').innerText()))
    .toEqual({
      rejected: 4,
      rows: [0, 1].map(() => ({
        data: [{ id: 'employee-a', employeeNo: 'EMP-001', employeeName: '测试员工' }],
        total: 1,
        error: null,
        fieldAccess: { contactDetails: 'masked', identityDetails: 'hidden' }
      }))
    })
  expect(calls).toBe(2)
})

test('主数据目录拒绝非法页长并保留 100 条上限的第二页', async ({ page }) => {
  let calls = 0
  await page.route('**/rest/v1/**', (route) => {
    calls++
    expect(new URL(route.request().url()).pathname).toBe('/rest/v1/rpc/mdm_list_catalog_secure')
    expect(route.request().postDataJSON()).toMatchObject({
      p_scope: 'material',
      p_from: 100,
      p_to: 199
    })
    return route.fulfill({ json: { records: [], total: 0, sources: [], summary: {} } })
  })
  await page.goto('/tests/e2e/fixtures/production-pagination.html')
  await page.getByRole('button', { name: '校验目录页长' }).click()
  await expect(page.getByTestId('result')).toHaveText('5 个目录页长拒绝，返回第 2 页 100 条范围')
  expect(calls).toBe(1)
})

test('人员选择器拒绝不安全范围并保留整数边界兼容', async ({ page }) => {
  const ranges: number[][] = []
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url())
    expect(url.pathname).toBe('/rest/v1/rpc/mdm_work_center_people')
    const offset = Number(url.searchParams.get('offset'))
    const limit = Number(url.searchParams.get('limit'))
    ranges.push([offset, offset + limit - 1])
    expect(url.searchParams.get('order')).toBe('employee_no.asc,id.asc')
    return route.fulfill({ json: [], headers: { 'content-range': '*/0' } })
  })
  await page.goto('/tests/e2e/fixtures/production-pagination.html')
  await page.getByRole('button', { name: '校验人员选择器范围' }).click()
  await expect(page.getByTestId('result')).toHaveText('8 个选择器参数拒绝，4 个范围保留')
  expect(ranges).toEqual([
    [0, 0],
    [0, 9],
    [20, 20],
    [20, 39]
  ])
})

test('生产与库存分页入口在网络请求前拒绝非法范围', async ({ page }) => {
  const requests: string[] = []
  await page.route('**/rest/v1/**', (route) => {
    requests.push(route.request().url())
    return route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/production-pagination.html')
  await page.getByRole('button', { name: '校验非法分页' }).click()
  await expect(page.getByTestId('result')).toHaveText('420 个参数拒绝')
  expect(requests).toEqual([])
})

test('有效第二页保留表查询与 RPC 的分页范围', async ({ page }) => {
  let calls = 0
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url())
    calls++
    if (
      url.pathname.includes('/rpc/') &&
      !url.pathname.endsWith('/get_effective_ai_feature_configs')
    ) {
      const body = route.request().postDataJSON()
      if (/\/wms_project_(serial|pack|material|movement)_page_secure$/.test(url.pathname))
        expect(body).toMatchObject({ p_offset: 20, p_limit: 20 })
      else expect(body).toMatchObject({ p_from: 20, p_to: 39 })
      if (url.pathname.endsWith('/mdm_list_catalog_secure'))
        expect(body).toMatchObject({
          p_scope: 'material',
          p_source_type: 'material',
          p_state: 'active',
          p_quality: 'complete'
        })
    } else {
      expect(url.searchParams.get('offset')).toBe('20')
      expect(url.searchParams.get('limit')).toBe('20')
      expect(route.request().headers().prefer).toContain('count=exact')
      if (url.pathname === '/rest/v1/ai_prompt_template') {
        expect(url.searchParams.get('order')).toBe('feature.asc,update_time.desc,id.asc')
        expect(url.searchParams.get('tenant_id')).toBe('eq.tenant-a')
      }
      if (url.pathname === '/rest/v1/ai_run')
        expect(url.searchParams.get('order')).toBe('started_at.desc,id.asc')
      if (url.pathname === '/rest/v1/mdm_bom')
        expect(url.searchParams.get('order')).toBe('sort.asc,update_time.desc,id.asc')
      if (url.pathname === '/rest/v1/mdm_component_type')
        expect(url.searchParams.get('order')).toBe('sort_order.asc,component_type_code.asc,id.asc')
      if (url.pathname === '/rest/v1/mdm_esop_document')
        expect(url.searchParams.get('order')).toBe('upload_time.desc,id.asc')
      if (
        [
          'mdm_unit_of_measure',
          'mdm_material_type',
          'mdm_material_attribute_group',
          'mdm_material_code_rule',
          'mdm_material',
          'wms_inventory_batch',
          'mdm_supplier',
          'mdm_customer',
          'mdm_project',
          'mdm_activity_formula',
          'mdm_operation_control_code',
          'mdm_operation',
          'mdm_workstation',
          'mdm_quality_issue',
          'mdm_change_request',
          'mdm_match_candidate',
          'mdm_outbox_delivery'
        ].some((table) => url.pathname === `/rest/v1/${table}`)
      )
        expect(url.searchParams.get('order')).toMatch(/(?:^|,)id\.asc$/)
      if (url.pathname === '/rest/v1/mdm_stock_movement_type') {
        expect(url.searchParams.get('order')).toBe('movement_code.asc,id.asc')
        expect(url.searchParams.get('tenant_id')).toBe('eq.tenant-a')
      }
      if (
        ['pmis_plan', 'pmis_task', 'pmis_repair_task'].some(
          (table) => url.pathname === `/rest/v1/${table}`
        )
      ) {
        expect(url.searchParams.get('tenant_id')).toBe('eq.tenant-a')
        expect(url.searchParams.get('order')).toMatch(/(?:^|,)id\.asc$/)
      }
      if (url.pathname === '/rest/v1/pmis_plan')
        expect(url.searchParams.get('plan_kind')).toBe('eq.inspection')
      if (url.pathname === '/rest/v1/pmis_task')
        expect(url.searchParams.get('plan.plan_kind')).toBe('eq.inspection')
      if (url.pathname === '/rest/v1/wms_production_material_list') {
        expect(url.searchParams.get('tenant_id')).toBe('eq.tenant-a')
        expect(url.searchParams.get('kind')).toBe('eq.issue')
        expect(url.searchParams.get('order')).toBe(
          'created_at.desc,line_no.asc,document_id.asc,line_id.asc'
        )
      }
      if (url.pathname === '/rest/v1/wms_finished_inbound_source_list') {
        expect(url.searchParams.get('tenant_id')).toBe('eq.tenant-a')
        expect(url.searchParams.get('work_order_id')).toBe('eq.work-order-a')
        expect(url.searchParams.get('available_quantity')).toBe('gt.0')
        expect(url.searchParams.get('order')).toBe('document_no.desc,id.asc')
      }
      if (
        url.pathname === '/rest/v1/wms_inventory_batch' &&
        url.searchParams.get('select')?.includes('displayUnit:mdm_unit_of_measure')
      ) {
        expect(url.searchParams.get('tenant_id')).toBe('eq.tenant-a')
        expect(url.searchParams.get('status')).toBe('eq.normal')
        expect(url.searchParams.get('order')).toBe('last_movement_at.desc,id.asc')
      }
      if (
        ['/rest/v1/mdm_supply_chain_code_rule', '/rest/v1/mdm_outbound_rule'].includes(url.pathname)
      )
        expect(url.searchParams.get('order')).toBe('update_time.desc,id.asc')
      if (url.pathname.endsWith('/get_effective_ai_feature_configs'))
        expect(url.searchParams.get('order')).toBe('feature.asc,id.asc')
      if (url.pathname === '/rest/v1/wms_initial_stock_document')
        expect(url.searchParams.get('order')).toBe('created_at.desc,id.asc')
      if (url.pathname === '/rest/v1/wms_sales_document_list')
        expect(url.searchParams.get('order')).toBe(
          'created_at.desc,line_no.asc,document_id.asc,line_id.asc'
        )
      if (url.pathname === '/rest/v1/mes_work_order')
        expect(url.searchParams.get('order')).toBe(
          url.searchParams.get('project_id') === 'eq.project-a'
            ? 'create_time.desc,id.asc'
            : 'update_time.desc,id.asc'
        )
      if (
        [
          '/rest/v1/mes_operation_task',
          '/rest/v1/mes_production_report',
          '/rest/v1/mes_execution_event'
        ].includes(url.pathname)
      )
        expect(url.searchParams.get('order')).toMatch(/(?:^|,)id\.asc$/)
    }
    return route.fulfill({
      headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' },
      json: []
    })
  })
  await page.goto('/tests/e2e/fixtures/production-pagination.html?valid=true')
  await page.getByRole('button', { name: '校验非法分页' }).click()
  await expect(page.getByTestId('result')).toHaveText('84 个请求完成')
  expect(calls).toBe(84)
})

test('AI 列表按请求的 200 条页大小读取第二页', async ({ page }) => {
  const paths: string[] = []
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url())
    paths.push(url.pathname)
    expect(url.searchParams.get('offset')).toBe('200')
    expect(url.searchParams.get('limit')).toBe('200')
    expect(route.request().headers().prefer).toContain('count=exact')
    return route.fulfill({
      headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' },
      json: []
    })
  })
  await page.goto('/tests/e2e/fixtures/production-pagination.html?valid=true&aiOnly=true')
  await page.getByRole('button', { name: '校验非法分页' }).click()
  await expect(page.getByTestId('result')).toHaveText('3 个请求完成')
  expect(paths).toEqual([
    '/rest/v1/ai_prompt_template',
    '/rest/v1/rpc/get_effective_ai_feature_configs',
    '/rest/v1/ai_run'
  ])
})
