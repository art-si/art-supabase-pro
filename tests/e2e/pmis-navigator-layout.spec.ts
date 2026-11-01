import { expect, test, type Locator, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(120_000)

const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = '22222222-2222-4222-8222-222222222222'
const calendarFixture = '/tests/e2e/fixtures/pmis-calendar-scope.html?configured=true'

function departments(tenantId: string) {
  const prefix = tenantId === tenantA ? '甲' : '乙'
  return [
    { id: `${prefix}-factory`, parent_id: null, department_name: `${prefix}验收工厂` },
    {
      id: `${prefix}-workshop`,
      parent_id: `${prefix}-factory`,
      department_name: `${prefix}装配车间`
    },
    ...Array.from({ length: 35 }, (_, index) => ({
      id: `${prefix}-line-${index + 1}`,
      parent_id: `${prefix}-workshop`,
      department_name: `${prefix}装配产线 ${String(index + 1).padStart(2, '0')}`
    }))
  ].map((row, index) => ({
    ...row,
    tenant_id: tenantId,
    department_code: `D-${index}`,
    sort: index,
    enabled: true
  }))
}

async function appearance(page: Page, width: number, theme: string, box: string) {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
  await page.evaluate(
    ({ theme, box }) => {
      document.documentElement.dataset.uiScope = 'workspace'
      document.documentElement.classList.toggle('dark', theme === 'dark')
      document.documentElement.dataset.boxMode = box
      // This fixture has the tenant test control above the real page instead of the app shell.
      document.documentElement.style.setProperty('--art-full-height', 'calc(100vh - 58px)')
    },
    { theme, box }
  )
  await expect(page.locator('html')).toHaveAttribute('data-ui-scope', 'workspace')
}

async function cardGeometry(card: Locator) {
  await expect(card).toHaveClass(/art-section-card/)
  await expect(card.locator('.el-scrollbar')).toHaveCount(1)
  const scroll = card.locator(':scope > .art-section-card__scrollbar')
  await scroll.hover()
  const bar = scroll.locator(':scope > .el-scrollbar__bar.is-vertical')
  await expect(bar).toBeVisible()
  const geometry = await card.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    const scrollbar = element.querySelector(':scope > .art-section-card__scrollbar')!
    const identity = element.querySelector('.art-section-card__identity')!
    const actions = element.querySelector('.art-section-card__actions')!
    const body = scrollbar.querySelector('.art-section-card__body')!
    const track = scrollbar.querySelector(':scope > .el-scrollbar__bar.is-vertical')!
    return {
      identityInset: identity.getBoundingClientRect().left - bounds.left,
      actionsInset: bounds.right - actions.getBoundingClientRect().right,
      scrollbarLeftInset: scrollbar.getBoundingClientRect().left - bounds.left,
      scrollbarRightInset: bounds.right - scrollbar.getBoundingClientRect().right,
      trackInset: bounds.right - track.getBoundingClientRect().right,
      bodyPadding: parseFloat(getComputedStyle(body).paddingRight),
      border: parseFloat(style.borderRightWidth),
      shadow: style.boxShadow
    }
  })
  expect(geometry.trackInset).toBeGreaterThanOrEqual(1)
  expect(geometry.trackInset).toBeLessThanOrEqual(6)
  expect(geometry.scrollbarLeftInset).toBeLessThanOrEqual(2)
  expect(geometry.scrollbarRightInset).toBeLessThanOrEqual(2)
  expect(geometry.bodyPadding).toBeGreaterThanOrEqual(16)
  expect(geometry.identityInset).toBeCloseTo(geometry.bodyPadding + geometry.border, 0)
  expect(geometry.actionsInset).toBeCloseTo(geometry.bodyPadding + geometry.border, 0)
  return geometry
}

async function noOverflow(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
}

test('PMIS 明细部门树沿用 MES 卡片标题、操作与边缘滚动轨道', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await prepareIsolatedSession(page)
  const reads: string[] = []
  await page.route('**/rest/v1/**', (route) => {
    const request = route.request()
    const resource = new URL(request.url()).pathname.split('/').at(-1)
    const tenant = request.headers()['x-art-tenant-scope'] || tenantA
    const rows = resource === 'mdm_production_department' ? departments(tenant) : []
    if (resource === 'mdm_production_department') reads.push(tenant)
    return route.fulfill({
      json: rows,
      headers: {
        'content-range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0',
        'access-control-expose-headers': 'content-range'
      }
    })
  })
  const baseline = new Map<number, Awaited<ReturnType<typeof cardGeometry>>>()
  for (const profile of [
    { width: 1440, theme: 'light', box: 'border-mode' },
    { width: 390, theme: 'dark', box: 'shadow-mode' }
  ]) {
    await page.goto('/tests/e2e/fixtures/section-scroll-business.html?mode=navigator')
    const mes = page.locator('.production-work-center-navigator')
    await expect(mes.getByRole('button', { name: /WC35 · 验收中心35/ })).toBeAttached()
    await appearance(page, profile.width, profile.theme, profile.box)
    baseline.set(profile.width, await cardGeometry(mes))
    await page.screenshot({
      path: info.outputPath(`mes-baseline-${profile.width}.png`),
      fullPage: true
    })
  }

  await page.goto(calendarFixture)
  const card = page.getByRole('complementary', { name: '部门与产线范围' })
  await expect(card.getByText('甲装配产线 35', { exact: true })).toBeAttached()
  await expect(card.locator('.pmis-department-navigator__all strong')).toHaveText('37')
  const shadows = new Map<string, string>()
  for (const width of [1440, 390]) {
    for (const theme of ['light', 'dark']) {
      for (const box of ['border-mode', 'shadow-mode']) {
        await appearance(page, width, theme, box)
        const geometry = await cardGeometry(card)
        expect(geometry.trackInset).toBeCloseTo(baseline.get(width)!.trackInset, 0)
        expect(geometry.bodyPadding).toBe(baseline.get(width)!.bodyPadding)
        if (box === 'shadow-mode') {
          expect(geometry.shadow).not.toBe('none')
          expect(geometry.shadow).not.toBe(shadows.get(`${width}-${theme}`))
        } else shadows.set(`${width}-${theme}`, geometry.shadow)
        if (width === 390) {
          await expect(page.locator('.art-workspace-splitter')).toHaveClass(/is-stacked/)
          expect((await card.boundingBox())!.height).toBeCloseTo(300, 0)
        }
        await noOverflow(page)
        await page.screenshot({
          path: info.outputPath(`pmis-${width}-${theme}-${box}.png`),
          fullPage: true
        })
      }
    }
  }

  await appearance(page, 900, 'dark', 'shadow-mode')
  expect((await card.boundingBox())!.height).toBeCloseTo(300, 0)
  const toolbar = card.locator(':scope > .art-section-card__toolbar')
  const toolbarOffset = (await toolbar.boundingBox())!.y - (await card.boundingBox())!.y
  const first = card.getByRole('treeitem', { name: '甲装配产线 01', exact: true })
  const last = card.getByRole('treeitem', { name: '甲装配产线 35', exact: true })
  await first.focus()
  for (let index = 0; index < 34; index++) await page.keyboard.press('ArrowDown')
  await expect(last).toBeFocused()
  const wrap = card.locator(':scope > .art-section-card__scrollbar > .el-scrollbar__wrap')
  await expect.poll(() => wrap.evaluate((node) => node.scrollTop)).toBeGreaterThan(0)
  const visibleBounds = (await wrap.boundingBox())!
  const lastBounds = (await last.locator(':scope > .el-tree-node__content').boundingBox())!
  expect(lastBounds.y + lastBounds.height).toBeLessThanOrEqual(
    visibleBounds.y + visibleBounds.height - 16
  )
  expect((await toolbar.boundingBox())!.y - (await card.boundingBox())!.y).toBeCloseTo(
    toolbarOffset,
    0
  )
  await page.keyboard.press('ArrowRight')
  await expect(last).toHaveClass(/is-current/)
  await expect(page.locator('.business-workspace-header__tags')).toContainText('甲装配产线 35')
  await card.getByRole('button', { name: '清除部门与产线筛选', exact: true }).click()
  await expect(card.locator('.el-tree-node.is-current')).toHaveCount(0)
  await expect(page.locator('.business-workspace-header__tags')).toContainText('全部产线')
  await card
    .getByRole('treeitem', { name: '甲装配车间', exact: true })
    .locator(':scope > .el-tree-node__content')
    .click()
  await expect(page.locator('.business-workspace-header__tags')).toContainText('甲装配车间')
  await page.getByRole('button', { name: '切换租户 B', exact: true }).click()
  await expect(card.getByText('乙装配产线 01', { exact: true })).toBeVisible()
  await expect(card.getByText('甲装配产线 01', { exact: true })).toHaveCount(0)
  await expect(card.locator('.el-tree-node.is-current')).toHaveCount(0)
  await expect(card.getByRole('button', { name: '清除部门与产线筛选', exact: true })).toBeDisabled()
  await expect(page.locator('.business-workspace-header__tags')).toContainText('全部产线')
  expect(reads.slice(-2)).toEqual([tenantA, tenantB])

  await appearance(page, 1440, 'light', 'border-mode')
  const splitter = page.locator('.art-workspace-splitter')
  const primary = splitter.locator(':scope > .el-splitter-panel').first()
  await expect(splitter).not.toHaveClass(/is-stacked/)
  await splitter.locator('.el-splitter-bar__dragger').hover()
  await splitter.locator('.el-splitter-bar__horizontal-collapse-icon-start').click()
  await expect.poll(async () => (await primary.boundingBox())!.width).toBeLessThanOrEqual(1)
  await splitter.locator('.el-splitter-bar__dragger').hover()
  await splitter.locator('.el-splitter-bar__horizontal-collapse-icon-end').click()
  await expect.poll(async () => (await primary.boundingBox())!.width).toBeGreaterThan(240)
  await cardGeometry(card)
  await noOverflow(page)
  await page.screenshot({
    path: info.outputPath('pmis-restored-tenant-and-sidebar.png'),
    fullPage: true
  })
  expect(errors).toEqual([])
})

test('PMIS 部门卡加载、错误重试与租户空态由同一滚动表面承载', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  let release: (() => void) | undefined
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  let calls = 0
  await page.route('**/rest/v1/mdm_production_department?*', async (route) => {
    calls++
    if (calls === 1) {
      await pending
      return route.fulfill({
        status: 500,
        json: { code: 'PGRST500', message: 'fixture private diagnostic' }
      })
    }
    const rows =
      route.request().headers()['x-art-tenant-scope'] === tenantB ? [] : departments(tenantA)
    return route.fulfill({ json: rows, headers: { 'content-range': `*/${rows.length}` } })
  })
  await page.goto(calendarFixture, { waitUntil: 'domcontentloaded' })
  const card = page.getByRole('complementary', { name: '部门与产线范围' })
  await expect(card).toHaveAttribute('aria-busy', 'true')
  await appearance(page, 390, 'dark', 'shadow-mode')
  await expect(card.getByText('部门 / 产线', { exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('pmis-loading-mobile.png'), fullPage: true })
  release?.()
  await expect(card.getByText('生产组织加载失败', { exact: true })).toBeVisible()
  await expect(card.locator('.el-scrollbar')).toHaveCount(1)
  await expect(page.locator('body')).not.toContainText('fixture private diagnostic')
  await page.screenshot({ path: info.outputPath('pmis-error-mobile.png'), fullPage: true })
  const errorGeometry = await card.evaluate((element) => {
    const wrap = element.querySelector('.el-scrollbar__wrap')!
    const state = element.querySelector('.art-section-card__body')!
    const result = element.querySelector('.el-result')!
    const retry = result.querySelector('button')!
    const wrapBounds = wrap.getBoundingClientRect()
    const retryBounds = retry.getBoundingClientRect()
    return {
      cardHeight: element.getBoundingClientRect().height,
      viewportHeight: wrapBounds.height,
      viewportTop: wrapBounds.top,
      visibleBottom: wrapBounds.bottom - parseFloat(getComputedStyle(wrap).scrollPaddingBottom),
      resultHeight: result.getBoundingClientRect().height,
      stateHeight: state.getBoundingClientRect().height,
      stateMinHeight: getComputedStyle(state).minHeight,
      retryTop: retryBounds.top,
      retryBottom: retryBounds.bottom,
      scrollTop: wrap.scrollTop
    }
  })
  await info.attach('initial-error-geometry', {
    body: JSON.stringify(errorGeometry, null, 2),
    contentType: 'application/json'
  })
  expect(errorGeometry.scrollTop).toBe(0)
  expect(errorGeometry.retryTop).toBeGreaterThanOrEqual(errorGeometry.viewportTop)
  expect(errorGeometry.retryBottom).toBeLessThanOrEqual(errorGeometry.visibleBottom)
  await card.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(card.getByText('甲装配产线 35', { exact: true })).toBeAttached()
  await expect(card).toHaveAttribute('aria-busy', 'false')
  await cardGeometry(card)
  await page.getByRole('button', { name: '切换租户 B', exact: true }).click()
  await expect(card.getByText('暂无部门或产线', { exact: true })).toBeVisible()
  await expect(card.locator('.el-scrollbar')).toHaveCount(1)
  await expect(card.locator('.pmis-department-navigator__all strong')).toHaveText('0')
  expect(calls).toBe(3)
  await noOverflow(page)
  await page.screenshot({ path: info.outputPath('pmis-empty-mobile.png'), fullPage: true })
})
