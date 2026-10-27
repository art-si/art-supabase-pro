import { fetchRecognitionOverview } from '@/api/intelligent-recognition'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { createEmptyRecognitionOverview } from '@/utils/intelligent-recognition'
import { createFriendlySupabaseError } from '@/utils/supabase'

type RecognitionOverview = Api.IntelligentRecognition.RecognitionOverview

export function useRecognitionOverview() {
  const overview = reactive<RecognitionOverview>(createEmptyRecognitionOverview())
  const overviewLoading = ref(false)
  const overviewError = shallowRef<Error | null>(null)
  const tenantScope = useTenantScopeStore()
  let requestId = 0

  async function loadOverview(): Promise<void> {
    const currentRequestId = ++requestId
    overviewLoading.value = true
    overviewError.value = null
    try {
      const response = await fetchRecognitionOverview()
      if (currentRequestId !== requestId) return
      if (response.error) throw response.error
      if (!response.data) throw new Error('识别概览返回为空')
      Object.assign(overview, response.data)
    } catch (error) {
      if (currentRequestId !== requestId) return
      overviewError.value = createFriendlySupabaseError(error, '识别概览加载失败，请稍后重试')
    } finally {
      if (currentRequestId === requestId) overviewLoading.value = false
    }
  }

  watch(
    () => tenantScope.revision,
    () => {
      Object.assign(overview, createEmptyRecognitionOverview())
      void loadOverview()
    }
  )
  onBeforeUnmount(() => {
    requestId += 1
  })

  return { overview, overviewLoading, overviewError, loadOverview }
}
