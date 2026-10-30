import { computed, ref, type MaybeRefOrGetter, toValue } from 'vue'
import { useStorage } from '@vueuse/core'
import { toObjectRecord } from '@/utils/record'

export interface SqlObjectLocation {
  schema: string
  name: string
}
export interface SavedSqlQuery {
  id: string
  name: string
  sql: string
  schema?: string
}
export interface SqlEditorView {
  fontSize: number
  wordWrap: boolean
  minimap: boolean
}
interface ToolsState {
  pins: SqlObjectLocation[]
  queries: SavedSqlQuery[]
  editor: SqlEditorView
}
const initial = (): ToolsState => ({
  pins: [],
  queries: [],
  editor: { fontSize: 13, wordWrap: false, minimap: false }
})
const isLocation = (value: unknown): value is SqlObjectLocation => {
  const row = toObjectRecord(value)
  return typeof row.schema === 'string' && typeof row.name === 'string'
}
const isQuery = (value: unknown): value is SavedSqlQuery => {
  const row = toObjectRecord(value)
  return (
    typeof row.id === 'string' &&
    typeof row.name === 'string' &&
    typeof row.sql === 'string' &&
    row.sql.length <= 100000 &&
    (row.schema === undefined || (typeof row.schema === 'string' && row.schema.length <= 200))
  )
}

export function useSqlTools(scope: MaybeRefOrGetter<string>) {
  const storageError = ref(false)
  const state = useStorage<ToolsState>(
    computed(() => `sql-tools:${toValue(scope)}`),
    initial(),
    undefined,
    {
      writeDefaults: false,
      serializer: {
        read(raw) {
          const value = toObjectRecord(JSON.parse(raw))
          const editor = toObjectRecord(value.editor)
          return {
            pins: Array.isArray(value.pins) ? value.pins.filter(isLocation).slice(0, 50) : [],
            queries: Array.isArray(value.queries) ? value.queries.filter(isQuery).slice(0, 50) : [],
            editor: {
              fontSize:
                typeof editor.fontSize === 'number'
                  ? Math.min(22, Math.max(11, editor.fontSize))
                  : 13,
              wordWrap: editor.wordWrap === true,
              minimap: editor.minimap === true
            }
          }
        },
        write(value) {
          storageError.value = false
          return JSON.stringify(value)
        }
      },
      onError: () => {
        storageError.value = true
      }
    }
  )
  const editorView = computed({
    get: () => state.value.editor,
    set: (value: SqlEditorView) => {
      state.value = { ...state.value, editor: value }
    }
  })
  const togglePin = (location: SqlObjectLocation) => {
    const existing = state.value.pins.some(
      (item) => item.schema === location.schema && item.name === location.name
    )
    state.value = {
      ...state.value,
      pins: existing
        ? state.value.pins.filter(
            (item) => item.schema !== location.schema || item.name !== location.name
          )
        : [location, ...state.value.pins].slice(0, 50)
    }
  }
  const saveQuery = (name: string, sql: string, schema?: string) => {
    if (!sql.trim() || sql.length > 100000 || !name.trim()) return false
    state.value = {
      ...state.value,
      queries: [
        { id: crypto.randomUUID(), name: name.trim().slice(0, 80), sql, schema },
        ...state.value.queries
      ].slice(0, 50)
    }
    return true
  }
  const unstarQuery = (id: string) => {
    state.value = {
      ...state.value,
      queries: state.value.queries.filter((query) => query.id !== id)
    }
  }
  return {
    editorView,
    pins: computed(() => state.value.pins),
    queries: computed(() => state.value.queries),
    togglePin,
    saveQuery,
    unstarQuery,
    storageError,
    retrySave: () => {
      state.value = { ...state.value }
    }
  }
}
