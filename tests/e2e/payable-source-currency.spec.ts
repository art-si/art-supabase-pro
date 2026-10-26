import { expect, test } from '@playwright/test'
import { captureBusinessEvidence } from './support/capture-business-evidence'

test.use({ storageState: { cookies: [], origins: [] } })

for (const [kind, title] of [
  ['application', '付款申请单'],
  ['payment', '付款单'],
  ['refund', '付款退款单']
] as const) {
  test(`${title} 两张新单从外币来源带入上下文并阻断混币及跨账套来源`, async ({ page }, info) => {
    const failures: string[] = []
    page.on('pageerror', (error) => failures.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') failures.push(message.text())
    })
    const tenant = '11111111-1111-4111-8111-111111111111'
    const sources = [1, 2, 3, 4].map((index) => ({
      id: `source-${index}`,
      code: `QA-AP-${index}`,
      name: `虚构来源单位${index}`,
      supplier_id: `supplier-${index}`,
      payee_supplier_id:
        index === 1 ? 'supplier-2' : index === 2 ? 'supplier-1' : `supplier-${index}`,
      payee_supplier_name:
        index === 1 ? '虚构来源单位2' : index === 2 ? '虚构来源单位1' : `虚构来源单位${index}`,
      currency_code: index === 4 ? 'EUR' : 'USD',
      base_currency_code: 'CNY',
      account_set_id: index === 3 ? 'other-book' : 'source-book',
      account_set_name: index === 3 ? '其他账套' : '原账套',
      amount: index * 100,
      balance: index === 1 ? null : undefined,
      exchange_rate: 123
    }))
    const refundSources = sources.map((source, index) => ({
      ...source,
      id: `payment-line-${index + 1}`,
      line_no: (index + 1) * 10,
      refund_payment_line_id: `payment-line-${index + 1}`,
      refund_payment_document_no: `QA-PAYMENT-${index + 1}`,
      source_purpose_business_type: 'purchase',
      available_refund_amount: source.amount,
      available_refund_discount: 0,
      counterparty_balance: source.balance,
      counterparty_balance_currency_code: 'CNY',
      payee_supplier_id: source.payee_supplier_id,
      supplier_name: source.name,
      payee_supplier_name: source.payee_supplier_name,
      settlement_method_id: 'cash',
      fund_account_id: 'usd-cash',
      details: {}
    }))
    interface Draft {
      id: string
      kind: string
      currency_code: string
      base_currency_code: string
      account_set_id: string
      exchange_rate: number | null
      lines: Array<{
        id?: string
        payable_id?: string
        refund_payment_line_id?: string
        fund_account_id: string
        payee_supplier_id?: string
        counterparty_balance?: number | null
        amount: number
      }>
    }
    const saved: Draft[] = []
    await page.route('**/rest/v1/**', (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)
      const body: { p_document?: Draft } = route.request().postDataJSON() || {}
      if (name === 'fms_payable_settlement_list_secure')
        return route.fulfill({ json: { data: saved, total: saved.length } })
      if (name === 'fms_payable_settlement_options_secure')
        return route.fulfill({
          json: {
            tenant_id: tenant,
            supplier: sources.map((source) => ({
              id: source.supplier_id,
              code: source.supplier_id,
              name: source.name,
              amount: 999
            })),
            purpose: [
              {
                id: 'purpose',
                code: '201',
                name: kind === 'refund' ? '退采购付款' : '采购付款',
                business_type: kind === 'refund' ? 'purchase_refund' : 'purchase'
              }
            ],
            method: [{ id: 'cash', code: 'JSFS01', name: '现金', category: 'cash' }],
            fund: [
              {
                id: 'usd-cash',
                code: 'QA-USD-CASH',
                name: '原账套美元现金',
                currency_code: 'USD',
                account_set_id: 'source-book',
                account_set_name: '原账套',
                category: 'cash'
              }
            ],
            document_type: [{ id: 'type', code: 'TYPE', name: title, is_default: true }],
            currency: ['CNY', 'USD', 'EUR'].map((currency) => ({
              id: currency,
              code: currency,
              name: currency
            })),
            project: [],
            organization: [],
            purchase: [],
            expense: [],
            bank: [],
            payable: kind === 'refund' ? [] : sources,
            refund_source: kind === 'refund' ? refundSources : []
          }
        })
      if (name === 'fms_save_payable_settlement_secure') {
        const document = body.p_document
        expect(document).toBeDefined()
        if (!document) throw new Error('Missing payment draft')
        expect(document.currency_code).toBe('USD')
        expect(document.base_currency_code).toBe('CNY')
        expect(document.account_set_id).toBe('source-book')
        expect(document.exchange_rate).toBe(saved.length === 0 ? 7.2 : 7.4)
        expect(
          document.lines.map((line) =>
            kind === 'refund' ? line.refund_payment_line_id : line.payable_id
          )
        ).toEqual(
          kind === 'refund' ? ['payment-line-1', 'payment-line-2'] : ['source-1', 'source-2']
        )
        expect(document.lines.every((line) => line.fund_account_id === 'usd-cash')).toBe(true)
        expect(document.lines.map((line) => line.payee_supplier_id)).toEqual([
          'supplier-2',
          'supplier-1'
        ])
        expect(document.lines[0].counterparty_balance).toBeNull()
        const id = `saved-${saved.length + 1}`
        const record = {
          ...document,
          id,
          tenant_id: tenant,
          record_key: id,
          document_no: `QA-${kind}-${saved.length + 1}`,
          status: 'draft',
          version: 1,
          amount: 300,
          payment_status: 'none'
        }
        saved.push(record)
        return route.fulfill({ json: record })
      }
      return route.fulfill({ json: [] })
    })
    const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
    const box = info.project.name.includes('shadow') ? 'shadow-mode' : 'border-mode'
    await page.goto(
      `/tests/e2e/fixtures/purchase-payable.html?kind=${kind}&theme=${theme}&box=${box}`,
      { waitUntil: 'domcontentloaded' }
    )
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
    for (const documentIndex of [0, 1]) {
      await page.getByRole('button', { name: '新增', exact: true }).click()
      const drawer = page.getByRole('dialog', { name: `新增${title}`, exact: true })
      await expect(drawer.locator('.el-skeleton:visible')).toHaveCount(0)
      await expect(drawer.getByRole('button', { name: '保存', exact: true })).toBeEnabled()
      for (const lineIndex of [0, 1]) {
        await drawer.getByRole('button', { name: '新增明细', exact: true }).click()
        await drawer
          .getByRole('combobox', {
            name: kind === 'refund' ? '原付款明细' : '来源单据',
            exact: true
          })
          .nth(lineIndex)
          .press('Enter')
        if (lineIndex === 1) {
          const prefix = kind === 'refund' ? 'QA-PAYMENT' : 'QA-AP'
          await expect(
            page.getByRole('option', { name: new RegExp(`${prefix}-3`) })
          ).toHaveAttribute('aria-disabled', 'true')
          await expect(
            page.getByRole('option', { name: new RegExp(`${prefix}-4`) })
          ).toHaveAttribute('aria-disabled', 'true')
          if (documentIndex === 0)
            await captureBusinessEvidence(page, {
              path: `.artifacts/payable-source-currency-${kind}-${info.project.name}.png`
            })
        }
        await page
          .getByRole('option', {
            name: new RegExp(`${kind === 'refund' ? 'QA-PAYMENT' : 'QA-AP'}-${lineIndex + 1}`)
          })
          .click()
        await drawer
          .getByRole('combobox', {
            name: kind === 'refund' ? '退款收款账户' : '付款账号',
            exact: true
          })
          .nth(lineIndex)
          .press('Enter')
        await page.getByRole('option', { name: /原账套美元现金/ }).click()
      }
      await expect(drawer).toContainText('原账套')
      const rate = drawer.getByRole('spinbutton', { name: /^\*?\s*记账汇率$/ })
      await expect(rate).toHaveValue('')
      await rate.fill(documentIndex === 0 ? '7.2' : '7.4')
      await rate.blur()
      const currencyLabel =
        kind === 'refund' ? '退款币种' : kind === 'application' ? '结算币种' : '付款币种'
      const currency = drawer.getByRole('combobox', { name: currencyLabel, exact: true })
      await expect(
        drawer.locator('.el-form-item').filter({ hasText: currencyLabel })
      ).toContainText('USD')
      await expect(currency).toBeDisabled()
      await drawer.getByRole('button', { name: '保存', exact: true }).click()
      await expect(drawer).not.toBeVisible()
    }
    expect(saved).toHaveLength(2)
    expect(failures).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}
