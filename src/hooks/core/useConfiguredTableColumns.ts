import {
  computed,
  getCurrentInstance,
  inject,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  ref,
  watch,
  type ComputedRef
} from 'vue'
import { routeLocationKey } from 'vue-router'
import { ElNotification } from 'element-plus'
import { useUserStore } from '@/store/modules/user'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { fetchTableColumnRuntime } from '@/api/table-column-config'
import {
  applyColumnProfile,
  matchesColumnCatalog,
  resolveColumnProfiles
} from '@/utils/table/column-profile'
import type { ColumnOption } from '@/types/component'
import type { TableColumnRuntime } from '@/types/table-column-config'
import {
  tableColumnRuntimeCache,
  tableColumnRuntimeRevision,
  tableColumnRuntimeWarnings,
  type TableColumnRuntimeCacheEntry
} from '@/utils/table/column-runtime-cache'

export { invalidateTableColumnConfig } from '@/utils/table/column-runtime-cache'
import configuredTableRoutes from '@/config/table-column-routes.generated.json'

const registeredRoutes = new Set(configuredTableRoutes)

/** Read only this menu's effective mode; frontend mode transfers no column definitions. */
export function useConfiguredTableColumns<T>(factory: () => ColumnOption<T>[]): {
  factory: () => ColumnOption<T>[]
  revision: ComputedRef<string>
} {
  const route = inject(routeLocationKey, undefined)
  if (!route) return { factory, revision: computed(() => '') }
  const owner = getCurrentInstance()
  for (let ancestor = owner; ancestor; ancestor = ancestor.parent) {
    const name = ancestor.type.name ?? ('__name' in ancestor.type ? ancestor.type.__name : '')
    if (typeof name === 'string' && /Dialog|Drawer|Picker|ArtDataSelect/i.test(name))
      return { factory, revision: computed(() => '') }
  }
  const user = useUserStore()
  const tenant = useTenantScopeStore()
  const ownedPath = route.matched.at(-1)?.path ?? route.path
  const routePath = ownedPath.replace(/\/:.*$/, '')
  if (!registeredRoutes.has(routePath)) return { factory, revision: computed(() => '') }
  const runtime = ref<TableColumnRuntime | null>(null)
  let request = 0
  let active = false
  const context = computed(
    () =>
      `${user.getUserInfo.userId ?? ''}:${tenant.effectiveTenantId ?? 'all'}:${tenant.revision}:${tableColumnRuntimeRevision.value}`
  )

  async function load(): Promise<void> {
    if (!active) return
    if (!user.getUserInfo.userId) {
      request += 1
      runtime.value = null
      return
    }
    if (!factory().length) return
    const current = ++request
    runtime.value = null
    const element = owner?.proxy?.$el
    if (element instanceof Element && element.closest('.el-dialog, .el-drawer')) return
    const key = `${context.value}:${routePath}`
    let requestEntry: TableColumnRuntimeCacheEntry | undefined
    try {
      const now = Date.now()
      let entry = tableColumnRuntimeCache.get(key)
      if (!entry || entry.expires < now) {
        entry = {
          expires: now + 60_000,
          value: fetchTableColumnRuntime(routePath)
        }
        tableColumnRuntimeCache.set(key, entry)
      }
      requestEntry = entry
      const value = await requestEntry.value
      const currentKey = `${context.value}:${routePath}`
      if (current === request && currentKey === key) runtime.value = value
    } catch {
      if (requestEntry && tableColumnRuntimeCache.get(key) === requestEntry)
        tableColumnRuntimeCache.delete(key)
      const currentKey = `${context.value}:${routePath}`
      if (current !== request || currentKey !== key || tableColumnRuntimeWarnings.has(key)) return
      tableColumnRuntimeWarnings.add(key)
      ElNotification({
        title: '已使用前端默认列',
        message: '列配置暂时无法加载，列表仍可使用；重新进入页面可重试。',
        type: 'warning',
        duration: 5000
      })
    }
  }
  onMounted(() => {
    active = true
    void load()
  })
  onActivated(() => {
    active = true
    void load()
  })
  watch(context, () => {
    void load()
  })
  watch(
    () => factory().length,
    (count, previous) => {
      if (active && count > 0 && previous === 0) void load()
    }
  )
  onDeactivated(() => {
    active = false
    request += 1
  })
  onBeforeUnmount(() => {
    active = false
    request += 1
  })
  const configuredFactory = () => {
    const original = factory()
    const current = runtime.value
    if (
      !current?.enabled ||
      !current.catalog ||
      !matchesColumnCatalog(
        original,
        current.catalog.columns.map((column) => column.key),
        current.catalog.columns
      )
    )
      return original
    const effective = resolveColumnProfiles(current.profiles)
    return effective.configured
      ? applyColumnProfile(original, effective.columns, current.catalog.columns)
      : original
  }
  return {
    factory: configuredFactory,
    revision: computed(
      () =>
        `${context.value}:${runtime.value?.profiles.map((profile) => `${profile.id}:${profile.revision}`).join(',') ?? ''}:${runtime.value?.enabled ?? false}`
    )
  }
}
