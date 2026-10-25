import { expect, test } from '@playwright/test'
import { installFixtures, meta } from './support/inventory-fixtures'
import { mockApplicationMenus } from './support/menu-rpc'

const targets = [
  ['initialization/initial-stock', 'WmsInitialStock', '初始库存单'],
  ['initialization/initial-sales-outbound', 'WmsInitialSalesOutbound', '期初销售出库单'],
  ['inbound-business/purchase-inbound', 'WmsPurchaseInbound', '采购入库单'],
  ['count-business/count-gain', 'WmsCountGain', '盘盈单'],
  ['count-business/count', 'WmsCount', '库存盘点'],
  ['outbound-business/outbound-request', 'WmsIssueRequest', '出库申请单'],
  ['transfer-business/transfer-request', 'WmsTransfer', '调拨申请单'],
  ['adjustment-business/adjustment', 'WmsAdjustment', '库存调整'],
  ['adjustment-business/assembly', 'WmsAssembly', '库存组装']
]

test('仓储各类工作区展示模式更新列并可还原', async ({ page }, testInfo) => {
  test.setTimeout(240_000)
  await installFixtures(page)
  await page.route('**/rpc/get_accessible_applications', (route) =>
    route.fulfill({
      json: [
        { code: 'platform', name: '平台', baseUrl: '/' },
        { code: 'wms', name: '仓储', baseUrl: '/wms/' }
      ]
    })
  )
  await mockApplicationMenus(page, {
    wms: targets.flatMap(([path, name, title], index) => {
      const id = `column-mode-${index}`
      return [
        {
          id,
          parentId: null,
          name,
          path: `/wms/${path}`,
          component: `/wms/${path}`,
          type: 'menu',
          sort: index,
          meta: meta(title)
        },
        {
          id: `${id}-View`,
          parentId: id,
          name: `${name}:View`,
          path: '',
          component: '',
          type: 'button',
          sort: 1,
          meta: meta('查看')
        }
      ]
    })
  })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  for (const [path, , title] of targets) {
    await page.goto(`#/wms/${path}`)
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible({
      timeout: 60_000
    })
    const headers = page.locator('.el-table__header-wrapper th')
    await expect(headers.first()).toBeVisible()
    const signature = async () => (await headers.allTextContents()).join('|')
    const documentColumns = await signature()
    await page.locator('.el-radio-button').filter({ hasText: '按明细' }).click()
    if (path === 'initialization/initial-stock') await expect.poll(signature).toBe(documentColumns)
    else await expect.poll(signature).not.toBe(documentColumns)
    await page.screenshot({
      path: testInfo.outputPath(`${path.replaceAll('/', '-')}-line-columns.png`),
      animations: 'disabled'
    })
    await page.locator('.el-radio-button').filter({ hasText: '按单据' }).click()
    await expect.poll(signature).toBe(documentColumns)
    const header = page.locator('.business-workspace-header')
    const table = page.locator('.art-table-query')
    await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
    await expect(header).toBeHidden()
    await expect(table).toHaveClass(/is-focus-mode/)
    await page.screenshot({
      path: testInfo.outputPath(`${path.replaceAll('/', '-')}-focus.png`),
      animations: 'disabled'
    })
    await page.keyboard.press('Escape')
    await expect(header).toBeVisible()
    await expect(table).not.toHaveClass(/is-focus-mode/)
    await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
    await table.getByRole('button', { name: '退出专注模式', exact: true }).click()
    await expect(header).toBeVisible()
    await expect.poll(signature).toBe(documentColumns)
    expect(
      await page
        .locator('.business-workspace-page')
        .evaluate((element) => element.scrollWidth - element.clientWidth)
    ).toBeLessThanOrEqual(1)
  }
  expect(errors).toEqual([])
})
