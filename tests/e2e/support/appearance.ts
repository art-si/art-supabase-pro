import type { Page } from '@playwright/test'
import { loadEnv } from 'vite'

const appVersion = loadEnv('e2e', process.cwd(), '').VITE_VERSION

interface Appearance {
  theme: 'light' | 'dark'
  boxBorderMode: boolean
}

/** Seed the actual persisted settings before bootstrap; leave credentials and user state untouched. */
export const prepareAppearance = async (page: Page, appearance: Appearance): Promise<void> => {
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
