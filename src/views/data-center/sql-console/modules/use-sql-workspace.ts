import { computed, ref, toValue, type MaybeRefOrGetter } from 'vue'
import { useStorage } from '@vueuse/core'
import { useUserStore } from '@/store/modules/user'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'

export interface SqlHistoryEntry {
  id: string
  sql: string
  executedAt: string
  status: 'ok' | 'error'
  durationMs?: number
  rowCount?: number
  schema?: string
}

interface SqlWorkspaceState {
  draft: string | null
  querySchema: string
  history: SqlHistoryEntry[]
  maxRows: number
  timeoutMs: number
  navigatorOpen: boolean | null
  navigatorWidth: number
  navigatorWidthVersion: number
  statementGroupOpen: boolean | null
}

const DEFAULT_SQL = 'SELECT * FROM sys_user LIMIT 10;'
export const SQL_NAVIGATOR_DEFAULT_WIDTH = 340
export const SQL_NAVIGATOR_MIN_WIDTH = 240
export const SQL_NAVIGATOR_MAX_WIDTH = 520
const emptyWorkspace = (): SqlWorkspaceState => ({
  draft: null,
  querySchema: '',
  history: [],
  maxRows: 200,
  timeoutMs: 10000,
  navigatorOpen: null,
  navigatorWidth: SQL_NAVIGATOR_DEFAULT_WIDTH,
  navigatorWidthVersion: 1,
  statementGroupOpen: null
})

function isHistoryEntry(value: unknown): value is SqlHistoryEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.id === 'string' &&
    typeof entry.sql === 'string' &&
    typeof entry.executedAt === 'string' &&
    Number.isFinite(Date.parse(entry.executedAt)) &&
    (entry.status === 'ok' || entry.status === 'error') &&
    (entry.durationMs === undefined || typeof entry.durationMs === 'number') &&
    (entry.rowCount === undefined || typeof entry.rowCount === 'number') &&
    (entry.schema === undefined || typeof entry.schema === 'string')
  )
}

/** Browser-only working state; query results are never persisted. */
export function useSqlWorkspace(
  connectionScope: MaybeRefOrGetter<string> = '',
  defaultSql: MaybeRefOrGetter<string> = DEFAULT_SQL
) {
  const userStore = useUserStore()
  const tenantScope = useTenantScopeStore()
  const storageError = ref(false)
  const transientDraft = ref<string | null>(null)
  const transientQuerySchema = ref('')
  const transientMaxRows = ref(200)
  const transientTimeoutMs = ref(10000)
  const transientNavigator = ref<{ open: boolean | null; width: number }>({
    open: null,
    width: SQL_NAVIGATOR_DEFAULT_WIDTH
  })
  const scopeKey = computed(
    () =>
      `sql-console:ckbftoopuyophiebamwy:${userStore.getUserInfo.userId || 'signed-out'}:${tenantScope.effectiveTenantId || 'all'}${toValue(connectionScope) ? `:${toValue(connectionScope)}` : ''}`
  )
  const workspace = useStorage<SqlWorkspaceState>(scopeKey, emptyWorkspace(), undefined, {
    writeDefaults: false,
    serializer: {
      read: (raw) => {
        const value: unknown = JSON.parse(raw)
        if (!value || typeof value !== 'object') return emptyWorkspace()
        const record = value as Record<string, unknown>
        return {
          draft: typeof record.draft === 'string' ? record.draft : null,
          querySchema:
            typeof record.querySchema === 'string' &&
            record.querySchema.length <= 200 &&
            !/\p{Cc}/u.test(record.querySchema)
              ? record.querySchema
              : '',
          maxRows:
            typeof record.maxRows === 'number' && [100, 200, 500, 1000].includes(record.maxRows)
              ? record.maxRows
              : 200,
          timeoutMs:
            typeof record.timeoutMs === 'number' && [5000, 10000, 30000].includes(record.timeoutMs)
              ? record.timeoutMs
              : 10000,
          navigatorOpen: typeof record.navigatorOpen === 'boolean' ? record.navigatorOpen : null,
          statementGroupOpen:
            typeof record.statementGroupOpen === 'boolean' ? record.statementGroupOpen : null,
          navigatorWidth:
            typeof record.navigatorWidth === 'number' && Number.isFinite(record.navigatorWidth)
              ? Math.min(
                  SQL_NAVIGATOR_MAX_WIDTH,
                  Math.max(
                    record.navigatorWidthVersion === 1
                      ? SQL_NAVIGATOR_MIN_WIDTH
                      : SQL_NAVIGATOR_DEFAULT_WIDTH,
                    record.navigatorWidth
                  )
                )
              : SQL_NAVIGATOR_DEFAULT_WIDTH,
          navigatorWidthVersion: 1,
          history: Array.isArray(record.history)
            ? record.history.filter(isHistoryEntry).slice(0, 30)
            : []
        }
      },
      write: (value) => {
        const serialized = JSON.stringify(value)
        storageError.value = false
        return serialized
      }
    },
    onError: () => {
      storageError.value = true
    }
  })
  const sqlCode = computed({
    get: () =>
      (userStore.getUserInfo.userId ? workspace.value.draft : transientDraft.value) ??
      toValue(defaultSql),
    set: (value: string) => {
      if (userStore.getUserInfo.userId) workspace.value = { ...workspace.value, draft: value }
      else transientDraft.value = value
    }
  })
  const querySchema = computed({
    get: () =>
      userStore.getUserInfo.userId ? workspace.value.querySchema : transientQuerySchema.value,
    set: (value: string) => {
      if (userStore.getUserInfo.userId) workspace.value = { ...workspace.value, querySchema: value }
      else transientQuerySchema.value = value
    }
  })
  const history = computed(() => (userStore.getUserInfo.userId ? workspace.value.history : []))
  const maxRows = computed({
    get: () => (userStore.getUserInfo.userId ? workspace.value.maxRows : transientMaxRows.value),
    set: (value: number) => {
      if (userStore.getUserInfo.userId) workspace.value = { ...workspace.value, maxRows: value }
      else transientMaxRows.value = value
    }
  })
  const timeoutMs = computed({
    get: () =>
      userStore.getUserInfo.userId ? workspace.value.timeoutMs : transientTimeoutMs.value,
    set: (value: number) => {
      if (userStore.getUserInfo.userId) workspace.value = { ...workspace.value, timeoutMs: value }
      else transientTimeoutMs.value = value
    }
  })
  const navigatorOpen = computed({
    get: () =>
      userStore.getUserInfo.userId ? workspace.value.navigatorOpen : transientNavigator.value.open,
    set: (value: boolean | null) => {
      if (userStore.getUserInfo.userId)
        workspace.value = { ...workspace.value, navigatorOpen: value }
      else transientNavigator.value = { ...transientNavigator.value, open: value }
    }
  })
  const navigatorWidth = computed({
    get: () =>
      userStore.getUserInfo.userId
        ? workspace.value.navigatorWidth
        : transientNavigator.value.width,
    set: (value: number) => {
      if (userStore.getUserInfo.userId)
        workspace.value = { ...workspace.value, navigatorWidth: value }
      else transientNavigator.value = { ...transientNavigator.value, width: value }
    }
  })
  const statementGroupOpen = computed({
    get: () => workspace.value.statementGroupOpen,
    set: (value: boolean | null) => {
      workspace.value = { ...workspace.value, statementGroupOpen: value }
    }
  })
  const recordExecution = (entry: Omit<SqlHistoryEntry, 'id' | 'executedAt'>, ownerKey: string) => {
    if (!userStore.getUserInfo.userId || ownerKey !== scopeKey.value) return
    const entries = [
      { ...entry, id: crypto.randomUUID(), executedAt: new Date().toISOString() },
      ...workspace.value.history
    ].slice(0, 30)
    workspace.value = { ...workspace.value, history: entries }
  }
  const draftStatus = computed(() =>
    storageError.value
      ? '草稿未保存，请复制备份'
      : userStore.getUserInfo.userId
        ? '草稿自动保存'
        : '临时草稿'
  )
  return {
    sqlCode,
    querySchema,
    history,
    scopeKey,
    storageError,
    draftStatus,
    recordExecution,
    maxRows,
    timeoutMs,
    navigatorOpen,
    navigatorWidth,
    statementGroupOpen
  }
}
