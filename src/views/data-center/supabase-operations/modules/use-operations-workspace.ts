import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import {
  useIntervalFn,
  useLocalStorage,
  useDocumentVisibility,
  StorageSerializers
} from '@vueuse/core'
import {
  fetchOperationsSnapshot,
  startSupabaseOperation,
  cancelSupabaseOperation,
  cancelDetachedSupabaseExports
} from '@/api/supabase-operations'
import type {
  OperationRun,
  SupabaseOperation,
  OperationsSnapshot
} from '@/types/supabase-operations'
import { isOperationRun, OPERATIONS_PROJECT_REF } from '@/utils/supabase/operations-catalog'
import { useUserStore } from '@/store/modules/user'

interface SavedConnection {
  port: number
  reconnect: boolean
  checkedAt: number
  lastRun: OperationRun | null
}
function isSavedConnection(value: unknown): value is SavedConnection {
  if (!value || typeof value !== 'object') return false
  return (
    'port' in value &&
    typeof value.port === 'number' &&
    Number.isInteger(value.port) &&
    value.port >= 1024 &&
    value.port <= 65535 &&
    'reconnect' in value &&
    value.reconnect === true &&
    'checkedAt' in value &&
    typeof value.checkedAt === 'number' &&
    Number.isFinite(value.checkedAt) &&
    'lastRun' in value &&
    (value.lastRun === null || isOperationRun(value.lastRun))
  )
}

export function useOperationsWorkspace(enabled: Readonly<Ref<boolean>>) {
  const userId = useUserStore().getUserInfo.userId
  const storageKey = `supabase-operations:${OPERATIONS_PROJECT_REF}:${userId}`
  const saved = useLocalStorage<unknown>(storageKey, null, {
    serializer: StorageSerializers.object,
    onError: () => localStorage.removeItem(storageKey)
  })
  const restored = isSavedConnection(saved.value) ? saved.value : null
  const connection = ref({ port: restored?.port || 4318 })
  const runs = ref<OperationRun[]>(restored?.lastRun ? [restored.lastRun] : [])
  const connected = ref(false)
  const connecting = ref(false)
  const submitting = ref(false)
  const cancelling = ref(false)
  const error = ref('')
  const selectedRunId = ref(restored?.lastRun?.id || '')
  const busy = ref(false)
  const externalActivity = ref<OperationsSnapshot['externalActivity']>()
  const checkedAt = ref(restored?.checkedAt || 0)
  const now = ref(Date.now())
  const selectedRun = computed(
    () => runs.value.find((item) => item.id === selectedRunId.value) || null
  )
  const currentRun = computed(
    () => runs.value.find((item) => ['running', 'cancelling'].includes(item.status)) || null
  )
  const visibility = useDocumentVisibility()
  let disposed = false
  let refreshing = false
  let epoch = 0
  let mounted = false
  const clock = useIntervalFn(() => {
    now.value = Date.now()
  }, 1000)
  async function refresh(): Promise<void> {
    if (refreshing || disposed) return
    refreshing = true
    const requestEpoch = epoch
    try {
      const snapshot = await fetchOperationsSnapshot(connection.value, selectedRunId.value)
      if (disposed || requestEpoch !== epoch) return
      const wasConnected = connected.value
      runs.value = snapshot.runs
      busy.value = snapshot.busy
      externalActivity.value = snapshot.externalActivity
      connected.value = true
      checkedAt.value = Date.now()
      error.value = ''
      const activeRun = snapshot.runs.find((run) => ['running', 'cancelling'].includes(run.status))
      if (
        (!wasConnected && activeRun) ||
        !snapshot.runs.some((run) => run.id === selectedRunId.value)
      )
        selectedRunId.value = activeRun?.id || snapshot.runs[0]?.id || ''
      const lastRun = activeRun || selectedRun.value
      saved.value = {
        port: connection.value.port,
        reconnect: true,
        checkedAt: checkedAt.value,
        // Keep status only. Passwords, parameters, log text and signed links stay out of browser storage.
        lastRun: lastRun
          ? {
              id: lastRun.id,
              actorId: lastRun.actorId,
              operationId: lastRun.operationId,
              title: lastRun.title,
              status: lastRun.status,
              stage: lastRun.stage,
              startedAt: lastRun.startedAt,
              endedAt: lastRun.endedAt,
              lastOutputAt: lastRun.lastOutputAt,
              logs: [],
              parameters: {}
            }
          : null
      }
    } catch (cause) {
      if (!disposed && requestEpoch === epoch) {
        connected.value = false
        error.value = cause instanceof Error ? cause.message : '读取运维任务失败，请重新连接。'
      }
    } finally {
      refreshing = false
    }
  }
  const polling = useIntervalFn(() => {
    if (!enabled.value || !connected.value || visibility.value === 'hidden') return
    // An unknown Docker result still needs polling. Idle connections also keep their health fresh.
    if (busy.value || externalActivity.value || Date.now() - checkedAt.value >= 30_000)
      void refresh()
  }, 5000)
  async function connect(): Promise<void> {
    if (connecting.value) return
    connecting.value = true
    try {
      await refresh()
    } finally {
      connecting.value = false
    }
  }
  async function start(
    operation: SupabaseOperation,
    parameters: Record<string, string | boolean>
  ): Promise<boolean> {
    if (submitting.value || cancelling.value || busy.value || !connected.value) return false
    submitting.value = true
    error.value = ''
    try {
      const run = await startSupabaseOperation(connection.value, operation.id, parameters)
      selectedRunId.value = run.id
      runs.value = [run, ...runs.value.filter((item) => item.id !== run.id)]
      busy.value = true
      await refresh()
      return true
    } catch (cause) {
      error.value =
        cause instanceof Error ? cause.message : '任务未能提交，请重新连接后核对任务状态。'
      return false
    } finally {
      submitting.value = false
    }
  }
  async function cancel(): Promise<void> {
    if (!selectedRun.value || cancelling.value) return
    cancelling.value = true
    try {
      await cancelSupabaseOperation(connection.value, selectedRun.value.id)
      await refresh()
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '取消失败，请检查执行端并刷新。'
    } finally {
      cancelling.value = false
    }
  }
  async function stopDetachedExports(): Promise<boolean> {
    if (cancelling.value || !connected.value) return false
    cancelling.value = true
    error.value = ''
    try {
      await cancelDetachedSupabaseExports(connection.value)
      await refresh()
      return connected.value && !externalActivity.value && !busy.value
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : '停止旧导出失败，请核对 Docker 状态。'
      await refresh()
      // A successful read must not erase the failed cancellation feedback.
      error.value = message
      return false
    } finally {
      cancelling.value = false
    }
  }
  watch(
    () => connection.value.port,
    () => {
      epoch++
      connected.value = false
      runs.value = []
      selectedRunId.value = ''
      busy.value = false
      checkedAt.value = 0
      externalActivity.value = undefined
      saved.value = null
      error.value = ''
    }
  )
  onMounted(() => {
    mounted = true
    if (enabled.value && restored?.reconnect) void connect()
  })
  watch(enabled, (allowed) => {
    if (mounted && allowed && isSavedConnection(saved.value) && !connected.value) void connect()
  })
  watch(visibility, (state) => {
    if (state === 'visible' && enabled.value && connected.value) void refresh()
  })
  onBeforeUnmount(() => {
    disposed = true
    polling.pause()
    clock.pause()
  })
  watch(selectedRunId, () => {
    if (connected.value) void refresh()
  })
  return {
    connection,
    runs,
    connected,
    connecting,
    submitting,
    cancelling,
    error,
    selectedRunId,
    busy,
    externalActivity,
    checkedAt,
    now,
    selectedRun,
    currentRun,
    refresh,
    connect,
    start,
    cancel,
    stopDetachedExports
  }
}
