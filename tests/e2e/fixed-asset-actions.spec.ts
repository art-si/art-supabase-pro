import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)

for (const action of [
  { key: 'activate', label: '确认转固', initial: 'draft', next: 'active' },
  { key: 'suspend', label: '暂停折旧', initial: 'active', next: 'suspended' },
  { key: 'resume', label: '恢复使用', initial: 'suspended', next: 'active' }
] as const) {
  for (const mode of ['success', 'revoked', 'cancel', 'failure', 'busy'] as const) {
    test(`固定资产${action.label} ${mode}`, async ({ page }, testInfo) => {
      await prepareIsolatedSession(page)
      const id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
      let status: string = action.initial
      let requests = 0
      let releaseAction: () => void = () => undefined
      const pendingAction = new Promise<void>((resolve) => {
        releaseAction = resolve
      })
      const asset = () => ({
        id,
        assetNo: 'ASSET-001',
        assetName: '测试固定资产',
        status,
        usefulLifeMonths: 60,
        depreciatedMonths: 0,
        fieldAccess: { assetValues: 'edit', assetReferences: 'edit' }
      })
      await page.route('**/rest/v1/rpc/fms_list_fixed_assets_secure**', (route) =>
        route.fulfill({ json: { records: [asset()], total: 1, fieldAccess: asset().fieldAccess } })
      )
      await page.route('**/rest/v1/rpc/act_fms_fixed_asset_secure**', async (route) => {
        requests++
        expect(route.request().postDataJSON()).toMatchObject({
          p_asset_id: id,
          p_action: action.key
        })
        if (mode === 'busy') await pendingAction
        if (mode === 'failure')
          return route.fulfill({
            status: 503,
            json: { code: 'XX000', message: 'database unavailable' }
          })
        status = action.next
        await route.fulfill({ json: asset() })
      })
      await page.goto('/tests/e2e/fixtures/record-delete-context.html?target=fixed-asset')
      const body = page.locator('.el-table__body-wrapper').first()
      await expect(body).toContainText('ASSET-001')
      await body.getByRole('button', { name: '更多操作', exact: true }).click()
      await page.getByRole('menuitem', { name: action.label, exact: true }).click()
      const confirmation = page.getByRole('dialog', { name: action.label, exact: true })
      await expect(confirmation).toContainText(`确定执行“${action.label}”吗？`)
      if (mode === 'revoked')
        await page
          .getByTestId('revoke-delete-permission')
          .evaluate((button: HTMLButtonElement) => button.click())
      await confirmation
        .getByRole('button', { name: mode === 'cancel' ? '取消' : action.label, exact: true })
        .click()
      if (mode === 'revoked') {
        await expect(
          page.getByText('资产操作权限或状态已变化，请刷新页面后重试', { exact: true })
        ).toBeVisible()
        expect(requests).toBe(0)
      } else if (mode === 'cancel') {
        await expect(confirmation).toBeHidden()
        await body.getByRole('button', { name: '更多操作', exact: true }).click()
        await expect(
          page.getByRole('menuitem', { name: action.label, exact: true })
        ).not.toHaveAttribute('aria-disabled', 'true')
        expect(requests).toBe(0)
      } else if (mode === 'failure') {
        await expect(page.locator('.el-message--error')).toHaveCount(1)
        await expect(page.locator('.el-message--error')).not.toContainText('database unavailable')
        await body.getByRole('button', { name: '更多操作', exact: true }).click()
        await expect(
          page.getByRole('menuitem', { name: action.label, exact: true })
        ).not.toHaveAttribute('aria-disabled', 'true')
        expect(requests).toBe(1)
      } else {
        await expect.poll(() => requests).toBe(1)
        if (mode === 'busy') {
          await body.getByRole('button', { name: '更多操作', exact: true }).click()
          await expect(
            page.getByRole('menuitem', { name: action.label, exact: true })
          ).toHaveAttribute('aria-disabled', 'true')
          if (action.key === 'suspend') {
            for (const dark of [false, true])
              for (const boxMode of ['border-mode', 'shadow-mode']) {
                await page.evaluate(
                  ({ dark, boxMode }) => {
                    document.documentElement.classList.toggle('dark', dark)
                    document.documentElement.setAttribute('data-box-mode', boxMode)
                  },
                  { dark, boxMode }
                )
                const menuItem = page.getByRole('menuitem', { name: action.label, exact: true })
                expect(
                  await menuItem.evaluate((element) => {
                    const content = element.querySelector('.art-button-more__item')
                    return (
                      content && getComputedStyle(content).color === getComputedStyle(element).color
                    )
                  })
                ).toBe(true)
                await page.screenshot({
                  path: testInfo.outputPath(`disabled-${dark ? 'dark' : 'light'}-${boxMode}.png`),
                  animations: 'disabled'
                })
              }
          }
          await page.screenshot({
            path: testInfo.outputPath('asset-action-pending.png'),
            animations: 'disabled'
          })
          releaseAction()
        }
        await expect(body).toContainText(action.next)
        expect(requests).toBe(1)
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      )
    })
  }
}
