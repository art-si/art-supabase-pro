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
import configuredTableRoutes from '@/config/table-column-routes.generated.json'

const registeredRoutes = new Set(configuredTableRoutes)

const cache = new Map<string, { expires: number; value: Promise<TableColumnRuntime | null> }>()
const revision = ref(0)
const warned = new Set<string>()

export function invalidateTableColumnConfig(): void {
  cache.clear()
  revision.value += 1
}

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
      `${user.getUserInfo.userId ?? ''}:${tenant.effectiveTenantId ?? 'all'}:${tenant.revision}:${revision.value}`
  )

  async function load(): Promise<void> {
    if (!active || !user.getUserInfo.userId || !factory().length) return
    const current = ++request
    runtime.value = null
    const element = owner?.proxy?.$el
    if (element instanceof Element && element.closest('.el-dialog, .el-drawer')) return
    const key = `${context.value}:${routePath}`
    try {
      const now = Date.now()
      let entry = cache.get(key)
      if (!entry || entry.expires < now) {
        entry = {
          expires: now + 60_000,
          value: fetchTableColumnRuntime(routePath)
        }
        cache.set(key, entry)
      }
      const value = await entry.value
      if (current === request) runtime.value = value
    } catch {
      cache.delete(key)
      if (current !== request || warned.has(key)) return
      warned.add(key)
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
