import { expect, test, type Page } from '@playwright/test'
import { mockApplicationMenus } from './support/menu-rpc'

const meta = (title: string, icon = 'ri:dashboard-3-line') => ({
  title,
  icon,
  roles: ['R_SUPER'],
  is_hide: false,
  is_enable: true,
  keep_alive: true
})

const pages = [
  ['department', 'MdmProductionDepartment', '/mdm/production/department', '部门 / 产线'],
  ['personnel', 'MdmProductionPersonnel', '/mdm/production/personnel', '人员配置'],
  ['calendar', 'MdmFactoryCalendar', '/mdm/production/calendar', '工厂日历'],
  ['shift-scheduling', 'MdmShiftScheduling', '/mdm/production/shift-scheduling', '排班管理'],
  ['operation-template', 'MdmOperationTemplate', '/mdm/production/operation-template', '作业模板'],
  ['work-center', 'MdmWorkCenter', '/mdm/production/work-center', '工作中心'],
  [
    'personnel-work-center',
    'MdmPersonnelWorkCenter',
    '/mdm/production/personnel-work-center',
    '人员/工作中心配置'
  ],
  ['process-route', 'MdmProcessRoute', '/mdm/production/process-route', '工艺路线']
] as const

async function installFixtures(page: Page) {
  const root = {
    id: 'visual-mdm-root',
    parentId: null,
    name: 'MdmRoot',
    path: '/mdm',
    component: '/index/index',
    type: 'folder',
    sort: 1,
    meta: meta('MDM主数据', 'ri:database-2-line')
  }
  const production = {
    id: 'visual-production-root',
    parentId: root.id,
    name: 'MdmProduction',
    path: 'production',
    component: '',
    type: 'folder',
    sort: 1,
    meta: meta('生产主数据', 'ri:tools-line')
  }
  const children = pages.map(([path, name, component, title], index) => ({
    id: `visual-${path}`,
    parentId: production.id,
    name,
    path,
    component,
    type: 'menu',
    sort: index + 1,
    meta: meta(title)
  }))
  await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: true }))
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({ json: [{ code: 'platform', name: '测试平台', baseUrl: '/' }] })
  )
  await mockApplicationMenus(page, { platform: [root, production, ...children] })

  const department = {
    id: '00000000-0000-4000-8000-000000000101',
    tenant_id: '00000000-0000-4000-8000-000000000001',
    organization_id: null,
    parent_id: null,
    code: 'LINE-01',
    name: '总装一线',
    kind: '产线',
    factory: '华东工厂',
    sort: 1,
    text_color: '',
    tag_type: 'primary',
    enabled: true,
    remark: ''
  }
  const responses: Record<string, unknown> = {
    mdm_production_department: [department],
    mdm_production_personnel: [
      {
        id: '00000000-0000-4000-8000-000000000201',
        tenant_id: department.tenant_id,
        department_id: department.id,
        employee_id: null,
        name: '张明',
        employee_no: 'P-001',
        barcode: 'P-001',
        phone: '13800000000',
        work_type: '正式工',
        job_title: '装配技师',
        trade: '装配',
        gender: '男',
        hire_date: '2024-01-01',
        avatar_url: '',
        permission_department_ids: [],
        sort: 1,
        text_color: '',
        tag_type: 'primary',
        enabled: true,
        remark: '',
        department
      }
    ],
    mdm_work_center: [
      {
        id: '00000000-0000-4000-8000-000000000301',
        tenant_id: department.tenant_id,
        code: 'WC-ASSY-01',
        name: '总装工作中心',
        department_id: department.id,
        department,
        operation_control_code_id: null,
        operation_control_code: null,
        main_center_id: null,
        main_center: null,
        personnel_mode: '指定人数',
        headcount: 8,
        person_ids: [],
        policy: {},
        sort: 1,
        remark: '',
        qr_token: 'WC-ASSY-01',
        create_by: '',
        create_time: '2026-09-01T08:00:00Z',
        update_time: '2026-09-01T08:00:00Z'
      }
    ],
    mdm_operation_template: [
      {
        id: '00000000-0000-4000-8000-000000000401',
        tenant_id: department.tenant_id,
        name: '总装检验模板',
        items: [
          {
            name: '外观检查',
            category: '质量',
            inputMode: '确认',
            requirement: '无缺陷',
            score: 10,
            choices: []
          }
        ],
        total_score: 10,
        sort: 1,
        text_color: '',
        tag_type: 'primary',
        enabled: true,
        create_by: '',
        create_time: '2026-09-01T08:00:00Z',
        update_time: '2026-09-01T08:00:00Z'
      }
    ],
    mdm_production_shift_pattern: [],
    mdm_production_calendar: [],
    mdm_production_calendar_reminder: null
  }
  await page.route('**/rest/v1/mdm_*', async (route) => {
    const table = new URL(route.request().url()).pathname.split('/').at(-1) || ''
    const body = responses[table] ?? []
    await route.fulfill({
      headers: {
        'content-range':
          Array.isArray(body) && body.length ? `0-${body.length - 1}/${body.length}` : '*/0'
      },
      json: body
    })
  })
  await page.route('**/rest/v1/rpc/mdm_production_reference_list', async (route) => {
    const kind = (route.request().postDataJSON() as { p_kind?: string }).p_kind
    await route.fulfill({
      json:
        kind === 'routes'
          ? {
              records: [
                {
                  id: '00000000-0000-4000-8000-000000000501',
                  tenant_id: department.tenant_id,
                  material_id: '00000000-0000-4000-8000-000000000502',
                  name: '标准装配工艺',
                  material: {
                    id: '00000000-0000-4000-8000-000000000502',
                    material_code: 'MAT-001',
                    material_name: '成品组件',
                    specification_model: 'A 型'
                  },
                  create_by: '',
                  create_time: '2026-09-01T08:00:00Z',
                  update_time: '2026-09-01T08:00:00Z'
                }
              ],
              total: 1
            }
          : { records: [], total: 0 }
    })
  })
  await page.route('**/rest/v1/rpc/mdm_work_center_activities', (route) =>
    route.fulfill({ json: [] })
  )
  await page.route('**/rest/v1/rpc/mdm_work_center_reference_options', async (route) => {
    const kind = (route.request().postDataJSON() as { p_kind?: string }).p_kind
    await route.fulfill({
      json:
        kind === 'activity_formula'
          ? {
              records: [
                {
                  id: '00000000-0000-4000-8000-000000000801',
                  code: 'AF-001',
                  name: '标准机器活动',
                  activity_type: 'machine',
                  plan_expression: '批量 × 标准工时',
                  report_expression: '良品数 × 标准工时'
                }
              ],
              total: 1
            }
          : { records: [], total: 0 }
    })
  })
  await page.route('**/rest/v1/rpc/mdm_list_personnel_common_work_centers', async (route) => {
    const body = route.request().postDataJSON() as { p_only_unconfigured?: boolean }
    const person = {
      id: '00000000-0000-4000-8000-000000000201',
      tenantId: department.tenant_id,
      departmentId: department.id,
      department: { id: department.id, name: department.name, code: department.code },
      name: '张明',
      employeeNo: 'P-001',
      phone: '13800000000',
      jobTitle: '装配技师',
      avatarUrl: '',
      commonWorkCenters: body.p_only_unconfigured
        ? []
        : [
            {
              id: '00000000-0000-4000-8000-000000000301',
              code: 'WC-ASSY-01',
              name: '总装工作中心',
              departmentId: department.id,
              departmentName: department.name
            }
          ]
    }
    await route.fulfill({ json: { records: [person], total: 1 } })
  })
  await page.route('**/rest/v1/rpc/mdm_save_personnel_common_work_centers', (route) =>
    route.fulfill({ json: 1 })
  )
  await page.route('**/rest/v1/rpc/mdm_delete_personnel_common_work_centers', (route) =>
    route.fulfill({ json: 1 })
  )
  await page.route('**/rest/v1/rpc/mdm_list_shift_schedule_departments_secure', (route) =>
    route.fulfill({ json: [department] })
  )
  await page.route('**/rest/v1/rpc/mdm_list_shift_schedule_patterns_secure', (route) =>
    route.fulfill({
      json: [
        {
          id: '00000000-0000-4000-8000-000000000601',
          tenantId: department.tenant_id,
          departmentId: department.id,
          name: '两班轮换',
          description: '白班与夜班轮换',
          sort: 1,
          color: '#5b5bd6',
          shifts: [
            { name: '白班', startTime: '08:00', endTime: '17:00' },
            { name: '夜班', startTime: '20:00', endTime: '05:00' }
          ]
        }
      ]
    })
  )
  await page.route('**/rest/v1/rpc/mdm_list_shift_schedules_secure', (route) =>
    route.fulfill({
      json: [
        {
          id: '00000000-0000-4000-8000-000000000701',
          tenantId: department.tenant_id,
          departmentId: department.id,
          patternId: '00000000-0000-4000-8000-000000000601',
          patternName: '两班轮换',
          patternColor: '#5b5bd6',
          shiftIndex: 1,
          shiftName: '白班',
          shiftStartTime: '08:00',
          shiftEndTime: '17:00',
          dateMode: 'single',
          startDate: '2026-09-15',
          endDate: '2026-09-15',
          note: '总装一线试排',
          memberCount: 1,
          members: [
            {
              id: '00000000-0000-4000-8000-000000000201',
              tenantId: department.tenant_id,
              departmentId: department.id,
              employeeName: '张明',
              employeeNo: 'P-001',
              phone: '13800000000',
              jobTitle: '装配技师',
              avatarUrl: '',
              employmentStatus: 'active',
              organization: {
                id: department.id,
                organizationCode: department.code,
                organizationName: department.name
              }
            }
          ],
          createTime: '2026-09-01T08:00:00Z',
          updateTime: '2026-09-01T08:00:00Z'
        }
      ]
    })
  )
  await page.route('**/rest/v1/rpc/mdm_list_shift_schedule_people_secure', (route) =>
    route.fulfill({
      json: {
        records: [
          {
            id: '00000000-0000-4000-8000-000000000201',
            tenantId: department.tenant_id,
            departmentId: department.id,
            employeeName: '张明',
            employeeNo: 'P-001',
            phone: '13800000000',
            jobTitle: '装配技师',
            avatarUrl: '',
            employmentStatus: 'active',
            organization: {
              id: department.id,
              organizationCode: department.code,
              organizationName: department.name
            }
          }
        ],
        total: 1
      }
    })
  )
}

test('production master-data workspaces share the SMIS visual system', async ({
  page
}, testInfo) => {
  test.setTimeout(180_000)
  await installFixtures(page)
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  const selectedPages = process.env.MDM_E2E_PAGE
    ? pages.filter(([path]) => path === process.env.MDM_E2E_PAGE)
    : pages
  for (const [path, , , title] of selectedPages) {
    await page.goto(`#/mdm/production/${path}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible({
      timeout: 60_000
    })
    await expect(page.locator('.el-loading-mask:visible')).toHaveCount(0, { timeout: 60_000 })
    const guide = page.getByRole('button', { name: '知道了', exact: true })
    if (await guide.isVisible()) await guide.click()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
    ).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`${path}.png`), animations: 'disabled' })
    if (path === 'department') {
      await page.getByRole('button', { name: '新增部门', exact: true }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByText('新增部门 / 产线', { exact: true })).toBeVisible()
      await expect(dialog.getByText('组织映射', { exact: true })).toBeVisible()
      await expect(dialog.locator('.el-dialog__footer .el-button svg')).toHaveCount(0)
      await page.screenshot({
        path: testInfo.outputPath('department-dialog.png'),
        animations: 'disabled'
      })
      await dialog.getByRole('button', { name: '取消', exact: true }).click()
    }
    if (path === 'operation-template') {
      await page.getByRole('button', { name: '新增模板', exact: true }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByText('作业任务', { exact: true })).toBeVisible()
      const copyTask = dialog.getByRole('button', { name: '复制任务项 1', exact: true })
      const deleteTask = dialog.getByRole('button', { name: '删除任务项 1', exact: true })
      await expect(copyTask).toBeVisible()
      await expect(deleteTask).toBeVisible()
      const copyBounds = await copyTask.boundingBox()
      const deleteBounds = await deleteTask.boundingBox()
      expect(copyBounds).not.toBeNull()
      expect(deleteBounds).not.toBeNull()
      expect(Math.abs(copyBounds!.y - deleteBounds!.y)).toBeLessThan(2)
      await expect(dialog.locator('.el-dialog__footer .el-button svg')).toHaveCount(0)
      await page.screenshot({
        path: testInfo.outputPath('operation-template-dialog.png'),
        animations: 'disabled'
      })
      await dialog.getByRole('button', { name: '取消', exact: true }).click()
    }
    if (path === 'shift-scheduling') {
      await expect(page.getByRole('button', { name: /白班.*1人/ })).toBeVisible()
      await page.getByRole('button', { name: '新增排班', exact: true }).first().click()
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByText('班次安排', { exact: true })).toBeVisible()
      await expect(dialog.getByText('班组人员', { exact: true })).toBeVisible()
      await expect(dialog.getByText('单个日期', { exact: true })).toBeVisible()
      expect(
        await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
      ).toBe(true)
      await page.screenshot({
        path: testInfo.outputPath('shift-scheduling-dialog.png'),
        animations: 'disabled'
      })
      await dialog.locator('.art-data-select__multiple-input').click()
      const peopleDialog = page.getByRole('dialog').filter({ hasText: '添加班组人员' }).last()
      await expect(peopleDialog.getByText('张明', { exact: true })).toBeVisible()
      await expect(peopleDialog.getByText('总装一线', { exact: true })).toBeVisible()
      await page.screenshot({
        path: testInfo.outputPath('shift-scheduling-people-dialog.png'),
        animations: 'disabled'
      })
      await peopleDialog.getByRole('button', { name: '取消', exact: true }).click()
      await dialog.getByRole('button', { name: '取消', exact: true }).click()
      await page.getByText('班表视图', { exact: true }).click()
      await expect(page.getByText('两班轮换', { exact: true })).toBeVisible()
    }
    if (path === 'work-center') {
      await expect(page.getByText('总装工作中心', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: '新增工作中心', exact: true }).click()
      const dialog = page.getByRole('dialog').first()
      await expect(dialog.getByText('工作中心资料', { exact: true })).toBeVisible()
      await dialog.getByRole('tab', { name: '活动信息', exact: true }).click()
      await expect(dialog.getByText('暂无活动信息', { exact: true })).toBeVisible()
      await dialog.getByRole('button', { name: '新增', exact: true }).click()
      await expect(dialog.getByRole('columnheader', { name: '活动名称' })).toBeVisible()
      await expect(dialog.getByRole('columnheader', { name: '计划活动量公式' })).toBeVisible()
      await expect(dialog.getByRole('columnheader', { name: '汇报活动量公式' })).toBeVisible()
      await dialog.getByRole('tab', { name: '自动化', exact: true }).click()
      await expect(
        dialog.getByText('自动化采用独立编辑，避免在查看策略时误改触发条件。')
      ).toBeVisible()
      await expect(dialog.getByRole('button', { name: '配置自动化', exact: true })).toBeVisible()
      await expect(dialog.locator('.el-dialog__footer .el-button svg')).toHaveCount(0)
      await page.screenshot({
        path: testInfo.outputPath('work-center-automation-tab.png'),
        animations: 'disabled'
      })
      await dialog.getByRole('button', { name: '取消', exact: true }).click()
    }
    if (path === 'personnel-work-center') {
      await expect(page.getByText('张明', { exact: true })).toBeVisible()
      await expect(page.getByText('WC-ASSY-01 · 总装工作中心', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: '新增配置', exact: true }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await expect(page.getByText('工作中心范围：全部部门与产线', { exact: true })).toBeVisible()
      await page.screenshot({
        path: testInfo.outputPath('personnel-work-center-dialog.png'),
        animations: 'disabled'
      })
      await page.getByRole('button', { name: '取消', exact: true }).click()
      await page
        .getByRole('switch', { name: '进入专注模式', exact: true })
        .evaluate((element: HTMLInputElement) => element.click())
      await expect(page.locator('.business-workspace-header')).toBeHidden()
      await expect(page.locator('.production-tree')).toBeVisible()
      await expect(page.getByText('张明', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: '退出专注模式', exact: true }).click()
      await expect(page.locator('.business-workspace-header')).toBeVisible()
      await page
        .getByRole('switch', { name: '进入专注模式', exact: true })
        .evaluate((element: HTMLInputElement) => element.click())
      await page.keyboard.press('Escape')
      await expect(page.locator('.business-workspace-header')).toBeVisible()
    }
    if (path === 'process-route') {
      await page.getByRole('button', { name: '新增路线', exact: true }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByText('新工艺路线', { exact: true })).toBeVisible()
      await expect(dialog.getByText('路线识别', { exact: true })).toBeVisible()
      await expect(dialog.getByText('策略与状态', { exact: true })).toBeVisible()
      const enabledStatus = dialog.locator('.el-form-item').filter({ hasText: '启用状态' })
      await expect(enabledStatus.getByText('是', { exact: true })).toBeVisible()
      await expect(enabledStatus.getByText('否', { exact: true })).toBeVisible()
      expect(
        await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
      ).toBe(true)
      await page.screenshot({
        path: testInfo.outputPath('process-route-dialog.png'),
        animations: 'disabled'
      })
      await dialog.getByRole('button', { name: '取消', exact: true }).click()
    }
  }

  expect(pageErrors).toEqual([])
})
