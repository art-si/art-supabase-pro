import {
  onBeforeUnmount,
  onMounted,
  ref,
  toValue,
  watch,
  type MaybeRefOrGetter,
  type Ref
} from 'vue'
import { useRoute, useRouter } from 'vue-router'

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
    try {
      const document = await options.fetchDocument(documentId)
      if (
        requestVersion !== version ||
        route.name !== toValue(options.routeName) ||
        route.query[queryKey] !== documentId ||
        !options.canOpen()
      )
        return
      await options.openDocument(document)
      if (
        options.clearQueryOnOpen !== false &&
        requestVersion === version &&
        route.name === toValue(options.routeName) &&
        route.query[queryKey] === documentId &&
        options.canOpen()
      )
        await router.replace({ path: route.path, query: { ...route.query, [queryKey]: undefined } })
      if (
        route.name === toValue(options.routeName) &&
        options.canOpen() &&
        (route.query[queryKey] === undefined || route.query[queryKey] === documentId)
      )
        await options.onOpened?.()
    } catch {
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
    watch(() => [route.name, route.query[queryKey], options.canOpen()], openLinkedDocument, {
      flush: 'post'
    })
    void openLinkedDocument()
  })
  onBeforeUnmount(() => {
    version += 1
  })
  return { loading, error, retry: openLinkedDocument }
}
