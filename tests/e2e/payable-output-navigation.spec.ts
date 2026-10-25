import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(120000)

for (const [kind, title, permission] of [
  ['estimated', '暂估应付单', 'FinanceEstimatedPayable'],
  ['financial', '财务应付单', 'FinancePurchasePayable'],
  ['payment', '付款单', 'FinancePayablePayment'],
  ['refund', '付款退款单', 'FinancePayableRefund']
]) {
  const purchase = kind === 'estimated' || kind === 'financial'
  for (const operation of purchase ? ['voucher', 'print', 'generate'] : ['voucher', 'print']) {
    test(`${kind} ${operation}等待期间离开或返回，不打开旧内容`, async ({ page }, info) => {
      let release: (() => void) | undefined
      let outputRequests = 0
      let popups = 0
      let holdOutput = true
      let failOutput = false
      let voucherContextReads = 0
      await page.exposeFunction('recordPrintPopup', () => popups++)
      await page.addInitScript(() => {
        window.open = () => {
          void Reflect.get(window, 'recordPrintPopup')()
          return null
        }
      })
      const records = [1, 2].map((index) => ({
        id: `output-${index}`,
        record_key: `output-${index}`,
        document_no: `QA-OUTPUT-${index}`,
        kind,
        status: purchase ? 'approved' : 'confirmed',
        amount: index * 100,
        tax_amount: 0,
        total_amount: index * 100,
        payment_status: 'full',
        currency_code: 'CNY',
        business_date: '2026-10-24',
        lines: []
      }))
      await page.route('**/rest/v1/**', async (route) => {
        const name = new URL(route.request().url()).pathname.split('/').at(-1)
        const input = route.request().postDataJSON() || {}
        const id = purchase ? input.p_id : input.p_query?.id
        const listEndpoint = purchase
          ? 'fms_purchase_payable_list_secure'
          : 'fms_payable_settlement_list_secure'
        if (purchase && name === listEndpoint && String(id).startsWith('voucher-'))
          voucherContextReads++
        const outputRequest =
          operation === 'print'
            ? name === listEndpoint && id
            : operation === 'generate'
              ? name === 'fms_payable_voucher_secure'
              : name ===
                (purchase
                  ? 'fms_preview_payable_voucher_secure'
                  : 'fms_payable_settlement_voucher_secure')
        if (outputRequest) {
          outputRequests++
          if (holdOutput)
            await new Promise<void>((resolve) => {
              release = resolve
            })
          if (failOutput)
            return route.fulfill({
              status: 409,
              json: { code: 'P0001', message: '凭证处理失败，请重试' }
            })
        }
        if (name === 'fms_payable_voucher_secure')
          return route.fulfill({
            json: {
              voucher_id: `voucher-${input.p_id}`,
              status: 'generated',
              event_id: `event-${input.p_id}`,
              message: '凭证已生成'
            }
          })
        if (
          name === 'fms_payable_settlement_voucher_secure' ||
          name === 'fms_preview_payable_voucher_secure'
        )
          return route.fulfill({
            json: {
              status: 'preview',
              message: '延迟凭证预览',
              lines: [
                {
                  summary: `QA-PREVIEW-${input.p_id}`,
                  subject_code: '660201',
                  subject_name: '管理费用',
                  debit_amount: 100,
                  credit_amount: 0
                },
                {
                  summary: `QA-PREVIEW-${input.p_id}`,
                  subject_code: '220201',
                  subject_name: '应付账款',
                  debit_amount: 0,
                  credit_amount: 100
                }
              ]
            }
          })
        if (name === listEndpoint) {
          const data = id ? records.filter((row) => row.id === id) : records
          return route.fulfill({ json: { data, total: data.length } })
        }
        return route.fulfill({ json: [] })
      })
      for (const index of [1, 2]) {
        release = undefined
        await page.goto(
          `/tests/e2e/fixtures/purchase-payable.html?kind=${kind}&navigationTest=1&keepAlive=1&permissions=${permission}:View,${permission}:Voucher,${permission}:Print,FinanceVoucherCenter:View`
        )
        await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible({
          timeout: 60000
        })
        if (info.project.use.colorScheme === 'dark')
          await expect(page.locator('html')).toHaveClass(/dark/)
        else await expect(page.locator('html')).not.toHaveClass(/dark/)
        await page
          .getByRole('row')
          .filter({ hasText: `QA-OUTPUT-${index}` })
          .locator('label.el-checkbox')
          .click()
        if (operation === 'voucher' || operation === 'generate') {
          await page.getByRole('button', { name: '生成凭证', exact: true }).click()
          await page
            .getByRole('menuitem', {
              name: operation === 'voucher' ? '预览凭证' : '生成凭证',
              exact: true
            })
            .click()
        } else await page.getByRole('button', { name: '打印', exact: true }).click()
        await expect.poll(() => Boolean(release)).toBe(true)
        await page.getByRole('button', { name: '打开其他页面', exact: true }).click()
        await expect(page.getByRole('heading', { name: '其他业务页面' })).toBeVisible()
        if (index === 2) await page.getByRole('button', { name: '返回来源页面' }).click()
        release?.()
        await page.waitForLoadState('networkidle')
        await expect(
          page.getByRole('heading', { name: index === 1 ? '其他业务页面' : title, exact: true })
        ).toBeVisible()
        await expect(page.getByRole('dialog', { name: '凭证预览' })).toHaveCount(0)
        expect(popups).toBe(0)
      }
      if (purchase && operation !== 'print') {
        holdOutput = false
        for (const index of [1, 2]) {
          await page.goto(
            `/tests/e2e/fixtures/purchase-payable.html?kind=${kind}&keepAlive=1&permissions=${permission}:View,${permission}:Voucher,FinanceVoucherCenter:View`
          )
          await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible({
            timeout: 60000
          })
          await page
            .getByRole('row')
            .filter({ hasText: `QA-OUTPUT-${index}` })
            .locator('label.el-checkbox')
            .click()
          const invoke = async () => {
            await page.getByRole('button', { name: '生成凭证', exact: true }).click()
            await page
              .getByRole('menuitem', {
                name: operation === 'voucher' ? '预览凭证' : '生成凭证',
                exact: true
              })
              .click()
          }
          failOutput = true
          await invoke()
          await expect(page.locator('.el-message--error').last()).toContainText('凭证处理失败')
          await expect(page.getByRole('dialog', { name: '凭证预览' })).toHaveCount(0)
          await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
          failOutput = false
          await invoke()
          if (operation === 'voucher') {
            const dialog = page.getByRole('dialog', { name: '凭证预览' })
            await expect(dialog).toContainText(`QA-PREVIEW-output-${index}`)
            await expect(dialog.getByRole('row')).toHaveCount(3)
            await expect(page.locator('.el-message--error')).toHaveCount(0)
            if (index === 2)
              await dialog.screenshot({ path: info.outputPath('current-preview.png') })
            await dialog.getByRole('button', { name: '关闭此对话框' }).click()
            await expect(dialog).not.toBeVisible()
          } else {
            await expect(
              page.getByRole('heading', { name: '凭证中心导航目标', exact: true })
            ).toBeVisible()
            await expect(page.getByText(`voucher-output-${index}`, { exact: true })).toBeVisible()
          }
        }
      }
      expect(outputRequests).toBe(purchase && operation !== 'print' ? 6 : 2)
      expect(voucherContextReads).toBe(0)
    })
  }
}
