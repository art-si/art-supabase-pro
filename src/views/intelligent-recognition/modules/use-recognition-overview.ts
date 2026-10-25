import { fetchRecognitionOverview } from '@/api/intelligent-recognition'

type RecognitionOverview = Api.IntelligentRecognition.RecognitionOverview

export function useRecognitionOverview() {
  const overview = reactive<RecognitionOverview>({
    total: 0,
    pending: 0,
    applied: 0,
    rejected: 0,
    lowConfidence: 0,
    pendingLowConfidence: 0,
    today: 0,
    avgConfidence: 0,
    byFeature: {}
  })
  const overviewLoading = ref(false)
  const overviewError = shallowRef<Error | null>(null)

  async function loadOverview(): Promise<void> {
    overviewLoading.value = true
    overviewError.value = null
    try {
      const response = await fetchRecognitionOverview()
      if (response.error) throw response.error
      if (!response.data) throw new Error('识别概览返回为空')
      Object.assign(overview, response.data)
    } catch (error) {
      overviewError.value = error instanceof Error ? error : new Error('识别概览加载失败')
    } finally {
      overviewLoading.value = false
    }
  }

  return { overview, overviewLoading, overviewError, loadOverview }
}
