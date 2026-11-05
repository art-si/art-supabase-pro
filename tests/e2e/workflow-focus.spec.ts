import { expect, test, type Page } from '@playwright/test'
import { createWorkflowTemplateDraft } from '../../src/views/workflow/definition/modules/workflow-templates'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

const taskRows = Array.from({ length: 20 }, (_, index) => ({
  id: `focus-task-${index + 1}`,
  instance_id: `focus-instance-${index + 1}`,
  assignee_user_id: 'workflow-focus-user',
  status: 'pending',
  node_name: '部门审批',
  assignment_source: 'direct',
  create_time: '2026-11-01T09:00:00+08:00',
  due_at: index === 0 ? '2026-11-01T09:00:00+08:00' : '2026-11-04T09:00:00+08:00',
  instance: {
    id: `focus-instance-${index + 1}`,
    business_id: `focus-business-${index + 1}`,
    business_title:
      index === 0 ? '包含较长业务标题的测试审批单'.repeat(10) : `测试审批单 ${index + 1}`,
    business_type: 'general',
    initiator_name_snapshot: '测试发起人',
    definition: { name: '通用审批', code: 'GENERAL' }
  }
}))
const globalTaskRows = taskRows.map((task) => ({
  ...task,
  node_key: 'department-approval',
  node_order: 1,
  approval_mode: 'any',
  approval_threshold_percent: 100,
  reject_veto_enabled: true,
  assignee_name_snapshot: '测试审批人',
  original_assignee_user_id: 'workflow-focus-user',
  original_assignee_name_snapshot: '测试审批人',
  tenant_id: 'workflow-focus-tenant',
  tenant: { id: 'workflow-focus-tenant', tenant_name: '测试租户', tenant_code: 'TEST' },
  assignee_count: 2,
  pending_assignee_count: 1,
  assignee_names: task.id === 'focus-task-1' ? undefined : ['测试审批人', '测试同事']
}))

async function mockWorkflowRequests(page: Page): Promise<void> {
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    if (path.endsWith('/wf_task')) {
      const summary = url.searchParams.get('select') === 'id,due_at'
      const rows = summary
        ? taskRows.map(({ id, due_at }) => ({ id, due_at }))
        : taskRows.slice(0, 10)
      await route.fulfill({
        json: rows,
        headers: { 'content-range': '0-9/20', 'access-control-expose-headers': 'content-range' }
      })
      return
    }
    if (path.endsWith('/wf_instance')) {
      await route.fulfill({
        json: [],
        headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' }
      })
      return
    }
    if (path.endsWith('/search_platform_global_pending_workflow_tasks')) {
      await route.fulfill({
        json: { records: globalTaskRows.slice(0, 10), total: 20, taskTotal: 20 }
      })
      return
    }
    if (path.endsWith('/get_menus_for_current_applications')) {
      await route.fulfill({ json: {} })
      return
    }
    if (
      path.endsWith('/material_unit_compatibility_options') ||
      path.endsWith('/get_accessible_applications') ||
      path.endsWith('/get_current_user_button_permissions')
    ) {
      await route.fulfill({ json: [] })
      return
    }
    await route.fulfill({ json: [] })
  })
}

async function tableBodyHeight(page: Page): Promise<number> {
  return page
    .locator('.el-tab-pane:visible .art-table-query .el-table__body-wrapper')
    .evaluate((el) => Math.round(el.getBoundingClientRect().height))
}

async function expectNoPageOverflow(page: Page): Promise<void> {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
}

test('审批工作台专注模式释放表格高度并保留页签、筛选和退出路径', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await mockWorkflowRequests(page)
  await page.goto('/tests/e2e/fixtures/workflow-focus.html?mode=workbench')

  const hero = page.locator('.business-workspace-header')
  const tabs = page.locator('.workflow-workbench__tabs')
  const pendingTable = page.locator('.el-tab-pane:visible .art-table-query')
  await expect(hero.getByRole('heading', { name: '审批工作台' })).toBeVisible()
  await expect(pendingTable.locator('.el-table__body-wrapper')).toBeVisible()
  const normalHeight = await tableBodyHeight(page)

  const focusSwitch = page.getByRole('switch', { name: '进入专注模式', exact: true })
  await focusSwitch.locator('..').click()
  await expect(hero).toBeHidden()
  await expect(tabs).toBeVisible()
  await expect(pendingTable.getByPlaceholder('搜索业务单据')).toBeVisible()
  await expect(pendingTable.locator('.el-pagination')).toBeVisible()
  await expect.poll(() => tableBodyHeight(page)).toBeGreaterThan(normalHeight + 100)

  await pendingTable.getByPlaceholder('搜索业务单据').fill('测试审批单')
  await tabs.getByRole('tab', { name: /全局待办/ }).click()
  await expect(hero).toBeHidden()
  await expect(tabs.getByRole('tab', { name: /全局待办/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.el-tab-pane:visible .art-table-query .el-pagination')).toBeVisible()
  await tabs.getByRole('tab', { name: /待我审批/ }).click()
  await expect(pendingTable.getByPlaceholder('搜索业务单据')).toHaveValue('测试审批单')
  await expect(page.locator('.el-tab-pane:visible .art-table-query')).toHaveClass(/is-focus-mode/)

  await page.getByRole('button', { name: '退出专注模式', exact: true }).click()
  await expect(hero).toBeVisible()
  await expect(pendingTable.getByPlaceholder('搜索业务单据')).toHaveValue('测试审批单')
  await focusSwitch.locator('..').click()
  await page.keyboard.press('Escape')
  await expect(hero).toBeVisible()
  await expectNoPageOverflow(page)
  expect(errors).toEqual([])
})

test('全局专注偏好自动进入，手动退出只影响当前页面访问，关闭开关立即退出', async ({ page }) => {
  await mockWorkflowRequests(page)
  await page.goto('/tests/e2e/fixtures/workflow-focus.html?mode=workbench&global-focus')

  const hero = page.locator('.business-workspace-header')
  const tabs = page.locator('.workflow-workbench__tabs')
  const activeTable = page.locator('.el-tab-pane:visible .art-table-query')
  const setGlobalFocus = (value: boolean) =>
    page.evaluate(
      (enabled) =>
        (
          window as Window & { setGlobalFocusPreference: (nextEnabled: boolean) => void }
        ).setGlobalFocusPreference(enabled),
      value
    )

  await expect(activeTable).toHaveClass(/is-focus-mode/)
  await expect(hero).toBeHidden()
  await page.keyboard.press('Escape')
  await expect(activeTable).not.toHaveClass(/is-focus-mode/)
  await expect(hero).toBeVisible()

  await tabs.getByRole('tab', { name: /全局待办/ }).click()
  await expect(activeTable).not.toHaveClass(/is-focus-mode/)
  await expect(hero).toBeVisible()

  await setGlobalFocus(false)
  await setGlobalFocus(true)
  await expect(activeTable).toHaveClass(/is-focus-mode/)
  await expect(hero).toBeHidden()

  await setGlobalFocus(false)
  await expect(activeTable).not.toHaveClass(/is-focus-mode/)
  await expect(hero).toBeVisible()
  await expectNoPageOverflow(page)
})

test('审批流程设计专注模式保留业务筛选与列表且退出后恢复概览', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await mockWorkflowRequests(page)
  await page.goto('/tests/e2e/fixtures/workflow-focus.html?mode=definition')

  const hero = page.locator('.business-workspace-header')
  const table = page.locator('.workflow-definition .art-table-query')
  await expect(hero.getByRole('heading', { name: '审批流程设计' })).toBeVisible()
  await expect(table.locator('.el-table')).toBeVisible()
  await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
  await expect(hero).toBeHidden()
  await expect(table).toHaveClass(/is-focus-mode/)
  await expect(table.locator('.el-table')).toBeVisible()
  await expect(page.locator('.workflow-definition__workspace')).toBeVisible()
  await page.getByRole('button', { name: '退出专注模式', exact: true }).click()
  await expect(hero).toBeVisible()
  await expectNoPageOverflow(page)
  expect(errors).toEqual([])
})

test('审批设计器专注画布不超出视口且两种退出路径恢复布局', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const config = createWorkflowTemplateDraft('custom').config
  config.nodes[0].assignee = { type: 'users', userIds: ['member-a'] }
  config.nodes.push({ ...config.nodes[0], key: 'finance-review', name: '财务复核', order: 2 })

  await page.route('**/rest/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/wf_definition')) {
      await route.fulfill({
        json: {
          id: 'definition-a',
          code: 'focus_test',
          name: '专注画布测试流程',
          business_type: 'generic',
          tenant_id: 'tenant-a',
          status: 'draft',
          versions: [{ id: 'version-a', version_no: 1, status: 'draft', config }]
        }
      })
      return
    }
    const data =
      path.endsWith('/list_workflow_user_options_secure') || path.endsWith('/sys_user')
        ? [{ id: 'member-a', user_name: '审批成员 A', user_email: 'test@example.invalid' }]
        : path.endsWith('/sys_tenant')
          ? [{ id: 'tenant-a', tenant_code: 'test', tenant_name: '测试租户' }]
          : []
    await route.fulfill({
      headers: {
        'content-range': data.length ? '0-0/1' : '*/0',
        'access-control-expose-headers': 'content-range'
      },
      json: data
    })
  })
  await page.goto('/tests/e2e/fixtures/workflow-focus.html?mode=designer')

  const designer = page.locator('.workflow-designer-page')
  const header = designer.locator('.workflow-designer-page__header')
  const steps = designer.getByRole('navigation', { name: '流程设计步骤' })
  const focusBar = designer.locator('.workflow-designer-page__focus-bar')
  const canvas = designer.locator('.workflow-canvas-editor')
  await expect(designer.getByRole('textbox', { name: /流程名称/ })).toHaveValue('专注画布测试流程')
  await steps.getByRole('button', { name: /流程设计/ }).click()
  await expect(canvas).toBeVisible()

  const enterFocus = designer.getByRole('switch', { name: '进入专注模式', exact: true })
  await enterFocus.locator('..').click()
  await expect(header).toBeHidden()
  await expect(steps).toBeHidden()
  await expect(focusBar).toBeVisible()
  await expect(canvas).toBeVisible()
  await expect.poll(async () => (await canvas.boundingBox())?.y ?? 0).toBeGreaterThan(0)
  const focusedCanvas = await canvas.boundingBox()
  if (!focusedCanvas) throw new Error('审批画布未进入可见区域')
  expect(focusedCanvas.y + focusedCanvas.height).toBeLessThanOrEqual(
    (page.viewportSize()?.height ?? 0) + 1
  )
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)
  ).toBeLessThanOrEqual(1)
  await expect
    .poll(async () =>
      canvas.evaluate((element) => {
        const pane = element.querySelector<HTMLElement>('.vue-flow')
        const nodes = Array.from(element.querySelectorAll<HTMLElement>('.vue-flow__node'))
          .map((node) => node.getBoundingClientRect())
          .filter((rect) => rect.width > 0 && rect.height > 0)
        if (!pane || !nodes.length) return Infinity
        const paneRect = pane.getBoundingClientRect()
        const nodesTop = Math.min(...nodes.map((rect) => rect.top))
        const nodesBottom = Math.max(...nodes.map((rect) => rect.bottom))
        return (
          Math.abs((nodesTop + nodesBottom) / 2 - (paneRect.top + paneRect.bottom) / 2) /
          paneRect.height
        )
      })
    )
    // A relative tolerance allows SVG/card rounding while detecting a stale viewport center.
    .toBeLessThan(0.05)

  await designer.getByRole('button', { name: '配置下一个审批节点', exact: true }).click()
  const nodeName = designer.getByRole('textbox', { name: /节点名称/ })
  await expect(nodeName).toHaveValue('财务复核')
  await designer.getByRole('button', { name: '配置上一个审批节点', exact: true }).click()
  await nodeName.fill('修改后待保存的节点')
  await expect(designer.locator('.workflow-designer-page__save-status')).toContainText('未保存')
  await page.screenshot({ path: info.outputPath('designer-focus.png'), fullPage: true })

  await page.keyboard.press('Escape')
  await expect(header).toBeVisible()
  await expect(steps).toBeVisible()
  await expect(focusBar).toBeHidden()
  await enterFocus.locator('..').click()
  await expect(focusBar).toBeVisible()
  await designer.getByRole('switch', { name: '退出专注模式', exact: true }).locator('..').click()
  await expect(header).toBeVisible()
  await expect(steps).toBeVisible()
  await expect(focusBar).toBeHidden()
  await page.screenshot({ path: info.outputPath('designer-normal.png'), fullPage: true })
  expect(errors).toEqual([])
})
