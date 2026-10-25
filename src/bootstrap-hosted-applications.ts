import type { Component } from 'vue'
import { registerApplicationViewModules } from '@/router/core/component-loader'

type HostedRouteComponentModule = { default: Component }
type HostedIntegrationModule = {
  registerFmsRecognitionIntegration?: () => void
}

function registerHostedApplication(
  applicationCode: string,
  sourceRoot: string,
  sourceModules: Record<string, () => Promise<HostedRouteComponentModule>>
): void {
  registerApplicationViewModules(applicationCode, sourceRoot, sourceModules)
}

// FMS 的识别器是可选集成。子仓未初始化时 glob 为空，平台仍可独立启动和构建。
const fmsIntegrationModules = import.meta.glob<HostedIntegrationModule>(
  '../modules/art-supabase-fms/src/integrations/index.ts',
  { eager: true }
)
Object.values(fmsIntegrationModules).forEach((module) => {
  module.registerFmsRecognitionIntegration?.()
})

registerHostedApplication(
  'fms',
  '../modules/art-supabase-fms/src/views',
  import.meta.glob<HostedRouteComponentModule>([
    '../modules/art-supabase-fms/src/views/**/*.vue',
    '!../modules/art-supabase-fms/src/views/**/modules/**/*.vue',
    '!../modules/art-supabase-fms/src/views/**/components/**/*.vue'
  ])
)
registerHostedApplication(
  'hr',
  '../modules/art-supabase-hr/src/views',
  import.meta.glob<HostedRouteComponentModule>([
    '../modules/art-supabase-hr/src/views/**/*.vue',
    '!../modules/art-supabase-hr/src/views/**/modules/**/*.vue',
    '!../modules/art-supabase-hr/src/views/**/components/**/*.vue'
  ])
)
registerHostedApplication(
  'mdm',
  '../modules/art-supabase-mdm/src/views',
  import.meta.glob<HostedRouteComponentModule>([
    '../modules/art-supabase-mdm/src/views/**/*.vue',
    '!../modules/art-supabase-mdm/src/views/**/modules/**/*.vue',
    '!../modules/art-supabase-mdm/src/views/**/components/**/*.vue'
  ])
)
registerHostedApplication(
  'mes',
  '../modules/art-supabase-mes/src/views',
  import.meta.glob<HostedRouteComponentModule>([
    '../modules/art-supabase-mes/src/views/**/*.vue',
    '!../modules/art-supabase-mes/src/views/**/modules/**/*.vue',
    '!../modules/art-supabase-mes/src/views/**/components/**/*.vue'
  ])
)
registerHostedApplication(
  'pmis',
  '../modules/art-supabase-pmis/src/views',
  import.meta.glob<HostedRouteComponentModule>([
    '../modules/art-supabase-pmis/src/views/**/*.vue',
    '!../modules/art-supabase-pmis/src/views/**/modules/**/*.vue',
    '!../modules/art-supabase-pmis/src/views/**/components/**/*.vue'
  ])
)
registerHostedApplication(
  'scm',
  '../modules/art-supabase-scm/src/views',
  import.meta.glob<HostedRouteComponentModule>([
    '../modules/art-supabase-scm/src/views/**/*.vue',
    '!../modules/art-supabase-scm/src/views/**/modules/**/*.vue',
    '!../modules/art-supabase-scm/src/views/**/components/**/*.vue'
  ])
)
registerHostedApplication(
  'smis',
  '../modules/art-supabase-smis/src/views',
  import.meta.glob<HostedRouteComponentModule>([
    '../modules/art-supabase-smis/src/views/**/*.vue',
    '!../modules/art-supabase-smis/src/views/**/modules/**/*.vue',
    '!../modules/art-supabase-smis/src/views/**/components/**/*.vue'
  ])
)
registerHostedApplication(
  'tms',
  '../modules/art-supabase-tms/src/views',
  import.meta.glob<HostedRouteComponentModule>([
    '../modules/art-supabase-tms/src/views/**/*.vue',
    '!../modules/art-supabase-tms/src/views/**/modules/**/*.vue',
    '!../modules/art-supabase-tms/src/views/**/components/**/*.vue'
  ])
)
registerHostedApplication(
  'vms',
  '../modules/art-supabase-vms/src/views',
  import.meta.glob<HostedRouteComponentModule>([
    '../modules/art-supabase-vms/src/views/**/*.vue',
    '!../modules/art-supabase-vms/src/views/**/modules/**/*.vue',
    '!../modules/art-supabase-vms/src/views/**/components/**/*.vue'
  ])
)
registerHostedApplication(
  'wms',
  '../modules/art-supabase-wms/src/views',
  import.meta.glob<HostedRouteComponentModule>([
    '../modules/art-supabase-wms/src/views/**/*.vue',
    '!../modules/art-supabase-wms/src/views/**/modules/**/*.vue',
    '!../modules/art-supabase-wms/src/views/**/components/**/*.vue'
  ])
)
