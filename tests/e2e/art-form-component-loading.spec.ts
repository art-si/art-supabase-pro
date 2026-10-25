import { expect, test, type Route } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

for (const theme of ['light', 'dark']) {
  for (const box of ['border-mode', 'shadow-mode']) {
    test(`自定义布局不加载预置控件，切换后拦截提交和校验 ${theme}/${box}`, async ({
      page
    }, testInfo) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
      let registryRoute: Route | undefined
      await page.route('**/src/components/core/forms/art-form/components.ts*', (route) => {
        registryRoute = route
      })
      await page.goto(
        `/tests/e2e/fixtures/art-form-values.html?layout=custom&theme=${theme}&box=${box}`
      )
      await expect(page.getByTestId('custom-layout-content')).toBeVisible()
      expect(registryRoute).toBeUndefined()
      await page.getByRole('button', { name: '切换自定义布局', exact: true }).click()
      await expect.poll(() => Boolean(registryRoute)).toBe(true)
      await expect(page.locator('.art-form .art-async-state[aria-busy="true"]')).toHaveCount(2)
      await expect(page.getByRole('button', { name: '提交测试', exact: true })).toBeDisabled()
      await expect(page.getByRole('button', { name: '重置测试', exact: true })).toBeDisabled()
      await page.getByRole('button', { name: '外部校验', exact: true }).click()
      await expect(page.getByLabel('校验结果')).toHaveText('校验未通过')
      await page.getByRole('button', { name: '回调校验', exact: true }).click()
      await expect(page.getByLabel('校验结果')).toHaveText('校验未通过：name、period')
      await page.screenshot({
        path: testInfo.outputPath('form-controls-loading.png'),
        fullPage: true
      })
      await registryRoute?.continue()
      await expect(page.getByRole('textbox', { name: '名称', exact: true })).toHaveValue('初始名称')
      expect(
        await page.locator('.art-form .el-date-editor').evaluate((control) => {
          const field = control.closest('.el-form-item__content')
          if (!field) return false
          const controlBounds = control.getBoundingClientRect()
          const fieldBounds = field.getBoundingClientRect()
          return (
            controlBounds.left >= fieldBounds.left - 1 &&
            controlBounds.right <= fieldBounds.right + 1
          )
        })
      ).toBe(true)
      await expect(page.getByRole('button', { name: '提交测试', exact: true })).toBeEnabled()
      await page.getByRole('button', { name: '外部校验', exact: true }).click()
      await expect(page.getByLabel('校验结果')).toHaveText('校验通过')
      await page.getByRole('button', { name: '提交测试', exact: true }).click()
      await expect(page.getByTestId('form-output')).toContainText('初始名称')
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
      ).toBe(true)
      await page.screenshot({
        path: testInfo.outputPath('form-controls-loaded.png'),
        fullPage: true
      })
      expect(errors).toEqual([])
    })
  }
}

test('预置控件持续失败显示共享错误状态并保持提交拦截', async ({ page }, testInfo) => {
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/src/components/core/forms/art-form/components.ts*', (route) =>
    route.fulfill({ status: 503, contentType: 'text/javascript', body: 'unavailable' })
  )
  await page.goto('/tests/e2e/fixtures/art-form-values.html')
  await expect(page.getByText('表单控件加载失败，请重试', { exact: true })).toHaveCount(2)
  await expect(page.getByRole('button', { name: '提交测试', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '回调校验', exact: true }).click()
  await expect(page.getByLabel('校验结果')).toHaveText('校验未通过：name、period')
  await page.getByRole('button', { name: '重新加载', exact: true }).first().click()
  await expect(
    page.getByText('表单控件暂时无法加载，请保留已填内容后刷新页面', { exact: true })
  ).toHaveCount(2)
  await expect(page.getByRole('button', { name: '重新加载', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '提交测试', exact: true })).toBeDisabled()
  await page.screenshot({ path: testInfo.outputPath('form-controls-error.png'), fullPage: true })
})

test('预置控件请求恢复后可以重试并保留表单默认值', async ({ page }) => {
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  let attempts = 0
  await page.route('**/src/components/core/forms/art-form/components.ts*', (route) => {
    attempts++
    return attempts === 1
      ? route.fulfill({ status: 503, contentType: 'text/javascript', body: 'unavailable' })
      : route.continue()
  })
  await page.goto('/tests/e2e/fixtures/art-form-values.html')
  await expect(page.getByText('表单控件加载失败，请重试', { exact: true })).toHaveCount(2)
  await page.getByRole('button', { name: '重新加载', exact: true }).first().click()
  await expect(page.getByRole('textbox', { name: '名称', exact: true })).toHaveValue('初始名称')
  await expect(page.getByRole('button', { name: '提交测试', exact: true })).toBeEnabled()
  expect(attempts).toBe(2)
})
