import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)

for (const variant of [
  { width: 1440, height: 900, theme: 'light', box: 'border-mode' },
  { width: 1280, height: 800, theme: 'dark', box: 'shadow-mode' },
  { width: 390, height: 844, theme: 'light', box: 'border-mode' }
]) {
  test(`${variant.width} ${variant.theme} 普通表单默认无操作，查询保留搜索与重置`, async ({
    page
  }) => {
    await prepareIsolatedSession(page)
    await page.setViewportSize(variant)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(
      `/tests/e2e/fixtures/art-form-defaults.html?theme=${variant.theme}&box=${variant.box}`
    )

    const entry = page.getByTestId('entry-form')
    await expect(entry.getByRole('textbox', { name: '业务名称' })).toBeVisible()
    await expect(entry.locator('.art-form .reset-button, .art-form .submit-button')).toHaveCount(0)
    await page.getByRole('button', { name: '校验录入', exact: true }).click()
    await expect(page.getByLabel('录入校验')).toHaveText('请完善录入')
    await expect(entry.getByText('请填写业务名称')).toBeVisible()
    await entry.getByRole('textbox', { name: '业务名称' }).fill('示范业务')
    await page.getByRole('button', { name: '校验录入', exact: true }).click()
    await expect(page.getByLabel('录入校验')).toHaveText('校验通过')

    const search = page.getByTestId('search-form')
    const keyword = search.getByRole('textbox', { name: '关键词', exact: true })
    await keyword.fill('示范查询')
    await search.getByRole('button', { name: '查询', exact: true }).click()
    await expect(page.getByLabel('查询结果')).toHaveText('{"keyword":"示范查询"}')
    await search.getByRole('button', { name: '重置', exact: true }).click()
    await expect(keyword).toHaveValue('')
    await expect(page.getByLabel('重置次数')).toHaveText('1')
    await expect(search.getByRole('button', { name: '查询', exact: true })).toBeEnabled()
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true)
    await page.screenshot({
      path: `.artifacts/form-defaults/${variant.width}-${variant.theme}-${variant.box}.png`,
      fullPage: true
    })
    expect(errors).toEqual([])
  })
}
