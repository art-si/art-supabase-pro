import { test, expect } from '@playwright/test'
test.use({ storageState: { cookies: [], origins: [] } })
test('薪酬分类编辑保留历史项目并自动汇总', async ({ page }, info) => {
  const submissions: Record<string, unknown>[] = []
  await page.route('**/rest/v1/rpc/save_fms_payroll_line_secure', (route) => {
    submissions.push(route.request().postDataJSON())
    return route.fulfill({ json: {} })
  })
  const theme = info.project.name.includes('dark') ? 'dark' : 'light'
  await page.goto(`/tests/e2e/fixtures/payroll-items.html?theme=${theme}`)
  await page.getByRole('button', { name: '编辑薪酬', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '项目名称', exact: true }).nth(2)).toHaveValue(
    '历史补助'
  )
  const amount = page.getByRole('spinbutton', { name: '金额', exact: true })
  await amount.nth(1).fill('2000')
  await page.screenshot({ path: info.outputPath('payroll-items.png'), fullPage: true })
  await page.getByRole('textbox', { name: '备注', exact: true }).scrollIntoViewIfNeeded()
  await expect(page.getByRole('button', { name: '保存明细', exact: true })).toBeInViewport()
  await page.screenshot({ path: info.outputPath('payroll-items-totals.png'), fullPage: true })
  await page.getByRole('button', { name: '保存明细', exact: true }).click()
  await expect.poll(() => submissions.length).toBe(1)
  expect(submissions[0].p_payload).toMatchObject({
    earningItems: { 基本工资: 6000, 提成: 2000, 历史补助: 200 },
    deductionItems: { 违章扣款: 100, 事故扣款: 50 },
    employerCostItems: { 社保: 1200 },
    grossAmount: 8200,
    deductionAmount: 150,
    employerCostAmount: 1200
  })
})

test('重复薪酬项目阻止保存，修正后可以继续', async ({ page }) => {
  const submissions: Record<string, unknown>[] = []
  await page.route('**/rest/v1/rpc/save_fms_payroll_line_secure', (route) => {
    submissions.push(route.request().postDataJSON())
    return route.fulfill({ json: {} })
  })
  await page.goto('/tests/e2e/fixtures/payroll-items.html')
  await page.getByRole('button', { name: '编辑薪酬', exact: true }).click()
  const names = page.getByRole('textbox', { name: '项目名称', exact: true })
  await names.nth(1).fill('基本工资')
  await page.getByRole('button', { name: '保存明细', exact: true }).click()
  await expect(
    page.getByText('薪酬项目“基本工资”重复，请合并后保存', { exact: true })
  ).toBeVisible()
  expect(submissions).toHaveLength(0)
  await names.nth(1).fill('提成')
  await page.getByRole('button', { name: '保存明细', exact: true }).click()
  await expect.poll(() => submissions.length).toBe(1)
  expect(submissions[0].p_payload).toMatchObject({
    earningItems: { 基本工资: 6000, 提成: 1800, 历史补助: 200 },
    grossAmount: 8000
  })
})
