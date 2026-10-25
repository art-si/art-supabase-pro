import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('共享表单提交和重置保留日期范围、文件及有效空值', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/tests/e2e/fixtures/art-form-values.html')
  const name = page.locator('.el-input__inner').first()
  await expect(name).toHaveValue('初始名称')
  await name.fill('编辑后的名称')
  const output = page.getByTestId('form-output')
  for (const expectedName of ['编辑后的名称', '初始名称']) {
    if (expectedName === '初始名称') await page.getByRole('button', { name: '重置测试' }).click()
    await page.getByRole('button', { name: '提交测试' }).click()
    await expect
      .poll(async () => JSON.parse(await output.innerText()))
      .toEqual({
        name: expectedName,
        period: ['2026-10-03T00:00:00.000Z', '2026-10-04T00:00:00.000Z'],
        attachment: { name: 'test.txt', content: '测试附件内容' },
        hasBlank: false,
        count: 0,
        enabled: false
      })
  }
  expect(errors).toEqual([])
})
