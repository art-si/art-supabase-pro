import { expect, test, type Locator, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { assertAppearance, prepareAppearance } from './support/appearance'
import { compareShadowPaint } from './support/shadow-paint'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

async function prepareDisplay(page: Page, theme: 'light' | 'dark', width: number, mode = '') {
  const appearance = { theme, boxBorderMode: theme === 'light' }
  const errors: string[] = []
  const writes: string[] = []
  await page.setViewportSize({ width, height: 900 })
  await prepareIsolatedSession(page, { platformSuper: false })
  await prepareAppearance(page, appearance)
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const readRpcs = [
      '/rpc/current_is_super',
      '/rpc/get_organization_list_secure',
      '/rpc/material_unit_compatibility_options'
    ]
    if (
      ['GET', 'HEAD', 'OPTIONS'].includes(request.method()) ||
      (request.method() === 'POST' && readRpcs.some((rpc) => path.endsWith(rpc)))
    )
      return route.fallback()
    writes.push(path)
    return route.fulfill({ status: 403, json: { message: '隔离测试阻止写入' } })
  })
  const query = new URLSearchParams({
    'native-display': '',
    theme,
    box: appearance.boxBorderMode ? 'border-mode' : 'shadow-mode'
  })
  if (mode) query.set(mode, '')
  await page.goto(`/tests/e2e/fixtures/art-form-values.html?${query}`, {
    waitUntil: 'domcontentloaded'
  })
  await assertAppearance(page, appearance)
  return { errors, writes }
}

const field = (scope: Locator, key: string) => scope.locator(`[data-art-form-item-key="${key}"]`)

async function expectSizeMatchesNative(
  scope: Locator,
  page: Page,
  size?: 'small' | 'default' | 'large'
) {
  const configured = field(scope, 'name').locator('.el-input')
  const reference = page
    .getByRole('textbox', { name: '原生尺寸参考', exact: true })
    .locator(
      'xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " el-input ")][1]'
    )
  const modifier = (control: Locator, prefix: 'el-input' | 'el-form-item') =>
    control.evaluate((element, prefix) => {
      const match = [...element.classList].find((value) =>
        new RegExp(`^${prefix}--(small|default|large)$`).test(value)
      )
      return match?.slice(prefix.length + 2) ?? ''
    }, prefix)
  const measure = (control: Locator) =>
    control.evaluate((element) => {
      const wrapper = element.querySelector('.el-input__wrapper')!
      const input = element.querySelector('input')!
      const style = getComputedStyle(input)
      const wrapperStyle = getComputedStyle(wrapper)
      return {
        height: wrapper.getBoundingClientRect().height,
        inputHeight: input.getBoundingClientRect().height,
        font: style.fontSize,
        lineHeight: style.lineHeight,
        paddingTop: wrapperStyle.paddingTop,
        paddingBottom: wrapperStyle.paddingBottom,
        paddingInlineStart: wrapperStyle.paddingInlineStart,
        paddingInlineEnd: wrapperStyle.paddingInlineEnd
      }
    })
  await expect.poll(() => modifier(reference, 'el-input')).toBe(size ?? '')
  const nativeModifier = await modifier(reference, 'el-input')
  await expect.poll(() => modifier(configured, 'el-input')).toBe(nativeModifier)
  await expect
    .poll(() => modifier(field(scope, 'name').locator('.el-form-item'), 'el-form-item'))
    .toBe(nativeModifier)
  const nativeMetrics = await measure(reference)
  const queryPadding = await configured.evaluate((element) => {
    const container = element.closest<HTMLElement>('.art-form-item__content')
    if (!element.closest('.art-search-bar') || !container || container.clientWidth >= 160)
      return null
    return getComputedStyle(container).getPropertyValue('--art-space-2').trim()
  })
  // Narrow queries already use the shared 8px inline inset, independent of native size.
  if (queryPadding !== null) {
    expect(queryPadding).toBe('8px')
    nativeMetrics.paddingInlineStart = queryPadding
    nativeMetrics.paddingInlineEnd = queryPadding
  }
  await expect.poll(() => measure(configured)).toEqual(nativeMetrics)
}

async function expectLabel(scope: Locator, key: string, text: string) {
  await expect(field(scope, key).locator('.art-form-item__label')).toHaveText(text)
  await expect(field(scope, key).locator('.art-form-item__help-icon')).toBeVisible()
}

async function expectUsableLayout(scope: Locator, page: Page) {
  const measurements = await scope.evaluate((element) =>
    [...element.querySelectorAll<HTMLElement>('[data-art-form-item-key]')]
      .filter((column) => column.querySelector('.el-input__wrapper'))
      .map((column) => {
        const editor = column.querySelector('.el-input__wrapper')!.getBoundingClientRect()
        const box = column.getBoundingClientRect()
        return {
          width: editor.width,
          leftClearance: editor.left - box.left,
          rightClearance: box.right - editor.right
        }
      })
  )
  expect(measurements.length).toBeGreaterThanOrEqual(2)
  for (const measurement of measurements) {
    expect(measurement.width).toBeGreaterThanOrEqual(120)
    expect(measurement.leftClearance).toBeGreaterThanOrEqual(-1)
    expect(measurement.rightClearance).toBeGreaterThanOrEqual(-1)
  }
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
  ).toBe(true)
  if (page.viewportSize()!.width < 768) {
    const first = await field(scope, 'name').locator('.el-input__wrapper').boundingBox()
    const following = await field(scope, 'alias').locator('.el-form-item__label').boundingBox()
    expect(first).not.toBeNull()
    expect(following).not.toBeNull()
    expect(following!.y).toBeGreaterThanOrEqual(first!.y + first!.height)
  }
}

/** The changed pixels must occupy the requested side of the actual visible label. */
async function expectRequiredMarkerPaint(page: Page, label: Locator, side: 'left' | 'right') {
  await label.scrollIntoViewIfNeeded()
  const { region, sample, content } = await label.evaluate((element, side) => {
    const box = element.getBoundingClientRect()
    const text = element.querySelector('.art-form-item__label')!.getBoundingClientRect()
    const x = Math.floor(box.left)
    const y = Math.floor(box.top)
    const right = Math.ceil(box.right)
    const sampleLeft = side === 'left' ? x : Math.ceil(text.right)
    const sampleRight = side === 'left' ? Math.floor(text.left) : right
    return {
      region: { x, y, width: right - x, height: Math.ceil(box.bottom) - y },
      sample: {
        x: sampleLeft,
        y,
        width: sampleRight - sampleLeft,
        height: Math.ceil(box.bottom) - y
      },
      content: getComputedStyle(element, side === 'left' ? '::before' : '::after').content
    }
  }, side)
  expect(content).toBe('"*"')
  expect(sample.width).toBeGreaterThan(0)
  const actual = await page.screenshot({ clip: region, scale: 'css' })
  await label.evaluate((element) => element.setAttribute('data-native-marker-paint', ''))
  const hidden = await page.addStyleTag({
    content:
      '[data-native-marker-paint]::before,[data-native-marker-paint]::after{visibility:hidden!important}'
  })
  try {
    const withoutMarker = await page.screenshot({ clip: region, scale: 'css' })
    const paint = compareShadowPaint(actual, withoutMarker, region, [sample])
    expect(paint.changedPixels).toBeGreaterThan(2)
    expect(paint.maxChannelDelta).toBeGreaterThan(12)
  } finally {
    await hidden.evaluate((element) => element.remove())
    await label.evaluate((element) => element.removeAttribute('data-native-marker-paint'))
  }
}

for (const [theme, width] of [
  ['light', 1440],
  ['dark', 390]
] as const) {
  test(`原生展示属性 ${theme} ${width} 动态切换保留尺寸、星号和字段值`, async ({ page }, info) => {
    const evidence = await prepareDisplay(page, theme, width)
    const form = page.locator('.art-form')
    const name = field(form, 'name').getByRole('textbox')
    const alias = field(form, 'alias').getByRole('textbox')
    await expect(name).toBeVisible({ timeout: 60_000 })
    await name.fill('切换后保留的业务名称')
    await alias.fill('保留组件标签字段')
    await field(form, 'code').getByRole('textbox').fill('跨组织草稿')
    const presets = [
      { button: '删除原生展示属性', size: undefined, inline: false, suffix: '', side: 'left' },
      { button: '小号行内右星标', size: 'small', inline: true, suffix: '：', side: 'right' },
      { button: '大号非行内左星标', size: 'large', inline: false, suffix: '', side: 'left' },
      { button: '默认号行内右星标', size: 'default', inline: true, suffix: '：', side: 'right' },
      { button: '删除原生展示属性', size: undefined, inline: false, suffix: '', side: 'left' }
    ] as const
    for (const preset of presets) {
      await page.getByRole('button', { name: preset.button, exact: true }).click()
      if (preset.inline) await expect(form.locator('form')).toHaveClass(/\bel-form--inline\b/)
      else await expect(form.locator('form')).not.toHaveClass(/\bel-form--inline\b/)
      await expectSizeMatchesNative(form, page, preset.size)
      await expectLabel(form, 'name', `业务名称${preset.suffix}`)
      await expectLabel(form, 'alias', `显示别名${preset.suffix}`)
      await expect(field(form, 'settings')).toHaveText('业务设置')
      await expectUsableLayout(form, page)
      await expect(name).toHaveValue('切换后保留的业务名称')
      await expect(alias).toHaveValue('保留组件标签字段')
      if (preset.size === 'small' || preset.size === 'large')
        await expectRequiredMarkerPaint(
          page,
          field(form, 'name').locator('.el-form-item__label'),
          preset.side
        )
    }
    await expect
      .poll(async () =>
        JSON.parse((await page.getByTestId('native-display-values').textContent()) || '{}')
      )
      .toEqual({ name: '切换后保留的业务名称', alias: '保留组件标签字段', code: '跨组织草稿' })
    await page.screenshot({
      path: info.outputPath(`native-display-${theme}-${width}.png`),
      fullPage: true
    })
    expect(evidence.writes).toEqual([])
    expect(evidence.errors).toEqual([])
  })
}

test('原生展示属性经查询栏透传后保留右对齐、单行标签和查询值', async ({ page }, info) => {
  const evidence = await prepareDisplay(page, 'dark', 390, 'query')
  const search = page.locator('.art-search-bar')
  const name = field(search, 'name').getByRole('textbox')
  await expect(name).toBeVisible({ timeout: 60_000 })
  await name.fill('查询名称')
  await field(search, 'alias').getByRole('textbox').fill('查询别名')
  for (const button of [
    '仅添加标签后缀',
    '小号行内右星标',
    '大号非行内左星标',
    '删除原生展示属性'
  ]) {
    await page.getByRole('button', { name: button, exact: true }).click()
    const suffix = button === '仅添加标签后缀' || button === '小号行内右星标' ? '：' : ''
    await expectLabel(search, 'name', `业务名称${suffix}`)
    await expectLabel(search, 'alias', `显示别名${suffix}`)
    await expectSizeMatchesNative(
      search,
      page,
      button === '小号行内右星标' ? 'small' : button === '大号非行内左星标' ? 'large' : undefined
    )
    for (const key of ['name', 'alias']) {
      const alignment = await field(search, key).evaluate((element) => {
        const label = element.querySelector('.el-form-item__label')!
        const labelBox = label.getBoundingClientRect()
        const editor = element.querySelector('.el-input__wrapper')!.getBoundingClientRect()
        const labelContent = label.querySelector('.art-form-item__label')!
        const range = document.createRange()
        range.selectNodeContents(labelContent)
        return {
          align: getComputedStyle(label).textAlign,
          centerOffset: Math.abs((labelBox.top + labelBox.bottom - editor.top - editor.bottom) / 2),
          textHeight: range.getBoundingClientRect().height,
          lineHeight: Number.parseFloat(getComputedStyle(label).lineHeight)
        }
      })
      expect(alignment.align).toBe('right')
      expect(alignment.centerOffset).toBeLessThan(1)
      expect(alignment.textHeight).toBeLessThanOrEqual(alignment.lineHeight + 1)
    }
    await expectUsableLayout(search, page)
    if (button === '小号行内右星标')
      await search.screenshot({ path: info.outputPath('native-inline-query-390-dark.png') })
  }
  await name.press('Enter')
  await expect
    .poll(async () => JSON.parse((await page.getByTestId('query-output').textContent()) || '{}'))
    .toEqual({ name: '查询名称', alias: '查询别名' })
  await search.screenshot({ path: info.outputPath('native-display-query-390-dark.png') })
  expect(evidence.writes).toEqual([])
  expect(evidence.errors).toEqual([])
})

test('原生标签后缀在真实专注弹窗中保留紧凑标签、组件标签和帮助', async ({ page }, info) => {
  const evidence = await prepareDisplay(page, 'light', 1440, 'overlay')
  await page.getByRole('button', { name: '打开展示属性弹窗', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '展示属性弹窗', exact: true })
  const form = dialog.locator('.art-form')
  const name = field(form, 'name').getByRole('textbox')
  await expect(name).toBeVisible({ timeout: 60_000 })
  await name.fill('专注填单草稿')
  await dialog.getByRole('button', { name: '仅添加标签后缀', exact: true }).click()
  await dialog.getByRole('button', { name: '进入专注填单', exact: true }).click()
  await expect(form).toHaveClass(/\bart-form--overlay-focus\b/)
  await expectLabel(form, 'name', '业务名称：')
  await expectLabel(form, 'alias', '显示别名：')
  await expectLabel(form, 'code', '跨组织业务名称显示方式：')
  await expect(field(form, 'alias').getByTestId('component-label')).toHaveText('显示别名')
  const longLabel = field(form, 'code').locator('.art-form-item__label-text')
  expect(await longLabel.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
    true
  )
  await longLabel.hover()
  await expect(
    page.locator('.art-form-item__label-tooltip').filter({ hasText: '跨组织业务名称显示方式' })
  ).toBeVisible()
  await field(form, 'alias').locator('.art-form-item__help-icon').hover()
  await expect(page.getByRole('tooltip').filter({ hasText: '组件标签的填写提示。' })).toBeVisible()
  await expectRequiredMarkerPaint(page, field(form, 'name').locator('.el-form-item__label'), 'left')
  await expectUsableLayout(form, page)
  await dialog.getByRole('button', { name: '删除原生展示属性', exact: true }).click()
  await expectLabel(form, 'name', '业务名称')
  await expectLabel(form, 'alias', '显示别名')
  await expect(name).toHaveValue('专注填单草稿')
  await dialog.screenshot({ path: info.outputPath('native-display-overlay-compact.png') })
  expect(evidence.writes).toEqual([])
  expect(evidence.errors).toEqual([])
})
