import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

for (const stage of ['script', 'plugin'] as const) {
  test(`地图 ${stage} 加载超时后清理并允许重试`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.clock.install()
    await page.addInitScript((stage) => {
      if (stage === 'script') {
        document.addEventListener(
          'DOMContentLoaded',
          () => {
            const append = document.head.appendChild.bind(document.head)
            document.head.appendChild = <T extends Node>(node: T): T => {
              if (node instanceof HTMLScriptElement && node.dataset.artAmap === 'true') {
                // Keep the real loader's DOM lifecycle without making an external request.
                node.type = 'application/x-synthetic-map-test'
                if (document.documentElement.dataset.sdkMode === 'success') {
                  Object.defineProperty(window, 'AMap', {
                    value: { Geocoder: class {} },
                    configurable: true
                  })
                  queueMicrotask(() => node.dispatchEvent(new Event('load')))
                }
              }
              return append(node)
            }
          },
          { once: true }
        )
      } else {
        const amap = {
          plugin(_names: string[], callback: () => void) {
            if (document.documentElement.dataset.sdkMode !== 'success') return
            Object.assign(amap, { Geocoder: class {} })
            callback()
          }
        }
        Object.defineProperty(window, 'AMap', { value: amap, configurable: true })
      }
    }, stage)
    await page.goto('/tests/e2e/fixtures/geocode-timeout.html?mode=sdk')
    const action = page.getByRole('button', { name: '加载地图', exact: true })
    await action.click()
    await expect(action).toBeDisabled()
    await page.clock.fastForward(stage === 'script' ? 10_001 : 8001)
    await expect(page.getByTestId('result')).toContainText('加载超时')
    await expect(action).toBeEnabled()
    if (stage === 'script') await expect(page.locator('script[data-art-amap]')).toHaveCount(0)
    await page.evaluate(() => {
      document.documentElement.dataset.sdkMode = 'success'
    })
    await action.click()
    await expect(page.getByTestId('result')).toHaveText('地图服务已就绪')
    await expect(action).toBeEnabled()
    expect(errors).toEqual([])
  })
}
