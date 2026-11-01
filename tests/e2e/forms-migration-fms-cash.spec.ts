import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(120_000)
const tenantId = '11111111-1111-4111-8111-111111111111',
  recordId = '44444444-4444-4444-8444-444444444444',
  partyId = '55555555-5555-4555-8555-555555555555',
  statementId = '66666666-6666-4666-8666-666666666666',
  fundAccountId = '77777777-7777-4777-8777-777777777777'

for (const direction of ['receipt', 'payment'] as const)
  for (const mode of ['create', 'allocate'] as const)
    test(`${direction} ${mode} 实际保存并按内容密度选择页签`, async ({ page }, info) => {
      await prepareIsolatedSession(page)
      const receipt = direction === 'receipt',
        label = receipt ? '收款' : '付款',
        party = receipt ? '验收客户' : '验收承运商',
        errors: string[] = [],
        submissions: Record<string, unknown>[] = [],
        rpc =
          mode === 'create'
            ? `create_fms_${receipt ? 'customer_receipt' : 'carrier_payment'}_secure`
            : `allocate_tms_${receipt ? 'customer_receipt' : 'carrier_payment'}_secure`
      page.on('pageerror', (error) => errors.push(error.message))
      await page.route('**/rest/v1/**', async (route) => {
        const path = new URL(route.request().url()).pathname
        if (path.endsWith('/' + rpc)) {
          submissions.push(route.request().postDataJSON())
          return route.fulfill({ json: mode === 'create' ? recordId : 1 })
        }
        if (path.includes('statement_allocatable_secure'))
          return route.fulfill({
            json: {
              records: [
                {
                  id: statementId,
                  tenantId,
                  statementNo: 'ST-001',
                  customerId: partyId,
                  carrierId: partyId,
                  periodStart: '2026-11-01',
                  periodEnd: '2026-11-30',
                  statementAmount: 100,
                  settledAmount: 0,
                  outstandingAmount: 100,
                  waybillCount: 1,
                  costCount: 1,
                  status: 'confirmed'
                }
              ],
              total: 1
            }
          })
        if (path.endsWith('fms_list_fund_account_options_secure'))
          return route.fulfill({
            json: [
              {
                id: fundAccountId,
                tenantId,
                accountName: '验收银行账户',
                accountType: 'bank',
                currency: 'CNY',
                status: 'active'
              }
            ]
          })
        if (path.includes('carrier') && path.includes('options'))
          return route.fulfill({
            json: [
              {
                id: partyId,
                tenantId,
                companyName: party,
                carrierCode: 'CARRIER-001',
                status: 'active'
              }
            ]
          })
        if (path.includes('customer') && path.includes('selector'))
          return route.fulfill({
            json: {
              records: [
                {
                  id: partyId,
                  tenantId,
                  customerName: party,
                  customerCode: 'CUSTOMER-001',
                  status: 'active'
                }
              ],
              total: 1
            }
          })
        return route.fulfill({ json: [] })
      })
      const row = {
        id: recordId,
        tenantId,
        transactionNo: 'CASH-001',
        direction,
        customerId: partyId,
        carrierId: partyId,
        counterpartyName: party,
        transactionDate: '2026-11-01',
        amount: 100,
        allocatedAmount: 0,
        allocatableAmount: 100,
        unallocatedAmount: 100,
        allocationCount: 0,
        paymentMethod: 'bank_transfer',
        status: 'pending_allocation',
        voucherUrls: [],
        fieldAccess: { transactionAmounts: 'edit' }
      }
      await page.addInitScript(
        (input) => {
          window.formsMigrationInput = input
        },
        {
          args: mode === 'create' ? [] : [row],
          dicts: {
            tmsCashPaymentMethod: [
              {
                label: '银行转账',
                value: 'bank_transfer',
                code: 'bank_transfer',
                status: '1',
                sort: 1
              }
            ]
          }
        }
      )
      await page.goto(
        '/tests/e2e/fixtures/forms-migration-business.html?entry=' +
          encodeURIComponent(
            `modules/art-supabase-fms/src/views/settlement/cash-transaction/modules/${receipt ? 'customer-receipt' : 'carrier-payment'}-dialog.vue`
          )
      )
      const dialog = page.locator('.el-dialog:visible').first(),
        tabs = dialog.getByRole('tab'),
        confirm = dialog.locator('.el-dialog__footer button').last()
      await expect(dialog).toBeVisible({ timeout: 60_000 })
      await expect(page.getByTestId('open-error')).toBeEmpty()
      await expect(confirm).toBeEnabled({ timeout: 30_000 })
      if (mode === 'create') {
        await expect(tabs).toHaveCount(2)
        await page
          .getByPlaceholder(receipt ? '请选择收款客户' : '请选择承运商', { exact: true })
          .click()
        const selector = page.locator('.el-dialog:visible').last()
        await selector.getByRole('row').filter({ hasText: party }).click()
        await selector.getByRole('button', { name: '确定', exact: true }).click()
        await dialog.getByRole('combobox', { name: label + '账户', exact: true }).click()
        await page.getByRole('option', { name: '验收银行账户', exact: true }).click()
        const amount = dialog.getByRole('spinbutton', {
          name: new RegExp('^\\*?\\s*' + label + '金额$')
        })
        await amount.fill('')
        await amount.press('Tab')
        await amount.evaluate((node) => node.setAttribute('data-cash-control', 'preserved'))
        await tabs.last().click()
        await expect(amount).toBeHidden()
        await expect(page.locator('[data-cash-control]')).toHaveCount(1)
        await confirm.click()
        await expect(amount).toBeVisible()
        await expect(amount).toBeFocused()
        expect(submissions).toHaveLength(0)
        await amount.fill('100')
        await amount.press('Tab')
        await tabs.last().click()
      } else {
        await expect(tabs).toHaveCount(0)
        await confirm.click()
        await expect(page.getByText('请至少填写一条核销金额', { exact: true })).toBeVisible()
        expect(submissions).toHaveLength(0)
        await dialog
          .getByRole('textbox', {
            name: receipt ? '请选择需要核销的对账单' : '可选择一份或多份对账单',
            exact: true
          })
          .click()
        const selector = page.locator('.el-dialog:visible').last(),
          statement = selector.getByRole('row').filter({ hasText: 'ST-001' })
        await statement.locator('.el-checkbox').click()
        await expect(statement.getByRole('checkbox')).toBeChecked()
        await selector.getByRole('button', { name: '确定', exact: true }).click()
        const allocation = dialog
          .locator('.el-table__body-wrapper')
          .getByRole('row')
          .filter({ hasText: 'ST-001' })
        await expect(allocation.getByRole('spinbutton')).toHaveValue('100.00')
      }
      await page.screenshot({ path: info.outputPath('cash-form.png'), animations: 'disabled' })
      await confirm.click()
      await expect.poll(() => submissions.length).toBe(1)
      await expect(page.getByTestId('successes')).toHaveText('1')
      if (mode === 'create')
        expect(submissions[0]).toMatchObject({
          [receipt ? 'p_customer_id' : 'p_carrier_id']: partyId,
          p_fund_account_id: fundAccountId,
          p_amount: 100,
          p_payment_method: 'bank_transfer',
          p_allocations: [],
          p_voucher_urls: []
        })
      else
        expect(submissions[0]).toEqual({
          p_transaction_id: recordId,
          p_allocations: [{ statementId, amount: 100 }]
        })
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
      ).toBe(true)
      expect(errors).toEqual([])
    })
