import { expect, test } from '@playwright/test'
import {
  assertPayableAcceptanceSession,
  acceptanceRecord as record,
  acceptanceRows as rows,
  acceptanceRpc as rpc,
  payableAcceptanceTenantId as tenant
} from './support/payable-live-session'
import {
  chooseReceiptReference as choose,
  selectReceiptRow as selectRow
} from './support/receipt-workspace'
import { prepareAppearance } from './support/appearance'

const enabled = process.env.E2E_PAYABLE_LIVE === 'true'
test.use({
  actionTimeout: 30_000,
  storageState: enabled
    ? process.env.E2E_AUTH_STATE_FILE || '.artifacts/qa-payable-real.storage.json'
    : { cookies: [], origins: [] },
  trace: 'off'
})
test.skip(!enabled, '仅显式在独立验收租户运行供应商退款实际到账验收')
test.setTimeout(300_000)

test('普通账号两笔原生供应商退款收款新增、审核、确认、取消与历史保留', async ({
  page,
  context
}, info) => {
  const client = await assertPayableAcceptanceSession(context)
  const supplierOptions = rows(
    await rpc(client, 'fms_ar_options_secure', { p_type: 'supplier', p_tenant_id: tenant })
  )
  const organizations = rows(
    await rpc(client, 'fms_ar_options_secure', { p_type: 'company', p_tenant_id: tenant })
  )
  const funds = rows(
    await rpc(client, 'fms_ar_options_secure', {
      p_type: 'supplier_receipt_fund',
      p_tenant_id: tenant
    })
  )
  const purposes = rows(
    await rpc(client, 'fms_ar_options_secure', {
      p_type: 'supplier_receipt_purpose',
      p_tenant_id: tenant
    })
  )
  const organization = organizations[0]
  const fund = funds.find((item) => item.account_type === 'cash' && item.currency_code === 'CNY')
  const purpose = purposes.find((item) => item.code === '205')
  expect(organization).toBeDefined()
  expect(fund).toBeDefined()
  expect(purpose).toBeDefined()
  if (!organization || !fund || !purpose) throw new Error('独立验收收款基础资料不完整')
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await prepareAppearance(page, {
    theme: info.project.name.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !info.project.name.includes('shadow')
  })
  await page.goto('#/fms/accounts-receivable/receipt', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '收款单', exact: true })).toBeVisible({
    timeout: 60_000
  })
  const guide = page.getByRole('button', { name: '知道了', exact: true })
  if (await guide.isVisible()) await guide.click()
  for (const index of [1, 2]) {
    const supplier = supplierOptions.find((item) => item.code === `QA_RPT_${index}`)
    expect(supplier).toBeDefined()
    if (!supplier) throw new Error('独立验收退款供应商不存在')
    const marker = `QA-SUPPLIER-RECEIPT-LIVE-${index}`
    const loadDocument = async () => {
      const result = record(
        await rpc(client, 'fms_receivable_workspace_secure', {
          p_kind: 'receipt',
          p_query: { supplierId: supplier.id, size: 200 }
        })
      )
      return rows(result.records).find((item) => item.remark === marker)
    }
    let document = await loadDocument()
    if (!document) {
      await page.getByRole('button', { name: '供应商退款收款', exact: true }).click()
      const drawer = page.getByRole('dialog', { name: '新增供应商退款收款', exact: true })
      await choose(page, drawer, '退款供应商', '选择退款供应商', String(supplier.code))
      await drawer
        .locator('.el-form-item')
        .filter({ has: page.getByText('退款收款用途', { exact: true }) })
        .getByRole('combobox')
        .click()
      await page.getByRole('option', { name: String(purpose.name), exact: true }).click()
      await drawer
        .locator('.el-form-item')
        .filter({ has: page.getByText('结算组织', { exact: true }) })
        .getByRole('combobox')
        .click()
      await page.getByRole('option', { name: String(organization.name), exact: true }).click()
      await choose(page, drawer, '实际收款账户', '选择实际收款账户', String(fund.code))
      await drawer
        .getByRole('spinbutton', { name: '第10行本次收款金额', exact: true })
        .fill(String(index * 10.01))
      await drawer
        .locator('.el-form-item')
        .filter({ has: page.getByText('备注', { exact: true }) })
        .getByRole('textbox')
        .fill(marker)
      await drawer.locator('.el-scrollbar__wrap').evaluateAll((elements) => {
        for (const element of elements) element.scrollTop = 0
      })
      await page.screenshot({
        path: info.outputPath(`live-supplier-receipt-create-${index}.png`),
        fullPage: true
      })
      await drawer.getByRole('button', { name: '保存草稿', exact: true }).click()
      await expect(drawer).toBeHidden()
      document = await loadDocument()
    }
    if (!document || typeof document.id !== 'string' || typeof document.documentNo !== 'string')
      throw new Error('真实收款单未保存或单号缺失')
    expect(document.tenant_id).toBe(tenant)
    expect(document.customer_id).toBeNull()
    expect(document.supplier_id).toBe(supplier.id)
    expect(document.account_set_id).toBe(fund.account_set_id)
    expect(Number(document.amount)).toBe(index * 10.01)
    const search = page.getByRole('textbox', { name: '组合查询', exact: true })
    await search.fill(document.documentNo)
    await page.getByRole('button', { name: '查询', exact: true }).click()
    const row = page.getByRole('row').filter({ hasText: document.documentNo }).first()
    await expect(row).toBeVisible()
    if (document.status === 'draft') {
      await selectRow(row)
      await page.getByRole('button', { name: '提交', exact: true }).click()
      await expect(row.getByText('已提交', { exact: true })).toBeVisible()
      document = await loadDocument()
    }
    if (document?.status === 'submitted') {
      await selectRow(row)
      await page.getByRole('button', { name: '审核', exact: true }).click()
      await expect(row.getByText('已审核', { exact: true })).toBeVisible()
      document = await loadDocument()
    }
    if (document?.status === 'approved') {
      await selectRow(row)
      await page.getByRole('button', { name: '确认收款', exact: true }).click()
      await page.getByRole('button', { name: '确定', exact: true }).click()
      await expect(row.getByText('已收款', { exact: true })).toBeVisible()
    }
    document = await loadDocument()
    expect(document?.status).toBe('confirmed')
    expect(document?.executionId).toBeTruthy()
    expect(Number(document?.availableAmount)).toBe(index * 10.01)
    await selectRow(row)
    await page.getByRole('button', { name: '预览凭证', exact: true }).click()
    const preview = page.getByRole('dialog', { name: '凭证预览', exact: true })
    await expect(preview).toBeVisible()
    await page.screenshot({
      path: info.outputPath(`live-supplier-receipt-voucher-${index}.png`),
      fullPage: true
    })
    await preview.getByRole('button', { name: '关闭此对话框', exact: true }).click()
    await selectRow(row)
    await page.getByRole('button', { name: '取消收款', exact: true }).click()
    const cancel = page.getByRole('dialog', { name: '取消供应商退款收款', exact: true })
    await cancel.getByRole('textbox').fill('独立验收虚构到账，按原执行冲回；保留全部审计历史')
    await cancel.getByRole('button', { name: '确定', exact: true }).click()
    await expect(row.getByText('已审核', { exact: true })).toBeVisible()
    document = await loadDocument()
    expect(document?.status).toBe('approved')
    expect(document?.executionId).toBeNull()
    expect(Number(document?.availableAmount)).toBe(0)
    await page.screenshot({
      path: info.outputPath(`live-supplier-receipt-cancelled-${index}.png`),
      fullPage: true
    })
  }
  await page.getByRole('button', { name: '供应商退款收款', exact: true }).click()
  const visualDraft = page.getByRole('dialog', { name: '新增供应商退款收款', exact: true })
  const visualSupplier = supplierOptions.find((item) => item.code === 'QA_RPT_2')
  if (!visualSupplier) throw new Error('缺少独立验收供应商')
  await choose(page, visualDraft, '退款供应商', '选择退款供应商', String(visualSupplier.code))
  await choose(page, visualDraft, '实际收款账户', '选择实际收款账户', String(fund.code))
  const method = visualDraft
    .locator('.el-form-item')
    .filter({ has: page.getByText('结算方式', { exact: true }) })
  await expect(method.getByText('现金', { exact: true })).toBeVisible()
  const account = visualDraft
    .locator('.el-form-item')
    .filter({ has: page.getByText('实际收款账户', { exact: true }) })
  await expect(account.locator('.el-form-item__error')).toHaveCount(0)
  await visualDraft.locator('.el-scrollbar__wrap').evaluateAll((elements) => {
    for (const element of elements) element.scrollTop = 0
  })
  await page.screenshot({
    path: info.outputPath('live-supplier-receipt-form-validated.png'),
    fullPage: true
  })
  await visualDraft.getByRole('button', { name: '取消', exact: true }).click()
  await expect(visualDraft).toBeHidden()
  expect(errors).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  )
})
