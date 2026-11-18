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
    const isCatalog = scenario.path === 'hazardous-waste-catalog'
    const tenant = await prepareIsolatedSession(page, { platformSuper: !isCatalog })
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
    let hasCategories = false
    const root = {
      id: 'waste-category-root',
      tenantId: tenant.id,
      parentId: null,
      categoryName: '测试危废分组',
      categoryCode: 'HW-ROOT',
      status: 'enabled',
      catalogCount: 2
    }
    const archived = {
      ...root,
      id: 'waste-category-history',
      parentId: root.id,
      categoryName: '历史危废分组',
      categoryCode: 'HW-HISTORY',
      status: 'disabled',
      catalogCount: 1
    }
    const categoryIds: unknown[] = []
    await page.route(`**/rest/v1/rpc/${scenario.rpc}`, (route) => {
      requests++
      const query = route.request().postDataJSON()
      if (scenario.direction) expect(query.p_direction).toBe(scenario.direction)
      if (isCatalog) categoryIds.push(query.p_category_id)
      const categories = hasCategories ? [root, archived] : []
      const records = categories
        .filter(({ id }) => !query.p_category_id || query.p_category_id === id)
        .map((category) => ({
          id: `waste-${category.id}`,
          tenantId: tenant.id,
          wasteCode: category.categoryCode,
          wasteName: category === archived ? '历史危废名录项' : '当前危废名录项',
          category,
          status: category.status
        }))
      return failure
        ? route.fulfill({ status: 503, json: { code: 'XX000', message: 'database unavailable' } })
        : route.fulfill({
            json: {
              records,
              total: records.length,
              categories,
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
    const navigator = page.locator('.hazardous-category-nav')
    if (isCatalog) {
      const retry = navigator.getByRole('button', { name: '重新加载', exact: true })
      await retry.scrollIntoViewIfNeeded()
      const cardBox = await navigator.boundingBox()
      const retryBox = await retry.boundingBox()
      expect(cardBox).not.toBeNull()
      expect(retryBox).not.toBeNull()
      expect(retryBox!.y + retryBox!.height).toBeLessThanOrEqual(cardBox!.y + cardBox!.height + 1)
      await page.screenshot({ path: testInfo.outputPath('category-error.png') })
      await retry.click()
      await expect(navigator.getByText('暂无危废分类', { exact: true })).toBeVisible()
    } else {
      await page
        .locator('.art-table-query')
        .getByRole('button', { name: '重新加载', exact: true })
        .click()
    }
    await expect(error).toBeHidden()
    await expect(empty).toBeVisible()
    expect(requests).toBeGreaterThanOrEqual(2)
    if (isCatalog) {
      hasCategories = true
      await navigator.getByRole('button', { name: '刷新分类', exact: true }).click()
      const branch = navigator.getByRole('treeitem', { name: /^测试危废分组/ })
      const leaf = navigator.getByRole('treeitem', { name: /^历史危废分组/ })
      const all = navigator.getByRole('button', { name: /^全部名录/ })
      const currentItem = page.getByText('当前危废名录项', { exact: true })
      await expect(currentItem).toBeVisible()
      await branch.focus()
      const initialRequests = requests
      await page.keyboard.press('ArrowRight')
      await expect(leaf).toBeFocused()
      expect(requests).toBe(initialRequests)
      await page.keyboard.press('Space')
      await expect.poll(() => categoryIds.at(-1)).toBe(archived.id)
      await expect(currentItem).toHaveCount(0)
      await expect(page.getByText('历史危废名录项', { exact: true })).toBeVisible()
      await expect(leaf).toBeFocused()
      await expect(leaf).toHaveClass(/\bis-current\b/)
      await expect(
        navigator.getByRole('button', { name: /^(新增下级分类|编辑当前分类|删除当前分类)$/ })
      ).toHaveCount(0)
      await all.focus()
      await page.keyboard.press('Enter')
      await expect.poll(() => categoryIds.at(-1)).toBeNull()
      await expect(currentItem).toBeVisible()
      await expect(all).toBeFocused()
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
  })
}
