import { expect, test, type Locator, type Page } from '@playwright/test'
import { prepareAppearance } from './support/appearance'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })

interface SurfaceStyle {
  border: string
  shadow: string
  background: string
  radius: string
}

async function styleOf(locator: Locator): Promise<SurfaceStyle> {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      border: style.borderColor,
      shadow: style.boxShadow,
      background: style.backgroundColor,
      radius: style.borderRadius
    }
  })
}

function hasOuterShadow(shadow: string): boolean {
  return (
    shadow !== 'none' && shadow.split(/,(?![^()]*\))/).some((layer) => !layer.includes('inset'))
  )
}

async function expectOuterShadow(locator: Locator, expected: boolean): Promise<void> {
  await expect.poll(async () => hasOuterShadow((await styleOf(locator)).shadow)).toBe(expected)
}

async function setMode(page: Page, mode: 'border-mode' | 'shadow-mode'): Promise<void> {
  await page.getByRole('button', { name: mode === 'border-mode' ? '边框模式' : '阴影模式' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-box-mode', mode)
}

test('工作区表单静态阴影与图标 hover 阴影分层，切换即时生效', async ({ page }, testInfo) => {
  await prepareIsolatedSession(page)
  await page.goto('/tests/e2e/fixtures/box-mode-surfaces.html')
  await expect(page.locator('html')).toHaveAttribute('data-ui-scope', 'workspace')

  const input = page.getByRole('textbox', { name: '普通输入框' }).locator('xpath=..')
  const disabled = page.getByRole('textbox', { name: '禁用输入框' }).locator('xpath=..')
  const select = page.locator('.el-select__wrapper').first()
  const textarea = page.getByRole('textbox', { name: '备注', exact: true })
  const date = page.locator('.el-date-editor .el-input__wrapper').first()
  const icon = page.getByRole('button', { name: '刷新' })

  const border = await Promise.all([input, select, textarea, date].map(styleOf))
  expect(border.every((style) => !hasOuterShadow(style.shadow))).toBe(true)
  await setMode(page, 'shadow-mode')
  const shadow = await Promise.all([input, select, textarea, date].map(styleOf))
  expect(shadow.every((style) => hasOuterShadow(style.shadow))).toBe(true)
  expect(shadow.every((style) => style.shadow.includes('inset'))).toBe(true)
  expect(shadow.every((style, index) => style.shadow !== border[index].shadow)).toBe(true)
  expect(hasOuterShadow((await styleOf(disabled)).shadow)).toBe(false)
  await page.screenshot({ path: testInfo.outputPath('shadow-control-outline.png') })

  const iconRest = await styleOf(icon)
  await icon.hover()
  await expect.poll(async () => (await styleOf(icon)).shadow).not.toBe(iconRest.shadow)
  const iconHover = await styleOf(icon)
  expect(iconHover.shadow).not.toBe(shadow[0].shadow)
  await input.click()
  await expect.poll(async () => (await styleOf(input)).shadow).not.toBe(shadow[0].shadow)

  await setMode(page, 'border-mode')
  await expectOuterShadow(input, false)
  await setMode(page, 'shadow-mode')
  await expectOuterShadow(input, true)
})

test('可编辑表格内控件保持可见边界和焦点校验状态，表格外与图标 hover 分层', async ({ page }) => {
  await prepareIsolatedSession(page)
  await page.goto('/tests/e2e/fixtures/box-mode-surfaces.html')
  const outside = page.getByRole('textbox', { name: '普通输入框' }).locator('xpath=..')
  const table = page.getByRole('region', { name: '演示可编辑表格' })
  const editable = table.getByRole('textbox', { name: 'sample-1 备注' })
  const editableWrapper = editable.locator('xpath=..')
  const select = table
    .getByRole('combobox', { name: 'sample-2 优先级' })
    .locator('xpath=ancestor-or-self::*[contains(@class, "el-select__wrapper")][1]')
  const number = table
    .getByRole('spinbutton', { name: 'sample-3 数量' })
    .locator('xpath=ancestor-or-self::*[contains(@class, "el-input__wrapper")][1]')
  const invalid = table.getByRole('textbox', { name: 'sample-3 备注' }).locator('xpath=..')
  const icon = page.getByRole('button', { name: '刷新' })

  const borderInside = await styleOf(editableWrapper)
  const borderOutside = await styleOf(outside)
  const borderError = await styleOf(invalid)
  const dangerColor = await page.evaluate(() => {
    const marker = document.createElement('span')
    marker.style.color = 'var(--el-color-danger)'
    document.body.append(marker)
    const color = getComputedStyle(marker).color
    marker.remove()
    return color
  })
  expect(borderError.shadow).toContain(dangerColor)
  expect(borderError.shadow).not.toBe(borderInside.shadow)
  await expectOuterShadow(editableWrapper, false)
  await expectOuterShadow(outside, false)
  await setMode(page, 'shadow-mode')
  await expectOuterShadow(outside, true)
  for (const control of [editableWrapper, select, number, invalid]) {
    await expect.poll(async () => (await styleOf(control)).shadow).not.toBe('none')
    await expectOuterShadow(control, false)
  }
  const normal = await styleOf(editableWrapper)
  const error = await styleOf(invalid)
  expect(error.shadow).not.toBe(normal.shadow)
  await editable.focus()
  await expect.poll(async () => (await styleOf(editableWrapper)).shadow).not.toBe(normal.shadow)
  await expectOuterShadow(editableWrapper, false)
  const focused = await styleOf(editableWrapper)
  expect(focused.shadow).not.toBe(error.shadow)

  await icon.hover()
  await expectOuterShadow(icon, true)
  expect((await styleOf(icon)).shadow).not.toBe(normal.shadow)
  expect((await styleOf(outside)).shadow).not.toBe(normal.shadow)

  await editable.evaluate((element) => (element as HTMLInputElement).blur())
  await setMode(page, 'border-mode')
  await expectOuterShadow(editableWrapper, false)
  await expectOuterShadow(outside, false)
  expect(await styleOf(editableWrapper)).toEqual(borderInside)
  expect(await styleOf(outside)).toEqual(borderOutside)
  expect(await styleOf(invalid)).toEqual(borderError)
})

test('工作区卡片、菜单与 Teleport 浮层随模式和主题切换', async ({ page }, testInfo) => {
  await prepareIsolatedSession(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/tests/e2e/fixtures/box-mode-surfaces.html')

  const card = page.locator('.fixture-card')
  const menu = page.getByRole('menuitem', { name: '报表' })
  const borderCard = await styleOf(card)
  await menu.hover()
  const borderMenu = await styleOf(menu)
  await page.screenshot({ path: testInfo.outputPath('border-narrow.png') })
  await setMode(page, 'shadow-mode')
  await expectOuterShadow(card, true)
  await menu.hover()
  const shadowMenu = await styleOf(menu)
  expect(shadowMenu.shadow).not.toBe(borderMenu.shadow)
  expect((await styleOf(card)).shadow).not.toBe(borderCard.shadow)
  await page.screenshot({ path: testInfo.outputPath('shadow-narrow.png') })

  await page.getByRole('button', { name: '打开菜单' }).click()
  const dropdown = page.locator('.el-popper:visible').filter({ hasText: '刷新数据' })
  await expect(dropdown).toBeVisible()
  expect(hasOuterShadow((await styleOf(dropdown)).shadow)).toBe(true)
  const dropdownItem = dropdown.locator('.el-dropdown-menu__item').filter({ hasText: '刷新数据' })
  const dropdownItemRest = await styleOf(dropdownItem)
  await dropdownItem.hover()
  await expect
    .poll(async () => (await styleOf(dropdownItem)).background)
    .not.toBe(dropdownItemRest.background)
  expect((await styleOf(dropdownItem)).radius).not.toBe('0px')
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: '打开提示' }).click()
  const popover = page.locator('.el-popper:visible').filter({ hasText: '操作提示' })
  await expect(popover).toBeVisible()
  expect(hasOuterShadow((await styleOf(popover)).shadow)).toBe(true)
  await page.keyboard.press('Escape')

  await page.locator('.el-select__wrapper').first().click()
  const selectPopper = page.locator('.el-popper:visible').filter({ hasText: '启用' })
  await expect(selectPopper).toBeVisible()
  expect(hasOuterShadow((await styleOf(selectPopper)).shadow)).toBe(true)
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: '打开弹窗' }).click()
  const dialog = page.getByRole('dialog', { name: '测试弹窗' })
  await expect(dialog).toBeVisible()
  expect(hasOuterShadow((await styleOf(page.locator('.el-dialog:visible'))).shadow)).toBe(true)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  await page.getByRole('button', { name: '打开抽屉' }).click()
  const drawer = page.getByRole('dialog', { name: '测试抽屉' })
  await expect(drawer).toBeVisible()
  expect(hasOuterShadow((await styleOf(page.locator('.el-drawer:visible'))).shadow)).toBe(true)
  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()

  await page.getByRole('button', { name: '深色主题' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await setMode(page, 'border-mode')
  await expectOuterShadow(card, false)
  await page.screenshot({ path: testInfo.outputPath('border-dark-narrow.png') })
  await setMode(page, 'shadow-mode')
  await expectOuterShadow(card, true)
  await page.screenshot({ path: testInfo.outputPath('shadow-dark-narrow.png') })
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  )
  expect(overflow).toBeLessThanOrEqual(1)
})

test('认证页在两种已保存盒子模式下维持同一输入框、卡片和提交按钮样式', async ({
  context
}, testInfo) => {
  const snapshots: SurfaceStyle[][] = []
  for (const boxBorderMode of [true, false]) {
    const page = await context.newPage()
    await prepareAppearance(page, { theme: 'light', boxBorderMode })
    await page.goto('#/auth/login', { waitUntil: 'domcontentloaded' })
    const form = page.locator('.auth-right-wrap .form')
    await expect(form).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('html')).toHaveAttribute('data-ui-scope', 'public')
    const input = page.locator('input[name="username"]').locator('xpath=..')
    const submit = page.locator('button[type="submit"]')
    const baseline = await Promise.all([form, input, submit].map(styleOf))
    await input.hover()
    await page.waitForTimeout(250)
    const hovered = await styleOf(input)
    await input.click()
    await page.waitForTimeout(250)
    const focused = await styleOf(input)
    snapshots.push([...baseline, hovered, focused])
    await page.screenshot({
      path: testInfo.outputPath(
        boxBorderMode ? 'login-border-setting.png' : 'login-shadow-setting.png'
      )
    })
    await page.close()
  }
  expect(snapshots[0]).toEqual(snapshots[1])
})
