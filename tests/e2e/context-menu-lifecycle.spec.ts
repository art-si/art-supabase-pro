import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.setTimeout(90_000)
test('公共菜单在各主题下保留 hover、焦点和禁用反馈', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  await page.goto('/tests/e2e/fixtures/context-menu-lifecycle.html')
  await page.getByRole('button', { name: '打开菜单', exact: true }).click()
  const item = page.getByRole('menuitem', { name: '选择操作', exact: true })
  const disabled = page.getByRole('menuitem', { name: '不可用操作' })
  const background = () => item.evaluate((el) => getComputedStyle(el).backgroundColor)
  for (const dark of [false, true]) {
    for (const box of ['border-mode', 'shadow-mode']) {
      await page.evaluate(
        ({ dark, box }) => {
          document.documentElement.classList.toggle('dark', dark)
          document.documentElement.dataset.boxMode = box
          document.documentElement.style.setProperty(
            '--el-color-primary',
            dark ? '#10B981' : '#EC4899'
          )
        },
        { dark, box }
      )
      await page.mouse.move(0, 0)
      await expect.poll(background).toBe('rgba(0, 0, 0, 0)')
      await item.hover()
      await expect.poll(background).not.toBe('rgba(0, 0, 0, 0)')
      expect(await background()).toBe(
        await item
          .evaluate((el) => getComputedStyle(el).getPropertyValue('--art-hover-color').trim())
          .then((hex) => {
            const rgb = hex
              .slice(1)
              .match(/../g)!
              .map((value) => Number.parseInt(value, 16))
            return `rgb(${rgb.join(', ')})`
          })
      )
      await page.screenshot({
        path: info.outputPath(`hover-${dark ? 'dark' : 'light'}-${box}.png`)
      })
      await disabled.hover({ force: true })
      expect(await disabled.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
        'rgba(0, 0, 0, 0)'
      )
      await page.keyboard.press('Tab')
      await item.focus()
      await expect(item).toBeFocused()
      await expect.poll(background).not.toBe('rgba(0, 0, 0, 0)')
      await item.evaluate((el) => (el as HTMLButtonElement).blur())
    }
  }
})
test('多实例菜单内部点击、连续开关和卸载保持正确监听', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/tests/e2e/fixtures/context-menu-lifecycle.html')
  await page.clock.install()
  const open = page.getByRole('button', { name: '打开菜单', exact: true })
  const group = page.getByRole('menuitem', { name: '更多操作', exact: true })
  const advance = () => page.clock.runFor(200)
  await open.click()
  await advance()
  await group.click()
  await expect(group).toBeVisible()
  await expect(page.getByRole('menuitem', { name: '不可用操作' })).toBeDisabled()
  for (const item of await page.getByRole('menuitem').all()) {
    const geometry = await item.evaluate((element) => {
      const icon = element.querySelector('.art-svg-icon')!.getBoundingClientRect()
      const label = element.querySelector('.menu-label')!.getBoundingClientRect()
      return {
        gap: label.left - icon.right,
        center: Math.abs((icon.top + icon.bottom - label.top - label.bottom) / 2),
        ratio: icon.width / Number.parseFloat(getComputedStyle(element).fontSize),
        clipped:
          element.querySelector('.menu-label')!.scrollWidth >
          element.querySelector('.menu-label')!.clientWidth
      }
    })
    expect(geometry.gap).toBeCloseTo(8, 1)
    expect(geometry.center).toBeLessThanOrEqual(0.5)
    expect(geometry.ratio).toBeCloseTo(16 / 14, 1)
    expect(geometry.clipped).toBe(false)
  }
  await page.screenshot({ path: info.outputPath('context-menu.png') })
  await page.keyboard.press('Escape')
  await advance()
  await expect(group).toBeHidden()
  await expect(page.getByLabel('关闭次数')).toHaveText('1')
  await open.click()
  await page.getByRole('button', { name: '关闭菜单', exact: true }).click()
  await open.click()
  await advance()
  await page.getByRole('menuitem', { name: '选择操作', exact: true }).click()
  await advance()
  await expect(group).toBeHidden()
  await expect(page.getByLabel('选择次数')).toHaveText('1')
  await open.click()
  await page.getByRole('button', { name: '切换组件', exact: true }).click()
  await advance()
  const count = await page.getByLabel('关闭次数').textContent()
  await page.keyboard.press('Escape')
  await expect(page.getByLabel('关闭次数')).toHaveText(count ?? '')
  await page.getByRole('button', { name: '切换组件', exact: true }).click()
  await open.click()
  await advance()
  await group.click()
  await expect(group).toBeVisible()
  await page.getByRole('button', { name: '关闭菜单', exact: true }).click()
  await advance()
  await expect(group).toBeHidden()
  expect(errors).toEqual([])
})
