import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('风险巡查执行表单保留输入并在重开时恢复服务端数据', async ({ page }, testInfo) => {
  const tenant = await prepareIsolatedSession(page)
  const path = '/smis/dual-control-system/risk-control/risk-inspection-task'
  const menu = {
    id: 'task-form-test',
    parentId: null,
    name: 'SmisDualControlRiskInspectionTask',
    path,
    component: path,
    type: 'menu',
    sort: 1,
    meta: { title: '风险巡查任务', is_enable: true, is_hide: false, roles: [] }
  }
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({ json: [{ code: 'smis', name: '测试安全管理', baseUrl: '/smis/' }] })
  )
  await mockApplicationMenus(page, {
    smis: [
      menu,
      ...['View', 'Execute'].map((action) => ({
        ...menu,
        id: `${menu.id}-${action}`,
        parentId: menu.id,
        name: `${menu.name}:${action}`,
        path: '',
        component: '',
        type: 'button'
      }))
    ]
  })
  const task = {
    id: 'task-test',
    tenantId: tenant.id,
    taskNo: 'TASK-TEST',
    status: 'not_started',
    riskPointName: '测试风险点',
    riskPointNo: 'POINT-TEST',
    riskPointType: 'location',
    riskLevelName: '低风险',
    controlLevel: 'company',
    responsibleEmployeeName: '测试责任人',
    assigneeEmployeeId: 'employee-test',
    assigneeEmployeeName: '测试执行人',
    assigneeEmployeeNo: 'EMP-TEST',
    actualExecutorEmployeeId: null,
    actualExecutorEmployeeName: null,
    plannedStartAt: '2026-10-01T08:00:00',
    plannedEndAt: '2026-10-01T18:00:00',
    completedItemCount: 0,
    itemCount: 1,
    abnormalCount: 0,
    executionSummary: '已有执行总结',
    attachmentUrls: [],
    events: [],
    items: [
      {
        id: 'item-test',
        result: 'pending',
        remark: '',
        attachmentUrls: [],
        hazardSource: '测试危险源',
        hazardNo: 'RISK-TEST',
        inspectionContent: '检查测试设备'
      }
    ]
  }
  await page.route('**/rest/v1/rpc/smis_list_risk_inspection_tasks_secure', (route) =>
    route.fulfill({
      json: {
        records: [task],
        total: 1,
        overview: { total: 1, notStarted: 1, inProgress: 0, overdue: 0, completed: 0 }
      }
    })
  )
  await page.route('**/rest/v1/rpc/smis_get_risk_inspection_task_secure', (route) =>
    route.fulfill({ json: task })
  )
  let parentFailure = true
  await page.route('**/rest/v1/smis_risk_inspection_task?*', (route) => {
    expect(new URL(route.request().url()).searchParams.get('id')).toBe('eq.task-test')
    if (parentFailure)
      return route.fulfill({
        status: 503,
        json: { code: 'PGRST000', message: 'Connection unavailable' }
      })
    return route.fulfill({ json: { tenant_id: tenant.id } })
  })
  await page.goto(`#${path}`)
  await expect(page.getByRole('heading', { name: '风险巡查任务', exact: true })).toBeVisible({
    timeout: 60_000
  })
  const execute = page
    .locator('.el-table__body-wrapper')
    .getByRole('button', { name: '执行', exact: true })
    .first()
  await execute.click()
  const dialog = page.getByRole('dialog')
  const summary = dialog.getByLabel('执行总结', { exact: true })
  await expect(dialog.getByText('巡查任务加载失败', { exact: true })).toBeVisible()
  await expect(summary).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: '保存进度', exact: true })).toBeDisabled()
  await expect(dialog.getByRole('button', { name: '提交并完成', exact: true })).toBeDisabled()
  await dialog.screenshot({ path: testInfo.outputPath('execution-error.png') })
  parentFailure = false
  await dialog.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(summary).toHaveValue('已有执行总结')
  await expect(dialog.getByText('先选择租户', { exact: true })).toHaveCount(0)
  await summary.fill('测试更新总结')
  await expect(summary).toHaveValue('测试更新总结')
  await dialog.getByRole('radio', { name: '异常', exact: true }).locator('..').click()
  await expect(dialog.locator('.task-execution-dialog__item')).toHaveAttribute(
    'data-result',
    'abnormal'
  )
  const remark = dialog.getByPlaceholder('填写检查说明；异常项请描述问题位置、现象与处置建议')
  await remark.fill('测试异常说明')
  await expect(remark).toHaveValue('测试异常说明')
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  ).toBeLessThanOrEqual(1)
  await dialog.screenshot({ path: testInfo.outputPath('execution-form.png') })
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  parentFailure = true
  await page
    .locator('.el-table__body-wrapper')
    .getByRole('button', { name: '详情', exact: true })
    .first()
    .click()
  const drawer = page.getByRole('dialog')
  await expect(drawer.getByText('巡查任务加载失败', { exact: true })).toBeVisible()
  await expect(drawer.locator('.task-detail-drawer')).toHaveCount(0)
  await drawer.screenshot({ path: testInfo.outputPath('task-detail-error.png') })
  parentFailure = false
  await drawer.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(
    drawer.locator('.task-detail-drawer__status').getByText('TASK-TEST', { exact: true })
  ).toBeVisible()
  await drawer.screenshot({ path: testInfo.outputPath('task-detail.png') })
  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()
  await execute.click()
  await expect(summary).toHaveValue('已有执行总结')
  await expect(remark).toHaveValue('')
  await expect(dialog.locator('.task-execution-dialog__item')).toHaveAttribute(
    'data-result',
    'pending'
  )
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
})
