import { createApp, type App, type Component } from 'vue'
import { initStore } from './store'
import language from './locales'
import { setupGlobDirectives } from './directives'
import { setupErrorHandle } from './utils/sys/error-handle'
import { setupSupabaseSessionLifecycle } from './plugins/supabase-session'
import { platformAuthContextKey, type PlatformAuthContext } from './utils/auth-context'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

export interface PlatformRuntimeOptions {
  rootComponent: Component
  installRouter: (app: App<Element>) => void
  authContext?: PlatformAuthContext
  manageSupabaseSession?: boolean
}

/** Shared initialization for the platform and independently authenticated consumers. */
export function bootstrapRuntime(options: PlatformRuntimeOptions): App<Element> {
  const app = createApp(options.rootComponent)
  initStore(app)
  if (options.authContext) app.provide(platformAuthContextKey, options.authContext)
  options.installRouter(app)
  if (options.manageSupabaseSession !== false) setupSupabaseSessionLifecycle()
  setupGlobDirectives(app)
  setupErrorHandle(app)
  app.use(language)
  app.mount('#app')
  return app
}
