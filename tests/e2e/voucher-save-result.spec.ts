import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const result of [
  'success',
  'missing-id',
  'missing-detail',
  'allocation-retry',
  'revoked-after-save',
  'submit-success',
  'submit-failure',
  'submit-empty',
  'submit-revoked'
]) {
  test(`凭证保存与提交 ${result}`, async ({ page }) => {
    await prepareIsolatedSession(page)
    let saves = 0
    let allocations = 0
    let transitions = 0
    const submitting = result.startsWith('submit-')
    let payload: Record<string, unknown> | undefined
    const payloads: Record<string, unknown>[] = []
    await page.route('**/rest/v1/rpc/fms_list_financial_statement_items_secure**', (route) =>
      route.fulfill({ json: { records: [], fieldAccess: {} } })
    )
    await page.route('**/rest/v1/rpc/fms_get_voucher_template_secure**', (route) =>
      route.fulfill({
        json: {
          voucherType: 'general',
          summary: '有效测试凭证',
          lines: ['debit', 'credit'].map((entryDirection, index) => ({
            lineNo: index + 1,
            summary: '测试平衡分录',
            subjectId: 'ffffffff-ffff-4fff-afff-ffffffffffff',
            entryDirection,
            defaultAmount: 100,
            auxiliaryValues: {},
            exchangeRate: 1,
            quantity: 0
          })),
          fieldAccess: { templateEntries: 'read', templateNarrative: 'read' }
        }
      })
    )
    await page.route('**/rest/v1/rpc/save_fms_voucher_secure**', async (route) => {
      saves += 1
      payload = route.request().postDataJSON().p_payload
      if (payload) payloads.push(payload)
      if (result === 'revoked-after-save')
        await page
          .getByTestId('revoke-delete-permission')
          .evaluate((button: HTMLButtonElement) => button.click())
      return route.fulfill({
        json: result === 'missing-id' ? {} : { id: 'eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee' }
      })
    })
    await page.route('**/rest/v1/rpc/fms_get_voucher_secure**', (route) =>
      route.fulfill({
        json:
          result === 'missing-detail'
            ? null
            : { id: 'eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee', lines: [] }
      })
    )
    await page.route('**/rest/v1/rpc/save_fms_cash_flow_allocations_secure**', async (route) => {
      allocations += 1
      if (result === 'submit-revoked')
        await page
          .getByTestId('revoke-delete-permission')
          .evaluate((button: HTMLButtonElement) => button.click())
      if (result === 'allocation-retry' && allocations === 1)
        return route.fulfill({
          status: 400,
          json: { code: 'P0001', message: '测试归集失败，请重试' }
        })
      return route.fulfill({ json: [] })
    })
    await page.route('**/rest/v1/rpc/transition_fms_voucher_secure**', (route) => {
      transitions += 1
      expect(route.request().postDataJSON().p_action).toBe('submit')
      if (result === 'submit-empty') return route.fulfill({ json: null })
      return result === 'submit-failure'
        ? route.fulfill({ status: 400, json: { code: 'P0001', message: '测试提交失败，请重试' } })
        : route.fulfill({ json: { id: 'eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee', status: 'pending' } })
    })
    await page.goto(
      `/tests/e2e/fixtures/record-delete-context.html?validationTarget=voucher&voucherPermission=${submitting ? 'Add,Edit,Submit' : result === 'allocation-retry' ? 'Add,Edit' : 'Add'}&voucherTemplate=true`
    )
    await page.getByRole('button', { name: '打开校验表单', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('combobox', { name: '套用模板', exact: true }).click()
    await page.getByRole('option', { name: 'TEST 测试模板', exact: true }).click()
    const summary = dialog.getByPlaceholder('概括本次经济业务', { exact: true })
    await expect(summary).toHaveValue('有效测试凭证')
    await dialog
      .getByRole('button', { name: submitting ? '保存并提交' : '保存草稿', exact: true })
      .click()
    if (result === 'success' || result === 'submit-success') {
      await expect(dialog).toHaveCount(0)
      await expect(
        page.getByText(submitting ? '凭证已提交审核' : '会计凭证草稿已保存', { exact: true })
      ).toBeVisible()
    } else {
      await expect(page.locator('.el-message--error')).toBeVisible()
      await expect(dialog).toBeVisible()
      await expect(summary).toHaveValue('有效测试凭证')
      await expect(page.getByText('会计凭证草稿已保存', { exact: true })).toHaveCount(0)
      await expect(page.getByText('凭证已提交审核', { exact: true })).toHaveCount(0)
      await page.screenshot({ path: test.info().outputPath('save-retained.png') })
    }
    if (result === 'allocation-retry') {
      await expect(
        dialog.getByText('凭证已保存，但现金流量归集未完成；请检查后重试', { exact: true })
      ).toBeVisible()
      expect(saves).toBe(1)
      expect(allocations).toBe(1)
      await dialog.getByRole('button', { name: '保存草稿', exact: true }).click()
      await expect(dialog).toHaveCount(0)
      await expect(page.getByText('会计凭证草稿已保存', { exact: true })).toBeVisible()
      expect(payloads[0].id).toBeUndefined()
      expect(payloads[1].id).toBe('eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee')
    }
    if (result === 'revoked-after-save') {
      await expect(
        dialog.getByText('凭证已保存，但现金流量归集未完成；请检查后重试', { exact: true })
      ).toBeVisible()
      await expect(summary).toBeDisabled()
      await expect(dialog.getByRole('button', { name: '保存草稿', exact: true })).toHaveCount(0)
    }
    expect(saves).toBe(result === 'allocation-retry' ? 2 : 1)
    expect(allocations).toBe(
      result === 'allocation-retry' ? 2 : result === 'success' || submitting ? 1 : 0
    )
    expect(transitions).toBe(
      ['submit-success', 'submit-failure', 'submit-empty'].includes(result) ? 1 : 0
    )
    if (['submit-failure', 'submit-revoked', 'submit-empty'].includes(result))
      await expect(
        dialog.getByText('凭证已保存，提交状态待核实；请先查看列表中的凭证状态', { exact: true })
      ).toBeVisible()
    expect(payload?.summary).toBe('有效测试凭证')
    expect(payload?.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ debitAmount: 100, creditAmount: 0 }),
        expect.objectContaining({ debitAmount: 0, creditAmount: 100 })
      ])
    )
  })
}
