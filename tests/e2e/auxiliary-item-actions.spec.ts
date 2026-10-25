import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const action of ['toggle', 'sync'] as const) {
  for (const mode of action === 'toggle'
    ? (['success', 'failure', 'cancel', 'revoked', 'busy'] as const)
    : (['success', 'failure', 'busy'] as const)) {
    test(`辅助核算 ${action} ${mode}`, async ({ page }, testInfo) => {
      await prepareIsolatedSession(page)
      const typeId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
      const itemId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'
      const accountSetId = 'cccccccc-cccc-4ccc-accc-cccccccccccc'
      let enabled = true
      let writes = 0
      let releaseWrite: (() => void) | undefined
      const pendingWrite = new Promise<void>((resolve) => {
        releaseWrite = resolve
      })
      await page.route('**/rest/v1/rpc/fms_list_account_set_options_secure**', (route) =>
        route.fulfill({
          json: {
            records: [
              {
                id: accountSetId,
                accountSetCode: 'TEST',
                accountSetName: '测试账套',
                status: 'active'
              }
            ],
            total: 1
          }
        })
      )
      await page.route('**/rest/v1/fms_auxiliary_type?*', (route) =>
        route.fulfill({
          json: [
            {
              id: typeId,
              type_code: 'AUX-001',
              type_name: '测试核算维度',
              source_type: action === 'sync' ? 'customer' : 'manual',
              is_system: false,
              is_enabled: true,
              sort: 1
            }
          ]
        })
      )
      await page.route('**/rest/v1/fms_auxiliary_item?*', async (route) => {
        if (route.request().method() === 'PATCH') {
          writes += 1
          expect(new URL(route.request().url()).searchParams.get('id')).toBe(`eq.${itemId}`)
          expect(route.request().postDataJSON()).toEqual({ is_enabled: false })
          if (mode === 'busy') await pendingWrite
          if (mode === 'failure')
            return route.fulfill({
              status: 503,
              json: { code: 'XX000', message: 'database unavailable' }
            })
          enabled = false
          return route.fulfill({
            headers: { 'content-range': '0-0/1' },
            json: { id: itemId, is_enabled: false }
          })
        }
        return route.fulfill({
          json: [
            {
              id: itemId,
              item_code: 'ITEM-001',
              item_name: '测试核算项目',
              is_enabled: enabled,
              sort: 1
            }
          ]
        })
      })
      await page.route('**/rest/v1/rpc/sync_fms_auxiliary_items**', async (route) => {
        writes += 1
        expect(route.request().postDataJSON()).toEqual({
          p_account_set_id: accountSetId,
          p_auxiliary_type_id: typeId
        })
        if (mode === 'busy') await pendingWrite
        if (mode === 'failure')
          return route.fulfill({
            status: 503,
            json: { code: 'XX000', message: 'database unavailable' }
          })
        return route.fulfill({ json: { insertedCount: 0, updatedCount: 0 } })
      })
      await page.goto(
        `/tests/e2e/fixtures/record-delete-context.html?target=accounting-auxiliary&auxiliaryPermission=${action === 'toggle' ? 'Toggle' : 'Sync'}`
      )
      await expect(page.locator('.el-table__body-wrapper')).toContainText('ITEM-001')
      const button = page.getByRole('button', {
        name: action === 'toggle' ? '停用核算项目' : '同步主数据',
        exact: true
      })
      await button.click()
      if (action === 'toggle') {
        const confirmation = page.getByRole('dialog', { name: '停用辅助核算项目' })
        await expect(confirmation).toContainText('ITEM-001 测试核算项目')
        if (mode === 'revoked')
          await page
            .getByTestId('revoke-delete-permission')
            .evaluate((element: HTMLButtonElement) => element.click())
        await confirmation
          .getByRole('button', { name: mode === 'cancel' ? '取消' : '确定', exact: true })
          .click()
      }
      if (mode === 'cancel' || mode === 'revoked') {
        if (mode === 'revoked')
          await expect(
            page.getByText('核算项目启停权限已变化，请刷新页面后重试', { exact: true })
          ).toBeVisible()
        expect(writes).toBe(0)
        return
      }
      await expect.poll(() => writes).toBe(1)
      if (mode === 'busy') {
        await expect(button).toBeDisabled()
        await expect(page.getByRole('button', { name: '新增维度', exact: true })).toBeDisabled()
        await expect(page.getByRole('combobox', { name: '当前账套', exact: true })).toBeDisabled()
        await expect(
          page.getByRole('button', { name: '选择核算维度测试核算维度', exact: true })
        ).toBeDisabled()
        await page.screenshot({
          path: testInfo.outputPath('auxiliary-action-busy.png'),
          animations: 'disabled'
        })
        releaseWrite?.()
      }
      if (mode === 'failure') {
        await expect(page.locator('.el-message--error')).toHaveCount(1)
        await expect(page.locator('.el-message--error')).not.toContainText('database unavailable')
      } else if (action === 'toggle')
        await expect(page.getByRole('button', { name: '启用核算项目', exact: true })).toBeEnabled()
      else await expect(button).toBeEnabled()
      expect(writes).toBe(1)
    })
  }
}
