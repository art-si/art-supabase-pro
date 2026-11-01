import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)
test.beforeEach(async ({ page }) => {
  await page.routeWebSocket(/^ws:\/\/(?:127\.0\.0\.1|localhost):\d+\//, (socket) => socket.close())
})

test('配置式表单保留外部字段错误、必填标记和尾部动作', async ({ page }) => {
  await prepareIsolatedSession(page)
  await page.goto('/tests/e2e/fixtures/art-form-values.html?field-state')
  const field = page.locator('[data-validation-key="profile.name"]')
  await expect(field).toHaveClass(/is-required/)
  await expect(field).toContainText('外部字段校验提示')
  await field.getByRole('textbox').fill('配置式字段')
  await page.getByRole('button', { name: '配置式表单尾部操作' }).click()
  await expect(page.getByRole('status', { name: '校验结果' })).toContainText('尾部操作已执行')
})

for (const theme of ['light', 'dark']) {
  test(`网站配置通过字段元数据保持动态显隐与分组，认证渠道没有嵌套表单 · ${theme}`, async ({
    page
  }, info) => {
    await prepareIsolatedSession(page)
    const writes: string[] = []
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', async (route) => {
      const method = route.request().method()
      if (method !== 'GET' && !route.request().url().includes('/rpc/'))
        writes.push(route.request().url())
      if (new URL(route.request().url()).pathname.endsWith('/sys_dictionary'))
        return route.fulfill({
          json: [
            ...[
              ['用户名', 'username'],
              ['站点名称', 'site_name'],
              ['自定义文本', 'custom']
            ].map(([label, value], sort) => ({
              id: `watermark-${value}`,
              type_id: 'watermark',
              value,
              code: value,
              label,
              sort,
              status: '1',
              dict_type_table: { code: 'sysWatermarkContentType', name: '水印内容' }
            })),
            {
              id: 'lang-zh',
              type_id: 'language',
              value: 'zh',
              code: 'zh',
              label: '简体中文',
              sort: 0,
              status: '1',
              dict_type_table: { code: 'sysWebsiteLanguage', name: '语言' }
            }
          ]
        })
      await route.fulfill({
        json: new URL(route.request().url()).pathname.endsWith('/sys_param') ? null : []
      })
    })
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(`/tests/e2e/fixtures/form-standard-main.html?feature=website&theme=${theme}`)
    await expect(page.getByRole('heading', { name: '网站配置', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '撤销未发布修改', exact: true })).toBeDisabled()
    await page.getByRole('textbox', { name: /^\*?\s*系统名称$/ }).fill('配置式验收站点')
    await expect(page.getByRole('textbox', { name: '自定义水印', exact: true })).toHaveCount(0)
    await expect(page.getByRole('textbox', { name: '维护提示文案', exact: true })).toHaveCount(0)
    const watermark = page.getByRole('combobox', { name: /^\*?\s*水印内容$/ })
    await watermark.click()
    await page.getByRole('option', { name: /自定义/ }).click()
    await expect(page.getByRole('textbox', { name: '自定义水印', exact: true })).toBeVisible()
    await expect(page.locator('form form')).toHaveCount(0)
    await expect(page.locator('.website-config-page form')).toHaveCount(1)
    await page
      .getByRole('textbox', { name: '显示名称', exact: true })
      .first()
      .fill('配置式认证渠道')
    await expect(page.locator('.auth-channel-row__identity strong').first()).toHaveText(
      '配置式认证渠道'
    )
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true
    )
    await page.screenshot({ path: info.outputPath(`website-schema-${theme}.png`), fullPage: false })
    await page.getByRole('button', { name: '撤销未发布修改', exact: true }).click()
    await expect(page.getByRole('button', { name: '撤销未发布修改', exact: true })).toBeDisabled()
    await expect(page.getByRole('textbox', { name: '自定义水印', exact: true })).toHaveCount(0)
    expect(writes).toEqual([])
    expect(errors).toEqual([])
  })
}
