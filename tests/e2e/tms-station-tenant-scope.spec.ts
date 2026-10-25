import { expect, test } from '@playwright/test'

const previewPath = '/tests/e2e/fixtures/tms-station-dialog.html'

test.beforeEach(async ({ page }) => {
  await page.route('**/rest/v1/sys_document_number_rule**', (route) =>
    route.fulfill({ status: 200, json: [] })
  )
})

test('普通用户站点新建不显示租户选择', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto(`${previewPath}?mode=ordinary`)
  const dialog = page.locator('.el-dialog:visible').filter({ hasText: '新增站点' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: '确定' })).toBeEnabled()
  await expect(dialog.getByText('所属租户', { exact: true })).toHaveCount(0)
  await page.screenshot({
    path: '.artifacts/tms-station-component-ordinary-desktop.png',
    animations: 'disabled'
  })
  expect(pageErrors).toEqual([])
})

test('平台超级管理员在全部租户范围默认本租户且不重复选择租户', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto(`${previewPath}?mode=platform-all`)
  const dialog = page.locator('.el-dialog:visible').filter({ hasText: '新增站点' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: '确定' })).toBeEnabled()
  await expect(dialog.getByText('所属租户', { exact: true })).toHaveCount(0)
  await expect(dialog.getByText('当前租户尚未配置编号规则。')).toBeVisible()
  await page.screenshot({
    path: '.artifacts/tms-station-component-all-tenants-desktop.png',
    animations: 'disabled'
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(dialog).toBeVisible()
  const stationNameWidth = await dialog
    .locator('.el-form-item')
    .filter({ hasText: '站点名称' })
    .locator('.el-input')
    .evaluate((element) => element.getBoundingClientRect().width)
  expect(stationNameWidth).toBeGreaterThan(0)

  const overflow = await dialog.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth
  }))
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)
  await page.screenshot({
    path: '.artifacts/tms-station-component-all-tenants-mobile.png',
    animations: 'disabled'
  })

  await expect(dialog.getByText('当前租户尚未配置编号规则。')).toBeVisible()
  await expect(
    dialog.locator('.el-form-item').filter({ hasText: '站点编码' }).locator('input')
  ).toBeEnabled()
  expect(pageErrors).toEqual([])
})

test('站点删除阻断展示订单编号与状态，并允许跳转到有权限的订单页', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto(`${previewPath}?mode=delete-guard`)
  const dialog = page.locator('.el-dialog:visible').filter({ hasText: '暂时无法删除站点' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('东区分拨站')).toBeVisible()
  await expect(dialog.getByText('TMS-2026-0018')).toBeVisible()
  await expect(dialog.getByText('到达站 · 待配载')).toBeVisible()
  await expect(dialog.getByRole('button', { name: '查看订单' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: /清理选中项/ })).toHaveCount(0)
  await page.screenshot({
    path: '.artifacts/tms-station-delete-guard-desktop.png',
    animations: 'disabled'
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(dialog).toBeVisible()
  const overflow = await dialog.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth
  }))
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)
  await page.screenshot({
    path: '.artifacts/tms-station-delete-guard-mobile.png',
    animations: 'disabled'
  })

  await dialog.getByRole('button', { name: '查看订单' }).click()
  await expect(page.locator('body')).toHaveAttribute('data-preview-route', 'TmsOrderList')
  expect(pageErrors).toEqual([])
})

test('批量删除中同一订单引用两个站点时分别展示两条阻断记录', async ({ page }) => {
  const duplicateKeyWarnings: string[] = []
  page.on('console', (message) => {
    if (message.text().includes('Duplicate keys')) duplicateKeyWarnings.push(message.text())
  })

  await page.goto(`${previewPath}?mode=delete-guard-batch`)
  const dialog = page.locator('.el-dialog:visible').filter({ hasText: '暂时无法删除站点' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('TMS-2026-0018')).toHaveCount(2)
  await expect(dialog.getByText('引用：东区分拨站 · 到达站 · 待配载')).toBeVisible()
  await expect(dialog.getByText('引用：西区发货站 · 发货站 · 待配载')).toBeVisible()
  expect(duplicateKeyWarnings).toEqual([])
})
