import App from './App.vue'
import { createApp, type App as VueApp } from 'vue'
import { initStore } from './store'
import { initRouter } from './router'
import language from './locales'
import '@styles/core/tailwind.css'
import '@styles/index.scss'
import { setupGlobDirectives } from './directives'
import { setupErrorHandle } from './utils/sys/error-handle'
import { setupSupabaseSessionLifecycle } from './plugins/supabase-session'

/**
 * 启动平台公共运行壳。
 *
 * 独立业务应用在调用前注册自己的页面模块，即可复用统一布局、认证、
 * Store、动态菜单和权限守卫，而无需复制公共源码。
 */
export function bootstrapPlatformApp(
  options: { loadHostedApplications?: () => Promise<unknown> } = {}
): VueApp<Element> {
  const app = createApp(App)
  initStore(app)
  initRouter(app, options.loadHostedApplications)
  setupSupabaseSessionLifecycle()
  setupGlobDirectives(app)
  setupErrorHandle(app)
  app.use(language)
  app.mount('#app')
  return app
}
