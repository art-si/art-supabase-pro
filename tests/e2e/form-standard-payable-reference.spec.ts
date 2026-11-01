import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

async function open(page: Page, query = '') {
  await prepareIsolatedSession(page)
  await page.goto(`/tests/e2e/fixtures/form-standard-main.html?feature=payable&mode=edit${query}`, {
    waitUntil: 'domcontentloaded'
  })
  const dialog = page.getByRole('dialog').last()
  await expect(dialog).toBeVisible({ timeout: 60_000 })
  return dialog
}

test('核销方案跨页签必填定位、表格红框修正、保存失败重试', async ({ page }, info) => {
  let rejectSave = true
  const writes: Record<string, unknown>[] = []
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/rpc/fms_save_payable_reference_secure', async (route) => {
    writes.push(route.request().postDataJSON())
    return rejectSave
      ? route.fulfill({ status: 409, json: { code: '40001', message: '配置已更新，请刷新后重试' } })
      : route.fulfill({ json: '22222222-2222-4222-8222-222222222222' })
  })
  await page.goto(
    '/tests/e2e/fixtures/form-standard-main.html?feature=payable&mode=edit&invalidRule',
    { waitUntil: 'domcontentloaded' }
  )
  const dialog = page.getByRole('dialog').last()
  await expect(dialog).toBeVisible({ timeout: 60_000 })
  const name = dialog.getByRole('textbox', { name: /^\*?\s*名称$/ })
  await name.clear()
  await dialog.getByRole('tab', { name: '匹配规则', exact: true }).click()
  await dialog.getByRole('button', { name: '保存配置', exact: true }).click()
  await expect(dialog.getByRole('tab', { name: '方案信息', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect(name).toBeFocused()
  await name.fill('验收核销方案')
  await dialog.getByRole('button', { name: '保存配置', exact: true }).click()
  await expect(dialog.getByRole('tab', { name: '匹配规则', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect(dialog.locator('.is-validation-error')).toHaveCount(1)
  await expect(dialog.getByRole('columnheader', { name: /主方单据字段/ })).toContainText('*')
  await expect(page.locator('.el-message--warning')).toContainText('主方单据字段')
  const selector = dialog.getByRole('combobox', { name: '主方单据字段', exact: true })
  await selector.press('ArrowDown')
  await page.getByRole('option', { name: '往来单位', exact: true }).click()
  await dialog.getByRole('button', { name: '保存配置', exact: true }).click()
  await expect.poll(() => writes.length).toBe(1)
  await expect(page.locator('.el-message--error')).toBeVisible()
  await expect(dialog).toBeVisible()
  expect(writes[0]).toMatchObject({
    p_kind: 'scheme',
    p_record: {
      name: '验收核销方案',
      configuration_version: 2,
      rules: [{ primary_field: 'supplier_id', secondary_field: 'supplier_id', operator: 'eq' }]
    }
  })
  rejectSave = false
  await dialog.getByRole('button', { name: '保存配置', exact: true }).click()
  await expect.poll(() => writes.length).toBe(2)
  await expect(dialog).not.toBeVisible()
  await page.getByRole('button', { name: '重新打开验收入口' }).click()
  await expect(dialog.getByRole('tab', { name: '方案信息', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await page.screenshot({ path: info.outputPath('scheme-information.png') })
})

test('分关系核销方案保留全部分类、窄暗布局与默认页签', async ({ page }, info) => {
  const dialog = await open(page, '&matrix')
  await expect(dialog.getByRole('tab')).toHaveCount(2)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => {
    document.documentElement.classList.add('dark')
    document.documentElement.dataset.boxMode = 'shadow-mode'
  })
  for (const tab of ['方案信息', '匹配规则']) {
    await dialog.getByRole('tab', { name: tab, exact: true }).click()
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
    await page.screenshot({ path: info.outputPath(`scheme-${tab}-dark.png`) })
  }
  await expect(
    dialog.getByRole('switch', { name: '按核销关系分别配置', exact: true })
  ).toBeChecked()
  await expect(dialog.getByText('应付付款核销', { exact: true })).toBeVisible()
})

for (const kind of ['purpose', 'method']) {
  test(`${kind} 少字段保持单页并实际保存`, async ({ page }, info) => {
    let payload: unknown
    await prepareIsolatedSession(page)
    await page.route('**/rest/v1/rpc/fms_save_payable_reference_secure', (route) => {
      payload = route.request().postDataJSON()
      return route.fulfill({ json: '22222222-2222-4222-8222-222222222222' })
    })
    await page.goto(
      `/tests/e2e/fixtures/form-standard-main.html?feature=payable&mode=add&kind=${kind}`,
      { waitUntil: 'domcontentloaded' }
    )
    const dialog = page.getByRole('dialog').last()
    await expect(dialog).toBeVisible({ timeout: 60_000 })
    await expect(dialog.getByRole('tab')).toHaveCount(0)
    await dialog.getByRole('textbox', { name: /^\*?\s*编码$/ }).fill(`QA-${kind}`)
    await dialog.getByRole('textbox', { name: /^\*?\s*名称$/ }).fill(`验收${kind}`)
    await page.screenshot({ path: info.outputPath(`${kind}-compact.png`) })
    await dialog.getByRole('button', { name: '保存配置', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    expect(payload).toMatchObject({
      p_kind: kind,
      p_record: { code: `QA-${kind}`, name: `验收${kind}`, enabled: true }
    })
  })
}
