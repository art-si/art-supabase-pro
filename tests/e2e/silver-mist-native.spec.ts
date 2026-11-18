import { expect, test, type Locator } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(150_000)

const fixture = '/tests/e2e/fixtures/silver-mist-native.html'

async function readColor(element: Locator, property: string) {
  return element.evaluate((node, cssProperty) => {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) throw new Error('无法读取组件颜色')
    const style = getComputedStyle(node)
    const value = style.getPropertyValue(cssProperty)
    const color = cssProperty === 'box-shadow' ? value.match(/^[\w-]+\([^)]+\)/)?.[0] : value
    if (!color) throw new Error(`无法读取颜色：${value}`)
    context.fillStyle = style.getPropertyValue('--default-box-color') || '#fff'
    context.fillRect(0, 0, 1, 1)
    context.fillStyle = color
    context.fillRect(0, 0, 1, 1)
    return Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3))
  }, property)
}

function getContrast(first: number[], second: number[]) {
  const luminance = (color: number[]) => {
    const weights = [0.2126, 0.7152, 0.0722]
    return color.reduce((sum, value, index) => {
      const channel = value / 255
      const linear = channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
      return sum + linear * weights[index]!
    }, 0)
  }
  const a = luminance(first)
  const b = luminance(second)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

test('Silver Mist native component surfaces and interactions', async ({ page }, info) => {
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  const shadow = info.project.name.includes('shadow')
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${fixture}?theme=${theme}&box=${shadow ? 'shadow' : 'border'}`)
  await expect(page.getByRole('heading', { name: '银雾 · Element Plus 组件验收' })).toBeVisible({
    timeout: 90_000
  })

  for (const name of ['controls', 'navigation', 'feedback']) {
    await page.locator(`#${name}`).screenshot({
      path: info.outputPath(`${name}.png`),
      animations: 'disabled'
    })
  }

  const search = page.getByLabel('搜索设备', { exact: true })
  await search.fill('扫描')
  await page.getByRole('option', { name: '手持扫描仪', exact: true }).click()
  await expect(search).toHaveValue('手持扫描仪')

  const multiple = page.getByRole('combobox', { name: '虚拟多选', exact: true })
  await multiple.press('ArrowDown')
  const selection = page.locator('.el-select__popper:visible')
  await expect(selection.getByText('已停用', { exact: true })).toBeVisible()
  await expect(selection.locator('.el-select-dropdown__item.is-selected')).toHaveCount(2)
  await page.screenshot({ path: info.outputPath('virtual-select.png'), animations: 'disabled' })
  await multiple.press('Escape')
  await expect(selection).toBeHidden()

  const selectedButton = page.locator('.el-checkbox-button.is-checked .el-checkbox-button__inner')
  const text = await readColor(selectedButton, 'color')
  const fill = await readColor(selectedButton, 'background-color')
  expect(getContrast(text, fill)).toBeGreaterThanOrEqual(4.5)

  const dailyOption = page.locator('.el-radio').filter({
    has: page.getByRole('radio', { name: '每天', exact: true })
  })
  const daily = dailyOption.getByRole('radio')
  await expect(daily).not.toBeChecked()
  const radioRing = dailyOption.locator('.el-radio__inner')
  const radioBorder = await readColor(radioRing, 'border-top-color')
  const radioFill = await readColor(radioRing, 'background-color')
  expect(getContrast(radioBorder, radioFill)).toBeGreaterThanOrEqual(3)
  await daily.press('Space')
  await expect(daily).toBeChecked()

  const slider = page.getByRole('slider', { name: '使用率' })
  await slider.press('ArrowRight')
  await expect(slider).toHaveAttribute('aria-valuenow', '70')
  await expect(slider).toBeFocused()

  await page.locator('.el-color-picker__trigger').click()
  const color = page.locator('.el-color-picker__panel:visible')
  await expect(color).toBeVisible()
  await page.screenshot({ path: info.outputPath('color-picker.png'), animations: 'disabled' })
  await page.getByText('数值、时间与颜色', { exact: true }).click()
  await expect(color).toBeHidden()

  await page.getByLabel('开始时间', { exact: true }).click()
  const time = page.locator('.el-time-panel:visible')
  await expect(time.locator('.el-time-spinner__item.is-active').first()).toBeVisible()
  await page.screenshot({ path: info.outputPath('time-picker.png'), animations: 'disabled' })
  await page.keyboard.press('Escape')
  await expect(time).toBeHidden()

  await page.getByRole('button', { name: '打开对话框' }).click()
  const dialog = page.getByRole('dialog', { name: '核对批次' })
  await expect(dialog).toBeVisible()
  expect(await dialog.evaluate((element) => element.closest('#app') === null)).toBe(true)
  await page.screenshot({ path: info.outputPath('native-dialog.png'), animations: 'disabled' })
  await dialog.getByRole('button', { name: '完成' }).click()
  await expect(dialog).toBeHidden()

  await page.getByRole('button', { name: '打开抽屉' }).click()
  const drawer = page.getByRole('dialog', { name: '查看记录' })
  await expect(drawer.getByText('INV-001', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()

  await page.getByRole('button', { name: '轻量确认' }).click()
  const confirm = page.locator('.el-popconfirm:visible')
  await expect(confirm.getByText('是否清空筛选？', { exact: true })).toBeVisible()
  await confirm.getByRole('button', { name: '取消' }).click()
  await expect(confirm).toBeHidden()

  await page.getByRole('button', { name: '消息与通知' }).click()
  await expect(page.locator('.el-message:visible')).toContainText('有 2 条记录待复核')
  await expect(page.locator('.el-notification:visible')).toContainText('同步完成')
  await page.screenshot({ path: info.outputPath('notifications.png'), animations: 'disabled' })
  await page.locator('.el-notification__closeBtn').click()
  await page.locator('.el-message__closeBtn').click()

  await page.getByRole('button', { name: '打开引导' }).click()
  const tour = page.locator('.el-tour__content:visible')
  await expect(tour.getByText('工作台引导', { exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('guided-tour.png'), animations: 'disabled' })
  await tour.locator('.el-tour__closebtn').click()
  await expect(tour).toBeHidden()

  await page.getByRole('img', { name: '库区示意' }).click()
  const viewer = page.locator('.el-image-viewer__wrapper')
  await expect(viewer).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(viewer).toBeHidden()
  expect(errors).toEqual([])
})

test('Silver Mist styles default progress variants and keeps a dark popover readable', async ({
  page
}, info) => {
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  await page.goto(`${fixture}?theme=${theme}`)
  const progress = (name: string) => page.getByRole('progressbar', { name, exact: true })
  const line = progress('工作台处理进度').locator('.el-progress-bar__inner')
  const lineColor = await readColor(line, 'background-color')
  for (const name of ['库容使用进度', '批次处理进度']) {
    const ring = progress(name)
    const fill = await readColor(ring.locator('.el-progress-circle__path'), 'stroke')
    const track = await readColor(ring.locator('.el-progress-circle__track'), 'stroke')
    expect.soft(fill, `${name} and the default line use the same accent`).toEqual(lineColor)
    expect.soft(getContrast(fill, track), name).toBeGreaterThanOrEqual(3)
  }
  const completed = progress('对账完成进度').locator('.el-progress-circle__path')
  const completedLine = progress('工作台完成进度').locator('.el-progress-bar__inner')
  expect
    .soft(await readColor(completed, 'stroke'))
    .toEqual(await readColor(completedLine, 'background-color'))
  const custom = progress('分拣任务进度').locator('.el-progress-circle__path')
  expect.soft(await readColor(custom, 'stroke')).toEqual([128, 88, 202])
  await page.locator('#progress-variants').screenshot({
    path: info.outputPath('progress-variants.png'),
    animations: 'disabled'
  })

  await page.getByRole('button', { name: '仓库权限', exact: true }).click()
  const popover = page.locator('.el-popover:visible').filter({ hasText: '仓库权限帮助' })
  await expect(popover).toBeVisible()
  expect(await popover.evaluate((element) => element.closest('#app') === null)).toBe(true)
  const background = await readColor(popover, 'background-color')
  const title = await readColor(popover.getByText('仓库权限帮助'), 'color')
  expect.soft(getContrast(title, background)).toBeGreaterThanOrEqual(4.5)
  expect
    .soft(getContrast(await readColor(popover, 'color'), background))
    .toBeGreaterThanOrEqual(4.5)
  await page.screenshot({ path: info.outputPath('dark-popover.png'), animations: 'disabled' })
})

test('Silver Mist gives newer fields visible boundaries and keeps locked selections neutral', async ({
  page
}, info) => {
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  await page.goto(`${fixture}?theme=${theme}`)
  const fields = [
    page.locator('.el-input-tag').filter({ has: page.getByRole('textbox', { name: /^标签$/ }) }),
    page.locator('.el-input-otp--outlined .el-input-otp__input-field').first()
  ]
  for (const field of fields) {
    const fill = await readColor(field, 'background-color')
    const border = await readColor(field, 'box-shadow')
    expect.soft(getContrast(fill, border)).toBeGreaterThanOrEqual(3)
    const input = field.getByRole('textbox')
    await input.focus()
    await expect(input).toBeFocused()
    expect.soft(await readColor(field, 'box-shadow')).not.toEqual(border)
  }
  const otpDigits = page.locator('.el-input-otp--outlined .el-input-otp__input')
  await otpDigits.first().press('ArrowRight')
  await expect(otpDigits.nth(1)).toBeFocused()
  const disabledOtp = page.getByRole('group', { name: '已锁定验证码' })
  await expect(disabledOtp).toHaveClass(/el-input-otp--filled/)
  await expect(disabledOtp.getByRole('textbox').first()).toBeDisabled()

  const invalidInput = page.getByRole('textbox', { name: '分类标签', exact: true })
  const invalidTag = page.locator('.el-input-tag').filter({ has: invalidInput })
  await expect(page.getByText('至少添加一个分类标签')).toBeVisible()
  const errorStroke = await readColor(invalidTag, 'box-shadow')
  expect(errorStroke[0]).toBeGreaterThan(errorStroke[2]! + 30)
  await invalidInput.focus()
  expect(await readColor(invalidTag, 'box-shadow')).toEqual(errorStroke)

  const checkTag = page.getByText('已锁定筛选', { exact: true })
  await expect(checkTag).toHaveClass(/is-checked/)
  const disabledSegment = page.locator('.native-disabled-segmented .el-segmented__item.is-selected')
  await expect(disabledSegment.getByRole('radio')).toBeDisabled()
  for (const control of [checkTag, disabledSegment]) {
    const text = await readColor(control, 'color')
    expect.soft(Math.max(...text) - Math.min(...text)).toBeLessThanOrEqual(10)
  }
  await page.locator('#controls').screenshot({
    path: info.outputPath('native-input-states.png'),
    animations: 'disabled'
  })
  await page.locator('#progress-variants').screenshot({
    path: info.outputPath('native-disabled-check-tag.png'),
    animations: 'disabled'
  })
})

test('Silver Mist compact Transfer and standalone date picker', async ({ page }, info) => {
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  const shadow = info.project.name.includes('shadow')
  await page.setViewportSize({ width: 390, height: 820 })
  await page.goto(`${fixture}?theme=${theme}&box=${shadow ? 'shadow' : 'border'}`)
  const narrow = page.locator('.native-audit__split')
  const panels = narrow.locator('.el-transfer-panel')
  await expect(panels).toHaveCount(2)
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await expect
    .poll(() =>
      narrow.evaluate((section) => {
        const clip = section.closest('.el-card')!.getBoundingClientRect()
        const components = section.querySelectorAll('.el-transfer-panel, .el-date-picker')
        return Math.max(
          0,
          ...Array.from(components, (component) => {
            const { left, right } = component.getBoundingClientRect()
            return Math.max(clip.left - left, right - clip.right, right - innerWidth)
          })
        )
      })
    )
    .toBeLessThanOrEqual(1)
  await expect
    .poll(() =>
      narrow
        .locator('.el-transfer-panel__header-title')
        .evaluateAll((titles) =>
          Math.max(...titles.map((title) => title.scrollWidth - title.clientWidth))
        )
    )
    .toBeLessThanOrEqual(1)
  const transferAction = narrow.locator('.el-transfer__button').last()
  await expect(transferAction).toBeDisabled()
  const disabledFill = await readColor(transferAction, 'background-color')
  expect(Math.max(...disabledFill) - Math.min(...disabledFill)).toBeLessThanOrEqual(6)
  await panels.first().getByRole('checkbox', { name: '陈师傅', exact: true }).press('Space')
  await expect(transferAction).toBeEnabled()
  await transferAction.click()
  await expect(panels.last().getByText('陈师傅', { exact: true })).toBeVisible()
  await narrow.screenshot({
    path: info.outputPath('transfer-and-calendar-390.png'),
    animations: 'disabled'
  })
})

test('ordinary appearance does not inherit native Silver Mist tokens', async ({ page }, info) => {
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  await page.goto(`${fixture}?theme=${theme}&appearance=standard`)
  await expect(page.getByRole('heading', { name: '银雾 · Element Plus 组件验收' })).toBeVisible({
    timeout: 90_000
  })
  expect(
    await page
      .locator('.el-slider')
      .evaluate((element) =>
        getComputedStyle(element).getPropertyValue('--silver-mist-action').trim()
      )
  ).toBe('')
  const circle = page.getByRole('progressbar', { name: '库容使用进度', exact: true })
  expect(await readColor(circle.locator('.el-progress-circle__path'), 'stroke')).toEqual([
    32, 160, 255
  ])
  await page.locator('#controls').screenshot({
    path: info.outputPath('ordinary-controls.png'),
    animations: 'disabled'
  })
})
