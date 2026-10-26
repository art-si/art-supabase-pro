import assert from 'node:assert/strict'
import { appendFileSync, readFileSync } from 'node:fs'
import { expect, type Page, type Locator } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  acceptanceRecord as record,
  acceptanceRows as rows,
  acceptanceIdentifier as identifier,
  acceptanceRpc as rpc,
  payableAcceptanceTenantId as tenant
} from './payable-live-session'
import {
  chooseReceiptReference as choose,
  selectReceiptRow as selectRow
} from './receipt-workspace'

export const journalPath = '.artifacts/payable-receipt-refund-live-records.jsonl'

export interface RefundScenario {
  index: number
  supplierId: string
  supplierCode: string
  marker: string
  payable: Record<string, unknown>
  amount: number
  receiptAmount: number
  receiptRate: number
  fundCode: string
  receipt?: Record<string, unknown>
}

export function journal(value: Record<string, unknown>): void {
  appendFileSync(journalPath, JSON.stringify(value) + '\n')
}

export async function payableDocument(client: SupabaseClient, id: string) {
  const document = rows(
    record(
      await rpc(client, 'fms_purchase_payable_list_secure', {
        p_kind: 'financial',
        p_id: id,
        p_limit: 1
      })
    ).data
  )[0]
  expect(document.tenant_id).toBe(tenant)
  return document
}

export async function prepareScenarios(client: SupabaseClient): Promise<RefundScenario[]> {
  const context = record(JSON.parse(readFileSync('.artifacts/apar-live-context.json', 'utf8')))
  expect(context.tenantId).toBe(tenant)
  const dictionaryTypes = await client
    .from('sys_dict_type')
    .select('id,code')
    .in('code', ['supplierCategory', 'supplierType', 'enterpriseNature', 'supplierIndustry'])
  expect(dictionaryTypes.error).toBeNull()
  const dictionaryItems = await client
    .from('sys_dictionary')
    .select('type_id,value')
    .in('type_id', rows(dictionaryTypes.data).map(identifier))
    .eq('status', '1')
    .order('sort')
  expect(dictionaryItems.error).toBeNull()
  const dictionaryValue = (code: string) => {
    const typeIds = rows(dictionaryTypes.data)
      .filter((entry) => entry.code === code)
      .map(identifier)
    const item = rows(dictionaryItems.data).find((entry) => typeIds.includes(String(entry.type_id)))
    assert.ok(item && typeof item.value === 'string', `缺少可用字典 ${code}`)
    return item.value
  }
  const types = await client
    .from('mdm_document_type')
    .select('id')
    .eq('tenant_id', tenant)
    .eq('document_type_code', 'AP_FIN_EXPENSE')
  expect(types.error).toBeNull()
  const documentType = identifier(rows(types.data)[0])
  const scenarios: RefundScenario[] = []
  for (const index of [1, 2]) {
    const supplierCode = `QA_PRF_UI_${index}`
    const supplierRows = await client
      .from('mdm_supplier')
      .select('id')
      .eq('tenant_id', tenant)
      .eq('supplier_code', supplierCode)
    expect(supplierRows.error).toBeNull()
    let supplierId = rows(supplierRows.data)[0]?.id
    if (!supplierId)
      supplierId = await rpc(client, 'smis_save_supplier_secure', {
        p_id: null,
        p_payload: {
          tenant_id: tenant,
          supplier_code: supplierCode,
          supplier_name: `退款核销独立验收供应商${index}`,
          supplier_category: dictionaryValue('supplierCategory'),
          supplier_type: dictionaryValue('supplierType'),
          enterprise_nature: dictionaryValue('enterpriseNature'),
          industry: dictionaryValue('supplierIndustry'),
          address_detail: `独立退款核销验收虚构地址${index}`,
          coordinate_system: 'gcj02',
          remark: '仅独立应付退款验收，不用于真实采购或转账'
        }
      })
    assert.ok(typeof supplierId === 'string')
    const marker = `QA-PRF-LIVE-${index}`
    const prior = await client
      .from('fms_purchase_payable_document')
      .select('id')
      .eq('tenant_id', tenant)
      .eq('kind', 'financial')
      .contains('details', { invoice_no: marker })
    expect(prior.error).toBeNull()
    expect(rows(prior.data).length).toBeLessThanOrEqual(1)
    const amount = index === 1 ? 20.01 : 100
    const created =
      rows(prior.data)[0] ||
      record(
        await rpc(client, 'fms_save_purchase_payable_secure', {
          p_document: {
            kind: 'financial',
            tenant_id: tenant,
            document_type_id: documentType,
            supplier_id: supplierId,
            organization_id: context.organizationId,
            business_date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(
              new Date()
            ),
            currency_code: index === 1 ? 'CNY' : 'USD',
            exchange_rate: index === 1 ? 1 : 7,
            is_credit: true,
            input_tax_inclusive_price: false,
            invoice_no: marker,
            remark: marker,
            lines: [
              {
                material_id: context.materialId,
                inventory_unit_id: context.inventoryUnitId,
                quantity: 1,
                unit_price: amount,
                tax_rate: 0
              }
            ]
          }
        })
      )
    let payable = await payableDocument(client, identifier(created))
    for (const status of ['draft', 'submitted']) {
      if (payable.status !== status) continue
      await rpc(client, 'fms_act_purchase_payable_secure', {
        p_ids: [identifier(payable)],
        p_action: status === 'draft' ? 'submit' : 'approve'
      })
      payable = await payableDocument(client, identifier(payable))
    }
    expect(payable.status).toBe('approved')
    expect(Number(payable.total_amount)).toBe(-amount)
    scenarios.push({
      index,
      supplierId,
      supplierCode,
      marker,
      payable,
      amount,
      receiptAmount: index === 1 ? amount : 90,
      receiptRate: index === 1 ? 1 : 8,
      fundCode: index === 1 ? 'QA_AP_CASH' : 'QA_PRF_EUR'
    })
    journal({ stage: 'source', index, payableId: payable.id, marker, supplierId })
  }
  const legacy = record(await rpc(client, 'fms_payable_scheme_configuration_secure', {}))
  expect(rows(legacy.relations)).toHaveLength(4)
  const modern = record(
    await rpc(client, 'fms_payable_scheme_configuration_secure', { p_client_version: 2 })
  )
  expect(rows(modern.relations).some((entry) => entry.value === 'payable_refund')).toBe(true)
  const supplierRules = [
    {
      primary_field: 'supplier_id',
      secondary_field: 'supplier_id',
      operator: 'eq',
      empty_matches: false
    }
  ]
  for (const automatic of [false, true]) {
    const code = automatic ? 'QA_PRF_UI_AUTO' : 'QA_PRF_UI_MANUAL'
    const previous = rows(modern.schemes).find((entry) => entry.code === code)
    if (previous) continue
    await rpc(client, 'fms_save_payable_reference_secure', {
      p_kind: 'scheme',
      p_record: {
        tenant_id: tenant,
        configuration_version: 2,
        code,
        name: automatic ? '退款核销独立自动验收' : '退款核销独立手工验收',
        enabled: true,
        automatic,
        rules: supplierRules,
        relation_rules: [
          {
            relation: 'payable_refund',
            description: '仅供应商实际退款，保留双方原记账汇率',
            rules: supplierRules
          }
        ]
      }
    })
  }
  return scenarios
}

export async function receiptDocument(client: SupabaseClient, scenario: RefundScenario) {
  const workspace = record(
    await rpc(client, 'fms_receivable_workspace_secure', {
      p_kind: 'receipt',
      p_query: { supplierId: scenario.supplierId, size: 200 }
    })
  )
  const matching = rows(workspace.records).filter((entry) => entry.remark === scenario.marker)
  expect(matching.length).toBeLessThanOrEqual(1)
  return matching[0]
}

export async function ensureReceipt(
  page: Page,
  client: SupabaseClient,
  scenario: RefundScenario,
  options: { allowBackgroundMatch?: boolean } = {}
) {
  let document = await receiptDocument(client, scenario)
  await page.goto('#/fms/accounts-receivable/receipt', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '收款单', exact: true })).toBeVisible({
    timeout: 60_000
  })
  const guide = page.getByRole('button', { name: '知道了', exact: true })
  if (await guide.isVisible()) await guide.click()
  if (!document) {
    const purposes = rows(
      await rpc(client, 'fms_ar_options_secure', {
        p_type: 'supplier_receipt_purpose',
        p_tenant_id: tenant
      })
    )
    const organizations = rows(
      await rpc(client, 'fms_ar_options_secure', { p_type: 'company', p_tenant_id: tenant })
    )
    const purpose = purposes.find((entry) => entry.code === '205')
    assert.ok(purpose && organizations[0])
    await page.getByRole('button', { name: '供应商退款收款', exact: true }).click()
    const drawer = page.getByRole('dialog', { name: '新增供应商退款收款', exact: true })
    await choose(page, drawer, '退款供应商', '选择退款供应商', scenario.supplierCode)
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
    await page.getByRole('option', { name: String(organizations[0].name), exact: true }).click()
    await choose(page, drawer, '实际收款账户', '选择实际收款账户', scenario.fundCode)
    await drawer.getByRole('spinbutton', { name: /原记账汇率$/ }).fill(String(scenario.receiptRate))
    await drawer
      .getByRole('spinbutton', { name: '第10行本次收款金额', exact: true })
      .fill(String(scenario.receiptAmount))
    await drawer
      .locator('.el-form-item')
      .filter({ has: page.getByText('备注', { exact: true }) })
      .getByRole('textbox')
      .fill(scenario.marker)
    await drawer.getByRole('button', { name: '保存草稿', exact: true }).click()
    await expect(drawer).toBeHidden()
    document = await receiptDocument(client, scenario)
  }
  assert.ok(document && typeof document.documentNo === 'string')
  const search = page.getByRole('textbox', { name: '组合查询', exact: true })
  await search.fill(document.documentNo)
  await page.getByRole('button', { name: '查询', exact: true }).click()
  const row = page.getByRole('row').filter({ hasText: document.documentNo }).first()
  for (const status of ['draft', 'submitted', 'approved']) {
    if (document.status !== status) continue
    await selectRow(row)
    await page
      .getByRole('button', {
        name: status === 'draft' ? '提交' : status === 'submitted' ? '审核' : '确认收款',
        exact: true
      })
      .click()
    if (status === 'approved') await page.getByRole('button', { name: '确定', exact: true }).click()
    await expect(row).toContainText(
      status === 'draft' ? '已提交' : status === 'submitted' ? '已审核' : '已收款'
    )
    document = await receiptDocument(client, scenario)
  }
  expect(document.status).toBe('confirmed')
  if (options.allowBackgroundMatch)
    expect([0, scenario.receiptAmount]).toContain(Number(document.availableAmount))
  else expect(Number(document.availableAmount)).toBe(scenario.receiptAmount)
  scenario.receipt = document
  await selectRow(row)
  await page.getByRole('button', { name: '应付核销记录', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`receiptId=${document.id}`))
  await expect(page).toHaveURL(/tab=history/)
  await expect(page.getByRole('radio', { name: '应付退款核销', exact: true })).toBeChecked()
  await expect(page.getByRole('tab', { name: /^核销记录/ })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await page.getByRole('tab', { name: '待核销单据', exact: true }).click()
  return document
}

export async function history(client: SupabaseClient, scenario: RefundScenario) {
  const workspace = record(
    await rpc(client, 'fms_payable_writeoff_workspace_secure', {
      p_query: { relation: 'payable_refund', client_version: 2, receipt_id: scenario.receipt?.id }
    })
  )
  return rows(workspace.history)
}

export async function reverseRow(page: Page, row: Locator) {
  await row.getByRole('button', { name: '反核销', exact: true }).click()
  const reason = page.getByRole('dialog', { name: '反核销原因', exact: true })
  await reason.getByRole('textbox').fill('独立退款验收恢复原币余额，保留全部历史')
  const response = page.waitForResponse((entry) =>
    entry.url().endsWith('/rpc/fms_reverse_payable_writeoff_secure')
  )
  await reason.getByRole('button', { name: '确定', exact: true }).click()
  expect((await response).ok()).toBe(true)
  await expect(row).toContainText('已反核销')
}
