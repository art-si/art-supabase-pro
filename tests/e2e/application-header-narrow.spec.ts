import { expect, test, type Locator } from '@playwright/test'
import { prepareAppearance } from './support/appearance'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })

const path = '/tms/basic-data/favorite-route'
const toggleLabel = '展开或收起侧边菜单'

const hitBounds = (button: Locator) =>
  button.evaluate((element) => {
    const { left, right, top, width, height } = element.getBoundingClientRect()
    const y = top + height / 2
    const hits = [left + 2, left + width / 2, right - 2].map((x) => {
      const hit = document.elementFromPoint(x, y)
      return !!hit && element.contains(hit)
    })
    return { left, right, width, inside: left >= 0 && right <= innerWidth, hits }
  })

for (const platformSuper of [false, true]) {
  test(`TMS 顶栏在窄屏保留可操作的导航入口（${platformSuper ? '平台超管' : '普通用户'}）`, async ({
    page,
    hasTouch
  }, info) => {
    test.setTimeout(150_000)
    await page.setViewportSize({ width: 320, height: 700 })
    await prepareAppearance(page, { theme: 'light', boxBorderMode: true })
    await prepareIsolatedSession(page, {
      platformSuper,
      tenantId: '11111111-1111-4111-8111-111111111111'
    })
    await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
      route.fulfill({
        json: [
          { code: 'tms', name: 'TMS智慧运输', baseUrl: '/tms/' },
          { code: 'scm', name: 'SCM供应链', baseUrl: '/scm/' }
        ]
      })
    )
    await page.route('**/rest/v1/rpc/tms_list_favorite_routes_secure', (route) =>
      route.fulfill({ json: { records: [], total: 0, fieldAccess: {} } })
    )
    await mockApplicationMenus(page, {
      tms: [
        {
          id: 'favorite-route-header',
          parentId: null,
          name: 'TmsFavoriteRoute',
          path,
          component: path,
          type: 'menu',
          sort: 1,
          meta: { title: '常用线路', is_enable: true, is_hide: false, roles: [] }
        }
      ]
    })
    await page.goto(`#${path}`, { waitUntil: 'commit' })
    await expect(page.getByRole('heading', { name: '常用线路', exact: true })).toBeVisible({
      timeout: 90_000
    })

    const header = page.locator('.art-header-bar__main')
    const sidebar = page.locator('#app-sidebar .menu-left')
    const sideToggle = header.getByRole('button', { name: toggleLabel, exact: true })
    const focusToggle = header.getByRole('button', { name: /自动专注浏览/ })
    const appSwitcher = header.getByRole('button', { name: '切换业务应用', exact: true })
    const tenantSwitcher = header.getByRole('button', { name: /^当前租户范围/ })
    const designReference = header.locator('.page-design-reference > button')
    const activate = (button: Locator) => (hasTouch ? button.tap() : button.click())
    const interactionWidths = new Set([320, 390, 800, 801, 1024])
    const widths = platformSuper
      ? [320, 360, 361, 375, 377, 378, 390, 440, 441, 485, 486, 800, 801, 1024]
      : interactionWidths
    for (const width of widths) {
      await page.setViewportSize({ width, height: width === 320 ? 700 : 900 })
      await expect(sideToggle).toBeVisible()
      await expect(appSwitcher).toBeVisible()
      if (platformSuper) await expect(tenantSwitcher).toBeVisible()
      await page.evaluate(() => document.fonts.ready.then(() => undefined))
      const geometry: Record<string, Awaited<ReturnType<typeof hitBounds>>> = {}
      for (const [name, button, minimum] of [
        ['侧边菜单', sideToggle, 34],
        ['全局专注', focusToggle, 24],
        ['业务应用', appSwitcher, 28],
        ...(platformSuper
          ? ([
              ['租户范围', tenantSwitcher, 28],
              ['设计参考', designReference, 24]
            ] as const)
          : [])
      ] as const) {
        await expect
          .poll(() => hitBounds(button), { message: `${width}px：${name}按钮命中` })
          .toMatchObject({ inside: true, hits: [true, true, true] })
        geometry[name] = await hitBounds(button)
        expect(geometry[name].width, `${width}px：${name}按钮宽度`).toBeGreaterThanOrEqual(minimum)
      }
      await info.attach(`application-toolbar-${width}-hit-areas`, {
        body: JSON.stringify(geometry),
        contentType: 'application/json'
      })
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
      if (!interactionWidths.has(width)) continue
      await header.screenshot({ path: info.outputPath(`application-toolbar-${width}.png`) })
      await expect(sidebar).toHaveClass(/menu-left-close/)
      await activate(sideToggle)
      await expect(sidebar).toHaveClass(/menu-left-open/)
      if (width <= 800) {
        await page.locator('.menu-model').click({ position: { x: width - 20, y: 140 } })
      } else {
        await sideToggle.click()
      }
      await expect(sidebar).toHaveClass(/menu-left-close/)
    }

    if (!platformSuper) {
      await page.setViewportSize({ width: 801, height: 900 })
      await activate(sideToggle)
      await expect(sidebar).toHaveClass(/menu-left-open/)
      await page.setViewportSize({ width: 800, height: 900 })
      await expect(sidebar).toBeHidden()
      await expect(sideToggle).toBeVisible()

      const mask = page.locator('.menu-model')
      await page.clock.install()
      await sideToggle.focus()
      for (const state of ['open', 'close', 'open']) {
        await page.keyboard.press('Enter')
        await expect(sidebar).toHaveClass(new RegExp(`menu-left-${state}`))
      }
      await page.clock.runFor(250)
      await expect(mask).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)')
      await activate(mask)
      await expect(sidebar).toBeHidden()
    }

    await page.setViewportSize({ width: 320, height: 700 })
    await sideToggle.focus()
    await page.keyboard.press('Enter')
    await expect(sidebar).toHaveClass(/menu-left-open/)
    await page.keyboard.press('Enter')
    await expect(sidebar).toHaveClass(/menu-left-close/)

    if (platformSuper) {
      await activate(tenantSwitcher)
      await expect(page.locator('.tenant-scope-switcher__menu')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.locator('.tenant-scope-switcher__menu')).toBeHidden()
    }
    await page.keyboard.press('ControlOrMeta+k')
    const searchInput = page.locator('.art-global-search__input input')
    await expect(searchInput).toBeVisible()
    await expect(searchInput).toBeFocused()
  })
}
