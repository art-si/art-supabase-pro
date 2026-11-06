import type { InjectionKey } from 'vue'

/** An independently authenticated app can supply its server-issued permissions. */
export interface PlatformAuthContext {
  hasAuth: (permission: string) => boolean
  hasRole?: (role: string) => boolean
  /** Server-session consumers own identity and logout; the platform owns their UI. */
  account?: {
    user: () => { id: string; name: string; email: string; avatar?: string } | undefined
    logout: () => Promise<void>
  }
}

export const platformAuthContextKey: InjectionKey<PlatformAuthContext> =
  Symbol('platform-auth-context')
