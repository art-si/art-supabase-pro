import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('开单收发地址图标提供识别和原有地址选择，并把识别结果带回对应端', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.goto('/tests/e2e/fixtures/order-numeric.html')
  await page.getByRole('radiogroup').getByText('完整表单', { exact: true }).click()

  for (const endpoint of [
    { icon: '发货地址操作', selector: '选择发货地址', key: 'shipping', name: '张三', phone: '13800138000' },
    { icon: '收货地址操作', selector: '选择收货地址', key: 'receiving', name: '李四', phone: '13900139000' }
  ] as const) {
    await page.getByRole('button', { name: endpoint.icon }).click()
    await expect(page.getByRole('menuitem', { name: '地址识别' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: '选择地址' })).toBeVisible()
    await page.screenshot({
      path: info.outputPath(`${endpoint.key}-address-menu.png`),
      animations: 'disabled'
    })
    await page.getByRole('menuitem', { name: '地址识别' }).click()
    const recognition = page.getByRole('dialog', { name: '地址识别' })
    await expect(recognition).toBeVisible()
    await expect(recognition.getByRole('button', { name: '图片识别' })).toBeVisible()
    await recognition.getByRole('textbox', { name: '待识别的地址信息' }).fill(
      `${endpoint.name}，${endpoint.phone}，上海市浦东新区验收路12号，验收物流有限公司`
    )
    await recognition.getByRole('button', { name: '识别信息' }).click()
    await expect(recognition.locator('[data-art-form-item-key="contactName"] input')).toHaveValue(endpoint.name)
    await expect(recognition.locator('[data-art-form-item-key="contactPhone"] input')).toHaveValue(endpoint.phone)
    await expect(recognition.getByText(/已识别 \d+ 项/)).toBeVisible()
    await page.screenshot({
      path: info.outputPath(`${endpoint.key}-recognized-address.png`),
      animations: 'disabled'
    })
    await recognition.getByRole('button', { name: '使用此地址' }).click()
    await expect(recognition).toBeHidden()
    await expect(page.locator(`[data-art-form-item-key="${endpoint.key}ContactName"] input`)).toHaveValue(endpoint.name)
    await expect(page.locator(`[data-art-form-item-key="${endpoint.key}ContactPhone"] input`)).toHaveValue(endpoint.phone)

    await page.getByRole('button', { name: endpoint.icon }).click()
    await page.getByRole('menuitem', { name: '选择地址' }).click()
    await expect(page.getByRole('dialog', { name: endpoint.selector })).toBeVisible()
    await page.screenshot({
      path: info.outputPath(`${endpoint.key}-existing-address-selector.png`),
      animations: 'disabled'
    })
    await page.getByRole('dialog', { name: endpoint.selector }).getByRole('button', { name: '取消' }).click()
  }
  expect(errors).toEqual([])
})
