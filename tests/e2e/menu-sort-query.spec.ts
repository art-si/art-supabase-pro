import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const outcome of ['success', 'denied', 'server-error'] as const) {
  test(`菜单排序限制并发并保留${outcome}结果`, async ({ page }) => {
    let active = 0
    let maxActive = 0
    const ids: string[] = []
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/sys_menu?**', async (route) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      const url = new URL(route.request().url())
      const id = url.searchParams.get('id')
      ids.push(id || '')
      expect(route.request().method()).toBe('PATCH')
      expect(route.request().postDataJSON()).toEqual({ sort: Number(id?.replace('eq.menu-', '')) })
      await new Promise((resolve) => setTimeout(resolve, 150))
      active -= 1
      if (outcome === 'server-error' && id === 'eq.menu-0') {
        await route.fulfill({ status: 403, json: { code: '42501', message: 'permission denied' } })
      } else {
        await route.fulfill({
          status: 204,
          headers: {
            'content-range': outcome === 'denied' && id === 'eq.menu-0' ? '*/0' : '*/1',
            'access-control-expose-headers': 'content-range'
          }
        })
      }
    })
    await page.goto('/tests/e2e/fixtures/menu-sort-query.html')
    await page.getByRole('button', { name: '保存排序' }).click()
    await expect(page.getByTestId('menu-sort-result')).toHaveText(
      outcome === 'success' ? '保存成功' : '保存失败'
    )
    expect(ids).toHaveLength(7)
    expect(maxActive).toBeLessThanOrEqual(3)
    expect(maxActive).toBeGreaterThan(1)
    expect(active).toBe(0)
    expect(errors).toEqual([])
  })
}
