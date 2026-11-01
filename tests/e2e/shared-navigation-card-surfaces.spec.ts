import { expect, test, type Locator, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })

async function geometry(panel: Locator) {
  return panel.evaluate((element) => {
    const card = element.getBoundingClientRect()
    const scrollbar = element.querySelector('.art-section-card__scrollbar')!
    const body = element.querySelector('.art-section-card__body')!
    const wrap = element.querySelector('.el-scrollbar__wrap')!
    return {
      scrollbarCount: element.querySelectorAll('.el-scrollbar').length,
      trackGutter: Math.round(card.right - scrollbar.getBoundingClientRect().right),
      inlinePadding: getComputedStyle(body).paddingRight,
      clipPath: getComputedStyle(wrap).clipPath,
      clientHeight: wrap.clientHeight,
      scrollHeight: wrap.scrollHeight
    }
  })
}

async function appearance(page: Page, theme: string, box: string) {
  await page.evaluate(
    ({ theme, box }) => {
      document.documentElement.classList.toggle('dark', theme === 'dark')
      document.documentElement.dataset.uiScope = 'workspace'
      document.documentElement.dataset.boxMode = box
    },
    { theme, box }
  )
}

test('组织范围卡保留搜索、计数、下级范围、未归属及真实抽屉，并对齐MES滚动几何', async ({
  page
}, info) => {
  test.setTimeout(120_000)
  await prepareIsolatedSession(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/tests/e2e/fixtures/shared-navigation-card-surfaces.html')
  const panel = page.locator('.navigation-card-panel > .user-organization-filter')
  await expect(panel).toBeVisible()
  await expect(panel.getByText('31 个可用节点')).toBeVisible()
  await expect(panel.locator('.user-organization-filter__selection')).toContainText('40人')
  const row = panel.locator('.el-tree-node__content').first()
  await expect
    .poll(() => row.evaluate((element) => element.getBoundingClientRect().height))
    .toBe(48)
  const childBranch = panel.locator('.el-tree-node__children').first()
  expect(await childBranch.evaluate((element) => getComputedStyle(element).borderLeftStyle)).toBe(
    'dashed'
  )
  const reference = page.locator('.production-work-center-navigator')
  const orgGeometry = await geometry(panel)
  const mesGeometry = await geometry(reference)
  expect(orgGeometry.scrollbarCount).toBe(1)
  expect(orgGeometry.trackGutter).toBe(mesGeometry.trackGutter)
  expect(orgGeometry.inlinePadding).toBe(mesGeometry.inlinePadding)
  expect(orgGeometry.clipPath).toBe(mesGeometry.clipPath)
  expect(orgGeometry.scrollHeight).toBeGreaterThan(orgGeometry.clientHeight)
  await panel.getByRole('textbox', { name: '搜索组织名称或编码' }).fill('ENG')
  await expect(panel.getByText('工程技术部门', { exact: true })).toBeVisible()
  await expect(panel.getByText('导航验收第二公司', { exact: true })).toBeHidden()
  await panel.getByRole('textbox').clear()
  await panel.getByText('导航验收公司', { exact: true }).click()
  await expect(page.getByLabel('已选组织键')).toHaveText('company-a')
  await expect(panel.locator('.user-organization-filter__selection')).toContainText('5人')
  await panel.getByRole('switch', { name: '包含下级组织' }).locator('..').click()
  await expect(panel.locator('.user-organization-filter__selection')).toContainText('2人')
  await panel.getByRole('button', { name: /待归属用户/ }).click()
  await expect(page.getByLabel('已选组织键')).toHaveText('__unassigned_organization__')
  await expect(panel.getByRole('switch', { name: '包含下级组织' })).toBeDisabled()
  await panel.getByRole('button', { name: '刷新组织结构' }).click()
  await expect(page.getByLabel('组织刷新次数')).toHaveText('1')
  for (const [type, allLabel, unit] of [
    ['role', '全部角色', '个'],
    ['employee', '全部员工', '人'],
    ['position', '全部岗位', '']
  ] as const) {
    await page.getByRole('button', { name: `范围 ${type}`, exact: true }).click()
    await panel.getByRole('button', { name: new RegExp(allLabel) }).click()
    await expect(panel.locator('.user-organization-filter__selection')).toContainText(allLabel)
    if (unit)
      await expect(panel.locator('.user-organization-filter__selection')).toContainText(`40${unit}`)
    else await expect(panel.getByRole('button', { name: /待归属/ })).toHaveCount(0)
  }
  await page.getByRole('button', { name: '范围 user', exact: true }).click()
  await page.getByRole('button', { name: '切换空组织' }).click()
  await expect(panel.getByText('暂无组织结构', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '切换组织加载' }).click()
  await expect(panel).toHaveAttribute('aria-busy', 'true')
  await page.getByRole('button', { name: '切换组织加载' }).click()
  await page.getByRole('button', { name: '切换空组织' }).click()
  await page.getByRole('button', { name: '打开组织抽屉' }).click()
  const drawer = page.getByRole('dialog', { name: '组织范围抽屉', exact: true })
  const drawerPanel = drawer.locator('.user-organization-filter')
  await expect(drawerPanel).toBeVisible()
  for (const theme of ['light', 'dark']) {
    for (const box of ['border-mode', 'shadow-mode']) {
      await appearance(page, theme, box)
      expect(
        await drawerPanel.evaluate((element) => {
          const style = getComputedStyle(element)
          return {
            border: style.borderTopWidth,
            radius: style.borderTopLeftRadius,
            shadow: style.boxShadow
          }
        })
      ).toEqual({ border: '0px', radius: '0px', shadow: 'none' })
    }
  }
  await page.screenshot({ path: info.outputPath('organization-drawer-dark-shadow.png') })
  await drawer.getByRole('button', { name: 'Close this dialog' }).click()
  await expect(drawer).not.toBeVisible()
  await panel.locator('.el-scrollbar__wrap').evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await page.screenshot({ path: info.outputPath('organization-mes-scroll-bottom.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  expect((await geometry(panel)).inlinePadding).toBe('16px')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.screenshot({ path: info.outputPath('organization-mobile.png') })
  await info.attach('organization-scroll-geometry', {
    body: JSON.stringify({ orgGeometry, mesGeometry }, null, 2),
    contentType: 'application/json'
  })
  expect(errors).toEqual([])
})

test('网站配置导航保留只读长页定位、桌面sticky、900网格与390横向滚动', async ({ page }, info) => {
  test.setTimeout(150_000)
  await prepareIsolatedSession(page)
  const writes: string[] = []
  await page.route('**/rest/v1/**', (route) => {
    const request = route.request()
    if (
      ['PATCH', 'PUT', 'DELETE'].includes(request.method()) ||
      (request.method() === 'POST' && !request.url().includes('/rpc/'))
    )
      writes.push(`${request.method()} ${request.url()}`)
    return route.fulfill({ json: [] })
  })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/tests/e2e/fixtures/shared-navigation-card-surfaces.html?page=website')
  const nav = page.getByRole('navigation', { name: '网站配置分组' })
  await expect(nav).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText('只读模式', { exact: true })).toBeVisible()
  await expect(page.locator('.website-config-page > .art-async-state')).toHaveAttribute(
    'aria-busy',
    'false'
  )
  const results = []
  for (const [width, theme, box] of [
    [1440, 'light', 'border-mode'],
    [1440, 'dark', 'shadow-mode'],
    [900, 'light', 'shadow-mode'],
    [390, 'dark', 'border-mode']
  ] as const) {
    await page.setViewportSize({ width, height: 900 })
    await appearance(page, theme, box)
    await page
      .locator('#app-main > .app-main__scrollbar > .app-main__scroll-wrap')
      .evaluate((element) => {
        element.scrollTop = 0
      })
    const state = await nav.evaluate((element) => {
      const style = getComputedStyle(element)
      const items = element.querySelector('.website-config-page__nav-items')!
      const body = element.querySelector('.art-section-card__body')!
      const wrap = element.querySelector('.el-scrollbar__wrap')!
      return {
        position: style.position,
        itemDisplay: getComputedStyle(items).display,
        gridColumns: getComputedStyle(items).gridTemplateColumns,
        topPadding: getComputedStyle(body).paddingTop,
        bottomPadding: getComputedStyle(body).paddingBottom,
        height: element.getBoundingClientRect().height,
        headerDisplay: getComputedStyle(element.querySelector('.art-section-card__header')!)
          .display,
        footerDisplay: getComputedStyle(element.querySelector('.art-section-card__footer')!)
          .display,
        clientWidth: wrap.clientWidth,
        scrollWidth: wrap.scrollWidth
      }
    })
    await page.screenshot({
      path: info.outputPath(`website-nav-${width}-${theme}-${box}.png`)
    })
    if (width > 900) {
      expect(state.position).toBe('sticky')
      await nav.getByRole('button', { name: '联系合规', exact: true }).click()
      await expect(nav.getByRole('button', { name: '联系合规', exact: true })).toHaveClass(
        /is-active/
      )
      await expect
        .poll(() => nav.evaluate((element) => Math.round(element.getBoundingClientRect().top)))
        .toBe(120)
    } else if (width === 900) {
      expect(state.position).toBe('static')
      expect(state.itemDisplay).toBe('grid')
      expect(state.gridColumns.split(' ')).toHaveLength(3)
      await nav.getByRole('button', { name: '认证渠道', exact: true }).click()
      await expect(nav.getByRole('button', { name: '认证渠道', exact: true })).toHaveClass(
        /is-active/
      )
    } else {
      expect(state.itemDisplay).toBe('flex')
      expect(state.headerDisplay).toBe('none')
      expect(state.footerDisplay).toBe('none')
      expect(state.topPadding).toBe('16px')
      expect(state.height).toBeLessThanOrEqual(76)
      expect(state.scrollWidth).toBeGreaterThan(state.clientWidth)
      await nav.locator('.el-scrollbar__wrap').evaluate((element) => {
        element.scrollLeft = element.scrollWidth
      })
      await expect(nav.getByRole('button', { name: '发布预览', exact: true })).toBeInViewport()
      await nav.getByRole('button', { name: '发布预览', exact: true }).click()
      await expect(nav.getByRole('button', { name: '发布预览', exact: true })).toHaveClass(
        /is-active/
      )
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width
    )
    results.push({ width, theme, box, state })
    await page.screenshot({ path: info.outputPath(`website-${width}-${theme}-${box}.png`) })
  }
  await info.attach('website-navigation-geometry', {
    body: JSON.stringify(results, null, 2),
    contentType: 'application/json'
  })
  expect(writes).toEqual([])
  expect(errors).toEqual([])
})
