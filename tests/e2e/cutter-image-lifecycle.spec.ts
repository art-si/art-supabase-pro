import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5u0AAAAASUVORK5CYII=',
  'base64'
)

for (const cancellation of ['replace', 'clear', 'unmount']) {
  for (const outcome of ['complete', 'reject']) {
    test(`裁剪预加载 ${cancellation} 后旧图片 ${outcome} 不恢复或报错`, async ({ page }) => {
      await prepareIsolatedSession(page)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      let started = false
      let release: (() => void) | undefined
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      const settled: Promise<void>[] = []
      await page.route('**/cutter-held.png', async (route) => {
        started = true
        await held
        const result =
          outcome === 'complete'
            ? route.fulfill({ contentType: 'image/png', body: png })
            : route.fulfill({ status: 404, body: '' })
        settled.push(result)
        await result
      })
      await page.goto('/tests/e2e/fixtures/cutter-download-reuse.html?lifecycle')
      await page.getByRole('button', { name: '读取慢图片', exact: true }).click()
      await expect.poll(() => started).toBe(true)
      if (cancellation === 'replace') {
        await page.getByRole('button', { name: '设置验收图片', exact: true }).click()
        await expect(page.getByLabel('裁剪加载次数')).toHaveText('1')
      } else {
        await page
          .getByRole('button', {
            name: cancellation === 'clear' ? '清空图片地址' : '切换裁剪组件',
            exact: true
          })
          .click()
        await expect(page.getByAltText('裁剪结果预览')).toHaveCount(0)
      }
      const response = page.waitForResponse('**/cutter-held.png')
      release?.()
      await (await response).finished()
      await expect.poll(() => settled.length).toBeGreaterThan(0)
      await Promise.all(settled)
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
      )
      await expect(page.getByLabel('图片错误次数')).toHaveText('0')
      await expect(page.getByLabel('裁剪加载次数')).toHaveText(
        cancellation === 'replace' ? '1' : '0'
      )
      if (cancellation !== 'replace') await expect(page.getByAltText('裁剪结果预览')).toHaveCount(0)
      expect(errors).toEqual([])
    })
  }
}

test('当前图片加载失败只反馈一次，换图后可恢复', async ({ page }) => {
  await prepareIsolatedSession(page)
  await page.route('**/cutter-held.png', (route) => route.fulfill({ status: 404, body: '' }))
  await page.goto('/tests/e2e/fixtures/cutter-download-reuse.html?lifecycle')
  await page.getByRole('button', { name: '读取慢图片', exact: true }).click()
  await expect(page.getByLabel('图片错误次数')).toHaveText('1')
  await expect(page.getByLabel('裁剪加载次数')).toHaveText('0')
  await page.getByRole('button', { name: '设置验收图片', exact: true }).click()
  await expect(page.getByLabel('裁剪加载次数')).toHaveText('1')
  await expect(page.getByLabel('图片错误次数')).toHaveText('1')
  await expect(page.getByRole('button', { name: '下载图片', exact: true })).toBeEnabled()
})
