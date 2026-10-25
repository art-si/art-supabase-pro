import { expect, test } from '@playwright/test'

test('新标签页清空字典缓存后重新加载完整字典，规划选项显示中文', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  await page.addInitScript(() => {
    for (const key of Object.keys(localStorage)) {
      if (!/^sys-v.+-user$/.test(key)) continue
      const user = JSON.parse(localStorage.getItem(key) || '{}')
      localStorage.setItem(key, JSON.stringify({ ...user, dictMap: {} }))
    }
  })
  await page.goto('#/system/ai-project-planner', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.ai-planner')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('.ai-planner__controls .el-select').last()).toContainText('不限', {
    timeout: 30_000
  })
  await page.locator('.ai-planner__controls .el-select').last().click()
  for (const label of ['小', '中', '大', '不限']) {
    await expect(page.getByRole('option', { name: label, exact: true })).toBeVisible()
  }
  await page.keyboard.press('Escape')
  const dictionaryCount = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((key) => /^sys-v.+-user$/.test(key))
    const user = JSON.parse(localStorage.getItem(key || '') || '{}')
    return Object.values(user.dictMap || {}).reduce<number>(
      (total, items) => total + (Array.isArray(items) ? items.length : 0),
      0
    )
  })
  expect(dictionaryCount).toBeGreaterThan(1000)
  await page.screenshot({
    path: testInfo.outputPath('dictionary-restored.png'),
    mask: [page.locator('.art-header-bar img[alt="用户头像"]')],
    maskColor: '#808080'
  })
})
