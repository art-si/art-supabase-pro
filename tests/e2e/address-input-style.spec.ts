import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(120_000)

test('详细地址输入与附加动作在主题、焦点和窄屏下保持一体', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  await page.route('**/src/hooks/core/useAmapGeolocation.ts*', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `export function useAmapGeolocation() {
        return { getCurrentLocation(signal) {
          return new Promise((resolve, reject) => signal?.addEventListener(
            'abort', () => reject(new Error('aborted')), { once: true }
          ));
        } };
      }`
    })
  )
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/tests/e2e/fixtures/address-input-style.html')
  const loading = page.locator('[data-state="locating"]')
  await loading.getByRole('button', { name: '定位当前位置' }).click()
  await expect(loading.locator('.is-loading:visible')).toHaveCount(1)
  const errorField = page.locator('[data-state="error"]')
  await errorField.getByRole('textbox').focus()
  await errorField.getByRole('textbox').blur()
  await expect(errorField.getByText('请填写详细地址', { exact: true })).toBeVisible()

  for (const width of [1440, 900, 390]) {
    await page.setViewportSize({ width, height: 900 })
    for (const dark of [false, true]) {
      let borderShadow = ''
      for (const boxMode of ['border-mode', 'shadow-mode']) {
        await page.evaluate(
          ({ dark, boxMode }) => {
            document.documentElement.classList.toggle('dark', dark)
            document.documentElement.dataset.theme = dark ? 'dark' : 'light'
            document.documentElement.dataset.boxMode = boxMode
            document.documentElement.dataset.uiScope = 'workspace'
          },
          { dark, boxMode }
        )
        await expect(page.locator('html')).toHaveAttribute('data-ui-scope', 'workspace')
        await page.mouse.move(0, 0)
        const neutralShadow = await page
          .locator('[data-state="filled"] .art-address-picker__address-input')
          .evaluate((element) => getComputedStyle(element).boxShadow)
        if (boxMode === 'border-mode') borderShadow = neutralShadow
        else {
          expect(neutralShadow).not.toBe(borderShadow)
          expect(
            neutralShadow
              .split(/,(?![^()]*\))/)
              .some((layer) => layer.trim() !== 'none' && !layer.includes('inset'))
          ).toBe(true)
        }
        const empty = page.locator('[data-state="empty"]')
        const input = empty.getByRole('textbox')
        await input.focus()
        await expect(input).toBeFocused()
        const focusSurface = await empty
          .locator('.art-address-picker__address-input')
          .evaluate((element) => ({
            outer: getComputedStyle(element).boxShadow,
            inner: getComputedStyle(element.querySelector('.el-input__wrapper')!).boxShadow
          }))
        expect(focusSurface.inner).toBe('none')
        expect(focusSurface.outer).not.toBe(neutralShadow)
        const errorSurface = await errorField
          .locator('.art-address-picker__address-input')
          .evaluate((element) => ({
            outer: getComputedStyle(element).boxShadow,
            inner: getComputedStyle(element.querySelector('.el-input__wrapper')!).boxShadow,
            color: getComputedStyle(
              element.closest('.el-form-item')!.querySelector('.el-form-item__error')!
            ).color
          }))
        expect(errorSurface.inner).toBe('none')
        expect(errorSurface.outer).toContain(errorSurface.color)
        await expect(page.locator('[data-state="disabled"]').getByRole('textbox')).toBeDisabled()
        await expect(loading.getByRole('button', { name: '定位当前位置' })).toBeDisabled()
        if (width > 600) {
          const geometry = await empty.locator('.el-input-group').evaluate((element) => {
            const wrapper = element.querySelector('.el-input__wrapper')!
            const append = element.querySelector('.el-input-group__append')!
            const button = append.querySelector('button')!
            const buttonStyle = getComputedStyle(button)
            return {
              heightDifference: Math.abs(
                wrapper.getBoundingClientRect().height - append.getBoundingClientRect().height
              ),
              shadow: buttonStyle.boxShadow,
              radii: [
                buttonStyle.borderTopLeftRadius,
                buttonStyle.borderTopRightRadius,
                buttonStyle.borderBottomLeftRadius,
                buttonStyle.borderBottomRightRadius
              ]
            }
          })
          expect(geometry.heightDifference).toBeLessThanOrEqual(1)
          expect(geometry.shadow).toBe('none')
          expect(geometry.radii).toEqual(['0px', '0px', '0px', '0px'])
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true
        )
        await page.screenshot({
          path: info.outputPath(`address-${width}-${dark ? 'dark' : 'light'}-${boxMode}.png`),
          fullPage: true,
          animations: 'disabled'
        })
        if (width > 600) {
          await empty.getByRole('button', { name: '打开地图选择地址' }).focus()
          await expect(empty.getByRole('button', { name: '打开地图选择地址' })).toBeFocused()
        }
      }
    }
  }
  expect(errors).toEqual([])
})
