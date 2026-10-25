import {
  computed,
  onActivated,
  onDeactivated,
  onScopeDispose,
  shallowReactive,
  toValue,
  type MaybeRefOrGetter
} from 'vue'
import { useRoute } from 'vue-router'

export interface AssistantPageCapability {
  label?: string
  description?: string
  routePath?: string
  dataSources?: string[]
  filters?: Record<string, unknown>
  selection?: string[]
  filterFields?: string[]
  applyFilters?: (filters: Record<string, string>) => Promise<void>
  viewSelection?: () => Promise<void>
}

const pages = shallowReactive(
  new Map<symbol, { path: string; read: () => AssistantPageCapability }>()
)

/** Pages register only explicit, permission-preserving UI capabilities; never arbitrary code. */
export function useAssistantPage(source: MaybeRefOrGetter<AssistantPageCapability>): void {
  const route = useRoute()
  const key = Symbol('assistant-page')
  const path = route.path
  const register = (): void => {
    pages.set(key, { path, read: () => toValue(source) })
  }
  register()
  onActivated(register)
  onDeactivated(() => pages.delete(key))
  onScopeDispose(() => pages.delete(key))
}

export function useCurrentAssistantPage() {
  const route = useRoute()
  return computed(() =>
    [...pages.values()].filter((page) => page.path === route.path).map((page) => page.read())
  )
}
