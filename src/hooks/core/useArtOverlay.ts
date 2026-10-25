import {
  getCurrentScope,
  nextTick,
  onScopeDispose,
  readonly,
  ref,
  shallowRef,
  toRaw,
  type Component,
  type InjectionKey,
  type Ref,
  type ShallowRef
} from 'vue'
import { cloneDeep } from 'lodash-es'

export type Awaitable<T> = T | Promise<T>
export type ArtScrollOptions =
  | number
  | {
      top?: number
      left?: number
      behavior?: 'auto' | 'smooth'
    }

export interface ArtOverlayOptions<TData, TApi> {
  /** 内容区域是否显示加载遮罩 */
  loading?: boolean
  /** 内容加载遮罩文本 */
  loadingText?: string
  /** 内容加载遮罩背景色 */
  loadingBackground?: string
  /** 内容加载遮罩自定义 class */
  loadingCustomClass?: string
  /** 内容区域固定高度，设置后启用滚动容器 */
  contentHeight?: string | number
  /** 内容区域最大高度，超过后启用滚动容器 */
  contentMaxHeight?: string | number
  /** 是否显示底部操作区 */
  showFooter?: boolean
  /** 是否显示默认取消按钮 */
  showCancelButton?: boolean
  /** 是否显示默认确认按钮 */
  showConfirmButton?: boolean
  /** 取消按钮文字 */
  cancelText?: string
  /** 确认按钮文字 */
  confirmText?: string
  /** 是否禁用确认按钮 */
  confirmDisabled?: boolean
  /** 确认成功后是否自动关闭 */
  autoClose?: boolean
  /** 关闭完成后是否重置数据和加载状态 */
  resetOnClose?: boolean
  /** 确认回调抛出异常时是否仍然关闭 */
  closeOnConfirmError?: boolean
  /** 是否始终显示滚动条 */
  scrollbarAlways?: boolean
  /** 是否使用原生滚动条 */
  nativeScrollbar?: boolean
  /** 动态内容组件 */
  content?: Component
  /** 传递给动态内容组件的属性 */
  contentProps?: Record<string, unknown>
  /** 内容挂载完成后的打开回调 */
  onOpen?: (data: TData, api: TApi) => Awaitable<void>
  /** 确认回调；返回 false 阻止自动关闭 */
  onConfirm?: (data: TData, api: TApi) => Awaitable<boolean | void>
  /** 关闭前回调；返回 false 阻止关闭 */
  onClose?: (data: TData, api: TApi) => Awaitable<boolean | void>
  /** 重置完成后的回调 */
  onReset?: (api: TApi) => void
}

export interface ArtOverlayExpose<TData, TOptions> {
  /** 当前是否显示 */
  visible: Readonly<Ref<boolean>>
  /** 内容加载状态 */
  loading: Readonly<Ref<boolean>>
  /** 确认按钮加载状态 */
  confirmLoading: Readonly<Ref<boolean>>
  /** 当前打开数据 */
  data: Readonly<Ref<TData>>
  /** 当前合并后的运行时配置 */
  options: Readonly<Ref<TOptions>>
  /** 关闭；force=true 时跳过 onClose */
  handleClose: (force?: boolean) => Promise<boolean>
  /** 执行确认流程 */
  handleConfirm: () => Promise<boolean>
  /** 恢复打开时的数据快照并清理加载状态 */
  handleReset: () => void
  /** 设置内容加载状态 */
  setLoading: (value: boolean) => void
  /** 设置确认按钮加载状态 */
  setConfirmLoading: (value: boolean) => void
  /** 增量更新运行时配置 */
  setOptions: (options: Partial<TOptions>) => void
  /** 替换当前数据 */
  setData: (data: TData) => void
  /** 浅合并当前对象数据 */
  updateData: (data: Partial<TData>) => void
  /** 获取当前数据 */
  getData: () => TData
}

interface UseArtOverlayConfig<TData, TOptions, TApi> {
  getDefaultOptions: () => TOptions
  mergeOptions: (base: TOptions, override?: Partial<TOptions>) => TOptions
  getApi: () => TApi
  emitConfirm: (data: TData) => void
  emitReset: () => void
  emitError: (error: unknown) => void
  /** 确认被表单校验阻止时，由具体弹层定位其内容中的错误字段。 */
  onConfirmRejected?: () => void
}

/** Descendant async controls inherit the actual overlay session, including reset. */
export interface ArtOverlayRequestScope {
  visible: Readonly<Ref<boolean>>
  version: Readonly<Ref<number>>
}

export const artOverlayRequestScopeKey: InjectionKey<ArtOverlayRequestScope> =
  Symbol('artOverlayRequestScope')

/** Tracks form resets before an overlay opens as well as pending visible work. */
export function useArtOverlaySession(isVisible: () => boolean) {
  const version = ref(0)
  const invalidate = () => ++version.value
  const isCurrent = (requestVersion: number) => requestVersion === version.value && isVisible()
  if (getCurrentScope()) onScopeDispose(invalidate)
  return { version: readonly(version), invalidate, isCurrent }
}

export const cloneOverlayData = <TValue>(value: TValue): TValue => {
  if (value === undefined || value === null) return value
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(toRaw(value))
    } catch {
      // Callback-bearing data and nested reactive values cannot use structuredClone.
    }
  }
  return cloneDeep(toRaw(value))
}

export const mergeOverlayRecords = <T extends Record<string, unknown> | undefined>(
  base: T,
  override: T
): T => {
  if (!base && !override) return undefined as T
  return { ...(base ?? {}), ...(override ?? {}) } as T
}

export const useArtOverlay = <TData, TApi, TOptions extends ArtOverlayOptions<TData, TApi>>(
  config: UseArtOverlayConfig<TData, TOptions, TApi>
) => {
  const scope = getCurrentScope()
  const visible = ref(false)
  const loading = ref(false)
  const confirmLoading = ref(false)
  const openData = ref<TData>({} as TData) as Ref<TData>
  const initialData = shallowRef<TData>({} as TData) as ShallowRef<TData>
  const options = ref<TOptions>(config.getDefaultOptions()) as Ref<TOptions>
  const closePending = ref(false)
  const openSequence = ref(0)

  if (scope) {
    onScopeDispose(() => {
      // Invalidate UI continuations without invoking business close/reset callbacks.
      ++openSequence.value
      visible.value = false
      loading.value = false
      confirmLoading.value = false
      closePending.value = false
    })
  }

  const setLoading = (value: boolean) => {
    loading.value = value
  }

  const setConfirmLoading = (value: boolean) => {
    confirmLoading.value = value
  }

  const setOptions = (value: Partial<TOptions>) => {
    options.value = config.mergeOptions(options.value, value)
    if ('loading' in value) loading.value = Boolean(value.loading)
  }

  const setData = (data: TData) => {
    openData.value = data
  }

  const updateData = (data: Partial<TData>) => {
    if (openData.value && typeof openData.value === 'object') {
      openData.value = { ...openData.value, ...data }
    }
  }

  const getData = () => openData.value

  const handleReset = () => {
    if (scope && !scope.active) return
    ++openSequence.value
    openData.value = cloneOverlayData(initialData.value)
    loading.value = false
    confirmLoading.value = false
    closePending.value = false
    options.value.onReset?.(config.getApi())
    config.emitReset()
  }

  const handleOpen = async (data = {} as TData, openOptions: Partial<TOptions> = {}) => {
    if (scope && !scope.active) return
    const sequence = ++openSequence.value
    options.value = config.mergeOptions(config.getDefaultOptions(), openOptions)
    const activeOptions = options.value
    loading.value = Boolean(options.value.loading)
    confirmLoading.value = false
    initialData.value = cloneOverlayData(data)
    openData.value = cloneOverlayData(data)
    closePending.value = false
    visible.value = true

    await nextTick()
    if (sequence !== openSequence.value || !visible.value) return

    try {
      await activeOptions.onOpen?.(openData.value, config.getApi())
    } catch (error) {
      if (sequence === openSequence.value && visible.value) config.emitError(error)
    }
  }

  const handleClose = async (force = false): Promise<boolean> => {
    if (closePending.value || !visible.value) return false
    const sequence = openSequence.value
    closePending.value = true

    try {
      if (!force && options.value.onClose) {
        const canClose = await options.value.onClose(openData.value, config.getApi())
        if (canClose === false) return false
      }

      if (sequence !== openSequence.value || !visible.value) return false

      ++openSequence.value
      visible.value = false
      return true
    } catch (error) {
      if (sequence === openSequence.value && visible.value) config.emitError(error)
      return false
    } finally {
      if (sequence === openSequence.value || !visible.value) closePending.value = false
    }
  }

  const handleConfirm = async (): Promise<boolean> => {
    if (
      !visible.value ||
      options.value.confirmDisabled ||
      confirmLoading.value ||
      loading.value ||
      closePending.value
    )
      return false
    const sequence = openSequence.value
    const activeOptions = options.value

    config.emitConfirm(openData.value)
    if (sequence !== openSequence.value || !visible.value) return false
    if (!activeOptions.onConfirm) {
      if (activeOptions.autoClose) await handleClose()
      return true
    }

    confirmLoading.value = true
    try {
      const result = await activeOptions.onConfirm?.(openData.value, config.getApi())
      if (sequence !== openSequence.value || !visible.value) return false
      if (result === false) {
        await nextTick()
        if (sequence === openSequence.value && visible.value) config.onConfirmRejected?.()
      }
      if (result !== false && sequence === openSequence.value && activeOptions.autoClose)
        await handleClose()
      return result !== false
    } catch (error) {
      if (sequence !== openSequence.value || !visible.value) return false
      config.emitError(error)
      if (activeOptions.closeOnConfirmError) {
        await handleClose(true)
      } else {
        await nextTick()
        if (sequence === openSequence.value && visible.value) config.onConfirmRejected?.()
      }
      return false
    } finally {
      if (sequence === openSequence.value || !visible.value) confirmLoading.value = false
    }
  }

  const handleModelValueChange = (value: boolean) => {
    if (scope && !scope.active) return
    if (value) {
      visible.value = true
      return
    }
    void handleClose()
  }

  const handleBeforeClose = (done: () => void, nativeBeforeClose?: unknown): void => {
    const sequence = openSequence.value
    const reportError = (error: unknown): void => {
      if (sequence === openSequence.value && visible.value) config.emitError(error)
    }
    const requestClose = (cancel = false): void => {
      if (cancel || sequence !== openSequence.value || !visible.value) return
      void handleClose().then((allowed) => {
        if (allowed) done()
      })
    }
    try {
      if (typeof nativeBeforeClose === 'function') {
        void Promise.resolve(nativeBeforeClose(requestClose)).catch(reportError)
      } else requestClose()
    } catch (error) {
      reportError(error)
    }
  }

  const handleClosed = () => {
    if (scope && !scope.active) return
    ++openSequence.value
    visible.value = false
    closePending.value = false
    if (options.value.resetOnClose) handleReset()
  }

  return {
    requestScope: { visible: readonly(visible), version: readonly(openSequence) },
    visible,
    loading,
    confirmLoading,
    openData,
    options,
    handleOpen,
    handleClose,
    handleConfirm,
    handleReset,
    handleModelValueChange,
    handleBeforeClose,
    handleClosed,
    setLoading,
    setConfirmLoading,
    setOptions,
    setData,
    updateData,
    getData
  }
}
