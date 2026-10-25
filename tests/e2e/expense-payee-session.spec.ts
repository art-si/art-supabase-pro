import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(90000)

for (const documentType of ['loan', 'reimbursement']) {
  for (const failed of [false, true]) {
    test(`${documentType}关闭后旧收款请求${failed ? '失败' : '成功'}不影响新员工的可用选项`, async ({
      page
    }, info) => {
      let delayed = 1
      let release: (() => void) | undefined
      await page.route('**/rest/v1/**', async (route) => {
        const url = new URL(route.request().url())
        const name = url.pathname.split('/').at(-1)
        if (name === 'sys_dictionary') {
          const code = (url.searchParams.get('dict_type_table.code') || '').replace(/^eq\./, '')
          const entries =
            code === 'fmsSettlementMethod'
              ? [['bank_transfer', '银行转账']]
              : code === 'fmsPayeeType'
                ? [['person', '个人']]
                : []
          return route.fulfill({
            json: entries.map(([value, label]) => ({
              id: value,
              code: value,
              value,
              label,
              status: '1',
              dict_type_table: { code }
            }))
          })
        }
        if (
          name ===
          `fms_list_${documentType === 'loan' ? 'loan' : 'reimbursement'}_payee_options_secure`
        ) {
          const input = route.request().postDataJSON()
          const employee =
            documentType === 'loan' ? input.p_borrower_employee_id : input.p_applicant_employee_id
          const index = employee.endsWith('1') ? 1 : 2
          if (index === delayed)
            await new Promise<void>((resolve) => {
              release = resolve
            })
          if (index === delayed && failed)
            return route.fulfill({
              status: 503,
              json: { code: 'P0001', message: '旧会话资料加载失败' }
            })
          return route.fulfill({
            json: [
              {
                id: `payee-${index}`,
                payee_name: `验收收款人${index}`,
                bank_name: '验收银行',
                bank_account: `MOCK-${index}-1234`
              }
            ]
          })
        }
        return route.fulfill({ json: [] })
      })
      const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
      for (const old of [1, 2]) {
        delayed = old
        release = undefined
        const current = old === 1 ? 2 : 1
        await page.goto(
          `/tests/e2e/fixtures/receivable-workspace.html?kind=expense_payee_editor&documentType=${documentType}&theme=${theme}`
        )
        await page.getByRole('button', { name: `编辑员工${old}收款`, exact: true }).click()
        const dialog = page.getByRole('dialog', { name: '编辑收款明细', exact: true })
        await expect.poll(() => Boolean(release)).toBe(true)
        await dialog.getByRole('button', { name: '取消', exact: true }).click()
        await expect(dialog).toBeHidden()
        await page.getByRole('button', { name: `编辑员工${current}收款`, exact: true }).click()
        await expect(
          dialog.getByText(`验收收款人${current} · 验收银行 · 1234`, { exact: true })
        ).toBeVisible()
        release?.()
        await page.waitForLoadState('networkidle')
        await expect(page.locator('.el-message')).toHaveCount(0)
        await expect(dialog).not.toContainText('旧会话资料加载失败')
        await expect(dialog.getByRole('textbox', { name: /银行账号$/ })).toHaveValue(
          `MOCK-${current}-1234`
        )
        if (old === 2)
          await dialog.screenshot({ path: info.outputPath('current-payee-after-old-request.png') })
        await dialog.getByRole('button', { name: '保存收款明细', exact: true }).click()
        await expect(dialog).toBeHidden()
        await expect(page.getByRole('status')).toHaveText(`payee-${current} · MOCK-${current}-1234`)
      }
    })
  }
}
