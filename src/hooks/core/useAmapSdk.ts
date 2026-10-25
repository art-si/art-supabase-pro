import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useScriptTag } from '@vueuse/core'
import { withTimeout } from '@/utils/async'

export interface UseAmapSdkOptions {
  key: MaybeRefOrGetter<string | undefined>
  plugins?: MaybeRefOrGetter<readonly string[]>
  securityJsCode?: MaybeRefOrGetter<string | undefined>
}

export type AmapBrowserNamespace = ArtAmapBrowserNamespace

let amapSdkLoadPromise: Promise<ArtAmapBrowserNamespace> | undefined

/**
 * Loads the AMap browser SDK once and then ensures every caller's plugin set is available.
 * Call this composable during component setup; call `loadAmap` when the map is actually needed.
 */
export function useAmapSdk<TNamespace extends ArtAmapBrowserNamespace>(options: UseAmapSdkOptions) {
  const scriptUrl = computed(() => {
    const key = toValue(options.key)?.trim()
    return key ? `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}` : ''
  })
  const { load: loadScript, unload: unloadScript } = useScriptTag(scriptUrl, undefined, {
    attrs: { 'data-art-amap': 'true' },
    manual: true
  })

  async function loadAmap(): Promise<TNamespace> {
    const key = toValue(options.key)?.trim()
    if (!key) throw new Error('请先配置 VITE_AMAP_KEY')

    const securityJsCode = toValue(options.securityJsCode)?.trim()
    if (securityJsCode) window._AMapSecurityConfig = { securityJsCode }

    if (!window.AMap) {
      amapSdkLoadPromise ??= withTimeout(loadScript(), 10_000, '高德地图加载超时，请稍后重试')
        .then(() => getLoadedAmap())
        .catch((error: unknown) => {
          amapSdkLoadPromise = undefined
          unloadScript()
          throw normalizeAmapLoadError(error)
        })
      await amapSdkLoadPromise
    }

    const amap = getLoadedAmap()
    await loadAmapPlugins(amap, [...(toValue(options.plugins) ?? [])])
    return amap as TNamespace
  }

  return { loadAmap }
}

function getLoadedAmap(): ArtAmapBrowserNamespace {
  if (!window.AMap) throw new Error('AMap SDK is not loaded')
  return window.AMap
}

function loadAmapPlugins(amap: ArtAmapBrowserNamespace, plugins: readonly string[]): Promise<void> {
  const missingPlugins = plugins.filter((pluginName) => !amap[pluginName.replace(/^AMap\./, '')])
  if (!missingPlugins.length) return Promise.resolve()
  if (!amap.plugin) return Promise.reject(new Error('AMap plugin loader is unavailable'))

  return withTimeout(
    new Promise<void>((resolve, reject) => {
      amap.plugin?.([...missingPlugins], () => {
        const failedPlugins = missingPlugins.filter(
          (pluginName) => !amap[pluginName.replace(/^AMap\./, '')]
        )
        if (failedPlugins.length) {
          reject(new Error(`${failedPlugins.join(', ')} 服务加载失败`))
          return
        }
        resolve()
      })
    }),
    8000,
    `${missingPlugins.join(', ')} 服务加载超时`
  )
}

function normalizeAmapLoadError(error: unknown): Error {
  return error instanceof Error && error.message ? error : new Error('高德地图加载失败')
}
