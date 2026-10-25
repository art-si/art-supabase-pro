import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const positionId = '88888888-8888-4888-8888-888888888888'
const employeeId = '99999999-9999-4999-8999-999999999999'
const requisitionId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'

test('岗位状态筛选复用公共字典并排除停用项', async ({ page }, info) => {
  test.setTimeout(240_000)
  await setupPositionPage(page, 0)
  await page.route('**/rest/v1/sys_dictionary?*', (route) =>
    route.fulfill({
      json: [
        { code: 'commonBoolean', value: 'true', label: '是', status: '1' },
        { code: 'commonBoolean', value: 'false', label: '否', status: '1' },
        { code: 'commonBoolean', value: 'legacy', label: '历史值', status: '0' }
      ]
    })
  )
  await page.reload()
  const status = page.locator('.art-search-bar .el-select').first()
  await status.click()
  await expect(page.getByRole('option', { name: '启用', exact: true })).toBeVisible()
  await expect(page.getByRole('option', { name: '停用', exact: true })).toHaveCount(1)
  await expect(page.getByRole('option')).toHaveCount(2)
  await page.screenshot({ path: info.outputPath('position-status-options.png') })
  await page.getByRole('option', { name: '启用', exact: true }).click()
  await expect(status).toContainText('启用')
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
})

async function setupPositionPage(page: Page, employeeCount: number, employeeStatus = 'active') {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/sys_dictionary?*', (route) =>
    route.fulfill({
      json: ['active', 'probation'].map((value) => ({
        name: value,
        code: 'hrEmploymentStatus',
        status: '1',
        value,
        label: value === 'active' ? '在职' : '试用期'
      }))
    })
  )
  let deleted = false
  let references: 'clear' | 'blocked' | 'assignment' | 'requisition' | 'error' = 'clear'
  let deleteResult: 'success' | 'concurrent-employee' = 'success'
  const events: string[] = []

  await page.route('**/rest/v1/rpc/hr_list_position_organization_scope_secure**', (route) =>
    route.fulfill({
      json: [
        {
          id: '77777777-7777-4777-8777-777777777777',
          tenant_id: 'permission-test-tenant',
          organization_name: '测试部门',
          organization_code: 'DEPT',
          organization_type: 'department',
          parent_id: null,
          scope_count: 1
        }
      ]
    })
  )
  await page.route('**/rest/v1/rpc/hr_list_positions_secure**', (route) =>
    route.fulfill({
      json: {
        records: deleted
          ? []
          : [
              {
                id: positionId,
                tenant_id: 'permission-test-tenant',
                organization_id: '77777777-7777-4777-8777-777777777777',
                position_code: 'POS-001',
                position_name: '司机',
                description: '负责车辆运输',
                employee_count: employeeCount,
                enabled: true,
                headcount_limit: 2,
                sort: 10,
                create_time: '2026-10-01T00:00:00Z'
              }
            ],
        total: deleted ? 0 : 1
      }
    })
  )
  await page.route('**/rest/v1/rpc/hr_list_employee_organization_scope_secure**', (route) =>
    route.fulfill({ json: [] })
  )
  await page.route('**/rest/v1/rpc/hr_list_employees_secure**', (route) => {
    const recordId = route.request().postDataJSON()?.p_record_id
    return route.fulfill({
      json: {
        records:
          recordId === employeeId
            ? [
                {
                  id: employeeId,
                  employee_no: 'EMP-001',
                  employee_name: '张三',
                  employment_status: 'probation',
                  tenant_id: 'permission-test-tenant'
                }
              ]
            : [],
        total: recordId === employeeId ? 1 : 0,
        field_access: {}
      }
    })
  })
  await page.route('**/rest/v1/rpc/hr_list_recruitment_records_secure**', (route) => {
    const payload = route.request().postDataJSON()
    const found = payload.p_kind === 'requisition' && payload.p_keyword === 'HRRQ-001'
    return route.fulfill({
      json: {
        records: found
          ? [
              {
                id: requisitionId,
                requisition_no: 'HRRQ-001',
                status: 'draft',
                opening_count: 1,
                hired_count: 0,
                position: { position_name: '司机' },
                tenant_id: 'permission-test-tenant'
              }
            ]
          : [],
        total: found ? 1 : 0,
        sensitive_access: false
      }
    })
  })
  await page.route('**/rest/v1/rpc/hr_recruitment_overview_secure**', (route) =>
    route.fulfill({ json: {} })
  )
  await page.route('**/rest/v1/sys_tenant**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/rpc/hr_get_position_delete_dependencies_secure**', (route) => {
    events.push('inspect')
    expect(route.request().postDataJSON()).toMatchObject({
      p_ids: [positionId]
    })
    if (references === 'error')
      return route.fulfill({ status: 403, json: { code: '42501', message: 'permission denied' } })
    return route.fulfill({
      json:
        references === 'blocked'
          ? [
              {
                resourceId: positionId,
                sourceTable: 'mdm_employee',
                recordId: `mdm_employee:${employeeId}`,
                targetId: employeeId,
                recordNo: 'EMP-001',
                recordSummary: '张三 · 测试部门',
                recordStatus: employeeStatus,
                createdAt: '2026-10-01T00:00:00Z'
              }
            ]
          : references === 'assignment'
            ? [
                {
                  resourceId: positionId,
                  sourceTable: 'mdm_employee_assignment',
                  recordId: 'mdm_employee_assignment:aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
                  targetId: employeeId,
                  recordNo: 'EMP-001',
                  recordSummary: '张三',
                  recordStatus: 'probation',
                  createdAt: '2026-10-01T00:00:00Z'
                }
              ]
            : references === 'requisition'
              ? [
                  {
                    resourceId: positionId,
                    sourceTable: 'hr_recruitment_requisition',
                    recordId: `hr_recruitment_requisition:${requisitionId}`,
                    targetId: requisitionId,
                    recordNo: 'HRRQ-001',
                    recordSummary: '司机',
                    recordStatus: 'draft',
                    createdAt: '2026-10-01T00:00:00Z'
                  }
                ]
              : []
    })
  })
  await page.route('**/rest/v1/rpc/hr_delete_position_secure**', (route) => {
    events.push('delete')
    expect(route.request().postDataJSON()).toMatchObject({ p_id: positionId })
    if (deleteResult === 'concurrent-employee') {
      references = 'blocked'
      return route.fulfill({
        status: 400,
        json: { code: 'P0001', message: '该岗位已有员工使用，请先调整员工岗位' }
      })
    }
    deleted = true
    return route.fulfill({ json: true })
  })
  await page.goto('/tests/e2e/fixtures/hr-delete-workflows.html')
  await expect(page.getByText('司机', { exact: true }).first()).toBeVisible()

  return {
    events,
    setReferences: (value: 'clear' | 'blocked' | 'assignment' | 'requisition' | 'error') =>
      (references = value),
    setDeleteResult: (value: 'success' | 'concurrent-employee') => (deleteResult = value)
  }
}

const deleteButton = (page: Page) =>
  page.locator('.el-table__body-wrapper').getByRole('button', { name: '删除', exact: true })

test('有在岗员工时仍可发起删除检查，关联记录阻止删除并可导航', async ({ page }, testInfo) => {
  const state = await setupPositionPage(page, 1)
  state.setReferences('blocked')
  if (!testInfo.project.name.startsWith('mobile')) {
    await expect
      .poll(() =>
        page
          .locator('main.art-page-view')
          .evaluate((element) => element.scrollHeight - element.clientHeight)
      )
      .toBeLessThanOrEqual(1)
  }
  await expect(deleteButton(page)).toBeEnabled()
  await deleteButton(page).click()
  const dialog = page.getByRole('dialog', { name: '暂时无法删除岗位' })
  await expect(dialog).toContainText('EMP-001')
  await expect(dialog).toContainText('员工档案')
  await expect(dialog).toContainText('在职')
  await expect(dialog).not.toContainText('有效')
  expect(state.events).toEqual(['inspect'])
  await page.screenshot({
    path: testInfo.outputPath('position-reference-blocked.png'),
    fullPage: true,
    animations: 'disabled'
  })
  await dialog.getByRole('button', { name: '查看关联' }).click()
  await expect(page.getByTestId('navigation-path')).toHaveText(
    `/hr/personnel/employee-detail/${employeeId}`
  )
})

test('岗位任职引用跳转到员工花名册并定位员工，显示返回入口', async ({ page }, testInfo) => {
  const state = await setupPositionPage(page, 1)
  state.setReferences('assignment')
  await deleteButton(page).click()
  const dialog = page.getByRole('dialog', { name: '暂时无法删除岗位' })
  await expect(dialog).toContainText('EMP-001')
  await expect(dialog).toContainText('张三')
  await expect(dialog).toContainText('试用期')
  await dialog.getByRole('button', { name: '查看关联' }).click()
  await expect(page.getByTestId('navigation-path')).toHaveText('/hr/personnel/employee-roster')
  await expect(page.getByText('正在处理“司机（POS-001）”的删除前置资料')).toBeVisible()
  await expect(page.getByText('张三')).toBeVisible()
  await expect(
    page.locator('.el-table__body-wrapper').getByText('EMP-001', { exact: true })
  ).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('position-assignment-roster.png'),
    fullPage: true,
    animations: 'disabled'
  })
  await page.getByRole('button', { name: '返回岗位管理' }).click()
  await expect(page.getByTestId('navigation-path')).toHaveText('/hr/personnel/position')
})

for (const mode of ['missing-dictionary', 'unknown-value'] as const)
  test(`员工引用状态安全降级：${mode}`, async ({ page }) => {
    const state = await setupPositionPage(
      page,
      1,
      mode === 'unknown-value' ? 'unrecognized_employment_status' : 'active'
    )
    if (mode === 'missing-dictionary')
      await page.route('**/rest/v1/sys_dictionary?*', (route) => route.fulfill({ json: [] }))
    state.setReferences('blocked')
    await deleteButton(page).click()
    const dialog = page.getByRole('dialog', { name: '暂时无法删除岗位' })
    await expect(dialog).toContainText('状态待核对')
    await expect(dialog).not.toContainText('unrecognized_employment_status')
    await expect(dialog).not.toContainText('active')
    expect(state.events).toEqual(['inspect'])
  })

test('招聘需求引用跳转到对应标签并按编号找到记录', async ({ page }) => {
  const state = await setupPositionPage(page, 0)
  state.setReferences('requisition')
  await deleteButton(page).click()
  const dialog = page.getByRole('dialog', { name: '暂时无法删除岗位' })
  await expect(dialog).toContainText('HRRQ-001')
  await dialog.getByRole('button', { name: '查看关联' }).click()
  await expect(page.getByTestId('navigation-path')).toHaveText('/hr/recruitment/workbench')
  await expect(page.getByText('正在处理“司机（POS-001）”的删除前置资料')).toBeVisible()
  await expect(
    page.locator('.el-table__body-wrapper').getByText('HRRQ-001', { exact: true })
  ).toBeVisible()
  await expect(page.getByText('已找到关联记录')).toBeVisible()
})

test('员工引用字典请求失败无未处理异常，重新检查后恢复状态', async ({ page }, testInfo) => {
  const state = await setupPositionPage(page, 1)
  const errors: string[] = []
  page.on('pageerror', (error) => {
    if (!error.message.includes('ResizeObserver')) errors.push(error.message)
  })
  let dictionaryFailed = true
  let dictionaryRequests = 0
  await page.route('**/rest/v1/sys_dictionary?*', (route) => {
    if (!route.request().url().includes('hrEmploymentStatus')) return route.fallback()
    dictionaryRequests += 1
    return dictionaryFailed
      ? route.fulfill({ status: 403, json: { code: '42501', message: 'permission denied' } })
      : route.fulfill({
          json: [{ code: 'hrEmploymentStatus', value: 'active', label: '在职', status: '1' }]
        })
  })
  state.setReferences('blocked')
  await deleteButton(page).click()
  const dialog = page.getByRole('dialog', { name: '暂时无法删除岗位' })
  await expect(dialog).toContainText('状态待核对')
  await expect(page.locator('.el-message--error')).toHaveCount(1)
  await expect(page.locator('.el-message--error')).not.toContainText('permission denied')
  await page.screenshot({
    path: testInfo.outputPath('dictionary-error.png'),
    animations: 'disabled'
  })
  dictionaryFailed = false
  await dialog.getByRole('button', { name: '重新检查', exact: true }).click()
  await expect(dialog).toContainText('在职')
  expect(dictionaryRequests).toBe(2)
  expect(errors).toEqual([])
  expect(state.events).toEqual(['inspect', 'inspect'])
})

test('检查失败阻断删除；无引用时确认后删除', async ({ page }) => {
  const state = await setupPositionPage(page, 0)
  state.setReferences('error')
  await deleteButton(page).click()
  await expect(page.getByRole('alert')).toContainText('关联资料未完成核验')
  expect(state.events).toEqual(['inspect'])
  state.setReferences('clear')
  await page.getByRole('button', { name: '重新检查', exact: true }).click()
  await deleteButton(page).click()
  await expect(page.locator('.el-message-box')).toContainText('确认删除岗位')
  await page.locator('.el-message-box').getByRole('button', { name: '删除', exact: true }).click()
  await expect(page.getByText('司机', { exact: true })).toHaveCount(0)
  expect(state.events).toEqual(['inspect', 'inspect', 'inspect', 'delete'])
})

test('确认后新增员工引用时重新检查并显示关联', async ({ page }) => {
  const state = await setupPositionPage(page, 0)
  state.setDeleteResult('concurrent-employee')
  await deleteButton(page).click()
  await page.locator('.el-message-box').getByRole('button', { name: '删除', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '暂时无法删除岗位' })
  await expect(dialog).toContainText('EMP-001')
  await expect(page.getByText('司机', { exact: true }).first()).toBeVisible()
  expect(state.events).toEqual(['inspect', 'delete', 'inspect'])
})
