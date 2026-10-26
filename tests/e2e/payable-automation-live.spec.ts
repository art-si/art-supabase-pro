import assert from 'node:assert/strict'
import { appendFileSync, readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  assertPayableAcceptanceSession,
  acceptanceRecord as record,
  acceptanceRows as rows,
  acceptanceIdentifier as identifier,
  acceptanceRpc as rpc,
  payableAcceptanceTenantId as tenantId
} from './support/payable-live-session'
import { redBluePayable } from './support/payable-red-blue-fixtures'
import { payableVoucherLines } from './support/payable-live-posting'
import { captureBusinessEvidence } from './support/capture-business-evidence'

const enabled = process.env.E2E_PAYABLE_LIVE === 'true'
test.use({
  storageState: enabled
    ? process.env.E2E_AUTH_STATE_FILE || '.artifacts/qa-payable-real.storage.json'
    : { cookies: [], origins: [] },
  trace: 'off',
  actionTimeout: 25_000
})
test.skip(!enabled, '仅显式运行独立验收租户的真实后台调度流程')
test.setTimeout(600_000)

const rule = (field: string) => ({
  primary_field: field,
  secondary_field: field,
  operator: 'eq',
  empty_matches: false
})

async function prepareSupplier(client: SupabaseClient, key: string) {
  const code = `QA_BG_${key}`
  const prior = await client
    .from('mdm_supplier')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('supplier_code', code)
  expect(prior.error).toBeNull()
  if (prior.data?.length) return identifier(rows(prior.data)[0])
  const saved = await rpc(client, 'smis_save_supplier_secure', {
    p_id: null,
    p_payload: {
      supplier_code: code,
      supplier_name: `独立后台核销验收${key}`,
      supplier_category: 'Equipment_Supplier',
      supplier_type: 'general',
      enterprise_nature: 'state_owned',
      industry: 'coal_mining',
      address_detail: '独立验收租户合成主数据，不接真实银行',
      remark: '后台核销来源隔离，保留业务历史'
    }
  })
  assert.equal(typeof saved, 'string')
  return String(saved)
}

async function prepareScheme(client: SupabaseClient, key: string) {
  const code = `QA_BG_${key}_AUTO`
  const metadata = record(await rpc(client, 'fms_payable_scheme_configuration_secure', {}))
  const prior = rows(metadata.schemes).find((row) => row.code === code)
  if (prior?.enabled && prior.automatic) return prior
  const rules = key === 'CNY' ? [rule('supplier_id'), rule('currency_code')] : [rule('supplier_id')]
  const id = await rpc(client, 'fms_save_payable_reference_secure', {
    p_kind: 'scheme',
    p_record: {
      configuration_version: 2,
      id: prior?.id,
      version: prior?.version,
      code,
      name: `独立后台核销${key}方案`,
      enabled: true,
      automatic: true,
      rules,
      relation_rules: [
        { relation: 'payable_red_blue', rules, description: '仅独立验收主体，按双方原记账汇率核销' }
      ]
    }
  })
  assert.equal(typeof id, 'string')
  const updated = record(await rpc(client, 'fms_payable_scheme_configuration_secure', {}))
  const scheme = rows(updated.schemes).find((row) => row.id === id)
  assert.ok(scheme)
  return scheme
}

async function prepareSource(
  client: SupabaseClient,
  context: Record<string, unknown>,
  type: string,
  supplier: string,
  marker: string,
  credit: boolean,
  currency: string,
  amount: number,
  rate: number
) {
  const prior = await client
    .from('fms_purchase_payable_document')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('kind', 'financial')
    .contains('details', { invoice_no: marker })
  expect(prior.error).toBeNull()
  const id = prior.data?.length
    ? identifier(rows(prior.data)[0])
    : identifier(
        record(
          await rpc(client, 'fms_save_purchase_payable_secure', {
            p_document: {
              kind: 'financial',
              document_type_id: type,
              supplier_id: supplier,
              organization_id: context.organizationId,
              business_date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(
                new Date()
              ),
              currency_code: currency,
              exchange_rate: rate,
              is_credit: credit,
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
      )
  let document = await redBluePayable(client, id)
  for (const status of ['draft', 'submitted']) {
    if (document.status !== status) continue
    await rpc(client, 'fms_act_purchase_payable_secure', {
      p_ids: [id],
      p_action: status === 'draft' ? 'submit' : 'approve'
    })
    document = await redBluePayable(client, id)
  }
  expect(document.status).toBe('approved')
  const voucher = record(await rpc(client, 'fms_payable_voucher_secure', { p_id: id }))
  expect(voucher.status).toBe('generated')
  await payableVoucherLines(client, String(voucher.voucher_id))
  return document
}

async function currentConfiguration(client: SupabaseClient, scheme: string) {
  const workspace = record(
    await rpc(client, 'fms_payable_automation_workspace_secure', { p_query: { size: 100 } })
  )
  return rows(record(workspace.configurations).data).find((row) => row.scheme_id === scheme)
}

async function stopConfiguration(client: SupabaseClient, scheme: string) {
  const configuration = await currentConfiguration(client, scheme)
  if (configuration?.enabled)
    await rpc(client, 'fms_save_payable_automation_secure', {
      p_record: {
        ...configuration,
        configuration_version: 1,
        enabled: false,
        process_existing: false
      }
    })
}

async function openWorkspace(page: Page) {
  await page.goto('#/fms/accounts-payable/writeoff', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '应付核销工作台', exact: true })).toBeVisible({
    timeout: 60_000
  })
  const guide = page.getByRole('button', { name: '知道了', exact: true })
  if (await guide.isVisible()) await guide.click()
  await page.getByRole('button', { name: '后台核销', exact: true }).click()
  const workspace = page.getByRole('dialog', { name: '后台自动核销', exact: true })
  await expect(workspace.getByRole('button', { name: '新增配置', exact: true })).toBeEnabled()
  return workspace
}

test('普通账号两套真实后台配置与人民币、异币定时核销流程', async ({ page, context }, info) => {
  const client = await assertPayableAcceptanceSession(context)
  const fixture = record(JSON.parse(readFileSync('.artifacts/apar-live-context.json', 'utf8')))
  expect(fixture.tenantId).toBe(tenantId)
  const runtime = record(
    record(await rpc(client, 'fms_payable_automation_workspace_secure', {})).runtime
  )
  expect(runtime.available).toBe(true)
  const types = await client
    .from('mdm_document_type')
    .select('id,document_type_code')
    .eq('tenant_id', tenantId)
    .in('document_type_code', ['AP_FIN_EXPENSE', 'AP_FIN_OTHER'])
  expect(types.error).toBeNull()
  const expense = identifier(
    rows(types.data).find((row) => row.document_type_code === 'AP_FIN_EXPENSE')
  )
  const other = identifier(
    rows(types.data).find((row) => row.document_type_code === 'AP_FIN_OTHER')
  )
  const rawFunds = await client.from('fms_fund_ledger_entry').select('id').limit(1)
  expect(rawFunds.error?.code).toBe('42501')
  const schemes: string[] = []
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    for (const key of ['CNY', 'FX']) {
      const supplier = await prepareSupplier(client, key)
      const scheme = await prepareScheme(client, key)
      const schemeId = identifier(scheme)
      schemes.push(schemeId)
      await stopConfiguration(client, schemeId)
      const workspace = await openWorkspace(page)
      const prior = await currentConfiguration(client, schemeId)
      const historical = prior
        ? await client
            .from('fms_payable_writeoff_record')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('scheme_id', schemeId)
            .eq('status', 'active')
            .contains('match_snapshot', { automation_id: prior.id })
        : null
      if (historical) expect(historical.error).toBeNull()
      const activate = !historical?.data?.length
      if (prior)
        await workspace
          .locator('tbody tr')
          .filter({ hasText: String(prior.name) })
          .getByRole('button', { name: '编辑后台配置', exact: true })
          .click()
      else await workspace.getByRole('button', { name: '新增配置', exact: true }).click()
      const editor = page.getByRole('dialog', {
        name: prior ? '编辑后台核销配置' : '新增后台核销配置',
        exact: true
      })
      await editor.getByRole('textbox', { name: /配置名称$/ }).fill(`独立后台核销${key}配置`)
      if (!prior) {
        await editor.getByRole('combobox', { name: /核销方案$/ }).press('Enter')
        await page
          .getByRole('option', { name: `${scheme.name} · ${scheme.code}`, exact: true })
          .click()
        const metadata = record(await rpc(client, 'fms_payable_automation_workspace_secure', {}))
        const book = rows(metadata.books).find((row) => row.id === fixture.bookId)
        assert.ok(book)
        await editor.getByRole('combobox', { name: /核算账套$/ }).press('Enter')
        await page.getByRole('option', { name: `${book.name} · ${book.code}`, exact: true }).click()
      }
      if (key === 'FX') {
        await editor.getByRole('combobox', { name: /异币自动分配方式$/ }).press('Enter')
        await page.getByRole('option', { name: '匹配余量全部对冲', exact: true }).click()
      }
      if (activate)
        await editor.getByRole('switch', { name: '后台启用', exact: true }).locator('..').click()
      if (prior && activate)
        await editor
          .getByRole('switch', { name: '本次明确处理已有余额', exact: true })
          .locator('..')
          .click()
      await editor.getByRole('button', { name: '保存后台配置', exact: true }).click()
      if (activate)
        await page
          .getByRole('dialog', { name: '确认后台自动核销', exact: true })
          .getByRole('button', { name: '保存并启用', exact: true })
          .click()
      await expect(editor).not.toBeVisible()
      const configuration = await currentConfiguration(client, schemeId)
      assert.ok(configuration)
      expect(configuration.enabled).toBe(activate)
      await expect(
        workspace.locator('tbody tr').filter({ hasText: String(configuration.name) })
      ).toContainText(activate ? '是' : '否')
      await captureBusinessEvidence(workspace, {
        path: info.outputPath(`background-${key}-configured.png`)
      })
      const blue = await prepareSource(
        client,
        fixture,
        expense,
        supplier,
        `QA-BG-${key}-BLUE`,
        false,
        key === 'CNY' ? 'CNY' : 'USD',
        key === 'CNY' ? 56.5 : 100,
        key === 'CNY' ? 1 : 7
      )
      const credit = await prepareSource(
        client,
        fixture,
        other,
        supplier,
        `QA-BG-${key}-CREDIT`,
        true,
        key === 'CNY' ? 'CNY' : 'EUR',
        key === 'CNY' ? 56.5 : 90,
        key === 'CNY' ? 1 : 8
      )
      let produced: Record<string, unknown> | undefined
      await expect
        .poll(
          async () => {
            const result = await client
              .from('fms_payable_writeoff_record')
              .select('*')
              .eq('payable_id', identifier(blue))
              .eq('credit_payable_id', identifier(credit))
              .eq('status', 'active')
            expect(result.error).toBeNull()
            produced = rows(result.data)[0]
            return Boolean(produced)
          },
          {
            timeout: 240_000,
            intervals: [5000, 10000],
            message: '等待真实 Cron 执行，不调用手工或后台执行接口冒充调度'
          }
        )
        .toBe(true)
      assert.ok(produced)
      expect(produced.actor).toBe('a9eeb9b7-e474-43e3-9cc2-c2f46c0f0ec3')
      const snapshot = record(produced.match_snapshot)
      expect(snapshot.execution_kind).toBe('background')
      expect(snapshot.automation_id).toBe(configuration.id)
      expect(Number(snapshot.automation_version)).toBeLessThanOrEqual(Number(configuration.version))
      const jobMetadata = record(
        await rpc(client, 'fms_payable_automation_workspace_secure', {
          p_query: { job_id: snapshot.automation_job_id }
        })
      )
      const originalJob = rows(record(jobMetadata.jobs).data)[0]
      expect(originalJob.automation_version).toBe(snapshot.automation_version)
      expect(originalJob.scheme_version).toBe(snapshot.scheme_version)
      const projected = record(
        await rpc(client, 'fms_get_payable_writeoff_record_secure', { p_id: identifier(produced) })
      )
      expect(Number(projected.exchange_difference)).toBe(key === 'CNY' ? 0 : -20)
      expect(Number((await redBluePayable(client, identifier(blue))).unpaid_amount)).toBe(0)
      expect(Number((await redBluePayable(client, identifier(credit))).unpaid_amount)).toBe(0)
      const voucher = record(
        await rpc(client, 'fms_payable_settlement_voucher_secure', {
          p_id: identifier(produced),
          p_kind: 'writeoff',
          p_preview: false
        })
      )
      expect(voucher.status).toBe('generated')
      assert.ok(Array.isArray(voucher.voucher_ids) && typeof voucher.voucher_ids[0] === 'string')
      const voucherId = voucher.voucher_ids[0]
      await payableVoucherLines(client, voucherId)
      appendFileSync(
        '.artifacts/payable-background-live-records.jsonl',
        JSON.stringify({
          key,
          configuration: configuration.id,
          job: snapshot.automation_job_id,
          writeoff: produced.id,
          voucher: voucherId,
          blue: blue.id,
          credit: credit.id
        }) + '\n'
      )
      await workspace.getByRole('button', { name: '刷新后台核销', exact: true }).click()
      await workspace
        .locator('tbody tr')
        .filter({ hasText: String(configuration.name) })
        .getByRole('button', { name: '查看后台任务', exact: true })
        .click()
      await expect(workspace.getByText(String(blue.document_no), { exact: true })).toBeVisible()
      if (activate) {
        const latest = record(
          await rpc(client, 'fms_payable_automation_workspace_secure', {
            p_query: { automation_id: configuration.id }
          })
        )
        const unmatched = rows(record(latest.jobs).data).find((row) => row.status === 'no_match')
        if (unmatched) {
          await workspace
            .locator('tbody tr')
            .filter({ hasText: String(unmatched.job_no) })
            .getByRole('button', { name: '重试后台任务', exact: true })
            .click()
          await page
            .getByRole('dialog', { name: '重新排队后台任务', exact: true })
            .getByRole('button', { name: '重新排队', exact: true })
            .click()
          await expect(
            workspace.locator('tbody tr').filter({ hasText: String(unmatched.job_no) })
          ).toContainText('待处理')
        }
      }
      await captureBusinessEvidence(workspace, {
        path: info.outputPath(`background-${key}-jobs.png`)
      })
      const jobRow = workspace
        .locator('tbody tr')
        .filter({ hasText: String(snapshot.automation_job_no) })
      await jobRow.getByRole('button', { name: '查看核销结果', exact: true }).click()
      await page
        .getByRole('dialog', { name: '后台任务核销记录', exact: true })
        .getByRole('button', { name: '联查核销记录', exact: true })
        .click()
      const detail = page.getByRole('dialog', { name: '应付核销单', exact: true })
      await expect(detail).toContainText(String(produced.document_no))
      await captureBusinessEvidence(detail, {
        path: info.outputPath(`background-${key}-result.png`)
      })
      await detail.getByRole('button', { name: '关闭此对话框', exact: true }).click()
      await page
        .getByRole('dialog', { name: '后台任务核销记录', exact: true })
        .getByRole('button', { name: '关闭此对话框', exact: true })
        .click()
      await workspace.getByRole('tab', { name: '后台配置', exact: true }).click()
      await workspace
        .locator('tbody tr')
        .filter({ hasText: String(configuration.name) })
        .getByRole('button', { name: '编辑后台配置', exact: true })
        .click()
      const stopping = page.getByRole('dialog', { name: '编辑后台核销配置', exact: true })
      await stopping
        .getByRole('textbox', { name: /配置名称$/ })
        .fill(`独立后台核销${key}配置（验收完成）`)
      if (activate)
        await stopping.getByRole('switch', { name: '后台启用', exact: true }).locator('..').click()
      await stopping.getByRole('button', { name: '保存后台配置', exact: true }).click()
      await expect(stopping).not.toBeVisible()
      expect((await currentConfiguration(client, schemeId))?.enabled).toBe(false)
      await workspace
        .locator('tbody tr')
        .filter({ hasText: `独立后台核销${key}配置（验收完成）` })
        .getByRole('button', { name: '删除后台配置', exact: true })
        .click()
      const guard = page.getByRole('dialog', { name: '暂时无法删除后台核销配置', exact: true })
      await expect(guard).toContainText(String(snapshot.automation_job_no))
      await captureBusinessEvidence(guard, {
        path: info.outputPath(`background-${key}-protected-history.png`)
      })
      await guard.getByRole('button', { name: '关闭此对话框', exact: true }).click()
      await workspace.getByRole('button', { name: '关闭此对话框', exact: true }).click()
    }
    expect(errors).toEqual([])
  } finally {
    for (const scheme of schemes) await stopConfiguration(client, scheme)
  }
})
