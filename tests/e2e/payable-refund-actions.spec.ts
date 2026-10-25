import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(90000)

test('两张退款凭证预览、待配置反馈、取消到账和作废原因及失败重试', async ({ page }, info) => {
  const records = [1, 2].map((index) => ({
    id: `refund-action-${index}`,
    record_key: `refund-action-${index}`,
    document_no: `QA-REFUND-ACTION-${index}`,
    kind: 'refund',
    status: 'confirmed',
    tenant_id: '11111111-1111-4111-8111-111111111111',
    currency_code: 'CNY',
    business_date: '2026-10-24',
    amount: index * 100,
    payment_status: 'full',
    lines: []
  }))
  const vouchers: Array<{ p_id: string; p_kind: string; p_preview: boolean }> = []
  const actions: Array<{ p_ids: string[]; p_action: string; p_reason: string }> = []
  let fail = true
  await page.route('**/rest/v1/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    const body = route.request().postDataJSON()
    if (name === 'fms_payable_settlement_list_secure')
      return route.fulfill({ json: { data: records, total: 2 } })
    if (name === 'fms_payable_settlement_voucher_secure') {
      vouchers.push(body)
      return route.fulfill({
        json: {
          status: 'pending_configuration',
          message: `演示凭证规则待配置：${body.p_id}`,
          voucher_ids: [],
          lines: []
        }
      })
    }
    if (name === 'fms_act_payable_settlement_secure') {
      actions.push(body)
      if (fail)
        return route.fulfill({
          status: 400,
          json: { code: 'P0001', message: '取消到账失败，请核对后重试' }
        })
      records
        .filter((row) => body.p_ids.includes(row.id))
        .forEach((row) => {
          row.status = body.p_action === 'cancel_payment' ? 'approved' : 'cancelled'
          row.payment_status = 'none'
        })
      return route.fulfill({ json: records })
    }
    return route.fulfill({ json: [] })
  })
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  await page.goto(`/tests/e2e/fixtures/purchase-payable.html?kind=refund&theme=${theme}`)
  if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/dark/)
  for (const index of [1, 2]) {
    const row = page.getByRole('row').filter({ hasText: `QA-REFUND-ACTION-${index}` })
    await row.locator('label.el-checkbox').click()
    await page.getByRole('button', { name: '生成凭证', exact: true }).click()
    await page.getByRole('menuitem', { name: '预览凭证', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '凭证预览' })
    await expect(dialog).toContainText(`演示凭证规则待配置：refund-action-${index}`)
    await expect(dialog).toContainText('尚无可预览分录')
    await dialog.getByRole('button', { name: '关闭此对话框' }).click()
    await page.getByRole('button', { name: '生成凭证', exact: true }).click()
    await page.getByRole('menuitem', { name: '生成凭证', exact: true }).click()
    await expect(page.locator('.el-message--warning').last()).toContainText('凭证规则待配置')
    await expect(row.getByRole('checkbox')).not.toBeChecked()
  }
  expect(vouchers).toEqual(
    [1, 2].flatMap((index) =>
      [true, false].map((preview) => ({
        p_id: `refund-action-${index}`,
        p_kind: 'refund',
        p_preview: preview
      }))
    )
  )
  const selectAll = async () => {
    if (!(await page.getByRole('checkbox', { name: '选择所有行', exact: true }).isChecked()))
      await page.locator('.el-table__header-wrapper label.el-checkbox').first().click()
  }
  const openCancel = async () => {
    await selectAll()
    await page.getByRole('button', { name: '确认到账', exact: true }).click()
    await page.getByRole('menuitem', { name: '取消到账', exact: true }).click()
  }
  await openCancel()
  const prompt = page.locator('.el-message-box')
  await prompt.getByRole('button', { name: '确定', exact: true }).click()
  expect(actions).toHaveLength(0)
  await expect(prompt).toContainText('原因')
  await prompt.getByRole('button', { name: '取消', exact: true }).click()
  expect(actions).toHaveLength(0)
  await openCancel()
  await prompt.getByRole('textbox').fill('演示取消到账原因')
  await prompt.getByRole('button', { name: '确定', exact: true }).click()
  await expect(page.locator('.el-message--error')).toHaveCount(1)
  expect(records.every((row) => row.status === 'confirmed')).toBe(true)
  fail = false
  await openCancel()
  await prompt.getByRole('textbox').fill('演示取消到账重试原因')
  await prompt.getByRole('button', { name: '确定', exact: true }).click()
  await expect(page.getByRole('row').filter({ hasText: 'QA-REFUND-ACTION-2' })).toContainText(
    '已审核'
  )
  await selectAll()
  await page.getByRole('button', { name: '作废未到账单', exact: true }).click()
  await prompt.getByRole('button', { name: '确定', exact: true }).click()
  expect(actions).toHaveLength(2)
  await prompt.getByRole('textbox').fill('演示作废退款占用')
  await prompt.getByRole('button', { name: '确定', exact: true }).click()
  await expect(page.getByRole('row').filter({ hasText: 'QA-REFUND-ACTION-2' })).toContainText(
    '已取消'
  )
  expect(actions).toEqual([
    {
      p_ids: ['refund-action-1', 'refund-action-2'],
      p_action: 'cancel_payment',
      p_reason: '演示取消到账原因'
    },
    {
      p_ids: ['refund-action-1', 'refund-action-2'],
      p_action: 'cancel_payment',
      p_reason: '演示取消到账重试原因'
    },
    {
      p_ids: ['refund-action-1', 'refund-action-2'],
      p_action: 'void',
      p_reason: '演示作废退款占用'
    }
  ])
  await expect(page.locator('.el-message')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('refund-voided.png'), fullPage: true })
})
