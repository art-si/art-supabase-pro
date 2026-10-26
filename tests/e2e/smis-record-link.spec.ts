import { expect, test } from '@playwright/test'
import { captureBusinessEvidence } from './support/capture-business-evidence'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

test('SMIS 记录链接统一标题、编号、键盘焦点和点击反馈', async ({ page }, testInfo) => {
  const dark = testInfo.project.name.includes('dark')
  const boxMode = testInfo.project.name.includes('shadow') ? 'shadow-mode' : 'border-mode'
  const parameters = new URLSearchParams({ theme: dark ? 'dark' : 'light', box: boxMode })
  await page.goto(`/tests/e2e/fixtures/smis-record-link.html?${parameters}`)

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
  const sources = page.getByRole('region', { name: '来源编号截断验收' })
  await expect(sources).toHaveCount(3)
  for (const [index, hint] of [
    '查看来源单据详情',
    '暂无来源单据查看权限',
    '查看来源采购入库'
  ].entries()) {
    const control = sources.nth(index).locator('button, strong, a')
    const label = (await control.innerText()).trim()
    await expect(control).toHaveAttribute('title', `${label} · ${hint}`)
    expect(
      await control.locator('span').evaluate((element) => element.scrollWidth > element.clientWidth)
    ).toBe(true)
  }
  const sourceButton = sources.first().getByRole('button')
  await sourceButton.focus()
  await expect(sourceButton).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByLabel('已选记录')).toHaveText('CWYF-20261025-000000000000000001')
  await expect(sources.nth(1).getByRole('button')).toHaveCount(0)
  await expect(sources.nth(1).getByRole('link')).toHaveCount(0)
  const sourceRoute = sources.nth(2).getByRole('link')
  await expect(sourceRoute).toHaveAttribute('href', '/source')
  await sourceRoute.focus()
  await expect(sourceRoute).toBeFocused()
  await captureBusinessEvidence(page, {
    path: testInfo.outputPath('record-links.png'),
    fullPage: true
  })
})
