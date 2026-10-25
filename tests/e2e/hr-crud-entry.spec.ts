import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

const pages = [
  'operations/benefits',
  'operations/compensation-review',
  'operations/contingent-workforce',
  'operations/employee-relations',
  'operations/policy-acknowledgement',
  'personnel/compliance',
  'personnel/job-architecture',
  'personnel/organization-design'
] as const

test.use({ storageState: { cookies: [], origins: [] } })
for (const name of pages) {
  test(`HR ${name} 新增入口、必填校验和取消关闭`, async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    await prepareIsolatedSession(page)
    await page.setViewportSize({ width: 570, height: 900 })
    const errors: string[] = []
    const writes: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) => {
      if (
        /\/(?:rpc\/)?(?:hr_)?(?:save|create|upsert)_/.test(new URL(route.request().url()).pathname)
      )
        writes.push(route.request().url())
      return route.fulfill({ json: [] })
    })
    await page.goto(`/tests/e2e/fixtures/hr-all-pages.html?page=${name}`)
    if (name === 'personnel/compliance') await page.getByRole('tab', { name: /^劳动合同/ }).click()
    const add = page.getByRole('button', { name: /^(新增|新建)/ }).first()
    await expect(add).toBeVisible({ timeout: 90_000 })
    await add.click()
    const dialog = page.getByRole('dialog').last()
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.el-form')).toBeVisible()
    await expect(dialog.locator('.el-loading-mask:visible')).toHaveCount(0)
    if (name === 'operations/compensation-review')
      await dialog.getByRole('textbox', { name: /周期名称$/ }).fill('')
    await expect
      .poll(() => dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1))
      .toBe(true)
    await dialog
      .locator('.art-dialog__footer, .el-dialog__footer')
      .getByRole('button', { name: /创建|保存/ })
      .click()
    await expect(dialog.locator('.el-form-item__error').first()).toBeVisible()
    expect(writes).toEqual([])
    expect(errors).toEqual([])
    await page.screenshot({
      path: testInfo.outputPath('add-validation.png'),
      animations: 'disabled'
    })
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await expect(dialog).not.toBeVisible()
  })
}
