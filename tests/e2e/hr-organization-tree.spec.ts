import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
const organizations = [
  {
    id: '11111111-1111-4111-8111-111111111110',
    tenant_id: '11111111-1111-4111-8111-111111111111',
    parent_id: null,
    organization_name: '测试集团',
    organization_code: 'GROUP',
    status: '1',
    sort: 1
  },
  {
    id: '11111111-1111-4111-8111-111111111112',
    tenant_id: '11111111-1111-4111-8111-111111111111',
    parent_id: '11111111-1111-4111-8111-111111111110',
    organization_name: '招聘团队',
    organization_code: 'HR',
    status: '1',
    sort: 1
  }
]

for (const width of [1440, 570, 390]) {
  test(`招聘组织在 ${width}px 下按父子层级展示并联动岗位`, async ({ page }, testInfo) => {
    test.setTimeout(90_000)
    await prepareIsolatedSession(page)
    await page.setViewportSize({ width, height: 900 })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    let organizationRequests = 0
    await page.route('**/rest/v1/rpc/hr_list_business_organization_options_secure**', (route) => {
      organizationRequests++
      return route.fulfill({ json: organizations })
    })
    await page.goto('/tests/e2e/fixtures/hr-organization-tree.html')
    const dialog = page.getByRole('dialog', { name: '新增招聘需求' })
    await expect(dialog).toBeVisible({ timeout: 60_000 })
    await expect.poll(() => organizationRequests).toBeGreaterThan(0)
    const organization = dialog.getByRole('combobox', { name: '招聘组织' })
    await organization.click()
    const tree = page.locator('.el-tree-select__popper:visible .el-tree')
    await expect(tree.getByText('测试集团 · GROUP')).toBeVisible()
    await expect(tree.getByText('招聘团队 · HR')).toBeVisible()
    const parent = tree.locator('.el-tree-node').filter({ hasText: '测试集团 · GROUP' }).first()
    const child = parent
      .locator('.el-tree-node__children .el-tree-node')
      .filter({ hasText: '招聘团队 · HR' })
      .first()
    await expect(child).toBeVisible()
    await page.screenshot({
      path: testInfo.outputPath('organization-tree.png'),
      animations: 'disabled'
    })
    await child.getByText('招聘团队 · HR').click()
    await expect(dialog.getByText('招聘团队 · HR', { exact: true })).toBeVisible()
    await expect(dialog.getByRole('combobox', { name: '招聘岗位' })).toBeEnabled()
    expect(errors).toEqual([])
  })
}

test('招聘组织加载失败阻止选入并支持原位重试', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  await prepareIsolatedSession(page)
  await page.setViewportSize({ width: 570, height: 900 })
  let unavailable = true
  let requests = 0
  await page.route('**/rest/v1/rpc/hr_list_business_organization_options_secure**', (route) => {
    requests++
    return unavailable
      ? route.fulfill({
          status: 503,
          json: { code: 'P0001', message: '组织数据暂时不可用，请重试' }
        })
      : route.fulfill({ json: organizations })
  })
  await page.goto('/tests/e2e/fixtures/hr-organization-tree.html')
  const dialog = page.getByRole('dialog', { name: '新增招聘需求', exact: true })
  const field = dialog.getByRole('combobox', { name: '招聘组织' })
  await expect(dialog.getByText('选项加载失败', { exact: true })).toBeVisible()
  await expect(field).toBeDisabled()
  const failedRequests = requests
  unavailable = false
  await dialog.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect.poll(() => requests).toBeGreaterThan(failedRequests)
  await expect(dialog.getByText('选项加载失败', { exact: true })).toHaveCount(0)
  await expect(field).toBeEnabled()
  await field.click()
  await expect(
    page.locator('.el-tree-select__popper:visible').getByText('招聘团队 · HR')
  ).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('organization-retry.png'),
    animations: 'disabled'
  })
})
