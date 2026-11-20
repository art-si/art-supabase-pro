import { writeFile } from 'node:fs/promises'
import { uniq } from 'lodash-es'
import { expect, test, type Locator, type Page, type Route } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { assertAppearance, prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const fields = [
  { key: 'name', control: '.el-input__wrapper' },
  { key: 'date', control: '.el-input__wrapper' },
  { key: 'acknowledged', control: '.el-checkbox' },
  { key: 'notes', control: '.el-textarea__inner' },
  { key: 'smallName', control: '.el-input__wrapper', size: 'small', formItemSize: 'small' },
  { key: 'largeDate', control: '.el-input__wrapper', size: 'large' },
  { key: 'longAlias', control: '.el-textarea__inner' }
] as const

interface Bounds {
  x: number
  y: number
  width: number
  height: number
  bottom: number
}

interface FieldGeometry {
  content: Bounds
  nativeContent: Bounds
  control: Bounds
  glyph: { bounds: Bounds; radius: string } | null
  label: Bounds
  nextLabelY: number | null
  formItemSize: string
  controlSize: string | null
  lineHeight: string
  paintedTop: number
  paintedBottom: number
}

interface FormGeometry {
  fields: Record<string, FieldGeometry>
  actions: Bounds
}

async function settleLayout(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  })
}

test('级联单路径与尺寸继承保持布局，多路径和高前缀保留实际空间', async ({ page }, info) => {
  const appearance = { theme: 'dark', boxBorderMode: false } as const
  await prepareIsolatedSession(page, { platformSuper: false })
  await prepareAppearance(page, appearance)
  await page.setViewportSize({ width: 390, height: 900 })
  const paths = [
    '/src/components/core/forms/art-cascader/index.vue',
    '/src/components/core/forms/art-user-select/index.vue'
  ]
  const requests: string[] = []
  const held: Route[] = []
  const errors: string[] = []
  const warnings: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (
      /maximum recursive updates|slot.+invoked outside|unhandled error during execution/i.test(
        message.text()
      )
    )
      warnings.push(message.text())
  })
  for (const path of paths)
    await page.route(`**${path}*`, (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (
        request.resourceType() === 'script' &&
        url.pathname === path &&
        !url.searchParams.has('vue')
      ) {
        requests.push(url.pathname + url.search)
        held.push(route)
        return
      }
      return route.continue()
    })
  try {
    await page.goto(
      '/tests/e2e/fixtures/art-form-values.html?placeholder-geometry=1&cascader-boundary=1&size=large&size-provider=1&theme=dark&box=shadow-mode',
      { waitUntil: 'domcontentloaded' }
    )
    await assertAppearance(page, appearance)
    const form = page.locator('.art-form')
    const column = (key: string) => form.locator(`[data-art-form-item-key="${key}"]`)
    const measured = [
      { key: 'cascaderPath', control: '.el-input__wrapper' },
      { key: 'cascaderSmall', control: '.el-input__wrapper' },
      { key: 'userSmall', control: '.el-select__wrapper' },
      { key: 'cascaderMulti', control: '.art-cascader' },
      { key: 'cascaderPrefix', control: '.art-cascader' }
    ] as const
    const positive = measured.slice(0, 3)
    const submit = page.getByRole('button', { name: '保存布局表单', exact: true })
    const reset = page.getByRole('button', { name: '重置布局表单', exact: true })
    await expect.poll(() => held.length).toBe(paths.length)
    await expect(form.locator('.art-async-state[aria-busy="true"]')).toHaveCount(measured.length)
    await expect(form.locator('.art-async-state')).toHaveCount(measured.length)
    await expect(column('cascaderAnchor').locator('input')).toHaveValue('级联边界后的原生锚点')
    await expect(form.locator('.el-form-item__error')).toHaveCount(0)
    await expect(page.getByTestId('placeholder-ready')).toHaveText('false')
    await expect(submit).toBeDisabled()
    await expect(reset).toBeDisabled()
    const originalForm = await form.elementHandle()
    const originalColumns = await form.locator('[data-art-form-item-key]').elementHandles()
    const originalValues = await page.getByTestId('placeholder-values').textContent()
    if (!originalForm || !originalValues) throw new Error('级联边界的原始模型或DOM尚未挂载')
    await page.addStyleTag({ path: 'tests/e2e/visual-stability.css' })
    const inventory = () =>
      form.evaluate(
        (root, keys) => {
          const bounds = (element: Element) => {
            const rect = element.getBoundingClientRect()
            return {
              x: rect.x + scrollX,
              y: rect.y + scrollY,
              width: rect.width,
              height: rect.height,
              bottom: rect.bottom + scrollY
            }
          }
          const describe = (element: Element | null) => {
            if (!element) return null
            const style = getComputedStyle(element)
            return {
              ...bounds(element),
              lineHeight: style.lineHeight,
              overflowX: style.overflowX,
              overflowY: style.overflowY
            }
          }
          const anchor = root.querySelector(
            '[data-art-form-item-key="cascaderAnchor"] .el-form-item__label'
          )
          if (!anchor) throw new Error('原生锚点标签未挂载')
          return {
            formTop: bounds(root).y,
            anchor: bounds(anchor),
            fields: Object.fromEntries(
              keys.map((key) => {
                const field = root.querySelector(`[data-art-form-item-key="${key}"]`)
                if (!field) throw new Error(`${key} 级联边界未挂载`)
                return [
                  key,
                  {
                    outer: describe(field.querySelector('.art-cascader, .art-user-select')),
                    native: describe(field.querySelector('.el-cascader, .el-select')),
                    input: describe(field.querySelector('.el-input')),
                    wrapper: describe(
                      field.querySelector('.el-input__wrapper, .el-select__wrapper')
                    ),
                    pendingPaint: describe(
                      field.querySelector('.art-form-control-skeleton__rect, .el-skeleton')
                    ),
                    prefix: describe(field.querySelector('[data-testid="cascader-tall-prefix"]')),
                    prefixInner: describe(field.querySelector('.el-input__prefix-inner')),
                    prefixContainer: describe(field.querySelector('.el-input__prefix')),
                    tags: [...field.querySelectorAll('.el-cascader__tags .el-tag')].map(bounds),
                    sizeClasses: [
                      ...field.querySelectorAll('.el-input, .el-cascader, .el-select')
                    ].flatMap((element) =>
                      [...element.classList].filter((name) => /--(small|large|default)$/.test(name))
                    )
                  }
                ] as const
              })
            )
          }
        },
        measured.map(({ key }) => key)
      )
    await settleLayout(page)
    const loading = await geometry(form, false, measured)
    const loadingInventory = await inventory()
    await page.screenshot({
      path: info.outputPath('cascader-boundary-loading.png'),
      fullPage: true,
      animations: 'disabled'
    })
    for (const pending of held.splice(0)) await pending.continue()
    await expect(form.locator('.art-async-state')).toHaveCount(0, { timeout: 60_000 })
    await expect(page.getByTestId('placeholder-ready')).toHaveText('true')
    await expect(submit).toBeEnabled()
    await expect(reset).toBeEnabled()
    await expect(column('cascaderMulti').locator('.el-cascader__tags .el-tag')).toHaveCount(2)
    await expect(page.getByTestId('cascader-tall-prefix')).toBeVisible()
    await settleLayout(page)
    const loaded = await geometry(form, true, measured)
    const loadedInventory = await inventory()
    const rows = uniq(loadedInventory.fields.cascaderMulti.tags.map((tag) => Math.round(tag.y)))
    const report = {
      profile: { width: 390, size: 'large', inheritSize: true, ...appearance },
      requests,
      originalValues,
      loading,
      loaded,
      loadingInventory,
      loadedInventory,
      multipleRows: rows,
      actionsDelta: loaded.actions.y - loading.actions.y,
      actionsPolicy: '多选与高前缀继续使用通用占位；操作区只记录，不要求整体零位移。'
    }
    const path = info.outputPath('cascader-boundary-geometry.json')
    await writeFile(path, JSON.stringify(report, null, 2), 'utf8')
    await info.attach('cascader-boundary-geometry', { path, contentType: 'application/json' })
    await page.screenshot({
      path: info.outputPath('cascader-boundary-loaded.png'),
      fullPage: true,
      animations: 'disabled'
    })
    for (const { key } of positive) {
      const before = loading.fields[key]
      const after = loaded.fields[key]
      const pendingPaint = loadingInventory.fields[key].pendingPaint
      const wrapper = loadedInventory.fields[key].wrapper
      const outer = loadedInventory.fields[key].outer
      if (!pendingPaint || !wrapper || !outer)
        throw new Error(`${key} 的实际占位或控件外框尚未就绪`)
      // The Cascader's transparent Art block can retain the larger FormItem
      // linebox. Compare natural content and painted input, not 24px to that block.
      for (const [part, delta] of [
        ['自然内容高度', before.content.height - after.content.height],
        ['原生内容高度', before.nativeContent.height - after.nativeContent.height],
        ['paint高度', pendingPaint.height - wrapper.height],
        ['paint宽度', pendingPaint.width - wrapper.width],
        ['paint横向位置', pendingPaint.x - wrapper.x],
        ['paint中心', pendingPaint.y + pendingPaint.height / 2 - (wrapper.y + wrapper.height / 2)],
        ['外框横向位置', before.content.x - outer.x],
        ['外框宽度', before.content.width - outer.width],
        ['标签到paint距离', pendingPaint.y - before.label.bottom - (wrapper.y - after.label.bottom)]
      ] as const)
        expect.soft(Math.abs(delta), `${key} ${part}`).toBeLessThanOrEqual(2)
    }
    expect
      .soft(
        Math.abs(
          loadingInventory.anchor.y -
            loadingInventory.formTop -
            (loadedInventory.anchor.y - loadedInventory.formTop)
        ),
        '三个单选字段后的原生锚点位置'
      )
      .toBeLessThanOrEqual(2)
    expect(loadedInventory.fields.cascaderPath.sizeClasses).toContain('el-input--large')
    expect(loadedInventory.fields.cascaderSmall.sizeClasses).toContain('el-input--small')
    expect(loadedInventory.fields.userSmall.sizeClasses).toContain('el-select--small')
    expect(loadedInventory.fields.cascaderSmall.wrapper!.height).toBeLessThan(
      loadedInventory.fields.cascaderPath.wrapper!.height
    )
    await expect(column('cascaderPath').locator('.el-cascader__tags .el-tag')).toHaveCount(0)
    await expect(column('cascaderPath').locator('input')).toHaveValue(
      '华东仓储协同区域 / 跨区域物流园区首期运营一号仓库'
    )
    expect(rows.length, '嵌套multiple必须实际产生多行标签').toBeGreaterThan(1)
    const multi = loaded.fields.cascaderMulti
    for (const tag of loadedInventory.fields.cascaderMulti.tags) {
      expect(tag.x).toBeGreaterThanOrEqual(multi.content.x - 1)
      expect(tag.x + tag.width).toBeLessThanOrEqual(multi.content.x + multi.content.width + 1)
      expect(tag.y).toBeGreaterThanOrEqual(multi.content.y - 1)
      expect(tag.bottom).toBeLessThanOrEqual(multi.content.bottom + 1)
    }
    expect(
      loading.fields.cascaderMulti.content.height,
      '多行闭合区域不能误用单行占位'
    ).toBeGreaterThanOrEqual(multi.content.height - 2)
    const prefix = loadedInventory.fields.cascaderPrefix.prefix
    if (!prefix) throw new Error('原生级联没有渲染真实prefix slot')
    expect(prefix.height, '实测prefix自身高度').toBe(64)
    expect(
      loading.fields.cascaderPrefix.content.height,
      '高prefix paint必须保留空间'
    ).toBeGreaterThanOrEqual(prefix.height - 2)
    expect(prefix.bottom, '高prefix paint不得覆盖操作区').toBeLessThanOrEqual(loaded.actions.y + 1)
    expect(await form.evaluate((current, original) => current === original, originalForm)).toBe(
      true
    )
    expect(originalColumns).toHaveLength(13)
    for (const [index, original] of originalColumns.entries())
      expect(
        await form
          .locator('[data-art-form-item-key]')
          .nth(index)
          .evaluate((current, previous) => current === previous, original)
      ).toBe(true)
    await expect(page.getByTestId('placeholder-values')).toHaveText(originalValues)
    await expect(page.getByTestId('placeholder-submissions')).toHaveText('0')
    await expect(form.locator('.el-form-item__error')).toHaveCount(0)
    expect(requests).toHaveLength(paths.length)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true
    )
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
  } finally {
    for (const pending of held.splice(0)) await pending.continue()
  }
})

async function geometry(
  form: Locator,
  loaded: boolean,
  measuredFields: readonly { key: string; control: string }[] = fields,
  actionSelector = '.art-form__actions'
): Promise<FormGeometry> {
  return form.evaluate(
    (root, { fields, loaded, actionSelector }) => {
      const bounds = (element: Element): Bounds => {
        const box = element.getBoundingClientRect()
        return {
          x: box.x + scrollX,
          y: box.y + scrollY,
          width: box.width,
          height: box.height,
          bottom: box.bottom + scrollY
        }
      }
      const measures: Record<string, FieldGeometry> = {}
      for (const [index, field] of fields.entries()) {
        const column = root.querySelector(`[data-art-form-item-key="${field.key}"]`)
        const content = column?.querySelector('.art-form-item__content')
        const nativeContent = column?.querySelector('.el-form-item__content')
        const label = column?.querySelector('.el-form-item__label')
        const item = column?.querySelector('.el-form-item')
        const control = column?.querySelector(loaded ? field.control : '.art-async-state')
        if (!column || !content || !nativeContent || !label || !item || !control)
          throw new Error(`${field.key} 的实际表单布局尚未就绪`)
        const size = (element: Element | null, pattern: RegExp) =>
          [...(element?.classList ?? [])].find((value) => pattern.test(value))?.split('--')[1] ??
          'default'
        const controlBounds = bounds(control)
        const glyph = column.querySelector(
          loaded ? '.el-checkbox__inner' : '.art-form-control-skeleton__check'
        )
        const paint = loaded
          ? []
          : [...control.querySelectorAll('*')]
              .filter((element) => {
                const style = getComputedStyle(element)
                const box = element.getBoundingClientRect()
                return (
                  !element.closest('.sr-only, [aria-live]') &&
                  style.display !== 'none' &&
                  style.visibility !== 'hidden' &&
                  box.width > 0 &&
                  box.height > 0
                )
              })
              .map(bounds)
        const next = fields[index + 1]
        const nextLabel = next
          ? root.querySelector(`[data-art-form-item-key="${next.key}"] .el-form-item__label`)
          : null
        measures[field.key] = {
          content: bounds(content),
          nativeContent: bounds(nativeContent),
          control: controlBounds,
          glyph: glyph
            ? { bounds: bounds(glyph), radius: getComputedStyle(glyph).borderTopLeftRadius }
            : null,
          label: bounds(label),
          nextLabelY: nextLabel ? bounds(nextLabel).y : null,
          formItemSize: size(item, /^el-form-item--(small|default|large)$/),
          controlSize: loaded
            ? size(
                column.querySelector('.el-input, .el-checkbox, .el-textarea'),
                /^el-(input|checkbox|textarea)--(small|default|large)$/
              )
            : null,
          lineHeight: getComputedStyle(content).lineHeight,
          paintedTop: Math.min(controlBounds.y, ...paint.map((box) => box.y)),
          paintedBottom: Math.max(controlBounds.bottom, ...paint.map((box) => box.bottom))
        }
      }
      const actions = root.querySelector(actionSelector)
      if (!actions) throw new Error('表单操作组尚未挂载')
      return { fields: measures, actions: bounds(actions) }
    },
    { fields: measuredFields, loaded, actionSelector }
  )
}

const profiles = [
  { size: 'default', width: 1440, theme: 'light', boxBorderMode: true, inheritSize: false },
  { size: 'default', width: 390, theme: 'dark', boxBorderMode: false, inheritSize: false },
  { size: 'small', width: 1440, theme: 'dark', boxBorderMode: true, inheritSize: true },
  { size: 'small', width: 390, theme: 'light', boxBorderMode: false, inheritSize: false },
  { size: 'large', width: 1440, theme: 'light', boxBorderMode: false, inheritSize: false },
  { size: 'large', width: 390, theme: 'dark', boxBorderMode: true, inheritSize: false }
] as const

for (const profile of profiles) {
  test(`表单预置控件占位 ${profile.size}/${profile.width}/${profile.theme} 加载前后保持实际尺寸和相邻布局`, async ({
    page
  }, info) => {
    await prepareIsolatedSession(page, { platformSuper: false })
    await prepareAppearance(page, profile)
    await page.setViewportSize({ width: profile.width, height: 900 })
    const errors: string[] = []
    const warnings: string[] = []
    const requests: string[] = []
    const held: Route[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (
        /maximum recursive updates|slot.+invoked outside|unhandled error during execution/i.test(
          message.text()
        )
      )
        warnings.push(message.text())
    })
    await page.route('**/src/components/core/forms/art-form/components.ts*', (route) => {
      requests.push(route.request().url())
      held.push(route)
    })
    await page.goto(
      `/tests/e2e/fixtures/art-form-values.html?placeholder-geometry=1&size=${profile.size}&theme=${profile.theme}&box=${profile.boxBorderMode ? 'border-mode' : 'shadow-mode'}${profile.inheritSize ? '&size-provider=1' : ''}`,
      { waitUntil: 'domcontentloaded' }
    )
    await assertAppearance(page, profile)
    await expect(page.getByRole('heading', { name: '表单控件加载布局', exact: true })).toBeVisible()
    const form = page.locator('.art-form')
    const submit = page.getByRole('button', { name: '保存布局表单', exact: true })
    const reset = page.getByRole('button', { name: '重置布局表单', exact: true })
    await expect.poll(() => requests.length).toBe(1)
    await expect(form.locator('.art-async-state[aria-busy="true"]')).toHaveCount(fields.length)
    await expect(page.getByTestId('placeholder-ready')).toHaveText('false')
    await expect(submit).toBeDisabled()
    await expect(reset).toBeDisabled()
    const originalForm = await form.elementHandle()
    const originalColumns = await form.locator('[data-art-form-item-key]').elementHandles()
    const originalValues = await page.getByTestId('placeholder-values').textContent()
    if (!originalForm || !originalValues) throw new Error('表单初始模型或DOM尚未挂载')
    await page.addStyleTag({ path: 'tests/e2e/visual-stability.css' })
    await settleLayout(page)
    const loading = await geometry(form, false)
    await page.screenshot({
      path: info.outputPath('control-placeholders-loading.png'),
      fullPage: true,
      animations: 'disabled'
    })
    for (const route of held.splice(0)) await route.continue()
    await expect(form.locator('.art-async-state')).toHaveCount(0)
    await expect(page.getByTestId('placeholder-ready')).toHaveText('true')
    await expect(submit).toBeEnabled()
    await expect(reset).toBeEnabled()
    await settleLayout(page)
    const loaded = await geometry(form, true)
    await page.screenshot({
      path: info.outputPath('control-placeholders-loaded.png'),
      fullPage: true,
      animations: 'disabled'
    })
    const geometryPath = info.outputPath('control-geometry.json')
    await writeFile(geometryPath, JSON.stringify({ profile, loading, loaded }, null, 2), 'utf8')
    await info.attach('actual-control-loading-geometry', {
      path: geometryPath,
      contentType: 'application/json'
    })
    for (const field of fields) {
      const before = loading.fields[field.key]
      const after = loaded.fields[field.key]
      expect
        .soft(Math.abs(before.content.height - after.content.height), `${field.key} 内容自然高度`)
        .toBeLessThanOrEqual(2)
      expect
        .soft(
          Math.abs(before.nativeContent.height - after.nativeContent.height),
          `${field.key} 原生内容高度`
        )
        .toBeLessThanOrEqual(2)
      expect
        .soft(Math.abs(before.control.height - after.control.height), `${field.key} 实际控件高度`)
        .toBeLessThanOrEqual(2)
      expect
        .soft(Math.abs(before.label.y - after.label.y), `${field.key} 标签位置`)
        .toBeLessThanOrEqual(2)
      if (before.nextLabelY !== null && after.nextLabelY !== null)
        expect
          .soft(Math.abs(before.nextLabelY - after.nextLabelY), `${field.key} 后续标签位置`)
          .toBeLessThanOrEqual(2)
      expect
        .soft(before.paintedTop, `${field.key} 加载图形顶部`)
        .toBeGreaterThanOrEqual(before.control.y - 2)
      expect
        .soft(before.paintedBottom, `${field.key} 加载图形底部`)
        .toBeLessThanOrEqual(before.control.bottom + 2)
      if (before.glyph || after.glyph) {
        expect(before.glyph, `${field.key} 加载复选框方块`).not.toBeNull()
        expect(after.glyph, `${field.key} 原生复选框方块`).not.toBeNull()
        expect(before.glyph?.bounds.width).toBe(after.glyph?.bounds.width)
        expect(before.glyph?.bounds.height).toBe(after.glyph?.bounds.height)
        expect(before.glyph?.radius).toBe(after.glyph?.radius)
      }
      expect(after.formItemSize, `${field.key} 真实表单尺寸上下文`).toBe(
        'formItemSize' in field ? field.formItemSize : profile.size
      )
      if (field.control !== '.el-textarea__inner')
        expect(after.controlSize, `${field.key} 真实控件尺寸`).toBe(
          'size' in field ? field.size : profile.size
        )
    }
    expect.soft(Math.abs(loading.actions.y - loaded.actions.y), '操作组位置').toBeLessThanOrEqual(2)
    for (const key of ['notes', 'longAlias']) {
      expect(loaded.fields[key].control.height, `${key} 保留多行控件高度`).toBeGreaterThanOrEqual(
        104
      )
      expect(loaded.fields[key].content.height).toBeGreaterThanOrEqual(104)
    }
    expect(await form.evaluate((current, original) => current === original, originalForm)).toBe(
      true
    )
    expect(originalColumns).toHaveLength(fields.length)
    for (const [index, field] of fields.entries())
      expect(
        await form
          .locator(`[data-art-form-item-key="${field.key}"]`)
          .evaluate((current, original) => current === original, originalColumns[index])
      ).toBe(true)
    await expect(page.getByTestId('placeholder-values')).toHaveText(originalValues)
    await expect(form.locator('[data-art-form-item-key="date"] input')).toHaveValue('2026-11-19')
    await expect(page.getByRole('checkbox', { name: '确认信息无误', exact: true })).toBeChecked()
    const name = page.getByRole('textbox', { name: '业务名称', exact: true })
    await name.fill('加载后继续编辑的名称')
    await submit.click()
    await expect(page.getByTestId('placeholder-submissions')).toHaveText('1')
    await expect(page.getByTestId('placeholder-output')).toContainText('加载后继续编辑的名称')
    await reset.click()
    await expect(page.getByTestId('placeholder-resets')).toHaveText('1')
    await expect(page.getByTestId('placeholder-values')).toHaveText(originalValues)
    expect(requests).toHaveLength(1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true
    )
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
  })
}

test('真实VMS配件使用混合表单加载保留短控件与备注自然高度', async ({ page }, info) => {
  await prepareIsolatedSession(page, {
    tenantId: '11111111-1111-4111-8111-111111111111',
    platformSuper: true
  })
  const appearance = { theme: 'light', boxBorderMode: false } as const
  await prepareAppearance(page, appearance)
  await page.setViewportSize({ width: 1440, height: 900 })
  const errors: string[] = []
  const warnings: string[] = []
  const requests: string[] = []
  const held: Route[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (
      /maximum recursive updates|slot.+invoked outside|unhandled error during execution/i.test(
        message.text()
      )
    )
      warnings.push(message.text())
  })
  await page.route('**/src/components/core/forms/art-form/components.ts*', (route) => {
    requests.push(route.request().url())
    held.push(route)
  })
  await page.goto('/tests/e2e/fixtures/form-standard-transport.html?entry=part-usage&theme=light', {
    waitUntil: 'domcontentloaded'
  })
  await assertAppearance(page, appearance)
  await page.getByRole('button', { name: '打开真实业务入口', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '编辑零部件使用记录', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.art-dialog__viewport')).toHaveAttribute('aria-busy', 'false')
  await expect.poll(() => requests.length).toBe(1)
  await page.addStyleTag({ path: 'tests/e2e/visual-stability.css' })
  const partTab = dialog.getByRole('tab', { name: '零部件信息', exact: true })
  const usageTab = dialog.getByRole('tab', { name: '零部件使用', exact: true })
  const inputFields = [{ key: 'companyName', control: '.el-input__wrapper' }] as const
  const usageFields = [
    { key: 'serviceMileageEnabled', control: '.el-checkbox' },
    { key: 'serviceMileage', control: '.el-input-number' },
    { key: 'usedMileage', control: '.el-input-number' },
    { key: 'remark', control: '.el-textarea__inner' }
  ] as const
  const businessKeys = ['companyName', ...usageFields.map(({ key }) => key)]
  const footerSelector = '.art-dialog__footer-actions'
  await partTab.click()
  await settleLayout(page)
  const loadingInput = await geometry(dialog, false, inputFields, footerSelector)
  await usageTab.click()
  await settleLayout(page)
  const loadingUsage = await geometry(dialog, false, usageFields, footerSelector)
  const originalColumns = await Promise.all(
    businessKeys.map((key) => dialog.locator(`[data-art-form-item-key="${key}"]`).elementHandle())
  )
  await page.screenshot({
    path: info.outputPath('real-part-usage-loading.png'),
    fullPage: true,
    animations: 'disabled'
  })
  for (const route of held.splice(0)) await route.continue()
  await expect(dialog.locator('.art-form .art-async-state')).toHaveCount(0)
  await settleLayout(page)
  const loadedUsage = await geometry(dialog, true, usageFields, footerSelector)
  await page.screenshot({
    path: info.outputPath('real-part-usage-loaded.png'),
    fullPage: true,
    animations: 'disabled'
  })
  await expect(
    dialog.locator('[data-art-form-item-key="serviceMileageEnabled"] input')
  ).toBeChecked()
  await expect(
    dialog.locator('[data-art-form-item-key="serviceYearsEnabled"] input')
  ).not.toBeChecked()
  await expect(dialog.locator('[data-art-form-item-key="serviceMileage"] input')).toHaveValue(
    '10000'
  )
  await expect(dialog.locator('[data-art-form-item-key="usedMileage"] input')).toHaveValue('0')
  await expect(dialog.locator('[data-art-form-item-key="remark"] textarea')).toHaveValue('验收备注')
  expect(loadedUsage.fields.remark.control.height).toBeGreaterThanOrEqual(104)
  await expect(dialog.locator('[data-art-form-item-key="enableDate"]')).toHaveCount(0)
  await partTab.click()
  await settleLayout(page)
  const loadedInput = await geometry(dialog, true, inputFields, footerSelector)
  await expect(dialog.locator('[data-art-form-item-key="companyName"] input')).toHaveValue(
    '验收运输公司'
  )
  const report = { loadingInput, loadingUsage, loadedInput, loadedUsage }
  const geometryPath = info.outputPath('real-part-usage-geometry.json')
  await writeFile(geometryPath, JSON.stringify(report, null, 2), 'utf8')
  await info.attach('real-part-usage-control-geometry', {
    path: geometryPath,
    contentType: 'application/json'
  })
  for (const [loading, loaded] of [
    [loadingInput, loadedInput],
    [loadingUsage, loadedUsage]
  ]) {
    for (const key of Object.keys(loading.fields)) {
      const before = loading.fields[key]
      const after = loaded.fields[key]
      expect
        .soft(Math.abs(before.content.height - after.content.height), `${key} 业务内容自然高度`)
        .toBeLessThanOrEqual(2)
      expect
        .soft(
          Math.abs(before.nativeContent.height - after.nativeContent.height),
          `${key} 业务原生内容高度`
        )
        .toBeLessThanOrEqual(2)
      expect
        .soft(Math.abs(before.control.height - after.control.height), `${key} 业务控件高度`)
        .toBeLessThanOrEqual(2)
      // Other presets in this mixed form keep their own loading shapes, so compare the field's local label gap.
      expect
        .soft(
          Math.abs(before.content.y - before.label.bottom - (after.content.y - after.label.bottom)),
          `${key} 字段内标签间距`
        )
        .toBeLessThanOrEqual(2)
    }
  }
  for (const [index, key] of businessKeys.entries()) {
    const original = originalColumns[index]
    if (!original) throw new Error(`${key} 的原始业务字段尚未挂载`)
    expect(
      await dialog
        .locator(`[data-art-form-item-key="${key}"]`)
        .evaluate((current, old) => current === old, original)
    ).toBe(true)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true
  )
  expect(requests).toHaveLength(1)
  expect(errors).toEqual([])
  expect(warnings).toEqual([])
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(dialog).toBeHidden()
})

const nativeFields = [
  { key: 'autocomplete', control: '.el-autocomplete', group: false },
  { key: 'number', control: '.el-input-number', group: false },
  { key: 'select', control: '.el-select', group: false },
  { key: 'selectV2', control: '.el-select', group: false },
  { key: 'timeSelect', control: '.el-select', group: false },
  { key: 'treeSelect', control: '.el-select', group: false },
  { key: 'radio', control: '.el-radio', group: false },
  { key: 'switch', control: '.el-switch', group: false },
  { key: 'rate', control: '.el-rate', group: false },
  { key: 'slider', control: '.el-slider', group: false },
  { key: 'colorPicker', control: '.el-color-picker', group: false },
  { key: 'segment', control: '.el-segmented', group: false },
  { key: 'radioGroup', control: '.el-radio-group', group: true },
  { key: 'checkboxGroup', control: '.el-checkbox-group', group: true }
] as const

async function nativeInventory(form: Locator, loaded: boolean) {
  return form.evaluate(
    (root, { fields, loaded }) => {
      const bounds = (element: Element) => {
        const rect = element.getBoundingClientRect()
        return {
          x: rect.x + scrollX,
          y: rect.y + scrollY,
          width: rect.width,
          height: rect.height,
          bottom: rect.bottom + scrollY
        }
      }
      return Object.fromEntries(
        fields.map((field) => {
          const column = root.querySelector(`[data-art-form-item-key="${field.key}"]`)
          const content = column?.querySelector('.art-form-item__content')
          const nativeContent = column?.querySelector('.el-form-item__content')
          const control = column?.querySelector(loaded ? field.control : '.art-async-state')
          const item = column?.querySelector('.el-form-item')
          const label = column?.querySelector('.el-form-item__label')
          const registry = document.querySelector(`[data-native-field-key="${field.key}"]`)
          if (!column || !content || !nativeContent || !control || !item || !label || !registry)
            throw new Error(`${field.key} 的原生形状尚未就绪`)
          const controlBounds = bounds(control)
          const nativeBounds = bounds(nativeContent)
          const style = getComputedStyle(control)
          const wrapper = control.matches('.el-input__wrapper, .el-select__wrapper')
            ? control
            : control.querySelector('.el-input__wrapper, .el-select__wrapper')
          const choices =
            field.group && loaded
              ? [
                  ...control.querySelectorAll(
                    '.el-radio, .el-checkbox, .el-radio-button, .el-checkbox-button'
                  )
                ].map(bounds)
              : []
          const registeredInputIds = (registry.getAttribute('data-input-ids') ?? '')
            .split(/\s+/)
            .filter(Boolean)
          const labelFor = label.getAttribute('for')
          const decorative = control.querySelector('.art-form-control-skeleton')
          return [
            field.key,
            {
              rootClasses: control.className,
              nativeSizeClasses: [control, ...control.querySelectorAll('*')].flatMap((node) =>
                [...node.classList].filter((value) =>
                  /^el-[\w-]+--(small|default|large)$/.test(value)
                )
              ),
              wrapper: wrapper ? bounds(wrapper) : null,
              choices,
              accessibility: {
                registeredInputIds,
                labelId: registry.getAttribute('data-label-id'),
                declaredFor: registry.getAttribute('data-declared-for'),
                visibleLabelId: label.id,
                labelTag: label.tagName,
                labelFor,
                itemRole: item.getAttribute('role'),
                itemLabelledBy: item.getAttribute('aria-labelledby'),
                controlLabelledBy: control.getAttribute('aria-labelledby'),
                inputTargets: registeredInputIds.map((id) => {
                  const target = document.getElementById(id)
                  return {
                    id,
                    insideField: Boolean(target && column.contains(target)),
                    decorative: Boolean(target?.closest('.art-form-control-skeleton'))
                  }
                }),
                labelForInsideField: labelFor
                  ? Boolean(
                      document.getElementById(labelFor) &&
                      column.contains(document.getElementById(labelFor))
                    )
                  : null,
                ghost: decorative
                  ? {
                      inert: decorative.hasAttribute('inert'),
                      hidden: decorative.getAttribute('aria-hidden'),
                      controlsDisabled: [
                        ...decorative.querySelectorAll('input,button,select,textarea')
                      ].every((node) => 'disabled' in node && node.disabled === true)
                    }
                  : null
              },
              baseline: {
                display: style.display,
                verticalAlign: style.verticalAlign,
                controlLineHeight: style.lineHeight,
                contentLineHeight: getComputedStyle(content).lineHeight,
                nativeLineHeight: getComputedStyle(nativeContent).lineHeight,
                topInset: controlBounds.y - nativeBounds.y,
                bottomInset: nativeBounds.bottom - controlBounds.bottom,
                centerOffset:
                  controlBounds.y +
                  controlBounds.height / 2 -
                  nativeBounds.y -
                  nativeBounds.height / 2
              }
            }
          ] as const
        })
      )
    },
    { fields: nativeFields, loaded }
  )
}

for (const profile of [
  {
    size: 'default',
    width: 1440,
    theme: 'light',
    boxBorderMode: false,
    inheritSize: false,
    emptySize: false
  },
  {
    size: 'small',
    width: 390,
    theme: 'dark',
    boxBorderMode: true,
    inheritSize: true,
    emptySize: false
  },
  {
    size: 'large',
    width: 390,
    theme: 'light',
    boxBorderMode: false,
    inheritSize: false,
    emptySize: false
  },
  {
    size: 'default',
    width: 1440,
    theme: 'light',
    boxBorderMode: false,
    inheritSize: false,
    emptySize: true
  }
] as const) {
  test(`原生控件占位清单 ${profile.emptySize ? 'empty' : profile.size}/${profile.width}/${profile.theme} 记录形状与多行选项`, async ({
    page
  }, info) => {
    await prepareIsolatedSession(page, { platformSuper: false })
    await prepareAppearance(page, profile)
    await page.setViewportSize({ width: profile.width, height: 900 })
    const errors: string[] = [],
      warnings: string[] = [],
      requests: string[] = []
    const held: Route[] = []
    let registryMode: 'hold' | 'ready' | 'fail' = 'hold'
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (
        /maximum recursive updates|slot.+invoked outside|unhandled error during execution/i.test(
          message.text()
        )
      )
        warnings.push(message.text())
    })
    await page.route('**/src/components/core/forms/art-form/components.ts*', (route) => {
      requests.push(route.request().url())
      if (registryMode === 'fail')
        return route.fulfill({ status: 503, contentType: 'text/javascript', body: 'unavailable' })
      if (registryMode === 'ready') return route.continue()
      held.push(route)
    })
    await page.goto(
      `/tests/e2e/fixtures/art-form-values.html?placeholder-native=1&size=${profile.size}&theme=${profile.theme}&box=${profile.boxBorderMode ? 'border-mode' : 'shadow-mode'}${profile.inheritSize ? '&size-provider=1' : ''}${profile.emptySize ? '&size-empty=1' : ''}`,
      { waitUntil: 'domcontentloaded' }
    )
    await assertAppearance(page, profile)
    const form = page.locator('.art-form')
    const submit = page.getByRole('button', { name: '保存原生形状', exact: true })
    const reset = page.getByRole('button', { name: '重置原生形状', exact: true })
    await expect(
      page.getByRole('heading', { name: '原生控件占位形状清单', exact: true })
    ).toBeVisible()
    await expect.poll(() => requests.length).toBe(1)
    await expect(form.locator('.art-async-state[aria-busy="true"]')).toHaveCount(
      nativeFields.length
    )
    await expect(page.getByTestId('native-placeholder-ready')).toHaveText('false')
    await expect(page.getByTestId('native-field-registry')).toHaveAttribute(
      'data-field-count',
      String(nativeFields.length)
    )
    await expect(submit).toBeDisabled()
    await expect(reset).toBeDisabled()
    const originalForm = await form.elementHandle()
    const originalColumns = await form.locator('[data-art-form-item-key]').elementHandles()
    const originalValues = await page.getByTestId('native-placeholder-values').textContent()
    if (!originalForm || !originalValues) throw new Error('原生清单初始模型或DOM尚未挂载')
    await page.addStyleTag({ path: 'tests/e2e/visual-stability.css' })
    await settleLayout(page)
    const loading = await geometry(form, false, nativeFields)
    const loadingNative = await nativeInventory(form, false)
    await expect(form.getByRole('radio')).toHaveCount(0)
    await expect(form.getByRole('checkbox')).toHaveCount(0)
    const loadingHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth
    )
    expect(loadingHorizontalOverflow).toBeLessThanOrEqual(1)
    await page.screenshot({
      path: info.outputPath('native-controls-loading.png'),
      fullPage: true,
      animations: 'disabled'
    })
    registryMode = 'ready'
    for (const route of held.splice(0)) await route.continue()
    await expect(form.locator('.art-async-state')).toHaveCount(0)
    await expect(page.getByTestId('native-placeholder-ready')).toHaveText('true')
    await expect(submit).toBeEnabled()
    await expect(reset).toBeEnabled()
    await settleLayout(page)
    const loaded = await geometry(form, true, nativeFields)
    const loadedNative = await nativeInventory(form, true)
    const loadedHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth
    )
    expect(loadedHorizontalOverflow).toBeLessThanOrEqual(1)
    const groupRows = Object.fromEntries(
      nativeFields
        .filter((field) => field.group)
        .map(
          (field) =>
            [
              field.key,
              uniq(loadedNative[field.key].choices.map((choice) => Math.round(choice.y))).length
            ] as const
        )
    )
    const geometryPath = info.outputPath('native-control-geometry.json')
    await writeFile(
      geometryPath,
      JSON.stringify(
        {
          profile,
          loading,
          loaded,
          loadingNative,
          loadedNative,
          groupRows,
          loadingHorizontalOverflow,
          loadedHorizontalOverflow,
          actionsDelta: loaded.actions.y - loading.actions.y,
          actionsPolicy:
            'All plain-label fields, including wrapping choice groups, must preserve the action group position.',
          sizeSource: profile.emptySize ? 'none' : profile.inheritSize ? 'ConfigProvider' : 'Form',
          checkboxGroupOptionType: profile.emptySize ? 'button' : 'default',
          sizeOverrides: {
            number: profile.size === 'large' ? 'props.small' : null,
            segment: profile.size === 'large' ? 'props.small' : null,
            selectV2: profile.size === 'small' ? 'formItem.large' : null
          }
        },
        null,
        2
      ),
      'utf8'
    )
    await info.attach('native-control-loading-geometry', {
      path: geometryPath,
      contentType: 'application/json'
    })
    await page.screenshot({
      path: info.outputPath('native-controls-loaded.png'),
      fullPage: true,
      animations: 'disabled'
    })

    for (const field of nativeFields) {
      const before = loading.fields[field.key],
        after = loaded.fields[field.key]
      const pendingIds = loadingNative[field.key].accessibility
      const liveIds = loadedNative[field.key].accessibility
      expect(pendingIds.registeredInputIds, `${field.key} 装饰控件不得注册字段inputId`).toEqual([])
      expect(pendingIds.labelFor, `${field.key} 加载标签不得指向装饰控件`).toBeNull()
      expect(pendingIds.labelTag).toBe('DIV')
      expect(pendingIds.ghost).toEqual({ inert: true, hidden: 'true', controlsDisabled: true })
      expect(liveIds.ghost).toBeNull()
      expect(liveIds.labelId, `${field.key} 保留同一原生字段labelId`).toBe(pendingIds.labelId)
      expect(liveIds.visibleLabelId).toBe(liveIds.labelId)
      const expectedFor =
        liveIds.declaredFor ||
        (liveIds.registeredInputIds.length === 1 ? liveIds.registeredInputIds[0] : null)
      expect(liveIds.labelFor, `${field.key} 原生label-for契约`).toBe(expectedFor)
      expect(liveIds.labelTag).toBe(expectedFor ? 'LABEL' : 'DIV')
      if (expectedFor) expect(liveIds.labelForInsideField).toBe(true)
      else {
        expect(liveIds.itemRole).toBe('group')
        expect(liveIds.itemLabelledBy).toBe(liveIds.labelId)
      }
      for (const target of liveIds.inputTargets) {
        expect(target.insideField, `${field.key} 已注册ID必须属于当前真实字段`).toBe(true)
        expect(target.decorative).toBe(false)
      }
      if (['radioGroup', 'checkboxGroup', 'segment'].includes(field.key)) {
        expect(liveIds.registeredInputIds).toHaveLength(1)
        expect(liveIds.controlLabelledBy?.split(/\s+/)).toContain(liveIds.labelId)
      }
      // Installed ElRadio uses its enclosing label and does not register an inputId.
      if (field.key === 'radio') expect(liveIds.registeredInputIds).toEqual([])
      expect(after.control.height, `${field.key} 真实控件自然高度`).toBeGreaterThan(0)
      if (field.group) {
        expect(loadedNative[field.key].choices).toHaveLength(3)
        if (profile.width === 390)
          expect(groupRows[field.key], `${field.key} 窄屏保持多行`).toBeGreaterThan(1)
        for (const choice of loadedNative[field.key].choices) {
          expect(choice.x).toBeGreaterThanOrEqual(after.content.x - 1)
          expect(choice.x + choice.width).toBeLessThanOrEqual(
            after.content.x + after.content.width + 1
          )
          expect(choice.y).toBeGreaterThanOrEqual(after.control.y - 1)
          expect(choice.bottom).toBeLessThanOrEqual(after.control.bottom + 1)
        }
      }
      for (const [part, delta] of [
        ['内容自然高度', before.content.height - after.content.height],
        ['原生内容高度', before.nativeContent.height - after.nativeContent.height],
        ['根控件高度', before.control.height - after.control.height],
        ['标签位置', before.label.y - after.label.y],
        [
          'wrapper顶部间距',
          loadingNative[field.key].baseline.topInset - loadedNative[field.key].baseline.topInset
        ],
        [
          'wrapper底部间距',
          loadingNative[field.key].baseline.bottomInset -
            loadedNative[field.key].baseline.bottomInset
        ]
      ] as const)
        expect.soft(Math.abs(delta), `${field.key} ${part}`).toBeLessThanOrEqual(2)
      if (before.nextLabelY !== null && after.nextLabelY !== null)
        expect
          .soft(Math.abs(before.nextLabelY - after.nextLabelY), `${field.key} 下个标签位置`)
          .toBeLessThanOrEqual(2)
    }
    expect
      .soft(Math.abs(loaded.actions.y - loading.actions.y), '所有原生控件与选项组的操作区位置')
      .toBeLessThanOrEqual(2)
    // Native families may use different size policies; keep actual classes instead of assuming one height.
    if (profile.size === 'large') {
      expect(loadedNative.number.nativeSizeClasses).toContain('el-input-number--small')
      expect(loadedNative.segment.nativeSizeClasses).toContain('el-segmented--small')
    }
    if (profile.size === 'small') expect(loaded.fields.selectV2.formItemSize).toBe('large')
    if (profile.size === 'default')
      expect(loaded.fields.select.control.height, '空size与显式default保留原生选择器尺寸差异').toBe(
        profile.emptySize ? 32 : 36
      )
    expect(await form.evaluate((current, original) => current === original, originalForm)).toBe(
      true
    )
    expect(originalColumns).toHaveLength(nativeFields.length)
    for (const [index, field] of nativeFields.entries())
      expect(
        await form
          .locator(`[data-art-form-item-key="${field.key}"]`)
          .evaluate((current, original) => current === original, originalColumns[index])
      ).toBe(true)
    await expect(page.getByTestId('native-placeholder-values')).toHaveText(originalValues)
    const column = (key: string) => form.locator(`[data-art-form-item-key="${key}"]`)
    await expect(column('autocomplete').locator('input')).toHaveValue('验收设备')
    await expect(column('number').locator('input')).toHaveValue('7')
    await expect(
      column('select').locator('.el-select__selected-item').filter({ hasText: '华东区域' })
    ).toBeVisible()
    await expect(
      column('selectV2').locator('.el-select__selected-item').filter({ hasText: '西部区域' })
    ).toBeVisible()
    await expect(column('timeSelect')).toContainText('09:30')
    await expect(column('treeSelect')).toContainText('一号库位')
    await expect(column('radio').locator('input')).toBeChecked()
    await expect(column('switch').getByRole('switch')).toBeChecked()
    await expect(column('rate').locator('.el-rate')).toHaveAttribute('aria-valuenow', '3')
    await expect(column('slider').getByRole('slider')).toHaveAttribute('aria-valuenow', '35')
    await expect(column('colorPicker').locator('.el-color-picker__color-inner')).toHaveCSS(
      'background-color',
      'rgb(64, 158, 255)'
    )
    await expect(column('segment').getByRole('radio', { name: '每日', exact: true })).toBeChecked()
    await expect(
      column('radioGroup').getByRole('radio', { name: '华东仓储运输调度中心', exact: true })
    ).toBeChecked()
    await expect(column('checkboxGroup').locator('input:checked')).toHaveCount(2)
    await column('autocomplete').locator('input').fill('加载后设备')
    await submit.click()
    await expect(page.getByTestId('native-placeholder-submissions')).toHaveText('1')
    await expect(page.getByTestId('native-placeholder-output')).toContainText('加载后设备')
    await reset.click()
    await expect(page.getByTestId('native-placeholder-resets')).toHaveText('1')
    await expect(page.getByTestId('native-placeholder-values')).toHaveText(originalValues)
    expect(requests).toHaveLength(1)

    if (profile.size === 'default' && !profile.emptySize) {
      registryMode = 'fail'
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expect(form.getByText('表单控件加载失败，请重试', { exact: true })).toHaveCount(
        nativeFields.length
      )
      await expect(page.getByTestId('native-placeholder-ready')).toHaveText('false')
      await expect(submit).toBeDisabled()
      await expect(reset).toBeDisabled()
      await expect(page.getByTestId('native-placeholder-values')).toHaveText(originalValues)
      await page.screenshot({
        path: info.outputPath('native-controls-error.png'),
        fullPage: true,
        animations: 'disabled'
      })
      registryMode = 'ready'
      await form.getByRole('button', { name: '重新加载', exact: true }).first().click()
      await expect(form.locator('.art-async-state')).toHaveCount(0)
      await expect(page.getByTestId('native-placeholder-ready')).toHaveText('true')
      await expect(submit).toBeEnabled()
      await expect(reset).toBeEnabled()
      await expect(page.getByTestId('native-placeholder-values')).toHaveText(originalValues)
      expect(requests).toHaveLength(3)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true
    )
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
  })
}
