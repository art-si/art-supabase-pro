import { expect, test } from '@playwright/test'
import { contrast } from './text-contrast'

test('公共表单清晰区分占位提示、已填写值和禁用值', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/tests/e2e/fixtures/neutral-text-colors.html')
  await expect(page.locator('[data-kind]')).toHaveCount(6)
  for (const dark of [false, true]) {
    for (const box of ['border-mode', 'shadow-mode']) {
      await page.evaluate(
        ({ dark, box }) => {
          document.documentElement.classList.toggle('dark', dark)
          document.documentElement.dataset.boxMode = box
        },
        { dark, box }
      )
      for (const group of await page.locator('[data-kind]').all()) {
        const colors = await group.evaluate((element) => {
          const select = ['select', 'tree'].includes(element.getAttribute('data-kind') ?? '')
          const color = (state: string) => {
            const control = element.querySelector(`[data-state="${state}"]`)!
            const text = select
              ? control.querySelector('.el-select__placeholder')!
              : control.matches('input, textarea')
                ? control
                : control.querySelector('input, textarea')!
            return getComputedStyle(text, state === 'empty' && !select ? '::placeholder' : null)
              .color
          }
          const roles = document.querySelectorAll('.neutral-text')
          return {
            selected: color('selected'),
            empty: color('empty'),
            disabled: color('disabled'),
            regular: getComputedStyle(roles[1]).color
          }
        })
        expect(colors.selected).toBe(colors.regular)
        expect(colors.empty).not.toBe(colors.selected)
        expect(colors.disabled).not.toBe(colors.selected)
        const selected = colors.selected.match(/\d+/g)!.slice(0, 3).map(Number)
        const empty = colors.empty.match(/\d+/g)!.slice(0, 3).map(Number)
        expect(
          Math.abs(selected.reduce((a, b) => a + b) - empty.reduce((a, b) => a + b)) / 3
        ).toBeGreaterThan(40)
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      )
      await page.screenshot({
        path: info.outputPath(`controls-${dark ? 'dark' : 'light'}-${box}.png`),
        fullPage: true
      })
    }
  }
  expect(errors).toEqual([])
})
test('公共中性文字在主题和浅填充背景上可读', async ({ page }, info) => {
  await page.goto('/tests/e2e/fixtures/neutral-text-colors.html')
  await expect(page.locator('.neutral-text')).toHaveCount(6)
  for (const dark of [false, true])
    for (const box of ['border-mode', 'shadow-mode']) {
      await page.evaluate(
        ({ dark, box }) => {
          document.documentElement.classList.toggle('dark', dark)
          document.documentElement.dataset.boxMode = box
        },
        { dark, box }
      )
      for (const text of await page.locator('.neutral-text').all())
        expect(
          await contrast(text),
          String(dark) + ' ' + (await text.textContent())
        ).toBeGreaterThanOrEqual(4.5)
      await page.screenshot({
        path: info.outputPath((dark ? 'dark' : 'light') + '-' + box + '.png')
      })
    }
})

test('下拉选中态保留 Element Plus 默认主题色和加粗', async ({ page }, info) => {
  await page.goto('/tests/e2e/fixtures/neutral-text-colors.html')
  for (const dark of [false, true]) {
    for (const color of ['#EC4899', '#10B981', '#F59E0B']) {
      await page.evaluate(
        ({ dark, color }) => {
          document.documentElement.classList.toggle('dark', dark)
          document.documentElement.style.setProperty('--el-color-primary', color)
        },
        { dark, color }
      )
      await page.locator('[data-kind="select"] [data-state="selected"] .el-select').click()
      const selected = page.getByRole('option', { name: '是', exact: true })
      const other = page.getByRole('option', { name: '否', exact: true })
      await other.hover()
      await expect(selected).toHaveAttribute('aria-selected', 'true')
      await expect(selected).toHaveCSS('font-weight', '700')
      await expect(selected).toHaveCSS('box-shadow', 'none')
      const expectedColor = await page.evaluate(() => {
        const probe = document.createElement('span')
        probe.style.color = 'var(--el-color-primary)'
        document.body.append(probe)
        const result = getComputedStyle(probe).color
        probe.remove()
        return result
      })
      await expect(selected).toHaveCSS('color', expectedColor)
      await expect(selected).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
      const disabled = page.getByRole('option', { name: '禁用选项', exact: true })
      await expect(disabled).toHaveAttribute('aria-disabled', 'true')
      await disabled.hover({ force: true })
      await expect(selected).toHaveAttribute('aria-selected', 'true')
      await page.screenshot({
        path: info.outputPath(
          'selected-' + (dark ? 'dark' : 'light') + '-' + color.slice(1) + '.png'
        )
      })
      await page.keyboard.press('Escape')
    }
  }
})
