import { expect, test, type Page } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

type MotionEvent = { surface: string; property: string; phase: string }

declare global {
  interface Window {
    silverMotionEvents: MotionEvent[]
  }
}

const gallery = '/tests/e2e/fixtures/silver-mist-native.html'

async function openGallery(page: Page, theme: string, reduced: boolean, draggable = false) {
  await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' })
  await page.addInitScript(() => {
    window.silverMotionEvents = []
    const surfaces = [
      'el-dialog',
      'el-drawer',
      'el-select__popper',
      'el-image-viewer__wrapper',
      'el-message',
      'el-notification'
    ]
    document.addEventListener('transitionrun', (event) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      const surface = surfaces.find((name) => target.classList.contains(name))
      if (!surface) return
      const parent = target.closest('[class*="-enter-active"], [class*="-leave-active"]')
      const phase = String(parent?.className).includes('-leave-active') ? 'leave' : 'enter'
      window.silverMotionEvents.push({ surface, property: event.propertyName, phase })
    })
  })
  await page.goto(`${gallery}?theme=${theme}${draggable ? '&draggable' : ''}`, {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.getByRole('heading', { name: '银雾 · Element Plus 组件验收' })).toBeVisible({
    timeout: 60_000
  })
}

async function openAndCloseSheet(page: Page, trigger: string, name: string) {
  const open = page.getByRole('button', { name: trigger, exact: true })
  const dialog = page.getByRole('dialog', { name, exact: true })
  await open.click()
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(open).toBeFocused()
}

test('Silver Mist uses directional sheets and unscaled popup text in both directions', async ({
  page
}, info) => {
  await openGallery(page, info.project.use.colorScheme ?? 'light', false)
  const readEvents = () => page.evaluate(() => window.silverMotionEvents)
  const opened = { surface: 'el-dialog', property: 'translate', phase: 'enter' }
  const closed = { surface: 'el-dialog', property: 'translate', phase: 'leave' }
  const open = page.getByRole('button', { name: '打开对话框', exact: true })
  const dialog = page.getByRole('dialog', { name: '核对批次', exact: true })
  await open.click()
  await expect.poll(readEvents).toContainEqual(opened)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(open).toBeFocused()
  await expect.poll(readEvents).toContainEqual(closed)
  await openAndCloseSheet(page, '打开抽屉', '查看记录')
  await expect.poll(readEvents).toContainEqual({
    surface: 'el-drawer',
    property: 'transform',
    phase: 'leave'
  })

  const select = page.getByRole('combobox', { name: '虚拟多选', exact: true })
  await select.press('ArrowDown')
  await expect(select).toHaveAttribute('aria-expanded', 'true')
  await expect.poll(readEvents).toContainEqual({
    surface: 'el-select__popper',
    property: 'opacity',
    phase: 'enter'
  })
  await select.press('Escape')
  await expect(select).toHaveAttribute('aria-expanded', 'false')
  const popupProperties = (await readEvents())
    .filter(({ surface }) => surface === 'el-select__popper')
    .map(({ property }) => property)
  expect(popupProperties).not.toContain('transform')

  const imagePreview = page.locator('.el-image-viewer__wrapper')
  await page.getByRole('img', { name: '库区示意' }).click()
  await expect(imagePreview).toBeVisible()
  await expect.poll(readEvents).toContainEqual({
    surface: 'el-image-viewer__wrapper',
    property: 'opacity',
    phase: 'enter'
  })
  await page.keyboard.press('Escape')
  await expect(imagePreview).toBeHidden()
  expect(
    (await readEvents()).filter(
      ({ surface, property }) => surface === 'el-image-viewer__wrapper' && property === 'transform'
    )
  ).toEqual([])

  await page.getByRole('button', { name: '消息与通知', exact: true }).click()
  await expect
    .poll(readEvents)
    .toEqual(
      expect.arrayContaining([
        expect.objectContaining({ surface: 'el-message', property: 'translate' }),
        expect.objectContaining({ surface: 'el-notification', property: 'opacity' })
      ])
    )
  await info.attach('browser-transition-events', {
    contentType: 'application/json',
    body: JSON.stringify(await readEvents(), null, 2)
  })
})

test('reduced motion keeps keyboard dismissal and focus restoration', async ({ page }, info) => {
  await openGallery(page, info.project.use.colorScheme ?? 'light', true)
  await openAndCloseSheet(page, '打开对话框', '核对批次')
  await openAndCloseSheet(page, '打开抽屉', '查看记录')
  const events = await page.evaluate(() => window.silverMotionEvents)
  expect(
    events.filter(({ property }) => ['translate', 'scale', 'transform'].includes(property))
  ).toEqual([])
})

test('a dialog dragged during entry stays in the viewport when the fade ends', async ({
  page
}, info) => {
  await openGallery(page, info.project.use.colorScheme ?? 'light', false, true)
  const trigger = page.getByRole('button', { name: '打开对话框', exact: true })
  const dialog = page.getByRole('dialog', { name: '核对批次', exact: true })
  await trigger.focus()

  const drag = await trigger.evaluate(async (button) => {
    if (!(button instanceof HTMLButtonElement)) throw new Error('Expected a dialog trigger button')
    button.click()
    let overlay: HTMLElement | null = null
    let fade: Animation | undefined
    for (let frame = 0; frame < 30 && !fade; frame++) {
      await new Promise(requestAnimationFrame)
      overlay = document.querySelector<HTMLElement>('.dialog-fade-enter-active')
      fade = overlay
        ?.getAnimations()
        .find(
          (motion) => motion instanceof CSSTransition && motion.transitionProperty === 'opacity'
        )
    }
    const panel = overlay?.querySelector<HTMLElement>('.el-dialog.is-draggable')
    const header = panel?.querySelector<HTMLElement>('.el-dialog__header')
    if (!fade || !panel || !header) throw new Error('The draggable dialog did not start fading in')

    const animations = [fade, ...panel.getAnimations()]
    // Pin the animations to entry so the native drag always starts before they can finish.
    for (const animation of animations) {
      animation.pause()
      animation.currentTime = 1
    }
    const start = panel.getBoundingClientRect()
    const bounds = header.getBoundingClientRect()
    const pointerY = bounds.top + 12
    const viewportRight = document.documentElement.clientWidth
    header.dispatchEvent(
      new MouseEvent('mousedown', {
        bubbles: true,
        clientX: bounds.left + 30,
        clientY: pointerY
      })
    )
    document.dispatchEvent(
      new MouseEvent('mousemove', {
        bubbles: true,
        buttons: 1,
        clientX: viewportRight - 1,
        clientY: pointerY
      })
    )
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))

    for (const animation of animations) animation.finish()
    await new Promise(requestAnimationFrame)
    const end = panel.getBoundingClientRect()
    return { moved: end.left - start.left, right: end.right, viewportRight }
  })

  expect(drag.moved).toBeGreaterThan(0)
  expect(drag.right).toBeCloseTo(drag.viewportRight, 0)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
})
