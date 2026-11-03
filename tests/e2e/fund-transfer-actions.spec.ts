import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)

const tenantId = '11111111-1111-4111-8111-111111111111'
const accountSetId = '33333333-3333-4333-8333-333333333333'
const statusLabels = {
  draft: '草稿',
  pending_review: '待审批',
  approved: '已审批',
  rejected: '已驳回',
  completed: '已完成',
  reversed: '已冲销'
} as const

for (const action of [
  {
    key: 'submit',
    label: '提交审批',
    title: '提交审批',
    initial: 'draft',
    next: 'pending_review',
    reason: false
  },
  {
    key: 'approve',
    label: '审批通过',
    title: '审批通过',
    initial: 'pending_review',
    next: 'approved',
    reason: false
  },
  {
    key: 'reject',
    label: '驳回',
    title: '驳回资金调拨',
    initial: 'pending_review',
    next: 'rejected',
    reason: true
  },
  {
    key: 'execute',
    label: '执行入账',
    title: '执行入账',
    initial: 'approved',
    next: 'completed',
    reason: false
  },
  {
    key: 'reverse',
    label: '冲销调拨',
    title: '冲销资金调拨',
    initial: 'completed',
    next: 'reversed',
    reason: true
  }
] as const) {
  for (const mode of [
    'failure',
    'cancel',
    'revoked',
    'success',
    'busy',
    ...(action.key === 'execute' ? (['missing-fee'] as const) : [])
  ] as const) {
    test(`资金调拨${action.label} ${mode}`, async ({ page }, testInfo) => {
      await prepareIsolatedSession(page)
      await page.route('**/rest/v1/rpc/current_is_super**', (route) =>
        route.fulfill({ json: false })
      )
      await page.route('**/rest/v1/sys_dictionary?*', (route) => {
        const type = new URL(route.request().url()).searchParams.get('dict_type_table.code')
        return route.fulfill({
          json:
            type === 'eq.fmsFundTransferStatus'
              ? Object.entries(statusLabels).map(([value, label], index) => ({
                  id: `transfer-status-${index}`,
                  type_id: 'fund-transfer-status',
                  code: value,
                  value,
                  label,
                  status: '1',
                  sort: index,
                  dict_type_table: { code: 'fmsFundTransferStatus', name: '资金调拨状态' }
                }))
              : []
        })
      })
      const id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
      let submissions = 0
      let status: string = action.initial
      let release: () => void = () => undefined
      const pending = new Promise<void>((resolve) => {
        release = resolve
      })
      await page.route('**/rest/v1/rpc/fms_list_fund_transfers_secure**', (route) =>
        route.fulfill({
          json: {
            records: [
              {
                id,
                tenantId,
                accountSetId,
                transferNo: 'TRANSFER-001',
                status,
                transferDate: '2026-10-07',
                amount: 100,
                feeAmount: mode === 'missing-fee' ? null : 0,
                sourceAccountName: '测试付款账户',
                currencyCode: 'CNY',
                version: 1,
                fieldAccess: { transferAccounts: 'read', transferAmounts: 'read' }
              }
            ],
            total: 1,
            fieldAccess: { transferAccounts: 'read', transferAmounts: 'read' }
          }
        })
      )
      await page.route('**/rest/v1/rpc/transition_fms_fund_transfer_secure**', async (route) => {
        submissions++
        expect(route.request().postDataJSON()).toMatchObject({
          p_transfer_id: id,
          p_action: action.key,
          p_expected_version: 1,
          p_remark: action.reason ? '业务核验原因' : null,
          p_execution_date:
            action.key === 'execute' || action.key === 'reverse'
              ? expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)
              : null
        })
        if (mode === 'busy') await pending
        if (mode !== 'failure') {
          status = action.next
          return route.fulfill({ json: { id, status } })
        }
        return route.fulfill({
          status: 503,
          json: { code: 'XX000', message: 'database unavailable' }
        })
      })
      await page.goto('/tests/e2e/fixtures/fms-fund-transfer-context.html?ordinary')
      const body = page.locator('.el-table__body-wrapper').first()
      await expect(body).toContainText('TRANSFER-001')
      await expect(page.getByRole('button', { name: /^全部调拨 1(?:\s|$)/ })).toBeVisible()
      await body.getByRole('button', { name: '更多操作', exact: true }).click()
      await expect(page.getByRole('menuitem', { name: action.label, exact: true })).toBeVisible()
      await page.getByRole('menuitem', { name: action.label, exact: true }).click()
      const confirmation = page.getByRole('dialog', { name: action.title, exact: true })
      if (mode === 'missing-fee') {
        await expect(confirmation).toContainText('执行后将生成双边资金流水并更新账户余额。')
        await expect(confirmation).not.toContainText('扣减')
        await page.screenshot({
          path: testInfo.outputPath('transfer-missing-fee.png'),
          animations: 'disabled'
        })
      }
      if (action.reason && mode !== 'cancel')
        await confirmation.getByRole('textbox').fill('业务核验原因')
      if (mode === 'revoked') {
        await page
          .getByTestId(`revoke-${action.key}`)
          .evaluate((button: HTMLButtonElement) => button.click())
        await expect(page.getByTestId('permission-state')).not.toContainText(
          `FinanceFundTransfer:${action.key[0].toUpperCase()}${action.key.slice(1)}`
        )
      }
      await confirmation
        .getByRole('button', {
          name: mode === 'cancel' ? '取消' : action.reason ? '确定' : action.label,
          exact: true
        })
        .click()
      await expect(confirmation).toBeHidden()
      if (mode === 'failure') {
        await expect(page.locator('.el-message--error')).toHaveCount(1)
        await expect(page.locator('.el-message--error')).not.toContainText('database unavailable')
        expect(submissions).toBe(1)
      } else if (mode === 'revoked') {
        await expect(
          page.getByText('调拨操作权限或状态已变化，请刷新页面后重试', { exact: true })
        ).toBeVisible()
        expect(submissions).toBe(0)
      } else if (mode === 'cancel') {
        await expect(page.locator('.el-message--error')).toHaveCount(0)
        expect(submissions).toBe(0)
      } else {
        await expect.poll(() => submissions).toBe(1)
        if (mode === 'busy') {
          await body.getByRole('button', { name: '更多操作', exact: true }).click()
          await expect(
            page.getByRole('menuitem', { name: action.label, exact: true })
          ).toHaveAttribute('aria-disabled', 'true')
          await page.screenshot({
            path: testInfo.outputPath('transfer-request-pending.png'),
            animations: 'disabled'
          })
          release()
        }
        await expect(body).toContainText(statusLabels[action.next])
        expect(submissions).toBe(1)
      }
      if (mode === 'failure' || mode === 'cancel') {
        await body.getByRole('button', { name: '更多操作', exact: true }).click()
        await expect(
          page.getByRole('menuitem', { name: action.label, exact: true })
        ).not.toHaveAttribute('aria-disabled', 'true')
      }
      await expect(body).toContainText('TRANSFER-001')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      )
    })
  }
}
