import { writeFile } from 'node:fs/promises'
import { expect, test, type Locator } from '@playwright/test'
import { isEqual, omit } from 'lodash-es'
import { assertAppearance, prepareAppearance } from './support/appearance'
import { prepareIsolatedSession } from './support/isolated-session'
import { compareShadowPaint, shadowPaintRegion } from './support/shadow-paint'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

async function settleResource(tile: Locator) {
  const stable = await tile.evaluate(async (node) => {
    await document.fonts.ready
    let previous = '',
      count = 0
    for (let frame = 0; frame < 120 && count < 6; frame++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      const current = JSON.stringify({
        box: node.getBoundingClientRect().toJSON(),
        shadow: getComputedStyle(node).boxShadow,
        transform: getComputedStyle(node).transform
      })
      count = current === previous ? count + 1 : 0
      previous = current
    }
    return count
  })
  expect(stable).toBe(6)
}

async function resourceState(tile: Locator) {
  return tile.evaluate((node) => {
    const geometry = (element: Element) => ({
      box: element.getBoundingClientRect().toJSON(),
      clientWidth: element.clientWidth,
      clientHeight: element.clientHeight,
      scrollWidth: element.scrollWidth,
      scrollHeight: element.scrollHeight,
      scrollTop: element.scrollTop,
      scrollLeft: element.scrollLeft
    })
    const ancestors = []
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent)
      const { scrollHeight, scrollWidth, ...layout } = geometry(parent)
      const strict =
        parent.matches('.el-scrollbar__wrap, .el-overlay, .el-overlay-dialog, html, body') ||
        [style.overflowX, style.overflowY].some((value) => ['auto', 'scroll'].includes(value))
      ancestors.push({
        className: parent.className,
        layout: { ...layout, ...(strict ? { scrollHeight, scrollWidth } : {}) }
      })
    }
    return {
      target: geometry(node),
      ancestors,
      shadow: getComputedStyle(node).boxShadow,
      transform: getComputedStyle(node).transform,
      pressed: node.querySelector('button')?.getAttribute('aria-pressed'),
      focus: {
        tag: document.activeElement?.tagName,
        id: document.activeElement?.id,
        placeholder: document.activeElement?.getAttribute('placeholder')
      },
      page: {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
        scrollX,
        scrollY
      }
    }
  })
}

for (const profile of [
  { width: 1440, height: 900, theme: 'light', boxBorderMode: false },
  { width: 390, height: 844, theme: 'dark', boxBorderMode: false },
  { width: 1440, height: 900, theme: 'dark', boxBorderMode: true },
  { width: 390, height: 844, theme: 'light', boxBorderMode: true }
] as const) {
  test(`资源卡片绘制与滚动 ${profile.width}-${profile.theme}-${profile.boxBorderMode ? 'border' : 'shadow'}`, async ({
    page
  }, info) => {
    const writes: string[] = [],
      errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setViewportSize({ width: profile.width, height: profile.height })
    await prepareIsolatedSession(page)
    const appearance = { theme: profile.theme, boxBorderMode: profile.boxBorderMode }
    await prepareAppearance(page, appearance)
    const rows = Array.from({ length: 30 }, (_, index) => ({
      id: `11111111-1111-4111-8111-${String(index + 1).padStart(12, '0')}`,
      tenant_id: 'test-tenant',
      origin_name: `卡片绘制资料${String(index + 1).padStart(2, '0')}.pdf`,
      suffix: 'pdf',
      size: 512,
      url: `/__test/resource-shadow-${index + 1}.pdf`,
      create_time: '2026-11-20T00:00:00Z'
    }))
    await page.route('**/rest/v1/**', (route) => {
      const request = route.request(),
        url = new URL(request.url())
      if (request.method() !== 'GET') {
        writes.push(`${request.method()} ${url.pathname}`)
        return route.abort('blockedbyclient')
      }
      if (!url.pathname.endsWith('/sys_attachment')) return route.fulfill({ json: [] })
      expect(url.searchParams.get('tenant_id')).toBe('eq.test-tenant')
      expect(url.searchParams.get('suffix')).toContain('pdf')
      return route.fulfill({
        json: rows,
        headers: { 'content-range': '0-29/30', 'access-control-expose-headers': 'content-range' }
      })
    })
    await page.route('**/__test/resource-shadow-*.pdf', (route) =>
      route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.4\n%%EOF' })
    )
    await page.goto(
      '/tests/e2e/fixtures/picker-overlay-state.html?mode=resource&menu-read&appearance=studio-flow'
    )
    await assertAppearance(page, appearance)
    await page.getByRole('button', { name: '打开选择器', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '资源选择器', exact: true })
    const panel = dialog.locator('.art-resource-picker__content .resource-panel')
    const tiles = panel.locator('.resource-item')
    const tile = tiles.first()
    const wrap = panel.locator('.el-scrollbar > .el-scrollbar__wrap')
    await expect(tiles).toHaveCount(30)
    await expect(wrap).toHaveCount(1)
    expect(await wrap.evaluate((node) => node.scrollHeight - node.clientHeight)).toBeGreaterThan(1)
    await page.mouse.move(profile.width / 2, 80)
    await settleResource(tile)
    await page.screenshot({ path: info.outputPath('neutral-context.png'), animations: 'disabled' })
    const categoryState = () =>
      panel.locator('.el-segmented').evaluate((root) => {
        const selected = root.querySelector('input:checked')?.closest('label')
        const viewport = root.parentElement
        if (!selected || !viewport) throw new Error('缺少真实分类或横向窗口')
        const bounds = selected.getBoundingClientRect()
        const clip = viewport.getBoundingClientRect()
        return {
          label: selected.textContent?.trim(),
          clipped: Math.max(
            0,
            Math.round(clip.left - bounds.left),
            Math.round(bounds.right - clip.right)
          ),
          selected: bounds.toJSON(),
          viewport: clip.toJSON(),
          scrollLeft: viewport.scrollLeft
        }
      })
    await writeFile(
      info.outputPath('category.json'),
      JSON.stringify(await categoryState(), null, 2)
    )
    await expect.poll(async () => (await categoryState()).clipped).toBeLessThanOrEqual(1)
    expect((await categoryState()).label).toBe('文档')
    await tile.getByRole('button').click()
    await expect(tile.getByRole('button')).toHaveAttribute('aria-pressed', 'true')
    await panel.getByPlaceholder('搜索此分类下的资源').focus()
    await page.mouse.move(profile.width / 2, 80)
    await wrap.evaluate((node) => {
      node.scrollTop = 0
      node.scrollLeft = 0
    })
    await settleResource(tile)
    const original = await resourceState(tile)
    expect(original.pressed).toBe('true')
    expect(original.transform).toBe('none')
    const tileStyles = await tiles.evaluateAll((nodes) =>
      nodes.map((node, index) => {
        const style = node.getAttribute('style')
        if (index !== 0 && node instanceof HTMLElement)
          node.style.setProperty('box-shadow', 'none', 'important')
        return style
      })
    )
    const owners = wrap.locator('..').or(wrap)
    await expect(owners).toHaveCount(2)
    const ownerStyles = await owners.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('style'))
    )
    const settled = await resourceState(tile)
    expect(settled).toEqual(original)
    const bounds = original.target.box
    const sampleDepth = 32
    const samples = {
      left: {
        x: Math.floor(bounds.x) - sampleDepth,
        y: Math.ceil(bounds.y) + 24,
        width: sampleDepth,
        height: Math.floor(bounds.height) - 48
      },
      top: {
        x: Math.ceil(bounds.x) + 24,
        y: Math.floor(bounds.y) - sampleDepth,
        width: Math.floor(bounds.width) - 48,
        height: sampleDepth
      },
      right: {
        x: Math.ceil(bounds.right),
        y: Math.ceil(bounds.y) + 24,
        width: sampleDepth,
        height: Math.floor(bounds.height) - 48
      },
      bottom: {
        x: Math.ceil(bounds.x) + 24,
        y: Math.ceil(bounds.bottom),
        width: Math.floor(bounds.width) - 48,
        height: sampleDepth
      }
    }
    const clip = shadowPaintRegion(Object.values(samples))
    const capture = (name: string) =>
      page.screenshot({
        path: info.outputPath(`${name}.png`),
        clip,
        animations: 'disabled',
        caret: 'hide',
        scale: 'css'
      })
    let proof: Record<string, unknown> = {}
    let comparisons: Record<
      string,
      {
        paint: ReturnType<typeof compareShadowPaint>
        ink: ReturnType<typeof compareShadowPaint>
        repeat: ReturnType<typeof compareShadowPaint>
      }
    >
    try {
      const actual = await capture('selected-actual')
      const repeat = await capture('selected-repeat')
      await owners.evaluateAll((nodes) =>
        nodes.forEach((node) => {
          if (node instanceof HTMLElement)
            node.style.setProperty('overflow', 'visible', 'important')
        })
      )
      await settleResource(tile)
      const referenceState = await resourceState(tile)
      const reference = await capture('selected-reference')
      await tile.evaluate((node) => {
        node.style.setProperty('box-shadow', 'none', 'important')
      })
      const backgroundState = await resourceState(tile)
      const background = await capture('selected-background')
      const referenceLayout = omit(referenceState, ['shadow'])
      const backgroundLayout = omit(backgroundState, ['shadow'])
      comparisons = Object.fromEntries(
        Object.entries(samples).map(([edge, rect]) => [
          edge,
          {
            paint: compareShadowPaint(actual, reference, clip, [rect]),
            ink: compareShadowPaint(reference, background, clip, [rect]),
            repeat: compareShadowPaint(actual, repeat, clip, [rect])
          }
        ])
      )
      proof = {
        original,
        referenceState,
        backgroundState,
        valid: isEqual(settled, referenceState) && isEqual(referenceLayout, backgroundLayout),
        clip,
        samples,
        comparisons
      }
    } finally {
      await owners.evaluateAll(
        (nodes, styles) =>
          nodes.forEach((node, index) => {
            const style = styles[index]
            if (style === null) node.removeAttribute('style')
            else node.setAttribute('style', style)
          }),
        ownerStyles
      )
      await tiles.evaluateAll(
        (nodes, styles) =>
          nodes.forEach((node, index) => {
            const style = styles[index]
            if (style === null) node.removeAttribute('style')
            else node.setAttribute('style', style)
          }),
        tileStyles
      )
      await settleResource(tile)
      const restored = await resourceState(tile)
      await writeFile(
        info.outputPath('selected-proof.json'),
        JSON.stringify({ ...proof, restored, writes, errors }, null, 2)
      )
      await page.screenshot({
        path: info.outputPath('selected-context.png'),
        animations: 'disabled'
      })
      expect(restored).toEqual(original)
    }
    expect(writes).toEqual([])
    expect(errors).toEqual([])
    expect(proof.valid, '参考必须保留原布局、滚动、选择与焦点').toBe(true)
    for (const [edge, comparison] of Object.entries(comparisons)) {
      expect(comparison.repeat.maxChannelDelta, `${edge} 稳定截图`).toBeLessThanOrEqual(1)
      expect(comparison.ink.changedPixels, `${edge} 真实目标阴影`).toBeGreaterThan(0)
      expect(comparison.paint.maxChannelDelta, `${edge} 原始与参考阴影一致`).toBeLessThanOrEqual(1)
    }
    await tile.getByRole('button').click()
    await expect(tile.getByRole('button')).toHaveAttribute('aria-pressed', 'false')
    await page.mouse.move(profile.width / 2, 80)
    await tile.getByRole('button').focus()
    await expect(tile.getByRole('button')).toBeFocused()
    await settleResource(tile)
    const focused = await resourceState(tile)
    expect(focused.shadow).toBe(original.shadow)
    await page.screenshot({ path: info.outputPath('focused-context.png'), animations: 'disabled' })

    const header = dialog.locator('.el-dialog__header')
    const footer = dialog.locator('.el-dialog__footer')
    const fixed = { header: await header.boundingBox(), footer: await footer.boundingBox() }
    const wrapBox = await wrap.boundingBox()
    if (!wrapBox) throw new Error('缺少资源实际滚动窗口')
    const beforeWheel = await wrap.evaluate((node) => node.scrollTop)
    await page.mouse.move(wrapBox.x + wrapBox.width / 2, wrapBox.y + wrapBox.height / 2)
    await page.mouse.wheel(0, 420)
    await expect.poll(() => wrap.evaluate((node) => node.scrollTop)).toBeGreaterThan(beforeWheel)
    await wrap.evaluate((node) => {
      node.scrollTop = node.scrollHeight - node.clientHeight
    })
    const lastRowIndex = await tiles.evaluateAll((nodes) => {
      const boxes = nodes.map((node, index) => ({ index, box: node.getBoundingClientRect() }))
      const bottom = Math.max(...boxes.map(({ box }) => box.bottom))
      return boxes
        .filter(({ box }) => Math.abs(box.bottom - bottom) <= 1)
        .sort((a, b) => a.box.x - b.box.x)[0].index
    })
    const lastRowButton = tiles.nth(lastRowIndex).getByRole('button')
    await lastRowButton.click()
    await panel.getByPlaceholder('搜索此分类下的资源').focus()
    await page.mouse.move(profile.width / 2, 80)
    await wrap.evaluate((node) => {
      node.scrollTop = node.scrollHeight - node.clientHeight
    })
    await settleResource(tiles.nth(lastRowIndex))
    await expect(lastRowButton).toHaveAttribute('aria-pressed', 'true')
    await expect(lastRowButton).toBeInViewport({ ratio: 1 })
    await expect(tiles.last().getByRole('button')).toBeInViewport({ ratio: 1 })
    await expect(dialog.getByRole('button', { name: '确认', exact: true })).toBeEnabled()
    expect({ header: await header.boundingBox(), footer: await footer.boundingBox() }).toEqual(
      fixed
    )
    const terminal = await tiles.nth(lastRowIndex).evaluate((node) => {
      const wrap = node.closest('.el-scrollbar__wrap')
      if (!wrap) throw new Error('末行未处于真实滚动窗口')
      return {
        tile: node.getBoundingClientRect().toJSON(),
        wrap: wrap.getBoundingClientRect().toJSON(),
        scrollTop: wrap.scrollTop,
        range: wrap.scrollHeight - wrap.clientHeight
      }
    })
    expect(Math.abs(terminal.scrollTop - terminal.range)).toBeLessThanOrEqual(1)
    expect(terminal.wrap.bottom - terminal.tile.bottom).toBeGreaterThanOrEqual(24)
    await writeFile(
      info.outputPath('resource-states.json'),
      JSON.stringify({ focused, terminal, fixed, lastRowIndex }, null, 2)
    )
    await page.screenshot({
      path: info.outputPath('terminal-selected.png'),
      animations: 'disabled'
    })
    await dialog.getByRole('button', { name: '全屏', exact: true }).click()
    await expect(dialog.locator('.el-dialog')).toContainClass('is-fullscreen')
    await expect.poll(async () => (await categoryState()).clipped).toBeLessThanOrEqual(1)
    await wrap.evaluate((node) => {
      node.scrollTop = node.scrollHeight - node.clientHeight
    })
    await expect(lastRowButton).toHaveAttribute('aria-pressed', 'true')
    await expect(lastRowButton).toBeInViewport({ ratio: 1 })
    await page.screenshot({
      path: info.outputPath('fullscreen-selected.png'),
      animations: 'disabled'
    })
    await dialog.getByRole('button', { name: '退出全屏', exact: true }).click()
    await expect(dialog.locator('.el-dialog')).not.toContainClass('is-fullscreen')
    await expect.poll(async () => (await categoryState()).clipped).toBeLessThanOrEqual(1)
    await expect(lastRowButton).toHaveAttribute('aria-pressed', 'true')
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await expect(dialog).toBeHidden()
    expect(writes).toEqual([])
    expect(errors).toEqual([])
  })
}
