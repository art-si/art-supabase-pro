import { expect, test, type Locator } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { expectOverlayTabPanel } from './support/overlay-tab-card'
import { prepareAppearance, assertAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)
const shadowClipTitle = '项目原生弹层页签保留内部卡片阴影与滚动'
const project = {
  id: 'project-a',
  tenant_id: 'tenant-a',
  project_code: 'PR-TEST',
  project_name: '设备装配项目',
  customer_name: '测试客户',
  project_status: null,
  quotation_count: 2,
  latest_quotation_no: 'Q-002',
  latest_quotation_date: '2026-10-08'
}
test.beforeEach(async ({ page }, testInfo) => {
  await prepareIsolatedSession(page)
  const shadowClipCase = testInfo.title === shadowClipTitle
  const theme =
    (shadowClipCase && testInfo.project.name === 'mobile-390') ||
    testInfo.project.use.colorScheme === 'dark'
      ? 'dark'
      : 'light'
  await prepareAppearance(page, { theme, boxBorderMode: !shadowClipCase && theme === 'light' })
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/rpc/scm_project_quotation_projects', (route) =>
    route.fulfill({ json: { records: [project], total: 1 } })
  )
  await page.route('**/rest/v1/rpc/scm_project_quotation_profile', (route) =>
    route.fulfill({
      json: {
        ...project,
        owner_name: '测试负责人',
        salesperson_name: '测试销售员',
        contact_name: '测试联系人',
        contact_phone: null,
        address_detail: '装配车间',
        project_stage: null,
        remark: '项目业务资料'
      }
    })
  )
})

test.afterEach(async ({ page }, testInfo) => {
  const shadowClipCase = testInfo.title === shadowClipTitle
  const theme =
    (shadowClipCase && testInfo.project.name === 'mobile-390') ||
    testInfo.project.use.colorScheme === 'dark'
      ? 'dark'
      : 'light'
  await assertAppearance(page, { theme, boxBorderMode: !shadowClipCase && theme === 'light' })
})

test(shadowClipTitle, async ({ page }, info) => {
  const errors: string[] = []
  const writes: string[] = []
  const tabs: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {
    const { pathname } = new URL(request.url())
    if (
      pathname.startsWith('/rest/v1/') &&
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method()) &&
      !/\/rpc\/(scm_project_quotation_(projects|profile|tab)|current_is_super|get_organization_list_secure)$/.test(
        pathname
      )
    )
      writes.push(`${request.method()} ${pathname}`)
  })
  await page.route('**/rest/v1/rpc/scm_project_quotation_tab', (route) => {
    tabs.push(route.request().postDataJSON().p_tab)
    const records = Array.from({ length: 20 }, (_, index) => ({
      id: `category-${index}`,
      document_no: `Q-${String(index + 1).padStart(3, '0')}`,
      category_name: `设备装配分类 ${index + 1}`,
      quantity: index + 1,
      unit_price: 12,
      fee_total: 0,
      amount: (index + 1) * 12,
      currency: 'CNY'
    }))
    return route.fulfill({ json: { records, total: records.length } })
  })

  const assertCardClearance = async (card: Locator, label: string) => {
    await expect(card).toBeVisible()
    await expect(card).not.toHaveCSS('box-shadow', 'none')
    const clipping = await card.evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      const ancestors: {
        ancestor: string
        left?: number
        right?: number
        top?: number
        bottom?: number
      }[] = []
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent)
        const clipsX = /^(hidden|clip|auto|scroll)$/.test(style.overflowX)
        const clipsY = /^(hidden|clip|auto|scroll)$/.test(style.overflowY)
        if (!clipsX && !clipsY) continue
        const rect = parent.getBoundingClientRect()
        const clipMargin = Number.parseFloat(style.overflowClipMargin) || 0
        const marginX = style.overflowX === 'clip' ? clipMargin : 0
        const marginY = style.overflowY === 'clip' ? clipMargin : 0
        const left = rect.left + parent.clientLeft
        const top = rect.top + parent.clientTop
        ancestors.push({
          ancestor: `${parent.tagName.toLowerCase()}.${[...parent.classList].join('.')}`,
          ...(clipsX
            ? {
                left: bounds.left - left + marginX,
                right: left + parent.clientWidth - bounds.right + marginX
              }
            : {}),
          ...(clipsY
            ? {
                top: bounds.top - top + marginY,
                bottom: top + parent.clientHeight - bounds.bottom + marginY
              }
            : {})
        })
      }
      return ancestors
    })
    await info.attach(`${label}-clip-boundaries`, {
      body: JSON.stringify(clipping, null, 2),
      contentType: 'application/json'
    })
    for (const { ancestor, ...edges } of clipping) {
      for (const [edge, clearance] of Object.entries(edges)) {
        expect
          .soft(clearance, `${label} 在 ${ancestor} 的 ${edge} 绘制余量`)
          .toBeGreaterThanOrEqual(6)
      }
    }
  }

  await page.goto('/tests/e2e/fixtures/scm-project-quotation.html')
  const theme =
    info.project.name === 'mobile-390' || info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  await assertAppearance(page, { theme, boxBorderMode: false })
  await expect(page.locator('html')).toHaveAttribute('data-ui-scope', 'workspace')
  await page.getByText('设备装配项目', { exact: true }).click({ timeout: 120_000 })
  const drawer = page.getByRole('dialog', { name: '项目报价详情', exact: true })
  const profile = await expectOverlayTabPanel(drawer, '项目详细资料')
  await expect(profile.getByText('测试负责人', { exact: true })).toBeVisible()
  await page.screenshot({
    path: info.outputPath('native-tabs-profile.png'),
    animations: 'disabled'
  })
  await assertCardClearance(profile.locator('.art-section-card'), 'profile')

  await drawer.getByRole('tab', { name: '报价项分类', exact: true }).click()
  const categories = await expectOverlayTabPanel(drawer, '报价项分类')
  const table = categories.locator('.el-table')
  await expect(table.locator('tbody tr')).toHaveCount(20)
  expect((await table.boundingBox())!.height).toBeGreaterThan(0)
  expect((await table.locator('.el-table__body-wrapper').boundingBox())!.height).toBeGreaterThan(0)
  await page.screenshot({
    path: info.outputPath('native-tabs-categories.png'),
    animations: 'disabled'
  })
  await assertCardClearance(categories.locator('.art-table-query__search-scrollbar'), 'search')
  await assertCardClearance(categories.locator('.art-table-card'), 'table')

  const scroll = table.locator('.el-table__body-wrapper .el-scrollbar__wrap')
  await expect
    .poll(() => scroll.evaluate((element) => element.scrollHeight - element.clientHeight))
    .toBeGreaterThan(0)
  const drawerScroll = drawer.locator('.art-drawer__scrollbar > .el-scrollbar__wrap')
  const drawerOffset = await drawerScroll.evaluate((element) => element.scrollTop)
  await scroll.evaluate((element) => (element.scrollTop = element.scrollHeight))
  await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  await expect(table.locator('tbody tr').last().locator('td .cell').first()).toBeInViewport({
    ratio: 1
  })
  expect(await drawerScroll.evaluate((element) => element.scrollTop)).toBe(drawerOffset)
  await page.screenshot({
    path: info.outputPath('native-tabs-categories-lower.png'),
    animations: 'disabled'
  })
  await drawer.getByRole('tab', { name: '项目详细资料', exact: true }).click()
  await expectOverlayTabPanel(drawer, '项目详细资料')
  await expect(drawer.getByText('测试负责人', { exact: true })).toBeVisible()
  await drawer.getByRole('button', { name: '关闭抽屉', exact: true }).click()
  await expect(drawer).toBeHidden()
  expect(tabs).toEqual(['categories'])
  expect(writes).toEqual([])
  expect(errors).toEqual([])
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
})

test('项目十个页签展示关联业务记录，详情抽屉内表格保持可见', async ({ page }, testInfo) => {
  async function attachTableGeometry(panel: Locator, tab: string): Promise<void> {
    const geometry = await panel.evaluate((element) => {
      const tabs = element.closest('.el-tabs')
      const drawer = element.closest('.el-drawer')
      const nodes: Record<string, Element | null> = {
        content: drawer?.querySelector('.art-drawer__content') ?? null,
        layout: drawer?.querySelector('.project-quotation-detail-layout') ?? null,
        tabs,
        tabsContent: tabs?.querySelector('.el-tabs__content') ?? null,
        panel: element,
        query: element.querySelector('.art-table-query'),
        card: element.querySelector('.art-table-card'),
        host: element.querySelector('.art-table-query__table-host'),
        table: element.querySelector('.el-table'),
        body: element.querySelector('.el-table__body-wrapper'),
        row: element.querySelector('.el-table__body-wrapper tbody tr'),
        cell: element.querySelector('.el-table__body-wrapper tbody tr td .cell'),
        pagination: element.querySelector('.pagination')
      }
      return {
        viewport: { width: innerWidth, height: innerHeight },
        nodes: Object.fromEntries(
          Object.entries(nodes).map(([name, node]) => {
            if (!node) return [name, null]
            const bounds = node.getBoundingClientRect()
            const style = getComputedStyle(node)
            return [
              name,
              {
                rect: bounds.toJSON(),
                css: Object.fromEntries(
                  ['height', 'min-height', 'max-height', 'display', 'flex', 'overflow'].map(
                    (key) => [key, style.getPropertyValue(key)]
                  )
                )
              }
            ]
          })
        )
      }
    })
    await testInfo.attach(`project-${tab}-geometry`, {
      body: JSON.stringify(geometry, null, 2),
      contentType: 'application/json'
    })
  }
  const requested: string[] = []
  await page.route('**/rest/v1/rpc/scm_project_quotation_tab', (route) => {
    const tab: string = route.request().postDataJSON().p_tab
    requested.push(tab)
    const records =
      tab === 'categories'
        ? [1, 2].map((n) => ({
            id: `category-${n}`,
            document_no: `Q-00${n}`,
            category_name: '设备装配',
            quantity: n * 10,
            unit_price: 12,
            fee_total: 0,
            amount: n * 120,
            currency: 'CNY'
          }))
        : [
            {
              id: `${tab}-a`,
              document_no: `${tab}-TEST`,
              material_description: '装配物料',
              material_code: 'MAT-001',
              quantity: 5,
              unit: '件',
              unit_price: 12,
              amount: 60,
              currency: 'CNY',
              status: tab === 'purchase_requests' ? 'draft' : 'effective',
              warehouse_name: '装配仓',
              bin_name: 'A-01',
              batch_no: 'BATCH-001',
              occurred_at: '2026-10-08T00:00:00Z',
              source_warehouse_name: '装配仓',
              target_warehouse_name: '交付仓'
            }
          ]
    return route.fulfill({ json: { records, total: records.length } })
  })
  await page.goto('/tests/e2e/fixtures/scm-project-quotation.html')
  const workspace = page.locator('.business-workspace-page')
  await expect(workspace.getByText('PR-TEST', { exact: true })).toBeVisible({ timeout: 120_000 })
  await page.screenshot({
    path: testInfo.outputPath('project-workspace.png'),
    animations: 'disabled'
  })
  await workspace.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
  await expect(workspace.getByText('审批自动归集', { exact: true })).toBeHidden()
  await page.keyboard.press('Escape')
  await expect(workspace.getByText('审批自动归集', { exact: true })).toBeVisible()
  await workspace.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
  await workspace.getByRole('button', { name: '退出专注模式', exact: true }).click()
  const projectLink = workspace.locator('.art-table__cell-link').filter({ hasText: '设备装配项目' })
  await projectLink.focus()
  await projectLink.press('Enter')
  const drawer = page.getByRole('dialog', { name: '项目报价详情' })
  const profile = await expectOverlayTabPanel(drawer, '项目详细资料')
  await expect(profile.getByText('测试负责人', { exact: true })).toBeVisible()
  await expect(drawer.getByRole('tab')).toHaveCount(10)
  expect(requested).toEqual([])
  const remark = profile.getByText('项目业务资料', { exact: true })
  await remark.scrollIntoViewIfNeeded()
  await expect(remark).toBeInViewport({ ratio: 1 })
  await drawer.getByRole('tab', { name: '报价项分类', exact: true }).click()
  const categories = await expectOverlayTabPanel(drawer, '报价项分类')
  await expect(categories.locator('tbody tr')).toHaveCount(2)
  await expect(categories.getByText('Q-001', { exact: true })).toBeVisible()
  await expect(categories.getByText('Q-002', { exact: true })).toBeVisible()
  expect(requested).toEqual(['categories'])
  await attachTableGeometry(categories, 'categories')
  await page.screenshot({
    path: testInfo.outputPath('project-categories.png'),
    animations: 'disabled'
  })
  await expect(categories.getByText('Q-001', { exact: true })).toBeInViewport({ ratio: 1 })
  await expect(categories.getByText('Q-002', { exact: true })).toBeInViewport({ ratio: 1 })
  for (const [label, tab] of [
    ['报价明细', 'quotation_lines'],
    ['销售合同', 'contracts'],
    ['采购申请', 'purchase_requests'],
    ['采购订单', 'purchase_orders'],
    ['销售订单', 'sales_orders'],
    ['生产工单', 'work_orders'],
    ['实时库存', 'stock'],
    ['库存流水', 'movements']
  ]) {
    await drawer.getByRole('tab', { name: label, exact: true }).click()
    await expect(drawer.locator('tbody tr')).toHaveCount(1)
    expect(requested).toContain(tab)
    const panel = await expectOverlayTabPanel(drawer, label)
    await attachTableGeometry(panel, tab)
    await expect(
      panel.locator('.el-table__body-wrapper tbody tr').first().locator('td .cell').first()
    ).toBeInViewport({ ratio: 1 })
  }
  await page.screenshot({
    path: testInfo.outputPath('project-movements.png'),
    animations: 'disabled'
  })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
})

test('项目报价窄屏页签使用方向键切换时保持焦点可见且正文不滚动', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('**/rest/v1/rpc/scm_project_quotation_tab', (route) =>
    route.fulfill({ json: { records: [], total: 0 } })
  )
  await page.goto('/tests/e2e/fixtures/scm-project-quotation.html')
  await page.getByText('设备装配项目', { exact: true }).click({ timeout: 120_000 })

  const drawer = page.getByRole('dialog', { name: '项目报价详情', exact: true })
  const tab = (name: string) => drawer.getByRole('tab', { name, exact: true })
  await expectOverlayTabPanel(drawer, '项目详细资料')
  const nav = drawer.locator('.art-overlay-tab-card .el-tabs__nav-wrap.is-scrollable')
  const previous = nav.locator('.el-tabs__nav-prev')
  const next = nav.locator('.el-tabs__nav-next')
  await expect(previous).toBeVisible()
  await expect(next).toBeVisible()
  const [left, right, strip] = await Promise.all([
    previous.boundingBox(),
    next.boundingBox(),
    nav.locator('.el-tabs__nav-scroll').boundingBox()
  ])
  if (!left || !right || !strip) throw new Error('窄屏页签缺少滚动导航')
  for (const arrow of [left, right]) {
    expect(arrow.width).toBeGreaterThanOrEqual(24)
    expect(arrow.height).toBeGreaterThanOrEqual(24)
    expect(Math.abs(arrow.y + arrow.height / 2 - (strip.y + strip.height / 2))).toBeLessThanOrEqual(
      1
    )
  }
  expect(left.x + left.width).toBeLessThanOrEqual(strip.x + 1)
  expect(right.x).toBeGreaterThanOrEqual(strip.x + strip.width - 1)

  await tab('项目详细资料').focus()
  await page.keyboard.press('ArrowLeft')
  const last = tab('库存流水')
  await expect(last).toBeFocused()
  await expectOverlayTabPanel(drawer, '库存流水')
  await expect
    .poll(() =>
      last.evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        const viewport = element.closest('.el-tabs__nav-scroll')!.getBoundingClientRect()
        return bounds.left >= viewport.left - 1 && bounds.right <= viewport.right + 1
      })
    )
    .toBe(true)

  await page.keyboard.press('ArrowRight')
  await expect(tab('项目详细资料')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(tab('报价项分类')).toBeFocused()
  await expectOverlayTabPanel(drawer, '报价项分类')

  const scroll = drawer.locator('.art-drawer__scrollbar > .el-scrollbar__wrap')
  const initialOffset = await scroll.evaluate((element) => element.scrollTop)
  const offsets = await scroll.evaluateHandle((element) => {
    const observed: number[] = []
    element.addEventListener('scroll', () => observed.push(element.scrollTop), { passive: true })
    return observed
  })
  for (const [key, name] of [
    ['ArrowDown', '报价明细'],
    ['ArrowUp', '报价项分类']
  ]) {
    await page.keyboard.press(key)
    await expect(tab(name)).toBeFocused()
    await expectOverlayTabPanel(drawer, name)
    await scroll.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    )
  }
  const scrollChanges = (await offsets.jsonValue()).filter((offset) => offset !== initialOffset)
  expect(scrollChanges).toEqual([])
  await offsets.dispose()
  expect(await scroll.evaluate((element) => element.scrollTop)).toBe(initialOffset)
})

test('项目资料失败可重试，业务列表失败与空状态可恢复', async ({ page }) => {
  let profileFails = true
  let tabFails = true
  await page.route('**/rest/v1/rpc/scm_project_quotation_profile', (route) =>
    profileFails
      ? route.fulfill({ status: 500, json: { message: 'temporary read error' } })
      : route.fulfill({
          json: {
            ...project,
            owner_name: '重试负责人',
            salesperson_name: null,
            contact_name: null,
            contact_phone: null,
            address_detail: null,
            project_stage: null,
            remark: null
          }
        })
  )
  await page.route('**/rest/v1/rpc/scm_project_quotation_tab', (route) =>
    tabFails
      ? route.fulfill({ json: { records: [{ id: null }], total: 1 } })
      : route.fulfill({ json: { records: [], total: 0 } })
  )
  await page.goto('/tests/e2e/fixtures/scm-project-quotation.html')
  await page.getByText('设备装配项目', { exact: true }).click({ timeout: 120_000 })
  const drawer = page.getByRole('dialog', { name: '项目报价详情' })
  await expect(drawer.getByText('项目资料加载失败', { exact: true })).toBeVisible()
  profileFails = false
  await drawer.getByRole('button', { name: /重试|重新加载/ }).click()
  await expect(drawer.getByText('重试负责人', { exact: true })).toBeVisible()
  await drawer.getByRole('tab', { name: '采购申请', exact: true }).click()
  await expect(drawer.getByRole('button', { name: /重试|重新加载/ })).toBeVisible()
  tabFails = false
  await drawer.getByRole('button', { name: /重试|重新加载/ }).click()
  await expect(drawer.getByText('此项目尚无已保存的采购申请。', { exact: true })).toBeVisible()
})
