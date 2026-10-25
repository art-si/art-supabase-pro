import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('含回调的嵌套表单编辑与重置保持原始记录隔离', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/overlay-close-guard.html')
  await page.getByRole('button', { name: '打开快照检查', exact: true }).click()
  await expect(page.getByTestId('snapshot-amount')).toHaveText('10')
  await page.getByRole('button', { name: '修改嵌套金额', exact: true }).click()
  await expect(page.getByTestId('snapshot-amount')).toHaveText('20')
  await expect(page.getByTestId('source-amount')).toHaveText('10')
  await page.getByRole('button', { name: '恢复打开时数据', exact: true }).click()
  await expect(page.getByTestId('snapshot-amount')).toHaveText('10')
  await expect(page.getByTestId('source-amount')).toHaveText('10')
})

test('弹窗拖动与垂直居中参数控制实际交互', async ({ page }) => {
  for (const enabled of [true, false]) {
    await page.goto(
      `/tests/e2e/fixtures/overlay-close-guard.html${enabled ? '' : '?preserve-content'}`
    )
    await page.getByRole('button', { name: '打开弹窗', exact: true }).click()
    const dialog = page.locator('.art-dialog')
    await expect(dialog).toBeVisible()
    if (enabled) {
      await expect(dialog).toHaveClass(/is-draggable/)
      await expect(dialog).toHaveClass(/is-align-center/)
    } else {
      await expect(dialog).not.toHaveClass(/is-draggable/)
      await expect(dialog).not.toHaveClass(/is-align-center/)
    }
    await dialog.evaluate((element) =>
      element.getAnimations({ subtree: true }).forEach((animation) => animation.finish())
    )
    const before = await dialog.boundingBox()
    const header = await dialog.locator('.el-dialog__header').boundingBox()
    expect(before).not.toBeNull()
    expect(header).not.toBeNull()
    if (!before || !header) throw new Error('弹窗位置不可用')
    await page.mouse.move(header.x + 80, header.y + 20)
    await page.mouse.down()
    await page.mouse.move(header.x + 140, header.y + 40, { steps: 5 })
    await page.mouse.up()
    const after = await dialog.boundingBox()
    expect(after).not.toBeNull()
    if (!after) throw new Error('弹窗位置不可用')
    if (enabled) {
      const viewportWidth = page.viewportSize()?.width ?? 1440
      const availableDistance = viewportWidth - before.x - before.width
      expect(after.x - before.x).toBeGreaterThan(Math.min(40, availableDistance * 0.8))
      expect(after.x + after.width).toBeLessThanOrEqual(viewportWidth + 1)
    } else expect(Math.abs(after.x - before.x)).toBeLessThan(1)
  }
})

test('抽屉标题栏可显式隐藏', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/overlay-close-guard.html?no-header')
  await page.getByRole('button', { name: '打开抽屉', exact: true }).click()
  await expect(page.locator('.art-drawer')).toBeVisible()
  await expect(page.locator('.art-drawer .el-drawer__header')).toHaveCount(0)
  await expect(page.getByText('测试草稿保持完整', { exact: true })).toBeVisible()
})

test('原生标题居中与抽屉拖拽开关生效', async ({ page }) => {
  for (const enabled of [true, false]) {
    await page.goto(
      `/tests/e2e/fixtures/overlay-close-guard.html${enabled ? '' : '?preserve-content'}`
    )
    await page.getByRole('button', { name: '打开弹窗', exact: true }).click()
    const dialog = page.locator('.art-dialog')
    await expect(dialog).toBeVisible()
    if (enabled) await expect(dialog).toHaveClass(/el-dialog--center/)
    else await expect(dialog).not.toHaveClass(/el-dialog--center/)
    await page.goto(
      `/tests/e2e/fixtures/overlay-close-guard.html${enabled ? '' : '?preserve-content'}`
    )
    await page.getByRole('button', { name: '打开抽屉', exact: true }).click()
    await expect(page.locator('.art-drawer')).toBeVisible()
    await expect(page.locator('.art-drawer .el-drawer__dragger')).toHaveCount(enabled ? 1 : 0)
  }
})

for (const kind of ['弹窗', '抽屉']) {
  test(`${kind}原生区域样式类与层级参数生效`, async ({ page }) => {
    await page.goto('/tests/e2e/fixtures/overlay-close-guard.html')
    await page.getByRole('button', { name: `打开${kind}`, exact: true }).click()
    const overlay = page.getByRole('dialog', { name: `关闭检查${kind}`, exact: true })
    await expect(overlay).toBeVisible()
    for (const region of ['header', 'body', 'footer']) {
      await expect(overlay.locator(`.test-native-${region}`)).toBeVisible()
    }
    const mask = page.locator('.test-native-mask').filter({ has: overlay })
    await expect(mask).toBeVisible()
    await expect(mask).toHaveCSS('z-index', '4321')
    await expect(overlay.getByRole('heading', { name: `关闭检查${kind}`, level: 3 })).toBeVisible()
  })
  test(`${kind}可选择在本地挂载并保留关闭后的内容`, async ({ page }) => {
    await page.goto('/tests/e2e/fixtures/overlay-close-guard.html?preserve-content')
    await page.getByRole('button', { name: '允许原生关闭' }).click()
    await page.getByRole('button', { name: '允许业务关闭' }).click()
    await page.getByRole('button', { name: `打开${kind}`, exact: true }).click()
    const overlay = page.getByRole('dialog', { name: `关闭检查${kind}`, exact: true })
    await expect(overlay).toBeVisible()
    await expect(
      page.locator('main').getByRole('dialog', { name: `关闭检查${kind}`, exact: true })
    ).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(overlay).toBeHidden()
    await expect(page.locator('main').getByText('测试草稿保持完整', { exact: true })).toHaveCount(1)
  })
  test(`${kind}遮罩参数生效且默认保留遮罩`, async ({ page }) => {
    for (const modal of [true, false]) {
      await page.goto(`/tests/e2e/fixtures/overlay-close-guard.html${modal ? '' : '?no-modal'}`)
      await page.getByRole('button', { name: `打开${kind}`, exact: true }).click()
      const overlay = page.getByRole('dialog', { name: `关闭检查${kind}`, exact: true })
      await expect(overlay).toBeVisible()
      await expect(page.locator('.el-overlay').filter({ has: overlay })).toHaveCount(modal ? 1 : 0)
    }
  })
  test(`${kind}原生与自定义滚动条参数生效`, async ({ page }) => {
    for (const native of [false, true]) {
      await page.goto(
        `/tests/e2e/fixtures/overlay-close-guard.html${native ? '?native-scrollbar' : ''}`
      )
      await page.getByRole('button', { name: `打开${kind}`, exact: true }).click()
      const overlay = page.getByRole('dialog', { name: `关闭检查${kind}`, exact: true })
      await expect(overlay).toBeVisible()
      const wrap = overlay.locator('.el-scrollbar__wrap')
      if (native) await expect(wrap).not.toHaveClass(/el-scrollbar__wrap--hidden-default/)
      else await expect(wrap).toHaveClass(/el-scrollbar__wrap--hidden-default/)
      await expect(overlay.locator('.el-scrollbar__bar')).toHaveCount(native ? 0 : 2)
    }
  })
  test(`${kind}关闭入口属性可动态禁用与恢复`, async ({ page }) => {
    await page.goto('/tests/e2e/fixtures/overlay-close-guard.html?locked')
    await page.getByRole('button', { name: `打开${kind}`, exact: true }).click()
    const overlay = page.getByRole('dialog', { name: `关闭检查${kind}`, exact: true })
    await expect(overlay).toBeVisible()
    const closeButton = overlay.locator(
      '.el-dialog__headerbtn:not(.art-dialog__fullscreen-button), .el-drawer__close-btn'
    )
    await expect(closeButton).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(overlay).toBeVisible()
    await expect(page.getByTestId('close-counts')).toHaveText('{"native":0,"project":0}')
    await page
      .locator('.el-overlay')
      .filter({ has: overlay })
      .click({ position: { x: 1, y: 1 } })
    await expect(overlay).toBeVisible()
    await expect(page.getByTestId('close-counts')).toHaveText('{"native":0,"project":0}')
    await expect(page.locator('body')).toHaveClass(/el-popup-parent--hidden/)
    await page
      .getByRole('button', { name: '允许关闭入口', exact: true })
      .evaluate((element: HTMLButtonElement) => element.click())
    await expect(closeButton).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('close-counts')).toHaveText('{"native":1,"project":0}')
    await expect(overlay).toBeVisible()
  })
  test(`${kind}原生回调与业务检查均可阻止用户关闭`, async ({ page }, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/tests/e2e/fixtures/overlay-close-guard.html')
    await page.getByRole('button', { name: `打开${kind}`, exact: true }).click()
    const overlay = page.getByRole('dialog', { name: `关闭检查${kind}`, exact: true })
    await expect(overlay).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('close-counts')).toHaveText('{"native":1,"project":0}')
    await expect(overlay).toBeVisible()
    await page
      .getByRole('button', { name: '允许原生关闭', exact: true })
      .evaluate((element: HTMLButtonElement) => element.click())
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('close-counts')).toHaveText('{"native":2,"project":1}')
    await expect(overlay).toBeVisible()
    await overlay
      .locator('.el-dialog__headerbtn:not(.art-dialog__fullscreen-button), .el-drawer__close-btn')
      .last()
      .click()
    await expect(page.getByTestId('close-counts')).toHaveText('{"native":3,"project":2}')
    await expect(overlay.getByText('测试草稿保持完整')).toBeVisible()
    await overlay.getByRole('button', { name: '取消', exact: true }).click()
    await expect(page.getByTestId('close-counts')).toHaveText('{"native":3,"project":3}')
    await expect(overlay).toBeVisible()
    await overlay.screenshot({
      path: `.artifacts/overlay-close-${kind}-${testInfo.project.name}.png`
    })
    await page
      .getByRole('button', { name: '允许业务关闭', exact: true })
      .evaluate((element: HTMLButtonElement) => element.click())
    await page.keyboard.press('Escape')
    await expect(overlay).toBeHidden()
    await expect(page.getByTestId('close-counts')).toHaveText('{"native":4,"project":4}')
    expect(errors).toEqual([])
  })
}

for (const [label, selector] of [
  ['弹窗', '.art-dialog'],
  ['抽屉', '.art-drawer']
] as const) {
  test(`${label}打开后同步更新透传属性`, async ({ page }) => {
    await page.goto('/tests/e2e/fixtures/overlay-close-guard.html')
    await page.getByRole('button', { name: `打开${label}`, exact: true }).click()
    const overlay = page.locator(selector)
    await expect(overlay).toHaveClass(/initial-overlay-attributes/)
    await expect(overlay).toHaveAttribute('data-attribute-state', 'initial')
    await overlay.getByRole('button', { name: '更新弹层属性' }).click()
    await expect(overlay).toHaveClass(/updated-overlay-attributes/)
    await expect(overlay).not.toHaveClass(/initial-overlay-attributes/)
    await expect(overlay).toHaveAttribute('data-attribute-state', 'updated')
  })
}
