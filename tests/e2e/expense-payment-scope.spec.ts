import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(90000)

for (const kind of ['loan', 'reimbursement'] as const) {
  test(`${kind}付款加载和确认期间租户范围变化均阻断旧操作`, async ({ page }) => {
    const home = '11111111-1111-4111-8111-111111111111'
    const foreign = '22222222-2222-4222-8222-222222222222'
    const record = {
      id: 'scope-record',
      tenant_id: home,
      loan_no: 'QA-SCOPE-PAY',
      reimbursement_no: 'QA-SCOPE-PAY',
      status: 'approved',
      is_demo: true,
      source_type: 'travel',
      approved_amount: 100,
      paid_amount: 0,
      remaining_amount: 100,
      attachment_urls: [],
      payments: [],
      payees: [
        { id: 'scope-payee', payee_name: '范围验收收款人', amount: 100, remaining_amount: 100 }
      ]
    }
    let releaseDetail: (() => void) | undefined
    let delay = true
    let writes = 0
    await page.route('**/rest/v1/**', async (route) => {
      const url = new URL(route.request().url())
      const name = url.pathname.split('/').at(-1)
      const detail =
        kind === 'loan'
          ? name === 'fms_travel_loan' && url.searchParams.has('id')
          : name === 'tms_get_expense_reimbursement_secure'
      if (detail) {
        if (delay)
          await new Promise<void>((resolve) => {
            releaseDetail = resolve
          })
        return route.fulfill({ json: record })
      }
      if (name === 'fms_travel_loan') return route.fulfill({ json: [record] })
      if (name === 'fms_list_expense_reimbursements_secure')
        return route.fulfill({ json: { records: [record], total: 1 } })
      if (name === 'fms_list_fund_account_options_secure')
        return route.fulfill({
          json: [{ id: 'scope-account', tenant_id: home, account_name: '界面验收范围账户' }]
        })
      if (name?.startsWith('record_fms_travel_')) writes++
      return route.fulfill({ json: [] })
    })
    await page.goto(`/tests/e2e/fixtures/receivable-workspace.html?kind=expense_${kind}`)
    const entry = page.getByRole('button', { name: '模拟付款', exact: true })
    await expect(entry).toBeVisible()
    const setScope = async (tenantId: string) =>
      page.evaluate((id) => {
        sessionStorage.setItem('art-platform-tenant-scope-active', '1')
        sessionStorage.setItem('art-platform-tenant-scope-id', id)
      }, tenantId)
    await setScope(home)
    await entry.click()
    await expect.poll(() => Boolean(releaseDetail)).toBe(true)
    await setScope(foreign)
    releaseDetail?.()
    await expect(page.getByText('租户范围已变化，请刷新后重试', { exact: true })).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    delay = false
    await setScope(home)
    await expect(page.locator('.el-message')).toHaveCount(0)
    await entry.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await setScope(foreign)
    await dialog.getByRole('button', { name: '记录模拟付款', exact: true }).click()
    await expect(page.getByText('租户范围已变化，请刷新后重试', { exact: true })).toBeVisible()
    await expect(dialog).toBeVisible()
    expect(writes).toBe(0)
  })
}
