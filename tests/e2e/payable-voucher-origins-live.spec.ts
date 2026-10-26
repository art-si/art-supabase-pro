import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import {
  acceptanceRecord,
  acceptanceRows,
  acceptanceRpc,
  assertPayableAcceptanceSession,
  payableAcceptanceTenantId
} from './support/payable-live-session'
import { captureBusinessEvidence } from './support/capture-business-evidence'
import { prepareAppearance } from './support/appearance'
import { financePaths } from '../../src/router/business-paths'

const enabled = process.env.E2E_PAYABLE_LIVE === 'true'
test.use({
  storageState: enabled
    ? process.env.E2E_AUTH_STATE_FILE || '.artifacts/qa-payable-real.storage.json'
    : { cookies: [], origins: [] },
  actionTimeout: 30_000
})
test.setTimeout(600_000)

test('三类核销六条真实来源只读联查，返回凭证不改业务数据', async ({ page, context }, info) => {
  test.skip(
    !enabled || process.env.E2E_PAYABLE_VOUCHER_ORIGINS !== 'true',
    '仅显式读取独立验收历史'
  )
  const client = await assertPayableAcceptanceSession(context)
  const cases = acceptanceRows(
    JSON.parse(readFileSync('.artifacts/payable-voucher-origin-context.json', 'utf8'))
  )
  expect(cases).toHaveLength(6)
  const writes: string[] = []
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('request', (request) => {
    const rpc = new URL(request.url()).pathname.split('/').pop() || ''
    if (request.method() === 'POST' && /^fms_(save_|act_|manual_|auto_)/.test(rpc)) writes.push(rpc)
  })
  await prepareAppearance(page, {
    theme: info.project.name.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !info.project.name.includes('shadow')
  })
  for (const entry of cases) {
    assert.ok(typeof entry.record_id === 'string')
    const record = acceptanceRecord(
      await acceptanceRpc(client, 'fms_get_payable_writeoff_record_secure', {
        p_id: entry.record_id
      })
    )
    expect(record.id).toBe(entry.record_id)
    expect(record.tenant_id).toBe(payableAcceptanceTenantId)
    const targets =
      entry.relation === 'payment_refund'
        ? [
            {
              label: '付款单',
              path: financePaths.payablePayment,
              field: 'payment_document_id',
              number: 'payment_document_no',
              dialog: '查看付款单'
            },
            {
              label: '付款退款单',
              path: financePaths.payableRefund,
              field: 'refund_document_id',
              number: 'refund_document_no',
              dialog: '查看付款退款单'
            }
          ]
        : [
            {
              label: '财务应付单',
              path: financePaths.financialPayable,
              field: 'payable_id',
              number: 'payable_no',
              dialog: '财务应付单详情'
            },
            entry.relation === 'payable_receivable'
              ? {
                  label: '财务应收单',
                  path: financePaths.financialReceivable,
                  field: 'receivable_document_id',
                  number: 'receivable_document_no',
                  dialog: '财务应收单'
                }
              : {
                  label: '付款单',
                  path: financePaths.payablePayment,
                  field: 'payment_document_id',
                  number: 'payment_document_no',
                  dialog: '查看付款单'
                }
          ]
    for (const [index, target] of targets.entries()) {
      const targetId = entry[target.field]
      const targetNo = entry[target.number]
      assert.ok(typeof targetId === 'string' && typeof targetNo === 'string')
      expect(record[target.field]).toBe(targetId)
      if (entry.voucher_id) {
        const read = page.waitForResponse(
          (response) =>
            response.url().endsWith('/rpc/fms_get_payable_writeoff_record_secure') &&
            response.request().postDataJSON()?.p_id === entry.record_id
        )
        await page.goto(`#${financePaths.voucherCenter}?recordId=${entry.voucher_id}`, {
          waitUntil: 'domcontentloaded'
        })
        const response = await read
        expect(response.ok()).toBe(true)
        await response.finished()
        const voucher = page.getByRole('dialog', { name: '会计凭证详情', exact: true })
        const related = voucher.getByRole('complementary', { name: '凭证关联信息', exact: true })
        const link = related.getByRole('link', {
          name: `查看${target.label} ${targetNo}`,
          exact: true
        })
        await expect(link).toHaveAttribute('href', new RegExp(`recordId=${targetId}`))
        await captureBusinessEvidence(related, {
          path: info.outputPath(`${entry.relation}-${entry.position}-${index}-related.png`)
        })
        await link.click()
        await expect(voucher).toBeHidden()
      } else {
        expect(entry.relation).toBe('payment_refund')
        expect(record.needs_voucher).toBe(false)
        await page.goto(`#${target.path}?recordId=${targetId}`, { waitUntil: 'domcontentloaded' })
      }
      const original = page.getByRole('dialog', { name: target.dialog, exact: true })
      await expect(original).toBeVisible({ timeout: 60_000 })
      await expect(original.locator('[aria-busy="true"]:visible')).toHaveCount(0, {
        timeout: 90_000
      })
      await expect(original.locator('.el-skeleton:visible,.el-loading-mask:visible')).toHaveCount(0)
      await expect(original.locator('.el-alert--error:visible')).toHaveCount(0)
      await expect(original.locator('.el-table__body-wrapper tbody tr').first()).toBeVisible()
      await expect(original).toContainText(targetNo)
      await expect(original.getByRole('button', { name: '保存', exact: true })).toHaveCount(0)
      await captureBusinessEvidence(original, {
        path: info.outputPath(`${entry.relation}-${entry.position}-${index}-original.png`)
      })
      await original.getByRole('button', { name: /关闭此/ }).click()
      await expect(original).toBeHidden()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      )
    }
  }
  expect(writes).toEqual([])
  expect(pageErrors).toEqual([])
})
