import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

test('批量栏自定义下推触发器与相邻小按钮等高', async ({ page }) => {
  await prepareIsolatedSession(page)
  await page.goto('/tests/e2e/fixtures/date-format-reuse.html?compactActions')
  const print = page.getByRole('button', { name: '批量打印', exact: true })
  const push = page.getByRole('button', { name: '下推', exact: true })
  await expect(push).toBeVisible()
  const printBox = await print.boundingBox()
  const pushBox = await push.boundingBox()
  expect(printBox).not.toBeNull()
  expect(pushBox).not.toBeNull()
  expect(pushBox!.height).toBe(printBox!.height)
  expect(pushBox!.height).toBe(24)
  await push.click()
  await expect(page.getByRole('menuitem', { name: '查看说明', exact: true })).toBeVisible()
})

for (const dark of [false, true]) {
  for (const shadow of [false, true]) {
    test(`公共更多操作适配触屏与鼠标并保留权限 dark=${dark} shadow=${shadow}`, async ({
      page
    }, info) => {
      await prepareIsolatedSession(page)
      await page.goto('/tests/e2e/fixtures/date-format-reuse.html', {
        waitUntil: 'domcontentloaded'
      })
      await page.evaluate(
        ({ dark, shadow }) => {
          document.documentElement.classList.toggle('dark', dark)
          document.documentElement.setAttribute(
            'data-box-mode',
            shadow ? 'shadow-mode' : 'border-mode'
          )
        },
        { dark, shadow }
      )
      const trigger = page.getByRole('button', { name: '更多操作', exact: true })
      if (page.viewportSize()!.width <= 640) await trigger.tap()
      else await trigger.hover()
      const item = page.getByRole('menuitem', { name: '查看说明', exact: true })
      await expect(item).toBeVisible()
      await expect(page.getByRole('menuitem', { name: '禁用操作', exact: true })).toBeDisabled()
      await expect(page.getByRole('menuitem', { name: '未授权操作', exact: true })).toHaveCount(0)
      await page.screenshot({ path: info.outputPath('more-menu.png'), animations: 'disabled' })
      await item.click()
      await expect(page.getByRole('status')).toHaveText('preview')
      await expect(item).not.toBeVisible()
    })
  }
}

test('公共更多操作保留显式点击触发，并支持键盘打开', async ({ page }) => {
  await prepareIsolatedSession(page)
  await page.goto('/tests/e2e/fixtures/date-format-reuse.html?click', {
    waitUntil: 'domcontentloaded'
  })
  const trigger = page.getByRole('button', { name: '更多操作', exact: true })
  await trigger.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('menuitem', { name: '查看说明', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menuitem', { name: '查看说明', exact: true })).not.toBeVisible()
})
