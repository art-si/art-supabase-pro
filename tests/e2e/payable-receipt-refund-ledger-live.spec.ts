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
import { ensurePayablePostingRule, payableVoucherLines } from './support/payable-live-posting'
import {
  prepareScenarios,
  ensureReceipt,
  receiptDocument,
  payableDocument,
  reverseRow,
  journal,
  journalPath
} from './support/payable-receipt-refund-fixtures'
import { selectReceiptRow as selectRow } from './support/receipt-workspace'
import { captureBusinessEvidence } from './support/capture-business-evidence'
import { prepareAppearance } from './support/appearance'

const enabled = process.env.E2E_PAYABLE_LIVE === 'true'
test.use({
  storageState: enabled
    ? process.env.E2E_AUTH_STATE_FILE || '.artifacts/qa-payable-real.storage.json'
    : { cookies: [], origins: [] },
  actionTimeout: 30_000,
  trace: 'off'
})
test.skip(
  !enabled || process.env.E2E_PAYABLE_REFUND_LEDGER !== 'true',
  '仅显式在独立验收租户生成并作废核销凭证'
)
test.setTimeout(600_000)

test('两笔异币退款核销单真实制证、幂等、作废与反核销', async ({ page, context }, info) => {
  const client = await assertPayableAcceptanceSession(context)
  const scenario = (await prepareScenarios(client)).find((entry) => entry.index === 2)
  assert.ok(scenario && typeof scenario.payable.account_set_id === 'string')
  const book = scenario.payable.account_set_id
  const subjectResponse = await client
    .from('fms_subject')
    .select('id,subject_code,allow_foreign_currency')
    .eq('tenant_id', tenant)
    .eq('account_set_id', book)
    .in('subject_code', ['220299', '224199', '6603'])
  expect(subjectResponse.error).toBeNull()
  const subjects = rows(subjectResponse.data)
  const subject = (code: string) =>
    identifier(subjects.find((entry) => entry.subject_code === code))
  for (const code of ['220299', '224199'])
    expect(subjects.find((entry) => entry.subject_code === code)?.allow_foreign_currency).toBe(true)
  await ensurePayablePostingRule(
    client,
    book,
    'QA_PRF_FX_OFFSET',
    'ap_payable_refund_writeoff_approved',
    {
      writeoff_relation: 'payable_refund',
      primary_currency_code: 'USD',
      secondary_currency_code: 'EUR'
    },
    [
      { direction: 'credit', amountKey: 'payable_base_amount', subjectId: subject('220299') },
      { direction: 'debit', amountKey: 'receipt_base_amount', subjectId: subject('224199') },
      { direction: 'debit', amountKey: 'exchange_gain_loss', subjectId: subject('6603') }
    ]
  )
  await prepareAppearance(page, { theme: 'light', boxBorderMode: true })
  const created: Array<{ recordId: string; voucherId: string; voucherNo: string }> = []
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    const receipt = await ensureReceipt(page, client, scenario)
    for (const [index, amount, receiptAmount] of [
      [1, 30, 27],
      [2, 70, 63]
    ]) {
      await page
        .getByRole('treeitem', { name: '退款核销独立验收供应商2', exact: true })
        .locator('.el-tree-node__content')
        .first()
        .click()
      await page.getByRole('tab', { name: '待核销单据', exact: true }).click()
      await page.getByRole('combobox', { name: '核销方案', exact: true }).click()
      await page.getByRole('option', { name: '退款核销独立手工验收', exact: true }).click()
      for (const [name, value] of [
        ['红字财务应付单', amount],
        ['供应商退款收款单', receiptAmount]
      ] as const) {
        const region = page.getByRole('region', { name, exact: true })
        await expect(region.locator('tbody tr')).toHaveCount(1)
        await region.getByRole('spinbutton').fill(String(value))
        await region.locator('.el-table__header-wrapper .el-checkbox').first().click()
      }
      await page.getByRole('button', { name: '核销', exact: true }).click()
      const written = page.waitForResponse((entry) =>
        entry.url().endsWith('/rpc/fms_payable_writeoff_secure')
      )
      await page
        .getByRole('dialog', { name: '核销确认', exact: true })
        .getByRole('button', { name: '执行核销', exact: true })
        .click()
      const response = await written
      expect(response.ok()).toBe(true)
      const ids: unknown = await response.json()
      assert.ok(Array.isArray(ids) && ids.length === 1 && typeof ids[0] === 'string')
      const recordId = ids[0]
      journal({ stage: 'ledger-match', index, recordId, receiptId: receipt.id })
      const matched = record(
        await rpc(client, 'fms_get_payable_writeoff_record_secure', { p_id: recordId })
      )
      expect(matched.needs_voucher).toBe(true)
      expect(Number(matched.payable_base_amount)).toBe(amount * 7)
      expect(Number(matched.receipt_base_amount)).toBe(receiptAmount * 8)
      await page.getByRole('tab', { name: /^核销记录/ }).click()
      const row = page
        .locator('tbody tr')
        .filter({ hasText: String(matched.record_no) })
        .first()
      const previewed = page.waitForResponse(
        (entry) =>
          entry.url().endsWith('/rpc/fms_payable_settlement_voucher_secure') &&
          entry.request().postDataJSON()?.p_preview === true
      )
      await row.getByRole('button', { name: '预览凭证', exact: true }).click()
      expect((await previewed).ok()).toBe(true)
      const preview = page.getByRole('dialog', { name: '凭证预览', exact: true })
      await expect(preview.getByText('220299', { exact: true })).toBeVisible()
      await expect(preview.getByText('224199', { exact: true })).toBeVisible()
      await expect(preview.getByText('6603', { exact: true })).toBeVisible()
      await captureBusinessEvidence(preview, {
        path: info.outputPath(`refund-ledger-preview-${index}.png`)
      })
      await preview.getByRole('button', { name: /关闭此/ }).click()
      let voucherId = ''
      for (const attempt of [1, 2]) {
        const generated = page.waitForResponse(
          (entry) =>
            entry.url().endsWith('/rpc/fms_payable_settlement_voucher_secure') &&
            entry.request().postDataJSON()?.p_preview === false
        )
        await row.getByRole('button', { name: '生成凭证', exact: true }).click()
        const generatedResponse = await generated
        expect(generatedResponse.ok()).toBe(true)
        const result = record(await generatedResponse.json())
        expect(result.status).toBe('generated')
        assert.ok(
          Array.isArray(result.voucher_ids) &&
            result.voucher_ids.length === 1 &&
            typeof result.voucher_ids[0] === 'string'
        )
        if (attempt === 1) voucherId = result.voucher_ids[0]
        else expect(result.voucher_ids[0]).toBe(voucherId)
        await expect(page.getByRole('button', { name: '刷新', exact: true })).toBeEnabled()
      }
      const refreshed = record(
        await rpc(client, 'fms_get_payable_writeoff_record_secure', { p_id: recordId })
      )
      assert.ok(typeof refreshed.voucher_no === 'string')
      created.push({ recordId, voucherId, voucherNo: refreshed.voucher_no })
      const lines = await payableVoucherLines(client, voucherId)
      expect(lines).toHaveLength(3)
      const payable = lines.find((entry) => entry.subject_code_snapshot === '220299')
      const receiving = lines.find((entry) => entry.subject_code_snapshot === '224199')
      const exchange = lines.find((entry) => entry.subject_code_snapshot === '6603')
      assert.ok(payable && receiving && exchange)
      expect(Number(payable.credit_amount)).toBe(amount * 7)
      expect(Number(receiving.debit_amount)).toBe(receiptAmount * 8)
      expect(Number(exchange.credit_amount)).toBe(receiptAmount * 8 - amount * 7)
      expect(payable.currency_code_snapshot).toBe('USD')
      expect(receiving.currency_code_snapshot).toBe('EUR')
      expect(Number(payable.original_amount)).toBe(amount)
      expect(Number(receiving.original_amount)).toBe(receiptAmount)
      expect(Number(payable.exchange_rate)).toBe(7)
      expect(Number(receiving.exchange_rate)).toBe(8)
      journal({
        stage: 'ledger-generated',
        index,
        recordId,
        voucherId,
        voucherNo: refreshed.voucher_no
      })
    }
    expect(
      Number((await payableDocument(client, identifier(scenario.payable))).face_unpaid_amount)
    ).toBe(0)
    expect(Number((await receiptDocument(client, scenario)).availableAmount)).toBe(0)
    for (const [index, entry] of created.entries()) {
      const matched = record(
        await rpc(client, 'fms_get_payable_writeoff_record_secure', { p_id: entry.recordId })
      )
      const row = page
        .locator('tbody tr')
        .filter({ hasText: String(matched.record_no) })
        .first()
      await row.getByRole('button', { name: '反核销', exact: true }).click()
      const reason = page.getByRole('dialog', { name: '反核销原因', exact: true })
      await reason.getByRole('textbox').fill('独立退款验收验证有效凭证阻断反核销')
      const blocked = page.waitForResponse((response) =>
        response.url().endsWith('/rpc/fms_reverse_payable_writeoff_secure')
      )
      await reason.getByRole('button', { name: '确定', exact: true }).click()
      const rejection = await blocked
      expect(rejection.ok()).toBe(false)
      expect(await rejection.json()).toEqual(expect.objectContaining({ code: '23514' }))
      await row.getByRole('button', { name: entry.voucherNo, exact: true }).click()
      const detail = page.getByRole('dialog', { name: '会计凭证详情', exact: true })
      await expect(detail).toContainText('220299')
      await expect(detail).toContainText('224199')
      const related = detail.getByRole('complementary', { name: '凭证关联信息', exact: true })
      await expect(
        related.getByRole('link', { name: `查看核销记录 ${matched.record_no}`, exact: true })
      ).toBeVisible()
      await expect(
        related.getByRole('link', {
          name: `查看供应商退款收款单 ${receipt.documentNo}`,
          exact: true
        })
      ).toBeVisible()
      await related.getByRole('button', { name: '收起关联信息', exact: true }).click()
      await expect(related.getByRole('button', { name: '展开关联信息', exact: true })).toBeVisible()
      await related.getByRole('button', { name: '展开关联信息', exact: true }).click()
      await captureBusinessEvidence(detail, {
        path: info.outputPath(`refund-native-voucher-${index + 1}.png`)
      })
      for (const [label, sourceNo, visibleNo] of [
        ['核销记录', String(matched.record_no), String(matched.document_no)],
        ['财务应付单', String(matched.payable_no), String(matched.payable_no)],
        ['供应商退款收款单', String(receipt.documentNo), String(receipt.documentNo)]
      ]) {
        await detail
          .getByRole('complementary', { name: '凭证关联信息', exact: true })
          .getByRole('link', { name: `查看${label} ${sourceNo}`, exact: true })
          .click()
        await expect(detail).toBeHidden()
        const destination = page.getByRole('dialog').filter({ hasText: visibleNo }).first()
        await expect(destination).toBeVisible()
        await captureBusinessEvidence(destination, {
          path: info.outputPath(`refund-native-related-${index + 1}-${label}.png`)
        })
        await destination.getByRole('button', { name: /关闭此/ }).click()
        const relatedReady = page.waitForResponse(
          (response) =>
            response.url().endsWith('/rpc/fms_get_payable_writeoff_record_secure') &&
            response.request().postDataJSON()?.p_id === entry.recordId
        )
        await page.goto(`#/fms/accounting/voucher-center?recordId=${entry.voucherId}`, {
          waitUntil: 'domcontentloaded'
        })
        const readyResponse = await relatedReady
        expect(readyResponse.ok()).toBe(true)
        await readyResponse.finished()
        journal({
          stage: 'related-return-ready',
          index: index + 1,
          label,
          elapsedMs: readyResponse.request().timing().responseEnd
        })
        await expect(
          detail.getByRole('complementary').getByText(String(matched.record_no), { exact: true })
        ).toBeVisible()
      }
      await detail.getByRole('button', { name: /关闭此/ }).click()
      const queried = page.waitForResponse((response) =>
        response.url().endsWith('/rpc/fms_list_vouchers_secure')
      )
      await page.getByRole('button', { name: '查询', exact: true }).click()
      expect((await queried).ok()).toBe(true)
      const voucherRow = page.locator('tbody tr').filter({ hasText: entry.voucherNo }).first()
      await voucherRow.getByRole('button', { name: '编辑', exact: true }).click()
      const editor = page.getByRole('dialog', {
        name: `编辑凭证 · ${entry.voucherNo}`,
        exact: true
      })
      const editorRelated = editor.getByRole('complementary', { name: '凭证关联信息', exact: true })
      await expect(
        editorRelated.getByText(String(matched.record_no), { exact: true })
      ).toBeVisible()
      const summary = editor.getByPlaceholder('概括本次经济业务', { exact: true })
      const originalSummary = await summary.inputValue()
      await expect(editor.getByPlaceholder('请输入来源单号', { exact: true })).toBeDisabled()
      const updatedSummary = `${originalSummary} · 独立关联栏验收`
      await summary.fill(updatedSummary)
      await editorRelated.getByRole('button', { name: '收起关联信息', exact: true }).click()
      await expect(summary).toHaveValue(updatedSummary)
      await captureBusinessEvidence(editor, {
        path: info.outputPath(`refund-native-voucher-editor-${index + 1}-collapsed.png`)
      })
      await editorRelated.getByRole('button', { name: '展开关联信息', exact: true }).click()
      await expect(summary).toHaveValue(updatedSummary)
      await captureBusinessEvidence(editor, {
        path: info.outputPath(`refund-native-voucher-editor-${index + 1}-expanded.png`)
      })
      const saved = page.waitForResponse((response) =>
        response.url().endsWith('/rpc/save_fms_voucher_secure')
      )
      await editor.getByRole('button', { name: '保存草稿', exact: true }).click()
      expect((await saved).ok()).toBe(true)
      await expect(editor).toBeHidden()
      const edited = record(
        await rpc(client, 'fms_get_voucher_secure', { p_voucher_id: entry.voucherId })
      )
      expect(edited.summary).toBe(updatedSummary)
      expect(edited.source_id).toBe(entry.recordId)
      expect(edited.source_event_code).toBe('ap_payable_refund_writeoff_approved')
      expect(Number(edited.total_debit)).toBe(Number(edited.total_credit))
      const regenerated = record(
        await rpc(client, 'fms_payable_settlement_voucher_secure', {
          p_kind: 'writeoff',
          p_id: entry.recordId,
          p_preview: false
        })
      )
      expect(regenerated.voucher_ids).toEqual([entry.voucherId])
      journal({ stage: 'ledger-related-edited', index: index + 1, ...entry })
      await voucherRow.getByRole('button', { name: '更多操作', exact: true }).click()
      await page.getByRole('menuitem', { name: '作废凭证', exact: true }).click()
      const voidDialog = page.getByRole('dialog', { name: '作废会计凭证', exact: true })
      await voidDialog.getByRole('textbox').fill('独立退款验收先作废凭证，再恢复来源余额')
      const voided = page.waitForResponse((response) =>
        response.url().endsWith('/rpc/transition_fms_voucher_secure')
      )
      await voidDialog.getByRole('button', { name: '确认作废', exact: true }).click()
      expect((await voided).ok()).toBe(true)
      await expect(voidDialog).toBeHidden()
      await page.goto(
        `#/fms/accounts-payable/writeoff?relation=payable_refund&receiptId=${receipt.id}&tab=history`,
        { waitUntil: 'domcontentloaded' }
      )
      await expect(page.getByRole('tab', { name: /^核销记录/ })).toHaveAttribute(
        'aria-selected',
        'true'
      )
      await reverseRow(page, row)
      journal({ stage: 'ledger-void-reversed', index: index + 1, ...entry })
    }
    expect(
      Math.abs(
        Number((await payableDocument(client, identifier(scenario.payable))).face_unpaid_amount)
      )
    ).toBe(100)
    expect(Number((await receiptDocument(client, scenario)).availableAmount)).toBe(90)
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
    await cancel.getByRole('textbox').fill('独立凭证验收结束，恢复模拟到账资金')
    await cancel.getByRole('button', { name: '确定', exact: true }).click()
    await expect(receiptRow).toContainText('已审核')
  } finally {
    const active = await client
      .from('fms_payable_writeoff_record')
      .select('id')
      .eq('tenant_id', tenant)
      .eq('payable_id', identifier(scenario.payable))
      .eq('relation', 'payable_refund')
      .eq('status', 'active')
    expect(active.error).toBeNull()
    for (const item of rows(active.data)) {
      const matched = record(
        await rpc(client, 'fms_get_payable_writeoff_record_secure', { p_id: identifier(item) })
      )
      if (typeof matched.voucher_id === 'string') {
        const voucher = record(
          await rpc(client, 'fms_get_voucher_secure', { p_voucher_id: matched.voucher_id })
        )
        if (voucher.status === 'draft')
          await rpc(client, 'transition_fms_voucher_secure', {
            p_voucher_id: matched.voucher_id,
            p_action: 'void',
            p_reason: '独立退款制证失败清理，保留凭证审计',
            p_action_date: null
          })
        else expect(voucher.status).toBe('voided')
      }
      await rpc(client, 'fms_reverse_payable_writeoff_secure', {
        p_id: identifier(item),
        p_reason: '独立退款制证清理，恢复来源余额并保留审计'
      })
    }
    const current = await receiptDocument(client, scenario)
    if (current?.status === 'confirmed')
      await rpc(client, 'fms_cancel_supplier_receipt_secure', {
        p_id: current.id,
        p_reason: '独立退款制证结束，恢复模拟资金'
      })
  }
  expect(created).toHaveLength(2)
  expect(new Set(created.map((entry) => entry.voucherId)).size).toBe(2)
  expect(errors).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('两笔已验收关联凭证的只读返回与刷新诊断', async ({ page, context }, info) => {
  test.skip(process.env.E2E_PAYABLE_REFUND_LEDGER_VISUAL !== 'true', '仅显式读取已有验收数据')
  const client = await assertPayableAcceptanceSession(context)
  const entries = readFileSync(journalPath, 'utf8')
    .trim()
    .split(/\r?\n/)
    .map((line) => record(JSON.parse(line)))
  const generated = entries.filter((entry) => entry.stage === 'ledger-generated').slice(-2)
  expect(generated).toHaveLength(2)
  await prepareAppearance(page, {
    theme: info.project.name.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !info.project.name.includes('shadow')
  })
  for (const [index, entry] of generated.entries()) {
    const denied = await client.rpc('save_fms_voucher_secure', {
      p_payload: { id: entry.voucherId }
    })
    expect(denied.error?.code).toBe('42501')
    const matched = record(
      await rpc(client, 'fms_get_payable_writeoff_record_secure', { p_id: entry.recordId })
    )
    const ready = () =>
      page.waitForResponse(
        (response) =>
          response.url().endsWith('/rpc/fms_get_payable_writeoff_record_secure') &&
          response.request().postDataJSON()?.p_id === entry.recordId
      )
    let loaded = ready()
    await page.goto(`#/fms/accounting/voucher-center?recordId=${entry.voucherId}`, {
      waitUntil: 'domcontentloaded'
    })
    let response = await loaded
    expect(response.ok()).toBe(true)
    await response.finished()
    const detail = page.getByRole('dialog', { name: '会计凭证详情', exact: true })
    const related = detail.getByRole('complementary', { name: '凭证关联信息', exact: true })
    await expect(related.getByText(String(matched.record_no), { exact: true })).toBeVisible()
    expect((await detail.boundingBox())?.width).toBeGreaterThan(1000)
    loaded = ready()
    await related.getByRole('button', { name: '刷新关联信息', exact: true }).click()
    response = await loaded
    expect(response.ok()).toBe(true)
    await response.finished()
    await captureBusinessEvidence(detail, {
      path: info.outputPath(`related-readonly-${index + 1}.png`)
    })
    await related
      .getByRole('link', { name: `查看财务应付单 ${matched.payable_no}`, exact: true })
      .click()
    await expect(detail).toBeHidden()
    const payable = page
      .getByRole('dialog')
      .filter({ hasText: String(matched.payable_no) })
      .first()
    await expect(payable).toBeVisible()
    await payable.getByRole('button', { name: /关闭此/ }).click()
    loaded = ready()
    await page.goto(`#/fms/accounting/voucher-center?recordId=${entry.voucherId}`, {
      waitUntil: 'domcontentloaded'
    })
    response = await loaded
    expect(response.ok()).toBe(true)
    await response.finished()
    journal({
      stage: 'readonly-return-ready',
      index: index + 1,
      voucherId: entry.voucherId,
      elapsedMs: response.request().timing().responseEnd
    })
    await expect(related.getByText(String(matched.record_no), { exact: true })).toBeVisible()
    await related.getByRole('button', { name: '收起关联信息', exact: true }).click()
    await captureBusinessEvidence(detail, {
      path: info.outputPath(`related-readonly-collapsed-${index + 1}.png`)
    })
    await related.getByRole('button', { name: '展开关联信息', exact: true }).click()
    const lastAction = detail.locator('.voucher-detail__timeline-card').last()
    await lastAction.scrollIntoViewIfNeeded()
    await expect(lastAction).toBeInViewport({ ratio: 1 })
    await captureBusinessEvidence(detail, {
      path: info.outputPath(`related-readonly-lower-${index + 1}.png`)
    })
    await detail.getByRole('button', { name: /关闭此/ }).click()
  }
})
