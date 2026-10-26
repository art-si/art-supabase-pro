import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

test('非人民币本位币分录不被标成人民币，原币金额与汇率保持独立', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    if (name === 'fms_payable_writeoff_workspace_secure')
      return route.fulfill({
        json: {
          primary: [],
          secondary: [],
          schemes: [],
          organizations: [],
          relations: [{ value: 'payable_receivable', label: '应付应收抵销' }],
          history: [
            {
              id: 'fx',
              recordNo: 'QA-USD-BOOK',
              documentNo: 'QA-USD-DOC',
              tenantId: '11111111-1111-4111-8111-111111111111',
              supplierId: 'supplier',
              supplierName: '虚构预览往来单位',
              amount: 100,
              receivableAmount: 98,
              payableBaseAmount: 98,
              receivableBaseAmount: 98,
              currencyCode: 'EUR',
              secondaryCurrencyCode: 'USD',
              baseCurrencyCode: 'USD',
              status: 'active',
              needsVoucher: true
            }
          ]
        }
      })
    if (name === 'fms_payable_settlement_voucher_secure')
      return route.fulfill({
        json: {
          message: '美元本位币，仅展示接口返回的原币及原汇率',
          lines: [
            {
              summary: '原币应付',
              subjectCode: '2202',
              subjectName: '应付账款',
              debitAmount: 98,
              creditAmount: 0,
              baseCurrencyCode: 'USD',
              currencyCode: 'EUR',
              exchangeRate: 0.98,
              originalAmount: 100
            },
            {
              summary: '本位币应收',
              subjectCode: '1122',
              subjectName: '应收账款',
              debitAmount: 0,
              creditAmount: 98,
              baseCurrencyCode: 'USD'
            }
          ]
        }
      })
    return route.fulfill({ json: [] })
  })
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  const box = info.project.name.includes('shadow') ? 'shadow-mode' : 'border-mode'
  await page.goto(
    `/tests/e2e/fixtures/purchase-payable.html?kind=writeoff&relation=payable_receivable&tab=history&theme=${theme}&box=${box}`
  )
  await page.getByRole('button', { name: '预览凭证', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '凭证预览', exact: true })
  const row = dialog.getByRole('row').filter({ hasText: '应付账款' })
  await expect(row).toContainText('EUR')
  await expect(row).toContainText('0.98')
  await expect(row).toContainText('100.00')
  await expect(row).toContainText('US$98.00')
  await expect(dialog).not.toContainText('¥98.00')
  if (info.project.name === 'desktop-1440') {
    await dialog.screenshot({ path: '.artifacts/payable-fx-usd-book-original.png' })
    await dialog.locator('.el-table__body-wrapper .el-scrollbar__wrap').evaluate((element) => {
      element.scrollLeft = element.scrollWidth
    })
    await dialog.screenshot({ path: '.artifacts/payable-fx-usd-book-base.png' })
  }
  expect(errors).toEqual([])
})
