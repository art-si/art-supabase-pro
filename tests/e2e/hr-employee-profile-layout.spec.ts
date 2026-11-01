import { expect, test, type Locator, type Page } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { prepareIsolatedSession } from './support/isolated-session'

const tenantId = '11111111-1111-4111-8111-111111111111'
const sourceUserId = '22222222-2222-4222-8222-222222222222'
const tabs = ['基础信息', '劳动合同', '教育背景', '工作经历', '培训经历', '奖惩经历']

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

async function open(page: Page, theme: string, longNotice = false) {
  await prepareIsolatedSession(page)
  await page.routeWebSocket(/^ws:\/\/(?:127\.0\.0\.1|localhost):\d+\//, (socket) => socket.close())
  const writes: string[] = []
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (request.method() !== 'GET' && !path.includes('/rpc/')) writes.push(path)
    if (/\/(?:save|create|link|delete|update)_/.test(path)) writes.push(path)
    await route.fulfill({
      json: path.endsWith('/sys_tenant')
        ? [{ id: tenantId, tenant_code: 'TEST', tenant_name: '验收租户', status: '1' }]
        : []
    })
  })
  const email = longNotice
    ? `${'employee-profile-layout-'.repeat(8)}@example.invalid`
    : 'employee-profile-layout@example.invalid'
  const query = new URLSearchParams({
    entry: 'employee-profile',
    theme,
    sourceUserId,
    email,
    tenantId,
    returnPath: '/system/user'
  })
  await page.goto(`/tests/e2e/fixtures/form-standard-modules.html?${query}`)
  const profile = page.locator('.hr-profile-page')
  await expect(profile.getByRole('heading', { name: '新增员工档案' })).toBeVisible({
    timeout: 60_000
  })
  await expect(profile.locator('.art-async-state[aria-busy="true"]')).toHaveCount(0, {
    timeout: 60_000
  })
  await expect(profile.getByRole('textbox', { name: /员工姓名/ })).toBeVisible()
  await expect(profile.locator('.hr-profile-page__access-notice')).toContainText(email)
  return { profile, writes, pageErrors }
}

async function geometry(profile: Locator) {
  return profile.evaluate((element) => {
    const root = element.getBoundingClientRect()
    const header = element.querySelector('.art-page-header')?.getBoundingClientRect()
    const summary = element.querySelector('.hr-profile-page__summary')?.getBoundingClientRect()
    const footer = element.querySelector('.hr-profile-page__footer')?.getBoundingClientRect()
    const alert = element.querySelector('.hr-profile-page__access-notice')
    const alertRect = alert?.getBoundingClientRect()
    const title = alert?.querySelector('.el-alert__title')?.getBoundingClientRect()
    const alertStyle = alert ? getComputedStyle(alert) : null
    const padding = alertStyle
      ? Number.parseFloat(alertStyle.paddingTop) + Number.parseFloat(alertStyle.paddingBottom)
      : 0
    return {
      headerGap: header && summary ? summary.top - header.bottom : null,
      alertHeight: alertRect?.height ?? 0,
      alertNaturalHeight: title ? title.height + padding : 0,
      rootBottom: root.bottom,
      rootHeight: root.height,
      footerTop: footer?.top ?? 0,
      footerBottom: footer?.bottom ?? 0,
      documentHeight: document.documentElement.scrollHeight,
      viewportHeight: innerHeight,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1
    }
  })
}

for (const [theme, width, height, longNotice] of [
  ['light', 1440, 900, false],
  ['light', 1280, 800, true],
  ['dark', 1440, 900, true],
  ['dark', 1280, 800, false]
] as const) {
  test(`员工档案固定区域与页签滚动 · ${theme} · ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height })
    const { profile, writes, pageErrors } = await open(page, theme, longNotice)
    const initial = await geometry(profile)
    await info.attach('initial-layout.json', {
      body: JSON.stringify(initial),
      contentType: 'application/json'
    })
    await writeFile(info.outputPath('initial-layout.json'), JSON.stringify(initial, null, 2))
    await page.screenshot({ path: info.outputPath('profile-basic-top.png') })
    expect(initial.headerGap, '页头与员工摘要之间应保留间距').toBeGreaterThanOrEqual(12)
    expect(initial.alertHeight, '账号关联提示应保留完整自然行高').toBeGreaterThanOrEqual(
      initial.alertNaturalHeight - 1
    )
    expect(initial.documentHeight, '外层页面不能因基础表单内容产生滚动').toBeLessThanOrEqual(
      height + 1
    )
    expect(initial.horizontalOverflow).toBe(false)

    const footer = profile.locator('.hr-profile-page__footer')
    await expect(footer.getByRole('button', { name: '保存员工档案', exact: true })).toBeInViewport({
      ratio: 1
    })
    const tablist = profile.getByRole('tablist')
    await expect(tablist.getByRole('tab')).toHaveCount(tabs.length)
    for (const [index, label] of tabs.entries()) {
      await tablist.getByRole('tab', { name: new RegExp(label) }).click()
      const current = await geometry(profile)
      expect(current.documentHeight, `${label}不应拉长外层页面`).toBeLessThanOrEqual(height + 1)
      expect(current.footerTop, `${label}不应改变保存栏位置`).toBeCloseTo(initial.footerTop, 0)
      expect(current.alertHeight).toBeGreaterThanOrEqual(current.alertNaturalHeight - 1)
      expect(current.horizontalOverflow).toBe(false)
      if (index > 0) {
        const empty = profile.locator('.hr-history-section__empty:visible')
        await expect(empty).toContainText(`暂无${label}`)
        await empty.getByRole('button').scrollIntoViewIfNeeded()
        await expect(empty.getByRole('button')).toBeInViewport({ ratio: 1 })
      }
    }
    await page.screenshot({ path: info.outputPath('profile-history-empty.png') })

    await tablist.getByRole('tab', { name: '基础信息', exact: true }).click()
    const contentScroll = profile.locator('.hr-profile-page__scroll > .el-scrollbar__wrap')
    await expect(contentScroll).toHaveCount(1)
    const scrollMetrics = await contentScroll.evaluate((element) => {
      element.scrollTop = element.scrollHeight
      return { clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }
    })
    expect(scrollMetrics.scrollHeight).toBeGreaterThan(scrollMetrics.clientHeight + 1)
    await expect(profile.getByRole('textbox', { name: /备注/ })).toBeInViewport({ ratio: 1 })
    const afterScroll = await geometry(profile)
    expect(afterScroll.footerTop).toBeCloseTo(initial.footerTop, 0)
    expect(afterScroll.documentHeight).toBeLessThanOrEqual(height + 1)
    await expect(footer.getByRole('button', { name: '保存员工档案', exact: true })).toBeInViewport({
      ratio: 1
    })
    await page.screenshot({ path: info.outputPath('profile-basic-bottom.png') })
    expect(writes).toEqual([])
    expect(pageErrors).toEqual([])
  })
}

test('员工档案在200%等效布局视口内保持提示完整且保存操作可达', async ({ page }, info) => {
  // 1440 × 900 at 200% zoom exposes a 720 × 450 CSS layout viewport.
  await page.setViewportSize({ width: 720, height: 450 })
  const { profile, writes, pageErrors } = await open(page, 'light')
  const notice = profile.locator('.hr-profile-page__access-notice')
  await notice.scrollIntoViewIfNeeded()
  const initial = await geometry(profile)
  expect(initial.alertHeight).toBeGreaterThanOrEqual(initial.alertNaturalHeight - 1)
  expect(initial.horizontalOverflow).toBe(false)
  const save = profile.getByRole('button', { name: '保存员工档案', exact: true })
  await save.scrollIntoViewIfNeeded()
  await expect(save).toBeInViewport({ ratio: 1 })
  await page.screenshot({ path: info.outputPath('profile-zoom-200-reflow.png') })
  expect(writes).toEqual([])
  expect(pageErrors).toEqual([])
})

test('员工档案多履历草稿滚动到底可达，跨页签校验在内容滚动器定位且保存栏稳定', async ({
  page
}, info) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  const { profile, writes, pageErrors } = await open(page, 'light')
  const initial = await geometry(profile)
  const workTab = profile.getByRole('tab', { name: /工作经历/ })
  await workTab.click()
  const addWork = profile.getByRole('button', { name: '新增工作经历', exact: true }).first()
  await addWork.click()
  await addWork.click()
  const cards = profile.locator('.el-tab-pane:visible .hr-history-card')
  await expect(cards).toHaveCount(2)
  const contentScroll = profile.locator('.hr-profile-page__scroll > .el-scrollbar__wrap')
  await contentScroll.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect(cards.last().getByRole('textbox', { name: '主要职责', exact: true })).toBeInViewport(
    { ratio: 1 }
  )
  const save = profile.getByRole('button', { name: '保存员工档案', exact: true })
  await expect(save).toBeInViewport({ ratio: 1 })
  expect((await geometry(profile)).footerTop).toBeCloseTo(initial.footerTop, 0)
  await page.screenshot({ path: info.outputPath('profile-two-work-records-bottom.png') })

  await save.click()
  await expect(profile.getByRole('tab', { name: '基础信息', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  const invalidField = profile.locator('.el-form-item.is-error:visible').first()
  await expect(invalidField).toBeInViewport({ ratio: 1 })
  await expect(invalidField.locator('.el-form-item__error')).toBeVisible()
  await expect(save).toBeInViewport({ ratio: 1 })
  const afterValidation = await geometry(profile)
  expect(afterValidation.footerTop).toBeCloseTo(initial.footerTop, 0)
  expect(afterValidation.documentHeight).toBeLessThanOrEqual(801)
  expect(afterValidation.horizontalOverflow).toBe(false)
  await page.screenshot({ path: info.outputPath('profile-invalid-field-position.png') })
  await workTab.click()
  await expect(cards).toHaveCount(2)
  expect(writes).toEqual([])
  expect(pageErrors).toEqual([])
})

for (const theme of ['light', 'dark']) {
  test(`员工档案合同页签处滚动条可命中并拖动 · ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    const { profile, writes, pageErrors } = await open(page, theme)
    await profile.getByRole('tab', { name: /劳动合同/ }).click()
    await profile.getByRole('button', { name: '新增合同', exact: true }).first().click()
    await expect(profile.locator('.el-tab-pane:visible .hr-history-card')).toHaveCount(1)
    const scroll = profile.locator('.hr-profile-page__scroll')
    const viewport = scroll.locator(':scope > .el-scrollbar__wrap')
    await viewport.evaluate((element) => {
      element.scrollTop = 0
    })
    await scroll.hover()
    const bar = scroll.locator(':scope > .el-scrollbar__bar.is-vertical')
    const thumb = bar.locator('.el-scrollbar__thumb')
    await expect
      .poll(() => bar.evaluate((element) => Number.parseFloat(getComputedStyle(element).opacity)))
      .toBeGreaterThan(0)
    await expect(thumb).toBeVisible()
    const header = await profile.locator('.hr-profile-page__tabs > .el-tabs__header').boundingBox()
    const track = await bar.boundingBox()
    expect(header).not.toBeNull()
    expect(track).not.toBeNull()
    const point = { x: track!.x + track!.width / 2, y: header!.y + header!.height / 2 }
    expect(point.y).toBeGreaterThan(track!.y)
    expect(point.y).toBeLessThan(track!.y + track!.height)
    const hit = await bar.evaluate((element, position) => {
      const target = document.elementFromPoint(position.x, position.y)
      return {
        scrollbarReceivesPointer: target?.closest('.el-scrollbar__bar') === element,
        targetClass: target?.getAttribute('class')
      }
    }, point)
    expect(
      hit.scrollbarReceivesPointer,
      `页签高度处应命中滚动条，实际命中 ${hit.targetClass}`
    ).toBe(true)
    await writeFile(
      info.outputPath('scrollbar-hit-test.json'),
      JSON.stringify({ point, hit }, null, 2)
    )
    await page.screenshot({ path: info.outputPath(`profile-scrollbar-over-tabs-${theme}.png`) })
    const handle = await thumb.boundingBox()
    expect(handle).not.toBeNull()
    const before = await viewport.evaluate((element) => element.scrollTop)
    const start = { x: handle!.x + handle!.width / 2, y: handle!.y + handle!.height / 2 }
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(start.x, Math.min(track!.y + track!.height - 4, start.y + 90), {
      steps: 15
    })
    await page.mouse.up()
    await expect
      .poll(() => viewport.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(before + 20)
    await expect(profile.getByRole('button', { name: '保存员工档案', exact: true })).toBeInViewport(
      { ratio: 1 }
    )
    expect((await geometry(profile)).documentHeight).toBeLessThanOrEqual(801)
    await page.screenshot({ path: info.outputPath(`profile-scrollbar-dragged-${theme}.png`) })
    expect(writes).toEqual([])
    expect(pageErrors).toEqual([])
  })
}
