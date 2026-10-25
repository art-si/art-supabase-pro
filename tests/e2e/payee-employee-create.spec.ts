import { expect, test } from '@playwright/test'
test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(150000)

test('两员工获取新增、切换旧组织不覆盖、银行必填及保存重试', async ({ page }, info) => {
  const tenant = '11111111-1111-4111-8111-111111111111'
  const employees = [1, 2].map((index) => ({
    id: `employee-${index}`,
    tenant_id: tenant,
    employee_name: `验收员工${index}`,
    employee_no: `EMP${index}`,
    organization_id: `department-${index}`,
    employment_status: 'active'
  }))
  const organizations = [
    {
      id: 'group',
      tenant_id: tenant,
      parent_id: null,
      organization_code: 'GROUP',
      organization_name: '验收集团',
      organization_type: 'group',
      status: '1',
      sort: 0
    },
    ...[1, 2].flatMap((index) => [
      {
        id: `company-${index}`,
        tenant_id: tenant,
        parent_id: 'group',
        organization_code: `CO${index}`,
        organization_name: `验收公司${index}`,
        organization_type: 'company',
        status: '1',
        sort: index
      },
      {
        id: `department-${index}`,
        tenant_id: tenant,
        parent_id: `company-${index}`,
        organization_code: `DEPT${index}`,
        organization_name: `验收部门${index}`,
        organization_type: 'department',
        status: '1',
        sort: index
      }
    ])
  ]
  let hold = false
  let release: (() => void) | undefined
  let fail = true
  let failOrganization = false
  const saves: Array<Record<string, unknown>> = []
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url()),
      name = url.pathname.split('/').at(-1)
    if (name === 'sys_dictionary') {
      const code = url.searchParams.get('dict_type_table.code')?.replace(/^eq\./, '')
      const values =
        code === 'mdmCurrency'
          ? [['CNY', '人民币']]
          : code === 'commonBoolean'
            ? [
                ['true', '是'],
                ['false', '否']
              ]
            : []
      return route.fulfill({
        json: values.map(([value, label]) => ({
          id: value,
          value,
          code: value,
          label,
          status: '1',
          dict_type_table: { code }
        }))
      })
    }
    if (name === 'hr_list_employee_selector_secure')
      return route.fulfill({ json: { records: employees, total: 2, field_access: {} } })
    if (name === 'mdm_employee') return route.fulfill({ json: employees })
    if (name === 'mdm_organization') {
      if (failOrganization) {
        return route.fulfill({
          status: 503,
          json: { code: 'PGRST000', message: '组织资料暂不可用，请重新选择员工' }
        })
      }
      if (hold) {
        hold = false
        await new Promise<void>((resolve) => {
          release = resolve
        })
      }
      return route.fulfill({ json: organizations })
    }
    if (name === 'fms_payee_information') {
      if (route.request().method() === 'POST') {
        const input = route.request().postDataJSON()
        saves.push(input)
        if (fail) {
          fail = false
          return route.fulfill({
            status: 409,
            json: { code: '40001', message: '资料已变化，请重试' }
          })
        }
        return route.fulfill({
          json: { ...input, id: `new-payee-${saves.length}` },
          headers: { 'content-range': '0-0/1' }
        })
      }
      return route.fulfill({ json: [], headers: { 'content-range': '*/0' } })
    }
    return route.fulfill({ json: [] })
  })
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  await page.goto(
    `/tests/e2e/fixtures/receivable-workspace.html?kind=expense_payee&theme=${theme}&permissions=FinancePayeeInformation:View,FinancePayeeInformation:Add,FinancePayeeInformation:Get`
  )
  for (const index of [1, 2]) {
    await page.getByRole('button', { name: '一键获取员工', exact: true }).click()
    const editor = page.getByRole('dialog', { name: '一键获取员工收款信息', exact: true })
    const choose = async (employee: number, delayed = false) => {
      await editor.getByPlaceholder('选择收款员工', { exact: true }).click()
      const picker = page.getByRole('dialog', { name: '选择员工', exact: true })
      await picker.getByText(`验收员工${employee}`, { exact: true }).click()
      if (delayed) {
        hold = true
        release = undefined
      }
      await picker.getByRole('button', { name: '确定', exact: true }).click()
    }
    await choose(index === 1 ? 2 : 1, true)
    await expect.poll(() => Boolean(release)).toBe(true)
    await choose(index)
    await expect(editor.locator('.el-form-item').filter({ hasText: '费用承担公司' })).toContainText(
      `验收公司${index}`
    )
    release?.()
    await page.waitForLoadState('networkidle')
    await expect(editor.locator('.el-form-item').filter({ hasText: '费用承担公司' })).toContainText(
      `验收公司${index}`
    )
    await expect(editor.getByRole('textbox', { name: /账户名称/ })).toHaveValue(`验收员工${index}`)
    failOrganization = true
    await choose(index === 1 ? 2 : 1)
    await expect(
      page.getByText('数据库服务暂时不可用，请稍后重试', { exact: true }).last()
    ).toBeVisible()
    failOrganization = false
    await expect(
      editor.locator('.el-form-item').filter({ hasText: '费用承担公司' })
    ).not.toContainText(`验收公司${index}`)
    await choose(index)
    await expect(editor.locator('.el-form-item').filter({ hasText: '费用承担公司' })).toContainText(
      `验收公司${index}`
    )
    await editor.getByRole('button', { name: '清空', exact: true }).click()
    await expect(editor.getByPlaceholder('选择收款员工', { exact: true })).toHaveValue('')
    await expect(editor.getByRole('textbox', { name: /账户名称/ })).toHaveValue('')
    await expect(
      editor.locator('.el-form-item').filter({ hasText: '费用承担公司' })
    ).not.toContainText(`验收公司${index}`)
    const beforeClearSubmit = saves.length
    await editor.getByRole('button', { name: '保存收款信息', exact: true }).click()
    await expect(editor.getByText('请选择收款员工', { exact: true })).toBeVisible()
    expect(saves).toHaveLength(beforeClearSubmit)
    await choose(index)
    if (index === 2) {
      await editor.getByRole('textbox', { name: /账户名称/ }).fill('自定义验收户名')
      await choose(1)
      await choose(2)
      await expect(
        editor.locator('.el-form-item').filter({ hasText: '费用承担公司' })
      ).toContainText('验收公司2')
      await expect(editor.getByRole('textbox', { name: /账户名称/ })).toHaveValue('自定义验收户名')
      await editor.getByRole('button', { name: '清空', exact: true }).click()
      await expect(editor.getByRole('textbox', { name: /账户名称/ })).toHaveValue('自定义验收户名')
      await choose(index)
    }
    const count = saves.length
    await editor.getByRole('button', { name: '保存收款信息', exact: true }).click()
    await expect(editor.getByText('请输入收款银行', { exact: true })).toBeVisible()
    expect(saves).toHaveLength(count)
    await editor.getByRole('textbox', { name: /收款银行/ }).fill('验收银行')
    await editor.getByRole('textbox', { name: /银行账号/ }).fill(`MOCK-EMPLOYEE-${index}`)
    await editor.getByRole('textbox', { name: /账户名称/ }).click()
    await expect(editor.getByText('请输入收款银行', { exact: true })).toBeHidden()
    await expect(editor.getByText('请输入银行账号', { exact: true })).toBeHidden()
    await expect(page.locator('.el-message')).toHaveCount(0)
    await editor.screenshot({ path: info.outputPath(`employee-${index}.png`) })
    await editor.getByRole('button', { name: '保存收款信息', exact: true }).click()
    if (index === 1) {
      await expect(editor).toBeVisible()
      await expect(editor.getByRole('textbox', { name: /银行账号/ })).toHaveValue('MOCK-EMPLOYEE-1')
      await editor.getByRole('button', { name: '保存收款信息', exact: true }).click()
    }
    await expect(editor).toBeHidden()
    expect(saves.at(-1)).toMatchObject({
      tenant_id: tenant,
      employee_id: `employee-${index}`,
      organization_id: `department-${index}`,
      cost_company_id: `company-${index}`,
      account_name: index === 2 ? '自定义验收户名' : `验收员工${index}`
    })
  }
  expect(saves.map((row) => row.employee_id)).toEqual(['employee-1', 'employee-1', 'employee-2'])
  expect(errors).toEqual([])
})
