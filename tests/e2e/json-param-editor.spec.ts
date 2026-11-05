import { expect, test } from '@playwright/test'

const fixture = '/tests/e2e/fixtures/json-param-editor.html'

test('JSON 注释不标红且保留高亮，应用后保存严格 JSON', async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  const response = await page.goto(fixture, { waitUntil: 'domcontentloaded' })
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('button', { name: '编辑外观配置' })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: '编辑外观配置' }).click()
  await expect(page.locator('.monaco-editor')).toBeVisible()

  const initialDraft = await page.evaluate(() => window.jsonParamEditorFixture.getDraft())
  expect(initialDraft.startsWith('{')).toBe(true)
  expect(initialDraft).toMatch(/\/\/ 自动专注浏览[^\n]*\n {2}"globalFocusMode": true/)
  expect(initialDraft).toMatch(/\/\/ 侧边菜单展开宽度[^\n]*\n {2}"menuOpenWidth"/)
  expect(initialDraft).toMatch(/\/\/ 主导航布局[^\n]*\n {2}"menuType"/)
  expect(await page.evaluate(() => window.jsonParamEditorFixture.getLanguage())).toBe('json')
  const tokenColors = await page
    .locator('.monaco-editor .view-line span[class*="mtk"]')
    .evaluateAll((items) => [...new Set(items.map((item) => getComputedStyle(item).color))])
  expect(tokenColors.length).toBeGreaterThan(1)
  await page.waitForTimeout(500)
  expect(await page.evaluate(() => window.jsonParamEditorFixture.getSyntaxErrors())).toEqual([])
  await expect(page.locator('.monaco-editor .squiggly-error')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    testInfo.project.use.viewport!.width
  )
  await page.screenshot({ path: testInfo.outputPath('json-appearance-comments.png') })

  await page.evaluate(() =>
    window.jsonParamEditorFixture.setDraft('{ // 注释\n "globalFocusMode": tru }')
  )
  await expect(page.getByRole('button', { name: '应用内容' })).toBeDisabled()
  await page.evaluate(() =>
    window.jsonParamEditorFixture.setDraft('{ // 注释\n "globalFocusMode": false }')
  )
  await expect(page.getByRole('button', { name: '应用内容' })).toBeEnabled()
  await page.getByRole('button', { name: '应用内容' }).click()
  await expect(page.getByTestId('applied-value')).toHaveText('{\n  "globalFocusMode": false\n}')

  await page.getByRole('button', { name: '编辑网站配置' }).click()
  await expect(page.locator('.monaco-editor')).toBeVisible()
  const otherDraft = await page.evaluate(() => window.jsonParamEditorFixture.getDraft())
  expect(otherDraft).toContain('// 启用网站配置；可选值：true、false；类型：布尔值')
  expect(otherDraft).toContain('// 渠道唯一键，如 wechat、dingtalk、google；类型：字符串')
  expect(otherDraft).toMatch(/"enabled": true/)
  await page.keyboard.press('Escape')
  await expect(page.locator('.el-drawer')).toBeHidden()

  await page.getByRole('button', { name: '编辑围栏配置' }).click()
  await expect(page.locator('.monaco-editor')).toBeVisible()
  const geofenceDraft = await page.evaluate(() => window.jsonParamEditorFixture.getDraft())
  expect(geofenceDraft).toContain('// 启用电子围栏策略；可选值：true、false；类型：布尔值')
  expect(geofenceDraft).toContain('// 装货打卡半径，单位米；类型：数字')
  expect(pageErrors).toEqual([])
})
