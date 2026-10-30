import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useStorage } from '@vueuse/core'
import { useUserStore } from '@/store/modules/user'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { fetchSqlConnections } from '@/api/sql-connections'
import { getSqlDatabaseLabel } from '@/utils/sql-connections'
import type { SqlConnection, SqlDialect, SqlGatewaySnapshot } from '@/types/sql-connections'

interface QueryTab {
  id: string
  connectionId: string
  label: string
}
interface QueryTabsState {
  active: string
  tabs: QueryTab[]
}
const initial = (): QueryTabsState => ({
  active: 'main',
  tabs: [{ id: 'main', connectionId: 'builtin', label: '当前 Supabase' }]
})

export function useSqlConnections() {
  const user = useUserStore()
  const tenant = useTenantScopeStore()
  const identityScope = computed(
    () => `${user.getUserInfo.userId || 'signed-out'}:${tenant.effectiveTenantId || 'all'}`
  )
  const gatewayBase = useStorage(
    computed(() => `sql-gateway:${identityScope.value}`),
    'http://127.0.0.1:4319'
  )
  const snapshot = ref<SqlGatewaySnapshot | null>(null)
  const tabs = useStorage<QueryTabsState>(
    computed(() => `sql-query-tabs:${identityScope.value}`),
    initial(),
    undefined,
    {
      writeDefaults: false,
      serializer: {
        read(raw) {
          const value: unknown = JSON.parse(raw)
          if (
            !value ||
            typeof value !== 'object' ||
            !('tabs' in value) ||
            !Array.isArray(value.tabs) ||
            !('active' in value) ||
            typeof value.active !== 'string'
          )
            return initial()
          const items = value.tabs
            .filter((tab: unknown): tab is QueryTab =>
              Boolean(
                tab &&
                typeof tab === 'object' &&
                'id' in tab &&
                typeof tab.id === 'string' &&
                'connectionId' in tab &&
                typeof tab.connectionId === 'string' &&
                'label' in tab &&
                typeof tab.label === 'string'
              )
            )
            .slice(0, 8)
          return items.length && items.some((tab) => tab.id === value.active)
            ? { active: value.active, tabs: items }
            : initial()
        },
        write: JSON.stringify
      }
    }
  )
  const activeTab = computed(
    () => tabs.value.tabs.find((tab) => tab.id === tabs.value.active) || tabs.value.tabs[0]
  )
  const external = computed(() => activeTab.value.connectionId !== 'builtin')
  const connection = computed(() =>
    external.value
      ? snapshot.value?.connections.find(
          (connection) => connection.id === activeTab.value.connectionId
        )
      : undefined
  )
  const dialect = computed<SqlDialect>(() => connection.value?.dialect || 'postgres')
  const databaseScope = computed(() => {
    if (!external.value) return 'builtin'
    const target = connection.value
    return `${gatewayBase.value}:${activeTab.value.connectionId}:${target ? `${target.host}:${target.port}:${target.database}:${target.username}` : 'offline'}`
  })
  const connectionScope = computed(() => {
    if (!external.value) return activeTab.value.id === 'main' ? '' : `builtin:${activeTab.value.id}`
    return `${databaseScope.value}:${activeTab.value.id}`
  })
  const label = computed(() =>
    external.value
      ? `${connection.value?.name || activeTab.value.label} / ${connection.value ? getSqlDatabaseLabel(connection.value) : '连接未就绪'} · 只读`
      : 'Supabase / postgres'
  )
  const connected = (base: string, value: SqlGatewaySnapshot) => {
    gatewayBase.value = base
    snapshot.value = value
  }
  const useConnection = (target?: SqlConnection) => {
    const connectionId = target?.id || 'builtin'
    const existing = tabs.value.tabs.find((tab) => tab.connectionId === connectionId)
    if (existing) tabs.value = { ...tabs.value, active: existing.id }
    else return newTab(target || null)
    return true
  }
  const newTab = (target: SqlConnection | null = connection.value || null) => {
    if (tabs.value.tabs.length >= 8) return false
    const tab: QueryTab = {
      id: crypto.randomUUID(),
      connectionId: target?.id || 'builtin',
      label: target?.name || 'Supabase 查询'
    }
    tabs.value = { active: tab.id, tabs: [...tabs.value.tabs, tab] }
    return true
  }
  const selectTab = (id: string) => {
    if (tabs.value.tabs.some((tab) => tab.id === id)) tabs.value = { ...tabs.value, active: id }
  }
  const closeTab = (id: string) => {
    if (tabs.value.tabs.length <= 1) return
    const remaining = tabs.value.tabs.filter((tab) => tab.id !== id)
    tabs.value = {
      active: tabs.value.active === id ? remaining[0].id : tabs.value.active,
      tabs: remaining
    }
  }
  const restoreConnection = async () => {
    if (!external.value || !user.getUserInfo.userId) return
    const owner = identityScope.value
    try {
      const value = await fetchSqlConnections(gatewayBase.value, tenant.effectiveTenantId || 'all')
      if (owner === identityScope.value) snapshot.value = value
    } catch {
      // The resource panel offers reconnect; an unavailable gateway never falls back to the built-in database.
      if (owner === identityScope.value) snapshot.value = null
    }
  }
  onMounted(() => {
    void restoreConnection()
  })
  watch(identityScope, async () => {
    snapshot.value = null
    await nextTick()
    void restoreConnection()
  })
  return {
    identityScope,
    gatewayBase,
    snapshot,
    tabs,
    activeTab,
    external,
    connection,
    dialect,
    connectionScope,
    databaseScope,
    label,
    connected,
    useConnection,
    newTab,
    selectTab,
    closeTab
  }
}
