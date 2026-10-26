import { expect, test } from '@playwright/test'
import { acceptanceRecord as record, acceptanceRows as rows } from './support/payable-live-session'
import {
  chooseReceiptReference as choose,
  selectReceiptRow as selectRow
} from './support/receipt-workspace'
import { assertTableFocusContract } from './support/table-focus'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

const tenant = '11111111-1111-4111-8111-111111111111'
const dictionary: Record<string, Array<[string, string]>> = {
  arDocumentStatus: [
    ['draft', '草稿'],
    ['submitted', '已提交'],
    ['approved', '已审核'],
    ['confirmed', '已收款']
  ],
  arCounterpartyType: [
    ['customer', '客户'],
    ['supplier', '供应商']
  ],
  arSettlementMethod: [
    ['cash', '现金'],
    ['bank_transfer', '电汇'],
    ['bill', '票据']
  ],
  mdmCurrency: [
    ['CNY', '人民币'],
    ['USD', '美元']
  ]
}

test('两笔供应商退款复用原收款页，新增编辑、确认取消、凭证及客户隔离', async ({ page }, info) => {
  const documents: Array<Record<string, unknown>> = []
  const saves: Array<Record<string, unknown>> = []
  const actions: string[] = []
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const body = route.request().method() === 'POST' ? record(route.request().postDataJSON()) : {}
    let response: unknown = []
    if (url.pathname.endsWith('/sys_dictionary')) {
      const code = (url.searchParams.get('dict_type_table.code') || '').replace(/^eq\./, '')
      response = (dictionary[code] || []).map(([value, label], index) => ({
        id: `${code}-${index}`,
        code: value,
        value,
        label,
        status: '1',
        sort: index,
        dict_type_table: { code, name: code },
        tag_type: ''
      }))
    } else if (url.pathname.endsWith('/fms_ar_options_secure')) {
      const type = String(body.p_type)
      response =
        type === 'supplier'
          ? [1, 2].map((index) => ({
              id: `supplier-${index}`,
              tenant_id: tenant,
              code: `SUP-${index}`,
              name: `虚构退款供应商${index}`
            }))
          : type === 'supplier_receipt_purpose'
            ? [{ id: 'purpose', tenant_id: tenant, code: '205', name: '退采购付款' }]
            : type === 'company'
              ? [{ id: 'organization', tenant_id: tenant, code: 'ORG-QA', name: '虚构结算组织' }]
              : type === 'supplier_receipt_fund'
                ? [1, 2].map((index) => ({
                    id: `fund-${index}`,
                    tenant_id: tenant,
                    code: `FUND-${index}`,
                    name: index === 1 ? '虚构现金账户' : '虚构美元账户',
                    account_set_id: `book-${index}`,
                    account_set_name: `验收原账套${index}`,
                    base_currency_code: 'CNY',
                    account_type: index === 1 ? 'cash' : 'bank',
                    currency_code: index === 1 ? 'CNY' : 'USD'
                  }))
                : []
    } else if (url.pathname.endsWith('/fms_receivable_workspace_secure')) {
      const query = record(body.p_query)
      const selected = documents.filter(
        (item) =>
          (!query.id || item.id === query.id) &&
          (!query.ids || (Array.isArray(query.ids) && query.ids.includes(item.id))) &&
          (!query.partyType || query.partyType === 'supplier')
      )
      response = { records: selected, total: selected.length }
    } else if (url.pathname.endsWith('/fms_save_receipt_secure')) {
      const payload = record(body.p_payload)
      saves.push(payload)
      expect(payload.customerId).toBeNull()
      expect(payload.purposeId).toBe('purpose')
      expect(payload).not.toHaveProperty('partyName')
      const position = Number(String(payload.supplierId).split('-')[1])
      const existing = documents.find((item) => item.id === payload.id)
      const document = {
        ...payload,
        id: payload.id || `receipt-${position}`,
        tenant_id: tenant,
        status: 'draft',
        documentNo: `SK-QA-${position}`,
        supplier_id: payload.supplierId,
        partyName: `虚构退款供应商${position}`,
        supplierName: `虚构退款供应商${position}`,
        partyType: 'supplier',
        purposeName: '退采购付款',
        accountSetName: `验收原账套${position}`,
        amount: rows(payload.lines).reduce((sum, line) => sum + Number(line.amount), 0),
        availableAmount: 0,
        refundableAmount: 0,
        organizationName: '虚构结算组织',
        account_set_id: `book-${position}`,
        lines: payload.lines
      }
      if (existing) Object.assign(existing, document)
      else documents.push(document)
      response = document.id
    } else if (url.pathname.endsWith('/fms_act_receipt_secure')) {
      const document = documents.find((item) => item.id === body.p_id)
      expect(document).toBeDefined()
      const action = String(body.p_action)
      actions.push(action)
      if (document) {
        document.status =
          action === 'submit' ? 'submitted' : action === 'approve' ? 'approved' : 'confirmed'
        if (action === 'confirm') document.availableAmount = document.amount
      }
      response = null
    } else if (url.pathname.endsWith('/fms_cancel_supplier_receipt_secure')) {
      expect(String(body.p_reason).length).toBeGreaterThan(0)
      const document = documents.find((item) => item.id === body.p_id)
      if (document) Object.assign(document, { status: 'approved', availableAmount: 0 })
      actions.push('cancel')
      response = null
    } else if (url.pathname.endsWith('/fms_ar_voucher_secure')) {
      expect(body.p_kind).toBe('receipt')
      response = body.p_generate
        ? { status: 'pending_configuration', message: '实际收款已保留，请配置原账套退款到账规则' }
        : {
            message: '按原账套及原记账汇率预览',
            lines: [
              {
                summary: '退款收款',
                subjectCode: '1001',
                subjectName: '验收现金',
                debitAmount: 123,
                creditAmount: 0
              },
              {
                summary: '退款收款',
                subjectCode: '2202',
                subjectName: '验收应付',
                debitAmount: 0,
                creditAmount: 123
              }
            ]
          }
    }
    await route.fulfill({ json: response, headers: { 'content-range': '0-1/2' } })
  })
  const dark = info.project.name.includes('dark')
  const shadow = info.project.name.includes('shadow')
  await page.goto(
    `/tests/e2e/fixtures/receivable-workspace.html?kind=receipt&theme=${dark ? 'dark' : 'light'}&box=${shadow ? 'shadow-mode' : 'border-mode'}`
  )
  for (const index of [1, 2]) {
    await page.getByRole('button', { name: '供应商退款收款', exact: true }).click()
    const drawer = page.getByRole('dialog', { name: '新增供应商退款收款', exact: true })
    await expect(drawer).toBeVisible()
    await expect(drawer.getByText('结算客户', { exact: true })).toHaveCount(0)
    await choose(page, drawer, '退款供应商', '选择退款供应商', `SUP-${index}`)
    await drawer
      .locator('.el-form-item')
      .filter({ has: page.getByText('退款收款用途', { exact: true }) })
      .getByRole('combobox')
      .click()
    await page.getByRole('option', { name: '退采购付款', exact: true }).click()
    await drawer
      .locator('.el-form-item')
      .filter({ has: page.getByText('结算组织', { exact: true }) })
      .getByRole('combobox')
      .click()
    await page.getByRole('option', { name: '虚构结算组织', exact: true }).click()
    await drawer.getByRole('button', { name: '保存草稿', exact: true }).click()
    const fundField = drawer
      .locator('.el-form-item')
      .filter({ has: page.getByText('实际收款账户', { exact: true }) })
    await expect(fundField.getByText('请选择实际收款账户', { exact: true })).toBeVisible()
    await choose(page, drawer, '实际收款账户', '选择实际收款账户', `FUND-${index}`)
    await expect(fundField.locator('.el-form-item__error')).toHaveCount(0)
    await expect(drawer.getByText(`验收原账套${index}`, { exact: true })).toBeVisible()
    if (index === 2)
      await drawer
        .locator('.el-form-item')
        .filter({ has: page.getByText('原记账汇率', { exact: true }) })
        .getByRole('spinbutton')
        .fill('7.25')
    await drawer
      .getByRole('spinbutton', { name: '第10行本次收款金额', exact: true })
      .fill(String(index * 12.34))
    await expect(page.locator('.el-message')).toHaveCount(0)
    await drawer.locator('.el-scrollbar__wrap').evaluateAll((elements) => {
      for (const element of elements) element.scrollTop = 0
    })
    await page.screenshot({
      path: info.outputPath(`supplier-receipt-header-${index}.png`),
      fullPage: true
    })
    await drawer.getByText(/收款合计/).scrollIntoViewIfNeeded()
    await page.screenshot({
      path: info.outputPath(`supplier-receipt-editor-${index}.png`),
      fullPage: true
    })
    await drawer.getByRole('button', { name: '保存草稿', exact: true }).click()
    await expect(drawer).toBeHidden()
    expect(saves.at(-1)?.currencyCode).toBe(index === 1 ? 'CNY' : 'USD')
    expect(saves.at(-1)?.exchangeRate).toBe(index === 1 ? 1 : 7.25)
    expect(saves.at(-1)?.paymentMethod).toBe(index === 1 ? 'cash' : 'bank_transfer')
    const row = page
      .getByRole('row')
      .filter({ hasText: `SK-QA-${index}` })
      .first()
    await row.getByRole('button', { name: '编辑', exact: true }).click()
    const editor = page.getByRole('dialog', { name: '编辑供应商退款收款', exact: true })
    await expect(
      editor.getByRole('spinbutton', { name: '第10行本次收款金额', exact: true })
    ).toHaveValue(String(index * 12.34))
    await editor.getByRole('button', { name: '保存草稿', exact: true }).click()
    await expect(editor).toBeHidden()
    for (const command of ['提交', '审核', '确认收款']) {
      await selectRow(row)
      await page.getByRole('button', { name: command, exact: true }).click()
      if (command === '确认收款')
        await page.getByRole('button', { name: '确定', exact: true }).click()
      await expect
        .poll(() => documents[index - 1].status)
        .toBe(command === '提交' ? 'submitted' : command === '审核' ? 'approved' : 'confirmed')
      await expect(
        row.getByText(command === '提交' ? '已提交' : command === '审核' ? '已审核' : '已收款', {
          exact: true
        })
      ).toBeVisible()
    }
    await selectRow(row)
    await expect(page.getByRole('button', { name: '收款退款', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: '核销记录', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: '预览凭证', exact: true }).click()
    const voucher = page.getByRole('dialog', { name: '凭证预览', exact: true })
    await expect(voucher.getByText('验收现金', { exact: true })).toBeVisible()
    await voucher.getByRole('button', { name: '关闭此对话框', exact: true }).click()
    await selectRow(row)
    await page.getByRole('button', { name: '生成凭证', exact: true }).click()
    await expect(
      page.getByText('实际收款已保留，请配置原账套退款到账规则', { exact: true })
    ).toBeVisible()
    await selectRow(row)
    await page.getByRole('button', { name: '取消收款', exact: true }).click()
    const cancel = page.getByRole('dialog', { name: '取消供应商退款收款', exact: true })
    await cancel.getByRole('textbox').fill('仅验收虚构到账冲回')
    await cancel.getByRole('button', { name: '确定', exact: true }).click()
    await expect.poll(() => documents[index - 1].status).toBe('approved')
  }
  await expect(page.locator('.el-message')).toHaveCount(0)
  const detailRow = page.getByRole('row').filter({ hasText: 'SK-QA-2' }).first()
  await detailRow.getByRole('button', { name: '查看', exact: true }).click()
  const detail = page.getByRole('dialog', { name: '收款单详情', exact: true })
  await expect(detail.getByText('虚构退款供应商2', { exact: true })).toBeVisible()
  await expect(detail.getByText('验收原账套2', { exact: true })).toBeVisible()
  await expect(detail.getByRole('textbox')).toHaveCount(0)
  await detail.getByRole('button', { name: /关闭/ }).click()
  await assertTableFocusContract(page, info)
  await page.screenshot({ path: info.outputPath('supplier-receipt-workspace.png'), fullPage: true })
  expect(saves).toHaveLength(4)
  expect(actions).toEqual([
    'submit',
    'approve',
    'confirm',
    'cancel',
    'submit',
    'approve',
    'confirm',
    'cancel'
  ])
  expect(errors).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  )
})
