import { useAsyncState } from '@vueuse/core'
import { computed, reactive, ref, shallowReactive, type Component } from 'vue'
import { isArtComponentType, loadArtComponent, type ArtComponentType } from './component-loaders'

type NativeRegistry = typeof import('./components')
type ComponentUnit = 'native' | ArtComponentType

const retryNativeRegistry = import.meta.glob<NativeRegistry>('./components.ts', {
  query: '?form-controls-retry'
})

function createComponentLoadState<T>(load: (retry: boolean) => Promise<T>) {
  const attempts = ref(0)
  const resource = useAsyncState<T | undefined>(async () => load(attempts.value++ > 0), undefined, {
    immediate: false,
    resetOnExecute: false,
    onError: () => undefined
  })
  return { ...resource, attempts }
}

export function usePresetComponents() {
  const native = createComponentLoadState((retry) =>
    retry ? retryNativeRegistry['./components.ts']() : import('./components')
  )
  const art = shallowReactive(
    new Map<ArtComponentType, ReturnType<typeof createComponentLoadState<Component>>>()
  )
  const fields = reactive(new Map<string, Map<ComponentUnit, number>>())
  const getUnit = (type: string): ComponentUnit => (isArtComponentType(type) ? type : 'native')
  const getLoadState = (unit: ComponentUnit) => (unit === 'native' ? native : art.get(unit))
  const isResolved = (unit: ComponentUnit): boolean => getLoadState(unit)?.state.value !== undefined
  const getErrorMessage = (unit: ComponentUnit): string | null => {
    const load = getLoadState(unit)
    if (!load || load.error.value === undefined) return null
    return load.attempts.value < 2
      ? '表单控件加载失败，请重试'
      : '表单控件暂时无法加载，请保留已填内容后刷新页面'
  }
  const pendingFields = computed(() =>
    Object.fromEntries(
      [...fields].flatMap(([key, units]) => {
        const pending = [...units.keys()].find((unit) => !isResolved(unit))
        return pending
          ? [[key, getErrorMessage(pending) ?? '表单控件正在加载，请稍候'] as const]
          : []
      })
    )
  )
  const controlsReady = computed(() => !Object.keys(pendingFields.value).length)

  const trackField = (key: string, unit: ComponentUnit, change: 1 | -1): void => {
    const units = fields.get(key)
    if (!units) {
      if (change > 0) fields.set(key, new Map([[unit, 1]]))
      return
    }
    const count = (units.get(unit) ?? 0) + change
    if (count > 0) units.set(unit, count)
    else units.delete(unit)
    if (!units.size) fields.delete(key)
  }

  const getComponent = (type: string): Component | undefined =>
    isArtComponentType(type)
      ? art.get(type)?.state.value
      : native.state.value?.resolveNativeComponent(type)

  const getArtLoadState = (unit: ArtComponentType) => {
    const existing = art.get(unit)
    if (existing) return existing
    const load = createComponentLoadState((retry) => loadArtComponent(unit, retry))
    art.set(unit, load)
    return load
  }

  const getFallbackBindings = (key: string, type: string) => {
    const unit = getUnit(type)
    const load = unit === 'native' ? native : getArtLoadState(unit)
    const retry = (): void => {
      if (load.state.value === undefined && !load.isLoading.value && load.attempts.value < 2)
        void load.execute()
    }
    return {
      key: JSON.stringify([key, unit]),
      loading: load.isLoading.value || load.attempts.value === 0,
      error: getErrorMessage(unit),
      retryable: load.attempts.value < 2,
      onRetry: retry,
      onVnodeBeforeMount: () => {
        trackField(key, unit, 1)
        if (load.attempts.value === 0) retry()
      },
      onVnodeBeforeUnmount: () => trackField(key, unit, -1)
    }
  }

  return { getComponent, getFallbackBindings, controlsReady, pendingFields }
}
