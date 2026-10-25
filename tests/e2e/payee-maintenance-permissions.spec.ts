import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(120000)

test('一键获取员工需要获取及新增权限，取消后可再次打开', async ({ page }) => {
  const writes: string[] = []
  await page.route('**/rest/v1/**', (route) => {
    if (!['GET', 'HEAD'].includes(route.request().method())) writes.push(route.request().url())
    return route.fulfill({ json: [] })
  })
  for (const grants of [[], ['Get'], ['Add'], ['Get', 'Add']]) {
    const permissions = [
      'FinancePayeeInformation:View',
      ...grants.map((grant) => `FinancePayeeInformation:${grant}`)
    ].join(',')
    await page.goto(
      `/tests/e2e/fixtures/receivable-workspace.html?kind=expense_payee&permissions=${permissions}`
    )
    await expect(page.getByRole('heading', { name: '收款信息', exact: true })).toBeVisible()
    const action = page.getByRole('button', { name: '一键获取员工', exact: true })
    if (!grants.includes('Get')) await expect(action).toHaveCount(0)
    else if (!grants.includes('Add')) await expect(action).toBeDisabled()
    else
      for (let attempt = 0; attempt < 2; attempt++) {
        await action.click()
        const dialog = page.getByRole('dialog', { name: '一键获取员工收款信息', exact: true })
        await expect(dialog).toBeVisible()
        await dialog.getByRole('button', { name: '取消', exact: true }).click()
        await expect(dialog).toBeHidden()
      }
  }
  expect(writes).toEqual([])
})
test('两条收款信息弹窗撤权阻断、恢复及保存失败重试', async ({ page }, info) => {
  const rows = [1, 2].map((index) => ({
    id: `payee-${index}`,
    tenant_id: '11111111-1111-4111-8111-111111111111',
    is_employee: false,
    employee_id: null,
    payee_name: `QA-收款人${index}`,
    bank_name: '测试银行',
    bank_account: `MOCK-ONLY-${index}`,
    account_name: null,
    currency_code: 'CNY',
    organization_id: null,
    organization_name: null,
    cost_company_id: null,
    cost_company_name: null,
    authorized_use: false,
    user_employee_id: null,
    is_default: false,
    remark: null
  }))
  const writes: string[] = []
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  let fail = true
  let holdSave = false
  let releaseSave: (() => void) | undefined
  let listReads = 0
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const name = url.pathname.split('/').at(-1)
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
    if (name === 'fms_payee_information') {
      if (route.request().method() === 'PATCH') {
        const id = url.searchParams.get('id')?.replace(/^eq\./, '') || ''
        writes.push(id)
        if (fail) {
          fail = false
          return route.fulfill({
            status: 409,
            json: { code: '40001', message: '资料已变化，请重试' }
          })
        }
        if (holdSave)
          await new Promise<void>((resolve) => {
            releaseSave = resolve
          })
        const row = rows.find((row) => row.id === id)
        if (row) Object.assign(row, route.request().postDataJSON())
        return route.fulfill({ json: row, headers: { 'content-range': '0-0/1' } })
      }
      listReads++
      return route.fulfill({
        json: rows,
        headers: { 'content-range': '0-1/2', 'access-control-expose-headers': 'content-range' }
      })
    }
    return route.fulfill({ json: [] })
  })
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  await page.goto(
    `/tests/e2e/fixtures/receivable-workspace.html?kind=expense_payee&arNavigation=1&theme=${theme}&permissionControls=1&permissions=FinancePayeeInformation:View,FinancePayeeInformation:Edit`
  )
  for (const index of [1, 2]) {
    await page
      .getByRole('row')
      .filter({ hasText: `QA-收款人${index}` })
      .getByRole('button', { name: '编辑', exact: true })
      .click()
    const editor = page.getByRole('dialog', { name: '编辑收款信息', exact: true })
    await editor.getByRole('textbox', { name: /收款银行/ }).fill(`回归银行${index}`)
    await page.keyboard.press('Alt+Shift+4')
    await editor.getByRole('button', { name: '保存更改', exact: true }).click()
    await expect(
      page.getByText('操作范围或权限已变化，请重新打开收款信息', { exact: true }).last()
    ).toBeVisible()
    expect(writes).toHaveLength(index === 1 ? 0 : 2)
    await page.keyboard.press('Alt+Shift+5')
    await editor.getByRole('button', { name: '取消', exact: true }).click()
    await page
      .getByRole('row')
      .filter({ hasText: `QA-收款人${index}` })
      .getByRole('button', { name: '编辑', exact: true })
      .click()
    await editor.getByRole('textbox', { name: /收款银行/ }).fill(`回归银行${index}`)
    await editor.getByRole('button', { name: '保存更改', exact: true }).click()
    if (index === 1) {
      await expect(editor).toBeVisible()
      await expect(editor.getByRole('textbox', { name: /收款银行/ })).toHaveValue('回归银行1')
      await editor.getByRole('button', { name: '保存更改', exact: true }).click()
    }
    await expect(editor).toBeHidden()
  }
  expect(writes).toEqual(['payee-1', 'payee-1', 'payee-2'])
  for (const index of [1, 2]) {
    await expect(page.locator('.el-message')).toHaveCount(0)
    await page
      .getByRole('row')
      .filter({ hasText: `QA-收款人${index}` })
      .getByRole('button', { name: '编辑', exact: true })
      .click()
    const editor = page.getByRole('dialog', { name: '编辑收款信息', exact: true })
    await editor.getByRole('textbox', { name: /收款银行/ }).fill(`迟到银行${index}`)
    const readsBefore = listReads
    holdSave = true
    releaseSave = undefined
    await editor.getByRole('button', { name: '保存更改', exact: true }).click()
    await expect.poll(() => Boolean(releaseSave)).toBe(true)
    await page.keyboard.press('Alt+Shift+4')
    releaseSave?.()
    await page.waitForLoadState('networkidle')
    await expect(editor.getByRole('button', { name: '保存更改', exact: true })).toBeEnabled()
    await expect(editor).toBeVisible()
    await expect(page.getByText('收款信息已更新', { exact: true })).toHaveCount(0)
    expect(listReads).toBe(readsBefore)
    await expect(editor.getByRole('textbox', { name: /收款银行/ })).toHaveValue(`迟到银行${index}`)
    holdSave = false
    await page.keyboard.press('Alt+Shift+5')
    await editor.getByRole('button', { name: '取消', exact: true }).click()
  }
  expect(writes).toEqual(['payee-1', 'payee-1', 'payee-2', 'payee-1', 'payee-2'])
  for (const index of [1, 2]) {
    await page
      .getByRole('row')
      .filter({ hasText: `QA-收款人${index}` })
      .getByRole('button', { name: '编辑', exact: true })
      .click()
    const editor = page.getByRole('dialog', { name: '编辑收款信息', exact: true })
    await editor.getByRole('textbox', { name: /收款银行/ }).fill(`离页保存${index}`)
    holdSave = true
    releaseSave = undefined
    await editor.getByRole('button', { name: '保存更改', exact: true }).click()
    await expect.poll(() => Boolean(releaseSave)).toBe(true)
    await page.keyboard.press('Alt+Shift+6')
    await expect(page.getByRole('heading', { name: '其他业务页面', exact: true })).toBeVisible()
    await expect(editor).toBeHidden()
    await page.getByRole('button', { name: '返回来源页面', exact: true }).click()
    const other = index === 1 ? 2 : 1
    await page
      .getByRole('row')
      .filter({ hasText: `QA-收款人${other}` })
      .getByRole('button', { name: '编辑', exact: true })
      .click()
    await expect(editor.getByRole('textbox', { name: /收款人/ })).toHaveValue(`QA-收款人${other}`)
    const readsBefore = listReads
    releaseSave?.()
    await page.waitForLoadState('networkidle')
    await expect(editor).toBeVisible()
    await expect(editor.getByRole('textbox', { name: /收款人/ })).toHaveValue(`QA-收款人${other}`)
    await expect(page.getByText('收款信息已更新', { exact: true })).toHaveCount(0)
    expect(listReads).toBe(readsBefore)
    if (index === 2) {
      await editor.locator('.el-scrollbar__wrap').evaluateAll((elements) =>
        elements.forEach((element) => {
          element.scrollTop = 0
        })
      )
      await editor.screenshot({ path: info.outputPath('payee-editor-top.png') })
      await editor.locator('.el-scrollbar__wrap').evaluateAll((elements) =>
        elements.forEach((element) => {
          element.scrollTop = element.scrollHeight
        })
      )
      await editor.screenshot({ path: info.outputPath('payee-editor-bottom.png') })
    }
    holdSave = false
    await editor.getByRole('button', { name: '取消', exact: true }).click()
  }
  expect(errors).toEqual([])
})
