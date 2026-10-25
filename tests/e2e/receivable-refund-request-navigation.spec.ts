import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(150000)

for (const delayed of [true, false]) {
  test(`收款退款生成申请${delayed ? '等待离开及返回' : '两条失败重试'}`, async ({ page }, info) => {
    const sources = [1, 2].map((i) => ({
      id: `refund-${i}`,
      tenant_id: '11111111-1111-4111-8111-111111111111',
      document_no: `QA-REFUND-${i}`,
      status: 'approved',
      customer_name: '隔离客户',
      currency_code: 'CNY',
      business_date: '2026-10-24',
      amount: i * 100,
      lines: []
    }))
    const targets: Array<Record<string, unknown>> = []
    const calls: string[] = []
    const reads: string[] = []
    let release: (() => void) | undefined
    let fail = !delayed
    await page.route('**/rest/v1/**', async (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)
      const input = route.request().postData() ? route.request().postDataJSON() : {}
      if (name === 'fms_receivable_workspace_secure') {
        const query = input.p_query ?? {}
        const source = input.p_kind === 'refund'
        if (!source && query.id) reads.push(query.id)
        const records = (source ? sources : targets).filter(
          (row) => !query.id || row.id === query.id
        )
        return route.fulfill({ json: { records, total: records.length } })
      }
      if (name === 'fms_act_receivable_refund_secure') {
        expect(input.p_action).toBe('request')
        calls.push(input.p_id)
        if (delayed)
          await new Promise<void>((resolve) => {
            release = resolve
          })
        if (fail) {
          fail = false
          return route.fulfill({
            status: 409,
            json: { code: 'P0001', message: '付款申请生成失败，请重试' }
          })
        }
        const source = sources.find((row) => row.id === input.p_id)
        expect(source).toBeDefined()
        const id = `request-${input.p_id}`
        targets.push({
          ...source,
          id,
          document_no: `QA-REQUEST-${input.p_id}`,
          status: 'draft',
          exchange_rate: 1,
          payment_purpose: 'refund',
          source_no: source?.document_no
        })
        return route.fulfill({ json: id })
      }
      return route.fulfill({ json: [] })
    })
    const grants = [
      'FinanceReceiptRefund:View',
      'FinanceReceiptRefund:PaymentRequest',
      'FinanceReceivablePaymentRequest:View'
    ].join(',')
    const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
    for (const i of [1, 2]) {
      release = undefined
      await page.goto(
        `/tests/e2e/fixtures/receivable-workspace.html?kind=refund&arNavigation=1&theme=${theme}&permissions=${grants}`
      )
      await expect(page.getByRole('heading', { name: '收款退款单', exact: true })).toBeVisible({
        timeout: 60000
      })
      if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/dark/)
      await page
        .getByRole('row')
        .filter({ hasText: `QA-REFUND-${i}` })
        .locator('label.el-checkbox')
        .click()
      await page.getByRole('button', { name: '生成付款申请', exact: true }).click()
      if (delayed) {
        await expect.poll(() => Boolean(release)).toBe(true)
        await page.getByRole('button', { name: '打开其他页面', exact: true }).click()
        await expect(page.getByRole('heading', { name: '其他业务页面', exact: true })).toBeVisible()
        if (i === 2) await page.getByRole('button', { name: '返回来源页面', exact: true }).click()
        release?.()
        await page.waitForLoadState('networkidle')
        await expect(
          page.getByRole('heading', { name: i === 1 ? '其他业务页面' : '收款退款单', exact: true })
        ).toBeVisible()
        expect(reads).toHaveLength(0)
      } else {
        if (i === 1) {
          await expect(page.locator('.el-message--error').last()).toContainText('付款申请生成失败')
          expect(targets).toHaveLength(0)
          await page
            .getByRole('row')
            .filter({ hasText: `QA-REFUND-${i}` })
            .locator('label.el-checkbox')
            .click()
          await page.getByRole('button', { name: '生成付款申请', exact: true }).click()
        }
        const dialog = page.getByRole('dialog', { name: '应收付款申请详情', exact: true })
        await expect(dialog).toContainText(`QA-REQUEST-refund-${i}`)
        await expect(dialog).not.toContainText(`QA-REQUEST-refund-${i === 1 ? 2 : 1}`)
        expect(reads).toContain(`request-refund-${i}`)
      }
    }
    expect(calls).toEqual(delayed ? ['refund-1', 'refund-2'] : ['refund-1', 'refund-1', 'refund-2'])
    expect(targets).toHaveLength(2)
  })
}
