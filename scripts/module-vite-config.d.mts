import type { UserConfig } from 'vite'

export interface ModuleViteConfigOptions {
  appCode: string
  applicationRoot: string
  componentScope?: 'platform' | 'without-finance-shell' | 'platform-and-local-modules'
  defaultPort: number
  mode: string
  platformRoot: string
  inheritPlatformEnv?: boolean
  authSessionMode?: 'client' | 'server'
}

export function createModuleViteConfig(options: ModuleViteConfigOptions): Promise<UserConfig>
