import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import {
  openTransportEntry,
  transportInput,
  type TransportWrite
} from './support/form-standard-transport'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 20_000 })
test.setTimeout(90_000)

const id = '22222222-2222-4222-8222-222222222222'
const allocationId = '33333333-3333-4333-8333-333333333333'

async function openExtra(page: Page, entry: string, writes: Record<string, unknown>[]) {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    const body = route.request().postDataJSON() as Record<string, unknown> | null
    if (name === 'tms_get_waybill_leg_commission_secure')
      return route.fulfill({
        json: {
          waybillId: id,
          waybillNo: 'WB-EXTRA-TEST',
          status: 'transporting',
          driverId: id,
          legKind: body?.p_leg_kind,
          availableLegKinds: ['forward', 'return'],
          estimate: { amount: 50, matched: true, snapshot: { versionNo: 1 } },
          history: []
        }
      })
    if (name === 'tms_get_waybill_execution_context')
      return route.fulfill({
        json: {
          record: {
            receiptUrls: ['https://example.invalid/receipt.png'],
            signatureUrls: ['https://example.invalid/signature.png']
          }
        }
      })
    if (name === 'tms_get_execution_sources_secure')
      return route.fulfill({
        json: [
          {
            id: allocationId,
            orderNo: 'SOURCE-EXTRA',
            customerName: '验收客户',
            quantity: 10,
            exceptionQuantity: 0,
            signedAt: null
          }
        ]
      })
    if (name?.startsWith('tms_override_') || name === 'tms_sign_execution_allocations_secure') {
      writes.push(body ?? {})
      return route.fulfill({ json: id })
    }
    return route.fulfill({ json: [] })
  })
  await page.goto(`/tests/e2e/fixtures/form-standard-transport.html?entry=${entry}`)
  await page.getByRole('button', { name: '打开真实业务入口', exact: true }).click()
  const dialog = page.locator('.el-dialog:visible').last()
  await expect(dialog).toBeVisible()
  return dialog
}

test('打印数量元数据保留按货量与自定义份数', async ({ page }, info) => {
  const dialog = await openExtra(page, 'print-count', [])
  await dialog.getByText('自定义', { exact: true }).click()
  await transportInput(dialog, 'customCount').fill('9')
  await dialog.screenshot({ path: info.outputPath('print-count.png') })
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect(page.getByTestId('save-result')).toHaveText('["label",9]')
})

test('提成金额与原因保留货段草稿并提交对应货段', async ({ page }, info) => {
  const writes: Record<string, unknown>[] = []
  const dialog = await openExtra(page, 'waybill-commission', writes)
  await transportInput(dialog, 'amount').fill('88.5')
  await transportInput(dialog, 'reason').fill('验收正向货线路调整')
  await dialog.getByText('返程配货', { exact: true }).click()
  await transportInput(dialog, 'amount').fill('66.5')
  await transportInput(dialog, 'reason').fill('验收返程货线路调整')
  await dialog.getByText('正向货', { exact: true }).click()
  await expect(transportInput(dialog, 'amount')).toHaveValue('88.50')
  await expect(transportInput(dialog, 'reason')).toHaveValue('验收正向货线路调整')
  await dialog.getByText('返程配货', { exact: true }).click()
  await dialog.screenshot({ path: info.outputPath('commission-return.png') })
  await dialog.getByRole('button', { name: '保存当前货段', exact: true }).click()
  await expect.poll(() => writes.length).toBe(1)
  expect(writes[0]).toMatchObject({
    p_waybill_id: id,
    p_leg_kind: 'return',
    p_amount: 66.5,
    p_reason: '验收返程货线路调整'
  })
})

test('签收动态配置字段保留原始单分配与条件异常说明', async ({ page }, info) => {
  const writes: Record<string, unknown>[] = []
  const dialog = await openExtra(page, 'execution-signature', writes)
  await transportInput(dialog, 'items.0.signedQuantity').fill('8')
  await transportInput(dialog, 'items.0.exceptionQuantity').fill('2')
  await expect(transportInput(dialog, 'items.0.exceptionNote')).toBeVisible()
  await dialog.getByRole('button', { name: '确认提交', exact: true }).click()
  await expect(page.locator('.el-message')).toContainText('异常说明')
  expect(writes).toEqual([])
  await transportInput(dialog, 'items.0.exceptionNote').fill('验收包装破损两件')
  await dialog.screenshot({ path: info.outputPath('signature-source.png') })
  await dialog.getByRole('button', { name: '确认提交', exact: true }).click()
  await expect(page.getByTestId('save-result')).toHaveText('已保存')
  expect(writes[0]).toMatchObject({
    p_waybill_id: id,
    p_signer_name: '验收收货人',
    p_allocations: [
      {
        allocation_id: allocationId,
        signed_quantity: 8,
        exception_quantity: 2,
        exception_note: '验收包装破损两件'
      }
    ]
  })
})

test('返程费用元数据保存分摊比例且不传UI归集字段', async ({ page }, info) => {
  const writes: TransportWrite[] = []
  const dialog = await openTransportEntry(page, 'return-trip', writes)
  await dialog.locator('[data-art-form-item-key="returnCustomerId"] .el-select').click()
  await page.getByRole('option', { name: '验收客户', exact: true }).click()
  await dialog.getByRole('tab', { name: '收入与费用', exact: true }).click()
  await transportInput(dialog, 'freightIncome').fill('1200')
  await transportInput(dialog, 'directMiscFee').fill('35')
  await dialog.getByText('按比例分摊', { exact: true }).click()
  await transportInput(dialog, 'sharedCostAllocationPct').fill('25')
  await transportInput(dialog, 'remark').fill('验收返程费用说明')
  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  await dialog.screenshot({ path: info.outputPath('return-finance-mobile.png') })
  await dialog.getByRole('button', { name: '保存返程配货', exact: true }).click()
  await expect(page.getByTestId('save-result')).toHaveText('已保存')
  expect(writes[0].payload).toMatchObject({
    p_payload: {
      freight_income: 1200,
      direct_misc_fee: 35,
      shared_cost_allocation_pct: 25,
      remark: '验收返程费用说明'
    }
  })
  expect(JSON.stringify(writes[0].payload)).not.toContain('allocation_mode')
  expect(JSON.stringify(writes[0].payload)).not.toContain('allocationMode')
})
