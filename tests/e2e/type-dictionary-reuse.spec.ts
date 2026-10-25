import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 30_000 })
test.setTimeout(180_000)
for (const mode of ['document', 'business', 'document-list', 'business-list']) {
  test(`${mode}复用公共字典的延迟加载、名称回退与停用过滤`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/rest/v1/**', async (route) => {
      const url = new URL(route.request().url())
      if (url.pathname.endsWith('/sys_dictionary')) {
        await gate
        await route.fulfill({
          json: url.search.includes('commonBoolean')
            ? [
                { label: '', name: '公共肯定', value: 'true', status: '1' },
                { label: '公共否定', value: 'false', status: '1' },
                { label: '停用选项', value: '1', status: '0' }
              ]
            : [
                { label: '', name: '公共字典名称', value: 'test-active', status: '1' },
                { label: '停用选项', value: 'test-inactive', status: '0' }
              ]
        })
      } else
        await route.fulfill({
          json: [],
          headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' }
        })
    })
    await page.goto(`/tests/e2e/fixtures/type-dictionary-reuse.html?mode=${mode}`)
    if (!mode.endsWith('-list')) {
      await page.getByRole('button', { name: '打开表单' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
    }
    release()
    const root = mode.endsWith('-list') ? page.locator('.art-search-bar') : page.getByRole('dialog')
    if (mode.endsWith('-list')) {
      const select = root
        .locator('.el-form-item')
        .filter({ has: page.getByText('状态', { exact: true }) })
        .locator('.el-select')
      await select.click()
      await expect(page.getByRole('option', { name: '公共肯定', exact: true })).toBeVisible()
      await expect(page.getByRole('option', { name: '停用选项', exact: true })).toHaveCount(0)
      await page.getByRole('option', { name: '公共否定', exact: true }).click()
    } else {
      await expect(root.getByText('公共肯定', { exact: true }).first()).toBeVisible()
      await expect(root.getByText('停用选项', { exact: true })).toHaveCount(0)
      if (mode === 'business') {
        const select = root
          .locator('.el-form-item')
          .filter({ has: page.getByText('库存方向', { exact: true }) })
          .locator('.el-select')
        await select.click()
        await expect(page.getByRole('option', { name: '公共字典名称', exact: true })).toBeVisible()
        await expect(page.getByRole('option', { name: '停用选项', exact: true })).toHaveCount(0)
        await page.getByRole('option', { name: '公共字典名称', exact: true }).click()
      }
    }
    await page.screenshot({ path: info.outputPath('type-dictionary.png'), fullPage: true })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    expect(errors).toEqual([])
  })
}
