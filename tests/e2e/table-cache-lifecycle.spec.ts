import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const enabled of [true, false]) {
  test(`表格缓存 ${enabled ? '启用' : '关闭'} 时的读取、过期和卸载任务`, async ({ page }) => {
    await page.clock.install()
    await page.addInitScript(() => {
      const timers = new Set<number>()
      const start = window.setInterval.bind(window)
      const stop = window.clearInterval.bind(window)
      window.setInterval = (handler, timeout, ...args) => {
        const timer = start(handler, timeout, ...args)
        // Track this fixture's 1-second cache cleanup, excluding unrelated page intervals.
        if (timeout === 1000) timers.add(timer)
        document.documentElement.dataset.cacheTimers = String(timers.size)
        return timer
      }
      window.clearInterval = (timer) => {
        if (timer !== undefined) timers.delete(timer)
        document.documentElement.dataset.cacheTimers = String(timers.size)
        stop(timer)
      }
      document.addEventListener('DOMContentLoaded', () => {
        document.documentElement.dataset.cacheTimers = String(timers.size)
      })
    })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`/tests/e2e/fixtures/table-cache-lifecycle.html${enabled ? '' : '?no-cache'}`)
    await expect(page.getByLabel('请求次数')).toHaveText('1')
    await expect(page.getByLabel('数据条数')).toHaveText('1')
    await expect(page.getByLabel('缓存条数')).toHaveText(enabled ? '1' : '0')
    await expect(page.locator('html')).toHaveAttribute('data-cache-timers', enabled ? '1' : '0')
    await page.getByRole('button', { name: '读取当前页' }).click()
    await expect(page.getByLabel('请求次数')).toHaveText(enabled ? '1' : '2')
    await page.clock.fastForward(3100)
    await expect(page.getByLabel('缓存条数')).toHaveText('0')
    await page.getByRole('button', { name: '读取当前页' }).click()
    await expect(page.getByLabel('请求次数')).toHaveText(enabled ? '2' : '3')
    await page.getByRole('button', { name: '切换表格' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-cache-timers', '0')
    await page.clock.fastForward(10_000)
    await expect(page.getByLabel('请求次数')).toHaveText(enabled ? '2' : '3')
    await page.getByRole('button', { name: '切换表格' }).click()
    await expect(page.getByLabel('请求次数')).toHaveText(enabled ? '3' : '4')
    await expect(page.locator('html')).toHaveAttribute('data-cache-timers', enabled ? '1' : '0')
    expect(errors).toEqual([])
  })
}
