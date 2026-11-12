export type WebsiteWatermarkContentType = 'username' | 'username_time' | 'site_name' | 'custom'
export type WebsiteCaptchaType = 'turnstile'
export type WebsiteTurnstileSize = 'normal' | 'compact' | 'flexible' | 'hidden'
export type WebsiteTurnstileTheme = 'light' | 'dark' | 'auto'
export type WebsiteDefaultLanguage = 'zh' | 'en'

export interface AuthChannel {
  key: string
  label: string
  provider: string
  icon: string
  description?: string | null
  scopes?: string | null
  queryParamName?: string | null
  queryParamValue?: string | null
  enabled: boolean
  allowLinking: boolean
}

/** Public website values, independent of browser globals and transport metadata. */
export interface WebsiteConfigValues {
  /** Allows mobile clients to offer the per-device Supabase storage choice. */
  noteStorageCloudEnabled?: boolean
  siteName: string
  siteShortName?: string | null
  siteDescription?: string | null
  logoUrl?: string | null
  faviconUrl?: string | null
  wordmarkImageEnabled: boolean
  wordmarkLightUrl?: string | null
  wordmarkDarkUrl?: string | null
  watermarkEnabled: boolean
  watermarkContentType: WebsiteWatermarkContentType
  watermarkCustomText?: string | null
  loginTitle: string
  loginSubtitle?: string | null
  loginDescription?: string | null
  defaultLanguage: WebsiteDefaultLanguage
  captchaEnabled: boolean
  captchaType: WebsiteCaptchaType
  turnstileSiteKey: string
  turnstileSize?: WebsiteTurnstileSize
  turnstileTheme?: WebsiteTurnstileTheme
  captchaMaxAttempts: number
  captchaLockMinutes: number
  registerEnabled: boolean
  authChannels: AuthChannel[]
  maintenanceEnabled: boolean
  maintenanceMessage?: string | null
  seoTitle?: string | null
  seoKeywords?: string | null
  seoDescription?: string | null
  contactEmail?: string | null
  contactPhone?: string | null
  contactAddress?: string | null
  copyrightText?: string | null
  icpRecord?: string | null
  policeRecord?: string | null
  enabled: boolean
}
