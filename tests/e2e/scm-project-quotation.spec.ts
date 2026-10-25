import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)
const project = {
  id: 'project-a',
  tenant_id: 'tenant-a',
  project_code: 'PR-TEST',
  project_name: '设备装配项目',
  customer_name: '测试客户',
  project_status: null,
  quotation_count: 2,
  latest_quotation_no: 'Q-002',
  latest_quotation_date: '2026-10-08'
}
test.beforeEach(async ({ page }, testInfo) => {
  await prepareIsolatedSession(page)
  await page.addInitScript((dark) => {
    document.addEventListener('DOMContentLoaded', () =>
      document.documentElement.classList.toggle('dark', dark)
    )
  }, testInfo.project.name.includes('dark'))
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/rpc/scm_project_quotation_projects', (route) =>
    route.fulfill({ json: { records: [project], total: 1 } })
  )
  await page.route('**/rest/v1/rpc/scm_project_quotation_profile', (route) =>
    route.fulfill({
      json: {
        ...project,
        owner_name: '测试负责人',
        salesperson_name: '测试销售员',
        contact_name: '测试联系人',
        contact_phone: null,
        address_detail: '装配车间',
        project_stage: null,
        remark: '项目业务资料'
      }
    })
  )
})

test('项目八个页签逐单展示分类并从业务明细读取采购与库存', async ({ page }, testInfo) => {
  const requested: string[] = []
  await page.route('**/rest/v1/rpc/scm_project_quotation_tab', (route) => {
    const tab: string = route.request().postDataJSON().p_tab
    requested.push(tab)
    const records =
      tab === 'categories'
        ? [1, 2].map((n) => ({
            id: `category-${n}`,
            document_no: `Q-00${n}`,
            category_name: '设备装配',
            quantity: n * 10,
            unit_price: 12,
            fee_total: 0,
            amount: n * 120,
            currency: 'CNY'
          }))
        : [
            {
              id: `${tab}-a`,
              document_no: `${tab}-TEST`,
              material_description: '装配物料',
              material_code: 'MAT-001',
              quantity: 5,
              unit: '件',
              unit_price: 12,
              amount: 60,
              currency: 'CNY',
              status: tab === 'purchase_requests' ? 'draft' : 'effective',
              warehouse_name: '装配仓',
              bin_name: 'A-01',
              batch_no: 'BATCH-001',
              occurred_at: '2026-10-08T00:00:00Z',
              source_warehouse_name: '装配仓',
              target_warehouse_name: '交付仓'
            }
          ]
    return route.fulfill({ json: { records, total: records.length } })
  })
  await page.goto('/tests/e2e/fixtures/scm-project-quotation.html')
  const workspace = page.locator('.business-workspace-page')
  await expect(workspace.getByText('PR-TEST', { exact: true })).toBeVisible({ timeout: 120_000 })
  await page.screenshot({
    path: testInfo.outputPath('project-workspace.png'),
    animations: 'disabled'
  })
  await workspace.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
  await expect(workspace.getByText('审批自动归集', { exact: true })).toBeHidden()
  await page.keyboard.press('Escape')
  await expect(workspace.getByText('审批自动归集', { exact: true })).toBeVisible()
  await workspace.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
  await workspace.getByRole('button', { name: '退出专注模式', exact: true }).click()
  await workspace.getByText('设备装配项目', { exact: true }).click()
  const drawer = page.getByRole('dialog', { name: '项目报价详情' })
  await expect(drawer.getByText('测试负责人', { exact: true })).toBeVisible()
  await expect(drawer.getByRole('tab')).toHaveCount(8)
  await drawer.getByRole('tab', { name: '报价项分类', exact: true }).click()
  await expect(drawer.locator('tbody tr')).toHaveCount(2)
  await expect(drawer.getByText('Q-001', { exact: true })).toBeVisible()
  await expect(drawer.getByText('Q-002', { exact: true })).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('project-categories.png'),
    animations: 'disabled'
  })
  for (const [label, tab] of [
    ['报价明细', 'quotation_lines'],
    ['销售合同', 'contracts'],
    ['采购申请', 'purchase_requests'],
    ['采购订单', 'purchase_orders'],
    ['实时库存', 'stock'],
    ['库存流水', 'movements']
  ]) {
    await drawer.getByRole('tab', { name: label, exact: true }).click()
    await expect(drawer.locator('tbody tr')).toHaveCount(1)
    expect(requested).toContain(tab)
  }
  await page.screenshot({
    path: testInfo.outputPath('project-movements.png'),
    animations: 'disabled'
  })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
})

test('项目资料失败可重试，业务列表失败与空状态可恢复', async ({ page }) => {
  let profileFails = true
  let tabFails = true
  await page.route('**/rest/v1/rpc/scm_project_quotation_profile', (route) =>
    profileFails
      ? route.fulfill({ status: 500, json: { message: 'temporary read error' } })
      : route.fulfill({
          json: {
            ...project,
            owner_name: '重试负责人',
            salesperson_name: null,
            contact_name: null,
            contact_phone: null,
            address_detail: null,
            project_stage: null,
            remark: null
          }
        })
  )
  await page.route('**/rest/v1/rpc/scm_project_quotation_tab', (route) =>
    tabFails
      ? route.fulfill({ status: 500, json: { message: 'temporary read error' } })
      : route.fulfill({ json: { records: [], total: 0 } })
  )
  await page.goto('/tests/e2e/fixtures/scm-project-quotation.html')
  await page.getByText('设备装配项目', { exact: true }).click({ timeout: 120_000 })
  const drawer = page.getByRole('dialog', { name: '项目报价详情' })
  await expect(drawer.getByText('项目资料加载失败', { exact: true })).toBeVisible()
  profileFails = false
  await drawer.getByRole('button', { name: /重试|重新加载/ }).click()
  await expect(drawer.getByText('重试负责人', { exact: true })).toBeVisible()
  await drawer.getByRole('tab', { name: '采购申请', exact: true }).click()
  await expect(drawer.getByRole('button', { name: /重试|重新加载/ })).toBeVisible()
  tabFails = false
  await drawer.getByRole('button', { name: /重试|重新加载/ }).click()
  await expect(drawer.getByText('此项目尚无已保存的采购申请。', { exact: true })).toBeVisible()
})
