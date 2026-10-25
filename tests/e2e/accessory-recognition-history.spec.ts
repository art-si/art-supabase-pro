import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'sb-ckbftoopuyophiebamwy-auth-token',
      JSON.stringify({
        access_token: 'a.b.c',
        refresh_token: 'test-refresh',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'bearer',
        user: { id: 'test-auth', aud: 'authenticated', role: 'authenticated' }
      })
    )
  })
  await page.route('**/auth/v1/user', (route) =>
    route.fulfill({ json: { id: 'test-auth', aud: 'authenticated', role: 'authenticated' } })
  )
  await page.route('**/rest/v1/**', (route) =>
    route.fulfill({
      headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' },
      json: []
    })
  )
})
test('识别历史完整翻页并原位重试', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  let failure = false
  await page.route('**/rest/v1/ai_artifact_review?**', (route) => {
    const url = new URL(route.request().url())
    expect(url.searchParams.get('tenant_id')).toBe('eq.tenant-a')
    expect(url.searchParams.get('order')).toBe('create_time.desc,id.asc')
    expect(url.searchParams.get('limit')).toBe('12')
    expect(route.request().headers().prefer).toContain('count=exact')
    const offset = Number(url.searchParams.get('offset'))
    if (failure) return route.fulfill({ status: 503, json: { message: 'unavailable' } })
    const length = Math.min(12, 61 - offset)
    return route.fulfill({
      headers: {
        'content-range': `${offset}-${offset + length - 1}/61`,
        'access-control-expose-headers': 'content-range'
      },
      json: Array.from({ length }, (_, index) => ({
        id: `history-${offset + index}`,
        tenant_id: 'tenant-a',
        create_time: '2026-10-06',
        proposed_payload: { projectName: `历史项目 ${offset + index + 1}`, items: [] },
        metadata: {},
        confidence: 1,
        warnings: []
      }))
    })
  })
  await page.goto('/tests/e2e/fixtures/accessory-recognition-history.html')
  await expect(page.getByRole('button', { name: /历史项目 1 / })).toBeVisible()
  const next = page.getByRole('button', { name: /next page|下一页/i })
  for (let index = 0; index < 5; index++) {
    await next.click()
    await expect(
      page.getByRole('button', { name: new RegExp(`历史项目 ${12 * (index + 1) + 1} `) })
    ).toBeVisible()
  }
  await expect(next).toBeDisabled()
  failure = true
  await page.getByRole('button', { name: '刷新记录', exact: true }).click()
  await expect(page.getByText('识别记录加载失败，请重试', { exact: true })).toBeVisible()
  failure = false
  await page.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(page.getByRole('button', { name: /历史项目 61 / })).toBeVisible()
  expect(errors).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('recognition-history.png'), fullPage: true })
})

for (const oldFailure of [false, true]) {
  test(`识别历史切租户后迟到${oldFailure ? '错误' : '记录'}不覆盖新状态`, async ({ page }) => {
    let releaseOld: (() => void) | undefined
    const held = new Promise<void>((resolve) => {
      releaseOld = resolve
    })
    let oldStarted = false
    const finished: Promise<unknown>[] = []
    page.on('response', (response) => {
      if (response.url().includes('/rest/v1/ai_artifact_review?'))
        finished.push(response.finished())
    })
    await page.route('**/rest/v1/ai_artifact_review?**', async (route) => {
      const old = new URL(route.request().url()).searchParams.get('tenant_id') === 'eq.tenant-a'
      if (old) {
        oldStarted = true
        await held
      }
      if (old && oldFailure) return route.fulfill({ status: 503, json: { message: 'unavailable' } })
      return route.fulfill({
        headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' },
        json: [
          {
            id: old ? 'old' : 'new',
            tenant_id: old ? 'tenant-a' : 'tenant-b',
            create_time: '2026-10-06',
            proposed_payload: { projectName: old ? '旧租户历史' : '新租户历史', items: [] },
            metadata: {},
            confidence: 1,
            warnings: []
          }
        ]
      })
    })
    await page.goto('/tests/e2e/fixtures/accessory-recognition-history.html')
    await expect.poll(() => oldStarted).toBe(true)
    await page.getByRole('button', { name: '切换测试租户', exact: true }).click()
    await expect(page.getByRole('button', { name: /新租户历史/ })).toBeVisible()
    releaseOld?.()
    await expect.poll(() => finished.length).toBe(2)
    await Promise.all(finished)
    await expect(page.getByRole('button', { name: /新租户历史/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /旧租户历史/ })).toHaveCount(0)
    await expect(page.getByText('识别记录加载失败，请重试', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '刷新记录', exact: true })).toBeEnabled()
  })
}
