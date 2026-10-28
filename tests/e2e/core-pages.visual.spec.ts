import { expect, test, type Locator, type Page } from '@playwright/test'
import { prepareAppearance } from './support/appearance'
import { blockExternalIconRequests } from './support/icons'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'
import { contrast } from './text-contrast'

interface VisualPage {
  name: string
  path: string
  root: string
  captureLower?: boolean
}

const visualPages: VisualPage[] = [
  {
    name: 'dashboard-console',
    path: '/dashboard/console',
    root: '.operations-dashboard'
  },
  {
    name: 'supabase-ai-assistant',
    path: '/data-center/supabase-ai-assistant',
    root: '.project-assistant'
  },
  {
    name: 'table-query-widget',
    path: '/widgets/table-query',
    root: '.table-query-widget'
  },
  {
    name: 'ai-project-planner',
    path: '/system/ai-project-planner',
    root: '.ai-planner'
  },
  {
    name: 'website-config',
    path: '/system/website-config',
    root: '.website-config-page',
    captureLower: true
  }
]

const VISUAL_TEST_TIME = new Date('2026-08-10T10:26:52.000Z')

async function waitForPageReady(page: Page, rootSelector: string): Promise<Locator> {
  const root = page.locator(rootSelector).first()
  await expect(root).toBeVisible({ timeout: 60_000 })
  await expect(root.locator('.art-async-state[aria-busy="true"]:visible')).toHaveCount(0, {
    timeout: 60_000
  })
  await expect(root.locator('.art-async-state__skeleton:visible')).toHaveCount(0, {
    timeout: 60_000
  })
  await expect(page.locator('.el-loading-mask:visible')).toHaveCount(0, { timeout: 60_000 })
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  await expect
    .poll(() =>
      page
        .locator('.art-logo img')
        .evaluateAll((images) =>
          images.every(
            (image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0
          )
        )
    )
    .toBe(true)
  await page.waitForTimeout(500)
  return root
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }))
  expect(
    overflow.scrollWidth,
    `页面产生横向溢出：scrollWidth=${overflow.scrollWidth}, clientWidth=${overflow.clientWidth}`
  ).toBeLessThanOrEqual(overflow.clientWidth + 1)
}

async function resetScrollPositions(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.scrollTo(0, 0)
    for (const element of document.querySelectorAll<HTMLElement>('*')) {
      if (element.scrollTop) element.scrollTop = 0
      if (element.scrollLeft) element.scrollLeft = 0
    }
  })
  await page.waitForTimeout(100)
}

async function scrollMainContentToBottom(page: Page): Promise<void> {
  await page.evaluate(() => {
    const scrollContainer =
      document.querySelector<HTMLElement>(
        '#app-main > .app-main__scrollbar > .app-main__scroll-wrap'
      ) ?? document.scrollingElement
    scrollContainer?.scrollTo({ top: scrollContainer.scrollHeight, behavior: 'auto' })
  })
  await page.waitForTimeout(200)
}

for (const visualPage of visualPages) {
  test(`${visualPage.name} 布局稳定`, async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    const externalIconRequests = await blockExternalIconRequests(page)

    await page.clock.setFixedTime(VISUAL_TEST_TIME)
    const dark = testInfo.project.name.includes('dark')
    const boxBorderMode = !testInfo.project.name.includes('shadow')
    await prepareAppearance(page, { theme: dark ? 'dark' : 'light', boxBorderMode })
    await page.goto(`#${visualPage.path}`, { waitUntil: 'domcontentloaded' })
    await expect(page).not.toHaveURL(/#\/auth\/login/)

    await waitForPageReady(page, visualPage.root)
    if (visualPage.name === 'dashboard-console') {
      await expect(page.locator('.operations-dashboard .dashboard-overview')).toBeVisible({
        timeout: 60_000
      })
      await expect(page.locator('.operations-dashboard .metric-card')).toHaveCount(6)
    }
    if (visualPage.name === 'ai-project-planner') {
      await expect(page.locator('.ai-planner__controls .el-select').last()).toContainText('不限', {
        timeout: 30_000
      })
    }
    if (visualPage.name === 'table-query-widget') {
      const allPriorityLabel = page
        .locator('.table-query-widget .el-segmented__item-label')
        .filter({ hasText: /^全部$/ })
        .first()
      await expect(allPriorityLabel).toBeVisible()
      const labelWidth = await allPriorityLabel.evaluate((element) => ({
        content: element.scrollWidth,
        available: element.clientWidth
      }))
      expect(labelWidth.content, '优先级“全部”选项应完整显示').toBeLessThanOrEqual(
        labelWidth.available
      )
    }
    await expect(page.locator('.setting-guide')).toBeHidden()
    if (dark) await expect(page.locator('html')).toHaveClass(/dark/)
    else await expect(page.locator('html')).not.toHaveClass(/dark/)
    await expect(page.locator('html')).toHaveAttribute(
      'data-box-mode',
      boxBorderMode ? 'border-mode' : 'shadow-mode'
    )
    await expectNoHorizontalOverflow(page)
    await resetScrollPositions(page)
    expect(externalIconRequests, '核心页面不应依赖外部图标服务').toEqual([])
    expect(pageErrors, `页面出现未捕获错误：\n${pageErrors.join('\n')}`).toEqual([])

    const screenshotOptions = {
      mask: [
        page.locator('.art-header-bar img[alt="用户头像"]'),
        page.locator('.website-config-page__header-meta > span:nth-child(2)')
      ],
      maskColor: '#808080'
    }
    await expect(page).toHaveScreenshot(`${visualPage.name}.png`, screenshotOptions)

    if (visualPage.captureLower) {
      await scrollMainContentToBottom(page)
      await expect(page).toHaveScreenshot(`${visualPage.name}-lower.png`, screenshotOptions)
    }
    expect(pageErrors, `页面出现未捕获错误：\n${pageErrors.join('\n')}`).toEqual([])
  })
}

for (const scenario of [
  { name: 'light-1440', project: 'desktop-1440', theme: 'light' as const },
  { name: 'dark-390', project: 'mobile-390', theme: 'dark' as const }
]) {
  test(`supabase-ai-assistant 三面板标题 ${scenario.name}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== scenario.project)
    test.setTimeout(300_000)
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    const externalIconRequests = await blockExternalIconRequests(page)
    await page.clock.setFixedTime(VISUAL_TEST_TIME)
    await prepareIsolatedSession(page)
    await prepareAppearance(page, { theme: scenario.theme, boxBorderMode: true })
    await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
      route.fulfill({ json: [{ code: 'platform', name: '测试平台', baseUrl: '/' }] })
    )
    const assistantPath = '/data-center/supabase-ai-assistant'
    await mockApplicationMenus(page, {
      platform: [
        {
          id: 'assistant-menu',
          parentId: null,
          name: 'SupabaseAiAssistant',
          path: assistantPath,
          component: assistantPath,
          type: 'menu',
          sort: 1,
          meta: { title: 'Supabase AI 助手', is_enable: true, is_hide: false, roles: [] }
        }
      ]
    })
    await page.route('**/functions/v1/ai-project-assistant', (route) => {
      const request: unknown = route.request().postDataJSON()
      const payload = request && typeof request === 'object' ? request : {}
      const action = 'action' in payload ? payload.action : ''
      const catalogAction = 'catalogAction' in payload ? payload.catalogAction : ''
      if (action === 'capabilities')
        return route.fulfill({
          json: {
            version: 'test',
            features: {},
            access: {},
            allowedSafetyModes: ['read_only']
          }
        })
      const data: Record<string, unknown> = {
        overview: { projectRef: 'test-project', databaseVersion: 'PostgreSQL 16', tables: 1 },
        schemas: ['public'],
        edge_functions: { projectRef: 'test-project', source: 'management_api', functions: [] },
        list_objects: [
          {
            schemaName: 'public',
            objectName: 'test_orders',
            objectType: 'table',
            description: '测试订单表'
          }
        ],
        object_detail: {
          schemaName: 'public',
          objectName: 'test_orders',
          objectType: 'table',
          description: '测试订单表'
        },
        relationships: []
      }
      return route.fulfill({ json: { data: data[String(catalogAction)] ?? [] } })
    })
    await page.goto('#/data-center/supabase-ai-assistant', { waitUntil: 'domcontentloaded' })
    await expect(page).not.toHaveURL(/#\/auth\/login/)
    await waitForPageReady(page, '.project-assistant')
    if (scenario.theme === 'dark') await expect(page.locator('html')).toHaveClass(/dark/)
    else await expect(page.locator('html')).not.toHaveClass(/dark/)
    await expect(page.locator('html')).toHaveAttribute('data-box-mode', 'border-mode')

    const titles = {
      objects: page.locator('.project-assistant-object-browser__title'),
      detail: page.locator('.project-assistant__detail .project-assistant__panel-title'),
      chat: page.locator('.project-assistant__chat .project-assistant__panel-title')
    }
    const checkTitle = async (title: Locator): Promise<void> => {
      await expect(title).toBeVisible()
      await expect(title).toHaveCSS('display', 'flex')
      await expect(title).toHaveCSS('border-bottom-width', '1px')
      expect(
        await title.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
      ).toBe(true)
      await expectNoHorizontalOverflow(page)
    }
    const capture = async (panel: string): Promise<void> => {
      await page.screenshot({
        path: testInfo.outputPath(`project-assistant-${scenario.name}-${panel}.png`),
        mask: [page.locator('.art-header-bar img[alt="用户头像"]')],
        maskColor: '#808080'
      })
    }
    await checkTitle(titles.objects)
    if (scenario.project === 'mobile-390') await capture('objects')

    const firstObject = page.locator('.project-assistant-object-browser__list button').first()
    await expect(firstObject).toBeVisible({ timeout: 60_000 })
    await firstObject.click()
    await checkTitle(titles.detail)
    if (scenario.project === 'mobile-390') {
      await capture('detail')
      await page
        .getByRole('navigation', { name: 'AI 助手工作区' })
        .getByRole('button', { name: '助手' })
        .click()
    }
    await checkTitle(titles.chat)
    const historyButton = titles.chat.getByRole('button', { name: '会话历史' })
    const newChatButton = titles.chat.getByRole('button', { name: '新对话' })
    await expect(historyButton).toBeVisible()
    await expect(newChatButton).toBeVisible()
    await expect(newChatButton).toBeEnabled()
    if (scenario.theme === 'dark') {
      expect(await contrast(titles.chat.locator('strong').first())).toBeGreaterThanOrEqual(4.5)
      expect(await contrast(titles.chat.locator('small').first())).toBeGreaterThanOrEqual(4.5)
      expect(await contrast(historyButton)).toBeGreaterThanOrEqual(3)
      await historyButton.focus()
      await page.keyboard.press('Shift+Tab')
      await page.keyboard.press('Tab')
      await expect(historyButton).toBeFocused()
      expect(
        await historyButton.evaluate((element) => getComputedStyle(element).boxShadow)
      ).not.toBe('none')
    }
    await capture(scenario.project === 'mobile-390' ? 'chat' : 'all')
    expect(externalIconRequests).toEqual([])
    expect(pageErrors).toEqual([])
  })
}
