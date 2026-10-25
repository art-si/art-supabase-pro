import { test, expect } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)

test('供应厂商受限字段隐藏且不带入新增表单', async ({ page }) => {
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.goto('/tests/e2e/fixtures/scrollbar-workspace.html?page=form-reuse&restricted=true')
  await page.getByRole('button', { name: '编辑供应厂商', exact: true }).click()
  const editor = page.getByRole('dialog', { name: '编辑供应厂商', exact: true })
  await expect(editor.getByRole('textbox', { name: '供应厂商名称', exact: false })).toHaveValue(
    '测试供应厂商'
  )
  await expect(editor.getByRole('textbox', { name: '联系人', exact: true })).toHaveCount(0)
  await expect(editor.getByRole('textbox', { name: '备注', exact: true })).toHaveCount(0)
  await editor.getByRole('button', { name: '取消', exact: true }).click()
  await expect(editor).not.toBeVisible()
  await page.getByRole('button', { name: '新增供应厂商', exact: true }).click()
  const creator = page.getByRole('dialog', { name: '新增供应厂商', exact: true })
  await expect(creator.getByRole('textbox', { name: '联系人', exact: true })).toHaveValue('')
  await expect(creator.getByRole('textbox', { name: '备注', exact: true })).toHaveValue('')
})

for (const feature of [
  { title: '供应厂商', label: '供应厂商名称', value: '测试供应厂商' },
  { title: '保险公司', label: '保险公司名称', value: '测试保险公司' },
  { title: '零部件', label: '零部件名称', value: '测试零部件' }
]) {
  test(`${feature.title}编辑后重新新增清除旧记录`, async ({ page }, info) => {
    const pageErrors: string[] = []
    const numberRuleTenants: Array<string | null> = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.route('**/rest/v1/**', (route) => {
      const url = new URL(route.request().url())
      if (url.pathname.endsWith('/sys_document_number_rule'))
        numberRuleTenants.push(url.searchParams.get('tenant_id'))
      return route.fulfill({ json: [] })
    })
    await page.goto('/tests/e2e/fixtures/scrollbar-workspace.html?page=form-reuse')
    await page.getByRole('button', { name: `编辑${feature.title}`, exact: true }).click()
    const editor = page.getByRole('dialog', { name: `编辑${feature.title}`, exact: true })
    await expect(editor).toBeVisible()
    await expect(editor.getByRole('textbox', { name: feature.label, exact: false })).toHaveValue(
      feature.value
    )
    await expect(editor.getByRole('textbox', { name: '备注', exact: true })).toHaveValue(
      '编辑记录备注'
    )
    if (feature.title === '零部件')
      await expect
        .poll(() => numberRuleTenants)
        .toContain('eq.11111111-1111-4111-a111-111111111111')
    await editor.screenshot({ path: info.outputPath('edit.png') })
    await editor.getByRole('button', { name: '取消', exact: true }).click()
    await expect(editor).not.toBeVisible()
    await page.getByRole('button', { name: `新增${feature.title}`, exact: true }).click()
    const creator = page.getByRole('dialog', { name: `新增${feature.title}`, exact: true })
    await expect(creator).toBeVisible()
    await expect(creator.getByRole('textbox', { name: feature.label, exact: false })).toHaveValue(
      ''
    )
    await expect(creator.getByRole('textbox', { name: '备注', exact: true })).toHaveValue('')
    if (feature.title === '零部件')
      await expect(creator.getByText('当前租户尚未配置编号规则。', { exact: true })).toBeVisible()
    const overflow = await creator.evaluate(
      (element) => element.scrollWidth > element.clientWidth + 1
    )
    expect(overflow).toBe(false)
    await creator.screenshot({ path: info.outputPath('create.png') })
    expect(pageErrors).toEqual([])
  })
}
