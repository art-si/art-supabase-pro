import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { installDictionaryOptions } from './support/dictionary-options'

test.use({ storageState: { cookies: [], origins: [] } })
test('人力风险空态和错误重试保持完整工作区', async ({ page }, testInfo) => {
  await prepareIsolatedSession(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  let failed = true
  await page.route('**/rest/v1/**', (route) =>
    route.fulfill({ status: failed ? 503 : 200, json: failed ? { message: '服务暂时不可用' } : {} })
  )
  await installDictionaryOptions(page, {
    hrWorkforceRiskFilter: [
      { value: 'all', label: '全部' },
      { value: 'contract', label: '合同' },
      { value: 'qualification', label: '资质' },
      { value: 'probation', label: '试用期' },
      { value: 'headcount', label: '编制' }
    ]
  })
  await page.goto('/tests/e2e/fixtures/hr-talent-inventory.html?page=risk')
  const workspace = page.locator('.workforce-risk-page__workspace')
  await expect(workspace.getByRole('button', { name: '重新加载' })).toBeVisible()
  expect(await workspace.evaluate((element) => element.getBoundingClientRect().bottom)).toBeCloseTo(
    784,
    0
  )
  failed = false
  await workspace.getByRole('button', { name: '重新加载' }).click()
  await expect(
    workspace.getByText('当前筛选范围没有需要处置的人力风险', { exact: true })
  ).toBeVisible()
  expect(await workspace.evaluate((element) => element.getBoundingClientRect().bottom)).toBeCloseTo(
    784,
    0
  )
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)
  ).toBeLessThanOrEqual(1)
  await page.screenshot({
    path: testInfo.outputPath('workforce-risk-empty.png'),
    animations: 'disabled'
  })
})
