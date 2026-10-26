import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const scenario of [
  { mode: 'ppe', title: '防护用品', material: '测试防护用品' },
  { mode: 'tool', title: '工器具', material: '测试工器具' }
] as const) {
  test(`${scenario.title}真实弹窗编辑与复制保留快照`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) =>
      route.fulfill({ json: [], headers: { 'content-range': '*/0' } })
    )
    await page.goto(`/tests/e2e/fixtures/smis-issuance-edit-copy.html?mode=${scenario.mode}`)
    const recordSnapshot = () =>
      page.evaluate(() =>
        (
          window as typeof window & {
            __smisIssuanceRecordSnapshot: () => unknown
          }
        ).__smisIssuanceRecordSnapshot()
      )
    const original = await recordSnapshot()

    await page.getByRole('button', { name: '打开编辑' }).click()
    const edit = page.getByRole('dialog', { name: `编辑${scenario.title}发放记录` })
    await expect(edit).toBeVisible()
    await expect(edit.getByPlaceholder('保存时自动生成')).toHaveValue('ISS-2026-001')
    await expect(edit.getByPlaceholder('请选择发放日期')).toHaveValue('2026-10-05')
    await expect(edit.getByPlaceholder('请选择员工')).toHaveValue(/测试领用人.*EMP-001/)
    await expect(edit.getByPlaceholder('请选择发放仓库')).toHaveValue('测试发放仓库')
    await expect(edit.getByPlaceholder('请选择发放人')).toHaveValue(/测试发放人/)
    const editRow = edit.getByRole('row').filter({ hasText: scenario.material })
    await expect(editRow).toBeVisible()
    await expect(editRow.locator('.el-input-number input')).toHaveValue('2')
    await page.screenshot({ path: info.outputPath('edit-desktop.png') })
    await edit.getByRole('button', { name: '取消', exact: true }).click()
    await expect(edit).toBeHidden()

    await page.getByRole('button', { name: '打开复制' }).click()
    const copy = page.getByRole('dialog', { name: `复制并新增${scenario.title}发放记录` })
    await expect(copy).toBeVisible()
    await expect(copy.getByPlaceholder('保存时自动生成')).toHaveValue('')
    const today = (await page.getByTestId('fixture-today').textContent())?.trim() ?? ''
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    await expect(copy.getByPlaceholder('请选择发放日期')).toHaveValue(today)
    await expect(copy.getByPlaceholder('请选择员工')).toHaveValue(/测试领用人.*EMP-001/)
    await expect(copy.getByPlaceholder('请选择发放仓库')).toHaveValue('测试发放仓库')
    const copyRow = copy.getByRole('row').filter({ hasText: scenario.material })
    const quantity = copyRow.locator('.el-input-number input')
    await expect(quantity).toHaveValue('2')
    await expect(quantity).toBeEnabled()
    await quantity.fill('3')
    await expect(quantity).toHaveValue('3')
    await expect(copy.getByRole('button', { name: '保存草稿', exact: true })).toBeEnabled()
    expect(await recordSnapshot()).toEqual(original)

    await page.setViewportSize({ width: 390, height: 844 })
    await expect(copy).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
    ).toBe(true)
    await page.screenshot({ path: info.outputPath('copy-mobile-390.png'), fullPage: true })
    expect(errors).toEqual([])
  })
}
