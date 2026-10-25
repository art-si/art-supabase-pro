import { test, expect } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
test.use({ storageState: { cookies: [], origins: [] } })
for (const theme of ['light', 'dark'])
  for (const box of ['border-mode', 'shadow-mode']) {
    test('公共清理模式 ' + theme + ' ' + box, async ({ page }, testInfo) => {
      await prepareIsolatedSession(page)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(
        '/tests/e2e/fixtures/delete-cleanup-modes.html?mode=all&theme=' +
          theme +
          '&box=' +
          box +
          '&fail=1'
      )
      await page.getByRole('button', { name: '检查客户关联' }).click()
      const dialog = page.locator('.el-dialog:visible')
      await expect(dialog.getByText('关联资料未完成核验，删除已停止')).toBeVisible()
      await expect(dialog.getByRole('button', { name: /一键清理/ })).toHaveCount(0)
      await dialog.getByRole('button', { name: '重新检查' }).click()
      await expect(dialog.getByText('草稿报价', { exact: true })).toBeVisible()
      await expect(dialog.getByText('草稿 · ¥12,345.67', { exact: true })).toBeVisible()
      await expect(dialog.getByText('草稿 · ¥0.00', { exact: true })).toBeVisible()
      await expect(dialog.getByRole('checkbox')).toHaveCount(0)
      await expect(dialog.getByRole('button', { name: '一键清理可删除项（2）' })).toBeEnabled()
      await dialog.screenshot({ path: testInfo.outputPath('all-mode.png'), animations: 'disabled' })
      expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
      await dialog.getByRole('button', { name: '一键清理可删除项（2）' }).click()
      await page
        .locator('.el-message-box:visible')
        .getByRole('button', { name: '一键清理可删除项' })
        .click()
      await expect(page.locator('body')).toHaveAttribute('data-cleaned', '0,1')
      await expect(dialog.getByText('已开具票据', { exact: true })).toBeVisible()
      await expect(dialog.getByText('草稿报价', { exact: true })).toHaveCount(0)
      await dialog.getByRole('button', { name: '查看记录' }).click()
      await expect(page.locator('body')).toHaveAttribute('data-query', /fromCustomerDelete/)
      await page.goto(
        '/tests/e2e/fixtures/delete-cleanup-modes.html?theme=' + theme + '&box=' + box
      )
      await page.getByRole('button', { name: '检查客户关联' }).click()
      await expect(dialog.getByRole('button', { name: '清理选中项（0）' })).toBeDisabled()
      await dialog
        .locator('.el-checkbox')
        .filter({ has: page.getByRole('checkbox', { name: '选择清理 草稿报价' }) })
        .click()
      await expect(dialog.getByRole('button', { name: '清理选中项（1）' })).toBeEnabled()
      await dialog.screenshot({
        path: testInfo.outputPath('selected-mode.png'),
        animations: 'disabled'
      })
      await dialog.getByRole('button', { name: '清理选中项（1）' }).click()
      await page
        .locator('.el-message-box:visible')
        .getByRole('button', { name: '清理选中项' })
        .click()
      await expect(page.locator('body')).toHaveAttribute('data-cleaned', '0')
      expect(errors).toEqual([])
    })
  }
