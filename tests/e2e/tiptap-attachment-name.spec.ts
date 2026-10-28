import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 30_000 })
test.setTimeout(180_000)

async function insertFileUrl(page: Page, url: string, name?: string) {
  await page.getByRole('button', { name: '插入附件', exact: true }).click()
  await page.getByRole('textbox', { name: '插入附件地址' }).fill(url)
  if (name) await page.getByRole('textbox', { name: '附件显示名称' }).fill(name)
  await page.getByRole('button', { name: '插入', exact: true }).click()
  const file = page.locator('a[data-type="file-attachment"]').last()
  await expect(file).toBeVisible()
  return file
}

test('Tiptap 附件地址用完整路径名写入节点与 HTML，显式名称优先', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/tests/e2e/fixtures/tiptap-attachment-name.html?theme=light&box=border-mode')
  const signed =
    'https://example.invalid/docs/%E8%AE%A1%E5%88%92%E6%8A%A5%E5%91%8A.pdf?token=must-not-be-name#preview'
  const first = await insertFileUrl(page, signed)
  await expect(first).toHaveAttribute('data-file-name', '计划报告.pdf')
  await expect(first).toHaveAttribute('href', signed)
  await expect(page.getByTestId('html')).toContainText('data-file-name="计划报告.pdf"')
  await expect(page.getByTestId('html')).not.toContainText('data-file-name="must-not-be-name"')

  const named = await insertFileUrl(
    page,
    'https://example.invalid/docs/original.pdf?token=secret',
    '指定名称.docx'
  )
  await expect(named).toHaveAttribute('data-file-name', '指定名称.docx')
  await expect(page.getByTestId('html')).toContainText('data-file-name="指定名称.docx"')
  await page.screenshot({
    path: info.outputPath('tiptap-attachment-light-1440.png'),
    fullPage: true
  })
  expect(pageErrors).toEqual([])
})

test('Tiptap 坏编码、超长名称与无路径 URL 都安全回退或完整保留', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.setViewportSize({ width: 570, height: 900 })
  await page.goto('/tests/e2e/fixtures/tiptap-attachment-name.html?theme=dark&box=shadow-mode')
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.locator('html')).toHaveAttribute('data-box-mode', 'shadow-mode')

  const malformed = await insertFileUrl(page, 'https://example.invalid/docs/%ZZ.pdf')
  await expect(malformed).toHaveAttribute('data-file-name', '附件')
  const longName = `${'长'.repeat(124)}.pdf`
  const long = await insertFileUrl(
    page,
    `https://example.invalid/docs/${encodeURIComponent(longName)}?token=must-not-be-name`
  )
  await expect(long).toHaveAttribute('data-file-name', longName)
  await expect(page.getByTestId('html')).toContainText(`data-file-name="${longName}"`)
  const noPath = await insertFileUrl(page, 'https://example.invalid')
  await expect(noPath).toHaveAttribute('data-file-name', '附件')
  await expect(page.getByTestId('html')).not.toContainText('data-file-name="example.invalid"')
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  await page.screenshot({ path: info.outputPath('tiptap-attachment-dark-570.png'), fullPage: true })
  expect(pageErrors).toEqual([])
})
