import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)

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
                transferNo: 'TRANSFER-001',
                status,
                transferDate: '2026-10-07',
                amount: 100,
                feeAmount: mode === 'missing-fee' ? null : 0,
                sourceAccountName: '测试付款账户',
                version: 1
              }
            ],
            total: 1
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
      await page.goto('/tests/e2e/fixtures/record-delete-context.html?target=fund-transfer')
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
      if (mode === 'revoked')
        await page
          .getByTestId('revoke-delete-permission')
          .evaluate((button: HTMLButtonElement) => button.click())
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
        await expect(body).toContainText(action.next)
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
