/** Stable built-in identities are security protocol constants, not editable system parameters. */
export const ROLE_BUILTIN_TYPES = {
  PLATFORM_SUPER: 'platform_super',
  DEFAULT_REGISTER: 'default_register',
  TENANT_ADMIN: 'tenant_admin',
  MEMBER: 'member'
} as const

export function isProtectedAdminRole(builtinType?: string | null): boolean {
  return (
    builtinType === ROLE_BUILTIN_TYPES.PLATFORM_SUPER ||
    builtinType === ROLE_BUILTIN_TYPES.TENANT_ADMIN
  )
}

export function isBuiltinMemberRole(builtinType?: string | null): boolean {
  return (
    builtinType === ROLE_BUILTIN_TYPES.DEFAULT_REGISTER || builtinType === ROLE_BUILTIN_TYPES.MEMBER
  )
}

/** Role codes used only by the static/demo routing mode. Business authorization uses server capabilities. */
export const BUILTIN_ROLE_CODES = {
  PLATFORM_SUPER: 'R_SUPER'
} as const
