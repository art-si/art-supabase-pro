import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { assertAppearance, prepareAppearance } from './support/appearance'
import { expectFormCardShadow } from './support/form-card-shadow'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const theme of ['light', 'dark'] as const) {
  test(`无页签公式编辑卡片 ${theme} 保留真实阴影与编辑布局`, async ({ page }, info) => {
    const appearance = { theme, boxBorderMode: false }
    await prepareIsolatedSession(page, { platformSuper: false })
    await prepareAppearance(page, appearance)
    const writes: string[] = []
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) => {
      const request = route.request()
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
        writes.push(new URL(request.url()).pathname)
        return route.fulfill({ status: 403, json: { code: '42501', message: '隔离测试阻止写入' } })
      }
      return route.fulfill({ json: [] })
    })
    await page.goto(
      '/tests/e2e/fixtures/engineering-dictionary-options.html?mode=activity-formula&shadowAudit=1',
      { waitUntil: 'domcontentloaded', timeout: 60_000 }
    )
    await assertAppearance(page, appearance)
    await page.getByRole('button', { name: '打开表单', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '新增活动公式', exact: true })
    await expect(dialog.getByRole('textbox', { name: /公式名称$/ })).toBeVisible({
      timeout: 60_000
    })
    await dialog.getByRole('textbox', { name: /公式名称$/ }).fill('阴影验收公式草稿')
    for (const selector of ['.parameter-panel.art-card-xs', '.formula-editor.art-card-xs']) {
      await expectFormCardShadow(
        page,
        dialog.locator(selector),
        info,
        `${theme}-${selector.split('.')[1]}`
      )
    }
    await dialog.getByPlaceholder('输入数字', { exact: true }).fill('3')
    await dialog.getByRole('button', { name: '添加', exact: true }).click()
    await expect(dialog.locator('.formula-canvas')).toContainText('3')
    await expect(dialog.locator('.formula-editor__preview-grid')).toContainText('3')
    await expect(dialog.getByRole('textbox', { name: /公式名称$/ })).toHaveValue('阴影验收公式草稿')
    await expect(dialog.getByRole('button', { name: '创建活动公式', exact: true })).toBeInViewport()
    await dialog.screenshot({ path: info.outputPath(`formula-${theme}-shadow.png`) })
    expect(writes).toEqual([])
    expect(errors).toEqual([])
  })
}
