import { expect, test, type Page } from '@playwright/test'

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const viewport = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }))
  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.clientWidth + 1)
}

test('全局设计参考紧跟页面刷新，工作区刷新保持在业务按钮左侧', async ({ page }) => {
  test.setTimeout(120_000)
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto('#/dashboard/console', { waitUntil: 'domcontentloaded' })
  await expect(page).not.toHaveURL(/#\/auth\/login/)

  const header = page.locator('.business-workspace-header').first()
  await expect(header).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('.el-loading-mask:visible')).toHaveCount(0, { timeout: 60_000 })

  const actions = header.locator('.business-workspace-header__actions')
  const refresh = actions.getByRole('button', { name: '刷新运营数据' })
  await expect(refresh).toBeVisible()
  await expect(refresh).toHaveClass(/art-icon-button/)
  await expect(refresh).not.toHaveClass(/el-button/)
  await expect(actions.locator('.page-design-reference')).toHaveCount(0)

  const ordering = await actions.evaluate((element) => {
    const children = [...element.children]
    const refreshIndex = children.findIndex((child) => child.classList.contains('art-icon-button'))
    const businessButtonIndex = children.findIndex((child) => child.classList.contains('el-button'))
    return { refreshIndex, businessButtonIndex }
  })
  expect(ordering.refreshIndex).toBe(0)
  expect(ordering.businessButtonIndex).toBeGreaterThan(ordering.refreshIndex)

  const globalHeader = page.locator('.art-header-bar__main').first()
  const globalRefresh = globalHeader.getByRole('button', { name: '刷新当前页面' })
  const routeReference = globalHeader.locator('.page-design-reference')
  const routeReferenceButton = routeReference.locator(
    'button[aria-label="将当前路由标记为设计参考"], button[aria-label="编辑当前路由设计参考"]'
  )
  await expect(globalRefresh).toBeVisible()
  await expect(routeReferenceButton).toBeVisible()
  await expect(routeReference.locator('.el-popover')).toHaveCount(0)

  const headerOrdering = await globalHeader.evaluate((element) => {
    const refreshButton = element.querySelector<HTMLButtonElement>(
      'button[aria-label="刷新当前页面"]'
    )
    const reference = element.querySelector<HTMLElement>('.page-design-reference')
    return {
      sameParent: refreshButton?.parentElement === reference?.parentElement,
      adjacent: refreshButton?.nextElementSibling === reference
    }
  })
  expect(headerOrdering).toEqual({ sameParent: true, adjacent: true })

  await routeReferenceButton.focus()
  await expect(routeReferenceButton).toBeFocused()
  await routeReferenceButton.click()
  await expect(page.getByText('参考截图', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /点击选择、拖入或粘贴图片/ })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: '布局紧凑' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: '设计参考补充说明' })).toBeVisible()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await expectNoHorizontalOverflow(page)

  await refresh.focus()
  await expect(refresh).toBeFocused()
  await expectNoHorizontalOverflow(page)
  expect(pageErrors).toEqual([])
})

test('全局固定操作栏保持提示在左、操作在右', async ({ page }) => {
  test.setTimeout(120_000)
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto('#/system/website-config', { waitUntil: 'domcontentloaded' })
  await expect(page).not.toHaveURL(/#\/auth\/login/)

  const actionBar = page.locator('.art-sticky-action-bar').first()
  await expect(actionBar).toBeVisible({ timeout: 60_000 })

  const summary = actionBar.locator('.art-sticky-action-bar__summary')
  const actions = actionBar.locator('.art-sticky-action-bar__actions')
  await expect(summary).toBeVisible()
  await expect(actions).toBeVisible()

  const layout = await actionBar.evaluate((element) => {
    const summaryElement = element.querySelector<HTMLElement>('.art-sticky-action-bar__summary')
    const actionsElement = element.querySelector<HTMLElement>('.art-sticky-action-bar__actions')
    const summaryRect = summaryElement?.getBoundingClientRect()
    const actionsRect = actionsElement?.getBoundingClientRect()
    return {
      direction: getComputedStyle(element).flexDirection,
      summaryLeft: summaryRect?.left ?? 0,
      actionsLeft: actionsRect?.left ?? 0,
      actionsRight: actionsRect?.right ?? 0,
      barRight: element.getBoundingClientRect().right
    }
  })

  if (layout.direction === 'row') {
    expect(layout.actionsLeft).toBeGreaterThan(layout.summaryLeft)
  }
  expect(layout.barRight - layout.actionsRight).toBeLessThanOrEqual(32)
  await expectNoHorizontalOverflow(page)
  expect(pageErrors).toEqual([])
})

test('运营工作台显示真实更新时间，并在刷新失败后保留数据和重试入口', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('#/dashboard/console', { waitUntil: 'domcontentloaded' })

  const header = page.locator('.operations-dashboard .business-workspace-header')
  const status = header.locator('.business-workspace-header__tags .el-tag').first()
  const refresh = header.getByRole('button', { name: '刷新运营数据' })
  await expect(status).toContainText('更新于', { timeout: 60_000 })
  await expect(page.getByRole('heading', { name: '今日运营概览' })).toBeVisible()

  await page.route('**/rest/v1/rpc/get_dashboard_console', (route) => route.abort())
  await refresh.click()
  await expect(status).toContainText('更新失败，请重试')
  await expect(page.getByRole('heading', { name: '今日运营概览' })).toBeVisible()
  await expect(refresh).toBeEnabled()

  await page.unroute('**/rest/v1/rpc/get_dashboard_console')
  await refresh.click()
  await expect(status).toContainText('更新于', { timeout: 60_000 })
  await expectNoHorizontalOverflow(page)
})
