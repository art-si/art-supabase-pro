import { expect, test } from '@playwright/test'
test.use({ storageState: { cookies: [], origins: [] } })

test('治理弹窗重开后旧候选不覆盖当前候选', async ({ page }) => {
  let reads = 0
  let releaseOld: (() => void) | undefined
  const held = new Promise<void>((resolve) => {
    releaseOld = resolve
  })
  const oldResponses: Promise<unknown>[] = []
  page.on('response', (response) => {
    if (response.url().includes('/rest/v1/sys_user?')) oldResponses.push(response.finished())
  })
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/sys_user?**', async (route) => {
    const index = ++reads
    if (index <= 2) await held
    await route.fulfill({
      headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' },
      json: [
        {
          id: index <= 2 ? 'old-user' : 'new-user',
          user_name: index <= 2 ? '旧责任人' : '新责任人',
          user_email: 'test@example.invalid'
        }
      ]
    })
  })
  await page.goto('/tests/e2e/fixtures/governance-user-state.html')
  await page.getByRole('button', { name: '配置责任人', exact: true }).click()
  await expect.poll(() => reads).toBe(2)
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(dialog).toBeHidden()
  await page.getByRole('button', { name: '配置责任人', exact: true }).click()
  await expect.poll(() => reads).toBe(4)
  await dialog.getByRole('combobox', { name: /数据责任人/ }).click()
  await expect(page.getByRole('option', { name: /新责任人/ })).toBeVisible()
  releaseOld?.()
  await expect.poll(() => oldResponses.length).toBe(4)
  await Promise.all(oldResponses)
  await expect(page.getByRole('option', { name: /新责任人/ })).toBeVisible()
  await expect(page.getByRole('option', { name: /旧责任人/ })).toHaveCount(0)
})

test('治理人员失败原位重试并阻止错误状态保存', async ({ page }) => {
  let failure = true
  const writes: string[] = []
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) => {
    if (route.request().method() === 'POST') writes.push(route.request().url())
    return route.fulfill({ json: [] })
  })
  await page.route('**/rest/v1/sys_user?**', (route) =>
    failure
      ? route.fulfill({ status: 503, json: { code: 'XX000', message: 'unavailable' } })
      : route.fulfill({
          headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' },
          json: [{ id: 'user-a', user_name: '测试责任人', user_email: 'test@example.invalid' }]
        })
  )
  await page.goto('/tests/e2e/fixtures/governance-user-state.html')
  await page.getByRole('button', { name: '配置责任人', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('选项加载失败', { exact: true })).toHaveCount(2)
  await dialog.getByRole('button', { name: '保存配置', exact: true }).click()
  expect(writes).toEqual([])
  failure = false
  await dialog.getByRole('button', { name: '重新加载', exact: true }).first().click()
  await dialog.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(dialog.getByText('选项加载失败', { exact: true })).toHaveCount(0)
  await dialog.getByRole('combobox', { name: /数据责任人/ }).click()
  await page.getByRole('option', { name: /测试责任人/ }).click()
  await expect(dialog.getByText('测试责任人 · test@example.invalid', { exact: true })).toBeVisible()
  await page.screenshot({
    path: test.info().outputPath('governance-users.png'),
    animations: 'disabled'
  })
  expect(await dialog.evaluate((el) => el.scrollWidth > el.clientWidth + 1)).toBe(false)
  expect(errors).toEqual([])
})
