import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

test('自动选位数量切换后返回原值不接受旧推荐', async ({ page }, testInfo) => {
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  let releaseCurrent!: () => void
  const currentPending = new Promise<void>((resolve) => {
    releaseCurrent = resolve
  })
  let attempts = 0
  await page.route('**/rpc/wms_recommend_bin_secure', async (route) => {
    const attempt = ++attempts
    if (attempt === 1) await pending
    else await currentPending
    await route.fulfill({ json: attempt === 1 ? 'old-bin' : 'new-bin' })
  })
  await page.goto('/tests/e2e/fixtures/wms-operation-retry.html?binPicker')
  const recommend = page.getByRole('button', { name: '自动选位', exact: true })
  await recommend.click()
  await expect.poll(() => attempts).toBe(1)
  const change = page.getByRole('button', { name: '切换选位数量', exact: true })
  await change.click()
  await expect(page.getByText('选位数量 3', { exact: true })).toBeVisible()
  await change.click()
  await expect(page.getByText('选位数量 2', { exact: true })).toBeVisible()
  await recommend.click()
  await expect.poll(() => attempts).toBe(2)
  const response = page.waitForResponse('**/rpc/wms_recommend_bin_secure')
  release()
  await response
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
  await expect(recommend).toHaveClass(/is-loading/)
  await expect(
    page.locator('#operation-preview').getByText('OLD · 旧推荐库位', { exact: true })
  ).toHaveCount(0)
  await expect(page.getByText(/已选库位 OLD/)).toHaveCount(0)
  releaseCurrent()
  await expect(
    page.locator('#operation-preview').getByText('NEW · 当前推荐库位', { exact: true })
  ).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('current-recommendation.png'),
    animations: 'disabled'
  })
})
