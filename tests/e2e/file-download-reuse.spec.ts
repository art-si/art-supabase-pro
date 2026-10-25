import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.setTimeout(120_000)
test.use({ storageState: { cookies: [], origins: [] } })

for (const theme of ['light', 'dark']) {
  for (const box of ['border', 'shadow']) {
    test(`默认裁剪尺寸 ${theme} ${box} 保持画布并约束页面宽度`, async ({ page }, info) => {
      await prepareIsolatedSession(page)
      await page.goto(
        `/tests/e2e/fixtures/cutter-download-reuse.html?defaults&theme=${theme}&box=${box}`
      )
      await page.getByRole('button', { name: '设置验收图片', exact: true }).click()
      await expect(page.getByAltText('裁剪结果预览')).toBeVisible()
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
      ).toBeLessThanOrEqual(1)
      const preview = await page.locator('.preview-box').boundingBox()
      expect(preview).not.toBeNull()
      if (!preview) throw new Error('没有裁剪预览')
      expect(preview.width / preview.height).toBeCloseTo(470 / 270, 2)
      const cutter = await page.locator('.cutter-component').boundingBox()
      const previewSection = await page.locator('.preview-container').boundingBox()
      if (!cutter || !previewSection) throw new Error('裁剪区域未就绪')
      if (previewSection.x < cutter.x + cutter.width) {
        expect(previewSection.y - (cutter.y + cutter.height)).toBeGreaterThanOrEqual(20)
      }
      const scroll = page.locator('.cutter-component .el-scrollbar__wrap')
      expect(await scroll.evaluate((element) => element.scrollWidth)).toBeGreaterThanOrEqual(700)
      await page.screenshot({ path: info.outputPath('default-cutter.png'), fullPage: true })
      await scroll.evaluate((element) => {
        element.scrollLeft = element.scrollWidth
      })
      await expect(page.getByRole('button', { name: '清除', exact: true })).toBeInViewport()
      await page.getByRole('button', { name: '下载图片', exact: true }).scrollIntoViewIfNeeded()
      await expect(page.getByRole('button', { name: '下载图片', exact: true })).toBeInViewport()
    })
  }
}

test('裁剪图片通过公共下载保留文件名和图片内容', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/tests/e2e/fixtures/cutter-download-reuse.html')
  const button = page.getByRole('button', { name: '下载图片', exact: true })
  await expect(button).toBeDisabled()
  await page.getByRole('button', { name: '设置验收图片', exact: true }).click()
  await expect(page.getByAltText('裁剪结果预览')).toBeVisible()
  await expect(button).toBeEnabled()
  const pending = page.waitForEvent('download')
  await button.click()
  const download = await pending
  expect(download.suggestedFilename()).toBe('image.png')
  const path = info.outputPath('image.png')
  await download.saveAs(path)
  expect((await readFile(path)).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  expect(await download.failure()).toBeNull()
  await expect(page.locator('a[download]')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('cutter-download.png') })
  expect(errors).toEqual([])
})

test('配件模板通过主仓公共下载保留 DOCX 文件', async ({ page }) => {
  await prepareIsolatedSession(page)
  await page.goto('/tests/e2e/fixtures/accessory-recognition-history.html')
  const button = page.getByRole('button', { name: '下载统一模板', exact: true })
  await expect(button).toBeVisible()
  const pending = page.waitForEvent('download')
  await button.click()
  const download = await pending
  expect(download.suggestedFilename()).toBe('配件加工清单模板.docx')
  const path = await download.path()
  expect(path).not.toBeNull()
  if (!path) throw new Error('模板下载没有生成文件')
  expect((await readFile(path)).subarray(0, 4).toString('hex')).toBe('504b0304')
  expect(await download.failure()).toBeNull()
  await expect(page.locator('a[download]')).toHaveCount(0)
})
