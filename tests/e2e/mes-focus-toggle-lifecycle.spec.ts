import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)

for (const gantt of [false, true]) {
  test(`${gantt ? '甘特排程' : '排程'}专注开关保留挂载`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname
      return route.fulfill({
        json: path.endsWith('/sys_tenant')
          ? [
              {
                id: '11111111-1111-4111-8111-111111111111',
                tenant_name: '测试租户',
                tenant_code: 'test',
                status: '1'
              }
            ]
          : path.endsWith('/rpc/mes_scheduling_context')
            ? { shifts: [] }
            : [],
        headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' }
      })
    })
    await page.goto(`/tests/e2e/fixtures/mes-scheduling-lifecycle.html${gantt ? '?gantt=1' : ''}`)
    const hero = page.locator('.business-workspace-header')
    const work = page.locator(gantt ? '.gantt-page__board' : '.scheduling-page__task-card').first()
    await expect(hero).toBeVisible({ timeout: 60_000 })
    await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
    await expect(hero).toBeHidden()
    await expect(work).toBeVisible()
    await work.screenshot({ path: info.outputPath('focus-workspace.png'), animations: 'disabled' })
    await page.getByRole('switch', { name: '退出专注模式', exact: true }).locator('..').click()
    await expect(hero).toBeVisible()
    await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
    await page.keyboard.press('Escape')
    await expect(hero).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
    ).toBe(true)
    expect(errors).toEqual([])
  })
}
