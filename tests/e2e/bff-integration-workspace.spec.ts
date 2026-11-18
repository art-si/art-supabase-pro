import { expect, test, type Page, type Request } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { expectOverlayTabPanel } from './support/overlay-tab-card'
import { assertAppearance, prepareAppearance } from './support/appearance'
import { compareShadowPaint, shadowPaintRegion } from './support/shadow-paint'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const catalog = [
  {
    interfaceId: '10000000-0000-4000-8000-000000000001',
    code: 'platform-health',
    name: '平台健康检查',
    method: 'GET',
    path: '/platform/health',
    environment: 'production',
    version: 2,
    applicationCode: 'platform',
    applicationName: '线上接入验证',
    inputs: [],
    resultKind: 'scalar',
    outputs: [{ key: 'status', label: '服务状态', type: 'string' }]
  },
  {
    interfaceId: '10000000-0000-4000-8000-000000000002',
    code: 'java-orders',
    name: 'Java 订单列表',
    method: 'GET',
    path: '/examples/java/orders',
    environment: 'development',
    version: 1,
    applicationCode: 'java-demo',
    applicationName: 'Java 服务',
    inputs: [
      { key: 'current', label: '当前页', location: 'query', type: 'number', required: true },
      { key: 'size', label: '每页条数', location: 'query', type: 'number', required: true }
    ],
    resultKind: 'page',
    outputs: [
      { key: 'id', label: '订单编号', type: 'string' },
      { key: 'name', label: '订单名称', type: 'string' }
    ],
    pagination: { currentInputKey: 'current', sizeInputKey: 'size' }
  }
]

async function mockBridge(page: Page) {
  let fail = false
  let empty = false
  const unexpectedFunctions: string[] = []
  await page.route('**/functions/v1/**', (route) => {
    unexpectedFunctions.push(new URL(route.request().url()).pathname)
    return route.fulfill({ status: 503, json: { message: '测试未声明此函数' } })
  })
  await page.route(/\/(?:__bff_bridge|functions\/v1\/bff-gateway)(?:\?.*)?$/, async (route) => {
    const payload = route.request().postDataJSON() as Record<string, unknown>
    if (payload.operation === 'catalog') {
      await route.fulfill({ json: { records: catalog } })
      return
    }
    if (fail) {
      fail = false
      await route.fulfill({ status: 503, json: { code: 'GATEWAY_UNAVAILABLE' } })
      return
    }
    const paged = payload.applicationCode === 'java-demo'
    await route.fulfill({
      json: {
        code: 200,
        msg: '成功',
        requestId: '20000000-0000-4000-8000-000000000001',
        version: paged ? 1 : 2,
        data: paged
          ? {
              records: empty
                ? []
                : [
                    { id: 'J-001', name: '订单一' },
                    { id: 'J-002', name: '订单二' }
                  ],
              total: empty ? 0 : 2,
              current: 1,
              size: 20
            }
          : { status: '正常' }
      }
    })
  })
  return {
    failNext: () => (fail = true),
    setEmpty: (value: boolean) => (empty = value),
    unexpectedFunctions
  }
}

async function expectNoPageOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
  ).toBeLessThanOrEqual(1)
  expect(
    await page.evaluate(() => {
      const main = document.querySelector('.bff-integration')
      if (!main) return false
      const style = getComputedStyle(main)
      return style.overflowY !== 'scroll' && style.overflowY !== 'auto'
    })
  ).toBe(true)
}

test('BFF 目录、指南和调用抽屉保持工作区布局', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`)
  })
  await prepareIsolatedSession(page)
  await mockBridge(page)
  await page.goto('/tests/e2e/fixtures/bff-integration-workspace.html')
  if (errors.length) throw new Error(errors.join('\n'))
  await expect(page.getByRole('heading', { name: 'BFF 接入中心' })).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole('row').filter({ hasText: '平台健康检查' })).toBeVisible()
  expect(
    await page
      .locator('.bff-integration > .art-table-query .el-table')
      .evaluate((el) => el.getBoundingClientRect().height)
  ).toBeGreaterThan(120)
  await expect(page.getByPlaceholder('搜索接口、应用或路径')).toBeVisible()
  await expectNoPageOverflow(page)
  await page.screenshot({ path: info.outputPath('catalog-light-1440.png') })

  const header = page.locator('.business-workspace-header')
  const guide = page.getByRole('button', { name: '响应格式说明' })
  await expect(header.getByRole('button', { name: '响应格式说明' })).toBeVisible()

  await page.getByPlaceholder('搜索接口、应用或路径').fill('没有的接口')
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expect(page.getByText('没有符合条件的已发布接口')).toBeVisible()
  await page.screenshot({ path: info.outputPath('catalog-empty-1440.png') })
  await page.getByRole('button', { name: '重置', exact: true }).click()

  await guide.click()
  const guideOverlay = page.getByRole('dialog', { name: '常见响应格式', exact: true })
  const javaGuide = await expectOverlayTabPanel(guideOverlay, 'Java 服务')
  await expect(javaGuide.getByText('Java 服务响应示例')).toBeVisible()
  await page.screenshot({ path: info.outputPath('response-guide-1440.png') })
  await page.keyboard.press('Escape')

  await page.getByRole('switch', { name: '进入专注模式' }).locator('..').click()
  await expect(header).toBeHidden()
  await expect(guide).toBeVisible()
  await page.screenshot({ path: info.outputPath('catalog-focus-1440.png') })
  await page.keyboard.press('Escape')
  await expect(header).toBeVisible()

  await page
    .getByRole('row')
    .filter({ hasText: '平台健康检查' })
    .getByRole('button', { name: '选择接口' })
    .click()
  await expect(page.getByText('此接口无需填写参数，可直接运行。')).toBeVisible()
  await page.getByRole('button', { name: '运行接口' }).click()
  await expect(page.getByText('正常', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'JSON 响应' }).click()
  await expect(page.getByText('已校验的接口响应')).toBeVisible()
  await page.screenshot({ path: info.outputPath('invocation-json-light-1440.png') })
  await expectNoPageOverflow(page)
  await page.keyboard.press('Escape')

  await page
    .getByRole('row')
    .filter({ hasText: 'Java 订单列表' })
    .getByRole('button', { name: '选择接口' })
    .click()
  await page.getByRole('button', { name: '查询分页记录' }).click()
  await expect(page.getByText('J-001', { exact: true })).toBeVisible()
  const resultTable = page.locator('.el-drawer .art-table-query')
  await resultTable.scrollIntoViewIfNeeded()
  await expect(resultTable.getByText('订单编号', { exact: true })).toBeInViewport()
  await expect(resultTable.getByText('J-001', { exact: true })).toBeInViewport()
  await expect(resultTable.getByText('J-002', { exact: true })).toBeInViewport()
  const resultWidths = await resultTable.evaluate((element) => ({
    outer: element.getBoundingClientRect().width,
    table: element.querySelector('.el-table')!.getBoundingClientRect().width
  }))
  expect(resultWidths.table, JSON.stringify(resultWidths)).toBeGreaterThanOrEqual(
    resultWidths.outer - 48
  )
  await page.screenshot({ path: info.outputPath('invocation-paged-data-light-1440.png') })
  await page.getByRole('tab', { name: 'JSON 响应' }).click()
  await expect(page.locator('.el-drawer').getByText('"J-001"', { exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('invocation-paged-json-light-1440.png') })
  await page.getByRole('tab', { name: '数据视图' }).click()
  await resultTable.scrollIntoViewIfNeeded()
  await expect(resultTable.getByText('J-002', { exact: true })).toBeInViewport()
  await page.keyboard.press('Escape')

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('row').filter({ hasText: '平台健康检查' })).toBeVisible()
  const narrowSelect = page
    .getByRole('row')
    .filter({ hasText: '平台健康检查' })
    .getByRole('button', { name: '选择接口' })
  await expect(narrowSelect).toBeVisible()
  await narrowSelect.scrollIntoViewIfNeeded()
  await expect(narrowSelect).toBeInViewport()
  await expectNoPageOverflow(page)
  await page.screenshot({ path: info.outputPath('catalog-narrow-390.png') })
  await guide.click()
  await guideOverlay.getByRole('tab', { name: 'Supabase', exact: true }).click()
  const supabaseGuide = await expectOverlayTabPanel(guideOverlay, 'Supabase')
  await expect(supabaseGuide.getByText('Supabase 响应示例')).toBeVisible()
  await expectNoPageOverflow(page)
  await page.screenshot({ path: info.outputPath('response-guide-narrow-390.png') })
  await page.keyboard.press('Escape')

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.locator('html').evaluate((element) => element.classList.add('dark'))
  await expectNoPageOverflow(page)
  await page.screenshot({ path: info.outputPath('catalog-dark-1280.png') })
  expect(errors).toEqual([])
})

test('BFF 调用失败在抽屉内显示可重试状态', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const bridge = await mockBridge(page)
  await page.goto('/tests/e2e/fixtures/bff-integration-workspace.html')
  await page
    .getByRole('row')
    .filter({ hasText: '平台健康检查' })
    .getByRole('button', { name: '选择接口' })
    .click()
  bridge.failNext()
  await page.getByRole('button', { name: '运行接口' }).click()
  await expect(page.getByText('BFF 接入服务暂时不可用，请稍后重试')).toBeVisible()
  await page.screenshot({ path: info.outputPath('invocation-error-1440.png') })
  await page.getByRole('button', { name: '运行接口' }).click()
  await expect(page.getByText('正常', { exact: true })).toBeVisible()
})

test('分页数据视图在窄屏、暗色与空结果中保持可见', async ({ page }, info) => {
  const pendingApi = new Set<Request>()
  const errors: string[] = []
  page.on('request', (request) => {
    if (/^\/(rest\/v1\/|functions\/v1\/|__bff_bridge)/.test(new URL(request.url()).pathname))
      pendingApi.add(request)
  })
  page.on('requestfinished', (request) => pendingApi.delete(request))
  page.on('requestfailed', (request) => pendingApi.delete(request))
  page.on('pageerror', (error) => errors.push(error.message))
  await prepareIsolatedSession(page)
  const theme =
    info.project.name === 'mobile-390' || info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  await prepareAppearance(page, { theme, boxBorderMode: false })
  const bridge = await mockBridge(page)
  await page.goto('/tests/e2e/fixtures/bff-integration-workspace.html')
  await assertAppearance(page, { theme, boxBorderMode: false })
  await expect(page.locator('html')).toHaveAttribute('data-ui-scope', 'workspace')
  await page
    .getByRole('row')
    .filter({ hasText: 'Java 订单列表' })
    .getByRole('button', { name: '选择接口' })
    .click()
  await page.getByRole('button', { name: '查询分页记录' }).click()
  const resultTable = page.locator('.el-drawer .art-table-query')
  const card = resultTable.locator('.art-table-card')
  const tabsContent = card.locator(
    'xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " el-tabs__content ")][1]'
  )
  const settle = async () => {
    await expect(resultTable.getByText('J-001', { exact: true })).toBeVisible()
    await expect(resultTable.getByText('J-002', { exact: true })).toBeVisible()
    await expect(resultTable.locator('.el-skeleton:visible')).toHaveCount(0)
    await expect(resultTable.locator('[aria-busy="true"]:visible')).toHaveCount(0)
    await expect.poll(() => pendingApi.size).toBe(0)
    const stableFrames = await card.evaluate(async (element) => {
      await document.fonts.ready
      await Promise.allSettled(
        element
          .closest('.el-drawer')!
          .getAnimations({ subtree: true })
          .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
          .map((animation) => animation.finished)
      )
      const nodes = [
        element,
        element.closest('.el-tabs__content')!,
        ...element.querySelectorAll('.el-table, tbody tr, .pagination')
      ]
      let previous = ''
      let stable = 0
      for (let frame = 0; frame < 120 && stable < 8; frame++) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        const current = JSON.stringify(
          nodes.map((node) => {
            const rect = node.getBoundingClientRect()
            return [rect.x, rect.y, rect.width, rect.height, node.scrollWidth, node.scrollHeight]
          })
        )
        stable = current === previous ? stable + 1 : 0
        previous = current
      }
      return stable
    })
    expect(stableFrames).toBe(8)
  }
  const inspect = () =>
    card.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const cardRect = { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      const ancestors = []
      for (let node = element.parentElement; node; node = node.parentElement) {
        const style = getComputedStyle(node)
        const bounds = node.getBoundingClientRect()
        const sx = node.offsetWidth ? bounds.width / node.offsetWidth : 1
        const sy = node.offsetHeight ? bounds.height / node.offsetHeight : 1
        const bothClip = style.overflowX === 'clip' && style.overflowY === 'clip'
        const rawMargin = style.getPropertyValue('overflow-clip-margin')
        const margin = bothClip ? Number(rawMargin.match(/([\d.]+)px/)?.[1] ?? 0) : 0
        const left = bounds.left + node.clientLeft * sx - margin * sx
        const top = bounds.top + node.clientTop * sy - margin * sy
        const right = bounds.left + (node.clientLeft + node.clientWidth + margin) * sx
        const bottom = bounds.top + (node.clientTop + node.clientHeight + margin) * sy
        const clipX = ['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowX)
        const clipY = ['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowY)
        ancestors.push({
          className: node.className,
          overflowX: style.overflowX,
          overflowY: style.overflowY,
          overflowClipMargin: rawMargin,
          appliedClipMargin: margin,
          clipPath: style.clipPath,
          contain: style.contain,
          clipX,
          clipY,
          clipTop: top,
          clipBottom: bottom,
          leftRoom: rect.left - left,
          rightRoom: right - rect.right,
          topRoom: rect.top - top,
          bottomRoom: bottom - rect.bottom
        })
      }
      const clipY = ancestors.filter((ancestor) => ancestor.clipY)
      const top = Math.ceil(Math.max(6, rect.top + 24, ...clipY.map((node) => node.clipTop + 6)))
      const bottom = Math.floor(
        Math.min(innerHeight - 6, rect.bottom - 24, ...clipY.map((node) => node.clipBottom - 6))
      )
      const samples = [
        {
          x: Math.ceil(rect.left - 6),
          y: top,
          width: Math.floor(rect.left - 2) - Math.ceil(rect.left - 6),
          height: bottom - top
        },
        {
          x: Math.ceil(rect.right + 2),
          y: top,
          width: Math.floor(rect.right + 6) - Math.ceil(rect.right + 2),
          height: bottom - top
        }
      ]
      return { cardRect, ancestors, samples, shadow: getComputedStyle(element).boxShadow }
    })
  const capturePaint = async (label: string) => {
    await settle()
    await expect(card).not.toHaveCSS('box-shadow', 'none')
    const before = await inspect()
    const region = shadowPaintRegion(before.samples)
    const capture = () => page.screenshot({ clip: region, scale: 'css', animations: 'disabled' })
    const actual = await capture()
    const repeat = await capture()
    const originalTabsStyle = await tabsContent.getAttribute('style')
    const originalCardStyle = await card.getAttribute('style')
    try {
      await tabsContent.evaluate((element) =>
        element.style.setProperty('overflow', 'visible', 'important')
      )
      await settle()
      const reference = await inspect()
      expect(reference.cardRect).toEqual(before.cardRect)
      expect(reference.samples).toEqual(before.samples)
      const relaxed = await capture()
      await card.evaluate((element) => element.style.setProperty('box-shadow', 'none', 'important'))
      await settle()
      expect((await inspect()).cardRect).toEqual(before.cardRect)
      const background = await capture()
      const stability = compareShadowPaint(actual, repeat, region, before.samples)
      const paint = compareShadowPaint(actual, relaxed, region, before.samples)
      const shadow = compareShadowPaint(relaxed, background, region, before.samples)
      await info.attach(`${label}-paint-proof`, {
        body: JSON.stringify({ before, reference, region, stability, paint, shadow }, null, 2),
        contentType: 'application/json'
      })
      for (const [stage, buffer] of [
        ['actual', actual],
        ['reference', relaxed],
        ['background', background]
      ] as const)
        await info.attach(`${label}-${stage}`, { body: buffer, contentType: 'image/png' })
      expect(stability.maxChannelDelta).toBe(0)
      expect(shadow.changedPixels).toBeGreaterThan(0)
      expect.soft(paint.changedPixels, `${label} 外环应与未裁剪参考图一致`).toBe(0)
      for (const ancestor of before.ancestors) {
        for (const edge of ancestor.clipX ? (['leftRoom', 'rightRoom'] as const) : [])
          expect
            .soft(ancestor[edge], `${label} ${ancestor.className} ${edge}`)
            .toBeGreaterThanOrEqual(6)
        for (const edge of ancestor.clipY ? (['topRoom', 'bottomRoom'] as const) : [])
          expect
            .soft(ancestor[edge], `${label} ${ancestor.className} ${edge}`)
            .toBeGreaterThanOrEqual(6)
      }
    } finally {
      await card.evaluate((element, style) => {
        if (style === null) element.removeAttribute('style')
        else element.setAttribute('style', style)
      }, originalCardStyle)
      await tabsContent.evaluate((element, style) => {
        if (style === null) element.removeAttribute('style')
        else element.setAttribute('style', style)
      }, originalTabsStyle)
    }
    await settle()
    expect((await inspect()).cardRect).toEqual(before.cardRect)
    expect(await card.getAttribute('style')).toBe(originalCardStyle)
    expect(await tabsContent.getAttribute('style')).toBe(originalTabsStyle)
    expect(
      compareShadowPaint(actual, await capture(), region, before.samples).maxChannelDelta
    ).toBe(0)
  }
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 }
  ]) {
    await page.setViewportSize(viewport)
    await resultTable.scrollIntoViewIfNeeded()
    await expect(resultTable.getByText('J-001', { exact: true })).toBeInViewport()
    await expect(resultTable.getByText('J-002', { exact: true })).toBeInViewport()
    await expect(resultTable.locator('.pagination')).toBeInViewport()
    await expectNoPageOverflow(page)
    await page.screenshot({ path: info.outputPath(`paged-data-${viewport.width}.png`) })
    await capturePaint(`${theme}-${viewport.width}`)
  }
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.evaluate(async () => {
    const { useTheme }: typeof import('../../src/hooks/core/useTheme') = await import(
      new URL('/src/hooks/core/useTheme.ts', location.origin).href
    )
    const { SystemThemeEnum }: typeof import('../../src/enums/app-enum') = await import(
      new URL('/src/enums/app-enum.ts', location.origin).href
    )
    useTheme().switchThemeStyles(SystemThemeEnum.DARK)
  })
  await assertAppearance(page, { theme: 'dark', boxBorderMode: false })
  await resultTable.scrollIntoViewIfNeeded()
  await expect(resultTable.getByText('J-002', { exact: true })).toBeInViewport()
  await page.screenshot({ path: info.outputPath('paged-data-dark.png') })
  await capturePaint('dark-1280')
  bridge.setEmpty(true)
  await page.getByRole('button', { name: '查询分页记录' }).click()
  await resultTable.scrollIntoViewIfNeeded()
  await expect(resultTable.getByText('本页没有记录', { exact: true })).toBeInViewport()
  await page.screenshot({ path: info.outputPath('paged-data-empty.png') })
  expect(bridge.unexpectedFunctions).toEqual([])
  expect(errors).toEqual([])
})
