import {
  computed,
  getCurrentInstance,
  inject,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  shallowRef,
  watch,
  type ComputedRef
} from 'vue'
import { routeLocationKey } from 'vue-router'
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
  const loadedRuntime = shallowRef<{ scope: string; value: TableColumnRuntime } | null>(null)
  let request = 0
  let active = false
  const scope = computed(
    () => `${user.getUserInfo.userId ?? ''}:${tenant.effectiveTenantId ?? 'all'}:${tenant.revision}`
  )
  // Reloads can retain the current columns only while the user and tenant stay the same.
  const context = computed(() => `${scope.value}:${tableColumnRuntimeRevision.value}`)
  const runtime = computed(() =>
    loadedRuntime.value?.scope === scope.value ? loadedRuntime.value.value : null
  )

  async function load(): Promise<void> {
    if (!active) return
    if (!user.getUserInfo.userId) {
      request += 1
      loadedRuntime.value = null
      return
    }
    if (!factory().length) return
    const current = ++request
    const element = owner?.proxy?.$el
    if (element instanceof Element && element.closest('.el-dialog, .el-drawer')) {
      loadedRuntime.value = null
      return
    }
    const requestScope = scope.value
    const requestContext = context.value
    const key = `${requestContext}:${routePath}`
    const isCurrent = () => current === request && requestContext === context.value
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
      if (isCurrent()) loadedRuntime.value = value ? { scope: requestScope, value } : null
    } catch {
      if (requestEntry && tableColumnRuntimeCache.get(key) === requestEntry)
        tableColumnRuntimeCache.delete(key)
      if (isCurrent()) loadedRuntime.value = null
    }
  }

  const activate = () => {
    if (active) return
    active = true
    void load()
  }
  const deactivate = () => {
    if (!active) return
    active = false
    request += 1
  }
  onMounted(activate)
  onActivated(activate)
  onDeactivated(deactivate)
  onBeforeUnmount(deactivate)
  watch(context, () => {
    void load()
  })
  watch(
    () => factory().length,
    (count, previous) => {
      if (active && count > 0 && previous === 0) void load()
    }
  )
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
