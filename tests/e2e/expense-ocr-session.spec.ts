import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { createExpenseOcrResult as result } from './support/expense-ocr-result'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)

for (const change of ['切换单据', '更换票据']) {
  test(`${change} 后旧识别失败不影响新请求，应用绑定最新票据`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    await page.route('https://synthetic.invalid/*.png', (route) =>
      route.fulfill({
        contentType: 'image/png',
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC3UAAAAASUVORK5CYII=',
          'base64'
        )
      })
    )
    let requests = 0
    const releases: Array<() => void> = []
    await page.route('**/functions/v1/ai-waybill-expense-ocr', async (route) => {
      const request = requests++
      await new Promise<void>((resolve) => {
        releases[request] = resolve
      })
      return route.fulfill({
        status: request === 0 ? 500 : 200,
        json: request === 0 ? { message: 'synthetic old failure' } : result('current')
      })
    })
    await page.goto('/tests/e2e/fixtures/expense-ocr-session.html', {
      waitUntil: 'domcontentloaded'
    })
    await page.getByRole('button', { name: '打开识别会话', exact: true }).click()
    await page.getByRole('button', { name: '开始识别', exact: true }).click()
    await expect.poll(() => requests).toBe(1)
    await page.getByRole('button', { name: change, exact: true }).click()
    await page.getByRole('button', { name: '开始识别', exact: true }).click()
    await expect.poll(() => requests).toBe(2)
    releases[0]()
    await expect(page.getByRole('button', { name: '开始识别', exact: true })).toHaveClass(
      /is-loading/
    )
    await expect(page.getByTestId('failed-count')).toHaveText('0')
    await expect(page.locator('.el-message--error')).toHaveCount(0)
    releases[1]()
    await expect(page.getByText('识别结果-current', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '应用到表单', exact: true }).click()
    await expect(page.getByTestId('applied-artifact')).toHaveText('current')
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    await page.screenshot({
      path: info.outputPath('ocr-current-session.png'),
      animations: 'disabled'
    })
  })
}
