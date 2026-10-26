import {
  onBeforeUnmount,
  onMounted,
  nextTick,
  ref,
  toValue,
  watch,
  type MaybeRefOrGetter,
  type Ref
} from 'vue'
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router'
import { createTenantScopeReadGuard } from '@/utils/tenant-scope-context'

/** Open route-linked detail in cached pages while retaining failed links for retry. */
export function useRouteDocumentDrawer<T>(options: {
  routeName: MaybeRefOrGetter<string>
  canOpen: () => boolean
  fetchDocument: (id: string) => Promise<T>
  openDocument: (document: T) => Promise<void>
  onOpened?: () => Promise<unknown>
  onError?: () => void
  queryKey?: string
  clearQueryOnOpen?: boolean
}): { loading: Ref<boolean>; error: Ref<boolean>; retry: () => Promise<void> } {
  const route = useRoute()
  const router = useRouter()
  let version = 0
  const queryKey = options.queryKey ?? 'documentId'
  const loading = ref(false)
  const error = ref(false)
  let internalQueryUpdate: { version: number; fullPath: string } | undefined
  async function replaceOwnQuery(
    query: LocationQueryRaw,
    requestVersion: number
  ): Promise<string | undefined> {
    const destination = { path: route.path, query, hash: route.hash }
    const update = { version: requestVersion, fullPath: router.resolve(destination).fullPath }
    internalQueryUpdate = update
    try {
      await router.replace(destination)
      await nextTick()
      if (requestVersion !== version) return
      if (route.fullPath !== update.fullPath) throw new Error('关联单据地址未更新')
      return update.fullPath
    } finally {
      if (internalQueryUpdate === update) internalQueryUpdate = undefined
    }
  }
  async function openLinkedDocument(): Promise<void> {
    const requestVersion = ++version
    const documentId = route.query[queryKey]
    loading.value = false
    error.value = false
    if (
      route.name !== toValue(options.routeName) ||
      typeof documentId !== 'string' ||
      !options.canOpen()
    )
      return
    loading.value = true
    const assertScope = createTenantScopeReadGuard()
    let cleanedFullPath: string | undefined
    try {
      const document = await options.fetchDocument(documentId)
      assertScope()
      if (
        requestVersion !== version ||
        route.name !== toValue(options.routeName) ||
        route.query[queryKey] !== documentId ||
        !options.canOpen()
      )
        return
      if (options.clearQueryOnOpen !== false) {
        cleanedFullPath = await replaceOwnQuery(
          { ...route.query, [queryKey]: undefined },
          requestVersion
        )
        if (!cleanedFullPath) return
        assertScope()
      }
      if (
        requestVersion !== version ||
        route.name !== toValue(options.routeName) ||
        !options.canOpen()
      )
        return
      await options.openDocument(document)
      if (
        route.name === toValue(options.routeName) &&
        options.canOpen() &&
        (route.query[queryKey] === undefined || route.query[queryKey] === documentId)
      )
        await options.onOpened?.()
    } catch {
      if (requestVersion !== version || route.name !== toValue(options.routeName)) return
      if (
        cleanedFullPath &&
        route.fullPath === cleanedFullPath &&
        route.query[queryKey] === undefined
      ) {
        try {
          await replaceOwnQuery({ ...route.query, [queryKey]: documentId }, requestVersion)
        } catch {
          if (requestVersion === version) {
            error.value = true
            options.onError?.()
          }
          return
        }
      }
      if (
        requestVersion === version &&
        route.name === toValue(options.routeName) &&
        route.query[queryKey] === documentId
      ) {
        error.value = true
        options.onError?.()
      }
    } finally {
      if (requestVersion === version) loading.value = false
    }
  }
  onMounted(() => {
    watch(
      () => [route.name, route.query[queryKey], options.canOpen()],
      () => {
        if (
          internalQueryUpdate?.version === version &&
          internalQueryUpdate.fullPath === route.fullPath &&
          options.canOpen()
        )
          return
        void openLinkedDocument()
      },
      { flush: 'post' }
    )
    void openLinkedDocument()
  })
  onBeforeUnmount(() => {
    version += 1
  })
  return { loading, error, retry: openLinkedDocument }
}
