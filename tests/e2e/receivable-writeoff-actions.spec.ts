import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(60000)
const organization = '33333333-3333-4333-8333-333333333333'
const tenant = '11111111-1111-4111-8111-111111111111'

test('核销方案两条新增及两组核销、查验、失败恢复与反核销', async ({ page }, info) => {
  const schemes: Array<{ id: string; name: string }> = []
  const executions: Array<Record<string, unknown>> = []
  const reversals: Array<Record<string, unknown>> = []
  const history: Array<Record<string, unknown>> = []
  let saveFail = true
  let executeFail = true
  let reverseFail = true
  let checkFail = true
  let group = 1
  const candidates = () =>
    ['financial', 'receipt'].map((sourceType) => ({
      id: `${sourceType}-${group}`,
      documentId: `${sourceType}-${group}`,
      documentNo: `QA-${sourceType.toUpperCase()}-${group}`,
      tenantId: tenant,
      sourceType,
      status: sourceType === 'receipt' ? 'confirmed' : 'approved',
      organizationId: organization,
      customerId: 'customer',
      customerName: '隔离核销客户',
      currencyCode: 'CNY',
      exchangeRate: 1,
      businessDate: '2026-10-24',
      amount: 100 * group,
      availableAmount: 100 * group
    }))
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url())
    const name = url.pathname.split('/').at(-1)
    const body = route.request().postDataJSON()
    const fail = (message: string) =>
      route.fulfill({ status: 400, json: { code: 'P0001', message } })
    if (name === 'sys_dictionary') {
      const code = (url.searchParams.get('dict_type_table.code') || '').replace(/^eq\./, '')
      const values =
        code === 'arWriteoffRelation'
          ? [['receivable_receipt', '应收收款核销']]
          : code === 'arCounterpartyType'
            ? [['customer', '客户']]
            : code === 'arDocumentStatus'
              ? [
                  ['approved', '已审核'],
                  ['reversed', '已反核销']
                ]
              : []
      return route.fulfill({
        json: values.map(([value, label]) => ({
          id: value,
          code: value,
          value,
          label,
          status: '1',
          dict_type_table: { code }
        }))
      })
    }
    if (name === 'mdm_organization')
      return route.fulfill({
        json: [
          {
            id: organization,
            tenant_id: tenant,
            parent_id: null,
            organization_code: 'QA',
            organization_name: '隔离结算公司',
            organization_type: 'company',
            status: '1'
          }
        ]
      })
    if (name === 'fms_ar_options_secure')
      return route.fulfill({
        json:
          body.p_type === 'initialized_organization'
            ? [{ id: organization, tenant_id: tenant, name: '隔离结算公司' }]
            : body.p_type === 'scheme'
              ? schemes
              : []
      })
    if (name === 'fms_save_ar_scheme_secure') {
      if (saveFail) return fail('核销方案保存失败，请重试')
      schemes.push({ id: `scheme-${schemes.length + 1}`, name: body.p_payload.name })
      return route.fulfill({ json: schemes.at(-1)?.id })
    }
    if (name === 'fms_receivable_writeoff_candidates_secure')
      return route.fulfill({
        json: {
          records: candidates(),
          summary: {
            receivableAmount: 100 * group,
            dueThisMonthAmount: 100 * group,
            unallocatedReceiptAmount: 100 * group
          }
        }
      })
    if (name === 'fms_check_receivable_writeoff_secure') {
      if (checkFail) return fail('核销查验失败，请重试')
      return route.fulfill({
        json: candidates().map((row) => ({ ...row, message: '状态与余额查验通过' }))
      })
    }
    if (name === 'fms_execute_receivable_writeoff_secure') {
      executions.push(body.p_payload)
      if (executeFail) return fail('余额已变化，请查验后重试')
      const id = `writeoff-${group}`
      history.push({
        id,
        documentNo: `QA-WRITEOFF-${group}`,
        businessDate: '2026-10-24',
        organizationName: '隔离结算公司',
        relationKind: 'receivable_receipt',
        status: 'approved',
        reason: body.p_payload.reason,
        exchangeGainLoss: 0,
        sides: candidates().map((row, index) => ({
          documentNo: row.documentNo,
          side: index ? 'secondary' : 'primary',
          currencyCode: 'CNY',
          originalAmount: row.amount,
          baseAmount: row.amount,
          exchangeRate: 1
        }))
      })
      group++
      return route.fulfill({ json: id })
    }
    if (name === 'fms_receivable_workspace_secure')
      return route.fulfill({ json: { records: history, total: history.length } })
    if (name === 'fms_reverse_receivable_writeoff_secure') {
      reversals.push(body)
      if (reverseFail) return fail('反核销失败，请重试')
      const record = history.find((row) => row.id === body.p_id)
      if (record) record.status = 'reversed'
      return route.fulfill({ json: 'reversal' })
    }
    return route.fulfill({ json: [] })
  })
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  await page.goto(`/tests/e2e/fixtures/receivable-workspace.html?kind=writeoff&theme=${theme}`)
  for (const index of [1, 2]) {
    await page.getByRole('button', { name: '核销方案', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '新增核销方案' })
    await dialog.getByRole('button', { name: '保存核销方案' }).click()
    expect(schemes).toHaveLength(index - 1)
    await dialog.getByRole('textbox', { name: '方案名称' }).fill(`隔离核销方案${index}`)
    await dialog.getByRole('button', { name: '保存核销方案' }).click()
    if (index === 1) {
      await expect(page.locator('.el-message--error')).toHaveCount(1)
      saveFail = false
      await dialog.getByRole('button', { name: '保存核销方案' }).click()
    }
    await expect(dialog).not.toBeVisible()
  }
  await page.getByLabel('结算组织', { exact: true }).click()
  await page.getByRole('treeitem', { name: '隔离结算公司', exact: true }).click()
  await page.getByRole('button', { name: '查询待核销单据' }).click()
  for (const index of [1, 2]) {
    await expect(page.getByText(`QA-FINANCIAL-${index}`, { exact: true })).toBeVisible()
    await page.locator('.el-table__header-wrapper .el-checkbox').nth(0).click()
    await page.locator('.el-table__header-wrapper .el-checkbox').nth(1).click()
    if (index === 1) {
      const amount = page.getByRole('spinbutton', { name: 'QA-FINANCIAL-1 本次核销金额' })
      await amount.fill('0')
      await amount.press('Tab')
      await expect(amount).toHaveValue('0.00')
      await page
        .getByRole('row')
        .filter({ hasText: 'QA-FINANCIAL-1' })
        .locator('label.el-checkbox')
        .click()
      await page.getByRole('button', { name: '核销', exact: true }).click()
      await expect(page.getByRole('dialog', { name: '核销确认', exact: true })).not.toBeVisible()
      expect(executions).toEqual([])
      await amount.fill('100')
      await amount.press('Tab')
      await page
        .getByRole('row')
        .filter({ hasText: 'QA-FINANCIAL-1' })
        .locator('label.el-checkbox')
        .click()
    }
    await page.getByRole('button', { name: '单据查验', exact: true }).click()
    if (index === 1) {
      await expect(page.getByText('核销查验失败，请重试', { exact: true })).toBeVisible()
      checkFail = false
      await page.getByRole('button', { name: '单据查验', exact: true }).click()
    }
    await expect(page.getByRole('dialog', { name: '单据查验结果' })).toBeVisible()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: '核销', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '核销确认', exact: true })
    await dialog.getByLabel('业务原因 / 核销备注').fill(`隔离核销${index}`)
    await dialog.getByRole('button', { name: '执行核销' }).click()
    if (index === 1) {
      await expect(dialog).toBeVisible()
      await expect(page.getByText('余额已变化，请查验后重试', { exact: true })).toBeVisible()
      executeFail = false
      await dialog.getByRole('button', { name: '执行核销' }).click()
      expect(executions[0].requestId).toBe(executions[1].requestId)
    }
    await expect(dialog).not.toBeVisible()
    expect(executions.at(-1)?.sides).toEqual([
      {
        id: `financial-${index}`,
        sourceType: 'financial',
        side: 'primary',
        amount: 100 * index,
        remark: ''
      },
      {
        id: `receipt-${index}`,
        sourceType: 'receipt',
        side: 'secondary',
        amount: 100 * index,
        remark: ''
      }
    ])
  }
  await page.getByRole('button', { name: '核销记录', exact: true }).click()
  const historyDialog = page.getByRole('dialog', { name: '核销记录', exact: true })
  for (const index of [1, 2]) {
    const row = historyDialog.getByRole('row').filter({ hasText: `QA-WRITEOFF-${index}` })
    await row.getByRole('button', { name: '查看双侧分录' }).click()
    const detail = page.getByRole('dialog', { name: '核销双侧分录' })
    await expect(detail).toContainText(`QA-FINANCIAL-${index}`)
    await expect(detail).toContainText(`QA-RECEIPT-${index}`)
    await page.keyboard.press('Escape')
    await row.getByRole('button', { name: '反核销', exact: true }).click()
    const reverse = page.getByRole('dialog', { name: '反核销', exact: true })
    const prior = reversals.length
    await reverse.getByRole('button', { name: '确认反核销' }).click()
    expect(reversals).toHaveLength(prior)
    await reverse.getByLabel('业务原因 / 核销备注').fill(`隔离还原${index}`)
    if (index === 2) {
      await expect(page.locator('.el-message')).toHaveCount(0)
      await reverse.screenshot({ path: info.outputPath('writeoff-reverse.png') })
    }
    await reverse.getByRole('button', { name: '确认反核销' }).click()
    if (index === 1) {
      await expect(page.getByText('反核销失败，请重试', { exact: true })).toBeVisible()
      reverseFail = false
      await reverse.getByRole('button', { name: '确认反核销' }).click()
    }
    await expect(reverse).not.toBeVisible()
    await expect(row.getByRole('button', { name: '反核销', exact: true })).toHaveCount(0)
  }
  expect(schemes).toHaveLength(2)
  await expect(page.locator('.el-message')).toHaveCount(0)
  await historyDialog.screenshot({ path: info.outputPath('writeoff-history.png') })
})
