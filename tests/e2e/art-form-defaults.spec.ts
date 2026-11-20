import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { compareShadowPaint, shadowPaintRegion } from './support/shadow-paint'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)

for (const variant of [
  { width: 1440, height: 900, theme: 'light', box: 'border-mode' },
  { width: 1280, height: 800, theme: 'dark', box: 'shadow-mode' },
  { width: 390, height: 844, theme: 'light', box: 'border-mode' }
]) {
  test(`${variant.width} ${variant.theme} 普通表单默认无操作，查询保留搜索与重置`, async ({
    page
  }) => {
    await prepareIsolatedSession(page)
    await page.setViewportSize(variant)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(
      `/tests/e2e/fixtures/art-form-defaults.html?theme=${variant.theme}&box=${variant.box}`
    )

    const entry = page.getByTestId('entry-form')
    await expect(entry.getByRole('textbox', { name: '业务名称' })).toBeVisible()
    await expect(entry.locator('.art-form .reset-button, .art-form .submit-button')).toHaveCount(0)
    await page.getByRole('button', { name: '校验录入', exact: true }).click()
    await expect(page.getByLabel('录入校验')).toHaveText('请完善录入')
    await expect(entry.getByText('请填写业务名称')).toBeVisible()
    await entry.getByRole('textbox', { name: '业务名称' }).fill('示范业务')
    await page.getByRole('button', { name: '校验录入', exact: true }).click()
    await expect(page.getByLabel('录入校验')).toHaveText('校验通过')

    const search = page.getByTestId('search-form')
    const keyword = search.getByRole('textbox', { name: '关键词', exact: true })
    await keyword.fill('示范查询')
    await search.getByRole('button', { name: '查询', exact: true }).click()
    await expect(page.getByLabel('查询结果')).toHaveText('{"keyword":"示范查询"}')
    await search.getByRole('button', { name: '重置', exact: true }).click()
    await expect(keyword).toHaveValue('')
    await expect(page.getByLabel('重置次数')).toHaveText('1')
    await expect(search.getByRole('button', { name: '查询', exact: true })).toBeEnabled()
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true)
    await page.screenshot({
      path: `.artifacts/form-defaults/${variant.width}-${variant.theme}-${variant.box}.png`,
      fullPage: true
    })
    expect(errors).toEqual([])
  })
}

test('普通表单最后字段的多行校验完整绘制且可修正', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  await page.setViewportSize({ width: 390, height: 844 })
  const failures: string[] = []
  page.on('pageerror', (error) => failures.push(error.message))
  await page.goto(
    '/tests/e2e/fixtures/art-form-defaults.html?multiline-error&theme=light&box=shadow-mode'
  )
  const entry = page.getByTestId('entry-form')
  const form = entry.locator('.art-form')
  const input = entry.getByRole('textbox', { name: '业务名称', exact: true })
  const error = form.locator('.el-form-item__error')
  await expect(input).toBeVisible({ timeout: 60_000 })
  await page.getByRole('button', { name: '校验录入', exact: true }).click()
  await expect(page.getByLabel('录入校验')).toHaveText('请完善录入')
  await expect(error).toHaveText(
    '请填写完整业务名称并确认所属业务范围，名称应包含负责单位和具体事项，以便后续查询、审核及业务关联时准确识别。'
  )
  await expect(error).toBeVisible()
  await error.evaluate(async (element) => {
    await document.fonts.ready
    await Promise.allSettled(
      element
        .getAnimations({ subtree: true })
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished)
    )
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    )
  })
  const inspect = () =>
    error.evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      const owner = element.closest('.art-form')!
      const ownerBounds = owner.getBoundingClientRect()
      return {
        rect: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
        ownerRect: {
          x: ownerBounds.x,
          y: ownerBounds.y,
          width: ownerBounds.width,
          height: ownerBounds.height
        },
        lineHeight: parseFloat(getComputedStyle(element).lineHeight),
        viewport: { width: innerWidth, height: innerHeight },
        overflow: document.documentElement.scrollWidth - innerWidth
      }
    })
  const before = await inspect()
  expect(before.rect.height).toBeGreaterThanOrEqual(before.lineHeight * 3)
  const flow = await error.evaluate((element) => {
    const rect = (target: Element) => {
      const { left, top, right, bottom, width, height } = target.getBoundingClientRect()
      return { left, top, right, bottom, width, height }
    }
    const error = rect(element)
    const form = rect(element.closest('.art-form')!)
    const entry = element.closest('[data-testid="entry-form"]')!
    const button = rect(entry.querySelector('.el-button')!)
    const nextLabel = rect(
      document.querySelector('[data-testid="search-form"] .el-form-item__label')!
    )
    const intersection = (target: ReturnType<typeof rect>) =>
      Math.max(0, Math.min(error.right, target.right) - Math.max(error.left, target.left)) *
      Math.max(0, Math.min(error.bottom, target.bottom) - Math.max(error.top, target.top))
    return {
      error,
      form,
      button,
      nextLabel,
      buttonIntersection: intersection(button),
      labelIntersection: intersection(nextLabel)
    }
  })
  await info.attach('last-field-multiline-error-flow', {
    body: JSON.stringify(flow, null, 2),
    contentType: 'application/json'
  })
  expect.soft(flow.buttonIntersection, '错误文字不能覆盖后续校验按钮').toBeLessThanOrEqual(1)
  expect.soft(flow.labelIntersection, '错误文字不能覆盖下一张卡片的标签').toBeLessThanOrEqual(1)
  expect
    .soft(flow.button.top, '后续校验按钮应排在完整错误提示下方')
    .toBeGreaterThanOrEqual(flow.error.bottom - 1)
  expect
    .soft(flow.form.bottom, '最后字段错误提示应计入表单实际高度')
    .toBeGreaterThanOrEqual(flow.error.bottom - 1)
  const sample = {
    x: Math.floor(before.rect.x),
    y: Math.floor(before.rect.y),
    width: Math.ceil(before.rect.x + before.rect.width) - Math.floor(before.rect.x),
    height: Math.ceil(before.rect.y + before.rect.height) - Math.floor(before.rect.y)
  }
  const lastLine = {
    x: sample.x,
    y: Math.ceil(before.rect.y + before.rect.height - before.lineHeight),
    width: sample.width,
    height:
      Math.floor(before.rect.y + before.rect.height) -
      Math.ceil(before.rect.y + before.rect.height - before.lineHeight)
  }
  const region = shadowPaintRegion([sample])
  expect(region.x).toBeGreaterThanOrEqual(0)
  expect(region.y).toBeGreaterThanOrEqual(0)
  expect(region.x + region.width).toBeLessThanOrEqual(before.viewport.width)
  expect(region.y + region.height).toBeLessThanOrEqual(before.viewport.height)
  const capture = () =>
    page.screenshot({ clip: region, scale: 'css', animations: 'disabled', caret: 'hide' })
  const actual = await capture()
  const repeat = await capture()
  await page.screenshot({
    path: info.outputPath('multiline-error-visible.png'),
    fullPage: true,
    caret: 'hide',
    animations: 'disabled'
  })
  const originals = {
    form: await form.getAttribute('style'),
    error: await error.getAttribute('style')
  }
  try {
    await form.evaluate((element) => element.style.setProperty('overflow', 'visible', 'important'))
    const referenceGeometry = await inspect()
    expect(referenceGeometry.rect).toEqual(before.rect)
    expect(referenceGeometry.ownerRect).toEqual(before.ownerRect)
    const reference = await capture()
    await error.evaluate((element) =>
      element.style.setProperty('visibility', 'hidden', 'important')
    )
    const hiddenGeometry = await inspect()
    expect(hiddenGeometry.rect).toEqual(before.rect)
    expect(hiddenGeometry.ownerRect).toEqual(before.ownerRect)
    const background = await capture()
    const stability = compareShadowPaint(actual, repeat, region, [sample])
    const paint = compareShadowPaint(actual, reference, region, [sample])
    const visibleText = compareShadowPaint(reference, background, region, [sample])
    const visibleLastLine = compareShadowPaint(reference, background, region, [lastLine])
    await info.attach('last-field-multiline-error-paint', {
      body: JSON.stringify(
        {
          before,
          referenceGeometry,
          hiddenGeometry,
          region,
          lastLine,
          stability,
          paint,
          visibleText,
          visibleLastLine
        },
        null,
        2
      ),
      contentType: 'application/json'
    })
    for (const [stage, body] of [
      ['actual', actual],
      ['unclipped-reference', reference],
      ['no-text-background', background]
    ] as const)
      await info.attach(`last-field-${stage}`, { body, contentType: 'image/png' })
    expect(stability.maxChannelDelta).toBeLessThanOrEqual(1)
    expect(visibleText.changedPixels).toBeGreaterThan(0)
    expect(visibleLastLine.changedPixels, '参考图最后一行须有实际文字像素').toBeGreaterThan(0)
    expect(paint.maxChannelDelta, '最后字段所有错误文字应与未裁剪参考一致').toBeLessThanOrEqual(1)
    expect(before.overflow).toBeLessThanOrEqual(1)
  } finally {
    await form.evaluate((element, style) => {
      if (style === null) element.removeAttribute('style')
      else element.setAttribute('style', style)
    }, originals.form)
    await error.evaluate((element, style) => {
      if (style === null) element.removeAttribute('style')
      else element.setAttribute('style', style)
    }, originals.error)
  }
  await input.fill('示范业务')
  await page.getByRole('button', { name: '校验录入', exact: true }).click()
  await expect(page.getByLabel('录入校验')).toHaveText('校验通过')
  await expect(error).toHaveCount(0)
  expect(failures).toEqual([])
})

for (const labelPosition of ['right', 'top'] as const) {
  test(`${labelPosition === 'right' ? '右对齐' : '顶部'}查询短校验保留标签控件操作中心且可修正`, async ({
    page
  }, info) => {
    await prepareIsolatedSession(page)
    const narrow = info.project.name === 'mobile-390'
    const failures: string[] = []
    page.on('pageerror', (error) => failures.push(error.message))
    await page.goto(
      `/tests/e2e/fixtures/art-form-defaults.html?query-error&query-label=${labelPosition}&theme=${narrow ? 'dark' : 'light'}&box=shadow-mode`
    )
    const search = page.getByTestId('search-form')
    const keyword = search.getByRole('textbox', { name: /关键词$/ })
    const field = keyword.locator(
      'xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " el-form-item ")][1]'
    )
    const error = field.locator('.el-form-item__error')
    const measure = () =>
      field.evaluate((element) => {
        const rect = (target: Element) => {
          const { left, top, right, bottom, width, height } = target.getBoundingClientRect()
          return { left, top, right, bottom, width, height, centerY: top + height / 2 }
        }
        const label = element.querySelector('.el-form-item__label')!
        return {
          label: rect(label),
          labelText: rect(label.querySelector('.art-form-item__label')!),
          labelPaddingRight: parseFloat(getComputedStyle(label).paddingRight),
          input: rect(element.querySelector('.el-input__wrapper')!),
          action: rect(element.closest('.art-search-bar')!.querySelector('.submit-button')!)
        }
      })
    await expect(keyword).toBeVisible({ timeout: 60_000 })
    await expect(field).toHaveClass(new RegExp(`el-form-item--label-${labelPosition}`))
    await expect(error).toHaveCount(0)
    const before = await measure()
    await keyword.focus()
    await keyword.blur()
    await expect(error).toHaveText('请填写查询关键词')
    await expect(error).toBeVisible()
    const invalid = await measure()
    const clipping = await error.evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      const ancestors = []
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent)
        const clipX = ['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowX)
        const clipY = ['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowY)
        if (!clipX && !clipY) continue
        const rect = parent.getBoundingClientRect()
        const margin =
          style.overflowX === 'clip' && style.overflowY === 'clip'
            ? Number.parseFloat(style.overflowClipMargin) || 0
            : 0
        const left = rect.left + parent.clientLeft
        const top = rect.top + parent.clientTop
        ancestors.push({
          className: parent.className,
          ...(clipX
            ? {
                left: bounds.left - left + margin,
                right: left + parent.clientWidth + margin - bounds.right
              }
            : {}),
          ...(clipY
            ? {
                top: bounds.top - top + margin,
                bottom: top + parent.clientHeight + margin - bounds.bottom
              }
            : {})
        })
      }
      return ancestors
    })
    await info.attach(`${labelPosition}-query-short-error-geometry`, {
      body: JSON.stringify({ before, invalid, clipping }, null, 2),
      contentType: 'application/json'
    })
    for (const region of ['label', 'input', 'action'] as const)
      expect(Math.abs(invalid[region].centerY - before[region].centerY)).toBeLessThanOrEqual(1)
    if (labelPosition === 'right') {
      expect(Math.abs(invalid.label.centerY - invalid.input.centerY)).toBeLessThanOrEqual(1)
      expect(
        Math.abs(invalid.label.right - invalid.labelText.right - invalid.labelPaddingRight)
      ).toBeLessThanOrEqual(1)
    }
    for (const { className, ...edges } of clipping)
      for (const [edge, clearance] of Object.entries(edges))
        expect(clearance, `${className} 的 ${edge} 不得裁切短校验提示`).toBeGreaterThanOrEqual(-1)
    await page.screenshot({
      path: info.outputPath(`${labelPosition}-query-short-error.png`),
      fullPage: true
    })
    await keyword.fill('修正后的查询')
    await keyword.blur()
    await expect(error).toHaveCount(0)
    await search.getByRole('button', { name: '查询', exact: true }).click()
    await expect(page.getByLabel('查询结果')).toHaveText('{"keyword":"修正后的查询"}')
    await search.getByRole('button', { name: '重置', exact: true }).click()
    await expect(keyword).toHaveValue('')
    await expect(page.getByLabel('重置次数')).toHaveText('1')
    await expect(error).toHaveCount(0)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    expect(failures).toEqual([])
  })
}

test('行内校验保留Element Plus紧邻控件策略且可修正', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const failures: string[] = []
  page.on('pageerror', (error) => failures.push(error.message))
  await page.goto(
    `/tests/e2e/fixtures/art-form-defaults.html?inline-error&theme=${info.project.name === 'mobile-390' ? 'dark' : 'light'}&box=shadow-mode`
  )
  const entry = page.getByTestId('entry-form')
  const input = entry.getByRole('textbox', { name: /业务名称$/ })
  const error = entry.locator('.el-form-item__error')
  await expect(input).toBeVisible({ timeout: 60_000 })
  await page.getByRole('button', { name: '校验录入', exact: true }).click()
  await expect(page.getByLabel('录入校验')).toHaveText('请完善录入')
  await expect(error).toHaveText('请填写业务名称')
  await expect(error).toHaveClass(/el-form-item__error--inline/)
  const geometry = await error.evaluate((element) => {
    const rect = (target: Element) => {
      const { left, top, right, bottom, width, height } = target.getBoundingClientRect()
      return { left, top, right, bottom, width, height }
    }
    const content = element.closest('.el-form-item__content')!
    return {
      error: rect(element),
      content: rect(content),
      input: rect(content.querySelector('.el-input__wrapper')!),
      lineHeight: parseFloat(getComputedStyle(element).lineHeight)
    }
  })
  await info.attach('inline-error-native-flow', {
    body: JSON.stringify(geometry, null, 2),
    contentType: 'application/json'
  })
  expect(Math.abs(geometry.error.left - geometry.content.left - 10)).toBeLessThanOrEqual(1)
  expect(geometry.error.top).toBeGreaterThanOrEqual(geometry.input.bottom - 1)
  expect(geometry.error.right).toBeLessThanOrEqual(geometry.content.right + 1)
  expect(geometry.error.bottom).toBeLessThanOrEqual(geometry.content.bottom + 1)
  expect(geometry.error.width).toBeLessThan(geometry.content.width - 10)
  expect(geometry.error.height).toBeLessThanOrEqual(geometry.lineHeight + 3)
  await page.screenshot({ path: info.outputPath('native-inline-error.png'), fullPage: true })
  await input.fill('修正后的录入')
  await page.getByRole('button', { name: '校验录入', exact: true }).click()
  await expect(page.getByLabel('录入校验')).toHaveText('校验通过')
  await expect(error).toHaveCount(0)
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  expect(failures).toEqual([])
})

for (const property of [
  'inlineMessage',
  'showMessage',
  'statusIcon',
  'hideRequiredAsterisk'
] as const) {
  test(`公开表单布尔属性 ${property} 动态传递保留字段覆盖、模型与校验重置`, async ({
    page
  }, info) => {
    test.setTimeout(120_000)
    await prepareIsolatedSession(page)
    const failures: string[] = []
    page.on('pageerror', (error) => failures.push(error.message))
    await page.goto(
      `/tests/e2e/fixtures/art-form-defaults.html?public-form-props=${property}&theme=${info.project.name === 'mobile-390' ? 'dark' : 'light'}&box=shadow-mode`
    )
    const entry = page.getByTestId('entry-form')
    const name = entry.getByRole('textbox', { name: /业务名称$/ })
    const reference = entry.getByRole('textbox', { name: /参考编码$/ })
    const owner =
      'xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " el-form-item ")][1]'
    const nameField = name.locator(owner)
    const referenceField = reference.locator(owner)
    const error = nameField.locator('.el-form-item__error')
    const referenceError = referenceField.locator('.el-form-item__error')
    const icon = nameField.locator('.el-input__validateIcon')
    await expect(name).toBeVisible({ timeout: 60_000 })
    await expect(reference).toBeVisible()
    const nameElement = await name.elementHandle()
    const referenceElement = await reference.elementHandle()
    if (!nameElement || !referenceElement) throw new Error('公开表单属性测试控件尚未挂载')
    let validations = 0
    const validate = async (valid: boolean) => {
      await entry.getByRole('button', { name: '校验录入', exact: true }).click()
      await expect(page.getByTestId('entry-validations')).toHaveText(String(++validations))
      await expect(page.getByLabel('录入校验')).toHaveText(valid ? '校验通过' : '请完善录入')
    }
    const preserveInstances = async () => {
      expect(await name.evaluate((current, original) => current === original, nameElement)).toBe(
        true
      )
      expect(
        await reference.evaluate((current, original) => current === original, referenceElement)
      ).toBe(true)
    }
    const modes = {
      default: { button: '使用默认属性', value: undefined, present: false },
      enabled: { button: '启用表单属性', value: true, present: true },
      disabled: { button: '关闭表单属性', value: false, present: true },
      undefined: { button: '传入未设置值', value: undefined, present: true }
    } as const
    type Mode = keyof typeof modes
    const changeMode = async (mode: Mode) => {
      await entry.getByRole('button', { name: modes[mode].button, exact: true }).click()
      await expect(page.getByTestId('public-form-prop-state')).toHaveText(
        JSON.stringify({ mode, present: modes[mode].present, value: String(modes[mode].value) })
      )
    }
    const assertInvalidFeedback = async (enabled: boolean) => {
      await expect(nameField).toHaveClass(/is-error/)
      await expect(referenceField).toHaveClass(/is-error/)
      if (property === 'showMessage') {
        if (enabled) await expect(error).toBeVisible()
        else await expect(error).toHaveCount(0)
        // Element Plus ANDs form/field showMessage; a field false always suppresses its text.
        await expect(referenceError).toHaveCount(0)
      } else {
        await expect(error).toHaveText('请填写业务名称')
        await expect(error).toBeVisible()
        await expect(referenceError).toHaveText('请填写参考编码')
        if (property === 'inlineMessage') {
          if (enabled) {
            await expect(error).toHaveClass(/el-form-item__error--inline/)
            const placement = await error.evaluate((element) => {
              const content = element.closest('.el-form-item__content')!.getBoundingClientRect()
              const rect = element.getBoundingClientRect()
              return {
                inset: rect.left - content.left,
                width: rect.width,
                available: content.width
              }
            })
            expect(Math.abs(placement.inset - 10)).toBeLessThanOrEqual(1)
            expect(placement.width).toBeLessThan(placement.available - 10)
          } else await expect(error).not.toHaveClass(/el-form-item__error--inline/)
          await expect(referenceError).not.toHaveClass(/el-form-item__error--inline/)
        }
      }
      if (property === 'statusIcon') {
        if (enabled) await expect(icon).toBeVisible()
        else await expect(icon).toHaveCount(0)
      }
      if (property === 'hideRequiredAsterisk') {
        const marker = await nameField
          .locator(':scope > .el-form-item__label')
          .evaluate((label) => {
            const text = label.querySelector('.art-form-item__label')!
            return {
              content: getComputedStyle(label, '::before').content,
              width: text.getBoundingClientRect().left - label.getBoundingClientRect().left
            }
          })
        if (enabled) {
          await expect(nameField).toHaveClass(/is-no-asterisk/)
          expect(['none', 'normal', '""']).toContain(marker.content)
          expect(Math.abs(marker.width)).toBeLessThanOrEqual(1)
        } else {
          await expect(nameField).not.toHaveClass(/is-no-asterisk/)
          expect(marker.content).toContain('*')
          expect(marker.width).toBeGreaterThanOrEqual(4)
        }
      }
    }
    for (const mode of [
      'default',
      'enabled',
      'disabled',
      'enabled',
      'undefined',
      'disabled',
      'default'
    ] as const) {
      await changeMode(mode)
      await validate(false)
      const enabled = modes[mode].value ?? property === 'showMessage'
      await assertInvalidFeedback(enabled)
      await preserveInstances()
      await expect(name).toHaveValue('')
      await expect(reference).toHaveValue('')
      if (mode === 'enabled')
        await entry.screenshot({ path: info.outputPath(`public-${property}-enabled.png`) })
    }
    await name.fill('保留中的业务输入')
    for (const mode of ['enabled', 'disabled', 'undefined', 'default'] as const) {
      await changeMode(mode)
      await validate(false)
      await expect(name).toHaveValue('保留中的业务输入')
      await expect(reference).toHaveValue('')
      await preserveInstances()
    }
    await reference.fill('REF-2026')
    if (property === 'statusIcon') await changeMode('enabled')
    await validate(true)
    await expect(entry.locator('.el-form-item__error')).toHaveCount(0)
    if (property === 'statusIcon') {
      await expect(nameField).toHaveClass(/is-success/)
      await expect(icon).toBeVisible()
    }
    await preserveInstances()
    await entry.getByRole('button', { name: '重置录入', exact: true }).click()
    await expect(page.getByLabel('录入校验')).toHaveText('已重置')
    await expect(name).toHaveValue('')
    await expect(reference).toHaveValue('')
    await expect(entry.locator('.el-form-item__error')).toHaveCount(0)
    await expect(icon).toHaveCount(0)
    await preserveInstances()
    await validate(false)
    await expect(nameField).toHaveClass(/is-error/)
    await expect(referenceField).toHaveClass(/is-error/)
    await expect(page.getByTestId('entry-submits')).toHaveText('0')
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    expect(failures).toEqual([])
  })
}
