import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test('直接调拨详情完整显示长物料名称、备注并约束序列号宽度', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/tests/e2e/fixtures/wms-transfer-detail.html')
  await page.getByRole('button', { name: '查看测试调拨详情' }).click()
  const drawer = page.getByRole('dialog', { name: '直接调拨单', exact: true })
  await expect(drawer.getByText('物料编码', { exact: true })).toBeVisible()
  await expect(drawer.getByText('TEST-MATERIAL-001', { exact: true })).toBeVisible()
  await expect(drawer.getByText('测试长名称物料'.repeat(12), { exact: true })).toBeVisible()
  const overflow = await drawer.evaluate((element) =>
    Array.from(element.querySelectorAll('.el-descriptions, li')).map((region) => ({
      width: region.clientWidth,
      overflow: region.scrollWidth - region.clientWidth
    }))
  )
  expect(overflow.every((region) => region.width > 0 && region.overflow <= 1)).toBe(true)
  await expect(
    drawer.getByText('44444444-4444-4444-8444-444444444444', { exact: true })
  ).toHaveCount(0)
  const unavailable = drawer.getByText('序列号资料不可用', { exact: true })
  await unavailable.scrollIntoViewIfNeeded()
  await expect(unavailable).toBeVisible()
  const longSerial = drawer.getByText('TEST-LONG-SERIAL-'.repeat(20), { exact: true })
  expect(
    await longSerial.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
  ).toBe(true)
  await page.screenshot({
    path: testInfo.outputPath('direct-transfer-serial-readable.png'),
    animations: 'disabled'
  })
  await drawer.getByRole('button', { name: '关闭此对话框', exact: true }).click()
  await expect(drawer).not.toBeVisible()
  expect(errors).toEqual([])
})
