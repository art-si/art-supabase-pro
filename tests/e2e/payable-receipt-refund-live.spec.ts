import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import {
  assertPayableAcceptanceSession,
  acceptanceRecord as record,
  acceptanceRows as rows,
  acceptanceIdentifier as identifier,
  acceptanceRpc as rpc,
  payableAcceptanceTenantId as tenant
} from './support/payable-live-session'
import { selectReceiptRow as selectRow } from './support/receipt-workspace'
import { prepareAppearance } from './support/appearance'
import { captureBusinessEvidence } from './support/capture-business-evidence'
import {
  journalPath,
  journal,
  prepareScenarios,
  payableDocument,
  receiptDocument,
  ensureReceipt,
  history,
  reverseRow
} from './support/payable-receipt-refund-fixtures'

const enabled = process.env.E2E_PAYABLE_LIVE === 'true'
test.use({
  storageState: enabled
    ? process.env.E2E_AUTH_STATE_FILE || '.artifacts/qa-payable-real.storage.json'
    : { cookies: [], origins: [] },
  trace: 'off',
  actionTimeout: 30_000
})
test.skip(!enabled, '仅显式运行独立验收租户的退款核销真实联调')
test.setTimeout(600_000)

test('普通账号两笔实际退款的手工、异币自动、凭证预览与反核销联调', async ({
  page,
  context
}, info) => {
  test.skip(process.env.E2E_PAYABLE_REFUND_WORKFLOW !== 'true', '真实余额操作须显式启用')
  const client = await assertPayableAcceptanceSession(context)
  const scenarios = await prepareScenarios(client)
  await prepareAppearance(page, { theme: 'light', boxBorderMode: true })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    for (const scenario of scenarios) {
      const receipt = await ensureReceipt(page, client, scenario)
      await page
        .getByRole('treeitem', { name: `退款核销独立验收供应商${scenario.index}`, exact: true })
        .locator('.el-tree-node__content')
        .first()
        .click()
      await page.getByRole('combobox', { name: '核销方案', exact: true }).click()
      await page
        .getByRole('option', {
          name: scenario.index === 1 ? '退款核销独立手工验收' : '退款核销独立自动验收',
          exact: true
        })
        .click()
      if (scenario.index === 1) {
        for (const name of ['红字财务应付单', '供应商退款收款单']) {
          await page
            .getByRole('region', { name, exact: true })
            .locator('.el-table__header-wrapper .el-checkbox')
            .first()
            .click()
        }
        await page.getByRole('button', { name: '核销', exact: true }).click()
        const written = page.waitForResponse((entry) =>
          entry.url().endsWith('/rpc/fms_payable_writeoff_secure')
        )
        await page
          .getByRole('dialog', { name: '核销确认', exact: true })
          .getByRole('button', { name: '执行核销', exact: true })
          .click()
        expect((await written).ok()).toBe(true)
      } else {
        await page.getByRole('button', { name: '按方案自动核销', exact: true }).click()
        const automatic = page.getByRole('dialog', { name: '按方案自动核销', exact: true })
        await expect(automatic.locator('tbody tr')).toHaveCount(1)
        const repriced = page.waitForResponse(
          (entry) =>
            entry.url().endsWith('/rpc/fms_auto_payable_writeoff_secure') &&
            entry.request().postDataJSON()?.p_query?.cross_currency_mode === 'full_pair'
        )
        await automatic
          .getByRole('radio', { name: '匹配余量全部对冲', exact: true })
          .locator('..')
          .click()
        const plan = record(await (await repriced).json())
        const item = rows(plan.items)[0]
        expect(Number(item.amount)).toBe(100)
        expect(Number(item.receipt_amount)).toBe(90)
        expect(Number(item.exchange_difference)).toBe(-20)
        await captureBusinessEvidence(automatic, {
          path: info.outputPath('refund-live-fx-preview.png')
        })
        const written = page.waitForResponse(
          (entry) =>
            entry.url().endsWith('/rpc/fms_auto_payable_writeoff_secure') &&
            entry.request().postDataJSON()?.p_execute === true
        )
        await automatic.getByRole('button', { name: '确认自动核销', exact: true }).click()
        expect((await written).ok()).toBe(true)
        await expect(automatic).toBeHidden()
      }
      let currentHistory: Array<Record<string, unknown>> = []
      await expect
        .poll(async () => {
          currentHistory = await history(client, scenario)
          return currentHistory.filter((entry) => entry.status === 'active').length
        })
        .toBe(1)
      const matched = currentHistory.find((entry) => entry.status === 'active')
      assert.ok(matched)
      for (const attempt of [1, 2]) {
        const started = Date.now()
        const refreshed = await history(client, scenario)
        expect(refreshed.filter((entry) => entry.status === 'active').map(identifier)).toEqual([
          identifier(matched)
        ])
        journal({
          stage: 'query-budget',
          index: scenario.index,
          attempt,
          elapsedMs: Date.now() - started
        })
      }
      expect(Number(matched.amount)).toBe(scenario.amount)
      expect(Number(matched.receipt_amount)).toBe(scenario.receiptAmount)
      expect(Number(matched.primary_exchange_rate)).toBe(scenario.index === 1 ? 1 : 7)
      expect(Number(matched.secondary_exchange_rate)).toBe(scenario.receiptRate)
      expect(matched.needs_voucher).toBe(scenario.index === 2)
      expect(
        Number((await payableDocument(client, identifier(scenario.payable))).face_unpaid_amount)
      ).toBe(0)
      expect(Number((await receiptDocument(client, scenario)).availableAmount)).toBe(0)
      journal({
        stage: 'matched',
        index: scenario.index,
        recordId: matched.id,
        receiptId: receipt.id,
        payableId: scenario.payable.id
      })
      await page.getByRole('tab', { name: /^核销记录/ }).click()
      const row = page
        .locator('tbody tr')
        .filter({ hasText: String(matched.record_no) })
        .first()
      await row.getByRole('button', { name: '查看核销记录', exact: true }).click()
      const detail = page.getByRole('dialog', {
        name: scenario.index === 2 ? '应付核销单' : '应付退款核销记录',
        exact: true
      })
      await expect(detail).toContainText(String(receipt.documentNo))
      if (scenario.index === 2) await expect(detail).toContainText('收益 ¥20.00')
      await captureBusinessEvidence(detail, {
        path: info.outputPath(`refund-live-record-${scenario.index}.png`)
      })
      await detail.getByRole('button', { name: /关闭此/ }).click()
      if (scenario.index === 2) {
        const previewed = page.waitForResponse((entry) =>
          entry.url().endsWith('/rpc/fms_payable_settlement_voucher_secure')
        )
        await row.getByRole('button', { name: '预览凭证', exact: true }).click()
        const previewResponse = await previewed
        expect(previewResponse.ok()).toBe(true)
        const previewResult = record(await previewResponse.json())
        journal({
          stage: 'voucher-preview',
          index: scenario.index,
          status: previewResult.status,
          message: previewResult.message,
          lineCount: Array.isArray(previewResult.lines) ? previewResult.lines.length : 0
        })
        const preview = page.getByRole('dialog', { name: '凭证预览', exact: true })
        await expect(preview).toBeVisible()
        await captureBusinessEvidence(preview, {
          path: info.outputPath('refund-live-voucher-preview.png')
        })
        await preview.getByRole('button', { name: /关闭此/ }).click()
      }
      await reverseRow(page, row)
      expect(
        Math.abs(
          Number((await payableDocument(client, identifier(scenario.payable))).face_unpaid_amount)
        )
      ).toBe(scenario.amount)
      expect(Number((await receiptDocument(client, scenario)).availableAmount)).toBe(
        scenario.receiptAmount
      )
      await page.goto('#/fms/accounts-receivable/receipt', { waitUntil: 'domcontentloaded' })
      await page
        .getByRole('textbox', { name: '组合查询', exact: true })
        .fill(String(receipt.documentNo))
      await page.getByRole('button', { name: '查询', exact: true }).click()
      const receiptRow = page
        .getByRole('row')
        .filter({ hasText: String(receipt.documentNo) })
        .first()
      await selectRow(receiptRow)
      await page.getByRole('button', { name: '取消收款', exact: true }).click()
      const cancel = page.getByRole('dialog', { name: '取消供应商退款收款', exact: true })
      await cancel.getByRole('textbox').fill('独立验收恢复虚构资金，保留原执行及核销历史')
      await cancel.getByRole('button', { name: '确定', exact: true }).click()
      await expect(receiptRow).toContainText('已审核')
      journal({
        stage: 'completed',
        index: scenario.index,
        recordId: matched.id,
        receiptId: receipt.id,
        payableId: scenario.payable.id
      })
    }
  } finally {
    for (const scenario of scenarios) {
      const document = await receiptDocument(client, scenario)
      if (!document) continue
      scenario.receipt = document
      const cleanupRows = await client
        .from('fms_payable_writeoff_record')
        .select('id,status')
        .eq('tenant_id', tenant)
        .eq('relation', 'payable_refund')
        .eq('payable_id', identifier(scenario.payable))
        .eq('status', 'active')
      expect(cleanupRows.error).toBeNull()
      for (const matched of rows(cleanupRows.data)) {
        await rpc(client, 'fms_reverse_payable_writeoff_secure', {
          p_id: matched.id,
          p_reason: '独立真实验收失败清理，恢复来源余额并保留历史'
        })
      }
      if (document.status === 'confirmed')
        await rpc(client, 'fms_cancel_supplier_receipt_secure', {
          p_id: document.id,
          p_reason: '独立验收结束，恢复虚构到账资金'
        })
    }
  }
  expect(errors).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('两笔已验收退款记录的只读联查视觉', async ({ page, context }, info) => {
  test.skip(process.env.E2E_PAYABLE_REFUND_VISUAL !== 'true', '只读视觉验收须显式启用')
  const client = await assertPayableAcceptanceSession(context)
  const entries = readFileSync(journalPath, 'utf8')
    .trim()
    .split(/\r?\n/)
    .map((line) => record(JSON.parse(line)))
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await prepareAppearance(page, {
    theme: info.project.name.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !info.project.name.includes('shadow')
  })
  for (const index of [1, 2]) {
    const completed = entries.filter(
      (entry) => entry.stage === 'completed' && entry.index === index
    )
    const latest = completed[completed.length - 1]
    assert.ok(latest && typeof latest.recordId === 'string' && typeof latest.receiptId === 'string')
    const matched = record(
      await rpc(client, 'fms_get_payable_writeoff_record_secure', { p_id: latest.recordId })
    )
    expect(matched.status).toBe('reversed')
    expect(matched.document_no).toBeNull()
    await page.goto(
      `#/fms/accounts-payable/writeoff?relation=payable_refund&receiptId=${latest.receiptId}&tab=history`,
      { waitUntil: 'domcontentloaded' }
    )
    await expect(page.getByRole('heading', { name: '应付核销工作台', exact: true })).toBeVisible({
      timeout: 60_000
    })
    const guide = page.getByRole('button', { name: '知道了', exact: true })
    if (await guide.isVisible()) await guide.click()
    await expect(page.getByRole('tab', { name: /^核销记录/ })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    const row = page
      .locator('tbody tr')
      .filter({ hasText: String(matched.record_no) })
      .first()
    await expect(row).toContainText('已反核销')
    await row.getByRole('button', { name: '查看核销记录', exact: true }).click()
    const detail = page.getByRole('dialog', { name: '应付退款核销记录', exact: true })
    await expect(detail.getByText(String(matched.record_no), { exact: true })).toBeVisible()
    await expect(detail).toContainText(String(matched.payment_no))
    if (index === 2) await expect(detail).toContainText('收益 ¥20.00')
    await captureBusinessEvidence(detail, {
      path: info.outputPath(`refund-readonly-record-${index}.png`)
    })
    if (index === 2) {
      const lastRule = detail.locator('.el-table__body-wrapper tbody tr').last()
      await lastRule.scrollIntoViewIfNeeded()
      await expect(lastRule).toBeInViewport({ ratio: 1 })
      await captureBusinessEvidence(detail, {
        path: info.outputPath('refund-readonly-record-2-lower.png')
      })
    }
    await detail.getByRole('button', { name: /关闭此/ }).click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  expect(errors).toEqual([])
})
