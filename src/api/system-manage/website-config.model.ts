import { createWebsiteConfigDefaults } from '@/config/website-config-defaults'
import type { WebsiteConfigValues } from '@/types/platform/website-config'
import { normalizeAuthChannels } from '@/utils/supabase/auth-channels'
import { isPlainObjectRecord } from '@/utils/type-guards'

type NullableWebsiteField = {
  [K in keyof WebsiteConfigValues]-?: null extends WebsiteConfigValues[K] ? K : never
}[keyof WebsiteConfigValues]

const nullableFields = new Set<keyof WebsiteConfigValues>([
  'siteShortName',
  'siteDescription',
  'logoUrl',
  'faviconUrl',
  'wordmarkLightUrl',
  'wordmarkDarkUrl',
  'watermarkCustomText',
  'loginSubtitle',
  'loginDescription',
  'turnstileSiteKey',
  'maintenanceMessage',
  'seoTitle',
  'seoKeywords',
  'seoDescription',
  'contactEmail',
  'contactPhone',
  'contactAddress',
  'copyrightText',
  'icpRecord',
  'policeRecord'
] satisfies NullableWebsiteField[])

const choices: Partial<Record<keyof WebsiteConfigValues, readonly string[]>> = {
  defaultLanguage: ['zh', 'en'],
  watermarkContentType: ['username', 'username_time', 'site_name', 'custom'],
  captchaType: ['turnstile'],
  turnstileSize: ['normal', 'compact', 'flexible', 'hidden'],
  turnstileTheme: ['light', 'dark', 'auto']
}

/** Validate each public setting independently so one invalid value cannot disable the login page. */
export function decodeWebsiteConfig(
  value: unknown
): (WebsiteConfigValues & { version?: number }) | null {
  if (!isPlainObjectRecord(value)) return null

  const config = createWebsiteConfigDefaults()
  for (const key of Object.keys(config) as (keyof WebsiteConfigValues)[]) {
    const field = value[key]
    if (key === 'authChannels') {
      if (field != null) config.authChannels = normalizeAuthChannels(field)
      continue
    }
    if (field === null && nullableFields.has(key)) {
      Object.assign(config, { [key]: null })
      continue
    }
    const options = choices[key]
    if (
      field == null ||
      typeof field !== typeof config[key] ||
      (typeof field === 'number' && !Number.isFinite(field)) ||
      (options && (typeof field !== 'string' || !options.includes(field)))
    )
      continue
    Object.assign(config, { [key]: field })
  }

  // The editor republishes the JSON document, including settings owned by other clients.
  const extensions = Object.fromEntries(
    Object.entries(value).filter(
      ([key]) => !['__proto__', 'constructor', 'prototype', 'version'].includes(key)
    )
  )
  const { version } = value
  return {
    ...extensions,
    ...config,
    ...(typeof version === 'number' && Number.isSafeInteger(version) && version >= 0
      ? { version }
      : {})
  }
}
