import assert from 'node:assert/strict'
import { expect, test, type Page } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  assertPayableAcceptanceSession,
  acceptanceRecord as record,
  acceptanceRows as rows,
  acceptanceIdentifier as identifier,
  acceptanceRpc as rpc,
  payableAcceptanceTenantId as tenant
} from './support/payable-live-session'
import {
  prepareScenarios,
  ensureReceipt,
  receiptDocument,
  payableDocument,
  reverseRow,
  journal
} from './support/payable-receipt-refund-fixtures'
import { captureBusinessEvidence } from './support/capture-business-evidence'

const enabled = process.env.E2E_PAYABLE_LIVE === 'true'
test.use({
  storageState: enabled
    ? process.env.E2E_AUTH_STATE_FILE || '.artifacts/qa-payable-real.storage.json'
    : { cookies: [], origins: [] },
  actionTimeout: 30_000,
  trace: 'off'
})
test.skip(
  !enabled || process.env.E2E_PAYABLE_REFUND_BACKGROUND !== 'true',
  '仅显式由真实 Cron 在独立验收租户执行'
)
test.setTimeout(900_000)

async function metadata(client: SupabaseClient, automationId?: string) {
  return record(
    await rpc(client, 'fms_payable_automation_workspace_secure', {
      p_query: { client_version: 2, automation_id: automationId, size: 100 }
    })
  )
}

async function configuration(client: SupabaseClient, name: string) {
  return rows(record((await metadata(client)).configurations).data).find(
    (entry) => entry.name === name
  )
}

async function stop(client: SupabaseClient, name: string) {
  const current = await configuration(client, name)
  if (!current?.enabled) return
  await rpc(client, 'fms_save_payable_automation_secure', {
    p_record: {
      configuration_version: 1,
      id: current.id,
      name: current.name,
      scheme_id: current.scheme_id,
      expected_scheme_version: current.scheme_version,
      account_set_id: current.account_set_id,
      relations: current.relations,
      allow_cross_party: current.allow_cross_party,
      cross_currency_mode: current.cross_currency_mode,
      version: current.version,
      enabled: false,
      process_existing: false
    }
  })
}

async function openWorkspace(page: Page) {
  await page.goto('#/fms/accounts-payable/writeoff?relation=payable_refund', {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.getByRole('heading', { name: '应付核销工作台', exact: true })).toBeVisible({
    timeout: 60_000
  })
  const guide = page.getByRole('button', { name: '知道了', exact: true })
  if (await guide.isVisible()) await guide.click()
  const started = Date.now()
  const loaded = page.waitForResponse((response) =>
    response.url().endsWith('/rpc/fms_payable_automation_workspace_secure')
  )
  await page.getByRole('button', { name: '后台核销', exact: true }).click()
  const response = await loaded
  expect(response.ok()).toBe(true)
  journal({ stage: 'background-workspace-load', elapsedMs: Date.now() - started })
  const workspace = page.getByRole('dialog', { name: '后台自动核销', exact: true })
  await expect(workspace.getByRole('button', { name: '新增配置', exact: true })).toBeEnabled()
  return workspace
}

async function waitJob(
  client: SupabaseClient,
  automationId: string,
  automationVersion: number,
  status: string
) {
  let job: Record<string, unknown> | undefined
  await expect
    .poll(
      async () => {
        const current = await metadata(client, automationId)
        job = rows(record(current.jobs).data).find(
          (entry) =>
            entry.source_kind === 'receipt_line' &&
            Number(entry.automation_version) === automationVersion &&
            entry.status === status
        )
        return Boolean(job)
      },
      {
        timeout: 240_000,
        intervals: [5000, 10000],
        message: '等待实际 Cron，不调用私有执行函数或伪造心跳'
      }
    )
    .toBe(true)
  assert.ok(job)
  return job
}

test('普通账号两套退款后台配置、冻结未匹配、重试与实际定时核销', async ({
  page,
  context
}, info) => {
  const client = await assertPayableAcceptanceSession(context)
  const scenarios = await prepareScenarios(client)
  const names = ['退款后台独立验收CNY', '退款后台独立验收FX']
  let initial = await metadata(client)
  expect(record(initial.runtime).available).toBe(true)
  if (!rows(initial.schemes).some((entry) => entry.code === 'QA_PRF_BG_FX')) {
    const template = rows(initial.schemes).find((entry) => entry.code === 'QA_PRF_UI_AUTO')
    assert.ok(template)
    await rpc(client, 'fms_save_payable_reference_secure', {
      p_kind: 'scheme',
      p_record: {
        tenant_id: tenant,
        configuration_version: 2,
        code: 'QA_PRF_BG_FX',
        name: '退款后台异币独立验收',
        enabled: true,
        automatic: true,
        rules: template.rules,
        relation_rules: template.relation_rules
      }
    })
    initial = await metadata(client)
  }
  const book = rows(initial.books).find((entry) => entry.id === scenarios[0].payable.account_set_id)
  assert.ok(book)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    for (const scenario of scenarios) {
      const name = names[scenario.index - 1]
      const scheme = rows(initial.schemes).find(
        (entry) => entry.code === (scenario.index === 1 ? 'QA_PRF_UI_AUTO' : 'QA_PRF_BG_FX')
      )
      assert.ok(scheme)
      await stop(client, name)
      let current = await configuration(client, name)
      const workspace = await openWorkspace(page)
      if (current)
        await workspace
          .locator('tbody tr')
          .filter({ hasText: name })
          .getByRole('button', { name: '编辑后台配置', exact: true })
          .click()
      else await workspace.getByRole('button', { name: '新增配置', exact: true }).click()
      const editor = page.getByRole('dialog', {
        name: current ? '编辑后台核销配置' : '新增后台核销配置',
        exact: true
      })
      await editor.getByRole('textbox', { name: /配置名称$/ }).fill(name)
      if (!current) {
        await editor.getByRole('combobox', { name: /核销方案$/ }).press('Enter')
        await page
          .getByRole('option', { name: `${scheme.name} · ${scheme.code}`, exact: true })
          .click()
        await editor.getByRole('combobox', { name: /核算账套$/ }).press('Enter')
        await page.getByRole('option', { name: `${book.name} · ${book.code}`, exact: true }).click()
      }
      await expect(editor.getByRole('combobox', { name: /后台核销关系$/ })).toBeVisible()
      await editor.getByRole('combobox', { name: /异币自动分配方式$/ }).press('Enter')
      await page
        .getByRole('option', {
          name: scenario.index === 1 ? '仅同币种' : '匹配余量全部对冲',
          exact: true
        })
        .click()
      await expect(
        editor.getByRole('switch', { name: '本次明确处理已有余额', exact: true })
      ).not.toBeChecked()
      if (!(await editor.getByRole('switch', { name: '后台启用', exact: true }).isChecked()))
        await editor.getByRole('switch', { name: '后台启用', exact: true }).locator('..').click()
      await captureBusinessEvidence(editor, {
        path: info.outputPath(`refund-background-config-${scenario.index}.png`)
      })
      await editor.getByRole('button', { name: '保存后台配置', exact: true }).click()
      const saved = page.waitForResponse((response) =>
        response.url().endsWith('/rpc/fms_save_payable_automation_secure')
      )
      await page
        .getByRole('dialog', { name: '确认后台自动核销', exact: true })
        .getByRole('button', { name: '保存并启用', exact: true })
        .click()
      const savedResponse = await saved
      expect(await savedResponse.json(), '后台配置必须实际保存成功').toEqual(expect.any(String))
      expect(savedResponse.ok()).toBe(true)
      await expect(editor).toBeHidden()
      current = await configuration(client, name)
      assert.ok(current)
      expect(current.enabled).toBe(true)
      expect(current.relations).toEqual(['payable_refund'])
      expect(current.cross_currency_mode).toBe(scenario.index === 1 ? 'same_currency' : 'full_pair')
      const configurationId = identifier(current)
      const configurationVersion = Number(current.version)
      expect(Number.isSafeInteger(configurationVersion)).toBe(true)
      await workspace.getByRole('button', { name: /关闭此/ }).click()
      if (scenario.index === 1)
        await rpc(client, 'fms_act_purchase_payable_secure', {
          p_ids: [identifier(scenario.payable)],
          p_action: 'freeze',
          p_reason: '独立后台冻结来源验证',
          p_amount: scenario.amount
        })
      const receipt = await ensureReceipt(page, client, scenario, { allowBackgroundMatch: true })
      if (scenario.index === 1) {
        const unmatched = await waitJob(client, configurationId, configurationVersion, 'no_match')
        expect(Number(unmatched.record_count)).toBe(0)
        await rpc(client, 'fms_act_purchase_payable_secure', {
          p_ids: [identifier(scenario.payable)],
          p_action: 'unfreeze',
          p_reason: '解除独立后台冻结后通过真实重试恢复匹配'
        })
        const retryWorkspace = await openWorkspace(page)
        await retryWorkspace
          .locator('tbody tr')
          .filter({ hasText: name })
          .getByRole('button', { name: '查看后台任务', exact: true })
          .click()
        const retryRow = retryWorkspace
          .locator('tbody tr')
          .filter({ hasText: String(unmatched.job_no) })
          .first()
        await retryRow.getByRole('button', { name: '重试后台任务', exact: true }).click()
        await page
          .getByRole('dialog', { name: '重新排队后台任务', exact: true })
          .getByRole('button', { name: '重新排队', exact: true })
          .click()
        await expect(retryRow).toContainText('待处理')
        await captureBusinessEvidence(retryWorkspace, {
          path: info.outputPath('refund-background-retry.png')
        })
        await retryWorkspace.getByRole('button', { name: /关闭此/ }).click()
      }
      const job = await waitJob(client, configurationId, configurationVersion, 'succeeded')
      expect(Number(job.record_count)).toBe(1)
      expect(job.source_kind).toBe('receipt_line')
      expect(Number(job.attempt_count)).toBe(scenario.index === 1 ? 2 : 1)
      const result = await client
        .from('fms_payable_writeoff_record')
        .select('*')
        .eq('tenant_id', tenant)
        .eq('payable_id', identifier(scenario.payable))
        .eq('relation', 'payable_refund')
        .eq('status', 'active')
        .contains('match_snapshot', { automation_id: configurationId })
      expect(result.error).toBeNull()
      expect(rows(result.data)).toHaveLength(1)
      const matched = rows(result.data)[0]
      expect(matched.actor).toBe('a9eeb9b7-e474-43e3-9cc2-c2f46c0f0ec3')
      const snapshot = record(matched.match_snapshot)
      expect(snapshot.execution_kind).toBe('background')
      expect(snapshot.automation_job_id).toBe(job.id)
      expect(Number(matched.amount)).toBe(scenario.amount)
      expect(Number(matched.receipt_amount)).toBe(scenario.receiptAmount)
      expect(
        Number((await payableDocument(client, identifier(scenario.payable))).face_unpaid_amount)
      ).toBe(0)
      expect(Number((await receiptDocument(client, scenario)).availableAmount)).toBe(0)
      journal({
        stage: 'background-matched',
        index: scenario.index,
        recordId: matched.id,
        jobId: job.id,
        configurationId
      })
      const doneWorkspace = await openWorkspace(page)
      const configRow = doneWorkspace.locator('tbody tr').filter({ hasText: name }).first()
      await configRow.getByRole('button', { name: '查看后台任务', exact: true }).click()
      const jobRow = doneWorkspace
        .locator('tbody tr')
        .filter({ hasText: String(job.job_no) })
        .first()
      await expect(jobRow).toContainText('已完成')
      await captureBusinessEvidence(doneWorkspace, {
        path: info.outputPath(`refund-background-job-${scenario.index}.png`)
      })
      await jobRow.getByRole('button', { name: '查看核销结果', exact: true }).click()
      const links = page.getByRole('dialog', { name: '后台任务核销记录', exact: true })
      await links.getByRole('button', { name: '联查核销记录', exact: true }).click()
      const detail = page.getByRole('dialog', {
        name: scenario.index === 1 ? '应付退款核销记录' : '应付核销单',
        exact: true
      })
      await expect(detail).toContainText(String(receipt.documentNo))
      await captureBusinessEvidence(detail, {
        path: info.outputPath(`refund-background-record-${scenario.index}.png`)
      })
      await detail.getByRole('button', { name: /关闭此/ }).click()
      await links.getByRole('button', { name: /关闭此/ }).click()
      await doneWorkspace.getByRole('tab', { name: '后台配置', exact: true }).click()
      await doneWorkspace
        .locator('tbody tr')
        .filter({ hasText: name })
        .getByRole('button', { name: '编辑后台配置', exact: true })
        .click()
      const stopping = page.getByRole('dialog', { name: '编辑后台核销配置', exact: true })
      await stopping.getByRole('switch', { name: '后台启用', exact: true }).locator('..').click()
      await stopping.getByRole('button', { name: '保存后台配置', exact: true }).click()
      await expect(stopping).toBeHidden()
      expect((await configuration(client, name))?.enabled).toBe(false)
      await doneWorkspace
        .locator('tbody tr')
        .filter({ hasText: name })
        .getByRole('button', { name: '删除后台配置', exact: true })
        .click()
      const guard = page.getByRole('dialog', { name: '暂时无法删除后台核销配置', exact: true })
      await expect(guard).toContainText(String(job.job_no))
      await captureBusinessEvidence(guard, {
        path: info.outputPath(`refund-background-delete-guard-${scenario.index}.png`)
      })
      await guard.getByRole('button', { name: /关闭此/ }).click()
      await doneWorkspace.getByRole('button', { name: /关闭此/ }).click()
      await page.goto(
        `#/fms/accounts-payable/writeoff?relation=payable_refund&receiptId=${receipt.id}&tab=history`,
        { waitUntil: 'domcontentloaded' }
      )
      const recordRow = page
        .locator('tbody tr')
        .filter({ hasText: String(matched.record_no) })
        .first()
      await reverseRow(page, recordRow)
      await rpc(client, 'fms_cancel_supplier_receipt_secure', {
        p_id: receipt.id,
        p_reason: '独立后台验收结束，恢复模拟资金并保留历史'
      })
    }
  } finally {
    for (const name of names) await stop(client, name)
    for (const scenario of scenarios) {
      const document = await payableDocument(client, identifier(scenario.payable))
      if (Number(document.frozen_amount) > 0)
        await rpc(client, 'fms_act_purchase_payable_secure', {
          p_ids: [identifier(scenario.payable)],
          p_action: 'unfreeze',
          p_reason: '独立后台验收清理解冻'
        })
      const active = await client
        .from('fms_payable_writeoff_record')
        .select('id')
        .eq('tenant_id', tenant)
        .eq('payable_id', identifier(scenario.payable))
        .eq('relation', 'payable_refund')
        .eq('status', 'active')
      expect(active.error).toBeNull()
      for (const item of rows(active.data))
        await rpc(client, 'fms_reverse_payable_writeoff_secure', {
          p_id: identifier(item),
          p_reason: '独立后台验收清理恢复余额'
        })
      const receipt = await receiptDocument(client, scenario)
      if (receipt?.status === 'confirmed')
        await rpc(client, 'fms_cancel_supplier_receipt_secure', {
          p_id: receipt.id,
          p_reason: '独立后台验收清理恢复模拟资金'
        })
    }
  }
  expect(errors).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
