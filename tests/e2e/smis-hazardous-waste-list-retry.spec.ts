import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)
for (const scenario of [
  {
    path: 'hazardous-waste-inbound',
    name: 'SmisHazardousWasteInbound',
    rpc: 'smis_list_hazardous_waste_documents_secure',
    direction: 'inbound',
    empty: '暂无危废入库单据'
  },
  {
    path: 'hazardous-waste-outbound',
    name: 'SmisHazardousWasteOutbound',
    rpc: 'smis_list_hazardous_waste_documents_secure',
    direction: 'outbound',
    empty: '暂无危废出库单据'
  },
  {
    path: 'warehouse-definition',
    name: 'SmisHazardousWasteWarehouseDefinition',
    rpc: 'smis_list_hazardous_waste_warehouses_secure',
    direction: null,
    empty: '暂无危废仓库'
  },
  {
    path: 'hazardous-waste-catalog',
    name: 'SmisHazardousWasteCatalog',
    rpc: 'smis_list_hazardous_waste_catalog_secure',
    direction: null,
    empty: '暂无危废名录'
  }
]) {
  test(`${scenario.path}服务失败与重试`, async ({ page }, testInfo) => {
    await prepareIsolatedSession(page)
    const path = `/smis/hazardous-waste-management/${scenario.path}`
    const name = scenario.name
    const menu = {
      id: scenario.path,
      parentId: null,
      name,
      path,
      component: path,
      type: 'menu',
      sort: 1,
      meta: { title: '危废单据', is_enable: true, is_hide: false, roles: [] }
    }
    await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
      route.fulfill({ json: [{ code: 'smis', name: '测试安全管理', baseUrl: '/smis/' }] })
    )
    await mockApplicationMenus(page, {
      smis: [
        menu,
        {
          ...menu,
          id: `${scenario.path}-view`,
          parentId: scenario.path,
          name: `${name}:View`,
          type: 'button',
          path: '',
          component: ''
        }
      ]
    })
    let failure = true
    let requests = 0
    await page.route(`**/rest/v1/rpc/${scenario.rpc}`, (route) => {
      requests++
      const query = route.request().postDataJSON()
      if (scenario.direction) expect(query.p_direction).toBe(scenario.direction)
      return failure
        ? route.fulfill({ status: 503, json: { code: 'XX000', message: 'database unavailable' } })
        : route.fulfill({
            json: {
              records: [],
              total: 0,
              categories: [],
              overview: { total: 0, draft: 0, pending: 0, approved: 0, rejected: 0, quantity: 0 }
            }
          })
    })
    await page.goto(`#${path}`)
    const error = page.locator('.art-table-query').getByText('数据加载失败', { exact: true })
    const empty = page.getByText(scenario.empty, { exact: true })
    await expect(error).toBeVisible({ timeout: 60_000 })
    await expect(empty).toBeHidden()
    await expect(page.locator('.el-message--error')).toHaveCount(0)
    await error.scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath('list-error.png') })
    failure = false
    if (scenario.path === 'hazardous-waste-catalog') {
      const category = page.locator('.hazardous-category-nav')
      const retry = category.getByRole('button', { name: '重新加载', exact: true })
      await retry.scrollIntoViewIfNeeded()
      const cardBox = await category.boundingBox()
      const retryBox = await retry.boundingBox()
      expect(cardBox).not.toBeNull()
      expect(retryBox).not.toBeNull()
      expect(retryBox!.y + retryBox!.height).toBeLessThanOrEqual(cardBox!.y + cardBox!.height + 1)
      await page.screenshot({ path: testInfo.outputPath('category-error.png') })
      await retry.click()
      await expect(category.getByText('暂无危废分类', { exact: true })).toBeVisible()
    } else {
      await page
        .locator('.art-table-query')
        .getByRole('button', { name: '重新加载', exact: true })
        .click()
    }
    await expect(error).toBeHidden()
    await expect(empty).toBeVisible()
    expect(requests).toBeGreaterThanOrEqual(2)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
  })
}
