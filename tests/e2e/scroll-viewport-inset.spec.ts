import { expect, test, type Locator } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)

async function geometry(scrollbar: Locator) {
  return scrollbar.evaluate((node) => {
    const wrap = node.querySelector('.el-scrollbar__wrap')!
    const track = node.querySelector('.el-scrollbar__bar.is-vertical')!.getBoundingClientRect()
    return {
      height: wrap.scrollHeight,
      top: wrap.scrollTop,
      trackX: track.x,
      trackY: track.y,
      trackHeight: track.height
    }
  })
}

for (const [theme, box, width] of [
  ['light', 'border-mode', 1440],
  ['dark', 'shadow-mode', 390]
] as const) {
  test(`卡片与无按钮浮层始终留白且轨道不移 ${theme}-${width}`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`/tests/e2e/fixtures/scroll-viewport-inset.html?theme=${theme}&box=${box}`)
    for (const kind of ['card', 'drawer', 'dialog']) {
      if (kind !== 'card')
        await page
          .getByRole('button', {
            name: `打开无底部按钮${kind === 'drawer' ? '抽屉' : '弹窗'}`,
            exact: true
          })
          .click()
      const root =
        kind === 'card'
          ? page.locator('.dashboard-certificate-risks')
          : page.locator(`.art-${kind}:visible`)
      const scrollbar = root
        .locator(`.art-${kind === 'card' ? 'section-card' : kind}__scrollbar`)
        .first()
      const wrap = scrollbar.locator(':scope > .el-scrollbar__wrap')
      await expect(scrollbar).toHaveClass(/art-scroll-viewport-inset/)
      const inset = await wrap.evaluate((node) =>
        parseFloat(getComputedStyle(node).scrollPaddingBottom)
      )
      expect(inset).toBeGreaterThanOrEqual(16)
      await wrap.evaluate((node) => {
        node.scrollTop = 120
      })
      const before = await geometry(scrollbar)
      await scrollbar.evaluate((node) => node.classList.remove('art-scroll-viewport-inset'))
      expect(await geometry(scrollbar)).toEqual(before)
      await scrollbar.evaluate((node) => node.classList.add('art-scroll-viewport-inset'))
      expect(await geometry(scrollbar)).toEqual(before)
      for (const position of ['top', 'middle', 'bottom']) {
        await wrap.evaluate((node, position) => {
          node.scrollTop = position === 'top' ? 0 : position === 'middle' ? 120 : node.scrollHeight
        }, position)
        const gutterContainsContent = await wrap.evaluate((node) => {
          const box = node.getBoundingClientRect()
          const inset = parseFloat(getComputedStyle(node).scrollPaddingBottom)
          return document
            .elementsFromPoint(box.left + box.width / 2, box.bottom - inset / 2)
            .some((element) => node.contains(element))
        })
        expect(gutterContainsContent, `${kind}/${position} 底部留白不能绘制或命中正文`).toBe(false)
        await root.screenshot({ path: info.outputPath(`${kind}-${position}.png`) })
      }
      const last =
        kind === 'card'
          ? root.getByRole('button', { name: '查看验收司机16的驾驶证证件', exact: true })
          : root.getByRole('button', { name: '正文操作 50', exact: true })
      await wrap.evaluate((node) => {
        node.scrollTop = 0
      })
      await last.focus()
      await expect(last).toBeFocused()
      const bottomGap = await last.evaluate((node) => {
        const wrap = node.closest('.el-scrollbar__wrap')!
        return wrap.getBoundingClientRect().bottom - node.getBoundingClientRect().bottom
      })
      expect(bottomGap).toBeGreaterThanOrEqual(inset - 1)
      await last.click()
      await expect(page.getByLabel('已操作')).toHaveText(kind === 'card' ? '验收司机16' : '正文50')
      if (kind !== 'card')
        await root
          .getByRole('button', { name: kind === 'drawer' ? '关闭抽屉' : '关闭弹窗', exact: true })
          .click()
    }
  })
}

test('短内容完整显示，操作区及贴边工作区沿用原布局', async ({ page }) => {
  await prepareIsolatedSession(page)
  await page.goto('/tests/e2e/fixtures/scroll-viewport-inset.html?short&footer')
  const card = page.locator('.dashboard-certificate-risks')
  await expect(
    card.getByRole('button', { name: '查看验收司机2的驾驶证证件', exact: true })
  ).toBeVisible()
  await page.getByRole('button', { name: '打开无底部按钮抽屉', exact: true }).click()
  await expect(page.locator('.art-drawer__scrollbar')).not.toHaveClass(/art-scroll-viewport-inset/)
  await expect(page.getByRole('button', { name: '确定', exact: true })).toBeVisible()
  await page.goto('/tests/e2e/fixtures/scroll-viewport-inset.html?edge')
  await page.getByRole('button', { name: '打开无底部按钮弹窗', exact: true }).click()
  await expect(page.locator('.art-dialog__scrollbar > .el-scrollbar__wrap')).toHaveCSS(
    'clip-path',
    'inset(0px)'
  )
})

test('卡片固定筛选与范围说明不随正文滚动', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  await page.goto('/tests/e2e/fixtures/scroll-viewport-inset.html?short&fixed')
  const card = page.locator('.art-section-card').filter({ hasText: '固定导航区' })
  const toolbar = card.locator('.art-section-card__toolbar')
  const footer = card.locator('.art-section-card__footer')
  await expect(footer.getByLabel('当前范围')).toHaveText('50 项')
  const before = { toolbar: await toolbar.boundingBox(), footer: await footer.boundingBox() }
  const wrap = card.locator('.art-section-card__scrollbar > .el-scrollbar__wrap')
  await wrap.evaluate((node) => {
    node.scrollTop = node.scrollHeight
  })
  expect(await toolbar.boundingBox()).toEqual(before.toolbar)
  expect(await footer.boundingBox()).toEqual(before.footer)
  const last = card.getByRole('button', { name: '正文操作 50', exact: true })
  await last.click()
  await expect(page.getByLabel('已操作')).toHaveText('正文50')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    expect(
      await footer.evaluate((node) => {
        const box = node.getBoundingClientRect()
        const content = node.firstElementChild!.getBoundingClientRect()
        return Math.abs(content.left - box.left - (box.right - content.right))
      })
    ).toBeLessThan(1)
    await card.screenshot({ path: info.outputPath(`fixed-card-${width}.png`) })
  }
})
