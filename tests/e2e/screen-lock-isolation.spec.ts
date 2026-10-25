import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.setTimeout(120_000)
for (const kind of ['弹窗', '抽屉']) {
  test(`锁屏覆盖高层级业务${kind}且保留草稿`, async ({ page }) => {
    await prepareIsolatedSession(page)
    await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/tests/e2e/fixtures/screen-lock-reuse.html?business-overlay')
    await page.getByRole('button', { name: `打开业务${kind}`, exact: true }).dispatchEvent('click')
    const draft = page.getByRole('textbox', { name: `业务${kind}草稿`, includeHidden: true })
    await expect(draft).toBeVisible()
    await draft.fill('正在编辑的草稿')
    await page.getByRole('button', { name: '进入验收锁屏', exact: true }).dispatchEvent('click')
    const unlock = page.locator('#unlock-screen-password')
    await expect(unlock).toBeFocused()
    await expect(page.locator('dialog:modal')).toHaveCount(1)
    const covered = await unlock.evaluate((element) => {
      const box = element.getBoundingClientRect()
      return element
        .closest('.layout-lock-screen')
        ?.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2))
    })
    expect(covered).toBe(true)
    await draft.evaluate((element) => element.focus())
    await expect(unlock).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(unlock).toBeVisible()
    await page.screenshot({ path: test.info().outputPath('locked-over-business.png') })
    await unlock.fill('screen-test-password')
    await page.getByRole('button', { name: '解锁工作台', exact: true }).click()
    await expect(unlock).toHaveCount(0)
    await expect(draft).toHaveValue('正在编辑的草稿')
    await expect(draft).toBeVisible()
    await expect(draft).toBeFocused()
    await draft.fill('解锁后继续编辑')
    await expect(draft).toHaveValue('解锁后继续编辑')
    expect(errors).toEqual([])
  })

  test(`锁屏隔离后到的业务弹层和背景焦点 ${kind}`, async ({ page }) => {
    await prepareIsolatedSession(page)
    await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(
      '/tests/e2e/fixtures/screen-lock-reuse.html?business-overlay&theme=dark&box=shadow-mode'
    )
    await page.getByRole('button', { name: `打开业务${kind}`, exact: true }).dispatchEvent('click')
    const original = page.getByRole('textbox', { name: `业务${kind}草稿`, includeHidden: true })
    await original.fill('原草稿')
    await page.getByRole('button', { name: '进入验收锁屏', exact: true }).dispatchEvent('click')
    const unlock = page.locator('#unlock-screen-password')
    await expect(unlock).toBeFocused()
    const other = kind === '弹窗' ? '抽屉' : '弹窗'
    // Model a previously started async callback mounting another business portal.
    await page
      .getByRole('button', { name: `打开业务${other}`, exact: true, includeHidden: true })
      .dispatchEvent('click')
    const lateDraft = page.getByRole('textbox', { name: `业务${other}草稿`, includeHidden: true })
    await expect(lateDraft).toBeAttached()
    await lateDraft.evaluate((element) => element.focus())
    await expect(unlock).toBeFocused()
    await page
      .getByRole('textbox', { name: '背景输入', includeHidden: true })
      .evaluate((element) => element.focus())
    await expect(unlock).toBeFocused()
    await page
      .getByRole('button', { name: '打开锁屏设置', exact: true, includeHidden: true })
      .dispatchEvent('click')
    for (let count = 0; count < 6; count++) {
      await page.keyboard.press('Tab')
      expect(
        await page.evaluate(
          () =>
            document.activeElement === document.body ||
            Boolean(document.activeElement?.closest('dialog:modal'))
        )
      ).toBe(true)
    }
    await page.keyboard.press('Escape')
    await expect(page.locator('dialog:modal')).toHaveCount(1)
    await expect(page.getByLabel('锁屏状态')).toHaveText('true')
    await unlock.fill('screen-test-password')
    await page.getByRole('button', { name: '解锁工作台', exact: true }).click()
    await expect(page.locator('dialog:modal')).toHaveCount(0)
    await expect(page.locator('#lock-screen-password')).toBeHidden()
    await expect(original).toHaveValue('原草稿')
    await expect(lateDraft).toBeVisible()
    await lateDraft.fill('后到草稿继续编辑')
    await expect(lateDraft).toHaveValue('后到草稿继续编辑')
    expect(errors).toEqual([])
  })
}
