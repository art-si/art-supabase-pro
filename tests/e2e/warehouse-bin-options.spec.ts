import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

for (const mode of ['shared', 'row']) {
  test(`${mode} 仓位正常加载、失败反馈和重试`, async ({ page }, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    let failed = true
    await page.route('**/warehouse-bin-options-test', (route) =>
      failed ? route.fulfill({ status: 500 }) : route.fulfill({ json: ['一号仓位', '二号仓位'] })
    )
    await page.goto(`/tests/e2e/fixtures/warehouse-bin-options.html?mode=${mode}`, {
      waitUntil: 'domcontentloaded'
    })
    await expect(page.getByRole('heading', { name: '仓位选择', exact: true })).toBeVisible({
      timeout: 120_000
    })
    await expect(page.locator('.el-message--error')).toContainText('仓位加载失败')
    failed = false
    await page.getByRole('button', { name: '重新加载仓位', exact: true }).click()
    await expect(page.getByTestId('bin-options')).toHaveText('一号仓位,二号仓位')
    await page.getByRole('combobox').click()
    await page.getByRole('option', { name: '二号仓位', exact: true }).click()
    await expect(page.locator('.el-select')).toContainText('二号仓位')
    await page.screenshot({ path: testInfo.outputPath('warehouse-bin-ready.png'), fullPage: true })
    expect(errors).toEqual([])
  })

  for (const failed of [false, true]) {
    test(`${mode} 卸载后的旧${failed ? '失败' : '成功'}与保留回调失效`, async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      let release!: () => void
      const pending = new Promise<void>((resolve) => (release = resolve))
      await page.route('**/warehouse-bin-options-test', async (route) => {
        await pending
        if (failed) await route.fulfill({ status: 500 })
        else await route.fulfill({ json: ['旧仓位'] })
      })
      await page.goto(`/tests/e2e/fixtures/warehouse-bin-options.html?mode=${mode}`, {
        waitUntil: 'domcontentloaded'
      })
      await expect(page.getByRole('heading', { name: '仓位选择', exact: true })).toBeVisible({
        timeout: 120_000
      })
      await expect(page.getByTestId('reads')).toHaveText('1')
      await page.getByRole('button', { name: '隐藏选择器', exact: true }).click()
      await expect(page.getByText('仓位选择器已卸载', { exact: true })).toBeVisible()
      release()
      await expect(page.getByTestId('completed')).toHaveText('1')
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      )
      await expect(page.getByTestId('bin-options')).toBeEmpty()
      await expect(page.locator('.el-message--error')).toHaveCount(0)
      await page.getByRole('button', { name: '重新加载仓位', exact: true }).click()
      await expect(page.getByTestId('reads')).toHaveText('1')
      expect(errors).toEqual([])
    })
  }
}
