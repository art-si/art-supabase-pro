import { onScopeDispose, reactive, watch, type Ref } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'

export type SqlMetadataSearch = (
  keyword: string
) => Promise<Api.DataCenter.SqlConsole.DatabaseMetadata>

/** Both metadata browsers search the complete authorized catalog, with stale-response isolation. */
export function useSqlMetadataSearch(
  keyword: Ref<string>,
  searcher: () => SqlMetadataSearch | undefined,
  enabled: () => boolean = () => true
) {
  const state = reactive<{
    loading: boolean
    error: string
    result: Api.DataCenter.SqlConsole.DatabaseMetadata | null
  }>({ loading: false, error: '', result: null })
  let version = 0
  let disposed = false
  const reset = () => {
    version++
    Object.assign(state, { loading: false, error: '', result: null })
  }
  const execute = async () => {
    if (disposed) return
    const query = keyword.value.trim()
    const search = searcher()
    if (!query || !search || !enabled()) {
      reset()
      return
    }
    const current = ++version
    Object.assign(state, { loading: true, error: '', result: null })
    try {
      const result = await search(query)
      if (current === version) state.result = result
    } catch (cause) {
      if (current === version)
        state.error = getFriendlySupabaseErrorMessage(cause, '数据库目录搜索失败，请重试')
    } finally {
      if (current === version) state.loading = false
    }
  }
  const schedule = useDebounceFn(execute, 250)
  watch([keyword, searcher, enabled], () => {
    reset()
    if (keyword.value.trim() && searcher() && enabled()) {
      state.loading = true
      void schedule()
    }
  })
  onScopeDispose(() => {
    disposed = true
    reset()
  })
  return { state, execute, reset }
}
