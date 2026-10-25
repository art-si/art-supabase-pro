import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(120000)

test('收款退款来源状态余额与迟到读取保护', async ({ page }, info) => {
  const records = [
    { status: 'draft', refundable_amount: 100 },
    { status: 'submitted', refundable_amount: 100 },
    { status: 'approved', refundable_amount: 100 },
    { status: 'confirmed', refundable_amount: 0 },
    { status: 'confirmed', refundable_amount: 100, supplier_id: 'supplier-1' },
    { status: 'confirmed', refundable_amount: null },
    { status: 'confirmed', refundable_amount: 100 },
    { status: 'confirmed', refundable_amount: 200 }
  ].map((row, i) => ({
    ...row,
    id: `receipt-${i}`,
    document_no: `QA-REFUND-SOURCE-${i}`,
    tenant_id: '11111111-1111-4111-8111-111111111111',
    customer_id: i === 4 ? null : 'customer-1',
    customer_name: '验收客户',
    amount: 200,
    currency_code: 'CNY',
    business_date: '2026-10-25',
    lines: []
  }))
  let stale = false
  let hold = false
  let release = () => {}
  let detailReads = 0
  let detailFinished = 0
  const writes: string[] = []
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request()
    const name = new URL(request.url()).pathname.split('/').at(-1) || ''
    const body = request.postData() ? request.postDataJSON() : {}
    if (name === 'fms_receivable_workspace_secure') {
      const ids = body.p_query?.ids as string[] | undefined
      if (ids) {
        detailReads++
        if (hold)
          await new Promise<void>((resolve) => {
            release = resolve
          })
      }
      await route.fulfill({
        json: {
          records: records
            .filter((row) => !ids || ids.includes(row.id))
            .map((row) => (ids && stale ? { ...row, status: 'approved' } : row)),
          total: ids ? 1 : records.length
        }
      })
      if (ids) detailFinished++
      return
    }
    if (/save_|act_/.test(name)) writes.push(name)
    return route.fulfill({ json: [] })
  })
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  await page.goto(
    `/tests/e2e/fixtures/receivable-workspace.html?kind=receipt&arNavigation=1&theme=${theme}&permissions=FinanceReceipt:View,FinanceReceiptRefund:Add`
  )
  await expect(page.getByText('QA-REFUND-SOURCE-0', { exact: true })).toBeVisible({
    timeout: 60000
  })
  const select = (i: number) =>
    page
      .getByRole('row')
      .filter({ hasText: `QA-REFUND-SOURCE-${i}` })
      .locator('label.el-checkbox')
      .click()
  const refund = page.getByRole('button', { name: '收款退款', exact: true })
  for (let i = 0; i < records.length; i++) {
    await select(i)
    if (i >= 6) await expect(refund).toBeEnabled()
    else await expect(refund).toBeDisabled()
    await select(i)
  }
  for (const i of [6, 7]) {
    await select(i)
    await refund.click()
    const drawer = page.getByRole('dialog', { name: '新增收款退款', exact: true })
    await expect(drawer.getByRole('textbox', { name: /原收款单/ })).toHaveValue(
      `QA-REFUND-SOURCE-${i}`
    )
    await expect(drawer.getByRole('spinbutton', { name: /退款金额/ })).toHaveValue('0.00')
    await expect(page.locator('.el-message')).toHaveCount(0)
    await drawer.screenshot({ path: info.outputPath(`refund-source-${i}.png`) })
    await drawer.getByRole('button', { name: '取消', exact: true }).click()
    await expect(drawer).toBeHidden()
    await select(i)
  }
  stale = true
  await select(6)
  await refund.click()
  await expect(
    page.getByText('收款状态或可退余额已变化，请重新查询后操作', { exact: true })
  ).toBeVisible()
  await expect(page.getByRole('dialog', { name: '新增收款退款', exact: true })).toHaveCount(0)
  stale = false
  hold = true
  const before = detailReads
  await refund.click()
  await expect.poll(() => detailReads).toBe(before + 1)
  await page.getByRole('button', { name: '打开其他页面', exact: true }).click()
  await expect(page.getByRole('heading', { name: '其他业务页面', exact: true })).toBeVisible()
  release()
  await expect.poll(() => detailFinished).toBe(detailReads)
  await expect(page.getByRole('dialog', { name: '新增收款退款', exact: true })).toHaveCount(0)
  expect(writes).toHaveLength(0)
})
