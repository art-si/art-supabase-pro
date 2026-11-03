import { expect, test } from '@playwright/test'
import { installDictionaryOptions } from './support/dictionary-options'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 60_000 })
test.setTimeout(360_000)

test('配件领用与库存流水的字段和页签在脱敏数据下可用', async ({ page }, testInfo) => {
  const unexpected: string[] = []
  page.on('pageerror', (error) => unexpected.push(error.message))
  let stockState: 'success' | 'error' | 'empty' = 'success'
  await page.route('**/rest/v1/**', (route) => {
    unexpected.push(route.request().url())
    return route.fulfill({ status: 400, json: { message: 'unexpected fixture request' } })
  })
  await installDictionaryOptions(page, {
    vehicleOwnership: [{ value: 'carrier', label: '承运商' }]
  })
  await page.route('**/rest/v1/rpc/get_table_column_runtime', (route) =>
    route.fulfill({ json: { enabled: false, profiles: [] } })
  )
  await page.route('**/rest/v1/rpc/vms_list_part_issue_secure', (route) =>
    route.fulfill({
      json: {
        records: [
          {
            id: 'issue-1',
            documentNo: 'PJ2026001',
            vehicleId: 'vehicle-1',
            plateNo: '测A·10001',
            driverId: 'driver-1',
            driverName: '测试司机',
            driverPhone: '138****0001',
            vehicleOwnership: 'carrier',
            isNewEnergy: false,
            carrierName: '测试承运商',
            companyName: '测试运输公司',
            remark: null,
            lineCount: 1,
            issuedQty: 2,
            returnedQty: 0,
            lostQty: 1,
            damagedQty: 1,
            createTime: '2026-11-01T08:00:00+08:00'
          }
        ],
        total: 1
      }
    })
  )
  await page.route('**/rest/v1/rpc/vms_list_part_stock_secure', (route) => {
    if (stockState === 'error')
      return route.fulfill({ status: 503, json: { code: 'XX000', message: 'fixture unavailable' } })
    if (stockState === 'empty') return route.fulfill({ json: { records: [], total: 0 } })
    return route.fulfill({
      json: {
        records: [
          {
            id: 'stock-1',
            partId: 'part-1',
            partCode: 'LP2026001',
            partName: '轮胎',
            categoryName: '轮胎',
            model: '12R22.5',
            brand: '测试品牌',
            unit: '条',
            stockQty: 12,
            updatedAt: '2026-11-01T09:00:00+08:00'
          },
          {
            id: 'stock-2',
            partId: 'part-2',
            partCode: 'LP2026002',
            partName: '加厚防雨篷布（验收用长名称）',
            categoryName: '篷布',
            model: '6米 × 8米',
            brand: '测试品牌',
            unit: '张',
            stockQty: 20,
            updatedAt: '2026-11-02T10:00:00+08:00'
          }
        ],
        total: 2
      }
    })
  })
  await page.route('**/rest/v1/rpc/vms_list_part_stock_movements_secure', (route) =>
    route.fulfill({
      json: {
        records: [
          {
            id: 'movement-1',
            postingSeq: 38,
            partId: 'part-1',
            partCode: 'LP2026001',
            partName: '轮胎',
            movementType: 'lost',
            quantity: 1,
            stockDelta: 0,
            balanceAfter: 12,
            occurredAt: '2026-11-01T09:00:00+08:00',
            referenceNo: 'PJ2026001',
            plateNo: '测A·10001',
            vehicleOwnership: 'carrier',
            isNewEnergy: false,
            driverName: '测试司机',
            driverPhone: '138****0001',
            carrierName: '测试承运商',
            companyName: '测试运输公司',
            remark: null
          }
        ],
        total: 1
      }
    })
  )
  await page.goto('/tests/e2e/fixtures/vms-parts-review.html')
  await page.evaluate(() => document.documentElement.setAttribute('data-box-mode', 'border-mode'))
  await expect(page.getByRole('columnheader', { name: '领用单号' })).toBeVisible({
    timeout: 180_000
  })
  await expect(page.getByRole('columnheader', { name: '丢失' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: '损坏' })).toBeVisible()
  await expect(page.getByText('测试司机 · 138****0001').first()).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('parts-issues.png'), fullPage: true })
  await page.getByRole('button', { name: '新建领用单' }).click()
  await expect(page.getByText('领用单号', { exact: true }).last()).toBeVisible()
  await page.getByRole('button', { name: '取消' }).click()
  await page.getByRole('tab', { name: '库存台账' }).click()
  await expect(page.getByRole('tab', { name: '当前库存' })).toBeVisible()
  await expect(page.getByRole('tab', { name: '配件流水' })).toBeVisible()
  const stock = page.locator('.part-inventory-workspace__stock')
  await expect(stock.getByText('轮胎', { exact: true }).first()).toBeVisible()
  await expect(page.locator('.business-table-workspace-actions')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '登记入库', exact: true })).toBeVisible()
  const typography = await stock
    .getByRole('columnheader', { name: '配件 / 编码' })
    .evaluate((header) => {
      const cell = header.querySelector('.cell') ?? header
      return {
        fontSize: getComputedStyle(cell).fontSize,
        fontWeight: getComputedStyle(cell).fontWeight,
        height: header.getBoundingClientRect().height
      }
    })
  expect(typography.fontSize).toBe('14px')
  expect(Number(typography.fontWeight)).toBeGreaterThanOrEqual(600)
  expect(typography.height).toBeGreaterThanOrEqual(44)
  await page.screenshot({ path: testInfo.outputPath('parts-stock-light.png'), fullPage: true })
  await page.evaluate(() => {
    document.documentElement.classList.add('dark')
    document.documentElement.setAttribute('data-box-mode', 'shadow-mode')
  })
  await page.screenshot({ path: testInfo.outputPath('parts-stock-dark.png'), fullPage: true })
  await page.evaluate(() => {
    document.documentElement.classList.remove('dark')
    document.documentElement.setAttribute('data-box-mode', 'border-mode')
  })
  await page.setViewportSize({ width: 1024, height: 768 })
  await expect(page.getByRole('button', { name: '登记入库', exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('parts-stock-1024.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('tab', { name: '配件流水' }).click()
  await expect(page.getByRole('columnheader', { name: '领用车牌' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: '所属承运商' })).toBeVisible()
  await page
    .locator('.business-table-workspace-actions__toggle')
    .filter({ hasText: '专注模式' })
    .locator('.el-switch')
    .click()
  await expect(page.locator('.business-workspace-header')).toBeHidden()
  await expect(page.getByRole('tab', { name: '配件流水' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: '领用车牌' })).toBeVisible()
  await page.getByRole('button', { name: '退出专注模式' }).click()
  await expect(page.locator('.business-workspace-header')).toBeVisible()
  await page
    .locator('.business-table-workspace-actions__toggle')
    .filter({ hasText: '专注模式' })
    .locator('.el-switch')
    .click()
  await expect(page.locator('.business-workspace-header')).toBeHidden()
  await page.keyboard.press('Escape')
  await expect(page.locator('.business-workspace-header')).toBeVisible()
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.screenshot({ path: testInfo.outputPath('parts-movements.png'), fullPage: true })
  stockState = 'error'
  await page.reload()
  await page.getByRole('tab', { name: '库存台账', exact: true }).click()
  await expect(stock.getByText('库存加载失败，请重试', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '登记入库', exact: true })).toBeVisible()
  stockState = 'success'
  await stock.getByRole('button', { name: '重新加载' }).click()
  await expect(stock.getByText('轮胎', { exact: true }).first()).toBeVisible()
  stockState = 'empty'
  await page.reload()
  await page.getByRole('tab', { name: '库存台账', exact: true }).click()
  await expect(stock.getByText('暂无库存记录', { exact: true })).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('parts-stock-empty.png'),
    fullPage: true,
    timeout: 60_000
  })
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  expect(unexpected).toEqual([])
})
