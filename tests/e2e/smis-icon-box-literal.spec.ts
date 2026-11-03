import { writeFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { prepareAppearance, assertAppearance } from './support/appearance'
import { planDetail, tenantId } from './fixtures/form-standard-smis-data'
import { hiddenTaskDetail, riskTaskDetail } from './fixtures/form-standard-smis-readonly-data'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(300_000)

const fixtureUrl = '/tests/e2e/fixtures/form-standard-smis.html'
const longText = '验收长内容需要在抽屉内完整阅读，且不应压缩身份图标或产生外层横向滚动。'

const detailResponses = {
  smis_get_hidden_hazard_inspection_plan_secure: {
    ...planDetail,
    items: Array.from({ length: 18 }, (_, index) => ({
      ...planDetail.items[0],
      id: `plan-item-${index}`,
      sort: index + 1,
      inspectionContent: `${longText}${index + 1}`
    }))
  },
  smis_get_hidden_hazard_inspection_task_secure: {
    ...hiddenTaskDetail,
    items: Array.from({ length: 18 }, (_, index) => ({
      ...hiddenTaskDetail.items[0],
      id: `hidden-task-item-${index}`,
      sort: index + 1,
      inspectionContent: `${longText}${index + 1}`
    }))
  },
  smis_get_risk_inspection_task_secure: {
    ...riskTaskDetail,
    items: Array.from({ length: 18 }, (_, index) => ({
      ...riskTaskDetail.items[0],
      id: `risk-task-item-${index}`,
      sort: index + 1,
      inspectionContent: `${longText}${index + 1}`
    }))
  }
} as const

const targets = [
  {
    entry: 'inspection-plan-detail',
    identity: '.hidden-hazard-plan-detail__identity',
    longTab: '排查明细',
    mix: 7
  },
  {
    entry: 'hidden-task-detail',
    identity: '.hidden-hazard-task-detail__identity',
    longTab: '排查结果',
    mix: 7
  },
  {
    entry: 'risk-task-detail',
    identity: '.task-detail-drawer__status',
    longTab: '执行情况',
    mix: 6
  },
  {
    entry: 'hazard-workflow-icon',
    identity: '.hazard-workflow-dialog__identity',
    longTab: null,
    mix: 7
  }
] as const

const profiles = [
  { name: 'light-1440-border', theme: 'light', width: 1440, boxBorderMode: true },
  { name: 'dark-1440-shadow', theme: 'dark', width: 1440, boxBorderMode: false },
  { name: 'light-570-shadow', theme: 'light', width: 570, boxBorderMode: false },
  { name: 'dark-570-border', theme: 'dark', width: 570, boxBorderMode: true }
] as const

async function installStrictReads(page: Page, unknown: string[]): Promise<void> {
  await page.route('**/rest/v1/**', (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const rpc = path.split('/').at(-1)
    if (request.method() === 'POST' && rpc && rpc in detailResponses)
      return route.fulfill({
        json: detailResponses[rpc as keyof typeof detailResponses]
      })
    if (request.method() === 'GET' && path.endsWith('/sys_dictionary'))
      return route.fulfill({ json: [] })
    if (request.method() === 'GET' && path.endsWith('/smis_risk_inspection_task'))
      return route.fulfill({ json: { tenant_id: tenantId } })
    unknown.push(`${request.method()} ${path}`)
    return route.abort()
  })
  await page.route('**/functions/v1/**', (route) => {
    unknown.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`)
    return route.abort()
  })
  for (const endpoint of ['auth', 'storage'])
    await page.route(`**/${endpoint}/v1/**`, (route) => {
      unknown.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`)
      return route.abort()
    })
}

for (const profile of profiles) {
  test(`${profile.name} 四个真实 SMIS 身份图标保留完整样式与滚动`, async ({ page }, info) => {
    const unknown: string[] = []
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.setViewportSize({ width: profile.width, height: 900 })
    await prepareAppearance(page, {
      theme: profile.theme,
      boxBorderMode: profile.boxBorderMode
    })
    await installStrictReads(page, unknown)

    for (const target of targets) {
      await page.goto(`${fixtureUrl}?entry=${target.entry}&theme=${profile.theme}`)
      await assertAppearance(page, {
        theme: profile.theme,
        boxBorderMode: profile.boxBorderMode
      })
      const open = page.getByRole('button', { name: '打开真实 SMIS 入口' })
      await expect(open).toBeEnabled()
      await open.click()

      const overlay = page.locator('.el-dialog:visible, .el-drawer:visible').last()
      const identity = overlay.locator(target.identity)
      const icon = identity.locator(':scope > span:first-child')
      await expect(icon).toBeVisible()
      if (target.entry === 'hazard-workflow-icon')
        await expect(overlay.locator('.art-dialog__viewport')).not.toHaveClass(/is-loading/)
      const styles = await icon.evaluate((element, mix) => {
        const parent = element.parentElement!
        const probe = document.createElement('span')
        probe.style.cssText =
          'display:grid;place-items:center;width:46px;height:46px;color:var(--theme-color);background:var(--default-box-color);border-radius:var(--el-border-radius-base);position:absolute;visibility:hidden'
        parent.appendChild(probe)
        const parentProbe = document.createElement('div')
        parentProbe.style.background = `color-mix(in srgb, var(--theme-color) ${mix}%, var(--default-box-color))`
        parent.appendChild(parentProbe)
        const pick = (node: Element) => {
          const css = getComputedStyle(node)
          return {
            display: css.display,
            alignItems: css.alignItems,
            justifyItems: css.justifyItems,
            width: css.width,
            height: css.height,
            color: css.color,
            backgroundColor: css.backgroundColor,
            borderRadius: css.borderRadius
          }
        }
        const rect = element.getBoundingClientRect()
        const cascade: Array<{
          sheet: number
          rule: string
          selector: string
          declarations: string
        }> = []
        const relevant = [
          'display',
          'place-items',
          'width',
          'height',
          'color',
          'background',
          'border-radius'
        ]
        const visit = (rules: CSSRuleList, sheet: number, prefix = '') => {
          for (let index = 0; index < rules.length; index++) {
            const rule = rules[index]
            const location = `${prefix}${index}`
            if (rule instanceof CSSStyleRule) {
              try {
                if (
                  element.matches(rule.selectorText) &&
                  relevant.some((name) => rule.style.getPropertyValue(name))
                )
                  cascade.push({
                    sheet,
                    rule: location,
                    selector: rule.selectorText,
                    declarations: rule.style.cssText
                  })
              } catch {
                // A selector unsupported by Element.matches cannot affect this element.
              }
            } else if ('cssRules' in rule) {
              visit((rule as CSSGroupingRule).cssRules, sheet, `${location}.`)
            }
          }
        }
        for (let sheet = 0; sheet < document.styleSheets.length; sheet++) {
          try {
            visit(document.styleSheets[sheet].cssRules, sheet)
          } catch {
            // Cross-origin stylesheets do not expose CSSOM rules.
          }
        }
        const result = {
          actual: pick(element),
          expected: pick(probe),
          rect: { width: rect.width, height: rect.height },
          parentBackground: getComputedStyle(parent).backgroundColor,
          expectedParentBackground: getComputedStyle(parentProbe).backgroundColor,
          cascade
        }
        probe.remove()
        parentProbe.remove()
        return result
      }, target.mix)
      const { cascade, ...computed } = styles
      expect(computed.actual, `${profile.name}/${target.entry}`).toEqual(computed.expected)
      expect(computed.rect).toEqual({ width: 46, height: 46 })
      expect(computed.parentBackground).toBe(computed.expectedParentBackground)
      await writeFile(
        info.outputPath(`${profile.name}-${target.entry}-computed.json`),
        JSON.stringify(computed, null, 2)
      )
      await writeFile(
        info.outputPath(`${profile.name}-${target.entry}-cascade.json`),
        JSON.stringify(cascade, null, 2)
      )
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
      ).toBeLessThanOrEqual(1)
      expect(
        await overlay.evaluate((element) => element.scrollWidth - element.clientWidth)
      ).toBeLessThanOrEqual(1)
      await page.screenshot({
        path: info.outputPath(`${profile.name}-${target.entry}-normal.png`),
        animations: 'disabled'
      })

      if (target.longTab) await overlay.getByRole('tab', { name: target.longTab }).click()
      const scroll = overlay
        .locator(
          '.art-drawer__scrollbar .el-scrollbar__wrap, .art-dialog__scrollbar .el-scrollbar__wrap'
        )
        .first()
      const scrollBounds = await scroll.evaluate((element) => ({
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight
      }))
      if (target.longTab || profile.width === 570)
        expect(scrollBounds.scrollHeight).toBeGreaterThan(scrollBounds.clientHeight + 1)
      if (scrollBounds.scrollHeight > scrollBounds.clientHeight + 1)
        await expect
          .poll(() =>
            scroll.evaluate((element) => {
              element.scrollTop = element.scrollHeight - element.clientHeight
              return element.scrollTop
            })
          )
          .toBeGreaterThan(0)
      await page.screenshot({
        path: info.outputPath(`${profile.name}-${target.entry}-scrolled.png`),
        animations: 'disabled'
      })
      await overlay.getByRole('button', { name: /^关闭(弹窗|抽屉)$/ }).click()
      await expect(overlay).toBeHidden()
      expect(unknown).toEqual([])
      expect(pageErrors).toEqual([])
    }
  })
}
