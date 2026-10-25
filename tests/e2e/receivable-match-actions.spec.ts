import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(120000)

test('两组先开票勾稽的暂估切换、零值阻断与失败重试', async ({ page }, info) => {
  const tenant = '11111111-1111-4111-8111-111111111111'
  const documents = [1, 2].map((index) => ({
    id: `financial-${index}`,
    tenantId: tenant,
    documentNo: `QA-MATCH-F-${index}`,
    kind: 'financial',
    status: 'approved',
    customerId: 'match-customer',
    customerName: '隔离勾稽客户',
    settlementOrganizationId: 'match-organization',
    currencyCode: 'CNY',
    businessDate: '2026-10-24',
    estimateId: null as string | null,
    totalAmount: 100,
    lines: ['quantity', 'amount'].map((basis, position) => ({
      id: `financial-${index}-${basis}`,
      lineNo: (position + 1) * 10,
      materialDescription: `${basis === 'quantity' ? '数量' : '金额'}服务${index}`,
      basis,
      quantity: 2,
      totalAmount: 50,
      advanceInvoice: true
    }))
  }))
  const estimates = [1, 2].map((index) => ({
    ...documents[index - 1],
    id: `estimate-${index}`,
    documentNo: `QA-MATCH-E-${index}`,
    kind: 'estimate',
    lines: documents[index - 1].lines.map((line) => ({
      ...line,
      id: `estimate-${index}-${line.basis}`,
      advanceInvoice: false,
      linkedQuantity: 0,
      linkedFinancialAmount: 0
    }))
  }))
  const queries: Record<string, unknown>[] = []
  const writes: Array<{
    p_financial_id: string
    p_estimate_id: string
    p_lines: Array<{
      financialLineId: string
      estimatedLineId: string
      quantity: number
      amount: number
    }>
  }> = []
  let fail = true
  await page.route('**/rest/v1/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    const body = route.request().postDataJSON()
    if (name === 'fms_receivable_workspace_secure') {
      const query = body.p_query || {}
      if (body.p_kind === 'estimate') queries.push(query)
      const records = (body.p_kind === 'estimate' ? estimates : documents).filter(
        (row) => !query.id || row.id === query.id
      )
      return route.fulfill({ json: { records, total: records.length } })
    }
    if (name === 'fms_match_advance_receivable_secure') {
      writes.push(body)
      if (fail)
        return route.fulfill({
          status: 409,
          json: { code: '40001', message: '暂估余额已变化，请重新核对后重试' }
        })
      const document = documents.find((row) => row.id === body.p_financial_id)
      if (document) document.estimateId = body.p_estimate_id
      return route.fulfill({ json: null })
    }
    return route.fulfill({ json: [] })
  })
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  await page.goto(`/tests/e2e/fixtures/receivable-workspace.html?kind=financial&theme=${theme}`)
  const dialog = page.getByRole('dialog', { name: '先开票应收后续勾稽', exact: true })
  const chooseEstimate = async (index: number) => {
    await dialog.getByPlaceholder('选择已审核暂估应收').click()
    const picker = page.getByRole('dialog', { name: '选择暂估应收', exact: true })
    await picker.getByText(`QA-MATCH-E-${index}`, { exact: true }).click()
    await picker.getByRole('button', { name: /确.*定|确.*认/ }).click()
    await expect(picker).not.toBeVisible()
  }
  const link = async (index: number) => {
    for (const basis of ['数量', '金额']) {
      await dialog
        .getByRole('combobox', { name: `${basis}服务${index} 关联暂估明细` })
        .press('ArrowDown')
      await page
        .getByRole('option', {
          name: `${basis === '数量' ? 10 : 20} · ${basis}服务${index}`,
          exact: true
        })
        .click()
    }
  }
  for (const index of [1, 2]) {
    await page
      .getByRole('row')
      .filter({ hasText: `QA-MATCH-F-${index}` })
      .locator('label.el-checkbox')
      .click()
    await page.getByRole('button', { name: '先开票勾稽', exact: true }).click()
    await expect(dialog).toBeVisible()
    const confirm = dialog.getByRole('button', { name: '确认勾稽并冲回暂估', exact: true })
    await confirm.click()
    await expect(page.getByText('请选择暂估及对应明细', { exact: true })).toBeVisible()
    expect(writes).toHaveLength(index === 1 ? 0 : 2)
    await chooseEstimate(index)
    await link(index)
    if (index === 1) {
      await chooseEstimate(2)
      await expect(dialog.getByRole('combobox', { name: '数量服务1 关联暂估明细' })).toHaveValue('')
      await chooseEstimate(1)
      await link(1)
      const quantity = dialog.getByRole('spinbutton', { name: '数量服务1 勾稽数量' })
      await quantity.fill('0')
      await quantity.press('Tab')
      await confirm.click()
      await expect(
        page.getByText('已关联明细的勾稽数量须大于零', { exact: true }).first()
      ).toBeVisible()
      expect(writes).toHaveLength(0)
      await quantity.fill('2')
      await quantity.press('Tab')
      const amount = dialog.getByRole('spinbutton', { name: '金额服务1 勾稽价税金额' })
      await amount.fill('0')
      await amount.press('Tab')
      await confirm.click()
      await expect(
        page.getByText('已关联明细的勾稽金额须大于零', { exact: true }).first()
      ).toBeVisible()
      expect(writes).toHaveLength(0)
      await amount.fill('50')
      await amount.press('Tab')
      await confirm.click()
      await expect(page.locator('.el-message--error')).toHaveCount(1)
      await expect(dialog).toBeVisible()
      await expect(quantity).toHaveValue('2')
      fail = false
    }
    await expect(page.locator('.el-message')).toHaveCount(0)
    await dialog.screenshot({ path: info.outputPath(`match-${index}-ready.png`) })
    await confirm.click()
    await expect(dialog).not.toBeVisible()
    await expect(page.locator('.el-message')).toHaveCount(0)
  }
  expect(writes.map((row) => [row.p_financial_id, row.p_estimate_id])).toEqual([
    ['financial-1', 'estimate-1'],
    ['financial-1', 'estimate-1'],
    ['financial-2', 'estimate-2']
  ])
  for (const [index, write] of writes.entries()) {
    const number = index === 2 ? 2 : 1
    expect(write.p_lines.map((line) => [line.financialLineId, line.estimatedLineId])).toEqual([
      [`financial-${number}-quantity`, `estimate-${number}-quantity`],
      [`financial-${number}-amount`, `estimate-${number}-amount`]
    ])
    expect(write.p_lines[0].quantity).toBe(2)
    expect(write.p_lines[1].amount).toBe(50)
  }
  expect(queries.length).toBeGreaterThanOrEqual(4)
  for (const query of queries)
    expect(query).toMatchObject({
      status: 'approved',
      currencyCode: 'CNY',
      onlyUnlinked: true,
      tenantId: tenant,
      customerId: 'match-customer',
      organizationId: 'match-organization'
    })
  await page
    .getByRole('row')
    .filter({ hasText: 'QA-MATCH-F-1' })
    .locator('label.el-checkbox')
    .click()
  await expect(page.getByRole('button', { name: '先开票勾稽', exact: true })).toBeDisabled()
  await expect(dialog).not.toBeVisible()
  expect(writes).toHaveLength(3)
  await expect(page.locator('.el-message')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('matched-two-documents.png'), fullPage: true })
})
