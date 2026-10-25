import { expect, test } from '@playwright/test'
import type { Route } from '@playwright/test'
test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(90000)
for (const config of [
  {
    kind: 'receipt',
    permission: 'FinanceReceipt',
    action: 'Confirm',
    label: '确认收款',
    rpc: 'fms_act_receipt_secure',
    title: '确认资金发生'
  },
  {
    kind: 'refund',
    permission: 'FinanceReceiptRefund',
    action: 'Pay',
    label: '确认付款',
    rpc: 'fms_act_receivable_refund_secure',
    title: '确认资金发生'
  },
  {
    kind: 'payment_request',
    permission: 'FinanceReceivablePaymentRequest',
    action: 'Pay',
    label: '确认付款',
    rpc: 'fms_act_receivable_payment_request_secure',
    title: '确认实际付款'
  }
])
  for (const interruption of ['permission', 'tenant', 'route'])
    test(`${config.kind} 两单确认取消及等待${interruption === 'tenant' ? '切换租户' : interruption === 'route' ? '离页返回' : '撤权'}阻断`, async ({
      page
    }, info) => {
      const writes: unknown[] = []
      await page.route('**/rest/v1/**', (route) => {
        const name = new URL(route.request().url()).pathname.split('/').at(-1)
        if (name === 'sys_tenant')
          return route.fulfill({
            json: [
              {
                id: '11111111-1111-4111-8111-111111111111',
                tenant_code: 'HOME',
                tenant_name: '测试租户一',
                status: '1'
              },
              {
                id: '22222222-2222-4222-8222-222222222222',
                tenant_code: 'OTHER',
                tenant_name: '测试租户二',
                status: '1'
              }
            ]
          })
        if (name === config.rpc) {
          writes.push(route.request().postDataJSON())
          return route.fulfill({ json: null })
        }
        if (name === 'fms_receivable_workspace_secure')
          return route.fulfill({
            json: {
              records: [1, 2].map((index) => ({
                id: `confirm-${index}`,
                document_no: `QA-CONFIRM-${index}`,
                tenant_id: '11111111-1111-4111-8111-111111111111',
                status: 'approved',
                business_date: '2026-10-25',
                customer_name: `测试客户${index}`,
                currency_code: 'CNY',
                amount: index * 100,
                lines: []
              })),
              total: 2
            }
          })
        return route.fulfill({ json: [] })
      })
      const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
      await page.goto(
        `/tests/e2e/fixtures/receivable-workspace.html?kind=${config.kind}&theme=${theme}${interruption === 'tenant' ? '&scopeControls=1' : `&permissionControls=1${interruption === 'route' ? '&arNavigation=1' : ''}&permissions=${config.permission}:View,${config.permission}:${config.action}`}`
      )
      if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/dark/)
      await expect(page.getByText('QA-CONFIRM-2', { exact: true })).toBeVisible()
      await page.locator('.el-table__header-wrapper label.el-checkbox').first().click()
      const button = page.getByRole('button', { name: config.label, exact: true })
      await button.click()
      const confirmation = page.getByRole('dialog', { name: config.title, exact: true })
      await expect(confirmation).toBeVisible()
      await expect(button).toBeDisabled()
      await confirmation.getByRole('button', { name: '取消', exact: true }).click()
      await expect(confirmation).toBeHidden()
      expect(writes).toEqual([])
      if (!(await page.getByRole('checkbox', { name: '选择所有行', exact: true }).isChecked()))
        await page.locator('.el-table__header-wrapper label.el-checkbox').first().click()
      await expect(button).toBeEnabled()
      await button.click()
      await expect(confirmation).toBeVisible()
      await confirmation.screenshot({ path: info.outputPath(`${config.kind}-confirmation.png`) })
      if (interruption === 'route') {
        await page.keyboard.press('Alt+Shift+6')
        await expect(page.getByRole('heading', { name: '其他业务页面' })).toBeVisible()
        await page.keyboard.press('Alt+Shift+8')
        await expect(page.getByText('QA-CONFIRM-2', { exact: true })).toBeVisible()
      } else await page.keyboard.press(interruption === 'tenant' ? 'Alt+Shift+2' : 'Alt+Shift+7')
      await confirmation.getByRole('button', { name: '确定', exact: true }).click()
      await expect(
        page.getByText('操作范围或权限已变化，请重新查询后操作', { exact: true })
      ).toBeVisible()
      expect(writes).toEqual([])
    })

for (const kind of ['receipt', 'refund', 'payment_request'])
  test(`${kind} 两单批量首单等待期间撤权停止后续单据`, async ({ page }, info) => {
    const permission =
      kind === 'receipt'
        ? 'FinanceReceipt'
        : kind === 'refund'
          ? 'FinanceReceiptRefund'
          : 'FinanceReceivablePaymentRequest'
    const rpc =
      kind === 'receipt'
        ? 'fms_act_receipt_secure'
        : kind === 'refund'
          ? 'fms_act_receivable_refund_secure'
          : 'fms_act_receivable_payment_request_secure'
    const action = kind === 'receipt' ? 'Confirm' : 'Pay'
    const writes: unknown[] = []
    let held: Route | undefined
    let reads = 0
    await page.route('**/rest/v1/**', async (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)
      if (name === rpc) {
        writes.push(route.request().postDataJSON())
        held = route
        return
      }
      if (name === 'fms_receivable_workspace_secure') {
        reads++
        return route.fulfill({
          json: {
            records: [1, 2].map((index) => ({
              id: `batch-${index}`,
              document_no: `QA-BATCH-${index}`,
              tenant_id: '11111111-1111-4111-8111-111111111111',
              status: 'approved',
              business_date: '2026-10-25',
              currency_code: 'CNY',
              amount: index * 100,
              lines: []
            })),
            total: 2
          }
        })
      }
      return route.fulfill({ json: [] })
    })
    const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
    await page.goto(
      `/tests/e2e/fixtures/receivable-workspace.html?kind=${kind}&theme=${theme}&permissionControls=1&permissions=${permission}:View,${permission}:${action}`
    )
    if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/dark/)
    await expect(page.getByText('QA-BATCH-2', { exact: true })).toBeVisible()
    await page.locator('.el-table__header-wrapper label.el-checkbox').first().click()
    await page
      .getByRole('button', { name: kind === 'receipt' ? '确认收款' : '确认付款', exact: true })
      .click()
    await page.getByRole('dialog').getByRole('button', { name: '确定', exact: true }).click()
    await expect.poll(() => writes.length).toBe(1)
    const readsBeforeRelease = reads
    await page.keyboard.press('Alt+Shift+7')
    expect(held).toBeDefined()
    if (!held) throw new Error('首张单据请求未被拦截')
    await held.fulfill({ json: null })
    await expect(page.locator('.el-button.is-loading')).toHaveCount(0)
    // Restoring the action after its loading state clears proves the batch has settled.
    await page.keyboard.press('Alt+Shift+5')
    await expect(
      page.getByRole('button', { name: kind === 'receipt' ? '确认收款' : '确认付款', exact: true })
    ).toBeEnabled()
    expect(writes).toEqual([{ p_id: 'batch-1', p_action: kind === 'receipt' ? 'confirm' : 'pay' }])
    expect(reads).toBe(readsBeforeRelease)
    await expect(page.locator('.el-message--success')).toHaveCount(0)
  })
