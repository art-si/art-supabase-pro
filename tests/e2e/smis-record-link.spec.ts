import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

test('SMIS 记录链接统一标题、编号、键盘焦点和点击反馈', async ({ page }, testInfo) => {
  const dark = testInfo.project.name.includes('dark')
  const boxMode = testInfo.project.name.includes('shadow') ? 'shadow-mode' : 'border-mode'
  await page.addInitScript(
    ({ dark, boxMode }) => {
      document.addEventListener(
        'DOMContentLoaded',
        () => {
          document.documentElement.classList.toggle('dark', dark)
          document.documentElement.dataset.boxMode = boxMode
        },
        { once: true }
      )
    },
    { dark, boxMode }
  )
  await page.goto('/tests/e2e/fixtures/smis-record-link.html')

  const rescue = page.getByRole('button', {
    name: '华东区域综合应急救援预案（2026 年修订版）',
    exact: true
  })
  await expect(rescue).toHaveAttribute(
    'title',
    '查看应急救援预案：华东区域综合应急救援预案（2026 年修订版）'
  )
  await expect(page.getByText('ERP-2026-001', { exact: true })).toBeVisible()
  await rescue.focus()
  await expect(rescue).toBeFocused()
  await rescue.click()
  await expect(page.getByLabel('已选记录')).toHaveText('ERP-2026-001')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
  await page.screenshot({
    path: testInfo.outputPath('record-links.png'),
    animations: 'disabled',
    fullPage: true
  })
})
