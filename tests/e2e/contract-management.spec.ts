import { expect, test } from '@playwright/test'

test('合同新增弹窗展示扩展字段和运输明细', async ({ page }) => {
  test.setTimeout(90_000)
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto('#/tms/basic-data/contract', {
    waitUntil: 'domcontentloaded'
  })
  await expect(page).not.toHaveURL(/#\/(?:auth\/)?login/)
  if (!(await page.locator('.tms-workspace-page').count())) {
    await page.getByRole('tab', { name: /合同管理/ }).click()
  }
  await expect(page.locator('.tms-workspace-page')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('.el-loading-mask:visible')).toHaveCount(0, { timeout: 60_000 })

  await page.getByRole('button', { name: '新增', exact: true }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('基础信息', { exact: true })).toBeVisible()
  await expect(dialog.getByText('业务合同分类', { exact: true })).toBeVisible()
  const transportModeItem = dialog.locator('.el-form-item').filter({ hasText: '运输方式' })
  await expect(transportModeItem.getByRole('combobox')).toBeVisible()
  await expect(transportModeItem.getByText('公路', { exact: true })).toBeVisible()
  await transportModeItem.getByRole('combobox').click()
  await expect(page.getByRole('option', { name: '多式联运', exact: true })).toBeVisible()
  await page.getByRole('option', { name: '公路', exact: true }).click()
  await expect(dialog.getByText('运输合同明细', { exact: true })).toBeVisible()
  await expect(dialog.getByText('合同附件', { exact: true })).toBeVisible()
  await expect(dialog.locator('.el-form-item__error')).toHaveCount(0)

  await dialog.getByRole('button', { name: '批量选货物', exact: true }).click()
  const cargoDialog = page.getByRole('dialog', { name: '批量选择货物' })
  await expect(cargoDialog).toBeVisible()
  await expect(cargoDialog.getByPlaceholder('请输入货物名称、编码、单位或备注')).toBeVisible()
  await cargoDialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(cargoDialog).toBeHidden()

  await dialog.getByRole('radio', { name: '企业/货主端合同', exact: true }).click()
  await expect(dialog.getByText('承运商', { exact: true })).toBeVisible()
  await expect(dialog.getByText('客户/货主', { exact: true })).toBeHidden()
  await expect(dialog.locator('.el-form-item__error')).toHaveCount(0)

  await dialog.getByRole('radio', { name: '承运商合同', exact: true }).click()
  await expect(dialog.getByText('客户/货主', { exact: true })).toBeVisible()
  await expect(dialog.getByText('承运商', { exact: true })).toBeHidden()
  await expect(dialog.locator('.el-form-item__error')).toHaveCount(0)

  await dialog.getByRole('button', { name: '新增明细', exact: true }).click()
  await expect(dialog.getByPlaceholder('选择或输入货物')).toBeVisible()
  await expect(dialog.getByPlaceholder('请输入编码')).toBeVisible()
  await expect(dialog.getByText('¥ 0.00', { exact: true })).toBeVisible()

  const overflow = await dialog.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth
  }))
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)
  expect(pageErrors, `页面出现未捕获错误：\n${pageErrors.join('\n')}`).toEqual([])

  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(dialog.locator('.el-form-item__error').first()).toBeVisible()

  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(dialog).toBeHidden()
})
