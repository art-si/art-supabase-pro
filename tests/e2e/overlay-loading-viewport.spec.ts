import { mkdirSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { assertAppearance, prepareAppearance } from './support/appearance'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(240_000)

async function setLoading(page: Page, kind: 'drawer' | 'dialog', loading: boolean): Promise<void> {
  await page.evaluate(
    (detail) => window.dispatchEvent(new CustomEvent('overlay-preview-loading', { detail })),
    { kind, loading }
  )
}

async function sampleDialogHeader(dialog: Locator, kind: 'dialog' | 'drawer' = 'dialog') {
  return dialog.evaluate((root, kind) => {
    const header = root.querySelector(`.art-${kind}__header`)
    const main = header?.querySelector(`.art-${kind}__header-main`)
    const title = header?.querySelector(
      `.art-${kind}__title, .el-${kind}__title, [data-testid="custom-header-title"]`
    )
    const subtitle = header?.querySelector(`.art-${kind}__subtitle`)
    const actions = header?.querySelector(`.art-${kind}__header-actions`)
    const viewport = root.querySelector(`.art-${kind}__viewport`)
    const footer = root.querySelector(`.art-${kind}__footer`)
    const custom = header?.querySelector('[data-testid="custom-header-probe"]')
    if (!header || !main || !title || !actions || !viewport || !footer)
      throw new Error('共享弹窗头部结构未就绪')
    const bounds = (element: Element) => {
      const rect = element.getBoundingClientRect()
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        right: rect.right,
        bottom: rect.bottom
      }
    }
    const text = (element: Element) => {
      const range = document.createRange()
      range.selectNodeContents(element)
      return {
        value: element.textContent?.trim() ?? '',
        bounds: bounds(element),
        lines: [...range.getClientRects()].map((rect) => ({
          x: rect.x,
          y: rect.y,
          right: rect.right,
          bottom: rect.bottom
        })),
        overflow: element.scrollWidth - element.clientWidth
      }
    }
    const subtitleProbe = subtitle?.querySelector('[data-testid="header-subtitle-probe"]')
    return {
      width: innerWidth,
      dialog: bounds(root),
      header: bounds(header),
      main: { bounds: bounds(main), display: getComputedStyle(main).display },
      title: text(title),
      subtitle: subtitle ? text(subtitle) : null,
      actions: bounds(actions),
      buttons: [...actions.querySelectorAll('button')].map((button) => ({
        name: button.getAttribute('aria-label') || button.textContent?.trim() || '',
        ...text(button)
      })),
      viewport: bounds(viewport),
      footer: bounds(footer),
      custom: custom
        ? {
            display: getComputedStyle(custom).display,
            bounds: bounds(custom),
            children: [...custom.children].map((element) => text(element))
          }
        : null,
      slot: subtitleProbe
        ? {
            recordId: subtitleProbe.getAttribute('data-record-id'),
            apiRecordId: subtitleProbe.getAttribute('data-api-record-id')
          }
        : null,
      overflow: {
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        dialog: root.scrollWidth - root.clientWidth
      },
      pageScroll: { x: scrollX, y: scrollY }
    }
  }, kind)
}

async function settleOverlayHeader(overlay: Locator) {
  const stable = await overlay.evaluate(async (root) => {
    await document.fonts.ready
    let previous = '',
      frames = 0
    for (let attempt = 0; attempt < 120 && frames < 6; attempt++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      const current = JSON.stringify(
        [
          ...root.querySelectorAll(
            '.art-dialog__header, .art-dialog__header *, .art-dialog__viewport, .art-dialog__footer, .art-drawer__header, .art-drawer__header *, .art-drawer__viewport, .art-drawer__footer'
          )
        ].map((node) => node.getBoundingClientRect().toJSON())
      )
      frames = current === previous ? frames + 1 : 0
      previous = current
    }
    return frames
  })
  expect(stable).toBe(6)
}

function expectDialogHeaderGeometry(
  state: Awaited<ReturnType<typeof sampleDialogHeader>>,
  standard: boolean,
  hasSubtitle = true
) {
  const inside = (
    inner: { x: number; y: number; right: number; bottom: number },
    outer: { x: number; y: number; right: number; bottom: number }
  ) =>
    inner.x >= outer.x - 1 &&
    inner.right <= outer.right + 1 &&
    inner.y >= outer.y - 1 &&
    inner.bottom <= outer.bottom + 1
  const overlaps = (
    first: { x: number; y: number; right: number; bottom: number },
    second: { x: number; y: number; right: number; bottom: number }
  ) =>
    Math.min(first.right, second.right) - Math.max(first.x, second.x) > 1 &&
    Math.min(first.bottom, second.bottom) - Math.max(first.y, second.y) > 1
  expect.soft(state.overflow.page, '页面没有横向溢出').toBeLessThanOrEqual(1)
  expect.soft(state.overflow.dialog, '弹窗没有横向溢出').toBeLessThanOrEqual(1)
  expect.soft(state.header.bottom, '头部不覆盖正文').toBeLessThanOrEqual(state.viewport.y + 1)
  expect.soft(state.viewport.bottom, '正文不覆盖页脚').toBeLessThanOrEqual(state.footer.y + 1)
  expect.soft(inside(state.title.bounds, state.header), '标题在头部边界内').toBe(true)
  for (const [name, item] of [
    ['标题', state.title],
    ...(state.subtitle ? ([['副标题', state.subtitle]] as const) : [])
  ] as const) {
    for (const line of item.lines) {
      expect.soft(inside(line, item.bounds), `${name}完整显示`).toBe(true)
      expect.soft(inside(line, state.header), `${name}文本在头部边界内`).toBe(true)
    }
  }
  expect.soft(state.buttons.length, '共享标题操作仍存在').toBeGreaterThanOrEqual(3)
  for (const [index, button] of state.buttons.entries()) {
    expect.soft(button.name, '标题操作具有可识别名称').not.toBe('')
    expect.soft(inside(button.bounds, state.header), `${button.name}在头部内`).toBe(true)
    expect
      .soft(
        inside(button.bounds, { x: 0, y: 0, right: state.width, bottom: 844 }),
        `${button.name}在视口内`
      )
      .toBe(true)
    expect.soft(overlaps(button.bounds, state.title.bounds), `${button.name}不覆盖标题`).toBe(false)
    for (const line of button.lines)
      expect.soft(inside(line, button.bounds), `${button.name}内容不截断`).toBe(true)
    for (const other of state.buttons.slice(index + 1))
      expect.soft(overlaps(button.bounds, other.bounds), '标题操作之间不重叠').toBe(false)
  }
  if (!hasSubtitle) {
    expect.soft(state.subtitle, '无副标题时不保留空wrapper').toBeNull()
    expect
      .soft(state.header.height, '无副标题时不保留空行')
      .toBeLessThanOrEqual(
        Math.max(state.title.bounds.bottom, state.actions.bottom) - state.header.y + 2
      )
  } else if (state.subtitle) {
    expect.soft(state.subtitle.value, '副标题有可读内容').not.toBe('')
    if (standard && state.width <= 640) {
      expect
        .soft(Math.abs(state.subtitle.bounds.x - state.header.x), '副标题从头部左边界开始')
        .toBeLessThanOrEqual(2)
      expect
        .soft(Math.abs(state.subtitle.bounds.width - state.header.width), '副标题使用完整头部宽度')
        .toBeLessThanOrEqual(2)
      expect
        .soft(state.subtitle.bounds.y, '副标题位于标题和操作之后')
        .toBeGreaterThanOrEqual(Math.max(state.title.bounds.bottom, state.actions.bottom) - 1)
    } else {
      expect.soft(state.main.display, '桌面或custom header保留main包装布局').not.toBe('contents')
      expect
        .soft(state.subtitle.bounds.x, '副标题在main左边界内')
        .toBeGreaterThanOrEqual(state.main.bounds.x - 1)
      expect
        .soft(state.subtitle.bounds.right, '副标题在main右边界内')
        .toBeLessThanOrEqual(state.main.bounds.right + 1)
    }
  } else expect.soft(state.subtitle, '应显示副标题').not.toBeNull()
  if (state.custom) {
    expect.soft(state.custom.display, '自定义header的flex布局保留').toBe('flex')
    for (const child of state.custom.children)
      expect.soft(inside(child.bounds, state.custom.bounds), '自定义header子项不越界').toBe(true)
    const [heading, badge] = state.custom.children
    if (heading && badge)
      expect
        .soft(badge.bounds.x - heading.bounds.right, '自定义标题和状态保留8px间距')
        .toBeCloseTo(8, 0)
  }
}

for (const { headerCase, ...appearance } of [
  { headerCase: 'prop', theme: 'dark', boxBorderMode: false },
  { headerCase: 'slot', theme: 'dark', boxBorderMode: false },
  { headerCase: 'custom', theme: 'dark', boxBorderMode: false },
  { headerCase: 'long', theme: 'dark', boxBorderMode: false },
  { headerCase: 'prop', theme: 'light', boxBorderMode: true }
] as const) {
  test(`共享弹窗窄屏头部 ${headerCase}/${appearance.theme} 保留可用宽度与原生交互`, async ({
    page
  }, info) => {
    const errors: string[] = [],
      warnings: string[] = [],
      writes: string[] = []
    await prepareIsolatedSession(page, { platformSuper: false })
    await prepareAppearance(page, appearance)
    await page.setViewportSize({ width: 390, height: 844 })
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (
        /maximum recursive updates|slot.+invoked outside|unhandled error during execution/i.test(
          message.text()
        )
      )
        warnings.push(message.text())
    })
    await page.route('**/rest/v1/**', (route) => {
      const request = route.request(),
        path = new URL(request.url()).pathname
      if (
        !['GET', 'HEAD', 'OPTIONS'].includes(request.method()) &&
        ![
          '/rest/v1/rpc/current_is_super',
          '/rest/v1/rpc/material_unit_compatibility_options'
        ].includes(path)
      )
        writes.push(request.url())
      return route.fulfill({ json: [] })
    })
    await page.goto(`/tests/e2e/fixtures/overlay-loading-viewport.html?header-case=${headerCase}`, {
      waitUntil: 'domcontentloaded'
    })
    await assertAppearance(page, appearance)
    await page.addStyleTag({ path: 'tests/e2e/visual-stability.css' })
    await page.getByRole('button', { name: '打开头部验收弹窗', exact: true }).click()
    const dialog = page.locator('.art-dialog:visible')
    await expect(dialog).toBeVisible()
    const originalDialog = await dialog.elementHandle()
    const originalProbe =
      headerCase === 'slot'
        ? await dialog.getByTestId('header-subtitle-probe').elementHandle()
        : headerCase === 'custom'
          ? await dialog.getByTestId('custom-header-probe').elementHandle()
          : null
    if (!originalDialog || ((headerCase === 'slot' || headerCase === 'custom') && !originalProbe))
      throw new Error('头部验收节点未挂载')
    const captures: { stage: string; geometry: Awaited<ReturnType<typeof sampleDialogHeader>> }[] =
      []
    const geometryPath = info.outputPath('narrow-dialog-header-geometry.json')
    const capture = async (stage: string) => {
      await settleOverlayHeader(dialog)
      const geometry = await sampleDialogHeader(dialog)
      captures.push({ stage, geometry })
      await page.screenshot({
        path: info.outputPath(`narrow-dialog-header-${stage}.png`),
        animations: 'disabled'
      })
      await writeFile(
        geometryPath,
        JSON.stringify({ headerCase, appearance, captures, errors, warnings, writes }, null, 2),
        'utf8'
      )
      return geometry
    }
    for (const width of [390, 320, 1440]) {
      await page.setViewportSize({ width, height: 844 })
      const state = await capture(String(width))
      expectDialogHeaderGeometry(state, headerCase !== 'custom')
      expect
        .soft(state.title.value)
        .toBe(
          headerCase === 'custom'
            ? '自定义标题'
            : headerCase === 'long'
              ? '运输与结算业务资料维护 · DOC-2026-0000123456789'
              : '编辑字典目录'
        )
      expect.soft(state.subtitle?.value).toContain('调整节点归属、级联关系与展示设置')
      for (const button of await dialog.locator('.art-dialog__header-actions button').all()) {
        await button.focus()
        await expect(button).toBeFocused()
      }
      await dialog.getByRole('button', { name: '取消', exact: true }).focus()
      if (originalProbe) {
        const probe = dialog.getByTestId(
          headerCase === 'slot' ? 'header-subtitle-probe' : 'custom-header-probe'
        )
        expect(
          await probe.evaluate((current, original) => current === original, originalProbe)
        ).toBe(true)
      }
    }
    if (headerCase === 'prop') {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.evaluate(() =>
        window.dispatchEvent(
          new CustomEvent('overlay-preview-header-subtitle', { detail: { subtitle: '' } })
        )
      )
      expectDialogHeaderGeometry(await capture('without-subtitle'), true, false)
      await page.evaluate(() =>
        window.dispatchEvent(
          new CustomEvent('overlay-preview-header-subtitle', {
            detail: { subtitle: '调整节点归属、级联关系与展示设置' }
          })
        )
      )
      await dialog.getByRole('button', { name: '进入专注模式', exact: true }).click()
      await expect(dialog).toHaveClass(/is-focus-mode/)
      expectDialogHeaderGeometry(await capture('focused'), true, false)
      await dialog.getByRole('button', { name: '退出专注模式', exact: true }).click()
      await expect(dialog).not.toHaveClass(/is-focus-mode/)
      const restored = await capture('focus-restored')
      expectDialogHeaderGeometry(restored, true)
      expect
        .soft(
          Math.abs(restored.header.height - captures[0].geometry.header.height),
          '退出专注恢复原头部高度'
        )
        .toBeLessThanOrEqual(2)
    }
    if (headerCase === 'slot') {
      await page.setViewportSize({ width: 390, height: 844 })
      await expect(page.getByTestId('header-subtitle-mounts')).toHaveText('1')
      await expect(page.getByTestId('header-subtitle-unmounts')).toHaveText('0')
      await dialog.getByRole('button', { name: '全屏', exact: true }).click()
      await expect(dialog).toContainClass('is-fullscreen')
      expectDialogHeaderGeometry(await capture('fullscreen'), true)
      await dialog.getByRole('button', { name: '退出全屏', exact: true }).click()
      await expect(dialog).not.toContainClass('is-fullscreen')
      expectDialogHeaderGeometry(await capture('fullscreen-restored'), true)
      const probe = dialog.getByTestId('header-subtitle-probe')
      if (!originalProbe) throw new Error('缺少原副标题slot节点')
      expect(await probe.evaluate((current, original) => current === original, originalProbe)).toBe(
        true
      )
      await dialog.getByRole('button', { name: '更新数据', exact: true }).click()
      const updated = await capture('slot-api-updated')
      expectDialogHeaderGeometry(updated, true)
      expect(updated.slot).toEqual({ recordId: 'header-updated', apiRecordId: 'header-updated' })
      await expect(page.getByTestId('header-api-calls')).toHaveText('1')
      expect(await probe.evaluate((current, original) => current === original, originalProbe)).toBe(
        true
      )
      await page.evaluate(() =>
        window.dispatchEvent(
          new CustomEvent('overlay-preview-header-slot', { detail: { visible: false } })
        )
      )
      expectDialogHeaderGeometry(await capture('slot-removed'), true, false)
      await expect(probe).toHaveCount(0)
      await expect(page.getByTestId('header-subtitle-unmounts')).toHaveText('1')
      await page.evaluate(() =>
        window.dispatchEvent(
          new CustomEvent('overlay-preview-header-slot', { detail: { visible: true } })
        )
      )
      const returned = await capture('slot-restored')
      expectDialogHeaderGeometry(returned, true)
      expect(returned.slot).toEqual({ recordId: 'header-updated', apiRecordId: 'header-updated' })
      await expect(probe).toHaveCount(1)
      expect(await probe.evaluate((current, original) => current !== original, originalProbe)).toBe(
        true
      )
      await expect(page.getByTestId('header-subtitle-mounts')).toHaveText('2')
      await expect(page.getByTestId('header-subtitle-unmounts')).toHaveText('1')
    }
    expect(await dialog.evaluate((current, original) => current === original, originalDialog)).toBe(
      true
    )
    await info.attach('narrow-dialog-header-geometry', {
      path: geometryPath,
      contentType: 'application/json'
    })
    expect(writes).toEqual([])
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
  })
}

test('共享抽屉窄屏头部 条件slot移除和恢复不留下空行', async ({ page }, info) => {
  const appearance = { theme: 'dark', boxBorderMode: false } as const
  const writes: string[] = [],
    errors: string[] = [],
    warnings: string[] = []
  await prepareIsolatedSession(page, { platformSuper: false })
  await prepareAppearance(page, appearance)
  await page.setViewportSize({ width: 390, height: 844 })
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (
      /maximum recursive updates|slot.+invoked outside|unhandled error during execution/i.test(
        message.text()
      )
    )
      warnings.push(message.text())
  })
  await page.route('**/rest/v1/**', (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method()) &&
      ![
        '/rest/v1/rpc/current_is_super',
        '/rest/v1/rpc/material_unit_compatibility_options'
      ].includes(path)
    )
      writes.push(`${request.method()} ${path}`)
    return route.fulfill({ json: [] })
  })
  await page.goto(
    '/tests/e2e/fixtures/overlay-loading-viewport.html?header-case=slot&header-kind=drawer',
    { waitUntil: 'domcontentloaded' }
  )
  await assertAppearance(page, appearance)
  await page.addStyleTag({ path: 'tests/e2e/visual-stability.css' })
  await page.getByRole('button', { name: '打开头部验收抽屉', exact: true }).click()
  const drawer = page.locator('.art-drawer:visible')
  await expect(drawer).toBeVisible()
  const probe = drawer.getByTestId('header-subtitle-probe')
  const originalProbe = await probe.elementHandle()
  if (!originalProbe) throw new Error('抽屉副标题slot未挂载')
  const captures: { stage: string; geometry: Awaited<ReturnType<typeof sampleDialogHeader>> }[] = []
  const geometryPath = info.outputPath('narrow-drawer-header-slot-geometry.json')
  const capture = async (stage: string) => {
    await settleOverlayHeader(drawer)
    const geometry = await sampleDialogHeader(drawer, 'drawer')
    captures.push({ stage, geometry })
    await page.screenshot({
      path: info.outputPath(`narrow-drawer-header-slot-${stage}.png`),
      animations: 'disabled'
    })
    await writeFile(
      geometryPath,
      JSON.stringify({ appearance, captures, writes, errors, warnings }, null, 2),
      'utf8'
    )
    return geometry
  }
  const initial = await capture('initial')
  expectDialogHeaderGeometry(initial, true)
  expect(initial.slot).toEqual({ recordId: 'header-seed', apiRecordId: 'header-seed' })
  await expect(page.getByTestId('header-subtitle-mounts')).toHaveText('1')
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent('overlay-preview-header-slot', { detail: { visible: false } })
    )
  )
  expectDialogHeaderGeometry(await capture('removed'), true, false)
  await expect(probe).toHaveCount(0)
  await expect(page.getByTestId('header-subtitle-unmounts')).toHaveText('1')
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent('overlay-preview-header-slot', { detail: { visible: true } })
    )
  )
  const restored = await capture('restored')
  expectDialogHeaderGeometry(restored, true)
  expect(restored.slot).toEqual(initial.slot)
  await expect(probe).toHaveCount(1)
  expect(await probe.evaluate((current, original) => current !== original, originalProbe)).toBe(
    true
  )
  await expect(page.getByTestId('header-subtitle-mounts')).toHaveText('2')
  await expect(page.getByTestId('header-subtitle-unmounts')).toHaveText('1')
  await info.attach('narrow-drawer-header-slot-geometry', {
    path: geometryPath,
    contentType: 'application/json'
  })
  expect(writes).toEqual([])
  expect(errors).toEqual([])
  expect(warnings).toEqual([])
})

test('默认确认按钮跟随响应式就绪状态，并保留命令式禁用直到属性改变', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/overlay-loading-viewport.html')
  for (const kind of ['dialog', 'drawer'] as const) {
    await page
      .getByRole('button', { name: kind === 'drawer' ? '打开测试抽屉' : '打开测试弹窗' })
      .click()
    const root = page.locator(kind === 'drawer' ? '.el-drawer:visible' : '.el-dialog:visible')
    const confirm = root.getByRole('button', { name: '确定', exact: true })
    const setDisabled = (disabled: boolean, viaApi = false) =>
      page.evaluate(
        (detail) =>
          window.dispatchEvent(new CustomEvent('overlay-preview-confirm-disabled', { detail })),
        { kind, disabled, viaApi }
      )
    await setDisabled(true)
    await expect(confirm).toBeDisabled()
    await setDisabled(false)
    await expect(confirm).toBeEnabled()
    await setDisabled(true, true)
    await setLoading(page, kind, true)
    await setLoading(page, kind, false)
    await expect(confirm).toBeDisabled()
    await setDisabled(true)
    await setDisabled(false)
    await expect(confirm).toBeEnabled()
    await root.getByRole('button', { name: '取消', exact: true }).click()
    await expect(root).toBeHidden()
  }
})

async function expectViewportCentered(root: Locator, kind: 'drawer' | 'dialog'): Promise<void> {
  const viewport = root.locator(`.art-${kind}__viewport`)
  await expect(viewport).toHaveAttribute('aria-busy', 'true')
  await expect(viewport.locator(':scope > .art-overlay-loading')).toBeVisible()
  await expect(viewport.getByText('请稍候，完成后即可继续操作', { exact: true })).toBeVisible()
  const geometry = await viewport.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    const mask = element.querySelector(':scope > .art-overlay-loading')!.getBoundingClientRect()
    const visual = element
      .querySelector(':scope > .art-overlay-loading .art-overlay-loading__visual')!
      .getBoundingClientRect()
    const description = element
      .querySelector(':scope > .art-overlay-loading .art-overlay-loading__state > span')!
      .getBoundingClientRect()
    return {
      top: Math.abs(mask.top - bounds.top),
      height: Math.abs(mask.height - bounds.height),
      center: Math.abs((visual.top + description.bottom) / 2 - (bounds.top + bounds.bottom) / 2),
      bottom: mask.bottom,
      viewportHeight: window.innerHeight
    }
  })
  expect(geometry.top).toBeLessThan(2)
  expect(geometry.height).toBeLessThan(2)
  expect(geometry.center).toBeLessThan(8)
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight + 1)
  await expect(root.locator(`.art-${kind}__content`)).toHaveAttribute('inert', '')
  const confirm = root.getByRole('button', { name: '确定', exact: true })
  if (await confirm.count()) await expect(confirm).toBeDisabled()
}

test('销售报价详情使用公共抽屉加载层，长明细不会把加载提示推到视口外', async ({
  page
}, testInfo) => {
  await prepareAppearance(page, { theme: 'light', boxBorderMode: true })
  let release: () => void = () => undefined
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/rest/v1/**', async (route) => {
    if (route.request().url().includes('sys_dictionary')) {
      await route.fulfill({ contentType: 'application/json', body: '[]' })
      return
    }
    await held
    await route.fulfill({ contentType: 'application/json', body: '[]' })
  })
  await page.goto('/tests/e2e/fixtures/overlay-loading-viewport.html', {
    waitUntil: 'domcontentloaded',
    timeout: 120_000
  })
  try {
    await assertAppearance(page, { theme: 'light', boxBorderMode: true })
    await page.getByRole('button', { name: '打开长销售报价详情' }).click()
    const drawer = page.locator('.el-drawer:visible')
    await expectViewportCentered(drawer, 'drawer')
    await expect(drawer.locator('.art-async-state > .art-overlay-loading')).toHaveCount(0)
    mkdirSync('.artifacts/overlay-loading-visual', { recursive: true })
    await drawer.screenshot({
      path: testInfo.outputPath('scm-long-detail.png'),
      animations: 'disabled'
    })
    await page.setViewportSize({ width: 390, height: 844 })
    await expectViewportCentered(drawer, 'drawer')
    await drawer.screenshot({
      path: '.artifacts/overlay-loading-visual/scm-long-detail-mobile.png',
      animations: 'disabled'
    })
    await drawer.getByRole('button', { name: '关闭抽屉', exact: true }).click()
  } finally {
    release()
  }
})

test('长正文滚动后的整体加载始终位于可视正文中心', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/tests/e2e/fixtures/overlay-loading-viewport.html', {
    waitUntil: 'domcontentloaded',
    timeout: 120_000
  })
  mkdirSync('.artifacts/overlay-loading-visual', { recursive: true })
  for (const theme of ['light', 'dark']) {
    for (const boxMode of ['border-mode', 'shadow-mode']) {
      await page.evaluate(
        ({ theme, boxMode }) => {
          document.documentElement.classList.toggle('dark', theme === 'dark')
          document.documentElement.setAttribute('data-box-mode', boxMode)
        },
        { theme, boxMode }
      )
      for (const kind of ['drawer', 'dialog'] as const) {
        await page
          .getByRole('button', { name: kind === 'drawer' ? '打开测试抽屉' : '打开测试弹窗' })
          .click()
        const root = page.locator(kind === 'drawer' ? '.el-drawer:visible' : '.el-dialog:visible')
        await expect(root).toBeVisible()
        await root.locator('.el-scrollbar__wrap').evaluate((element) => {
          element.scrollTop = 900
        })
        await setLoading(page, kind, true)
        await expectViewportCentered(root, kind)
        await root.screenshot({
          path: `.artifacts/overlay-loading-visual/${kind}-${theme}-${boxMode}.png`,
          animations: 'disabled'
        })
        await root.getByRole('button', { name: '全屏', exact: true }).click()
        await expect(root).toContainClass('is-fullscreen')
        await expectViewportCentered(root, kind)
        await setLoading(page, kind, false)
        await expect(root.getByRole('button', { name: '确定', exact: true })).toBeEnabled()
        await expect(root.locator(`.art-${kind}__content`)).not.toHaveAttribute('inert', '')
        await root
          .getByRole('button', { name: kind === 'drawer' ? '关闭抽屉' : '关闭弹窗', exact: true })
          .click()
        await expect(root).toBeHidden()
      }
    }
  }
  await page.setViewportSize({ width: 390, height: 844 })
  for (const kind of ['drawer', 'dialog'] as const) {
    await page
      .getByRole('button', { name: kind === 'drawer' ? '打开测试抽屉' : '打开测试弹窗' })
      .click()
    const root = page.locator(kind === 'drawer' ? '.el-drawer:visible' : '.el-dialog:visible')
    await setLoading(page, kind, true)
    await expectViewportCentered(root, kind)
    await root.screenshot({
      path: `.artifacts/overlay-loading-visual/${kind}-mobile.png`,
      animations: 'disabled'
    })
    await setLoading(page, kind, false)
    await root
      .getByRole('button', { name: kind === 'drawer' ? '关闭抽屉' : '关闭弹窗', exact: true })
      .click()
  }
  expect(errors).toEqual([])
})

test('子组件加载统一由审批分析弹窗和审批历程抽屉承接', async ({ page }, testInfo) => {
  const appearance = {
    theme: testInfo.project.name.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !testInfo.project.name.includes('dark')
  } as const
  await prepareAppearance(page, appearance)
  const businessTitle = `采购订单 PO-2026-${'装备制造与运输综合服务项目'.repeat(5)}-ORDER-END`
  let release: () => void = () => undefined
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/rest/v1/**', async (route) => {
    if (route.request().url().includes('sys_dictionary')) return route.fulfill({ json: [] })
    await held
    return route.fulfill({ status: 503, json: { code: 'XX000', message: 'synthetic unavailable' } })
  })
  await page.goto(
    `/tests/e2e/fixtures/overlay-loading-viewport.html?historyTitle=${encodeURIComponent(businessTitle)}`
  )
  await assertAppearance(page, appearance)
  try {
    for (const kind of ['dialog', 'drawer'] as const) {
      await page
        .getByRole('button', {
          name: kind === 'dialog' ? '打开审批分析' : '打开审批历程',
          exact: true
        })
        .click()
      const root = page.locator(kind === 'dialog' ? '.el-dialog:visible' : '.el-drawer:visible')
      await expectViewportCentered(root, kind)
      await expect(root.locator('.el-skeleton')).toHaveCount(0)
      await expect(root.locator('.art-async-state > .art-overlay-loading')).toHaveCount(0)
      await root.screenshot({
        path: testInfo.outputPath(`workflow-${kind}-loading.png`),
        animations: 'disabled'
      })
      if (kind === 'drawer') {
        await expect(root).toHaveAccessibleName('审批历程')
        for (const width of [1440, 390, 320]) {
          await page.setViewportSize({ width, height: 844 })
          const caption = root.getByText(businessTitle, { exact: true })
          await expect(caption).toBeVisible()
          await root.screenshot({ path: testInfo.outputPath(`workflow-heading-${width}.png`) })
          const geometry = await caption.evaluate((el) => {
            const range = document.createRange()
            range.selectNodeContents(el)
            const bounds = el.getBoundingClientRect()
            return {
              overflow: el.scrollWidth - el.clientWidth,
              fits: Array.from(range.getClientRects()).every(
                (rect) => rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1
              )
            }
          })
          expect(geometry).toEqual({ overflow: 0, fits: true })
          if (width <= 640) {
            const heading = await caption.evaluate((el) => {
              const subtitle = el.getBoundingClientRect()
              const header = el.closest('.art-drawer__header')!.getBoundingClientRect()
              const actions = el
                .closest('.art-drawer__header')!
                .querySelector('.art-drawer__header-actions')!
                .getBoundingClientRect()
              return {
                fullWidth: subtitle.width >= header.width - 1,
                belowActions: subtitle.top >= actions.bottom
              }
            })
            expect(heading).toEqual({ fullWidth: true, belowActions: true })
          }
          await expect(root.getByRole('button', { name: '关闭抽屉', exact: true })).toBeInViewport({
            ratio: 0.95
          })
          await expectViewportCentered(root, kind)
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth)
          ).toBeLessThanOrEqual(width + 1)
        }
      }
      await root
        .getByRole('button', { name: kind === 'drawer' ? '关闭抽屉' : '关闭弹窗', exact: true })
        .click()
    }
  } finally {
    release()
  }
})

test('审批历程完整显示长流程名称与发起人，折叠后仍可识别轮次', async ({ page }, info) => {
  const workflowName =
    '采购申请与装备制造跨部门联合审核流程（工程建设、供应保障及财务结算协同审批）'
  const initiator = '工程建设与物流保障联合审核负责人（张明远 · EMP-WORKFLOW-2026-0000123456789）'
  const writes: string[] = []
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  for (const profile of [
    { width: 1440, theme: 'light', boxBorderMode: true },
    { width: 390, theme: 'dark', boxBorderMode: false }
  ] as const) {
    await page.setViewportSize({ width: profile.width, height: 900 })
    await prepareIsolatedSession(page, { platformSuper: false })
    await prepareAppearance(page, profile)
    await page.route('**/rest/v1/**', (route) => {
      if (route.request().method() !== 'GET') writes.push(route.request().url())
      return route.fallback()
    })
    await page.route('**/rest/v1/sys_dictionary?*', (route) =>
      route.fulfill({
        json: [
          { value: 'approved', label: '已通过', status: '1' },
          { value: 'running', label: '审批中', status: '1' }
        ]
      })
    )
    await page.route('**/rest/v1/wf_instance?*', (route) => {
      const request = route.request()
      const url = new URL(request.url())
      expect(request.method()).toBe('GET')
      expect(url.searchParams.get('business_type')).toBe('eq.expense')
      expect(url.searchParams.get('business_id')).toBe('eq.test-business')
      return route.fulfill({
        json: [
          {
            id: 'history-long-round',
            business_title: '采购申请 PO-2026-001',
            initiator_name_snapshot: initiator,
            started_at: '2026-10-01T00:00:00Z',
            finished_at: '2026-10-01T01:15:00Z',
            finish_comment: '审核通过，原处理意见保留。',
            status: 'approved',
            definition: { name: workflowName },
            version: { version_no: 3, config: { nodes: [] } },
            actions: [],
            tasks: []
          },
          {
            id: 'history-previous-round',
            business_title: '历史申请 PO-2026-000',
            started_at: '2026-09-30T00:00:00Z',
            status: 'running',
            version: { version_no: 0, config: { nodes: [] } },
            actions: [],
            tasks: []
          }
        ]
      })
    })
    await page.goto('/tests/e2e/fixtures/overlay-loading-viewport.html')
    await assertAppearance(page, profile)
    await page.getByRole('button', { name: '打开审批历程', exact: true }).click()
    const drawer = page.getByRole('dialog', { name: '审批历程', exact: true })
    const history = drawer.getByRole('region', { name: '审批历程', exact: true })
    const current = history.locator('.el-collapse-item').first()
    await expect(history.locator('.workflow-business-history__summary dd')).toHaveText([
      '2',
      '1',
      '1',
      '0'
    ])
    await expect(current.getByText('本轮结论', { exact: true })).toBeVisible()
    await expect(current.getByText('审核通过，原处理意见保留。', { exact: true })).toBeVisible()
    await expect(current.getByText('2026-10-01 08:00:00', { exact: true })).toBeVisible()
    await expect(current.getByText('2026-10-01 09:15:00', { exact: true })).toBeVisible()
    await expect(current.getByText('V3', { exact: true })).toBeVisible()
    for (const [value, field] of [
      [workflowName, current.getByText(workflowName, { exact: true })],
      [initiator, current.getByText(initiator, { exact: true })]
    ] as const) {
      await field.scrollIntoViewIfNeeded()
      const geometry = await field.evaluate((element) => {
        const range = document.createRange()
        range.selectNodeContents(element)
        const cell = element.getBoundingClientRect()
        const wrap = element.closest('.el-scrollbar__wrap')!.getBoundingClientRect()
        const lines = Array.from(range.getClientRects())
        const style = getComputedStyle(element)
        return {
          lineHeight: parseFloat(style.lineHeight),
          fontSize: parseFloat(style.fontSize),
          fits: lines.every(
            (line) =>
              line.left >= cell.left - 1 &&
              line.right <= cell.right + 1 &&
              line.top >= cell.top - 1 &&
              line.bottom <= cell.bottom + 1
          ),
          visible: lines.every(
            (line) =>
              line.left >= wrap.left - 1 &&
              line.right <= wrap.right + 1 &&
              line.top >= wrap.top - 1 &&
              line.bottom <= wrap.bottom + 1 &&
              line.left >= -1 &&
              line.right <= innerWidth + 1 &&
              line.top >= -1 &&
              line.bottom <= innerHeight + 1
          )
        }
      })
      expect({ fits: geometry.fits, visible: geometry.visible }, value).toEqual({
        fits: true,
        visible: true
      })
      expect(geometry.lineHeight).toBeLessThanOrEqual(geometry.fontSize * 1.8)
      if (value === workflowName)
        await drawer.screenshot({
          path: info.outputPath(`workflow-heading-${profile.width}-${profile.theme}.png`)
        })
    }
    await current.locator('.el-collapse-item__header').click()
    await expect(current.locator('.el-collapse-item__wrap')).toBeHidden()
    await expect(current.getByText(workflowName, { exact: true })).toBeVisible()
    await current.locator('.el-collapse-item__header').press('Enter')
    await expect(current.getByText(initiator, { exact: true })).toBeVisible()
    const previous = history.locator('.el-collapse-item').nth(1)
    await previous.locator('.el-collapse-item__header').click()
    await expect(previous.locator('.workflow-business-history__metadata dd')).toHaveText([
      '--',
      '2026-09-30 08:00:00',
      '--',
      '--'
    ])
    await expect(previous.getByText('历史申请 PO-2026-000', { exact: true })).toBeVisible()
    await expect(history.locator('.el-tag').first()).toHaveText('已通过')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true
    )
    await drawer.screenshot({
      path: info.outputPath(`workflow-metadata-${profile.width}-${profile.theme}.png`)
    })
    await drawer.getByRole('button', { name: '关闭抽屉', exact: true }).click()
    await expect(drawer).toBeHidden()
  }
  expect(writes).toEqual([])
  expect(errors).toEqual([])
})
