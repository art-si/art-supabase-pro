import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(60000)

test('应付核销普通只读用户查看两组数据且无维护、执行或制证入口', async ({ page }) => {
  const writes: string[] = []
  await page.route('**/rest/v1/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1) || ''
    if (name === 'fms_payable_writeoff_workspace_secure') {
      const rows = (prefix: string) =>
        [1, 2].map((index) => ({
          id: `${prefix}-${index}`,
          tenantId: '11111111-1111-4111-8111-111111111111',
          documentNo: `QA-${prefix}-${index}`,
          supplierId: 'supplier',
          supplierName: '只读核销供应商',
          currencyCode: 'CNY',
          amount: index * 100,
          availableAmount: index * 100
        }))
      return route.fulfill({
        json: {
          primary: rows('AP'),
          secondary: rows('PAY'),
          schemes: [],
          organizations: [],
          history: [1, 2].map((index) => ({
            id: `history-${index}`,
            recordNo: `QA-HISTORY-${index}`,
            tenantId: '11111111-1111-4111-8111-111111111111',
            supplierId: 'supplier',
            supplierName: '只读核销供应商',
            status: 'active',
            needsVoucher: true,
            amount: index * 100
          }))
        }
      })
    }
    if (/save_|reverse_|voucher|auto_payable_writeoff|^fms_payable_writeoff_secure$/.test(name))
      writes.push(name)
    return route.fulfill({ json: [] })
  })
  await page.goto(
    '/tests/e2e/fixtures/purchase-payable.html?kind=writeoff&permissions=FinancePayableWriteoff:View'
  )
  await expect(page.getByText('QA-AP-2', { exact: true })).toBeVisible()
  await expect(page.getByText('QA-PAY-2', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await page.getByRole('tab', { name: '核销记录（2）', exact: true }).click()
  await expect(page.getByText('QA-HISTORY-2', { exact: true })).toBeVisible()
  for (const name of ['核销方案', '核销', '按方案自动核销', '反核销', '预览凭证', '生成凭证']) {
    await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0)
  }
  expect(writes).toEqual([])
})

test('两条核销单凭证预览、失败重试和待配置反馈', async ({ page }, info) => {
  const vouchers: Array<{ p_id: string; p_kind: string; p_preview: boolean }> = []
  let fail = true
  await page.route('**/rest/v1/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    const body = route.request().postDataJSON()
    if (name === 'fms_payable_writeoff_workspace_secure')
      return route.fulfill({
        json: {
          primary: [],
          secondary: [],
          schemes: [],
          organizations: [],
          history: [1, 2].map((index) => ({
            id: `voucher-${index}`,
            recordNo: `QA-HX-VOUCHER-${index}`,
            documentNo: `QA-HXD-${index}`,
            tenantId: '11111111-1111-4111-8111-111111111111',
            supplierId: 'supplier',
            supplierName: '核销凭证验收供应商',
            status: 'active',
            needsVoucher: true,
            payableNo: `QA-AP-${index}`,
            paymentNo: `QA-PAY-${index}`,
            amount: index * 100
          }))
        }
      })
    if (name === 'fms_payable_settlement_voucher_secure') {
      vouchers.push(body)
      if (fail)
        return route.fulfill({
          status: 400,
          json: { code: 'P0001', message: '核销凭证预览失败，请重试' }
        })
      return route.fulfill({
        json: {
          status: 'pending_configuration',
          message: `核销规则待配置：${body.p_id}`,
          lines: [],
          voucherIds: []
        }
      })
    }
    return route.fulfill({ json: [] })
  })
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  await page.goto(`/tests/e2e/fixtures/purchase-payable.html?kind=writeoff&theme=${theme}`)
  await page.getByRole('tab', { name: '核销单（2）', exact: true }).click()
  for (const index of [1, 2]) {
    const row = page.getByRole('row').filter({ hasText: `QA-HX-VOUCHER-${index}` })
    await row.getByRole('button', { name: '预览凭证', exact: true }).click()
    if (index === 1) {
      await expect(page.getByText('核销凭证预览失败，请重试', { exact: true })).toBeVisible()
      await expect(page.getByRole('dialog', { name: '凭证预览' })).not.toBeVisible()
      fail = false
      await row.getByRole('button', { name: '预览凭证', exact: true }).click()
    }
    const dialog = page.getByRole('dialog', { name: '凭证预览' })
    await expect(dialog).toContainText(`核销规则待配置：voucher-${index}`)
    await expect(dialog).toContainText('尚无可预览分录')
    if (index === 2)
      await dialog.screenshot({ path: info.outputPath('writeoff-voucher-pending.png') })
    await dialog.getByRole('button', { name: '关闭此对话框' }).click()
    await row.getByRole('button', { name: '生成凭证', exact: true }).click()
    await expect(page.locator('.el-message--warning').last()).toContainText(
      `核销规则待配置：voucher-${index}`
    )
    await expect(page.getByRole('button', { name: 'QA-HXD-2', exact: true })).toBeVisible()
  }
  expect(vouchers).toEqual([
    { p_id: 'voucher-1', p_kind: 'writeoff', p_preview: true },
    { p_id: 'voucher-1', p_kind: 'writeoff', p_preview: true },
    { p_id: 'voucher-1', p_kind: 'writeoff', p_preview: false },
    { p_id: 'voucher-2', p_kind: 'writeoff', p_preview: true },
    { p_id: 'voucher-2', p_kind: 'writeoff', p_preview: false }
  ])
})

test('应付核销两组明细零金额阻断、失败恢复和精确分配', async ({ page }, info) => {
  const writes: Array<Record<string, unknown>> = []
  let fail = true
  let done = false
  const reversals: Array<Record<string, unknown>> = []
  let reverseFail = true
  const history = [1, 2].map((index) => ({
    id: `writeoff-${index}`,
    recordNo: `QA-WRITEOFF-${index}`,
    tenantId: '11111111-1111-4111-8111-111111111111',
    supplierId: 'supplier',
    supplierName: '隔离核销供应商',
    payableId: `payable-${index}`,
    paymentLineId: `payment-${index}`,
    payableNo: `QA-PAYABLE-${index}`,
    paymentNo: `QA-PAYMENT-${index}`,
    writeoffDate: '2026-10-24',
    amount: index * 100,
    needsVoucher: false,
    status: 'active',
    remark: '隔离核销验收'
  }))
  await page.route('**/rest/v1/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    const body = route.request().postDataJSON()
    if (name === 'fms_payable_writeoff_workspace_secure') {
      const rows = (side: string) =>
        [1, 2].map((index) => ({
          id: `${side}-${index}`,
          documentNo: `QA-${side.toUpperCase()}-${index}`,
          tenantId: '11111111-1111-4111-8111-111111111111',
          supplierId: 'supplier',
          supplierName: '隔离核销供应商',
          businessDate: '2026-10-24',
          currencyCode: 'CNY',
          amount: index * 100,
          availableAmount: index * 100
        }))
      return route.fulfill({
        json: {
          primary: done ? [] : rows('payable'),
          secondary: done ? [] : rows('payment'),
          history: done ? history : [],
          schemes: [
            {
              id: 'scheme',
              tenantId: '11111111-1111-4111-8111-111111111111',
              code: 'QA-MANUAL',
              name: '隔离手工核销方案',
              enabled: true,
              automatic: false
            }
          ],
          organizations: []
        }
      })
    }
    if (name === 'fms_payable_writeoff_secure') {
      writes.push(body)
      if (fail)
        return route.fulfill({
          status: 400,
          json: { code: 'P0001', message: '核销保存失败，请重试' }
        })
      done = true
      return route.fulfill({ json: [] })
    }
    if (name === 'fms_reverse_payable_writeoff_secure') {
      reversals.push(body)
      if (reverseFail)
        return route.fulfill({
          status: 400,
          json: { code: 'P0001', message: '反核销失败，请重试' }
        })
      const record = history.find((row) => row.id === body.p_id)
      if (record) record.status = 'reversed'
      return route.fulfill({ json: null })
    }
    return route.fulfill({ json: [] })
  })
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  await page.goto(`/tests/e2e/fixtures/purchase-payable.html?kind=writeoff&theme=${theme}`)
  await expect(page.getByText('QA-PAYABLE-2', { exact: true })).toBeVisible()
  const amount = page.getByRole('spinbutton', { name: '本次核销金额', exact: true }).first()
  await amount.fill('0')
  await amount.press('Tab')
  await expect(amount).toHaveValue('0.00')
  const headers = page.locator('.el-table__header-wrapper label.el-checkbox')
  await headers.nth(0).click()
  await headers.nth(1).click()
  await page.getByRole('button', { name: '核销', exact: true }).click()
  await expect(
    page.getByText('本次核销金额须大于零，且不能超过允许核销金额', { exact: true })
  ).toBeVisible()
  await expect(page.locator('.el-message-box')).not.toBeVisible()
  expect(writes).toEqual([])
  await amount.fill('100')
  await amount.press('Tab')
  // Editing clears the primary selection; select both rows again through the visible label.
  await headers.nth(0).click()
  await page.getByRole('button', { name: '核销', exact: true }).click()
  const confirmation = page.locator('.el-message-box')
  await expect(confirmation).toContainText('300.00')
  await expect(page.locator('.el-message')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('payable-writeoff-confirm.png'), fullPage: true })
  await confirmation.getByRole('button', { name: '执行核销', exact: true }).click()
  await expect(page.getByText('核销保存失败，请重试', { exact: true })).toBeVisible()
  fail = false
  await page.getByRole('button', { name: '核销', exact: true }).click()
  await confirmation.getByRole('button', { name: '执行核销', exact: true }).click()
  await expect(page.getByText('暂无待核销应付', { exact: true })).toBeVisible()
  expect(writes).toHaveLength(2)
  for (const write of writes) {
    expect(write.p_scheme_id).toBe('scheme')
    expect(write.p_items).toEqual([
      { payable_id: 'payable-1', payment_line_id: 'payment-1', amount: 100 },
      { payable_id: 'payable-2', payment_line_id: 'payment-2', amount: 200 }
    ])
  }
  await page.getByRole('tab', { name: '核销记录（2）', exact: true }).click()
  for (const index of [1, 2]) {
    const row = page.getByRole('row').filter({ hasText: `QA-WRITEOFF-${index}` })
    await row.getByRole('button', { name: '反核销', exact: true }).click()
    const prompt = page.locator('.el-message-box')
    const prior = reversals.length
    await prompt.getByRole('button', { name: '确定', exact: true }).click()
    await expect(prompt.getByText('原因不能为空', { exact: true })).toBeVisible()
    expect(reversals).toHaveLength(prior)
    await prompt.getByRole('textbox').fill(`隔离还原${index}`)
    await prompt.getByRole('button', { name: '确定', exact: true }).click()
    if (index === 1) {
      await expect(page.getByText('反核销失败，请重试', { exact: true })).toBeVisible()
      reverseFail = false
      await row.getByRole('button', { name: '反核销', exact: true }).click()
      await prompt.getByRole('textbox').fill('隔离还原1')
      await prompt.getByRole('button', { name: '确定', exact: true }).click()
    }
    await expect(row.getByRole('button', { name: '反核销', exact: true })).toHaveCount(0)
    expect(reversals.at(-1)).toMatchObject({
      p_id: `writeoff-${index}`,
      p_reason: `隔离还原${index}`
    })
  }
  await expect(page.locator('.el-message')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('payable-writeoff-history.png'), fullPage: true })
})
