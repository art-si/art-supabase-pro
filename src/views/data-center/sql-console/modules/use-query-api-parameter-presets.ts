import {
  computed,
  onScopeDispose,
  ref,
  shallowRef,
  toValue,
  watch,
  type MaybeRefOrGetter
} from 'vue'
import { useStorage } from '@vueuse/core'
import { isEqual } from 'lodash-es'
import type { SqlQueryApiDefinition, SqlQueryApiParameters } from '@/types/sql-query-api'
import {
  normalizeQueryApiPresetName,
  queryApiParameterSignature,
  readQueryApiPresetState,
  writeQueryApiPresetState,
  SqlQueryApiPresetError,
  type SqlQueryApiParameterPreset,
  type SqlQueryApiPresetState
} from './query-api-parameter-presets'

interface PresetOptions {
  scope: MaybeRefOrGetter<string | null>
  definition: MaybeRefOrGetter<SqlQueryApiDefinition | undefined>
}
export interface SqlQueryApiPresetContext {
  key: string
  revision: number
  definition: SqlQueryApiDefinition
  signature: string
}
const empty = (): SqlQueryApiPresetState => ({ version: 2, presets: [] })
const storageError = (message: string, cause: unknown): SqlQueryApiPresetError =>
  cause instanceof SqlQueryApiPresetError ? cause : new SqlQueryApiPresetError(message, { cause })

/** Personal browser shortcuts; no server record, permission, SQL or session is persisted here. */
export function useQueryApiParameterPresets(options: PresetOptions) {
  let alive = true
  const revision = ref(0)
  const reload = ref(0)
  const definition = computed(() => toValue(options.definition))
  const signature = computed(() => queryApiParameterSignature(definition.value?.parameters ?? []))
  const key = computed(() => {
    const scope = toValue(options.scope)
    const api = definition.value
    return scope && api
      ? `sql-query-api-presets:ckbftoopuyophiebamwy:${encodeURIComponent(JSON.stringify([scope, api.tenantId, api.id]))}`
      : 'sql-query-api-presets:inactive'
  })
  const lastWriteError = shallowRef<{ key: string; error: SqlQueryApiPresetError } | null>(null)
  const observerError = shallowRef<unknown>()
  // VueUse handles storage/key events. Treat its value as an invalidation signal, never as
  // proof a write succeeded or as data belonging to a newly selected account/API.
  const observed = useStorage<string | null>(key, null, undefined, {
    writeDefaults: false,
    flush: 'sync',
    shallow: true,
    serializer: { read: (raw) => raw, write: (raw) => raw ?? '' },
    onError: (cause) => {
      observerError.value = cause
    }
  })
  const readCurrent = () => {
    const api = definition.value
    if (!toValue(options.scope) || !api) return { state: empty(), raw: null, error: null }
    let raw: string | null = null
    try {
      raw = window.localStorage.getItem(key.value)
      return {
        state: raw === null ? empty() : readQueryApiPresetState(raw, api.id),
        raw,
        error: null
      }
    } catch (cause) {
      return {
        state: empty(),
        raw,
        error: storageError('本机参数方案读取失败，请检查存储权限后重新读取', cause)
      }
    }
  }
  const snapshot = computed(() => {
    void observed.value
    void observerError.value
    void reload.value
    // Re-read the actual current key, including when useStorage retains old data after an error.
    return readCurrent()
  })
  const presets = computed(() => snapshot.value.state.presets)
  const error = computed(
    () =>
      snapshot.value.error?.message ??
      (lastWriteError.value?.key === key.value ? lastWriteError.value.error.message : '')
  )
  const readFailed = computed(() => Boolean(snapshot.value.error))
  watch(
    [() => toValue(options.scope), definition, () => definition.value?.updatedAt, signature],
    () => {
      revision.value++
      lastWriteError.value = null
    },
    { flush: 'sync' }
  )
  const capture = (): SqlQueryApiPresetContext => {
    const api = definition.value
    if (!alive || !toValue(options.scope) || !api)
      throw new SqlQueryApiPresetError('请登录并选择查询 API 后再操作')
    return { key: key.value, revision: revision.value, definition: api, signature: signature.value }
  }
  const current = (context: SqlQueryApiPresetContext): boolean =>
    alive &&
    context.key === key.value &&
    context.revision === revision.value &&
    context.definition === definition.value
  const ensureCurrent = (context: SqlQueryApiPresetContext): void => {
    if (!current(context)) throw new SqlQueryApiPresetError('操作范围已变化，请重新选择参数方案')
  }
  const fresh = (context: SqlQueryApiPresetContext): SqlQueryApiPresetState => {
    ensureCurrent(context)
    const value = readCurrent()
    if (value.error) {
      reload.value++
      throw value.error
    }
    return value.state
  }
  const notify = (
    context: SqlQueryApiPresetContext,
    oldValue: string | null,
    newValue: string | null
  ): void => {
    reload.value++
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: context.key,
        oldValue,
        newValue,
        storageArea: window.localStorage
      })
    )
    ensureCurrent(context)
  }
  const persist = (context: SqlQueryApiPresetContext, state: SqlQueryApiPresetState): void => {
    ensureCurrent(context)
    const raw = writeQueryApiPresetState(state, context.definition.id)
    try {
      const oldValue = window.localStorage.getItem(context.key)
      // Acknowledge physical storage before notifying VueUse: its ref alone would keep
      // optimistic values after QuotaExceededError, falsely appearing to have saved them.
      window.localStorage.setItem(context.key, raw)
      if (window.localStorage.getItem(context.key) !== raw)
        throw new Error('Storage acknowledgement failed')
      lastWriteError.value = null
      notify(context, oldValue, raw)
    } catch (cause) {
      const failure = storageError('参数方案未保存，请检查浏览器存储空间或权限后重试', cause)
      if (current(context)) lastWriteError.value = { key: context.key, error: failure }
      throw failure
    }
  }
  const find = (
    state: SqlQueryApiPresetState,
    preset: SqlQueryApiParameterPreset
  ): SqlQueryApiParameterPreset => {
    const saved = state.presets.find((item) => item.id === preset.id)
    if (!saved || !isEqual(saved, preset))
      throw new SqlQueryApiPresetError('此方案已更新，请重新读取后再选择')
    return saved
  }
  const save = (
    name: string,
    values: SqlQueryApiParameters,
    context = capture()
  ): SqlQueryApiParameterPreset => {
    const state = fresh(context)
    const preset: SqlQueryApiParameterPreset = {
      id: crypto.randomUUID(),
      name: normalizeQueryApiPresetName(name),
      definitionId: context.definition.id,
      definitionVersion: context.definition.updatedAt,
      parameterSignature: context.signature,
      values: { ...values },
      updatedAt: new Date().toISOString()
    }
    persist(context, { version: 2, presets: [preset, ...state.presets] })
    return preset
  }
  const update = (
    preset: SqlQueryApiParameterPreset,
    values: SqlQueryApiParameters,
    context = capture()
  ): void => {
    const state = fresh(context)
    find(state, preset)
    persist(context, {
      version: 2,
      presets: state.presets.map((item) =>
        item.id === preset.id
          ? {
              ...item,
              definitionVersion: context.definition.updatedAt,
              parameterSignature: context.signature,
              values: { ...values },
              updatedAt: new Date().toISOString()
            }
          : item
      )
    })
  }
  const forget = (preset: SqlQueryApiParameterPreset, context = capture()): void => {
    const state = fresh(context)
    find(state, preset)
    persist(context, { version: 2, presets: state.presets.filter((item) => item.id !== preset.id) })
  }
  const inspect = (
    preset: SqlQueryApiParameterPreset,
    context = capture()
  ): SqlQueryApiParameterPreset => find(fresh(context), preset)
  const apply = (
    preset: SqlQueryApiParameterPreset,
    context = capture()
  ): SqlQueryApiParameters => {
    const saved = inspect(preset, context)
    if (saved.parameterSignature !== context.signature)
      throw new SqlQueryApiPresetError('参数定义已变化，请核对后重新保存')
    return { ...saved.values }
  }
  const resetSource = (context = capture()): string => {
    ensureCurrent(context)
    const stored = readCurrent()
    reload.value++
    if (!stored.error) throw new SqlQueryApiPresetError('本机参数方案已恢复，请重新读取后继续使用')
    if (stored.raw === null) throw stored.error
    return stored.raw
  }
  const reset = (expectedRaw: string, context = capture()): void => {
    ensureCurrent(context)
    try {
      const actual = window.localStorage.getItem(context.key)
      if (actual !== expectedRaw || resetSource(context) !== expectedRaw) {
        reload.value++
        throw new SqlQueryApiPresetError('方案已在其他页面更新，请重新读取后再操作')
      }
      window.localStorage.removeItem(context.key)
      if (window.localStorage.getItem(context.key) !== null)
        throw new Error('Storage reset acknowledgement failed')
      lastWriteError.value = null
      notify(context, actual, null)
    } catch (cause) {
      throw storageError('本机方案未重置，请检查存储权限后重试', cause)
    }
  }
  onScopeDispose(() => {
    alive = false
    revision.value++
  })
  return {
    presets,
    error,
    readFailed,
    signature,
    revision,
    capture,
    current,
    save,
    update,
    forget,
    inspect,
    apply,
    reset,
    resetSource,
    refresh: () => {
      lastWriteError.value = null
      reload.value++
    }
  }
}
