import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })

test('东八区凌晨新建账套默认当天启用日期', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-06T00:30:00+08:00'))
  await prepareIsolatedSession(page)
  await page.goto('/tests/e2e/fixtures/record-delete-context.html?validationTarget=account-set')
  await page.getByRole('button', { name: '打开校验表单' }).click()
  const dialog = page.getByRole('dialog', { name: '新建企业账套' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('tab', { name: '政策与启用' }).click()
  await expect(dialog.locator('[data-art-form-item-key="enabledOn"] input')).toHaveValue(
    '2026-11-06'
  )
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(dialog).toBeHidden()
})
