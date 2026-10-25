import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('安全检查复用员工选择器的加载、失败重试、多选与空状态', async ({ page }, testInfo) => {
  let mode: 'loading' | 'error' | 'ready' | 'empty' = 'loading'
  let release: () => void = () => {}
  const pending = new Promise<void>((resolve) => (release = resolve))
  const scopes: string[] = []
  await page.route('**/rest/v1/sys_dictionary?*', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/rpc/hr_list_employee_selector_secure', async (route) => {
    scopes.push(route.request().postDataJSON().p_tenant_id)
    if (mode === 'loading') await pending
    if (mode === 'error')
      return route.fulfill({ status: 403, json: { code: '42501', message: '拒绝测试请求' } })
    return route.fulfill({
      json: {
        records:
          mode === 'empty'
            ? []
            : [
                {
                  id: 'employee-1',
                  tenantId: '11111111-1111-4111-8111-111111111111',
                  employeeName: '测试检查人',
                  employeeNo: 'EMP-001',
                  employmentStatus: 'active',
                  jobTitle: '安全员',
                  organization: {
                    id: 'org-1',
                    organizationCode: 'ORG-1',
                    organizationName: '测试组织'
                  }
                }
              ],
        total: mode === 'empty' ? 0 : 1
      }
    })
  })
  await page.goto('/tests/e2e/fixtures/selector-reuse.html', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '打开安全检查', exact: true }).click()
  const inspection = page.getByRole('dialog', { name: '新增安全检查', exact: true })
  await inspection.getByRole('textbox', { name: /检查人$/ }).click()
  const picker = page.getByRole('dialog', { name: '选择检查人', exact: true })
  try {
    await expect(picker.locator('.art-overlay-loading')).toBeVisible()
    await expect(picker.getByRole('button', { name: /确.*定/ })).toBeDisabled()
    await page.screenshot({
      path: testInfo.outputPath('employee-picker-loading.png'),
      animations: 'disabled'
    })
  } finally {
    mode = 'error'
    release()
  }
  await expect(picker.getByRole('button', { name: '重新加载' })).toBeVisible()
  await expect(page.locator('.el-message--error')).toHaveCount(0)
  await page.screenshot({
    path: testInfo.outputPath('employee-picker-error.png'),
    animations: 'disabled'
  })
  mode = 'ready'
  await picker.getByRole('button', { name: '重新加载' }).click()
  const row = picker.getByRole('row').filter({ hasText: 'EMP-001' })
  await expect(row).toContainText('测试组织')
  await row.locator('label.el-checkbox').click()
  await expect(row.getByRole('checkbox')).toBeChecked()
  await page.screenshot({
    path: testInfo.outputPath('employee-picker-selected.png'),
    animations: 'disabled'
  })
  await picker.getByRole('button', { name: /确.*定/ }).click()
  await expect(inspection.getByText('测试检查人 · EMP-001', { exact: true })).toBeVisible()
  await inspection.getByRole('textbox', { name: /检查人$/ }).click()
  mode = 'empty'
  await picker
    .getByRole('textbox', { name: '搜索姓名、工号、组织或岗位', exact: true })
    .press('Enter')
  await expect(picker.getByText('暂无可选人员', { exact: true })).toBeVisible()
  expect(scopes.length).toBeGreaterThanOrEqual(3)
  expect(scopes.every((scope) => scope === '11111111-1111-4111-8111-111111111111')).toBe(true)
  await page.screenshot({
    path: testInfo.outputPath('employee-picker-empty.png'),
    animations: 'disabled'
  })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
    )
  ).toBe(true)
})

for (const theme of ['light', 'dark']) {
  for (const box of ['border-mode', 'shadow-mode']) {
    test(`物料选择保留零键并在清空后发出 undefined ${theme} ${box}`, async ({ page }, testInfo) => {
      await page.route('**/rest/v1/sys_dictionary?*', (route) => route.fulfill({ json: [] }))
      await page.goto('/tests/e2e/fixtures/selector-reuse.html', { waitUntil: 'domcontentloaded' })
      await page.evaluate(
        ({ theme, box }) => {
          document.documentElement.classList.toggle('dark', theme === 'dark')
          document.documentElement.dataset.boxMode = box
        },
        { theme, box }
      )
      await page.getByRole('textbox', { name: '请选择物料', exact: true }).click()
      const picker = page.getByRole('dialog', { name: '选择零号物料', exact: true })
      await expect(picker.getByRole('row').filter({ hasText: 'MAT-0' })).toBeVisible()
      await expect(
        picker.getByRole('textbox', { name: '搜索分类名称或编码', exact: true })
      ).toHaveCount(0)
      if (testInfo.project.name.includes('mobile')) {
        const emptyCopy = picker.locator(
          '.art-data-select-dialog__navigation .art-empty-state__copy'
        )
        await expect(emptyCopy).toBeInViewport({ ratio: 1 })
        expect(
          await emptyCopy.evaluate((element) => {
            const viewport = element.closest('.el-scrollbar__wrap')
            if (!viewport) return false
            const content = element.getBoundingClientRect(),
              bounds = viewport.getBoundingClientRect()
            return content.top >= bounds.top - 1 && content.bottom <= bounds.bottom + 1
          })
        ).toBe(true)
      }
      await page.screenshot({
        path: testInfo.outputPath('material-picker.png'),
        animations: 'disabled'
      })
      await picker.getByRole('row').filter({ hasText: 'MAT-0' }).click()
      await picker.getByRole('button', { name: /确.*定/ }).click()
      await expect(page.getByTestId('material-key')).toHaveText('0')
      await expect(page.getByRole('textbox', { name: '请选择物料', exact: true })).toHaveValue(
        '零号物料'
      )
      await page.screenshot({
        path: testInfo.outputPath('material-zero.png'),
        animations: 'disabled'
      })
      await page.getByRole('button', { name: '清空', exact: true }).click()
      await expect(page.getByTestId('material-key')).toHaveText('未选择')
    })
  }
}
