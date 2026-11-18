import { expect, test, type Locator, type Page, type Request } from '@playwright/test'
import { assertAppearance, prepareAppearance } from './support/appearance'
import { compareShadowPaint, shadowPaintRegion } from './support/shadow-paint'
import {
  expectQueryDateRangeReadable,
  expectStackedQueryRangeAligned,
  installQueryDateClock,
  selectQueryDateRange
} from './support/query-date-range'
test.use({ storageState: { cookies: [], origins: [] } })
test.describe.configure({ timeout: 120_000 })

async function setFixtureTheme(page: Page, dark: boolean) {
  await page.evaluate(async (dark) => {
    const { useTheme }: typeof import('../../src/hooks/core/useTheme') = await import(
      new URL('/src/hooks/core/useTheme.ts', location.origin).href
    )
    const { SystemThemeEnum }: typeof import('../../src/enums/app-enum') = await import(
      new URL('/src/enums/app-enum.ts', location.origin).href
    )
    useTheme().switchThemeStyles(dark ? SystemThemeEnum.DARK : SystemThemeEnum.LIGHT)
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    )
  }, dark)
}

test('客户识别页签卡片外侧阴影在普通全屏和专注模式完整绘制', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-1440')
  test.slow()
  const customer = {
    id: '11111111-1111-4111-8111-111111111112',
    tenantId: '11111111-1111-4111-8111-111111111111',
    customerCode: 'KH-PAINT-01',
    customerName: '客户识别卡片绘制验收客户',
    remark: '客户识别页签下方的原有业务备注',
    enabled: true,
    tags: [],
    fieldAccess: {}
  }
  const writes: string[] = []
  const errors: string[] = []
  const pendingApi = new Set<Request>()
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/rest/v1/')) pendingApi.add(request)
  })
  page.on('requestfinished', (request) => pendingApi.delete(request))
  page.on('requestfailed', (request) => pendingApi.delete(request))
  page.on('pageerror', (error) => errors.push(error.message))
  for (const appearance of [
    { width: 1440, theme: 'light', boxBorderMode: false },
    { width: 390, theme: 'dark', boxBorderMode: false }
  ] as const) {
    await page.setViewportSize({ width: appearance.width, height: 900 })
    await prepareAppearance(page, appearance)
    await page.route('**/rest/v1/**', (route) => {
      const request = route.request()
      const name = new URL(request.url()).pathname.split('/').at(-1) ?? ''
      if (request.method() !== 'GET' && name.startsWith('tms_') && !/^tms_(?:list|get)_/.test(name))
        writes.push(name)
      if (name === 'tms_list_customers_secure')
        return route.fulfill({ json: { records: [customer], total: 1, fieldAccess: {} } })
      if (name === 'get_table_column_runtime')
        return route.fulfill({ json: { enabled: false, profiles: [] } })
      return route.fulfill({ json: [] })
    })
    await page.goto('/tests/e2e/fixtures/tms-customer-workspace.html', {
      waitUntil: 'domcontentloaded'
    })
    await assertAppearance(page, appearance)
    await page.getByText(customer.customerName, { exact: true }).first().click()
    const dialog = page.getByRole('dialog', { name: '编辑客户', exact: true })
    const baseTab = dialog.getByRole('tab', { name: '客户识别', exact: true })
    const card = dialog.locator('.art-form__tabs--overlay').first()
    const name = card.locator('[data-art-form-item-key="customerName"] input')
    const remark = card.locator('[data-art-form-item-key="remark"] textarea')
    const save = dialog.getByRole('button', { name: '保存客户', exact: true })
    const inspect = () =>
      card.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        const cardRect = {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height
        }
        const ancestors = []
        for (let node = element.parentElement; node; node = node.parentElement) {
          const style = getComputedStyle(node)
          const bounds = node.getBoundingClientRect()
          const sx = node.offsetWidth ? bounds.width / node.offsetWidth : 1
          const sy = node.offsetHeight ? bounds.height / node.offsetHeight : 1
          let left = bounds.left + node.clientLeft * sx
          let top = bounds.top + node.clientTop * sy
          let right = left + node.clientWidth * sx
          let bottom = top + node.clientHeight * sy
          const bothClip = style.overflowX === 'clip' && style.overflowY === 'clip'
          const rawMargin = style.getPropertyValue('overflow-clip-margin')
          const margin = bothClip ? Number(rawMargin.match(/([\d.]+)px/)?.[1] ?? 0) : 0
          if (bothClip && rawMargin.includes('border-box')) {
            left = bounds.left
            right = bounds.right
            top = bounds.top
            bottom = bounds.bottom
          } else if (bothClip && rawMargin.includes('content-box')) {
            left += parseFloat(style.paddingLeft) * sx
            right -= parseFloat(style.paddingRight) * sx
            top += parseFloat(style.paddingTop) * sy
            bottom -= parseFloat(style.paddingBottom) * sy
          }
          const paintContain = /(^|\s)(paint|strict|content)(\s|$)/.test(style.contain)
          const clipX =
            paintContain || ['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowX)
          const clipY =
            paintContain || ['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowY)
          const clipLeft = left - margin * sx
          const clipRight = right + margin * sx
          const clipTop = top - margin * sy
          const clipBottom = bottom + margin * sy
          ancestors.push({
            tag: node.tagName,
            className: node.className,
            rect: {
              left: bounds.left,
              right: bounds.right,
              top: bounds.top,
              bottom: bounds.bottom,
              width: bounds.width,
              height: bounds.height
            },
            scaleX: sx,
            scaleY: sy,
            overflowX: style.overflowX,
            overflowY: style.overflowY,
            overflowClipMargin: rawMargin,
            appliedClipMargin: margin,
            contain: style.contain,
            clipPath: style.clipPath,
            maskImage: style.maskImage,
            legacyClip: style.clip,
            transform: style.transform,
            clipX,
            clipY,
            clipLeft,
            clipRight,
            clipTop,
            clipBottom,
            leftRoom: cardRect.left - clipLeft,
            rightRoom: clipRight - cardRect.right,
            scrollTop: node.scrollTop,
            scrollLeft: node.scrollLeft,
            clientWidth: node.clientWidth,
            clientHeight: node.clientHeight,
            scrollWidth: node.scrollWidth,
            scrollHeight: node.scrollHeight
          })
        }
        const clipY = ancestors.filter((ancestor) => ancestor.clipY)
        const top = Math.ceil(
          Math.max(6, cardRect.top + 24, ...clipY.map((ancestor) => ancestor.clipTop + 6))
        )
        const bottom = Math.floor(
          Math.min(
            innerHeight - 6,
            cardRect.bottom - 24,
            ...clipY.map((ancestor) => ancestor.clipBottom - 6)
          )
        )
        const left = {
          x: Math.ceil(cardRect.left - 6),
          y: top,
          width: Math.floor(cardRect.left - 2) - Math.ceil(cardRect.left - 6),
          height: bottom - top
        }
        const right = {
          x: Math.ceil(cardRect.right + 2),
          y: top,
          width: Math.floor(cardRect.right + 6) - Math.ceil(cardRect.right + 2),
          height: bottom - top
        }
        return {
          cardRect,
          ancestors,
          stripes: [left, right],
          region: {
            x: left.x,
            y: top,
            width: right.x + right.width - left.x,
            height: bottom - top
          },
          shadow: getComputedStyle(element).boxShadow,
          viewport: { width: innerWidth, height: innerHeight }
        }
      })
    const capture = async (stage: string) => {
      const prefix = `customer-card-${appearance.width}-${appearance.theme}-${stage}`
      await expect(baseTab).toHaveAttribute('aria-selected', 'true')
      await expect(dialog.locator('.art-dialog__viewport')).toHaveAttribute('aria-busy', 'false')
      await expect(name).toHaveValue(customer.customerName)
      await expect(remark).toHaveValue(customer.remark)
      await expect(
        card.locator('[data-art-form-item-key="parentUnitId"]').getByRole('combobox')
      ).toBeEnabled()
      await expect(card.locator('.el-skeleton:visible')).toHaveCount(0)
      await expect(card.locator('.art-overlay-loading:visible')).toHaveCount(0)
      await expect(card.locator('[aria-busy="true"]:visible')).toHaveCount(0)
      await expect.poll(() => pendingApi.size).toBe(0)
      await card.evaluate((element) => {
        const scrollport = element.closest('.el-scrollbar__wrap')!
        scrollport.scrollTop = 0
        scrollport.scrollLeft = 0
      })
      await dialog.evaluate(async (element) => {
        await Promise.allSettled(
          element
            .getAnimations({ subtree: true })
            .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
            .map((animation) => animation.finished)
        )
        await document.fonts.ready
      })
      const settled = await card.evaluate(async (element) => {
        const sample = () => {
          const nodes = [element, ...element.querySelectorAll('[data-art-form-item-key]')]
          const fields = nodes
            .map((node) => {
              const rect = node.getBoundingClientRect()
              return {
                key: node.getAttribute('data-art-form-item-key'),
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height,
                scrollWidth: node.scrollWidth,
                scrollHeight: node.scrollHeight
              }
            })
            .filter((field) => field.width > 0 && field.height > 0)
          const ancestors = []
          for (let node = element.parentElement; node; node = node.parentElement) {
            const rect = node.getBoundingClientRect()
            ancestors.push({
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
              scrollTop: node.scrollTop,
              scrollLeft: node.scrollLeft,
              scrollWidth: node.scrollWidth,
              scrollHeight: node.scrollHeight
            })
          }
          return { fields, ancestors }
        }
        const deadline = performance.now() + 10_000
        let previous = ''
        let stableFrames = 0
        let frames = 0
        while (performance.now() < deadline) {
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
          frames++
          const layout = sample()
          const signature = JSON.stringify(layout)
          stableFrames = signature === previous ? stableFrames + 1 : 0
          if (stableFrames >= 4) return { frames, stableFrames, layout }
          previous = signature
        }
        throw new Error(
          'Customer fields and ancestor layout did not settle across animation frames'
        )
      })
      const actualGeometry = await inspect()
      const region = shadowPaintRegion(actualGeometry.stripes)
      expect(region).toEqual(actualGeometry.region)
      expect(region.x).toBeGreaterThanOrEqual(0)
      expect(region.y).toBeGreaterThanOrEqual(0)
      expect(region.x + region.width).toBeLessThanOrEqual(appearance.width)
      expect(region.y + region.height).toBeLessThanOrEqual(900)
      expect(region.height).toBeGreaterThan(32)
      for (const stripe of actualGeometry.stripes) expect(stripe.width).toBeGreaterThan(0)
      const screenshot = (suffix: string) =>
        page.screenshot({
          path: info.outputPath(`${prefix}-${suffix}.png`),
          clip: region,
          animations: 'disabled',
          caret: 'hide',
          scale: 'css'
        })
      const actual = await screenshot('actual')
      const repeat = await screenshot('actual-repeat')
      const afterActualGeometry = await inspect()
      const original = await card.evaluate((element) => ({
        form: element.closest('.art-form--overlay-tabs-only')!.getAttribute('style'),
        card: element.getAttribute('style')
      }))
      const reference = await (async () => {
        try {
          await card.evaluate((element) => {
            element
              .closest<HTMLElement>('.art-form--overlay-tabs-only')!
              .style.setProperty('overflow', 'visible', 'important')
          })
          const geometry = await inspect()
          const paint = await screenshot('reference')
          await card.evaluate((element) => {
            ;(element as HTMLElement).style.setProperty('box-shadow', 'none', 'important')
          })
          const backgroundGeometry = await inspect()
          const background = await screenshot('no-shadow-background')
          return { geometry, paint, background, backgroundGeometry }
        } finally {
          await card.evaluate((element, saved) => {
            const form = element.closest('.art-form--overlay-tabs-only')!
            if (saved.form === null) form.removeAttribute('style')
            else form.setAttribute('style', saved.form)
            if (saved.card === null) element.removeAttribute('style')
            else element.setAttribute('style', saved.card)
          }, original)
        }
      })()
      const restoredGeometry = await inspect()
      const restoredStyles = await card.evaluate((element) => ({
        form: element.closest('.art-form--overlay-tabs-only')!.getAttribute('style'),
        card: element.getAttribute('style')
      }))
      const stability = compareShadowPaint(actual, repeat, region, actualGeometry.stripes)
      const paint = compareShadowPaint(actual, reference.paint, region, actualGeometry.stripes)
      const visibleShadow = compareShadowPaint(
        reference.paint,
        reference.background,
        region,
        actualGeometry.stripes
      )
      await info.attach(`${prefix}-paint-proof`, {
        body: JSON.stringify(
          {
            actualGeometry,
            afterActualGeometry,
            settled,
            pendingApi: pendingApi.size,
            referenceGeometry: reference.geometry,
            backgroundGeometry: reference.backgroundGeometry,
            restoredGeometry,
            originalStyles: original,
            restoredStyles,
            stability,
            paint,
            visibleShadow
          },
          null,
          2
        ),
        contentType: 'application/json'
      })
      expect
        .soft(stability.maxChannelDelta, `${prefix}: consecutive actual stripes must be stable`)
        .toBeLessThanOrEqual(1)
      expect.soft(restoredStyles, `${prefix}: temporary inline styles restored`).toEqual(original)
      expect
        .soft(actualGeometry.shadow, `${prefix}: actual card must have a shadow`)
        .not.toBe('none')
      expect
        .soft(
          visibleShadow.changedPixels,
          `${prefix}: reference stripes must contain visible shadow`
        )
        .toBeGreaterThan(0)
      expect
        .soft(paint.maxChannelDelta, `${prefix}: actual and unclipped reference stripes must match`)
        .toBeLessThanOrEqual(1)
      for (const ancestor of actualGeometry.ancestors) {
        if (ancestor.clipX) {
          expect
            .soft(
              ancestor.leftRoom,
              `${prefix}: ${ancestor.tag}.${ancestor.className} left paint room`
            )
            .toBeGreaterThanOrEqual(5.5)
          expect
            .soft(
              ancestor.rightRoom,
              `${prefix}: ${ancestor.tag}.${ancestor.className} right paint room`
            )
            .toBeGreaterThanOrEqual(5.5)
        }
        expect.soft(ancestor.clipPath, `${prefix}: nonrectangular ancestor clip`).toBe('none')
        expect.soft(ancestor.maskImage, `${prefix}: ancestor mask`).toBe('none')
        expect.soft(ancestor.legacyClip, `${prefix}: legacy ancestor clip`).toBe('auto')
      }
      for (const geometry of [
        afterActualGeometry,
        reference.geometry,
        reference.backgroundGeometry,
        restoredGeometry
      ]) {
        for (const key of ['left', 'right', 'top', 'bottom', 'width', 'height'] as const)
          expect
            .soft(
              Math.abs(geometry.cardRect[key] - actualGeometry.cardRect[key]),
              `${prefix}: paint-only reference keeps ${key}`
            )
            .toBeLessThanOrEqual(0.5)
        expect
          .soft(geometry.ancestors.length, `${prefix}: ancestor chain stays unchanged`)
          .toBe(actualGeometry.ancestors.length)
        for (const [index, ancestor] of geometry.ancestors.entries()) {
          expect
            .soft(ancestor.scrollTop, `${prefix}: ancestor ${index} scrollTop unchanged`)
            .toBe(actualGeometry.ancestors[index].scrollTop)
          expect
            .soft(ancestor.scrollLeft, `${prefix}: ancestor ${index} scrollLeft unchanged`)
            .toBe(actualGeometry.ancestors[index].scrollLeft)
        }
      }
      await expect(name).toHaveValue(customer.customerName)
      await page.screenshot({
        path: info.outputPath(`${prefix}-workspace.png`),
        animations: 'disabled',
        caret: 'hide'
      })
      await remark.scrollIntoViewIfNeeded()
      await expect(remark).toBeInViewport()
      await expect(remark).toHaveValue(customer.remark)
      await expect(remark).toBeEditable()
      await expect(save).toBeVisible()
      await expect(save).toBeInViewport()
      await expect(save).toBeEnabled()
      if (stage === 'fullscreen')
        await page.screenshot({
          path: info.outputPath(`${prefix}-lower-fields.png`),
          animations: 'disabled',
          caret: 'hide'
        })
      const bottom = await remark.evaluate((element) => ({
        field: element.getBoundingClientRect().bottom,
        card: element.closest('.art-form__tabs--overlay')!.getBoundingClientRect().bottom
      }))
      expect
        .soft(bottom.field, `${prefix}: card contains the last field`)
        .toBeLessThanOrEqual(bottom.card)
    }
    await capture('normal')
    await dialog.getByRole('button', { name: '全屏', exact: true }).click()
    await capture('fullscreen')
    await dialog.getByRole('button', { name: '进入专注填单', exact: true }).click()
    await capture('focus')
    await dialog.getByRole('button', { name: '退出专注填单', exact: true }).click()
    await dialog.getByRole('button', { name: '退出全屏', exact: true }).click()
    await capture('restored')
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await expect(dialog).toBeHidden()
  }
  expect(writes).toEqual([])
  expect(errors).toEqual([])
})

test('客户摘要与页签卡片保持独立间距，专注时不残留摘要空位', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-1440')
  test.slow()
  const customer = {
    id: '11111111-1111-4111-8111-111111111112',
    tenantId: '11111111-1111-4111-8111-111111111111',
    customerCode: 'KH-SPACING-01',
    customerName: '摘要间距验收客户',
    enabled: true,
    tags: [],
    fieldAccess: {}
  }
  const writes: string[] = []
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  for (const appearance of [
    { width: 1440, theme: 'light', boxBorderMode: true },
    { width: 1440, theme: 'dark', boxBorderMode: false },
    { width: 390, theme: 'light', boxBorderMode: true }
  ] as const) {
    const queries: Array<Record<string, unknown>> = []
    await page.setViewportSize({ width: appearance.width, height: 900 })
    await prepareAppearance(page, appearance)
    await page.route('**/rest/v1/**', (route) => {
      const request = route.request()
      const name = new URL(request.url()).pathname.split('/').at(-1) ?? ''
      if (request.method() !== 'GET' && name.startsWith('tms_') && !/^tms_(?:list|get)_/.test(name))
        writes.push(name)
      if (name === 'tms_list_customers_secure')
        return route.fulfill({ json: { records: [customer], total: 1, fieldAccess: {} } })
      if (name === 'get_table_column_runtime')
        return route.fulfill({ json: { enabled: false, profiles: [] } })
      if (name === 'tms_list_customer_prices_secure') {
        queries.push(request.postDataJSON())
        return route.fulfill({
          json: {
            records: [
              {
                id: '22222222-2222-4222-8222-222222222222',
                tenantId: customer.tenantId,
                customerId: customer.id,
                customer: { id: customer.id, customerName: customer.customerName },
                originRegion: '间距验收始发地',
                destinationRegion: '间距验收目的地',
                transportType: 'road',
                billingMethod: 'per_trip',
                cargoQuantityTotal: 0,
                cargoVolumeTotal: 0,
                cargoWeightTotal: 0,
                totalFee: 0,
                paymentTotal: 0,
                fieldAccess: {}
              }
            ],
            total: 1,
            fieldAccess: {}
          }
        })
      }
      if (name === 'tms_list_contracts_secure')
        return route.fulfill({ json: { records: [], total: 0, fieldAccess: {} } })
      return route.fulfill({ json: [] })
    })
    await page.goto('/tests/e2e/fixtures/tms-customer-workspace.html')
    await assertAppearance(page, appearance)
    await page.getByText(customer.customerName, { exact: true }).first().click()
    const dialog = page.getByRole('dialog', { name: '编辑客户', exact: true })
    await dialog.getByRole('tab', { name: '客户协议价', exact: true }).click()
    const summary = dialog.locator('.art-entity-summary')
    const tabs = dialog.locator('.art-form__tabs--overlay').first()
    const query = dialog.locator('.customer-price .art-table-query')
    const body = query.locator('.el-table__body-wrapper')
    const expectWorkspaceUsable = async () => {
      await expect(query.getByRole('button', { name: '重置', exact: true })).toBeEnabled()
      await expect(query.getByRole('button', { name: '查询', exact: true })).toBeEnabled()
      await expect.poll(() => body.evaluate((element) => element.clientHeight)).toBeGreaterThan(32)
      await expect(query.getByText('间距验收始发地', { exact: true })).toBeVisible()
    }
    const expectSummaryGap = async (stage: string) => {
      await expect(summary).toBeVisible()
      const summaryRect = await summary.boundingBox()
      const tabsRect = await tabs.boundingBox()
      expect(summaryRect).not.toBeNull()
      expect(tabsRect).not.toBeNull()
      if (!summaryRect || !tabsRect) throw new Error('摘要与页签卡片必须同时可见')
      const gap = tabsRect.y - summaryRect.y - summaryRect.height
      await info.attach(`summary-gap-${appearance.width}-${appearance.theme}-${stage}`, {
        body: JSON.stringify({ gap, summaryRect, tabsRect }, null, 2),
        contentType: 'application/json'
      })
      expect(gap).toBeCloseTo(16, 0)
      await expectWorkspaceUsable()
      await dialog.screenshot({
        path: info.outputPath(`summary-gap-${appearance.width}-${appearance.theme}-${stage}.png`)
      })
    }
    await expectSummaryGap('normal')
    await dialog.getByRole('button', { name: '全屏', exact: true }).click()
    await expectSummaryGap('fullscreen')
    await dialog.getByRole('button', { name: '进入专注填单', exact: true }).click()
    await expect(summary).toBeHidden()
    const focusedGap = await tabs.evaluate((element) => {
      const content = element.closest('.art-dialog__content')!
      const top = content.getBoundingClientRect().top
      const padding = parseFloat(getComputedStyle(content).paddingTop)
      return element.getBoundingClientRect().top - top - padding
    })
    expect(focusedGap).toBeCloseTo(0, 0)
    await expectWorkspaceUsable()
    await dialog.screenshot({
      path: info.outputPath(`summary-focus-${appearance.width}-${appearance.theme}.png`)
    })
    await dialog.getByRole('button', { name: '退出专注填单', exact: true }).click()
    await expectSummaryGap('restored-fullscreen')
    await dialog.getByRole('button', { name: '退出全屏', exact: true }).click()
    await expectSummaryGap('restored-normal')
    expect(queries.length).toBeGreaterThan(0)
    for (const params of queries) expect(params.p_customer_id).toBe(customer.id)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      appearance.width + 1
    )
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await expect(dialog).toBeHidden()
  }
  expect(writes).toEqual([])
  expect(errors).toEqual([])
})

test('客户关联业务页签的筛选控件和操作保持对齐，键盘可展开并查询', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1440')
  test.slow()
  const customer = {
    id: '11111111-1111-4111-8111-111111111112',
    tenantId: '11111111-1111-4111-8111-111111111111',
    customerCode: 'KH-LAYOUT-01',
    customerName: '测试客户档案',
    enabled: true,
    tags: [],
    fieldAccess: {}
  }
  const tabNames = ['运输合同', '客户协议价', '电子合同', '运输协议']
  await page.route('**/rest/v1/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    if (name === 'tms_list_customers_secure')
      return route.fulfill({ json: { records: [customer], total: 1, fieldAccess: {} } })
    if (name === 'get_table_column_runtime')
      return route.fulfill({ json: { enabled: false, profiles: [] } })
    const result = ['tms_list_contracts_secure', 'tms_list_customer_prices_secure'].includes(
      name ?? ''
    )
      ? { records: [], total: 0, fieldAccess: {} }
      : []
    return route.fulfill({ json: result })
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await installQueryDateClock(page)
  await page.goto('/tests/e2e/fixtures/tms-customer-workspace.html', {
    waitUntil: 'domcontentloaded'
  })
  await page.getByText(customer.customerName, { exact: true }).first().click()
  const dialog = page.getByRole('dialog', { name: '编辑客户' })
  const filters = dialog.locator('.art-search-bar:visible')
  const fields = filters.locator('[data-art-form-item-key]:visible')
  const buttons = filters.getByRole('button', { name: /^(重置|查询|展开|收起)$/ })
  const verticalCenters = (locator: Locator) =>
    locator.evaluateAll((elements) =>
      elements.map((element) => {
        const { top, height } = element.getBoundingClientRect()
        return top + height / 2
      })
    )

  const expectLabelAlignment = async (fieldCount: number) => {
    await expect(fields).toHaveCount(fieldCount)
    const labels = await fields.evaluateAll((elements) =>
      elements.map((element) => {
        const label = element.querySelector('.el-form-item__label')
        const frame = element.querySelector(
          '.el-input__wrapper, .el-select__wrapper, .el-date-editor'
        )
        const labelText = label?.querySelector('.art-form-item__label')
        const text =
          labelText &&
          document
            .createTreeWalker(labelText, NodeFilter.SHOW_TEXT, {
              acceptNode: (node) =>
                node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP
            })
            .nextNode()
        if (!label || !frame || !text) return null

        const range = document.createRange()
        range.selectNodeContents(text)
        const caption = range.getBoundingClientRect()
        const control = frame.getBoundingClientRect()
        return {
          name: text.textContent?.trim(),
          alignment: getComputedStyle(label).justifyContent,
          horizontalGap: control.left - caption.right,
          verticalOffset: Math.abs(
            caption.top + caption.height / 2 - control.top - control.height / 2
          )
        }
      })
    )
    for (const label of labels) {
      expect(label, '筛选字段必须有可见的标签文字和输入边框').not.toBeNull()
      if (!label) continue
      expect(label.alignment, label.name).toBe('flex-end')
      expect(label.horizontalGap, label.name).toBeCloseTo(8, 0)
      expect(label.verticalOffset, label.name).toBeLessThanOrEqual(2)
    }
  }

  for (const [index, name] of tabNames.entries()) {
    await dialog.getByRole('tab', { name, exact: true }).click()
    await expect(filters.getByRole('button', { name: '查询', exact: true })).toBeEnabled({
      timeout: 60_000
    })
    const controls = fields.locator('.art-form-item__content')
    await expect(controls).toHaveCount(3)
    await expect(controls.first().locator('input').first()).toBeVisible({ timeout: 60_000 })
    await expectLabelAlignment(3)
    const centers = [...(await verticalCenters(controls)), ...(await verticalCenters(buttons))]
    expect(Math.max(...centers) - Math.min(...centers), name).toBeLessThanOrEqual(2)
    await dialog.screenshot({ path: testInfo.outputPath(`customer-filter-${index + 1}.png`) })
  }

  await dialog.getByRole('tab', { name: '客户协议价', exact: true }).click()
  const expand = filters.getByRole('button', { name: '展开', exact: true })
  await expand.focus()
  await expand.press('Enter')
  const dates = filters.locator('[data-art-form-item-key="createTimeRange"]')
  const startDate = dates.getByPlaceholder('开始日期', { exact: true })
  const endDate = dates.getByPlaceholder('结束日期', { exact: true })
  const keyword = filters.getByRole('textbox', { name: '关键词', exact: true })
  await expect(dates.getByText('创建日期', { exact: true })).toBeVisible()
  await expect(startDate).toHaveAccessibleName(/创建日期.*开始日期/)
  await expect(endDate).toHaveAccessibleName(/创建日期.*结束日期/)
  await expectLabelAlignment(4)

  await startDate.focus()
  await expect(startDate).toBeFocused()
  await startDate.press('Tab')
  await expect(endDate).toBeFocused()
  await expect(endDate).toHaveAttribute('aria-expanded', 'true')
  await endDate.press('Escape')
  await expect(endDate).toHaveAttribute('aria-expanded', 'false')
  await keyword.focus()
  await selectQueryDateRange(dates)
  await expectQueryDateRangeReadable(dates)

  await keyword.fill('测试查询')
  const query = filters.getByRole('button', { name: '查询', exact: true })
  await expect(query).toBeEnabled()
  const [dateQuery] = await Promise.all([
    page.waitForRequest(
      (request) =>
        request.url().endsWith('/tms_list_customer_prices_secure') &&
        request.postDataJSON()?.p_create_time_from === '2026-11-07T00:00:00',
      { timeout: 15_000 }
    ),
    keyword.press('Enter')
  ])
  expect(dateQuery.postDataJSON()).toMatchObject({
    p_customer_id: customer.id,
    p_keyword: '测试查询',
    p_create_time_from: '2026-11-07T00:00:00',
    p_create_time_to: '2026-11-10T23:59:59.999'
  })

  await filters.getByRole('button', { name: '重置', exact: true }).press('Enter')
  await expect(keyword).toHaveValue('')
  await expect(startDate).toHaveValue('')
  await expect(endDate).toHaveValue('')

  await dialog.getByRole('button', { name: '进入专注填单', exact: true }).click()
  await expectLabelAlignment(4)
  await dialog.getByRole('button', { name: '退出专注填单', exact: true }).click()

  await dialog.getByRole('button', { name: '全屏', exact: true }).click()
  await expect(filters.getByPlaceholder('开始日期')).toBeVisible()
  await dialog.getByRole('button', { name: '退出全屏', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await setFixtureTheme(page, true)
  await expect(dialog.getByRole('tab', { name: '客户协议价', selected: true })).toBeInViewport({
    ratio: 0.95
  })
  const narrowActions = await verticalCenters(buttons)
  await expectLabelAlignment(4)
  await expectStackedQueryRangeAligned(filters.locator('.el-range-editor'))
  expect(Math.max(...narrowActions) - Math.min(...narrowActions)).toBeLessThanOrEqual(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391)
  await dialog.screenshot({ path: testInfo.outputPath('customer-filter-mobile-dark.png') })
})

for (const appearance of [
  { width: 1440, theme: 'light', boxBorderMode: true },
  { width: 1440, theme: 'dark', boxBorderMode: false },
  { width: 390, theme: 'light', boxBorderMode: true }
] as const) {
  test(`客户合同展开全部筛选后仍可读取记录和翻页 ${appearance.width}/${appearance.theme}`, async ({
    page
  }, info) => {
    test.skip(info.project.name !== 'desktop-1440')
    await page.setViewportSize({ width: appearance.width, height: 844 })
    await prepareAppearance(page, appearance)
    const customer = {
      id: '11111111-1111-4111-8111-111111111112',
      tenantId: '11111111-1111-4111-8111-111111111111',
      customerCode: 'KH-LAYOUT-01',
      customerName: '合同布局测试客户',
      enabled: true,
      tags: [],
      fieldAccess: {}
    }
    const requests: Array<Record<string, unknown>> = []
    await page.route('**/rest/v1/**', (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)
      if (name === 'tms_list_customers_secure')
        return route.fulfill({ json: { records: [customer], total: 1, fieldAccess: {} } })
      if (name === 'get_table_column_runtime')
        return route.fulfill({ json: { enabled: false, profiles: [] } })
      if (name === 'tms_list_contracts_secure') {
        const params = route.request().postDataJSON() as Record<string, unknown>
        requests.push(params)
        const from = Number(params.p_from)
        return route.fulfill({
          json: {
            records: [
              {
                id: `22222222-2222-4222-8222-${String(from + 1).padStart(12, '0')}`,
                tenantId: customer.tenantId,
                contractNo: `HT-LAYOUT-${from + 1}`,
                contractName: '年度运输框架合同',
                contractStatus: 'approved',
                businessContractType: 'customer',
                contractCategory: 'annual_framework',
                customerId: customer.id,
                customer: { id: customer.id, customerName: customer.customerName },
                attachments: [],
                transportDetails: []
              }
            ],
            total: 40,
            fieldAccess: {}
          }
        })
      }
      return route.fulfill({ json: [] })
    })
    await page.goto('/tests/e2e/fixtures/tms-customer-workspace.html')
    await assertAppearance(page, appearance)
    await page.getByText(customer.customerName, { exact: true }).first().click()
    const dialog = page.getByRole('dialog', { name: '编辑客户' })
    await dialog.getByRole('tab', { name: '运输合同', exact: true }).click()
    const query = dialog.locator('.tms-contract .art-table-query')
    const filters = query.locator('.art-search-bar')
    await expect(filters.getByRole('button', { name: '查询', exact: true })).toBeEnabled()
    await filters.getByRole('button', { name: '展开', exact: true }).click()
    await expect(filters.locator('[data-art-form-item-key]:visible')).toHaveCount(6)
    const body = query.locator('.el-table__body-wrapper')
    const record = query.getByText('HT-LAYOUT-1', { exact: true })
    await record.scrollIntoViewIfNeeded()
    await expect(record).toBeInViewport({ ratio: 0.95 })
    await expect.poll(() => body.evaluate((el) => el.clientHeight)).toBeGreaterThan(48)
    await dialog.screenshot({ path: info.outputPath('expanded-contract-record.png') })
    const next = query.locator('.el-pagination .btn-next')
    await next.scrollIntoViewIfNeeded()
    await expect(next).toBeInViewport({ ratio: 0.95 })
    await next.click()
    await expect
      .poll(() => requests.at(-1))
      .toMatchObject({
        p_customer_id: customer.id,
        p_from: 20,
        p_to: 39
      })
    const secondPage = query.getByText('HT-LAYOUT-21', { exact: true })
    await secondPage.scrollIntoViewIfNeeded()
    await expect(secondPage).toBeInViewport({ ratio: 0.95 })
    await filters.getByRole('button', { name: '收起', exact: true }).click()
    await secondPage.scrollIntoViewIfNeeded()
    await expect(secondPage).toBeInViewport({ ratio: 0.95 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      appearance.width + 1
    )
    await dialog.screenshot({ path: info.outputPath('collapsed-contract-record.png') })
  })
}

test('客户运输协议等待承运方选项时 Enter 不查询，加载后键盘和按钮都可查询', async ({ page }) => {
  const customer = {
    id: '11111111-1111-4111-8111-111111111112',
    tenantId: '11111111-1111-4111-8111-111111111111',
    customerCode: 'KH-QUERY-GATE',
    customerName: '测试协议查询客户',
    enabled: true,
    tags: [],
    fieldAccess: {}
  }
  const numbers = ['QA-INITIAL', 'QA-HELD', 'QA-KEYBOARD', 'QA-BUTTON']
  const agreements = numbers.map((agreementNo, index) => ({
    id: `12345678-0000-4000-8000-00000000000${index + 1}`,
    tenant_id: customer.tenantId,
    customer_id: customer.id,
    agreement_no: agreementNo,
    shipper_name: customer.customerName,
    carrier_name: '测试承运方',
    status: 'draft',
    approval_status: 'draft'
  }))
  let carrierRequested = false
  let releaseCarrier = () => {}
  const carrierResponse = new Promise<void>((resolve) => (releaseCarrier = resolve))
  const reads: Array<string | null> = []
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const name = url.pathname.split('/').at(-1)
    if (name === 'tms_list_customers_secure')
      return route.fulfill({ json: { records: [customer], total: 1, fieldAccess: {} } })
    if (name === 'get_table_column_runtime')
      return route.fulfill({ json: { enabled: false, profiles: [] } })
    if (name === 'tms_list_basic_carrier_options_secure') {
      carrierRequested = true
      await carrierResponse
      return route.fulfill({ json: [{ id: 'carrier-test', company_name: '测试承运方' }] })
    }
    if (name === 'tms_transport_agreement') {
      if (request.method() !== 'GET') return route.abort('blockedbyclient')
      expect(url.searchParams.get('customer_id')).toBe(`eq.${customer.id}`)
      const filter = url.searchParams.get('agreement_no')
      reads.push(filter)
      const record = agreements.find(
        ({ agreement_no }) => (filter ?? 'ilike.%QA-INITIAL%') === `ilike.%${agreement_no}%`
      )
      return route.fulfill({
        json: record ? [record] : [],
        headers: {
          'content-range': record ? '0-0/1' : '*/0',
          'access-control-expose-headers': 'content-range'
        }
      })
    }
    return route.fulfill({ json: [] })
  })

  const agreementTab = page.getByRole('tab', { name: '运输协议', exact: true })
  const dialog = page.getByRole('dialog').filter({ has: agreementTab })
  const search = dialog.locator('.art-search-bar:visible')
  const input = search.getByRole('textbox', { name: '协议号', exact: true })
  const query = search.getByRole('button', { name: '查询', exact: true })
  const result = (number: string) => dialog.getByRole('button', { name: number, exact: true })
  try {
    await page.goto('/tests/e2e/fixtures/tms-customer-workspace.html?readonly', {
      waitUntil: 'domcontentloaded'
    })
    await page.getByText(customer.customerName, { exact: true }).first().click()
    await agreementTab.click()
    await expect(result('QA-INITIAL')).toBeVisible()
    await expect.poll(() => carrierRequested).toBe(true)
    await expect(query).toBeDisabled()
    await input.fill('QA-HELD')
    await input.press('Enter')
  } finally {
    releaseCarrier()
  }

  await expect(query).toBeEnabled()
  await input.fill('QA-KEYBOARD')
  await input.press('Enter')
  await expect(result('QA-KEYBOARD')).toBeVisible()
  await input.fill('QA-BUTTON')
  await query.click()
  await expect(result('QA-BUTTON')).toBeVisible()
  expect(reads.filter((filter) => filter !== null)).toEqual([
    'ilike.%QA-KEYBOARD%',
    'ilike.%QA-BUTTON%'
  ])
})

test('客户名称打开档案，子表独立编辑且关联页签锁定客户', async ({ page }, testInfo) => {
  test.slow()
  const customer = {
    id: '11111111-1111-4111-8111-111111111112',
    tenantId: '11111111-1111-4111-8111-111111111111',
    customerCode: 'KH-TEST-01',
    customerName: '测试客户长名称运输有限公司',
    enabled: true,
    tags: [],
    fieldAccess: {
      contactPhone: 'edit',
      addressDetail: 'edit',
      taxNo: 'edit',
      bankAccount: 'edit'
    },
    isRecordOwner: true
  }
  const requests: Array<{ name: string; body: Record<string, unknown> }> = []
  let failContacts = false
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const name = url.pathname.split('/').at(-1) ?? ''
    const body = route.request().postDataJSON() as Record<string, unknown> | null
    if (body) requests.push({ name, body })
    let json: unknown = []
    if (name === 'tms_list_customers_secure')
      json = { records: [customer], total: 1, fieldAccess: customer.fieldAccess }
    else if (name === 'get_table_column_runtime') json = { enabled: false, profiles: [] }
    else if (name === 'tms_list_customer_contacts_secure') {
      if (failContacts)
        return route.fulfill({ status: 503, json: { message: '联系人读取失败，请重试' } })
      json = [
        {
          id: 'contact-1',
          customerId: customer.id,
          name: '测试联系人',
          mobile: '13800000001',
          isDefault: true
        }
      ]
    } else if (name === 'tms_list_customer_finances_secure')
      json = [
        {
          id: 'finance-1',
          customerId: customer.id,
          invoiceTitle: '测试开票主体',
          taxNo: 'TEST-TAX-01',
          bankName: '测试银行',
          bankAccount: '1234567890',
          bankBranch: '测试支行',
          isDefaultInvoice: true,
          fieldAccess: customer.fieldAccess
        }
      ]
    else if (name === 'tms_list_dispatch_workbench_secure')
      json = {
        records: [
          {
            id: 'waybill-fixture',
            waybillNo: 'YS-TEST-01',
            orderNo: 'YD-TEST-01',
            originStation: '测试始发站',
            destinationStation: '测试目的站',
            waybillStatus: 'loaded'
          }
        ],
        total: 1,
        fieldAccess: {}
      }
    else if (
      name === 'tms_list_contracts_secure' ||
      name === 'tms_list_customer_prices_secure' ||
      name === 'tms_list_customer_statements_secure'
    )
      json = { records: [], total: 0, fieldAccess: {} }
    return route.fulfill({ json })
  })
  await page.goto('/tests/e2e/fixtures/tms-customer-workspace.html', {
    waitUntil: 'domcontentloaded'
  })
  await page.getByText(customer.customerName, { exact: true }).first().click()
  const dialog = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('tab', { name: '客户识别' }) })
  await expect(dialog).toBeVisible()
  for (const name of [
    '联系人',
    '财务信息',
    '运输合同',
    '客户协议价',
    '运单列表',
    '电子合同',
    '运输协议',
    '客户对账'
  ])
    await expect(dialog.getByRole('tab', { name, exact: true })).toBeVisible()
  await dialog.getByRole('tab', { name: '联系人', exact: true }).click()
  await expect(dialog.getByText('测试联系人', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('columnheader', { name: '别名' })).toBeVisible()
  await dialog.getByRole('button', { name: '新增联系人', exact: true }).click()
  const contactEditor = page
    .getByRole('dialog')
    .filter({ has: page.getByText('新增联系人', { exact: true }) })
    .last()
  await expect(contactEditor.getByText('固定电话', { exact: true })).toBeVisible()
  await expect(contactEditor.getByText('角色', { exact: true })).toBeVisible()
  await contactEditor.getByRole('button', { name: '取消', exact: true }).click()
  await dialog.getByRole('tab', { name: '财务信息', exact: true }).click()
  await expect(dialog.getByText('测试开票主体', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('columnheader', { name: '默认开票账户' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('customer-finance.png'), fullPage: true })
  const financeCard = dialog.locator('[data-art-form-tab="financeSection"] .art-table-card')
  const standardCardHeight = await financeCard.evaluate(
    (element) => element.getBoundingClientRect().height
  )
  await dialog.getByRole('button', { name: '全屏', exact: true }).click()
  await expect(dialog.locator('.tms-customer-dialog')).toHaveClass(/is-fullscreen/)
  await expect
    .poll(() => financeCard.evaluate((element) => element.getBoundingClientRect().height))
    .toBeGreaterThan(standardCardHeight + 80)
  const footerGap = await dialog.evaluate((element) => {
    const card = element.querySelector('[data-art-form-tab="financeSection"] .art-table-card')
    const footer = element.querySelector('.el-dialog__footer')
    if (!card || !footer) return Number.POSITIVE_INFINITY
    return footer.getBoundingClientRect().top - card.getBoundingClientRect().bottom
  })
  expect(footerGap).toBeLessThan(48)
  await page.screenshot({
    path: testInfo.outputPath('customer-finance-fullscreen.png'),
    fullPage: true
  })
  await dialog.getByRole('button', { name: '退出全屏', exact: true }).click()
  failContacts = true
  await dialog.getByRole('tab', { name: '联系人', exact: true }).click()
  await expect(dialog.getByText('数据加载失败', { exact: true })).toBeVisible()
  failContacts = false
  await dialog.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(dialog.getByText('测试联系人', { exact: true })).toBeVisible()
  await setFixtureTheme(page, true)
  await expect(dialog.locator('.el-loading-mask:visible')).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('customer-dark.png'), fullPage: true })
  await setFixtureTheme(page, false)
  await dialog.getByRole('tab', { name: '运单列表', exact: true }).click()
  await expect
    .poll(
      () => requests.find((r) => r.name === 'tms_list_dispatch_workbench_secure')?.body.p_filters
    )
    .toMatchObject({ customer_id: customer.id })
  await expect(dialog.getByText('测试始发站', { exact: true })).toBeVisible()
  await expect(dialog.getByText('测试目的站', { exact: true })).toBeVisible()
  await dialog.getByRole('tab', { name: '客户对账', exact: true }).click()
  await expect
    .poll(
      () =>
        requests.find((r) => r.name === 'tms_list_customer_statements_secure')?.body.p_customer_id
    )
    .toBe(customer.id)
  await page.setViewportSize({ width: 1024, height: 768 })
  await page.screenshot({ path: testInfo.outputPath('customer-narrow.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  await dialog.getByRole('tab', { name: '财务信息', exact: true }).click()
  await expect(dialog.getByText('测试开票主体', { exact: true })).toBeVisible()
  await dialog
    .locator('.art-dialog__scrollbar > .el-scrollbar__wrap')
    .evaluate((element) => element.scrollTo({ top: element.scrollHeight }))
  await expect(
    dialog.locator('[data-art-form-tab="financeSection"] .el-pagination')
  ).toBeInViewport()
})

test('仅查看权限打开同一客户档案，基础字段和维护按钮不可写', async ({ page }) => {
  await page.route('**/rest/v1/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    return route.fulfill({
      json:
        name === 'tms_list_customers_secure'
          ? {
              records: [
                {
                  id: 'customer-readonly',
                  customerName: '只读测试客户',
                  customerCode: 'KH-READ',
                  enabled: true,
                  fieldAccess: {}
                }
              ],
              total: 1,
              fieldAccess: {}
            }
          : name === 'get_table_column_runtime'
            ? { enabled: false, profiles: [] }
            : []
    })
  })
  await page.goto('/tests/e2e/fixtures/tms-customer-workspace.html?readonly=1', {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.locator('body')).toHaveAttribute('data-fixture-readonly', 'true')
  await page.getByText('只读测试客户', { exact: true }).first().click()
  const dialog = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('tab', { name: '客户识别' }) })
  await expect(dialog.locator('[data-art-form-item-key="customerName"] input')).toBeDisabled()
  await expect(dialog.getByRole('button', { name: '保存客户', exact: true })).toHaveCount(0)
  await dialog.getByRole('tab', { name: '联系人', exact: true }).click()
  await expect(dialog.getByRole('button', { name: '新增联系人', exact: true })).toHaveCount(0)
})

test('客户删除引用提示隐藏未知状态码并保留可识别的业务记录', async ({ page }) => {
  test.slow()
  const customerId = '11111111-1111-4111-8111-111111111118'
  await page.route('**/rest/v1/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    const json =
      name === 'tms_list_customers_secure'
        ? {
            records: [
              {
                id: customerId,
                customerCode: 'KH-DELETE-01',
                customerName: '删除校验测试客户',
                enabled: true,
                fieldAccess: {},
                isRecordOwner: true
              }
            ],
            total: 1,
            fieldAccess: {}
          }
        : name === 'get_tms_customer_delete_dependency_details_secure'
          ? [
              {
                customerId,
                dependencyCode: 'contract',
                recordId: 'contract-test',
                targetId: 'contract-test',
                recordNo: 'HT-DELETE-01',
                recordSummary: '年度运输合同',
                recordStatus: 'future_status_code',
                recordAmount: null,
                cleanupAllowed: false
              },
              {
                customerId,
                dependencyCode: 'contract',
                recordId: 'contract-prototype-test',
                targetId: 'contract-prototype-test',
                recordNo: 'HT-DELETE-02',
                recordSummary: '专项线路合同',
                recordStatus: 'constructor',
                recordAmount: null,
                cleanupAllowed: false
              }
            ]
          : name === 'get_table_column_runtime'
            ? { enabled: false, profiles: [] }
            : []
    return route.fulfill({ json })
  })
  await page.goto('/tests/e2e/fixtures/tms-customer-workspace.html', {
    waitUntil: 'domcontentloaded'
  })
  const row = page.getByRole('row').filter({ hasText: '删除校验测试客户' })
  await expect(row).toBeVisible({ timeout: 60_000 })
  const more = row.getByRole('button', { name: '更多操作', exact: true })
  await more.press('Enter')
  const deleteAction = page.getByRole('menuitem', { name: '删除客户', exact: true })
  await expect(deleteAction).toBeVisible()
  await deleteAction.click()
  const guard = page.getByRole('dialog').filter({ hasText: '暂时无法删除客户' })
  await expect(guard).toContainText('HT-DELETE-01')
  await expect(guard).toContainText('HT-DELETE-02')
  await expect(guard).toContainText('待核对')
  await expect(guard).not.toContainText('future_status_code')
  await expect(guard).not.toContainText('constructor')
  await expect(page.getByRole('dialog', { name: '删除确认' })).toHaveCount(0)
})
