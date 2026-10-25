import { computed, reactive, type Ref } from 'vue'
import type { DictMap } from '@/types/store'
import type { AiPlannerCapabilities, AiPlannerState } from '@/types/ai-project-planner'
import {
  countProjectPlannerStatuses,
  createProjectPlannerBatchView,
  createProjectPlannerFilters,
  createProjectPlannerMetrics,
  filterAndSortProjectSuggestions,
  formatProjectPlannerTime,
  getProjectPlannerDictLabel,
  getProjectPlannerPrioritySuggestion,
  hasProjectPlannerActiveFilters,
  projectPlannerSortOptions,
  type ProjectPlannerFilters
} from './project-planner-view-model'

interface UseProjectPlannerViewOptions {
  capabilities: Ref<AiPlannerCapabilities | null>
  dictMap: Ref<DictMap>
  state: AiPlannerState
}

export function useProjectPlannerView(options: UseProjectPlannerViewOptions) {
  const filters = reactive<ProjectPlannerFilters>(createProjectPlannerFilters())
  const categoryOptions = computed(() => options.dictMap.value.aiSuggestionCategory ?? [])
  const effortFilterOptions = computed(() =>
    (options.dictMap.value.aiSuggestionEffort ?? []).filter((option) => option.value !== 'mixed')
  )
  const statusFilterOptions = computed(() => [
    { label: '全部', value: 'all' },
    ...(options.dictMap.value.aiSuggestionStatus ?? [])
      .filter((item) => item.value !== 'expired')
      .map((item) => ({ label: String(item.label), value: String(item.value) }))
  ])
  const batchView = computed(() => createProjectPlannerBatchView(options.state, filters.batchId))
  const filteredSuggestions = computed(() =>
    filterAndSortProjectSuggestions(batchView.value.scopedSuggestions, filters)
  )
  const prioritySuggestion = computed(() =>
    getProjectPlannerPrioritySuggestion(batchView.value.scopedSuggestions)
  )
  const hasActiveFilters = computed(() => hasProjectPlannerActiveFilters(filters))
  const preferenceHint = computed(() => {
    const preferred = options.state.preferenceSummary.preferredCategories[0]
    return preferred
      ? `当前偏好：${getProjectPlannerDictLabel(
          options.dictMap.value,
          'aiSuggestionCategory',
          preferred
        )}`
      : '点赞、复制、采纳都会参与排序'
  })
  const metrics = computed(() =>
    createProjectPlannerMetrics(
      countProjectPlannerStatuses(batchView.value.scopedSuggestions),
      options.state.preferenceSummary.totalSignals,
      preferenceHint.value
    )
  )
  const toolbarSubtitle = computed(() => {
    if (batchView.value.latestBatchHasSuggestions && options.state.latestBatch) {
      return `最近由 ${options.state.latestBatch.model} 生成 · ${formatProjectPlannerTime(options.state.latestBatch.createTime)}`
    }
    if (batchView.value.latestAvailableSuggestions.length) {
      return `最近可用建议 · ${formatProjectPlannerTime(
        batchView.value.latestAvailableSuggestions[0].createTime
      )}`
    }
    if (options.capabilities.value?.providerConfigured) {
      return `已连接 ${options.capabilities.value.provider} · ${options.capabilities.value.model}`
    }
    return '生成后会根据反馈持续调整排序'
  })

  function resetFilters(): void {
    Object.assign(filters, createProjectPlannerFilters())
  }

  return {
    batchOptions: computed(() => batchView.value.batchOptions),
    categoryOptions,
    effortFilterOptions,
    filteredSuggestions,
    filters,
    hasActiveFilters,
    metrics,
    prioritySuggestion,
    resetFilters,
    scopedSuggestions: computed(() => batchView.value.scopedSuggestions),
    sortOptions: projectPlannerSortOptions,
    statusFilterOptions,
    toolbarSubtitle
  }
}
