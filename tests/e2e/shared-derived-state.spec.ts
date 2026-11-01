import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(90_000)

for (const multiple of [false, true]) {
  test(`资源${multiple ? '多选' : '单选'}保留父级模型、选择上限和租户重置`, async ({
    page
  }, info) => {
    await prepareIsolatedSession(page)
    const errors: string[] = []
    const requests: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/sys_attachment?*', (route) => {
      requests.push(route.request().url())
      return route.fulfill({
        headers: { 'content-range': '0-2/3' },
        json: ['a', 'b', 'c'].map((key, index) => ({
          id: index + 1,
          tenant_id: '11111111-1111-4111-8111-111111111111',
          origin_name: `测试资源${key.toUpperCase()}`,
          mime_type: 'application/pdf',
          suffix: 'pdf',
          url: `https://example.test/resource-${key}.pdf`
        }))
      })
    })
    await page.goto(`/tests/e2e/fixtures/shared-derived-state.html${multiple ? '?multiple' : ''}`)
    const state = page.getByTestId('selection-state')
    const a = page.getByRole('button', { name: '选择资源 测试资源A', exact: true })
    const b = page.getByRole('button', { name: '选择资源 测试资源B', exact: true })
    const c = page.getByRole('button', { name: '选择资源 测试资源C', exact: true })
    await expect(a).toBeVisible()
    await a.click()
    await expect(a).toHaveAttribute('aria-pressed', 'true')
    await expect(state).toContainText('"updates":1')
    if (multiple) await expect(state).toContainText('"originalModel":[]')
    await b.click()
    await expect(b).toHaveAttribute('aria-pressed', 'true')
    await expect(a).toHaveAttribute('aria-pressed', multiple ? 'true' : 'false')
    if (multiple) {
      await c.click()
      await expect(c).toHaveAttribute('aria-pressed', 'false')
      await expect(page.getByText('最多只能选择 2 个资源')).toBeVisible()
      await expect(state).toContainText('"updates":2')
    }
    await page.getByRole('button', { name: '确认', exact: true }).click()
    await expect(state).toContainText(
      multiple
        ? '"confirmed":["https://example.test/resource-a.pdf","https://example.test/resource-b.pdf"]'
        : '"confirmed":["https://example.test/resource-b.pdf"]'
    )
    await page.getByRole('button', { name: '清空外部选择', exact: true }).click()
    await expect(a).toHaveAttribute('aria-pressed', 'false')
    await expect(b).toHaveAttribute('aria-pressed', 'false')
    await page.getByRole('button', { name: '外部选择第二项', exact: true }).click()
    await expect(b).toHaveAttribute('aria-pressed', 'true')
    await page.screenshot({
      path: info.outputPath('resource-selection.png'),
      animations: 'disabled'
    })
    await page.getByRole('button', { name: '切换资源租户', exact: true }).click()
    await expect(b).toHaveAttribute('aria-pressed', 'false')
    await expect.poll(() => requests.at(-1)).toContain('22222222-2222-4222-8222-222222222222')
    expect(errors).toEqual([])
  })
}

for (const width of [1440, 900]) {
  test(`返回顶部按钮随实际滚动位置派生 ${width}`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/tests/e2e/fixtures/shared-derived-state.html?mode=scroll')
    const button = page.getByRole('button', { name: '返回页面顶部' })
    const viewport = page.locator('#app-main .app-main__scroll-wrap')
    await expect(button).toBeHidden()
    await viewport.evaluate((element) => {
      element.scrollTop = 300
    })
    await expect(button).toBeHidden()
    await viewport.evaluate((element) => {
      element.scrollTop = 500
    })
    await expect(button).toBeVisible()
    await page.screenshot({ path: info.outputPath('back-to-top.png'), animations: 'disabled' })
    await button.click()
    await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBe(0)
    await expect(button).toBeHidden()
  })
}
