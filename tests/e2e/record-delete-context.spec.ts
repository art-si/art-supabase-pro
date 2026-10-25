import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })

for (const count of [1, 2]) {
  test(`供应商确认期间撤销权限阻止 ${count} 条记录删除`, async ({ page }) => {
    await prepareIsolatedSession(page)
    let inspections = 0
    let deletes = 0
    await page.route('**/rest/v1/sys_tenant**', (route) => route.fulfill({ json: [] }))
    await page.route('**/rest/v1/rpc/get_record_delete_dependency_details**', (route) => {
      inspections++
      expect(route.request().postDataJSON().p_table).toBe('mdm_supplier')
      expect(route.request().postDataJSON().p_ids).toHaveLength(count)
      return route.fulfill({ json: [] })
    })
    await page.route('**/rest/v1/rpc/smis_delete_suppliers_secure**', (route) => {
      deletes++
      return route.fulfill({ json: count })
    })
    await page.goto(`/tests/e2e/fixtures/record-delete-context.html?target=supplier&count=${count}`)
    await page.getByRole('button', { name: '删除记录', exact: true }).click()
    const confirmation = page.getByRole('dialog', { name: '删除确认' })
    await expect(confirmation).toContainText(count === 1 ? '测试供应商 1' : '2 家供应商')
    await page
      .getByRole('button', { name: '撤销删除权限' })
      .evaluate((button: HTMLButtonElement) => button.click())
    await confirmation.getByRole('button', { name: '删除', exact: true }).click()
    await expect(
      page.getByText('供应商删除权限已变化，请刷新页面后重试', { exact: true })
    ).toBeVisible()
    expect(inspections).toBe(1)
    expect(deletes).toBe(0)
  })
}

test('确认期间失去删除权限后不调用删除回调', async ({ page }) => {
  await prepareIsolatedSession(page)
  let inspections = 0
  await page.route('**/rest/v1/sys_tenant**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/rpc/get_record_delete_dependency_details**', (route) => {
    inspections++
    return route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/record-delete-context.html')
  await page.getByRole('button', { name: '删除记录', exact: true }).click()
  const confirmation = page.getByRole('dialog', { name: '删除确认' })
  await expect(confirmation).toBeVisible()
  await page
    .getByRole('button', { name: '撤销删除权限' })
    .evaluate((button: HTMLButtonElement) => button.click())
  await confirmation.getByRole('button', { name: '删除', exact: true }).click()
  await expect(page.getByText('删除权限已变化，请刷新页面后重试', { exact: true })).toBeVisible()
  await expect(page.getByTestId('deleted-table')).toBeEmpty()
  expect(inspections).toBe(1)
})

test('空权限配置不能借助平台权限兜底执行删除', async ({ page }) => {
  await prepareIsolatedSession(page)
  let inspections = 0
  await page.route('**/rest/v1/sys_tenant**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/rpc/get_record_delete_dependency_details**', (route) => {
    inspections++
    return route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/record-delete-context.html?permission=empty')
  await page.getByRole('button', { name: '删除记录', exact: true }).click()
  await expect(
    page.getByText('当前账号无权删除此记录，或记录已变化，请刷新后重试', { exact: true })
  ).toBeVisible()
  await expect(page.getByRole('dialog', { name: '删除确认' })).toHaveCount(0)
  await expect(page.getByTestId('deleted-table')).toBeEmpty()
  expect(inspections).toBe(0)
})

test('删除确认期间分类变化不改变并发引用重检对象', async ({ page }, testInfo) => {
  await prepareIsolatedSession(page)
  const tables: string[] = []
  await page.route('**/rest/v1/sys_tenant**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/rpc/get_record_delete_dependency_details**', (route) => {
    tables.push(route.request().postDataJSON().p_table)
    return route.fulfill({
      json:
        tables.length === 1
          ? []
          : [
              {
                resourceId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
                sourceTable: 'hr_candidate',
                recordId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
                recordNo: 'CANDIDATE-001',
                recordSummary: '测试候选人',
                recordStatus: 'draft'
              }
            ]
    })
  })
  await page.goto('/tests/e2e/fixtures/record-delete-context.html')
  await page.getByRole('button', { name: '删除记录', exact: true }).click()
  const confirmation = page.getByRole('dialog', { name: '删除确认' })
  await expect(confirmation).toContainText('招聘需求测试记录')
  // Simulate a route-driven category change while the modal blocks direct pointer input.
  await page
    .getByRole('button', { name: '切换分类', exact: true })
    .evaluate((button: HTMLButtonElement) => button.click())
  await confirmation.getByRole('button', { name: '删除', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '暂时无法删除招聘需求' })).toContainText(
    'CANDIDATE-001'
  )
  await expect(page.getByTestId('deleted-table')).toHaveText('hr_recruitment_requisition')
  expect(tables).toEqual(['hr_recruitment_requisition', 'hr_recruitment_requisition'])
  await page.screenshot({
    path: testInfo.outputPath('reference-context-preserved.png'),
    animations: 'disabled'
  })
})
