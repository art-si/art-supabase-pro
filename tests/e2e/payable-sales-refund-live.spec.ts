import assert from 'node:assert/strict'
import { appendFileSync, readFileSync } from 'node:fs'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { captureBusinessEvidence } from './support/capture-business-evidence'
import { prepareAppearance } from './support/appearance'
import {
  acceptanceIdentifier,
  acceptanceRecord,
  acceptanceRows,
  acceptanceRpc,
  assertPayableAcceptanceSession,
  payableAcceptanceTenantId
} from './support/payable-live-session'

const enabled = process.env.E2E_PAYABLE_LIVE === 'true'
test.use({
  storageState: enabled
    ? process.env.E2E_AUTH_STATE_FILE || '.artifacts/qa-payable-currency.storage.json'
    : { cookies: [], origins: [] },
  trace: 'off',
  actionTimeout: 25_000
})
test.skip(!enabled, '仅在独立验收租户显式运行销售退款真实流程')
test.setTimeout(420_000)

async function selectRow(row: Locator): Promise<void> {
  await expect(row).toBeVisible()
  if (!(await row.getByRole('checkbox').isChecked()))
    await row.locator('.el-checkbox').first().click()
}

async function openWorkspace(
  page: Page,
  path: string,
  heading: string,
  rpc: string
): Promise<void> {
  const loaded = page.waitForResponse((response) => response.url().endsWith(`/rpc/${rpc}`), {
    timeout: 90_000
  })
  await page.goto(`#${path}`, { waitUntil: 'domcontentloaded' })
  expect((await loaded).ok()).toBe(true)
  await expect(page.getByRole('heading', { name: heading, exact: true, level: 1 })).toBeVisible({
    timeout: 60_000
  })
  await expect(page.getByRole('button', { name: '查询', exact: true })).toBeEnabled()
  const guide = page.getByRole('button', { name: '知道了', exact: true })
  if ((await guide.isVisible()) && !(await page.locator('.el-overlay.is-drawer:visible').count()))
    await guide.click()
}

async function act(
  page: Page,
  row: Locator,
  label: '提交' | '审核',
  status: string
): Promise<void> {
  await selectRow(row)
  await page.getByRole('button', { name: label, exact: true }).click()
  await expect(row).toContainText(status)
}

async function prepareCreditReceivable(
  client: Awaited<ReturnType<typeof assertPayableAcceptanceSession>>,
  index: number,
  run: string
): Promise<{ id: string; documentNo: string; customerName: string }> {
  const [types, customers, organizations] = await Promise.all([
    acceptanceRpc(client, 'fms_ar_options_secure', {
      p_type: 'financial_type',
      p_tenant_id: payableAcceptanceTenantId,
      p_keyword: ''
    }),
    acceptanceRpc(client, 'fms_ar_options_secure', {
      p_type: 'customer',
      p_tenant_id: payableAcceptanceTenantId,
      p_keyword: ''
    }),
    acceptanceRpc(client, 'fms_ar_options_secure', {
      p_type: 'company',
      p_tenant_id: payableAcceptanceTenantId,
      p_keyword: ''
    })
  ])
  const documentType = acceptanceRows(types)[0]
  const customerOptions = acceptanceRows(customers)
  const customer = customerOptions[(index - 1) % customerOptions.length]
  const organization = acceptanceRows(organizations)[0]
  assert.ok(documentType && customer && organization)
  const sourceId = await acceptanceRpc(client, 'fms_save_receivable_document_secure', {
    p_payload: {
      kind: 'financial',
      tenantId: payableAcceptanceTenantId,
      documentTypeId: acceptanceIdentifier(documentType),
      customerId: acceptanceIdentifier(customer),
      payerCustomerId: acceptanceIdentifier(customer),
      settlementOrganizationId: acceptanceIdentifier(organization),
      businessDate: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }),
      currencyCode: 'CNY',
      isCredit: true,
      settlementMethod: 'cash',
      remark: `销售退款真实验收-${run}-${index}`,
      lines: [
        {
          lineNo: 10,
          basis: 'amount',
          materialDescription: `销售退款真实验收金额-${index}`,
          enteredGrossAmount: index * 100,
          quantity: 0,
          unitPrice: 0,
          priceBasis: 'taxed',
          taxRate: 0,
          discountMethod: 'none'
        }
      ]
    }
  })
  assert.ok(typeof sourceId === 'string')
  for (const action of ['submit', 'approve'])
    await acceptanceRpc(client, 'fms_act_receivable_document_secure', {
      p_id: sourceId,
      p_action: action
    })
  const workspace = acceptanceRecord(
    await acceptanceRpc(client, 'fms_receivable_workspace_secure', {
      p_kind: 'financial',
      p_query: { id: sourceId, size: 1 }
    })
  )
  const source = acceptanceRows(workspace.records)[0]
  assert.ok(source && typeof source.document_no === 'string' && typeof customer.name === 'string')
  return { id: sourceId, documentNo: source.document_no, customerName: customer.name }
}

test.beforeEach(async ({ context, page }, info) => {
  await assertPayableAcceptanceSession(context)
  await prepareAppearance(page, {
    theme: info.project.name.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !info.project.name.includes('shadow')
  })
})

test('两组真实销售退款从红字应收到付款制证全流程', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'desktop-1440', '真实写入流程仅执行一次')
  const client = await assertPayableAcceptanceSession(context)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const run = Date.now().toString(36).toUpperCase()
  for (const index of [1, 2]) {
    const source = await prepareCreditReceivable(client, index, run)
    await openWorkspace(
      page,
      `/fms/accounts-receivable/financial-receivable?recordId=${source.id}`,
      '财务应收单',
      'fms_receivable_workspace_secure'
    )
    const sourceOverlay = page.locator('.el-overlay.is-drawer:visible')
    if (await sourceOverlay.isVisible()) {
      await expect(sourceOverlay.locator('.el-skeleton,.el-loading-mask')).toHaveCount(0, {
        timeout: 60_000
      })
      await sourceOverlay.getByRole('button', { name: '关闭此对话框', exact: true }).click()
      await expect(sourceOverlay).toBeHidden()
    }
    const toolbar = page
      .locator('.business-table-workspace-actions__toggle')
      .filter({ hasText: '显示工具栏' })
      .locator('.el-switch')
    if (!(await toolbar.getAttribute('class'))?.includes('is-checked')) await toolbar.click()
    const sourceRow = page
      .locator('.art-table-query .el-table__body-wrapper tbody tr')
      .filter({ hasText: source.documentNo })
    await expect(sourceRow).toContainText(source.documentNo)
    await selectRow(sourceRow)
    await page.getByRole('button', { name: '下推', exact: true }).click()
    await captureBusinessEvidence(page, {
      path: info.outputPath(`sales-refund-source-action-${index}.png`)
    })
    const pushedApplication = page.waitForResponse((response) =>
      response.url().endsWith('/rpc/fms_push_payable_settlement_secure')
    )
    await page
      .locator('.el-dropdown__popper:visible')
      .getByRole('menuitem', { name: '销售退款申请', exact: true })
      .click()
    const applicationResponse = await pushedApplication
    expect(applicationResponse.ok()).toBe(true)
    const application = acceptanceRecord(await applicationResponse.json())
    const applicationId = acceptanceIdentifier(application)
    assert.equal(typeof application.document_no, 'string')
    const applicationNo = application.document_no as string
    await expect(
      page.getByRole('heading', { name: '付款申请单', exact: true, level: 1 })
    ).toBeVisible()
    const detail = page.getByRole('dialog', { name: '查看付款申请单', exact: true })
    if (await detail.isVisible()) {
      await expect(detail).toContainText(source.documentNo)
      await expect(detail).toContainText(source.customerName)
      await captureBusinessEvidence(detail, {
        path: info.outputPath(`sales-refund-application-source-${index}.png`)
      })
      await page.keyboard.press('Escape')
      await expect(detail).toBeHidden()
    }
    const applicationRow = page
      .locator('.art-table-query .el-table__body-wrapper tbody tr')
      .filter({ hasText: applicationNo })
    await applicationRow.getByRole('button', { name: '编辑', exact: true }).click()
    const applicationEditor = page.getByRole('dialog', {
      name: '编辑付款申请单',
      exact: true
    })
    await expect(applicationEditor.getByRole('button', { name: '保存', exact: true })).toBeEnabled({
      timeout: 60_000
    })
    const account = applicationEditor.getByRole('combobox', { name: '付款账号', exact: true })
    await account.scrollIntoViewIfNeeded()
    await account.click()
    await page.getByRole('option', { name: /验收模拟现金账户（非银行）/ }).click()
    await captureBusinessEvidence(applicationEditor, {
      path: info.outputPath(`sales-refund-application-editor-${index}.png`)
    })
    const savedApplication = page.waitForResponse((response) =>
      response.url().endsWith('/rpc/fms_save_payable_settlement_secure')
    )
    await applicationEditor.getByRole('button', { name: '保存', exact: true }).click()
    expect((await savedApplication).ok()).toBe(true)
    await expect(applicationEditor).toBeHidden()
    await act(page, applicationRow, '提交', '已提交')
    await act(page, applicationRow, '审核', '已审核')
    await selectRow(applicationRow)
    await page.getByRole('button', { name: '下推', exact: true }).click()
    const pushedPayment = page.waitForResponse((response) =>
      response.url().endsWith('/rpc/fms_push_payable_settlement_secure')
    )
    await page
      .locator('.el-dropdown__popper:visible')
      .getByRole('menuitem', { name: '付款单', exact: true })
      .click()
    const paymentResponse = await pushedPayment
    expect(paymentResponse.ok()).toBe(true)
    const payment = acceptanceRecord(await paymentResponse.json())
    const paymentId = acceptanceIdentifier(payment)
    assert.equal(typeof payment.document_no, 'string')
    const paymentNo = payment.document_no as string
    await expect(page.getByRole('heading', { name: '付款单', exact: true, level: 1 })).toBeVisible()
    const paymentDetail = page.getByRole('dialog', { name: '查看付款单', exact: true })
    if (await paymentDetail.isVisible()) {
      await expect(paymentDetail).toContainText(source.documentNo)
      await page.keyboard.press('Escape')
      await expect(paymentDetail).toBeHidden()
    }
    const paymentRow = page
      .locator('.art-table-query .el-table__body-wrapper tbody tr')
      .filter({ hasText: paymentNo })
    await act(page, paymentRow, '提交', '已提交')
    await act(page, paymentRow, '审核', '已审核')
    await selectRow(paymentRow)
    await page.getByRole('button', { name: '确认付款', exact: true }).click()
    const confirmed = page.waitForResponse((response) =>
      response.url().endsWith('/rpc/fms_act_payable_settlement_secure')
    )
    await page
      .locator('.el-dropdown__popper:visible')
      .getByRole('menuitem', { name: '确认付款', exact: true })
      .click()
    await page
      .locator('.el-message-box')
      .getByRole('button', { name: '确认登记', exact: true })
      .click()
    expect((await confirmed).ok()).toBe(true)
    await expect(paymentRow).toContainText('已确认付款')
    await captureBusinessEvidence(page, {
      path: info.outputPath(`sales-refund-payment-confirmed-${index}.png`)
    })
    await selectRow(paymentRow)
    await page.getByRole('button', { name: '生成凭证', exact: true }).click()
    const previewResponse = page.waitForResponse((response) =>
      response.url().endsWith('/rpc/fms_payable_settlement_voucher_secure')
    )
    await page
      .locator('.el-dropdown__popper:visible')
      .getByRole('menuitem', { name: '预览凭证', exact: true })
      .click()
    expect((await previewResponse).ok()).toBe(true)
    const preview = page.getByRole('dialog', { name: '凭证预览', exact: true })
    await expect(preview).toContainText('验收应收账款')
    await expect(preview).toContainText('验收现金')
    await captureBusinessEvidence(preview, {
      path: info.outputPath(`sales-refund-voucher-preview-${index}.png`)
    })
    await page.keyboard.press('Escape')
    const generatedResponse = page.waitForResponse((response) =>
      response.url().endsWith('/rpc/fms_payable_settlement_voucher_secure')
    )
    await page.getByRole('button', { name: '生成凭证', exact: true }).click()
    await page
      .locator('.el-dropdown__popper:visible')
      .getByRole('menuitem', { name: '生成凭证', exact: true })
      .click()
    const generated = acceptanceRecord(await (await generatedResponse).json())
    expect(generated.status).toBe('generated')
    const rawVoucherIds = Array.isArray(generated.voucher_ids) ? generated.voucher_ids : []
    expect(rawVoucherIds).toHaveLength(1)
    assert.equal(typeof rawVoucherIds[0], 'string')
    appendFileSync(
      '.artifacts/payable-sales-refund-live-records.jsonl',
      JSON.stringify({
        run,
        index,
        sourceId: source.id,
        sourceNo: source.documentNo,
        applicationId,
        applicationNo,
        paymentId,
        paymentNo,
        voucherId: rawVoucherIds[0],
        provider: 'supabase'
      }) + '\n'
    )
  }
  expect(errors).toEqual([])
})

test('两组真实销售退款列表与详情视觉验收', async ({ page }, info) => {
  const entries = acceptanceRows(
    readFileSync('.artifacts/payable-sales-refund-live-records.jsonl', 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
  )
  const run = entries.at(-1)?.run
  const records = entries.filter((entry) => entry.run === run && entry.provider === 'supabase')
  expect(records).toHaveLength(2)
  for (const [route, heading, key, rpc] of [
    ['payment-application', '付款申请单', 'applicationNo', 'fms_payable_settlement_list_secure'],
    ['payment', '付款单', 'paymentNo', 'fms_payable_settlement_list_secure']
  ] as const) {
    await openWorkspace(page, `/fms/accounts-payable/${route}`, heading, rpc)
    for (const [index, record] of records.entries()) {
      const documentNo = record[key]
      assert.ok(typeof documentNo === 'string')
      const row = page
        .locator('.art-table-query .el-table__body-wrapper tbody tr')
        .filter({ hasText: documentNo })
      await expect(row).toBeVisible()
      await expect(row).toContainText('销售退款')
      await captureBusinessEvidence(page, {
        path: info.outputPath(`sales-refund-${route}-list-${index + 1}.png`)
      })
      await row.getByRole('button', { name: '查看', exact: true }).click()
      const detail = page.getByRole('dialog', {
        name: route === 'payment' ? '查看付款单' : '查看付款申请单',
        exact: true
      })
      await expect(detail).toContainText(documentNo)
      await expect(detail).toContainText('销售退款')
      await expect(detail.locator('.el-skeleton:visible,.el-loading-mask:visible')).toHaveCount(0)
      await captureBusinessEvidence(detail, {
        path: info.outputPath(`sales-refund-${route}-detail-${index + 1}.png`)
      })
      await detail.getByRole('button', { name: '关闭此对话框', exact: true }).click()
      await expect(detail).toBeHidden()
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
      )
    ).toBe(true)
  }
})
