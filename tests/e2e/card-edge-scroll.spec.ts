import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(90_000)
const tenantId = '11111111-1111-4111-8111-111111111111'

for (const theme of ['light', 'dark']) {
  test(`库区卡片轨道靠边、内容双侧留白与固定筛选 ${theme}`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    const warehouses = Array.from({ length: 20 }, (_, index) => ({
      id: `warehouse-${index}`,
      tenant_id: tenantId,
      warehouse_code: `WH-${index + 1}`,
      warehouse_name: `验收仓库${index + 1}`,
      status: 'enabled',
      enable_zones: true,
      enable_locations: true,
      business_scopes: []
    }))
    await page.route('**/rest/v1/**', (route) => {
      const url = new URL(route.request().url())
      const name = url.pathname.split('/').at(-1)
      if (name === 'mdm_warehouse') return route.fulfill({ json: warehouses })
      if (name === 'mdm_warehouse_zone')
        return route.fulfill({
          json: Array.from({ length: 30 }, (_, index) => ({
            id: `zone-${index}`,
            tenant_id: tenantId,
            warehouse_id: warehouses[0].id,
            zone_code: `ZONE-${index + 1}`,
            zone_name: `验收库区${index + 1}`,
            status: 'enabled',
            sort: index
          }))
        })
      if (name === 'wms_storage_overview_secure')
        return route.fulfill({ json: { stale_days: 90, zones: [], bins: [] } })
      return route.fulfill({ json: [] })
    })
    await page.goto(`/tests/e2e/fixtures/form-standard-main.html?feature=zone&theme=${theme}`, {
      waitUntil: 'domcontentloaded'
    })
    await expect(page.getByRole('heading', { name: '库区管理', exact: true })).toBeVisible()
    const cards = page
      .locator('.art-section-card')
      .filter({ has: page.locator('.art-section-card__scrollbar') })
    await expect(cards).toHaveCount(2)
    const left = cards.first()
    const right = cards.last()
    await expect(left.getByRole('button', { name: /验收仓库1 WH-1/ })).toBeVisible()
    for (const card of [left, right]) {
      await expect(card.locator('.el-scrollbar')).toHaveCount(1)
      const scroll = card.locator('.art-section-card__scrollbar')
      expect(
        await scroll
          .locator(':scope > .el-scrollbar__wrap')
          .evaluate((node) => node.scrollHeight - node.clientHeight)
      ).toBeGreaterThan(50)
      await scroll.hover()
      const gaps = await card.evaluate((node) => {
        const root = node.getBoundingClientRect()
        const body = node.querySelector('.art-section-card__body')!
        const content = body.firstElementChild!.getBoundingClientRect()
        const track = node.querySelector('.el-scrollbar__bar.is-vertical')!.getBoundingClientRect()
        return {
          left: content.left - root.left,
          right: root.right - content.right,
          trackRight: root.right - track.right
        }
      })
      expect(gaps.left).toBeGreaterThanOrEqual(16)
      expect(Math.abs(gaps.left - gaps.right)).toBeLessThanOrEqual(2)
      expect(gaps.trackRight).toBeLessThanOrEqual(5)
    }
    const toolbar = right.locator('.art-section-card__toolbar')
    const top = (await toolbar.boundingBox())!.y
    await right.locator('.art-section-card__scrollbar > .el-scrollbar__wrap').evaluate((node) => {
      node.scrollTop = 300
    })
    expect((await toolbar.boundingBox())!.y).toBe(top)
    await left.locator('.art-section-card__scrollbar > .el-scrollbar__wrap').evaluate((node) => {
      node.scrollTop = node.scrollHeight
    })
    const last = left.getByRole('button', { name: /验收仓库20 WH-20/ })
    await last.click()
    await expect(last).toHaveAttribute('aria-pressed', 'true')
    await page.screenshot({ path: info.outputPath(`warehouse-zone-${theme}.png`) })
  })

  test(`车型内嵌树不叠加卡片留白且轨道靠边 ${theme}`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    await page.route('**/rest/v1/rpc/vms_list_vehicle_type_profiles_secure', (route) =>
      route.fulfill({
        json: Array.from({ length: 50 }, (_, index) => ({
          id: `profile-${index}`,
          tenant_id: tenantId,
          category: '半挂车',
          image_url: null,
          length_m: 13 + index / 10,
          volume_m3: 75,
          load_tons: 30,
          status: '1',
          sort: index,
          scheme_color: null,
          tag_style: null,
          remark: null
        }))
      })
    )
    await page.goto(`/tests/e2e/fixtures/vms-vehicle-type-scope.html?theme=${theme}`)
    const card = page.locator('.vehicle-type-tab__tree-card')
    await expect(card.locator('.el-tree-node').first()).toBeVisible()
    await card.locator('.el-tree-node').nth(1).click()
    const selected = card.locator('.el-tree-node.is-current')
    await expect(selected).toHaveCount(1)
    await card.hover()
    const gaps = await selected.evaluate((node) => {
      const root = node.closest('.art-section-card')!.getBoundingClientRect()
      const row = node.getBoundingClientRect()
      const track = node
        .closest('.art-section-card')!
        .querySelector('.el-virtual-scrollbar')!
        .getBoundingClientRect()
      return {
        left: row.left - root.left,
        right: root.right - row.right,
        trackRight: root.right - track.right
      }
    })
    expect(gaps.left).toBeLessThanOrEqual(1)
    expect(gaps.right).toBeGreaterThanOrEqual(8)
    expect(gaps.right).toBeLessThanOrEqual(10)
    expect(gaps.trackRight).toBeLessThanOrEqual(5)
    await expect(card).toHaveCSS('padding', '0px')
    await page.screenshot({ path: info.outputPath(`vehicle-tree-${theme}.png`) })
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(card).toHaveCSS('padding', '0px')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true
    )
    await card.screenshot({ path: info.outputPath(`vehicle-tree-${theme}-narrow.png`) })
  })
}
