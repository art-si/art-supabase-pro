import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-07T04:00:00Z') })
  await page.goto('/tests/e2e/fixtures/ceremony-lifecycle.html')
  await expect(page.getByTestId('state')).toHaveText(
    '{"fireworks":0,"borderMode":true,"text":false}'
  )
})

for (const action of ['关闭效果', '卸载控制器']) {
  test(`${action}取消尚未启动的效果`, async ({ page }) => {
    await page.getByRole('button', { name: '启动效果' }).click()
    await page.getByRole('button', { name: action }).click()
    await page.clock.runFor(6000)
    await expect(page.getByTestId('state')).toHaveText(
      '{"fireworks":0,"borderMode":true,"text":false}'
    )
  })
  test(`${action}取消尚未显示的文字`, async ({ page }) => {
    await page.getByRole('button', { name: '启动效果' }).click()
    await page.clock.runFor(1300)
    await expect(page.getByTestId('state')).toHaveText(
      '{"fireworks":1,"borderMode":true,"text":false}'
    )
    await page.getByRole('button', { name: action }).click()
    await page.clock.runFor(4000)
    await expect(page.getByTestId('state')).toHaveText(
      '{"fireworks":1,"borderMode":true,"text":false}'
    )
  })
}
test('重复启动只播放一轮并正常显示文字', async ({ page }) => {
  await page.getByRole('button', { name: '启动效果' }).click()
  await page.getByRole('button', { name: '启动效果' }).click()
  await page.clock.runFor(1300)
  await expect(page.getByTestId('state')).toHaveText(
    '{"fireworks":1,"borderMode":true,"text":false}'
  )
  await page.clock.runFor(2000)
  await expect(page.getByTestId('state')).toHaveText(
    '{"fireworks":1,"borderMode":true,"text":true}'
  )
})

test('共享日期跨天后更新节日和设置状态', async ({ page }) => {
  await expect(page.getByTestId('festival')).toHaveText(
    JSON.stringify({ name: '生命周期测试', shared: true, allowed: true })
  )
  await page.getByRole('button', { name: '关闭效果' }).click()
  await expect(page.getByTestId('festival')).toHaveText(
    JSON.stringify({ name: '生命周期测试', shared: true, allowed: false })
  )
  await page.clock.setSystemTime(new Date('2026-10-08T04:00:00Z'))
  await page.clock.runFor(60_000)
  await expect(page.getByTestId('festival')).toHaveText(
    JSON.stringify({ name: '次日测试', shared: true, allowed: true })
  )
  for (const [date, name] of [
    ['2026-10-09', '跨日测试'],
    ['2026-10-10', '跨日测试'],
    ['2026-10-11', null]
  ] as const) {
    await page.clock.setSystemTime(new Date(`${date}T04:00:00Z`))
    await page.clock.runFor(60_000)
    await expect(page.getByTestId('festival')).toHaveText(
      JSON.stringify({ name, shared: true, allowed: name !== null })
    )
    if (name !== null) {
      await page.getByRole('button', { name: '关闭效果' }).click()
      await expect(page.getByTestId('festival')).toHaveText(
        JSON.stringify({ name, shared: true, allowed: false })
      )
    }
  }
})
