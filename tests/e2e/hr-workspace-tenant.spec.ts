import { expect, test, type Page, type Request } from '@playwright/test'

const previewPath = '/tests/e2e/fixtures/hr-workspace-tenant.html'
const platformTenantId = '55555555-5555-4555-8555-555555555555'
const businessTenantId = '11111111-1111-4111-8111-111111111111'

test.setTimeout(60_000)

interface CapturedRequest {
  path: string
  method: string
  tenantFilter: string | null
  tenantHeader: string | undefined
  body: Record<string, unknown> | null
}

const captureRequest = (request: Request): CapturedRequest => {
  const url = new URL(request.url())
  const bodyText = request.postData()
  return {
    path: url.pathname,
    method: request.method(),
    tenantFilter: url.searchParams.get('tenant_id'),
    tenantHeader: request.headers()['x-art-tenant-scope'],
    body: bodyText ? (JSON.parse(bodyText) as Record<string, unknown>) : null
  }
}

const mockWorkspaceApi = async (page: Page): Promise<CapturedRequest[]> => {
  const requests: CapturedRequest[] = []
  await page.route('**/rest/v1/**', async (route) => {
    const request = captureRequest(route.request())
    requests.push(request)

    if (request.path.endsWith('/hr_position_headcount') && request.method !== 'GET') {
      await route.fulfill({
        status: request.method === 'POST' ? 201 : 200,
        json: {
          id: '33333333-3333-4333-8333-333333333333',
          tenant_id: request.body?.tenant_id ?? businessTenantId,
          approved_count: request.body?.approved_count ?? 3,
          effective_from: request.body?.effective_from ?? '2026-10-01'
        }
      })
      return
    }

    if (request.path.endsWith('/rpc/hr_resolve_workspace_references_secure')) {
      await route.fulfill({
        status: 200,
        json: { employees: [], positions: [], organizations: [], headcounts: [] }
      })
      return
    }

    if (request.path.endsWith('/rpc/hr_list_personnel_change_employees_secure')) {
      await route.fulfill({
        status: 200,
        json: {
          records: [
            {
              id: '99999999-9999-4999-8999-999999999999',
              tenant_id: businessTenantId,
              employee_no: 'EMP-002',
              employee_name: '跨租户员工',
              employment_status: 'active',
              assignment_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              assignment_updated_at: '2026-10-01T08:00:00Z',
              assignment_snapshot: {
                organization_id: '77777777-7777-4777-8777-777777777777',
                organization_name: '测试部门',
                position_id: '88888888-8888-4888-8888-888888888888',
                position_name: '测试岗位',
                employment_status: 'active'
              }
            }
          ],
          total: 1
        }
      })
      return
    }

    await route.fulfill({ status: 200, json: [] })
  })
  return requests
}

const expectRpcTenant = async (
  requests: CapturedRequest[],
  rpcName: string,
  tenantId: string
): Promise<void> => {
  await expect
    .poll(() => requests.find((request) => request.path.endsWith(`/rpc/${rpcName}`))?.body)
    .toMatchObject({ p_tenant_id: tenantId })
}

for (const [mode, targetTenantId] of [
  ['platform-all', platformTenantId],
  ['platform-selected', businessTenantId],
  ['ordinary', businessTenantId],
  ['ordinary-forged', businessTenantId]
] as const) {
  test(`${mode} 新建 HR 记录使用明确的目标租户`, async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    const requests = await mockWorkspaceApi(page)

    await page.goto(`${previewPath}?mode=${mode}`)
    const dialog = page.locator('.el-dialog:visible').filter({ hasText: '新增岗位编制' })
    await expect(dialog).toBeVisible()
    await expectRpcTenant(requests, 'hr_list_position_options_secure', targetTenantId)
    await expectRpcTenant(requests, 'hr_list_business_organization_options_secure', targetTenantId)

    await dialog.getByRole('button', { name: '创建记录' }).click()
    await expect
      .poll(
        () =>
          requests.find(
            (request) =>
              request.path.endsWith('/hr_position_headcount') && request.method === 'POST'
          )?.body
      )
      .toMatchObject({ tenant_id: targetTenantId })

    if (mode === 'ordinary-forged') {
      expect(
        requests.find((request) => request.path.endsWith('/hr_position_headcount'))?.tenantHeader
      ).toBe(platformTenantId)
    }
    expect(pageErrors).toEqual([])
  })
}

test('全部租户编辑其他租户记录时关联选项与更新条件保持记录归属', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  const requests = await mockWorkspaceApi(page)

  await page.goto(`${previewPath}?mode=platform-all&edit=1`)
  const dialog = page.locator('.el-dialog:visible').filter({ hasText: '编辑岗位编制' })
  await expect(dialog).toBeVisible()
  await expectRpcTenant(requests, 'hr_list_position_options_secure', businessTenantId)
  await expectRpcTenant(requests, 'hr_list_business_organization_options_secure', businessTenantId)

  await dialog.getByRole('button', { name: '保存更改' }).click()
  await expect
    .poll(() =>
      requests.find(
        (request) => request.path.endsWith('/hr_position_headcount') && request.method === 'PATCH'
      )
    )
    .toMatchObject({ tenantFilter: `eq.${businessTenantId}` })
  const update = requests.find(
    (request) => request.path.endsWith('/hr_position_headcount') && request.method === 'PATCH'
  )
  expect(update?.body).not.toHaveProperty('tenant_id')
  expect(pageErrors).toEqual([])
})

test('全部租户编辑招聘需求时编号规则按记录租户读取', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  const requests = await mockWorkspaceApi(page)

  await page.goto(`${previewPath}?mode=platform-all&scenario=recruitment&edit=1`)
  const dialog = page.locator('.el-dialog:visible').filter({ hasText: '编辑招聘需求' })
  await expect(dialog).toBeVisible()
  await expect
    .poll(
      () =>
        requests.find((request) => request.path.endsWith('/sys_document_number_rule'))?.tenantFilter
    )
    .toBe(`eq.${businessTenantId}`)
  expect(pageErrors).toEqual([])
})

test('全部租户编辑人事异动时组织、职级和编号规则跟随记录租户', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  const requests = await mockWorkspaceApi(page)

  await page.goto('/tests/e2e/fixtures/hr-personnel-change-tenant.html')
  const dialog = page.locator('.el-dialog:visible').filter({ hasText: '编辑人事异动单' })
  await expect(dialog).toBeVisible()
  await expectRpcTenant(requests, 'hr_list_business_organization_options_secure', businessTenantId)
  await expectRpcTenant(requests, 'hr_list_job_architecture_options_secure', businessTenantId)
  await expect
    .poll(
      () =>
        requests.find((request) => request.path.endsWith('/sys_document_number_rule'))?.tenantFilter
    )
    .toBe(`eq.${businessTenantId}`)
  expect(pageErrors).toEqual([])
})

test('全部租户新增人事异动可选其他租户员工并切换编号规则目标', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  const requests = await mockWorkspaceApi(page)

  await page.goto('/tests/e2e/fixtures/hr-personnel-change-tenant.html?edit=0')
  const dialog = page.locator('.el-dialog:visible').filter({ hasText: '新增人事异动单' })
  await expect(dialog).toBeVisible()
  const employeeField = dialog.getByRole('textbox', { name: '员工' })
  await expect(employeeField).toBeEnabled()
  await employeeField.click()
  const employeePicker = page.locator('.el-dialog:visible').filter({ hasText: '选择员工' })
  await expect(employeePicker.getByText('跨租户员工')).toBeVisible()
  await employeePicker.getByText('跨租户员工').click()
  await employeePicker.getByRole('button', { name: '确定' }).click()

  await expect(employeeField).toHaveValue('跨租户员工 · EMP-002')
  await expect
    .poll(
      () =>
        requests.filter((request) => request.path.endsWith('/sys_document_number_rule')).at(-1)
          ?.tenantFilter
    )
    .toBe(`eq.${businessTenantId}`)
  expect(pageErrors).toEqual([])
})

test('HR 员工字段显示档案姓名和工号', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await mockWorkspaceApi(page)

  await page.goto(`${previewPath}?mode=platform-all&scenario=employee&edit=1`)
  const dialog = page.locator('.el-dialog:visible').filter({ hasText: '编辑员工能力' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('textbox', { name: '员工' })).toHaveValue('测试员工 · EMP-001')
  await expect(dialog.getByText('66666666-6666-4666-8666-666666666666')).toHaveCount(0)
  const icon = dialog.locator('.hr-record-dialog__icon')
  expect(
    (await icon.locator('svg path').count()) > 0 || (await icon.locator('span').isVisible())
  ).toBe(true)
  await page.screenshot({
    path: '.artifacts/hr-workspace-tenant-employee-desktop.png',
    animations: 'disabled'
  })
  expect(pageErrors).toEqual([])
})

test('HR 共享弹窗在窄屏没有横向溢出', async ({ page }) => {
  await mockWorkspaceApi(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${previewPath}?mode=platform-all`)
  const dialog = page.locator('.el-dialog:visible').filter({ hasText: '新增岗位编制' })
  await expect(dialog).toBeVisible()
  const overflow = await dialog.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth
  }))
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)
  await page.screenshot({
    path: '.artifacts/hr-workspace-tenant-mobile.png',
    animations: 'disabled'
  })
})

test('HR 共享弹窗在深色边框和浅色阴影模式保持可读', async ({ page }) => {
  await mockWorkspaceApi(page)
  await page.goto(`${previewPath}?mode=platform-all&scenario=employee&edit=1`)
  const dialog = page.locator('.el-dialog:visible').filter({ hasText: '编辑员工能力' })
  await expect(dialog).toBeVisible()

  await page.evaluate(() => {
    document.documentElement.classList.add('dark')
    document.documentElement.dataset.boxMode = 'border-mode'
  })
  await page.screenshot({
    path: '.artifacts/hr-workspace-tenant-dark-border.png',
    animations: 'disabled'
  })

  await page.evaluate(() => {
    document.documentElement.classList.remove('dark')
    document.documentElement.dataset.boxMode = 'shadow-mode'
  })
  await page.screenshot({
    path: '.artifacts/hr-workspace-tenant-light-shadow.png',
    animations: 'disabled'
  })
})
