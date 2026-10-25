import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(120000)

for (const kind of ['estimate', 'financial'] as const) {
  test(`${kind} 两应收凭证生成、状态重读与等待期间撤权`, async ({ page }, info) => {
    const tenant = '11111111-1111-4111-8111-111111111111'
    const prefix = kind === 'estimate' ? 'FinanceEstimatedReceivable' : 'FinanceFinancialReceivable'
    const records = [1, 2].map((index) => ({
      id: `${kind}-${index}`,
      tenant_id: tenant,
      document_no: `QA-VOUCHER-${index}`,
      kind,
      status: 'approved',
      customer_name: `凭证验收客户${index}`,
      amount: index * 100,
      total_amount: index * 100,
      currency_code: 'CNY',
      business_date: '2026-10-25',
      voucher_id: null as string | null,
      voucher_no: null as string | null,
      lines: []
    }))
    const attempts: Array<{ p_kind: string; p_id: string; p_generate: boolean }> = []
    let stale = true
    let hold = false
    let release: (() => void) | undefined
    let finishedDetails = 0
    let fail = true
    await page.route('**/rest/v1/**', async (route) => {
      const url = new URL(route.request().url())
      const name = url.pathname.split('/').at(-1)
      const body = route.request().postDataJSON()
      if (name === 'sys_dictionary') {
        const code = (url.searchParams.get('dict_type_table.code') || '').replace(/^eq\./, '')
        const values = code === 'arDocumentStatus' ? [['approved', '已审核']] : []
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
      if (name === 'fms_receivable_workspace_secure') {
        const id = body.p_query?.id
        if (id && hold)
          await new Promise<void>((resolve) => {
            release = resolve
          })
        const rows = records
          .filter((row) => !id || row.id === id)
          .map((row) => (id && stale ? { ...row, status: 'draft' } : row))
        await route.fulfill({ json: { records: rows, total: rows.length } })
        if (id) finishedDetails++
        return
      }
      if (name === 'fms_ar_voucher_secure') {
        attempts.push(body)
        if (fail)
          return route.fulfill({
            status: 409,
            json: { code: '23514', message: '凭证生成失败，请核对后重试' }
          })
        const row = records.find((record) => record.id === body.p_id)
        expect(row).toBeDefined()
        if (row) {
          row.voucher_id = `voucher-${row.id}`
          row.voucher_no = `QA-PZ-${row.id}`
        }
        return route.fulfill({
          json: { message: '凭证已生成', voucher_id: row?.voucher_id, lines: [] }
        })
      }
      return route.fulfill({ json: [] })
    })
    const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
    const url = `/tests/e2e/fixtures/receivable-workspace.html?kind=${kind}&theme=${theme}&permissionControls=1&permissions=${prefix}:View,${prefix}:VoucherGenerate`
    await page.goto(url)
    if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/dark/)
    const select = (index: number) =>
      page
        .getByRole('row')
        .filter({ hasText: `QA-VOUCHER-${index}` })
        .locator('label.el-checkbox')
        .click()
    const generate = async () => {
      await page.getByRole('button', { name: '生成凭证', exact: true }).click()
      await page.getByRole('menuitem', { name: '生成凭证', exact: true }).click()
    }
    await select(1)
    await generate()
    await expect.poll(() => finishedDetails).toBe(1)
    await expect(page.locator('.el-message--warning')).toContainText('单据状态已变化')
    expect(attempts).toHaveLength(0)
    await expect(page.locator('.el-message')).toHaveCount(0)
    stale = false
    hold = true
    await generate()
    await expect.poll(() => Boolean(release)).toBe(true)
    await page.keyboard.press('Alt+Shift+G')
    release?.()
    await expect.poll(() => finishedDetails).toBe(2)
    await expect(page.locator('.el-message--warning')).toContainText('操作范围或权限已变化')
    expect(attempts).toHaveLength(0)
    hold = false
    await page.reload()
    for (const index of [1, 2]) {
      await select(index)
      await generate()
      if (index === 1) {
        await expect(page.locator('.el-message--error')).toContainText('凭证生成失败')
        fail = false
        await generate()
      }
      await expect(page.getByRole('row').filter({ hasText: `QA-VOUCHER-${index}` })).toContainText(
        `QA-PZ-${kind}-${index}`
      )
      await expect(page.locator('.el-message')).toHaveCount(0)
    }
    expect(attempts).toEqual(
      [1, 1, 2].map((index) => ({ p_kind: kind, p_id: `${kind}-${index}`, p_generate: true }))
    )
    await page.getByText(`QA-PZ-${kind}-2`, { exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({
      path: info.outputPath(`${kind}-vouchers-generated.png`),
      fullPage: true
    })
  })

  test(`${kind} 仅预览权限两单分录与失败重试`, async ({ page }, info) => {
    const prefix = kind === 'estimate' ? 'FinanceEstimatedReceivable' : 'FinanceFinancialReceivable'
    const records = [1, 2].map((index) => ({
      id: `preview-${index}`,
      document_no: `QA-PREVIEW-${index}`,
      kind,
      status: 'approved',
      amount: index * 100,
      total_amount: index * 100,
      currency_code: 'CNY',
      lines: []
    }))
    const calls: Array<{ p_kind: string; p_id: string; p_generate: boolean }> = []
    let fail = true
    await page.route('**/rest/v1/**', (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)
      const body = route.request().postDataJSON()
      if (name === 'fms_receivable_workspace_secure')
        return route.fulfill({
          json: {
            records: records.filter((row) => !body.p_query?.id || row.id === body.p_query.id),
            total: 2
          }
        })
      if (name === 'fms_ar_voucher_secure') {
        calls.push(body)
        if (fail)
          return route.fulfill({
            status: 409,
            json: { code: '23514', message: '凭证预览失败，请重试' }
          })
        const amount = body.p_id === 'preview-1' ? 100 : 200
        return route.fulfill({
          json: {
            message: '凭证预览',
            lines: [
              {
                summary: `预览分录${body.p_id}`,
                subject_code: '1122',
                subject_name: '应收账款',
                debit_amount: amount,
                credit_amount: 0
              },
              {
                summary: `预览分录${body.p_id}`,
                subject_code: '6001',
                subject_name: '主营业务收入',
                debit_amount: 0,
                credit_amount: amount
              }
            ]
          }
        })
      }
      return route.fulfill({ json: [] })
    })
    const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
    await page.goto(
      `/tests/e2e/fixtures/receivable-workspace.html?kind=${kind}&theme=${theme}&permissions=${prefix}:View,${prefix}:VoucherPreview`
    )
    if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/dark/)
    const preview = async () => {
      await page.getByRole('button', { name: '生成凭证', exact: true }).click()
      await expect(page.getByRole('menuitem', { name: '生成凭证', exact: true })).toHaveCount(0)
      await page.getByRole('menuitem', { name: '预览凭证', exact: true }).click()
    }
    for (const index of [1, 2]) {
      const selection = page
        .getByRole('row')
        .filter({ hasText: `QA-PREVIEW-${index}` })
        .locator('label.el-checkbox')
      await selection.click()
      await preview()
      if (index === 1) {
        await expect(page.locator('.el-message--error')).toContainText('凭证预览失败')
        fail = false
        await preview()
      }
      const dialog = page.getByRole('dialog', { name: '凭证预览', exact: true })
      await expect(dialog.getByText(`预览分录preview-${index}`, { exact: true })).toHaveCount(2)
      await expect(dialog).toContainText('应收账款')
      await expect(dialog).toContainText('主营业务收入')
      await expect(dialog).toContainText(`${index * 100}.00`)
      if (index === 2) {
        await dialog
          .getByRole('row')
          .filter({ hasText: '6001' })
          .getByText(/200\.00/)
          .scrollIntoViewIfNeeded()
        await dialog.screenshot({ path: info.outputPath(`${kind}-preview-second.png`) })
      }
      await dialog.getByRole('button', { name: '关闭此对话框', exact: true }).click()
      await selection.click()
      await expect(page.locator('.el-message')).toHaveCount(0)
    }
    expect(calls).toEqual(
      [1, 1, 2].map((index) => ({ p_kind: kind, p_id: `preview-${index}`, p_generate: false }))
    )
  })
}
