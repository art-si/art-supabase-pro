import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test('车辆运营时长复用统一计算并保留未来日期和无效日期展示', async ({ page }) => {
  test.setTimeout(120_000)
  await prepareIsolatedSession(page)
  await page.clock.setFixedTime(new Date('2026-10-12T00:00:00Z'))
  for (const [start, expected] of [
    ['2024-10-12', '2年'],
    ['2027-10-12', '0年'],
    ['invalid', '--']
  ]) {
    await page.goto(`/tests/e2e/fixtures/vehicle-summary-reuse.html?archive&start=${start}`, {
      waitUntil: 'domcontentloaded'
    })
    const label = page.locator('.el-descriptions__label').filter({ hasText: '运营时长' })
    await expect(label).toHaveCount(1)
    await expect
      .poll(() =>
        label.evaluate((element) =>
          element.nextElementSibling?.querySelector('.art-descriptions__value')?.textContent?.trim()
        )
      )
      .toBe(expected)
  }
})
test('车辆摘要复用详情样式且窄屏无溢出', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  await page.goto('/tests/e2e/fixtures/vehicle-summary-reuse.html')
  await expect(page.locator('.vehicle-query-summary')).toContainText('测试车辆')
  await expect(page.locator('.vehicle-query-summary')).toContainText('12,345.67')
  await expect(page.locator('.vehicle-query-summary h1')).toHaveText('测试车辆')
  await expect(page.getByRole('button', { name: '返回车辆查询' })).toBeVisible()
  for (const value of ['17.5 米', '130 立方米', '32 吨']) {
    await expect(page.locator('.vehicle-query-summary')).toContainText(value)
  }
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  await expect(page.locator('.vehicle-query-summary')).toContainText('行驶里程')
  await page.screenshot({ path: info.outputPath('summary.png'), fullPage: true })
})

test('车辆档案页签和证件布局复用公共详情', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  await page.goto('/tests/e2e/fixtures/vehicle-summary-reuse.html?archive')
  await expect(page.locator('.vehicle-query-archive-panel')).toContainText('测试车辆')
  await expect(page.getByRole('tab', { name: '综合概览' })).toHaveAttribute('aria-selected', 'true')
  for (const name of ['车身参数', '发动机参数', '其他信息', '基础信息']) {
    await page.getByRole('tab', { name, exact: true }).click()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
  }
  await page.screenshot({ path: info.outputPath('archive.png'), fullPage: true })
})

test('新能源车辆电卡档案与流水按车辆查询，支持空态及失败重试', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const calls: Array<{ name: string; vehicleId: string | null }> = []
  let failLedger = true
  await page.route('**/rest/v1/rpc/vms_list_electric_*_secure_v2', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1) || ''
    const body = route.request().postDataJSON() as { p_vehicle_id?: string }
    calls.push({ name, vehicleId: body.p_vehicle_id ?? null })
    if (name === 'vms_list_electric_card_entries_secure_v2' && failLedger) {
      failLedger = false
      return route.fulfill({ status: 500, json: { message: 'temporary failure' } })
    }
    return route.fulfill({ json: { records: [], total: 0 } })
  })
  await page.goto('/tests/e2e/fixtures/vehicle-summary-reuse.html?electric')
  await expect(page.getByText('暂无绑定电卡')).toBeVisible()
  await page.getByRole('button', { name: '电卡流水' }).click()
  await expect(page.getByText('电卡记录加载失败，请重试。', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '重新加载' }).click()
  await expect(page.getByText('暂无电卡流水')).toBeVisible()
  expect(calls.map((call) => call.name)).toEqual([
    'vms_list_electric_cards_secure_v2',
    'vms_list_electric_card_entries_secure_v2',
    'vms_list_electric_card_entries_secure_v2'
  ])
  expect(calls.every((call) => call.vehicleId === 'test-vehicle-id')).toBe(true)
  await page.screenshot({ path: info.outputPath('electric-empty.png'), fullPage: true })
})
