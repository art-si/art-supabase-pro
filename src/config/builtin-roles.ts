/** Stable built-in identities are security protocol constants, not editable system parameters. */
export const ROLE_BUILTIN_TYPES = {
  PLATFORM_SUPER: 'platform_super',
  DEFAULT_REGISTER: 'default_register'
} as const

/** Role codes used only by the static/demo routing mode. Business authorization uses server capabilities. */
export const BUILTIN_ROLE_CODES = {
  PLATFORM_SUPER: 'R_SUPER'
} as const
