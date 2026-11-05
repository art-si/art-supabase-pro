import { expect, test } from '@playwright/test'

test('business displays use dictionary labels from the current store', async ({
  page
}, testInfo) => {
  const response = await page.goto('/tests/e2e/fixtures/dictionary-business-display.html')
  expect(response?.status()).toBe(200)

  const certificate = page.getByRole('button', { name: /测试车辆.*审车年检（字典）/ })
  await expect(certificate).toBeVisible()
  await expect(certificate).toContainText('审车年检（字典）')
  await page.screenshot({ path: testInfo.outputPath('dictionary-certificate-display.png') })

  await page.getByRole('button', { name: '打开流程模板库' }).click()
  const dialog = page.getByRole('dialog', { name: '模板库' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: /财务审批（字典）/ })).toBeVisible()
  await dialog.getByRole('button', { name: /财务审批（字典）/ }).click()
  await expect(dialog.locator('.workflow-template-library__content header strong')).toHaveText(
    '财务审批（字典）'
  )
  await page.screenshot({ path: testInfo.outputPath('dictionary-template-category.png') })
})

test('template library stays usable when category dictionary is empty', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/dictionary-business-display.html?mode=empty')
  await page.getByRole('button', { name: '打开流程模板库' }).click()
  const dialog = page.getByRole('dialog', { name: '模板库' })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.workflow-template-library__categories button')).toHaveCount(1)
  await expect(dialog.getByRole('button', { name: /销售合同审批/ })).toBeVisible()
})

test('template categories appear after dictionary loading', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/dictionary-business-display.html?mode=loading')
  await page.getByRole('button', { name: '打开流程模板库' }).click()
  const dialog = page.getByRole('dialog', { name: '模板库' })
  await expect(dialog.locator('.workflow-template-library__categories button')).toHaveCount(1)
  await page.evaluate(() =>
    (window as Window & { releaseDictionaryFixture: () => void }).releaseDictionaryFixture()
  )
  await expect(dialog.getByRole('button', { name: /财务审批（字典）/ })).toBeVisible()
})

test('long dictionary labels remain readable at narrow desktop width', async ({
  page
}, testInfo) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await page.goto('/tests/e2e/fixtures/dictionary-business-display.html?mode=long')
  await expect(page.getByText('审车年检与车辆技术状态联合检验项目（字典长文案）')).toBeVisible()
  await page.getByRole('button', { name: '打开流程模板库' }).click()
  const dialog = page.getByRole('dialog', { name: '模板库' })
  await expect(dialog).toContainText('财务审批与跨组织资金协同流程（字典长文案）')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1024)
  await page.screenshot({ path: testInfo.outputPath('dictionary-long-labels-1024.png') })
})
