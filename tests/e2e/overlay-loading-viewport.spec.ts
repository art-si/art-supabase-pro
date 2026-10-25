import { mkdirSync } from 'node:fs'
import { expect, test, type Locator, type Page } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(240_000)

async function setLoading(page: Page, kind: 'drawer' | 'dialog', loading: boolean): Promise<void> {
  await page.evaluate(
    (detail) => window.dispatchEvent(new CustomEvent('overlay-preview-loading', { detail })),
    { kind, loading }
  )
}

async function expectViewportCentered(root: Locator, kind: 'drawer' | 'dialog'): Promise<void> {
  const viewport = root.locator(`.art-${kind}__viewport`)
  await expect(viewport).toHaveAttribute('aria-busy', 'true')
  await expect(viewport.locator(':scope > .art-overlay-loading')).toBeVisible()
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

test('销售报价详情使用公共抽屉加载层，长明细不会把加载提示推到视口外', async ({ page }) => {
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
    await page.getByRole('button', { name: '打开长销售报价详情' }).click()
    const drawer = page.locator('.el-drawer:visible')
    await expectViewportCentered(drawer, 'drawer')
    await expect(drawer.locator('.art-async-state > .art-overlay-loading')).toHaveCount(0)
    mkdirSync('.artifacts/overlay-loading-visual', { recursive: true })
    await drawer.screenshot({
      path: '.artifacts/overlay-loading-visual/scm-long-detail.png',
      animations: 'disabled'
    })
    await page.setViewportSize({ width: 390, height: 844 })
    await expectViewportCentered(drawer, 'drawer')
    await drawer.screenshot({
      path: '.artifacts/overlay-loading-visual/scm-long-detail-mobile.png',
      animations: 'disabled'
    })
    await drawer.getByRole('button', { name: 'Close this dialog' }).click()
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
        await root.getByRole('button', { name: 'Close this dialog' }).click()
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
    await root.getByRole('button', { name: 'Close this dialog' }).click()
  }
  expect(errors).toEqual([])
})

test('子组件加载统一由审批分析弹窗和审批历程抽屉承接', async ({ page }, testInfo) => {
  let release: () => void = () => undefined
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/rest/v1/**', async (route) => {
    if (route.request().url().includes('sys_dictionary')) return route.fulfill({ json: [] })
    await held
    return route.fulfill({ status: 503, json: { code: 'XX000', message: 'synthetic unavailable' } })
  })
  await page.goto('/tests/e2e/fixtures/overlay-loading-viewport.html')
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
      await root.getByRole('button', { name: 'Close this dialog', exact: true }).click()
    }
  } finally {
    release()
  }
})
