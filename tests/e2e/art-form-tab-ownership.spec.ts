import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)
for (const mode of ['nested', 'custom']) {
  test(`${mode} 失焦必填错误保留提示但不抢回用户刚切换的页签`, async ({ page }) => {
    await prepareIsolatedSession(page)
    await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
    await page.goto(
      `/tests/e2e/fixtures/art-form-tab-ownership.html${mode === 'custom' ? '?custom' : ''}`
    )
    await page.getByRole('tab', { name: '联系地址', exact: true }).click()
    await page.getByRole('textbox', { name: '详细地址', exact: true }).focus()
    await page.getByRole('tab', { name: '客户信息', exact: true }).click()
    await expect(page.locator('.el-form-item.is-error')).toHaveCount(1)
    await expect(page.getByRole('tab', { name: '客户信息', exact: true })).toHaveAttribute(
      'aria-selected',
      'true'
    )
  })
  test(`${mode} 注册字段自动归属页签，校验和聚焦定位真实输入`, async ({ page }) => {
    await prepareIsolatedSession(page)
    await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
    await page.goto(
      `/tests/e2e/fixtures/art-form-tab-ownership.html${mode === 'custom' ? '?custom' : ''}`
    )
    await expect(page.getByRole('textbox', { name: '客户', exact: true })).toHaveValue('客户甲')
    await page.getByRole('button', { name: '回调校验', exact: true }).click()
    await expect(page.getByRole('tab', { name: '联系地址', exact: true })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    const street = page.getByRole('textbox', { name: '详细地址', exact: true })
    await expect(street).toBeFocused()
    await expect(page.getByText('请填写详细地址', { exact: true })).toBeVisible()
    await street.fill('示范路 88 号')
    await page.getByRole('button', { name: '校验全部', exact: true }).click()
    await expect(page.getByLabel('校验结果')).toHaveText('通过')
    await page.getByRole('tab', { name: '客户信息', exact: true }).click()
    await page.getByRole('button', { name: '定位详细地址', exact: true }).click()
    await expect(street).toBeFocused()
    await expect(street).toHaveValue('示范路 88 号')
    await page.getByRole('button', { name: '重置', exact: true }).click()
    await expect(page.getByRole('tab', { name: '客户信息', exact: true })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    await page.getByRole('textbox', { name: '客户', exact: true }).fill('')
    await page.getByRole('button', { name: '定位详细地址', exact: true }).click()
    await page.getByRole('button', { name: '校验全部', exact: true }).click()
    await expect(page.getByRole('tab', { name: '客户信息', exact: true })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    await expect(page.getByRole('textbox', { name: '客户', exact: true })).toBeFocused()
  })
}
