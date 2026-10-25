import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const scenario of [
  { feature: 'learning', entity: 'plan', title: '新增培训计划', kinds: [] },
  { feature: 'learning', entity: 'session', title: '新增培训班次', kinds: ['plan', 'course'] },
  { feature: 'performance', entity: 'cycle', title: '新增绩效周期', kinds: [] },
  { feature: 'performance', entity: 'review', title: '新增员工考核', kinds: ['cycle'] },
  { feature: 'succession', entity: 'plan', title: '新增继任计划', kinds: ['position'] },
  { feature: 'compensation', entity: 'component', title: '新增薪酬项目', kinds: [] },
  { feature: 'compensation', entity: 'plan', title: '新增薪酬方案', kinds: ['component'] },
  { feature: 'compensation', entity: 'band', title: '新增薪级范围', kinds: ['grade'] },
  { feature: 'absence', entity: 'type', title: '新增假别', kinds: [] },
  { feature: 'absence', entity: 'request', title: '新增休假申请', kinds: ['leave_type'] },
  {
    feature: 'absence',
    entity: 'policy',
    title: '新增休假政策',
    kinds: ['leave_type', 'grade']
  },
  {
    feature: 'mobility',
    entity: 'opportunity',
    title: '新增内部机会',
    kinds: ['position']
  },
  { feature: 'lifecycle', entity: 'template', title: '新增标准任务包', kinds: [] },
  { feature: 'lifecycle', entity: 'task', title: '新增执行任务', kinds: ['case'] },
  { feature: 'attendance', entity: 'shift', title: '新增班次规则', kinds: [] },
  { feature: 'attendance', entity: 'record', title: '新增日考勤记录', kinds: ['shift'] },
  { feature: 'attendance', entity: 'correction', title: '新增考勤修正单', kinds: ['record'] },
  { feature: 'planning', entity: 'cycle', title: '新增规划周期', kinds: [] },
  {
    feature: 'planning',
    entity: 'line',
    title: '新增岗位需求',
    kinds: ['plan', 'position']
  }
]) {
  test(`${scenario.title} 只加载本表单所需关联数据`, async ({ page }, testInfo) => {
    await prepareIsolatedSession(page)
    await page.setViewportSize({ width: 570, height: 900 })
    const kinds: string[] = []
    await page.route('**/rest/v1/**', (route) => {
      if (
        route.request().url().includes('_options_secure') &&
        route.request().postDataJSON()?.p_kind
      ) {
        const kind = route.request().postDataJSON().p_kind
        kinds.push(kind)
        if (!scenario.kinds.includes(kind))
          return route.fulfill({
            status: 403,
            json: { code: '42501', message: 'permission denied' }
          })
      }
      return route.fulfill({ json: [] })
    })
    await page.goto(
      `/tests/e2e/fixtures/hr-talent-dialogs.html?feature=${scenario.feature}&entity=${scenario.entity}`
    )
    const dialog = page.getByRole('dialog', { name: scenario.title, exact: true })
    await expect(dialog).toBeVisible()
    await expect(
      dialog.getByRole('button', {
        name:
          scenario.feature === 'mobility'
            ? '保存草稿'
            : scenario.feature === 'compensation'
              ? '创建草稿'
              : '创建记录'
      })
    ).toBeEnabled()
    expect(kinds.sort()).toEqual([...scenario.kinds].sort())
    await expect(dialog.getByText('加载失败', { exact: false })).toHaveCount(0)
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('add-dialog.png'), animations: 'disabled' })
    await dialog
      .locator('.art-dialog__scrollbar .el-scrollbar__wrap')
      .first()
      .evaluate((node) => {
        node.scrollTop = node.scrollHeight
      })
    await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeVisible()
    await page.screenshot({
      path: testInfo.outputPath('add-dialog-bottom.png'),
      animations: 'disabled'
    })
  })
}

test('继任负责人编辑回显可识别身份，窄屏可打开共享员工选择器', async ({ page }, testInfo) => {
  await prepareIsolatedSession(page)
  await page.setViewportSize({ width: 570, height: 900 })
  await page.route('**/rest/v1/**', (route) =>
    route.fulfill({
      json: route.request().url().includes('employee_selector') ? { records: [], total: 0 } : []
    })
  )
  await page.goto('/tests/e2e/fixtures/hr-talent-dialogs.html?feature=succession&edit=1')
  const dialog = page.getByRole('dialog', { name: '编辑继任计划', exact: true })
  const owner = dialog.getByRole('textbox', { name: '计划负责人' })
  await expect(owner).toHaveValue('测试负责人 · EMP-001')
  await expect(dialog.getByText('已停用测试岗位 · POSITION-OLD', { exact: true })).toBeVisible()
  expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0)
  await page.screenshot({
    path: testInfo.outputPath('succession-owner-narrow.png'),
    animations: 'disabled'
  })
  await owner.click()
  await expect(page.getByRole('dialog', { name: '选择员工', exact: true })).toBeVisible()
})

test('培训计划编辑保留当前记录租户中的负责人身份', async ({ page }) => {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.goto('/tests/e2e/fixtures/hr-talent-dialogs.html?feature=learning&edit=1')
  const dialog = page.getByRole('dialog', { name: '编辑培训计划', exact: true })
  await expect(dialog.getByRole('textbox', { name: '计划负责人' })).toHaveValue(
    '培训负责人 · EMP-TRAIN-001'
  )
  await expect(dialog.getByRole('button', { name: '保存更改' })).toBeEnabled()
})

test('员工服务工单重新分派保留处理人的姓名和工号', async ({ page }, testInfo) => {
  await prepareIsolatedSession(page)
  await page.setViewportSize({ width: 570, height: 900 })
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.goto('/tests/e2e/fixtures/hr-talent-dialogs.html?feature=assignment')
  const dialog = page.getByRole('dialog', { name: '分派员工服务工单', exact: true })
  await expect(dialog.getByRole('textbox', { name: '工单处理人' })).toHaveValue(
    '服务处理人 · EMP-SERVICE-001'
  )
  await expect(dialog.getByRole('button', { name: '更新分派', exact: true })).toBeEnabled()
  expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0)
  await page.screenshot({
    path: testInfo.outputPath('assignment-narrow.png'),
    animations: 'disabled'
  })
})

test('员工服务工单编辑保留申请员工的姓名和工号', async ({ page }, testInfo) => {
  await prepareIsolatedSession(page)
  await page.setViewportSize({ width: 570, height: 900 })
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.goto('/tests/e2e/fixtures/hr-talent-dialogs.html?feature=delivery')
  const dialog = page.getByRole('dialog', { name: '编辑服务工单', exact: true })
  await expect(dialog.getByText('已停用服务项目 · HR 服务台', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('textbox', { name: '申请员工' })).toHaveValue(
    '申请员工 · EMP-REQUEST-001'
  )
  expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0)
  await page.screenshot({
    path: testInfo.outputPath('delivery-narrow.png'),
    animations: 'disabled'
  })
})

for (const scenario of [
  { feature: 'succession', rpc: 'succession', label: '计划负责人', query: '&edit=1' },
  { feature: 'absence', rpc: 'absence', label: '员工', query: '&entity=request' },
  { feature: 'mobility', rpc: 'internal_mobility', label: '机会负责人', query: '' },
  { feature: 'lifecycle', rpc: 'lifecycle', label: '员工', query: '' },
  { feature: 'attendance', rpc: 'attendance', label: '员工', query: '' },
  { feature: 'performance', rpc: 'performance', label: '周期负责人', query: '&entity=cycle' }
]) {
  test(`${scenario.feature} 选人使用业务权限数据源，可显示已绑定账号员工`, async ({ page }) => {
    await prepareIsolatedSession(page)
    const employeeRequests: string[] = []
    await page.route('**/rest/v1/**', (route) => {
      const url = route.request().url()
      if (url.includes('employee_selector')) {
        employeeRequests.push('account-binding')
        return route.fulfill({ status: 403, json: { message: '禁止访问账号绑定选择器' } })
      }
      if (
        url.includes(`hr_list_${scenario.rpc}_options_secure`) &&
        route.request().postDataJSON().p_kind === 'employee'
      ) {
        employeeRequests.push(scenario.rpc)
        return route.fulfill({
          json: [
            {
              id: '55555555-5555-4555-8555-555555555555',
              tenant_id: '11111111-1111-4111-8111-111111111111',
              name: '已绑定员工',
              code: 'LINKED-001',
              job_title: '测试主管'
            }
          ]
        })
      }
      return route.fulfill({ json: [] })
    })
    await page.goto(
      `/tests/e2e/fixtures/hr-talent-dialogs.html?feature=${scenario.feature}${scenario.query}`
    )
    await page.getByRole('textbox', { name: scenario.label }).click()
    const picker = page.getByRole('dialog', { name: '选择员工', exact: true })
    await expect(picker.getByRole('cell', { name: '已绑定员工', exact: true })).toBeVisible()
    await expect(picker.getByRole('cell', { name: 'LINKED-001', exact: true })).toBeVisible()
    expect(employeeRequests).toEqual([scenario.rpc])
  })
}
