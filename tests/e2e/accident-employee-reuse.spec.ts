import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)
for (const theme of ['light', 'dark']) {
  for (const box of ['border-mode', 'shadow-mode']) {
    test(`事故快报和分析复用员工选择器并保留档案 ${theme} ${box}`, async ({ page }, testInfo) => {
      const employee = {
        id: 'employee-1',
        tenantId: '11111111-1111-4111-8111-111111111111',
        employeeName: '测试事故人员',
        employeeNo: 'EMP-001',
        employmentStatus: 'active',
        gender: '1',
        age: 36,
        jobTitle: '安全员',
        idCardNo: '110101199001010011',
        phone: '13900000001',
        workYears: 8,
        companyName: '测试公司',
        operationDepartmentName: '测试作业部',
        operationAreaName: '测试作业区',
        teamName: '测试班组',
        educationLevel: '本科',
        homeAddress: '测试地址',
        organization: { id: 'org-1', organizationCode: 'ORG-1', organizationName: '测试组织' }
      }
      await page.route('**/rest/v1/sys_dictionary?*', (route) => route.fulfill({ json: [] }))
      await page.route('**/rest/v1/rpc/smis_list_accident_employee_candidates_secure', (route) =>
        route.fulfill({ json: { records: [employee], total: 1 } })
      )
      await page.goto('/tests/e2e/fixtures/accident-employee-reuse.html', {
        waitUntil: 'domcontentloaded'
      })
      await page.evaluate(
        ({ theme, box }) => {
          document.documentElement.classList.toggle('dark', theme === 'dark')
          document.documentElement.dataset.boxMode = box
        },
        { theme, box }
      )
      await page.getByRole('textbox', { name: '批量选择人员', exact: true }).click()
      let picker = page.getByRole('dialog', { name: '批量添加事故人员', exact: true })
      await expect(picker.getByRole('columnheader', { name: '性别', exact: true })).toBeVisible()
      await expect(picker.getByRole('columnheader', { name: '年龄', exact: true })).toBeVisible()
      await picker
        .getByRole('row')
        .filter({ hasText: 'EMP-001' })
        .locator('label.el-checkbox')
        .click()
      await page.screenshot({
        path: testInfo.outputPath('people-picker.png'),
        animations: 'disabled'
      })
      await picker.getByRole('button', { name: /确.*定/ }).click()
      await expect
        .poll(async () =>
          JSON.parse((await page.getByTestId('people-snapshot').textContent()) || '[]')
        )
        .toMatchObject([
          {
            employeeId: 'employee-1',
            idCardNo: employee.idCardNo,
            age: 36,
            workYears: 8,
            companyName: employee.companyName,
            teamName: employee.teamName
          }
        ])
      await page
        .getByRole('row')
        .filter({ hasText: 'EMP-001' })
        .locator('.el-table__expand-icon')
        .click()
      await page.getByRole('textbox', { name: '伤害部位', exact: true }).fill('左手')
      await page.locator('.accident-people-editor__toolbar').getByRole('textbox').click()
      picker = page.getByRole('dialog', { name: '批量添加事故人员', exact: true })
      await expect(
        picker.getByRole('row').filter({ hasText: 'EMP-001' }).getByRole('checkbox')
      ).toBeChecked()
      await picker.getByRole('button', { name: /确.*定/ }).click()
      await expect(page.getByRole('textbox', { name: '伤害部位', exact: true })).toHaveValue('左手')
      await page.getByRole('button', { name: '打开事故分析', exact: true }).click()
      const analysis = page.getByRole('dialog', { name: '新增事故分析', exact: true })
      await analysis.getByRole('textbox', { name: /参加人员$/ }).click()
      picker = page.getByRole('dialog', { name: '选择参加人员', exact: true })
      await picker
        .getByRole('row')
        .filter({ hasText: 'EMP-001' })
        .locator('label.el-checkbox')
        .click()
      await picker.getByRole('button', { name: /确.*定/ }).click()
      await expect(analysis.getByText('测试事故人员 · EMP-001', { exact: true })).toBeVisible()
      await page.screenshot({
        path: testInfo.outputPath('analysis-selected.png'),
        animations: 'disabled'
      })
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
        )
      ).toBe(true)
    })
  }
}
