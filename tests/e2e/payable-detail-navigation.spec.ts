import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(150000)

for (const [kind, title, permission] of [
  ['estimated', '暂估应付单', 'FinanceEstimatedPayable'],
  ['financial', '财务应付单', 'FinancePurchasePayable'],
  ['application', '付款申请单', 'FinancePayableApplication'],
  ['payment', '付款单', 'FinancePayablePayment'],
  ['refund', '付款退款单', 'FinancePayableRefund']
]) {
  for (const action of ['查看', '编辑']) {
    test(`${kind} ${action}读取期间离开及返回，当前页失败后可重试`, async ({ page }, info) => {
      let release: (() => void) | undefined
      let holdRead = true
      let failRead = false
      let reads = 0
      let writes = 0
      const purchase = kind === 'estimated' || kind === 'financial'
      const records = [1, 2].map((index) => ({
        id: `detail-${index}`,
        record_key: `detail-${index}`,
        tenant_id: '11111111-1111-4111-8111-111111111111',
        document_no: `QA-DETAIL-${index}`,
        kind,
        status: 'draft',
        frozen: false,
        is_reversal: false,
        source_type: 'manual',
        payment_plans: [],
        document_type_id: 'type',
        amount: index * 100,
        tax_amount: 0,
        total_amount: index * 100,
        payment_status: 'none',
        currency_code: 'CNY',
        business_date: '2026-10-24',
        reason: `隔离详情${index}`,
        details: {},
        lines: []
      }))
      await page.route('**/rest/v1/**', async (route) => {
        const name = new URL(route.request().url()).pathname.split('/').at(-1)
        const input = route.request().postDataJSON()
        if (
          name ===
          (purchase ? 'fms_purchase_payable_list_secure' : 'fms_payable_settlement_list_secure')
        ) {
          const id = purchase ? input.p_id : input.p_query?.id
          if (id) {
            reads++
            if (holdRead)
              await new Promise<void>((resolve) => {
                release = resolve
              })
            if (failRead)
              return route.fulfill({
                status: 409,
                json: { code: 'P0001', message: '单据读取失败，请重试' }
              })
          }
          const data = id ? records.filter((row) => row.id === id) : records
          return route.fulfill({ json: { data, total: data.length } })
        }
        if (name === 'fms_payable_currency_context_secure')
          return route.fulfill({
            json: {
              configured: true,
              account_set_id: 'book',
              account_set_name: '隔离账套',
              base_currency_code: 'CNY',
              exchange_rate: 1,
              currencies: [{ id: 'CNY', code: 'CNY', name: '人民币' }]
            }
          })
        if (name === 'fms_payable_options_secure')
          return route.fulfill({
            json: input.p_kind === `${kind}_type` ? [{ id: 'type', name: title }] : []
          })
        if (name === 'fms_payable_settlement_options_secure')
          return route.fulfill({
            json: {
              tenant_id: records[0].tenant_id,
              supplier: [],
              purpose: [],
              method: [],
              fund: [],
              document_type: [{ id: 'type', name: title, is_default: true }],
              project: [],
              organization: [],
              currency: [{ id: 'CNY', code: 'CNY', name: '人民币' }],
              payable: [],
              purchase: [],
              expense: [],
              bank: [],
              refund_source: []
            }
          })
        if (name?.startsWith('fms_save_') || name?.startsWith('fms_act_')) writes++
        return route.fulfill({ json: [] })
      })
      for (const index of [1, 2]) {
        release = undefined
        holdRead = true
        await page.goto(
          `/tests/e2e/fixtures/purchase-payable.html?kind=${kind}&navigationTest=1&keepAlive=1&permissions=${permission}:View,${permission}:Edit`
        )
        await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible({
          timeout: 60000
        })
        if (info.project.use.colorScheme === 'dark')
          await expect(page.locator('html')).toHaveClass(/dark/)
        const row = page.getByRole('row').filter({ hasText: `QA-DETAIL-${index}` })
        await row.getByRole('button', { name: action, exact: true }).click()
        await expect.poll(() => Boolean(release)).toBe(true)
        await page.getByRole('button', { name: '打开其他页面', exact: true }).click()
        await expect(page.getByRole('heading', { name: '其他业务页面' })).toBeVisible()
        if (index === 2) await page.getByRole('button', { name: '返回来源页面' }).click()
        release?.()
        await page.waitForLoadState('networkidle')
        await expect(page.getByRole('dialog')).toHaveCount(0)
        if (index === 1) await page.getByRole('button', { name: '返回来源页面' }).click()
        holdRead = false
        failRead = true
        await row.getByRole('button', { name: action, exact: true }).click()
        await expect(page.locator('.el-message--error').last()).toContainText('单据读取失败')
        await expect(page.getByRole('dialog')).toHaveCount(0)
        failRead = false
        await row.getByRole('button', { name: action, exact: true }).click()
        const drawer = page.getByRole('dialog', {
          name: purchase && action === '查看' ? `${title}详情` : `${action}${title}`,
          exact: true
        })
        await expect(drawer).toContainText(`QA-DETAIL-${index}`)
        await expect(drawer.getByRole('button', { name: '保存', exact: true })).toHaveCount(
          action === '编辑' ? 1 : 0
        )
        await expect(page.locator('.el-message--error')).toHaveCount(0)
        if (index === 2) await drawer.screenshot({ path: info.outputPath('current-detail.png') })
        await drawer.getByRole('button', { name: '关闭此对话框', exact: true }).click()
        await expect(drawer).not.toBeVisible()
        if (action === '编辑') {
          if (index === 1) records[index - 1].status = 'approved'
          else if (purchase) records[index - 1].is_reversal = true
          else records[index - 1].frozen = true
          await row.getByRole('button', { name: action, exact: true }).click()
          await expect(page.locator('.el-message--warning').last()).toContainText('单据状态已变化')
          await expect(page.getByRole('dialog')).toHaveCount(0)
          await expect(row.getByRole('button', { name: '编辑', exact: true })).toHaveCount(0)
        }
      }
      if (action === '编辑' && purchase) {
        records[1].is_reversal = false
        await page.getByRole('button', { name: '查询', exact: true }).click()
        const row = page.getByRole('row').filter({ hasText: 'QA-DETAIL-2' })
        await expect(row.getByRole('button', { name: '编辑', exact: true })).toBeVisible()
        records[1].source_type = 'carrier_statement'
        await row.getByRole('button', { name: '编辑', exact: true }).click()
        await expect(page.locator('.el-message--warning').last()).toContainText('单据状态已变化')
        await expect(page.getByRole('dialog')).toHaveCount(0)
        await expect(row.getByRole('button', { name: '编辑', exact: true })).toHaveCount(0)
      }
      expect(reads).toBe(action === '编辑' ? (purchase ? 9 : 8) : 6)
      expect(writes).toBe(0)
    })
  }
}
