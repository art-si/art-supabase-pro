import { mkdirSync } from 'node:fs'
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
        await expect(root).toHaveClass(/is-fullscreen/)
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
