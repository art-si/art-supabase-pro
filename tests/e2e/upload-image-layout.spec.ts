import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 20_000 })
test.setTimeout(180_000)

for (const theme of ['light', 'dark'])
  for (const box of ['border-mode', 'shadow-mode']) {
    test(`公共上传布局及状态 ${theme} ${box}`, async ({ page }, info) => {
      await prepareIsolatedSession(page)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
      await page.goto(`/tests/e2e/fixtures/upload-image-layout.html?theme=${theme}&box=${box}`)
      const single = page.locator('[data-mode="single"]')
      const picture = single.locator('.preview-list')
      await expect(picture).toBeVisible()
      await expect(single.getByRole('button', { name: '从资源库选择图片' })).toHaveCount(0)
      await expect(single.locator('.el-upload')).toBeHidden()
      await expect(page.locator('[data-mode="multiple"] .el-upload')).toBeVisible()
      for (const mode of ['readonly', 'disabled']) {
        await expect(
          page
            .locator(`[data-mode="${mode}"]`)
            .getByRole('button', { name: '删除图片', exact: true })
        ).toHaveCount(0)
        await expect(page.locator(`[data-mode="${mode}"] .resource-picker-action`)).toHaveCount(0)
      }
      await picture.hover()
      await single.getByRole('button', { name: '预览图片', exact: true }).click()
      await expect(page.locator('.el-image-viewer__wrapper')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.locator('.el-image-viewer__wrapper')).toHaveCount(0)
      const empty = page.locator('[data-mode="empty"]')
      const resource = empty.getByRole('button', { name: '从资源库选择图片' })
      await expect(resource).toBeVisible()
      const uploadBox = (await empty.locator('.upload-container').boundingBox())!
      const resourceBox = (await resource.boundingBox())!
      expect(resourceBox.x).toBeGreaterThanOrEqual(uploadBox.x)
      expect(resourceBox.x + resourceBox.width).toBeLessThanOrEqual(
        uploadBox.x + uploadBox.width + 1
      )
      expect(resourceBox.y).toBeGreaterThanOrEqual(uploadBox.y)
      await resource.click()
      const dialog = page.getByRole('dialog', { name: '资源选择器' })
      await expect(dialog).toBeVisible()
      await dialog.getByRole('button', { name: '取消', exact: true }).click()
      await empty
        .locator('input[type="file"]')
        .setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: Buffer.from('test') })
      await expect(empty.getByText('上传中', { exact: true })).toBeVisible()
      await expect(empty.locator('.preview-list .el-image')).toBeVisible()
      await expect(resource).toHaveCount(0)
      await empty.locator('.preview-list').hover()
      await empty.getByRole('button', { name: '删除图片', exact: true }).click()
      await expect(empty.locator('.el-upload')).toBeVisible()
      await expect(resource).toBeVisible()
      await empty
        .locator('input[type="file"]')
        .setInputFiles({ name: 'fail.png', mimeType: 'image/png', buffer: Buffer.from('test') })
      await expect(page.locator('.el-message--error')).toBeVisible()
      await expect(page.locator('.el-message--error')).toContainText(/失败|重试/)
      await expect(empty.locator('.el-upload')).toBeVisible()
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
      ).toBe(true)
      await page.screenshot({ path: info.outputPath('upload-layout.png'), fullPage: true })
      expect(errors).toEqual([])
    })
  }
