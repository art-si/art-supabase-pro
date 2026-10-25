import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(120000)

test('普通用户两张付款申请冻结、解冻、关闭，原因校验、失败恢复和处理中防重', async ({
  page
}, info) => {
  const records = [1, 2].map((index) => ({
    id: `application-${index}`,
    record_key: `application-${index}`,
    document_no: `QA-CONTROL-${index}`,
    kind: 'application',
    status: 'approved',
    frozen: false,
    payment_status: 'none',
    amount: index * 100,
    currency_code: 'CNY',
    business_date: '2026-10-24',
    counterparty_name: `隔离状态供应商${index}`,
    lines: []
  }))
  const calls: Array<{ p_ids: string[]; p_action: string; p_reason: string }> = []
  let failFreeze = true
  let releaseFreeze: (() => void) | undefined
  await page.route('**/rest/v1/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    if (name === 'fms_payable_settlement_list_secure')
      return route.fulfill({ json: { data: records, total: 2 } })
    if (name === 'fms_act_payable_settlement_secure') {
      const body = route.request().postDataJSON()
      calls.push(body)
      if (body.p_action === 'freeze' && failFreeze) {
        failFreeze = false
        return route.fulfill({
          status: 409,
          json: { code: 'P0001', message: '申请状态已更新，请核对后重试' }
        })
      }
      if (body.p_action === 'freeze')
        await new Promise<void>((resolve) => {
          releaseFreeze = resolve
        })
      for (const id of body.p_ids) {
        const record = records.find((record) => record.id === id)
        expect(record).toBeDefined()
        if (!record) continue
        expect(body.p_reason.trim()).not.toBe('')
        if (body.p_action === 'freeze') record.frozen = true
        if (body.p_action === 'unfreeze') record.frozen = false
        if (body.p_action === 'close') record.status = 'closed'
      }
      return route.fulfill({ json: { count: body.p_ids.length } })
    }
    return route.fulfill({ json: [] })
  })
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  await page.goto(
    `/tests/e2e/fixtures/purchase-payable.html?kind=application&theme=${theme}&permissions=FinancePayableApplication:View,FinancePayableApplication:Freeze,FinancePayableApplication:Close`
  )
  await expect(page.getByRole('heading', { name: '付款申请单', exact: true })).toBeVisible({
    timeout: 60000
  })
  for (const index of [1, 2]) {
    await expect(page.locator('.el-message')).toHaveCount(0)
    const row = page.getByRole('row').filter({ hasText: `QA-CONTROL-${index}` })
    await row.locator('label.el-checkbox').click()
    const freeze = page.getByRole('button', { name: '冻结', exact: true })
    const unfreeze = page.getByRole('button', { name: '解冻', exact: true })
    const close = page.getByRole('button', { name: '关闭', exact: true })
    await freeze.click()
    const reason = page.getByRole('dialog', { name: '处理原因', exact: true })
    await reason.getByRole('button', { name: '确定', exact: true }).click()
    await expect(reason).toContainText('原因不能为空')
    const beforeCancel = calls.length
    await reason.getByRole('button', { name: '取消', exact: true }).click()
    expect(calls).toHaveLength(beforeCancel)
    await expect(freeze).toBeEnabled()
    await freeze.click()
    await reason.getByRole('textbox').fill(`状态核对${index}`)
    await reason.getByRole('button', { name: '确定', exact: true }).click()
    if (index === 1) {
      await expect(page.getByText('申请状态已更新，请核对后重试', { exact: true })).toBeVisible()
      expect(records[index - 1].frozen).toBe(false)
      await expect(freeze).toBeEnabled()
      await freeze.click()
      await reason.getByRole('textbox').fill(`重试核对${index}`)
      await reason.getByRole('button', { name: '确定', exact: true }).click()
    }
    await expect.poll(() => Boolean(releaseFreeze)).toBe(true)
    await expect(freeze).toBeDisabled()
    await expect(unfreeze).toBeDisabled()
    await expect(close).toBeDisabled()
    const pendingCount = calls.length
    releaseFreeze?.()
    releaseFreeze = undefined
    await expect(row).toContainText('冻结')
    expect(calls).toHaveLength(pendingCount)
    await row.locator('label.el-checkbox').click()
    await expect(freeze).toBeDisabled()
    await expect(unfreeze).toBeEnabled()
    await unfreeze.click()
    await reason.getByRole('textbox').fill(`恢复核对${index}`)
    await reason.getByRole('button', { name: '确定', exact: true }).click()
    await expect(row).not.toContainText('冻结')
    await row.locator('label.el-checkbox').click()
    await expect(freeze).toBeEnabled()
    await close.click()
    await reason.getByRole('textbox').fill(`终止核对${index}`)
    await reason.getByRole('button', { name: '确定', exact: true }).click()
    await expect(row).toContainText('已关闭')
    await row.locator('label.el-checkbox').click()
    await expect(freeze).toBeDisabled()
    await expect(unfreeze).toBeDisabled()
    await expect(close).toBeDisabled()
    await row.locator('label.el-checkbox').click()
  }
  expect(calls).toHaveLength(7)
  expect(calls.map((call) => call.p_action)).toEqual([
    'freeze',
    'freeze',
    'unfreeze',
    'close',
    'freeze',
    'unfreeze',
    'close'
  ])
  await expect(page.locator('.el-message')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('applications-closed.png'), fullPage: true })
})
