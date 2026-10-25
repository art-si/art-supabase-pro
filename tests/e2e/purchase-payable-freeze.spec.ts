import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(150000)
const permissions = 'FinancePurchasePayable:View,FinancePurchasePayable:Freeze'
const rows = (frozen = false) =>
  [1, 2].map((index) => ({
    id: `freeze-${index}`,
    record_key: `freeze-${index}`,
    document_no: `QA-FREEZE-${index}`,
    kind: 'financial',
    status: 'approved',
    amount: index * 100,
    total_amount: index * 100,
    tax_amount: 0,
    unpaid_amount: index * 100,
    frozen_amount: frozen ? index * 40 : 0,
    currency_code: 'CNY',
    business_date: '2026-10-24',
    source_type: 'manual',
    lines: []
  }))

for (const unfreeze of [false, true]) {
  test(`${unfreeze ? '解冻' : '冻结'}读取期间离开及返回，不打开旧弹窗`, async ({ page }, info) => {
    const records = rows(unfreeze)
    let release: (() => void) | undefined
    let writes = 0
    await page.route('**/rest/v1/**', async (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)
      const input = route.request().postDataJSON() || {}
      if (name === 'fms_purchase_payable_list_secure') {
        if (input.p_id)
          await new Promise<void>((resolve) => {
            release = resolve
          })
        const data = records.filter((row) => !input.p_id || row.id === input.p_id)
        return route.fulfill({ json: { data, total: data.length } })
      }
      if (name === 'fms_act_purchase_payable_secure') writes++
      return route.fulfill({ json: [] })
    })
    for (const index of [1, 2]) {
      release = undefined
      await page.goto(
        `/tests/e2e/fixtures/purchase-payable.html?kind=financial&keepAlive=1&navigationTest=1&permissions=${permissions}`
      )
      await expect(page.getByRole('heading', { name: '财务应付单', exact: true })).toBeVisible({
        timeout: 60000
      })
      if (info.project.use.colorScheme === 'dark')
        await expect(page.locator('html')).toHaveClass(/dark/)
      await page
        .getByRole('row')
        .filter({ hasText: `QA-FREEZE-${index}` })
        .getByRole('button', { name: unfreeze ? '解冻' : '冻结', exact: true })
        .click()
      await expect.poll(() => Boolean(release)).toBe(true)
      await page.getByRole('button', { name: '打开其他页面', exact: true }).click()
      await expect(page.getByRole('heading', { name: '其他业务页面' })).toBeVisible()
      if (index === 2) await page.getByRole('button', { name: '返回来源页面' }).click()
      release?.()
      await page.waitForLoadState('networkidle')
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(
        page.getByRole('heading', {
          name: index === 1 ? '其他业务页面' : '财务应付单',
          exact: true
        })
      ).toBeVisible()
    }
    expect(writes).toBe(0)
  })
}

test('两条财务应付冻结解冻，金额原因阻断、取消、读取及保存失败重试', async ({ page }, info) => {
  const records = rows()
  const calls: Array<{ p_ids: string[]; p_action: string; p_reason: string; p_amount: number }> = []
  let failRead = true
  let failSave = true
  let release: (() => void) | undefined
  await page.route('**/rest/v1/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    const input = route.request().postDataJSON() || {}
    if (name === 'fms_purchase_payable_list_secure') {
      if (input.p_id && failRead) {
        failRead = false
        return route.fulfill({
          status: 409,
          json: { code: 'P0001', message: '冻结信息读取失败，请重试' }
        })
      }
      const data = records.filter((row) => !input.p_id || row.id === input.p_id)
      return route.fulfill({ json: { data, total: data.length } })
    }
    if (name === 'fms_act_purchase_payable_secure') {
      calls.push(input)
      if (failSave) {
        failSave = false
        return route.fulfill({
          status: 409,
          json: { code: 'P0001', message: '冻结保存失败，请重试' }
        })
      }
      if (input.p_action === 'unfreeze' && input.p_ids[0] === 'freeze-1')
        await new Promise<void>((resolve) => {
          release = resolve
        })
      records
        .filter((row) => input.p_ids.includes(row.id))
        .forEach((row) => {
          row.frozen_amount = input.p_action === 'freeze' ? input.p_amount : 0
        })
      return route.fulfill({ json: records })
    }
    return route.fulfill({ json: [] })
  })
  await page.goto(
    `/tests/e2e/fixtures/purchase-payable.html?kind=financial&permissions=${permissions}`
  )
  await expect(page.getByRole('heading', { name: '财务应付单', exact: true })).toBeVisible({
    timeout: 60000
  })
  if (info.project.use.colorScheme === 'dark')
    await expect(page.locator('html')).toHaveClass(/dark/)
  for (const index of [1, 2]) {
    const row = page.getByRole('row').filter({ hasText: `QA-FREEZE-${index}` })
    if (index === 1) {
      await row.getByRole('button', { name: '冻结', exact: true }).click()
      await expect(page.locator('.el-message--error').last()).toContainText('冻结信息读取失败')
      await expect(page.getByRole('dialog')).toHaveCount(0)
    }
    await row.getByRole('button', { name: '冻结', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '冻结财务应付 · CNY', exact: true })
    const save = dialog.getByRole('button', { name: '保存冻结状态', exact: true })
    const amount = dialog.getByRole('spinbutton')
    const reason = dialog.getByRole('textbox', { name: '冻结/解冻原因', exact: true })
    await expect(amount).toHaveValue((index * 100).toFixed(2))
    const previousCalls = calls.length
    await save.click()
    await expect(page.locator('.el-message--warning').last()).toContainText('请填写原因')
    expect(calls).toHaveLength(previousCalls)
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await row.getByRole('button', { name: '冻结', exact: true }).click()
    await expect(reason).toHaveValue('')
    await reason.fill(`冻结原因${index}`)
    for (const invalid of [0, index * 100 + 1]) {
      await amount.fill(String(invalid))
      await save.click()
      await expect(page.locator('.el-message--warning').last()).toContainText(
        '冻结金额应大于零且不超过未付余额'
      )
      expect(calls).toHaveLength(previousCalls)
    }
    await amount.fill(String(index * 40))
    await save.click()
    if (index === 1) {
      await expect(page.locator('.el-message--error').last()).toContainText('冻结保存失败')
      await expect(dialog).toBeVisible()
      await expect(reason).toHaveValue(`冻结原因${index}`)
      await expect(amount).toHaveValue((index * 40).toFixed(2))
      await save.click()
    }
    await expect(dialog).not.toBeVisible()
    await row.getByRole('button', { name: '解冻', exact: true }).click()
    const unfreeze = page.getByRole('dialog', { name: '解冻财务应付 · CNY', exact: true })
    await expect(unfreeze.getByRole('spinbutton')).toBeDisabled()
    await expect(unfreeze.getByRole('spinbutton')).toHaveValue('0.00')
    const previousUnfreezeCalls = calls.length
    await unfreeze.getByRole('button', { name: '保存冻结状态', exact: true }).click()
    await expect(page.locator('.el-message--warning').last()).toContainText('请填写原因')
    expect(calls).toHaveLength(previousUnfreezeCalls)
    if (index === 2) {
      await expect(page.locator('.el-message')).toHaveCount(0)
      await unfreeze.screenshot({ path: info.outputPath('unfreeze-dialog.png') })
    }
    await unfreeze
      .getByRole('textbox', { name: '冻结/解冻原因', exact: true })
      .fill(`解冻原因${index}`)
    await unfreeze.getByRole('button', { name: '保存冻结状态', exact: true }).click()
    if (index === 1) {
      await expect.poll(() => Boolean(release)).toBe(true)
      await expect(
        unfreeze.getByRole('button', { name: '保存冻结状态', exact: true })
      ).toBeDisabled()
      expect(calls).toHaveLength(3)
      release?.()
    }
    await expect(unfreeze).not.toBeVisible()
    await expect(row.getByRole('button', { name: '冻结', exact: true })).toBeVisible()
  }
  expect(calls).toEqual([
    { p_ids: ['freeze-1'], p_action: 'freeze', p_reason: '冻结原因1', p_amount: 40 },
    { p_ids: ['freeze-1'], p_action: 'freeze', p_reason: '冻结原因1', p_amount: 40 },
    { p_ids: ['freeze-1'], p_action: 'unfreeze', p_reason: '解冻原因1', p_amount: 0 },
    { p_ids: ['freeze-2'], p_action: 'freeze', p_reason: '冻结原因2', p_amount: 80 },
    { p_ids: ['freeze-2'], p_action: 'unfreeze', p_reason: '解冻原因2', p_amount: 0 }
  ])
  await expect(page.locator('.el-message')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('freeze-restored.png'), fullPage: true })
})

test('冻结解冻读取最新状态变化阻断，零余额无冻结入口', async ({ page }, info) => {
  const records = rows()
  let reads = 0
  let writes = 0
  await page.route('**/rest/v1/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    const input = route.request().postDataJSON() || {}
    if (name === 'fms_purchase_payable_list_secure') {
      if (input.p_id) {
        reads++
        if (reads === 1) records[0].status = 'submitted'
        else records[1].frozen_amount = reads === 2 ? 60 : 0
      }
      const data = records.filter((row) => !input.p_id || row.id === input.p_id)
      return route.fulfill({ json: { data, total: data.length } })
    }
    if (name === 'fms_act_purchase_payable_secure') writes++
    return route.fulfill({ json: [] })
  })
  await page.goto(
    `/tests/e2e/fixtures/purchase-payable.html?kind=financial&permissions=${permissions}`
  )
  await expect(page.getByRole('heading', { name: '财务应付单', exact: true })).toBeVisible({
    timeout: 60000
  })
  if (info.project.use.colorScheme === 'dark')
    await expect(page.locator('html')).toHaveClass(/dark/)
  for (const [index, action] of [
    [1, '冻结'],
    [2, '冻结'],
    [2, '解冻']
  ] as const) {
    const row = page.getByRole('row').filter({ hasText: `QA-FREEZE-${index}` })
    await row.getByRole('button', { name: action, exact: true }).click()
    await expect(page.locator('.el-message--warning').last()).toContainText('冻结状态已变化')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(row.getByRole('button', { name: action, exact: true })).toHaveCount(0)
  }
  records.forEach((row) => {
    row.status = 'approved'
    row.unpaid_amount = 0
  })
  await page.getByRole('button', { name: '查询', exact: true }).click()
  for (const index of [1, 2])
    await expect(
      page
        .getByRole('row')
        .filter({ hasText: `QA-FREEZE-${index}` })
        .getByRole('button', { name: '冻结', exact: true })
    ).toHaveCount(0)
  expect(reads).toBe(3)
  expect(writes).toBe(0)
})
