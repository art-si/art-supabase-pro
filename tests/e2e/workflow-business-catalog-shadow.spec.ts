import { writeFile } from 'node:fs/promises'
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test'
import { isEqual } from 'lodash-es'
import { assertAppearance, prepareAppearance } from './support/appearance'
import { prepareIsolatedSession } from './support/isolated-session'
import { compareShadowPaint, shadowPaintRegion, type PaintRect } from './support/shadow-paint'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

async function settleCatalog(dialog: Locator) {
  const frames = await dialog.evaluate(async (root) => {
    await document.fonts.ready
    let previous = '',
      stable = 0
    for (let attempt = 0; attempt < 120 && stable < 6; attempt++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      const current = JSON.stringify(
        [
          ...root.querySelectorAll(
            '.workflow-catalog, .workflow-catalog__content, .workflow-catalog__grid > article, .workflow-catalog__boundary, .el-scrollbar__wrap'
          )
        ].map((node) => [
          node.getBoundingClientRect().toJSON(),
          node.scrollTop,
          node.scrollLeft,
          node.scrollHeight
        ])
      )
      stable = current === previous ? stable + 1 : 0
      previous = current
    }
    return stable
  })
  expect(frames, '业务覆盖布局达到稳定帧').toBe(6)
}

async function catalogOwner(dialog: Locator): Promise<Locator> {
  const matrix = dialog.locator('.workflow-catalog__body > .el-scrollbar__wrap')
  const outer = dialog.locator('.art-dialog__scrollbar > .el-scrollbar__wrap')
  return (await matrix.evaluate((node) => node.scrollHeight - node.clientHeight)) > 1 ||
    !(await outer.count())
    ? matrix
    : outer
}

async function positionCard(dialog: Locator, card: Locator, reset = false): Promise<Locator> {
  const owner = await catalogOwner(dialog)
  if (reset)
    await owner.evaluate((node) => {
      node.scrollTop = 0
    })
  const [cardBox, ownerBox] = await Promise.all([card.boundingBox(), owner.boundingBox()])
  if (!cardBox || !ownerBox) throw new Error('无法测量真实卡片和scroll owner')
  await owner.evaluate(
    (node, delta) => {
      node.scrollTop += delta
    },
    cardBox.y - ownerBox.y - 24
  )
  await settleCatalog(dialog)
  return owner
}

async function inspectCatalog(dialog: Locator) {
  return dialog.evaluate((root) => {
    const catalog = root.querySelector('.workflow-catalog')
    const matrixWrap = catalog?.querySelector('.workflow-catalog__body > .el-scrollbar__wrap')
    const outerWrap = root.querySelector('.art-dialog__scrollbar > .el-scrollbar__wrap')
    const wrap =
      matrixWrap && matrixWrap.scrollHeight - matrixWrap.clientHeight > 1
        ? matrixWrap
        : (outerWrap ?? matrixWrap)
    const view = wrap?.querySelector('.el-scrollbar__view')
    const articles = [...root.querySelectorAll('.workflow-catalog__grid > article')]
    const boundary = root.querySelector('.workflow-catalog__boundary')
    const header = root.querySelector('.art-dialog__header')
    const menu = root.querySelector('.workflow-catalog__menu')
    const menuCard = menu?.querySelector('.art-section-card')
    if (
      !catalog ||
      !matrixWrap ||
      !wrap ||
      !view ||
      !articles.length ||
      !boundary ||
      !header ||
      !menu
    )
      throw new Error('真实审批业务覆盖结构尚未就绪')
    const box = (node: Element) => {
      const rect = node.getBoundingClientRect()
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        right: rect.right,
        bottom: rect.bottom
      }
    }
    const geometry = (node: Element) => ({
      box: box(node),
      clientWidth: node.clientWidth,
      clientHeight: node.clientHeight,
      scrollWidth: node.scrollWidth,
      scrollHeight: node.scrollHeight,
      scrollLeft: node.scrollLeft,
      scrollTop: node.scrollTop
    })
    const inspect = (node: Element) => {
      const rect = box(node),
        style = getComputedStyle(node)
      const ancestors = []
      for (let parent = node.parentElement; parent; parent = parent.parentElement) {
        const parentStyle = getComputedStyle(parent),
          bounds = box(parent)
        const margin =
          parentStyle.overflowX === 'clip' && parentStyle.overflowY === 'clip'
            ? parseFloat(parentStyle.overflowClipMargin) || 0
            : 0
        const scaleX = parent.offsetWidth ? bounds.width / parent.offsetWidth : 1
        const scaleY = parent.offsetHeight ? bounds.height / parent.offsetHeight : 1
        const clipX = ['hidden', 'clip', 'auto', 'scroll'].includes(parentStyle.overflowX)
        const clipY = ['hidden', 'clip', 'auto', 'scroll'].includes(parentStyle.overflowY)
        ancestors.push({
          className: parent.className,
          geometry: geometry(parent),
          strictExtent:
            parent.matches('.el-scrollbar__wrap, .el-overlay, .el-overlay-dialog, html, body') ||
            [parentStyle.overflowX, parentStyle.overflowY].some((value) =>
              ['auto', 'scroll'].includes(value)
            ),
          overflowX: parentStyle.overflowX,
          overflowY: parentStyle.overflowY,
          clipPath: parentStyle.clipPath,
          clipMargin: parentStyle.overflowClipMargin,
          clipX,
          clipY,
          leftRoom: rect.x - bounds.x - parent.clientLeft * scaleX + margin,
          rightRoom:
            bounds.x + (parent.clientLeft + parent.clientWidth) * scaleX - rect.right + margin,
          topRoom: rect.y - bounds.y - parent.clientTop * scaleY + margin,
          bottomRoom:
            bounds.y + (parent.clientTop + parent.clientHeight) * scaleY - rect.bottom + margin
        })
      }
      return {
        label: node.querySelector('strong')?.textContent?.trim() ?? '',
        rect,
        geometry: geometry(node),
        ancestors,
        shadow: style.boxShadow,
        border: { width: style.borderTopWidth, color: style.borderTopColor },
        radius: style.borderTopLeftRadius,
        visible:
          rect.width > 0 &&
          rect.height > 0 &&
          rect.x >= -1 &&
          rect.right <= innerWidth + 1 &&
          rect.y >= -1 &&
          rect.bottom <= innerHeight + 1 &&
          ancestors.every(
            (parent) =>
              (!parent.clipX || (parent.leftRoom >= -1 && parent.rightRoom >= -1)) &&
              (!parent.clipY || (parent.topRoom >= -1 && parent.bottomRoom >= -1))
          )
      }
    }
    const close = header.querySelector('button[aria-label="关闭弹窗"]')
    const ancestorOwners = [],
      nativeOverlays = []
    for (let node: Element | null = matrixWrap; node; node = node.parentElement) {
      if (node.matches('.el-scrollbar__wrap')) {
        const style = getComputedStyle(node)
        ancestorOwners.push({
          kind: node === matrixWrap ? 'matrix' : 'outer',
          geometry: geometry(node),
          overflowY: style.overflowY,
          scrollable:
            ['auto', 'scroll'].includes(style.overflowY) &&
            node.scrollHeight - node.clientHeight > 1
        })
      }
      if (node.matches('.el-overlay, .el-overlay-dialog'))
        nativeOverlays.push({ className: node.className, geometry: geometry(node) })
    }
    return {
      appearance: {
        dark: document.documentElement.classList.contains('dark'),
        scope: document.documentElement.dataset.uiScope,
        box: document.documentElement.dataset.boxMode,
        color: getComputedStyle(document.documentElement).getPropertyValue('--theme-color').trim(),
        radius: getComputedStyle(document.documentElement)
          .getPropertyValue('--custom-radius')
          .trim(),
        shadowToken: getComputedStyle(root).getPropertyValue('--art-card-shadow-xs').trim()
      },
      count: articles.length,
      dialog: box(root),
      catalog: box(catalog),
      header: box(header),
      close: close ? box(close) : null,
      ownerKind: wrap === matrixWrap ? 'matrix' : 'outer',
      ancestorOwners,
      nativeOverlays,
      matrixWrap: geometry(matrixWrap),
      wrap: geometry(wrap),
      view: geometry(view),
      scrollPorts: [...root.querySelectorAll('.el-scrollbar__wrap')].map((node) => ({
        className: node.className,
        geometry: geometry(node)
      })),
      first: inspect(articles[0]),
      last: inspect(articles[articles.length - 1]),
      boundary: inspect(boundary),
      menu: { aside: box(menu), card: menuCard ? inspect(menuCard) : null },
      outerScrollbarCount: root.querySelectorAll('.art-dialog__scrollbar').length,
      footerCount: root.querySelectorAll('.art-dialog__footer').length,
      page: {
        width: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        height: document.documentElement.scrollHeight,
        clientHeight: document.documentElement.clientHeight,
        scrollX,
        scrollY,
        viewportWidth: innerWidth,
        viewportHeight: innerHeight
      }
    }
  })
}

type CatalogState = Awaited<ReturnType<typeof inspectCatalog>>

const paintLayout = (state: CatalogState, target: 'matrix' | 'menu' = 'matrix') => {
  const card = target === 'matrix' ? state.first : state.menu.card
  if (!card) throw new Error('缺少真实菜单卡片')
  return {
    target: card.geometry,
    // Non-scroll owners may report the newly exposed paint as overflow extent.
    // Every box/client/scroll position and all real scroll owner extents remain strict.
    ancestors: card.ancestors.map(({ geometry, strictExtent }) => {
      const { scrollWidth, scrollHeight, ...layout } = geometry
      return { ...layout, ...(strictExtent ? { scrollWidth, scrollHeight } : {}) }
    }),
    scrollPorts: state.scrollPorts,
    page: state.page,
    dialog: state.dialog,
    header: state.header,
    catalog: state.catalog,
    wrap: state.wrap,
    view: state.view
  }
}

async function probeCardShadow(
  page: Page,
  dialog: Locator,
  info: TestInfo,
  target: 'matrix' | 'menu'
) {
  const first =
    target === 'matrix'
      ? dialog.locator('.workflow-catalog__grid > article').first()
      : dialog.locator('.workflow-catalog__menu .art-section-card')
  const prefix = target === 'matrix' ? 'first-shadow' : 'menu-shadow'
  await positionCard(dialog, first, true)
  const original = await inspectCatalog(dialog)
  const originalCard = target === 'matrix' ? original.first : original.menu.card
  if (!originalCard) throw new Error('缺少真实shadow目标')
  const { x, y, right, bottom } = originalCard.rect
  const h = original.page.viewportHeight,
    w = original.page.viewportWidth
  const verticalStart = Math.ceil(Math.max(2, y + 24)),
    verticalEnd = Math.floor(Math.min(h - 2, bottom - 24))
  const horizontalStart = Math.ceil(Math.max(2, x + 24)),
    horizontalEnd = Math.floor(Math.min(w - 2, right - 24))
  const bands: { side: string; sample: PaintRect }[] = [
    {
      side: 'left',
      sample: {
        x: Math.ceil(Math.max(2, x - 24)),
        y: verticalStart,
        width: Math.floor(x - 1) - Math.ceil(Math.max(2, x - 24)),
        height: verticalEnd - verticalStart
      }
    },
    {
      side: 'right',
      sample: {
        x: Math.ceil(right + 1),
        y: verticalStart,
        width: Math.floor(Math.min(w - 2, right + 24)) - Math.ceil(right + 1),
        height: verticalEnd - verticalStart
      }
    },
    {
      side: 'top',
      sample: {
        x: horizontalStart,
        y: Math.ceil(Math.max(2, y - 24)),
        width: horizontalEnd - horizontalStart,
        height: Math.floor(y - 1) - Math.ceil(Math.max(2, y - 24))
      }
    },
    {
      side: 'bottom',
      sample: {
        x: horizontalStart,
        y: Math.ceil(bottom + 1),
        width: horizontalEnd - horizontalStart,
        height: Math.floor(Math.min(h - 2, bottom + 24)) - Math.ceil(bottom + 1)
      }
    }
  ]
  const validSamples = bands.every(({ sample }) => sample.width > 0 && sample.height > 0)
  if (!validSamples) {
    await writeFile(
      info.outputPath(`${prefix}-setup.json`),
      JSON.stringify(
        {
          original,
          target,
          bands,
          validSamples,
          status: 'pixel-sample-unavailable',
          reason: '真实viewport不容纳四侧paint样本；仅保留可达/scroll几何结果，不归类pixel RED'
        },
        null,
        2
      ),
      'utf8'
    )
    expect.soft(validSamples, `${target}像素验证未完成：视口未容纳四边采样`).toBe(true)
    return
  }
  const saved = await first.evaluateHandle((element) => {
    if (!(element instanceof HTMLElement)) throw new Error('业务卡片不是HTML元素')
    const ancestors = []
    for (let node = element.parentElement; node; node = node.parentElement)
      ancestors.push({ node, style: node.getAttribute('style') })
    const overlay = element.closest('.art-dialog')
    if (!overlay) throw new Error('缺少真实业务覆盖弹窗')
    const others = [
      ...overlay.querySelectorAll<HTMLElement>('.art-card, .art-card-sm, .art-card-xs')
    ]
      .filter((node) => node !== element)
      .map((node) => ({ node, style: node.getAttribute('style') }))
    return { element, targetStyle: element.getAttribute('style'), ancestors, others }
  })
  const region = shadowPaintRegion(bands.map(({ sample }) => sample))
  const capture = async (stage: string) => {
    const buffer = await page.screenshot({ clip: region, scale: 'css', animations: 'disabled' })
    await writeFile(info.outputPath(`${prefix}-${stage}.png`), buffer)
    return buffer
  }
  try {
    await saved.evaluate(({ others }) => {
      for (const { node } of others) node.style.setProperty('box-shadow', 'none', 'important')
    })
    await settleCatalog(dialog)
    const before = await inspectCatalog(dialog)
    const actual = await capture('actual'),
      repeat = await capture('repeat')
    await saved.evaluate(({ ancestors }, target) => {
      for (const { node } of ancestors) {
        if (
          !node.matches(
            target === 'matrix'
              ? '.workflow-catalog__body, .workflow-catalog__body > .el-scrollbar__wrap, .workflow-catalog__content'
              : '.workflow-catalog__menu'
          )
        )
          continue
        const style = getComputedStyle(node)
        if (
          [style.overflowX, style.overflowY].some((value) =>
            ['hidden', 'clip', 'auto', 'scroll'].includes(value)
          )
        ) {
          node.style.setProperty('overflow', 'clip', 'important')
          node.style.setProperty('overflow-clip-margin', '40px', 'important')
        }
        if (style.clipPath !== 'none') node.style.setProperty('clip-path', 'none', 'important')
      }
    }, target)
    await settleCatalog(dialog)
    const referenceGeometry = await inspectCatalog(dialog)
    const reference = await capture('reference')
    await saved.evaluate(({ element }) =>
      element.style.setProperty('box-shadow', 'none', 'important')
    )
    await settleCatalog(dialog)
    const backgroundGeometry = await inspectCatalog(dialog)
    const background = await capture('target-shadow-off')
    const referenceValid =
      isEqual(paintLayout(original, target), paintLayout(before, target)) &&
      isEqual(paintLayout(before, target), paintLayout(referenceGeometry, target)) &&
      isEqual(paintLayout(before, target), paintLayout(backgroundGeometry, target))
    const beforeCard = target === 'matrix' ? before.first : before.menu.card
    const referenceCard =
      target === 'matrix' ? referenceGeometry.first : referenceGeometry.menu.card
    if (!beforeCard || !referenceCard) throw new Error('shadow对照缺少真实目标')
    const stability = bands.map(({ side, sample }) => ({
      side,
      ...compareShadowPaint(actual, repeat, region, [sample])
    }))
    const comparisons = referenceValid
      ? bands.map(({ side, sample }) => ({
          side,
          paint: compareShadowPaint(actual, reference, region, [sample]),
          ink: compareShadowPaint(reference, background, region, [sample])
        }))
      : null
    await writeFile(
      info.outputPath(`${prefix}-proof.json`),
      JSON.stringify(
        {
          original,
          target,
          before,
          referenceGeometry,
          backgroundGeometry,
          region,
          bands,
          referenceValid,
          extentPolicy:
            '所有target/祖先box与client/scroll位置、真实ElScrollbar及native overlay/page extent严格；仅非scroll owner paint overflow extent可不同',
          nonScrollPaintExtents: beforeCard.ancestors.flatMap((ancestor, index) => {
            const next = referenceCard.ancestors[index]
            return !ancestor.strictExtent &&
              next &&
              (ancestor.geometry.scrollWidth !== next.geometry.scrollWidth ||
                ancestor.geometry.scrollHeight !== next.geometry.scrollHeight)
              ? [
                  {
                    className: ancestor.className,
                    before: [ancestor.geometry.scrollWidth, ancestor.geometry.scrollHeight],
                    reference: [next.geometry.scrollWidth, next.geometry.scrollHeight]
                  }
                ]
              : []
          }),
          stability,
          comparisons
        },
        null,
        2
      ),
      'utf8'
    )
    expect
      .soft(
        referenceValid,
        'paint reference须保持target/全部祖先box及scrollport/page几何原样；否则不能归因裁影'
      )
      .toBe(true)
    for (const item of stability)
      expect.soft(item.maxChannelDelta, `${item.side}连续截图稳定`).toBeLessThanOrEqual(1)
    if (comparisons)
      for (const { side, paint, ink } of comparisons) {
        expect.soft(ink.changedPixels, `${side}参考必须包含目标自身阴影`).toBeGreaterThan(0)
        expect
          .soft(paint.maxChannelDelta, `${side}实际阴影与原样几何参考一致`)
          .toBeLessThanOrEqual(1)
      }
  } finally {
    await saved.evaluate(({ element, targetStyle, ancestors, others }) => {
      for (const { node, style } of [
        ...others,
        ...ancestors,
        { node: element, style: targetStyle }
      ]) {
        if (style === null) node.removeAttribute('style')
        else node.setAttribute('style', style)
      }
    })
    await settleCatalog(dialog)
    const restored = await inspectCatalog(dialog)
    await writeFile(
      info.outputPath(`${prefix}-restored.json`),
      JSON.stringify(restored, null, 2),
      'utf8'
    )
    const restoredCard = target === 'matrix' ? restored.first : restored.menu.card
    expect.soft(restoredCard, '恢复后保留真实shadow目标').not.toBeNull()
    if (restoredCard) {
      expect
        .soft(paintLayout(restored, target), `${target}恢复后全部布局和scroll值`)
        .toEqual(paintLayout(original, target))
      expect
        .soft(
          restoredCard.ancestors.map(({ geometry }) => geometry),
          'style恢复后连非scroll owner extent也还原'
        )
        .toEqual(originalCard.ancestors.map(({ geometry }) => geometry))
      expect.soft(restoredCard.shadow, '恢复目标原shadow').toBe(originalCard.shadow)
    }
    await saved.dispose()
  }
}

function expectCatalogFrame(state: CatalogState) {
  expect
    .soft(
      state.ancestorOwners.filter(({ scrollable }) => scrollable).length,
      '矩阵父链恰有一个真实可滚ElScrollbar，不能双滚'
    )
    .toBe(1)
  expect.soft(state.footerCount, '业务覆盖无footer').toBe(0)
  for (const overlay of state.nativeOverlays) {
    expect
      .soft(
        overlay.geometry.scrollHeight - overlay.geometry.clientHeight,
        'native overlay不替代ElScrollbar承接正文'
      )
      .toBeLessThanOrEqual(1)
    expect
      .soft(
        [overlay.geometry.scrollLeft, overlay.geometry.scrollTop],
        'native overlay不靠hidden程序滚动充数'
      )
      .toEqual([0, 0])
  }
  expect.soft(state.page.width - state.page.clientWidth, '页面无横向溢出').toBeLessThanOrEqual(1)
  expect
    .soft(state.page.height - state.page.clientHeight, '页面无页外纵向溢出')
    .toBeLessThanOrEqual(1)
  expect.soft([state.page.scrollX, state.page.scrollY], '只滚动真实内部wrap').toEqual([0, 0])
  expect.soft(state.wrap.box.height, '内部scroll视口有实际高度').toBeGreaterThan(0)
  expect
    .soft(state.wrap.box.bottom, '内部scroll视口未落到屏幕外')
    .toBeLessThanOrEqual(state.page.viewportHeight + 1)
  expect.soft(state.header.y, '标题在视口内').toBeGreaterThanOrEqual(-1)
  expect.soft(state.header.bottom, '标题仍可达').toBeLessThanOrEqual(state.page.viewportHeight + 1)
  expect.soft(state.close, '保留关闭操作').not.toBeNull()
  if (state.close) {
    expect
      .soft(state.close.right, '关闭按钮不越界')
      .toBeLessThanOrEqual(state.page.viewportWidth + 1)
    expect
      .soft(state.close.bottom, '关闭按钮在视口内')
      .toBeLessThanOrEqual(state.page.viewportHeight + 1)
  }
  expect
    .soft(state.wrap.scrollWidth - state.wrap.clientWidth, '矩阵无横向溢出')
    .toBeLessThanOrEqual(1)
}

for (const profile of [
  { width: 1440, height: 900, theme: 'light', boxBorderMode: false },
  { width: 390, height: 844, theme: 'dark', boxBorderMode: false },
  { width: 1440, height: 900, theme: 'dark', boxBorderMode: true },
  { width: 390, height: 844, theme: 'light', boxBorderMode: true }
] as const) {
  test(`真实审批业务覆盖卡片绘制 ${profile.width}/${profile.theme}/${profile.boxBorderMode ? 'border' : 'shadow'}`, async ({
    page
  }, info) => {
    const reads: string[] = [],
      writes: string[] = [],
      errors: string[] = [],
      warnings: string[] = []
    await prepareIsolatedSession(page)
    await prepareAppearance(page, profile)
    await page.setViewportSize({ width: profile.width, height: profile.height })
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (
        /\[Vue warn\]|maximum recursive updates|invoked outside of the render/i.test(message.text())
      )
        warnings.push(message.text())
    })
    const readonlyRpc = [
      'get_menus_for_current_applications',
      'get_accessible_applications',
      'get_current_user_button_permissions',
      'material_unit_compatibility_options',
      'current_is_super',
      'get_table_column_runtime'
    ]
    await page.route('**/rest/v1/**', (route) => {
      const request = route.request(),
        url = new URL(request.url()),
        name = url.pathname.split('/').at(-1) ?? ''
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && !readonlyRpc.includes(name))
        writes.push(url.pathname)
      else reads.push(url.pathname + url.search)
      if (name === 'get_menus_for_current_applications') return route.fulfill({ json: {} })
      if (name === 'get_table_column_runtime')
        return route.fulfill({ json: { enabled: false, profiles: [] } })
      if (name === 'current_is_super') return route.fulfill({ json: true })
      return route.fulfill({
        json: [],
        headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' }
      })
    })
    await page.goto(
      '/tests/e2e/fixtures/workflow-focus.html?mode=definition&appearance=studio-flow',
      { waitUntil: 'domcontentloaded' }
    )
    await assertAppearance(page, profile)
    await page.getByRole('button', { name: '业务覆盖', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '审批业务覆盖与风险矩阵', exact: true })
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.art-dialog__viewport')).toHaveAttribute('aria-busy', 'false')
    await expect(dialog.locator('.workflow-catalog__grid > article').first()).toBeVisible()
    await page.addStyleTag({ path: 'tests/e2e/visual-stability.css' })
    const matrixWrap = dialog.locator('.workflow-catalog__body > .el-scrollbar__wrap')
    const outerWrap = dialog.locator('.art-dialog__scrollbar > .el-scrollbar__wrap')
    const firstCard = dialog.locator('.workflow-catalog__grid > article').first()
    const keyword = dialog.getByRole('textbox', { name: '搜索菜单或审批业务', exact: true })
    const originalWrap = await matrixWrap.elementHandle()
    const originalCard = await firstCard.elementHandle()
    const originalKeyword = await keyword.elementHandle()
    const originalOuter = (await outerWrap.count()) ? await outerWrap.elementHandle() : null
    if (!originalWrap || !originalCard || !originalKeyword)
      throw new Error('业务覆盖真实scroll/card/keyword未挂载')
    const states: { stage: string; geometry: CatalogState }[] = []
    const capture = async (stage: string) => {
      await settleCatalog(dialog)
      const geometry = await inspectCatalog(dialog)
      states.push({ stage, geometry })
      await page.screenshot({
        path: info.outputPath(`catalog-${stage}-context.png`),
        animations: 'disabled'
      })
      if (stage === 'initial' && geometry.menu.card) {
        const rect = geometry.menu.card.rect
        const x = Math.max(0, Math.floor(rect.x - 24)),
          y = Math.max(0, Math.floor(rect.y - 24))
        const width = Math.min(geometry.page.viewportWidth, Math.ceil(rect.right + 24)) - x
        const height = Math.min(geometry.page.viewportHeight, Math.ceil(rect.bottom + 24)) - y
        if (width > 0 && height > 0)
          await page.screenshot({
            path: info.outputPath('catalog-first-menu-context.png'),
            clip: { x, y, width, height },
            animations: 'disabled'
          })
      }
      await writeFile(
        info.outputPath('catalog-geometry.json'),
        JSON.stringify({ profile, states, reads, writes, errors, warnings }, null, 2),
        'utf8'
      )
      return geometry
    }
    await matrixWrap.evaluate((node) => {
      node.scrollTop = 0
    })
    await (
      await catalogOwner(dialog)
    ).evaluate((node) => {
      node.scrollTop = 0
    })
    const initial = await capture('initial')
    await expect
      .soft(dialog.getByText('暂无已接入审批的菜单', { exact: true }), '目录空态标题完整可见')
      .toBeInViewport({ ratio: 1 })
    await expect
      .soft(
        dialog.getByText('请先在流程目录接入可审批菜单。', { exact: true }),
        '目录空态说明完整可见'
      )
      .toBeInViewport({ ratio: 1 })
    await positionCard(dialog, firstCard)
    const first = await capture('first')
    await page.mouse.move(
      Math.max(
        1,
        Math.min(first.first.rect.x + 64, first.wrap.box.right - 24, first.page.viewportWidth - 24)
      ),
      Math.max(
        first.header.bottom + 12,
        Math.min(
          first.first.rect.y + 64,
          first.wrap.box.bottom - 24,
          first.page.viewportHeight - 24
        )
      )
    )
    await page.mouse.wheel(0, 360)
    const wheel = await capture('wheel')
    await positionCard(dialog, dialog.locator('.workflow-catalog__grid > article').last())
    const last = await capture('last-card')
    await (
      await catalogOwner(dialog)
    ).evaluate((node) => {
      node.scrollTop = node.scrollHeight
    })
    const end = await capture('end')

    for (const state of [initial, first, wheel, last, end]) expectCatalogFrame(state)
    expect.soft(first.appearance.scope).toBe('workspace')
    expect.soft(first.appearance.color.toUpperCase(), '真实studio-flow主色').toBe('#EC4899')
    expect.soft(first.appearance.radius, '真实studio-flow圆角').toBe('1rem')
    expect.soft(first.first.label).toBe('销售合同')
    expect.soft(end.last.label).toBe('招聘需求')
    expect.soft(first.count).toBeGreaterThan(3)
    expect.soft(initial.wrap.scrollTop, '真实初始首屏').toBe(0)
    expect
      .soft(wheel.wrap.scrollTop, '真实wheel使所选可滚owner前进，hidden程序滚动不能代替')
      .toBeGreaterThan(first.wrap.scrollTop)
    expect
      .soft(Math.abs(wheel.header.y - first.header.y), '滚动时header留在固定位置')
      .toBeLessThanOrEqual(1)
    expect.soft(first.first.visible, '首业务article在真实clip祖先与viewport内完整可见').toBe(true)
    expect
      .soft(end.wrap.scrollHeight - end.wrap.clientHeight, '真实内部scroll range')
      .toBeGreaterThan(0)
    expect
      .soft(
        Math.abs(end.wrap.scrollTop - (end.wrap.scrollHeight - end.wrap.clientHeight)),
        '真实内部scroll-end'
      )
      .toBeLessThanOrEqual(1)
    expect.soft(end.boundary.visible, '滚动末端最终说明卡可见').toBe(true)
    expect.soft(last.last.visible, '末业务article可在同一内部scroll访问').toBe(true)
    for (const state of [first, last, end])
      for (const target of [state.first, state.last, state.boundary]) {
        if (profile.boxBorderMode)
          expect.soft(target.shadow, 'border mode不冒充shadow ink').toBe('none')
        else expect.soft(target.shadow, '真实workspace卡片shadow非none').not.toBe('none')
      }
    if (!profile.boxBorderMode) {
      await probeCardShadow(page, dialog, info, 'matrix')
      await probeCardShadow(page, dialog, info, 'menu')
    }
    if (profile.width === 1440 && profile.theme === 'light') {
      await dialog.getByRole('button', { name: '全屏', exact: true }).click()
      await expect(dialog.locator('.el-dialog')).toContainClass('is-fullscreen')
      await (
        await catalogOwner(dialog)
      ).evaluate((node) => {
        node.scrollTop = node.scrollHeight
      })
      const fullscreen = await capture('fullscreen-end')
      expectCatalogFrame(fullscreen)
      expect.soft(fullscreen.boundary.visible).toBe(true)
      await dialog.getByRole('button', { name: '退出全屏', exact: true }).click()
      await expect(dialog.locator('.el-dialog')).not.toContainClass('is-fullscreen')
      const restored = await capture('fullscreen-restored')
      expectCatalogFrame(restored)
      expect
        .soft(Math.abs(restored.catalog.height - first.catalog.height), '全屏退出恢复原catalog高度')
        .toBeLessThanOrEqual(2)
      await keyword.fill('审批')
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
        await settleCatalog(dialog)
        await (
          await catalogOwner(dialog)
        ).evaluate((node) => {
          node.scrollTop = 0
        })
        const resized = await capture(`resize-${width}`)
        expectCatalogFrame(resized)
        expect
          .soft(resized.ownerKind, 'CSS重排切换真实滚动owner')
          .toBe(width === 390 ? 'outer' : 'matrix')
        await expect(keyword).toHaveValue('审批')
        expect(
          await keyword.evaluate((current, original) => current === original, originalKeyword),
          '菜单keyword DOM不重建'
        ).toBe(true)
        expect(
          await firstCard.evaluate((current, original) => current === original, originalCard),
          '业务卡DOM不重建'
        ).toBe(true)
        expect(
          await matrixWrap.evaluate((current, original) => current === original, originalWrap),
          '矩阵wrap DOM不重建'
        ).toBe(true)
        if (originalOuter)
          expect(
            await outerWrap.evaluate((current, original) => current === original, originalOuter),
            '外层wrap DOM不重建'
          ).toBe(true)
      }
    }
    expect(
      await matrixWrap.evaluate((current, original) => current === original, originalWrap),
      '保留真实内部scroll节点'
    ).toBe(true)
    await expect(dialog.getByRole('button', { name: '关闭弹窗', exact: true })).toBeInViewport()
    expect(writes).toEqual([])
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
  })
}
