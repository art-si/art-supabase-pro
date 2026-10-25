import { expect, test } from '@playwright/test'
import { mockDeviceGeolocation } from './support/mock-device-geolocation'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)
test.beforeEach(async ({ page }) => {
  await prepareIsolatedSession(page)
  await page.clock.install()
  await mockDeviceGeolocation(page)
})

for (const surface of ['dialog', 'drawer']) {
  test(`${surface} 关闭后旧定位不能回填，重新打开可立即定位`, async ({ page }) => {
    await page.goto(`/tests/e2e/fixtures/device-location-lifecycle.html?surface=${surface}`, {
      waitUntil: 'domcontentloaded'
    })
    await page.getByRole('button', { name: '打开定位表单', exact: true }).click()
    await page.getByRole('button', { name: '定位当前位置', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-location-requests', '1')
    await page.getByRole('button', { name: '取消', exact: true }).click()
    await page.clock.runFor(400)
    await page.evaluate(() =>
      document.dispatchEvent(new CustomEvent('device-location-result', { detail: { request: 1 } }))
    )
    await page.clock.runFor(32)
    await expect(page.getByTestId('form-state')).toContainText('"address":""')
    await expect(page.getByTestId('form-state')).toContainText('"successes":0')
    await expect(page.locator('.el-message')).toHaveCount(0)
    await page.getByRole('button', { name: '打开定位表单', exact: true }).click()
    const locate = page.getByRole('button', { name: '定位当前位置', exact: true })
    await expect(locate).toBeEnabled()
    await locate.click()
    await expect(page.locator('html')).toHaveAttribute('data-location-requests', '2')
    await page.evaluate(() =>
      document.dispatchEvent(new CustomEvent('device-location-result', { detail: { request: 2 } }))
    )
    await expect(page.getByTestId('form-state')).toContainText('"longitude":120.1234568')
  })
}

test('重置或切换到空白记录后，旧定位不能覆盖新表单', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/device-location-lifecycle.html', {
    waitUntil: 'domcontentloaded'
  })
  await page.getByRole('button', { name: '打开定位表单', exact: true }).click()
  for (const action of ['重置表单', '切换记录']) {
    const request = action === '重置表单' ? 1 : 2
    await page.getByRole('button', { name: '定位当前位置', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-location-requests', String(request))
    await page.getByRole('button', { name: action, exact: true }).click()
    await page.evaluate(
      (request) =>
        document.dispatchEvent(new CustomEvent('device-location-result', { detail: { request } })),
      request
    )
    await page.clock.runFor(32)
    await expect(page.getByTestId('form-state')).toContainText('"address":""')
    await expect(page.getByRole('button', { name: '定位当前位置', exact: true })).toBeEnabled()
  }
})

test('手工修改和卸载组件不会被旧定位或旧失败反馈覆盖', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/device-location-lifecycle.html?surface=inline', {
    waitUntil: 'domcontentloaded'
  })
  await page.getByRole('button', { name: '定位当前位置', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-location-requests', '1')
  await page.getByRole('textbox', { name: '详细地址', exact: true }).fill('用户手工地址')
  await page.evaluate(() =>
    document.dispatchEvent(new CustomEvent('device-location-result', { detail: { request: 1 } }))
  )
  await page.clock.runFor(32)
  await expect(page.getByTestId('form-state')).toContainText('"address":"用户手工地址"')
  await page.getByRole('button', { name: '定位当前位置', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-location-requests', '2')
  await page.getByRole('button', { name: '卸载地址组件', exact: true }).click()
  await page.evaluate(() =>
    document.dispatchEvent(
      new CustomEvent('device-location-result', {
        detail: { request: 2, failed: true, message: 'permission denied' }
      })
    )
  )
  await page.clock.runFor(32)
  await expect(page.locator('.el-message')).toHaveCount(0)
})

test('SDK 无回调会恢复操作，超时后的旧结果不回填', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/device-location-lifecycle.html?surface=inline', {
    waitUntil: 'domcontentloaded'
  })
  const locate = page.getByRole('button', { name: '定位当前位置', exact: true })
  await locate.click()
  await expect(page.locator('html')).toHaveAttribute('data-location-requests', '1')
  await page.clock.fastForward(12_001)
  await expect(locate).toBeEnabled()
  await expect(page.locator('.el-message--warning')).toContainText('定位超时')
  await page.evaluate(() =>
    document.dispatchEvent(new CustomEvent('device-location-result', { detail: { request: 1 } }))
  )
  await page.clock.runFor(32)
  await expect(page.getByTestId('form-state')).toContainText('"address":""')
})

test('未知 SDK 失败只显示可操作的中文反馈', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/device-location-lifecycle.html?surface=inline', {
    waitUntil: 'domcontentloaded'
  })
  await page.getByRole('button', { name: '定位当前位置', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-location-requests', '1')
  await page.evaluate(() =>
    document.dispatchEvent(
      new CustomEvent('device-location-result', {
        detail: { request: 1, failed: true, message: 'SDK_INTERNAL_ERROR' }
      })
    )
  )
  await expect(page.locator('.el-message--warning')).not.toContainText('SDK_INTERNAL_ERROR')
  await expect(page.locator('.el-message--warning')).toContainText(/重试|地图选点/)
})

test('并发调用复用定位请求，所有调用方都等到结果', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/device-location-lifecycle.html?surface=inline', {
    waitUntil: 'domcontentloaded'
  })
  await page.getByRole('button', { name: '定位当前位置', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-location-requests', '1')
  await page.getByRole('button', { name: '静默定位', exact: true }).click()
  await page.clock.runFor(32)
  await expect(page.getByTestId('form-state')).toContainText('"completedWaiters":0')
  await expect(page.locator('html')).toHaveAttribute('data-location-requests', '1')
  await page.evaluate(() =>
    document.dispatchEvent(new CustomEvent('device-location-result', { detail: { request: 1 } }))
  )
  await expect(page.getByTestId('form-state')).toContainText('"completedWaiters":1')
  await expect(page.getByTestId('form-state')).toContainText('"successes":1')
})

test('SDK 加载超时后不再启动过期定位，当前表单仍可重试', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/device-location-lifecycle.html?surface=inline&holdSdk', {
    waitUntil: 'domcontentloaded'
  })
  const locate = page.getByRole('button', { name: '定位当前位置', exact: true })
  await locate.click()
  await expect(page.locator('html')).toHaveAttribute('data-sdk-requests', '1')
  await page.clock.runFor(12_050)
  await expect(locate).toBeEnabled()
  await page.evaluate(() =>
    document.dispatchEvent(
      new CustomEvent('sdk-result', {
        detail: { request: 1 }
      })
    )
  )
  await page.clock.runFor(32)
  await expect(page.locator('html')).not.toHaveAttribute('data-location-requests')
  await locate.click()
  await expect(page.locator('html')).toHaveAttribute('data-sdk-requests', '2')
  await page.evaluate(() =>
    document.dispatchEvent(
      new CustomEvent('sdk-result', {
        detail: { request: 2 }
      })
    )
  )
  await expect(page.locator('html')).toHaveAttribute('data-location-requests', '1')
  await page.evaluate(() =>
    document.dispatchEvent(
      new CustomEvent('device-location-result', {
        detail: { request: 1 }
      })
    )
  )
  await expect(page.getByTestId('form-state')).toContainText('"longitude":120.1234568')
})
