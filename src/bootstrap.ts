import App from './App.vue'
import type { App as VueApp } from 'vue'
import { initRouter } from './router'
import { bootstrapRuntime } from './bootstrap-runtime'

/**
 * 启动平台公共运行壳。
 *
 * 独立业务应用在调用前注册自己的页面模块，即可复用统一布局、认证、
 * Store、动态菜单和权限守卫，而无需复制公共源码。
 */
export function bootstrapPlatformApp(
  options: { loadHostedApplications?: () => Promise<unknown> } = {}
): VueApp<Element> {
  return bootstrapRuntime({
    rootComponent: App,
    installRouter: (app) => initRouter(app, options.loadHostedApplications)
  })
}
