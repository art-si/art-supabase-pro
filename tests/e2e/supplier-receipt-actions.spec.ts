import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(120000)
test('两条供应商收款预览生成与取消，客户不显示入口', async ({ page }, info) => {
  const records = [1, 2, 3].map((i) => ({
    id: `receipt-${i}`,
    document_no: `QA-SR-${i}`,
    tenant_id: '11111111-1111-4111-8111-111111111111',
    status: 'confirmed',
    supplier_id: i < 3 ? `supplier-${i}` : null,
    supplier_name: i < 3 ? `验收供应商${i}` : null,
    customer_name: i === 3 ? '验收客户' : null,
    business_date: '2026-10-24',
    currency_code: 'CNY',
    amount: i * 100,
    lines: []
  }))
  const calls: Array<Record<string, unknown>> = []
  let failCancellation = true
  await page.route('**/rest/v1/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    const body = route.request().postData() ? route.request().postDataJSON() : {}
    if (name === 'fms_receivable_workspace_secure')
      return route.fulfill({ json: { records, total: records.length } })
    if (name === 'fms_ar_voucher_secure') {
      calls.push(body)
      return route.fulfill({
        json: { message: body.p_generate ? '凭证已生成' : `预览${body.p_id}`, lines: [] }
      })
    }
    if (name === 'fms_cancel_supplier_receipt_secure') {
      calls.push(body)
      if (failCancellation) {
        failCancellation = false
        return route.fulfill({
          status: 409,
          json: { code: 'P0001', message: '取消收款失败，请重试' }
        })
      }
      const record = records.find((row) => row.id === body.p_id)
      expect(record).toBeDefined()
      if (record) record.status = 'approved'
      return route.fulfill({ json: null })
    }
    return route.fulfill({ json: [] })
  })
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  const permissions = ['View', 'Cancel', 'VoucherPreview', 'VoucherGenerate']
    .map((action) => `FinanceReceipt:${action}`)
    .join(',')
  await page.goto(
    `/tests/e2e/fixtures/receivable-workspace.html?kind=receipt&theme=${theme}&permissions=${permissions}`
  )
  await expect(page.getByRole('heading', { name: '收款单', exact: true })).toBeVisible({
    timeout: 60000
  })
  for (const i of [1, 2]) {
    const select = () =>
      page
        .getByRole('row')
        .filter({ hasText: `QA-SR-${i}` })
        .locator('label.el-checkbox')
        .click()
    await expect(page.getByText(`验收供应商${i}`, { exact: true })).toBeVisible()
    await select()
    await page.getByRole('button', { name: '预览凭证', exact: true }).click()
    const preview = page.getByRole('dialog', { name: '凭证预览', exact: true })
    await expect(preview).toContainText(`预览receipt-${i}`)
    await preview.screenshot({ path: info.outputPath(`supplier-preview-${i}.png`) })
    await preview.getByRole('button', { name: /关闭/ }).click()
    await select()
    await page.getByRole('button', { name: '生成凭证', exact: true }).click()
    await expect(page.locator('.el-message--success').last()).toContainText('凭证已生成')
    await select()
    await page.getByRole('button', { name: '取消收款', exact: true }).click()
    const prompt = page.getByRole('dialog', { name: '取消供应商退款收款', exact: true })
    await prompt.getByRole('button', { name: '确定', exact: true }).click()
    await expect(prompt).toContainText('原因不能为空')
    await prompt.getByRole('textbox').fill(`验收取消原因${i}`)
    await prompt.screenshot({ path: info.outputPath(`supplier-cancel-${i}.png`) })
    await prompt.getByRole('button', { name: '确定', exact: true }).click()
    if (i === 1) {
      await expect(page.locator('.el-message--error').last()).toContainText('取消收款失败')
      await select()
      await page.getByRole('button', { name: '取消收款', exact: true }).click()
      await expect(prompt.getByRole('textbox')).toHaveValue('验收取消原因1')
      await prompt.getByRole('button', { name: '确定', exact: true }).click()
    }
    await expect.poll(() => records[i - 1].status).toBe('approved')
  }
  await page.getByRole('row').filter({ hasText: 'QA-SR-3' }).locator('label.el-checkbox').click()
  for (const name of ['取消收款', '预览凭证', '生成凭证'])
    await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0)
  expect(calls.filter((row) => row.p_kind === 'receipt')).toHaveLength(4)
  expect(calls.filter((row) => row.p_reason)).toHaveLength(3)
})
