import type { InjectionKey } from 'vue'

/** An independently authenticated app can supply its server-issued permissions. */
export interface PlatformAuthContext {
  hasAuth: (permission: string) => boolean
  hasRole?: (role: string) => boolean
}

export const platformAuthContextKey: InjectionKey<PlatformAuthContext> =
  Symbol('platform-auth-context')
