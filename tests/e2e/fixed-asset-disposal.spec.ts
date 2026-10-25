import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)

for (const mode of ['success', 'revoked', 'status-changed', 'field-changed', 'failure'] as const) {
  test(`固定资产处置 ${mode}`, async ({ page }, testInfo) => {
    await prepareIsolatedSession(page)
    const id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
    const asset = {
      id,
      assetNo: 'ASSET-001',
      assetName: '测试固定资产',
      accountSetId: 'cccccccc-cccc-4ccc-cccc-cccccccccccc',
      status: 'active',
      usefulLifeMonths: 60,
      depreciatedMonths: 0,
      originalValue: 1000,
      accumulatedDepreciation: 100,
      impairmentAmount: 0,
      fieldAccess: { assetValues: 'edit', assetReferences: 'edit' }
    }
    const actions: unknown[] = []
    await page.route('**/rest/v1/rpc/fms_list_fixed_assets_secure**', (route) =>
      route.fulfill({ json: { records: [asset], total: 1, fieldAccess: asset.fieldAccess } })
    )
    await page.route('**/rest/v1/rpc/fms_get_fixed_asset_secure**', (route) =>
      route.fulfill({
        json: {
          ...asset,
          status: mode === 'status-changed' ? 'disposed' : asset.status,
          fieldAccess:
            mode === 'field-changed'
              ? { ...asset.fieldAccess, assetValues: 'read' }
              : asset.fieldAccess
        }
      })
    )
    await page.route('**/rest/v1/rpc/act_fms_fixed_asset_secure**', (route) => {
      const payload = route.request().postDataJSON()
      actions.push(payload)
      expect(payload).toMatchObject({
        p_asset_id: id,
        p_action: 'dispose',
        p_payload: {
          amount: 0,
          reason: '设备报废验收'
        }
      })
      return mode === 'failure'
        ? route.fulfill({ status: 503, json: { code: 'XX000', message: 'database unavailable' } })
        : route.fulfill({ json: { ...asset, status: 'disposed' } })
    })
    await page.goto('/tests/e2e/fixtures/record-delete-context.html?target=fixed-asset')
    const body = page.locator('.el-table__body-wrapper').first()
    await expect(body).toContainText('ASSET-001')
    await body.getByRole('button', { name: '更多操作', exact: true }).click()
    await page.getByRole('menuitem', { name: '资产处置' }).click()
    if (mode === 'status-changed' || mode === 'field-changed') {
      await expect(
        page.getByText(
          mode === 'status-changed'
            ? '当前资产状态不能处置，请刷新资产状态后重试'
            : '你没有该资产价值字段的编辑权限，无法执行资产处置',
          { exact: true }
        )
      ).toBeVisible()
      await expect(page.getByRole('dialog', { name: /处置固定资产/ })).toBeHidden()
      expect(actions).toEqual([])
      return
    }
    const dialog = page.getByRole('dialog', { name: /处置固定资产/ })
    await expect(dialog.getByRole('button', { name: '确认处置', exact: true })).toBeEnabled()
    await dialog.getByRole('textbox', { name: '处置原因' }).fill('设备报废验收')
    if (mode === 'revoked')
      await page
        .getByTestId('revoke-delete-permission')
        .evaluate((button: HTMLButtonElement) => button.click())
    await dialog.getByRole('button', { name: '确认处置', exact: true }).click()
    if (mode === 'success') {
      await expect(dialog).toBeHidden()
      expect(actions).toHaveLength(1)
    } else {
      await expect(dialog).toBeVisible()
      await expect(page.locator('.el-message--error')).toHaveCount(1)
      await expect(page.locator('.el-message--error')).not.toContainText('database unavailable')
      if (mode === 'revoked') {
        await expect(dialog.getByRole('button', { name: '确认处置', exact: true })).toBeDisabled()
        await expect(
          page.getByText('资产处置权限已变化，请刷新页面后重试', { exact: true })
        ).toBeVisible()
        expect(actions).toEqual([])
      } else expect(actions).toHaveLength(1)
      await page.screenshot({
        path: testInfo.outputPath('disposal-feedback.png'),
        animations: 'disabled'
      })
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}
