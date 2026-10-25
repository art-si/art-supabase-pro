import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('展开行左侧输入保持横向位置，右侧校验仍可定位', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.setViewportSize({ width: 1024, height: 768 })
  await page.goto('/tests/e2e/fixtures/table-expand-focus.html')
  await page.getByRole('button', { name: '打开展开行', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '展开行焦点验收', exact: true })
  const wrap = dialog.locator('.el-table__body-wrapper .el-scrollbar__wrap')
  await dialog.locator('.el-table__expand-icon').click()
  const input = dialog.getByRole('textbox', { name: '展开左侧规格', exact: true })
  await expect(input).toBeVisible()
  await input.click()
  await input.fill('规格验收')
  await expect(input).toBeFocused()
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
  expect(await wrap.evaluate((el) => el.scrollLeft)).toBeLessThanOrEqual(2)
  await dialog.screenshot({
    path: testInfo.outputPath('expand-left-focus.png'),
    animations: 'disabled'
  })
  await dialog.getByRole('button', { name: '校验右侧数量', exact: true }).click()
  const quantity = dialog.getByRole('textbox', { name: '必填数量', exact: true })
  await expect(quantity).toBeFocused()
  await expect.poll(() => wrap.evaluate((el) => el.scrollLeft)).toBeGreaterThan(1000)
  await quantity.fill('12')
  await wrap.evaluate((el) => (el.scrollLeft = 0))
  await input.click()
  await expect(input).toHaveValue('规格验收')
  await expect.poll(() => wrap.evaluate((el) => el.scrollLeft)).toBeLessThanOrEqual(2)
  expect(errors).toEqual([])
})
