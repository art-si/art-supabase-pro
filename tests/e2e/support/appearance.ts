import { expect, type Page } from '@playwright/test'
import { loadEnv } from 'vite'

const appVersion = loadEnv('e2e', process.cwd(), '').VITE_VERSION

interface Appearance {
  theme: 'light' | 'dark'
  boxBorderMode: boolean
}

/** Seed the actual persisted settings before bootstrap; leave credentials and user state untouched. */
export const prepareAppearance = async (page: Page, appearance: Appearance): Promise<void> => {
  await page.emulateMedia({ colorScheme: appearance.theme })
  await page.addInitScript(
    ({ appearance, version }) => {
      const existingKeys = Object.keys(localStorage).filter((key) =>
        /^sys-v[^-]+-setting$/.test(key)
      )
      const keys = existingKeys.length ? existingKeys : [`sys-v${version}-setting`]
      for (const key of keys) {
        const stored: unknown = JSON.parse(localStorage.getItem(key) || '{}')
        const settings =
          typeof stored === 'object' && stored !== null && !Array.isArray(stored) ? stored : {}
        localStorage.setItem(
          key,
          JSON.stringify({
            ...settings,
            systemThemeType: appearance.theme,
            systemThemeMode: appearance.theme,
            boxBorderMode: appearance.boxBorderMode,
            showSettingGuide: false
          })
        )
      }
    },
    { appearance, version: appVersion }
  )
}

export async function assertAppearance(page: Page, appearance: Appearance): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => ({
        dark: document.documentElement.classList.contains('dark'),
        box: document.documentElement.dataset.boxMode
      }))
    )
    .toEqual({
      dark: appearance.theme === 'dark',
      box: appearance.boxBorderMode ? 'border-mode' : 'shadow-mode'
    })
}

export async function applyAppearance(page: Page, appearance: Appearance): Promise<void> {
  await page.getByRole('button', { name: '打开界面设置', exact: true }).click()
  const studio = page.getByRole('dialog').filter({ has: page.locator('.setting-header') })
  await expect(studio).toBeVisible()
  const manual = studio.getByRole('button', { name: /精细配置/ })
  if ((await manual.getAttribute('aria-expanded')) !== 'true') await manual.click()
  await studio
    .getByRole('button', {
      name: appearance.theme === 'dark' ? '深色主题' : '浅色主题',
      exact: true
    })
    .click()
  await studio
    .getByRole('button', { name: appearance.boxBorderMode ? '边框' : '阴影', exact: true })
    .click()
  await studio.getByRole('button', { name: '关闭界面设置', exact: true }).click()
  await expect(studio).toBeHidden()
  await assertAppearance(page, appearance)
}
