import { createDateTimeFormatter } from '@/utils/ui/format'
import { countBy, groupBy, orderBy } from 'lodash-es'
import type { TagProps } from 'element-plus'
import type { DictMap } from '@/types/store'
import type {
  AiPlannerEffort,
  AiPlannerState,
  AiPlannerStatusCounts,
  AiProjectSuggestion,
  AiSuggestionCategory,
  AiSuggestionEffort,
  AiSuggestionEventType,
  AiSuggestionStatus
} from '@/types/ai-project-planner'

export const LATEST_BATCH = '__latest__'
export const ALL_BATCHES = '__all__'

export type ProjectPlannerDictCode =
  | 'aiSuggestionCategory'
  | 'aiSuggestionStatus'
  | 'aiSuggestionEffort'
  | 'aiSuggestionFeedbackReason'

export type SuggestionPendingAction = Extract<
  AiSuggestionEventType,
  'copied' | 'liked' | 'disliked' | 'accepted' | 'completed' | 'dismissed' | 'restored'
>

export type SuggestionSort = 'recommended' | 'quick_win' | 'impact' | 'confidence' | 'recent'

export interface ProjectPlannerFilters {
  batchId: string
  keyword: string
  status: AiSuggestionStatus | 'all'
  category: AiSuggestionCategory | 'all'
  effort: AiPlannerEffort | 'all'
  sort: SuggestionSort
}

export interface ProjectPlannerSortOption {
  label: string
  value: SuggestionSort
}

export interface ProjectPlannerMetric {
  label: string
  value: string
  hint: string
  icon: string
  tone: 'primary' | 'success' | 'warning' | 'info'
}

export interface ProjectPlannerBatchOption {
  label: string
  value: string
}

export interface ProjectPlannerBatchView {
  batchOptions: ProjectPlannerBatchOption[]
  latestBatchHasSuggestions: boolean
  latestAvailableSuggestions: AiProjectSuggestion[]
  scopedSuggestions: AiProjectSuggestion[]
}

export const projectPlannerSortOptions: ProjectPlannerSortOption[] = [
  { label: '智能推荐排序', value: 'recommended' },
  { label: '优先快速收益', value: 'quick_win' },
  { label: '影响力优先', value: 'impact' },
  { label: '置信度优先', value: 'confidence' },
  { label: '最近生成优先', value: 'recent' }
]

export function getProjectPlannerDictLabel(
  dictMap: DictMap,
  code: ProjectPlannerDictCode,
  value: string
): string {
  const item = (dictMap[code] ?? []).find((candidate) => String(candidate.value) === value)
  return String(item?.label ?? value)
}

export function getProjectPlannerDictTagType(
  dictMap: DictMap,
  code: ProjectPlannerDictCode,
  value: string
): TagProps['type'] {
  const item = (dictMap[code] ?? []).find((candidate) => String(candidate.value) === value)
  const type = item?.tagType
  return ['primary', 'success', 'warning', 'info', 'danger'].includes(String(type))
    ? (type as TagProps['type'])
    : 'info'
}

export function createProjectPlannerFilters(): ProjectPlannerFilters {
  return {
    batchId: LATEST_BATCH,
    keyword: '',
    status: 'all',
    category: 'all',
    effort: 'all',
    sort: 'recommended'
  }
}

export const formatProjectPlannerTime = createDateTimeFormatter({
  format: 'YYYY-MM-DD HH:mm',
  emptyText: '—',
  invalidText: '—'
})

export function createProjectPlannerBatchView(
  state: Pick<AiPlannerState, 'latestBatch' | 'suggestions'>,
  selectedBatchId: string
): ProjectPlannerBatchView {
  const suggestionBatches = orderBy(
    Object.entries(groupBy(state.suggestions, (suggestion) => suggestion.batchId)),
    ([, suggestions]) => suggestions[0]?.createTime ?? '',
    ['desc']
  )
  const latestAvailableBatchId = suggestionBatches[0]?.[0]
  const latestBatchHasSuggestions = state.latestBatch?.id
    ? state.suggestions.some((suggestion) => suggestion.batchId === state.latestBatch?.id)
    : false
  const latestBatchId = latestBatchHasSuggestions ? state.latestBatch?.id : latestAvailableBatchId
  const suggestionsByBatch = groupBy(state.suggestions, (suggestion) => suggestion.batchId)
  const latestAvailableSuggestions = latestBatchId ? (suggestionsByBatch[latestBatchId] ?? []) : []
  const historyOptions = suggestionBatches
    .filter(([batchId]) => batchId !== latestBatchId)
    .map(([batchId, suggestions], index) => ({
      value: batchId,
      label: `历史批次 ${index + 1} · ${formatProjectPlannerTime(suggestions[0]?.createTime ?? '')} · ${suggestions.length} 条`
    }))
  const batchOptions: ProjectPlannerBatchOption[] = [
    {
      value: LATEST_BATCH,
      label: latestAvailableSuggestions.length
        ? `${latestBatchHasSuggestions ? '最新批次' : '最新可用批次'} · ${formatProjectPlannerTime(latestAvailableSuggestions[0].createTime)} · ${latestAvailableSuggestions.length} 条`
        : '暂无可用批次'
    },
    { value: ALL_BATCHES, label: `全部历史批次 · ${state.suggestions.length} 条` },
    ...historyOptions
  ]

  if (selectedBatchId === ALL_BATCHES) {
    return {
      batchOptions,
      latestBatchHasSuggestions,
      latestAvailableSuggestions,
      scopedSuggestions: state.suggestions
    }
  }

  const resolvedBatchId = selectedBatchId === LATEST_BATCH ? latestBatchId : selectedBatchId
  return {
    batchOptions,
    latestBatchHasSuggestions,
    latestAvailableSuggestions,
    scopedSuggestions: resolvedBatchId
      ? state.suggestions.filter((suggestion) => suggestion.batchId === resolvedBatchId)
      : state.suggestions
  }
}

export function countProjectPlannerStatuses(
  suggestions: AiProjectSuggestion[]
): AiPlannerStatusCounts {
  const counts = countBy(suggestions, (suggestion) => suggestion.status)
  return {
    active: counts.active ?? 0,
    accepted: counts.accepted ?? 0,
    completed: counts.completed ?? 0,
    dismissed: counts.dismissed ?? 0,
    expired: counts.expired ?? 0
  }
}

export function getProjectPlannerPrioritySuggestion(
  suggestions: AiProjectSuggestion[]
): AiProjectSuggestion | undefined {
  return orderBy(
    suggestions.filter((suggestion) => suggestion.status === 'active'),
    ['rankScore', 'impact', 'confidence'],
    ['desc', 'desc', 'desc']
  )[0]
}

export function createProjectPlannerMetrics(
  statusCounts: AiPlannerStatusCounts,
  totalSignals: number,
  preferenceHint: string
): ProjectPlannerMetric[] {
  return [
    {
      label: '待评估',
      value: String(statusCounts.active),
      hint: '等待选择的下一步',
      icon: 'ri:lightbulb-flash-line',
      tone: 'primary'
    },
    {
      label: '已采纳',
      value: String(statusCounts.accepted),
      hint: '已进入实施队列',
      icon: 'ri:checkbox-circle-line',
      tone: 'warning'
    },
    {
      label: '已完成',
      value: String(statusCounts.completed),
      hint: '已产生项目进展',
      icon: 'ri:verified-badge-line',
      tone: 'success'
    },
    {
      label: '偏好信号',
      value: String(totalSignals),
      hint: preferenceHint,
      icon: 'ri:radar-line',
      tone: 'info'
    }
  ]
}

export function hasProjectPlannerActiveFilters(filters: ProjectPlannerFilters): boolean {
  return (
    Boolean(filters.keyword.trim()) ||
    filters.batchId !== LATEST_BATCH ||
    filters.status !== 'all' ||
    filters.category !== 'all' ||
    filters.effort !== 'all' ||
    filters.sort !== 'recommended'
  )
}

export function filterAndSortProjectSuggestions(
  suggestions: AiProjectSuggestion[],
  filters: ProjectPlannerFilters
): AiProjectSuggestion[] {
  const keyword = filters.keyword.trim().toLowerCase()
  const matches = suggestions.filter((suggestion) => {
    if (filters.status !== 'all' && suggestion.status !== filters.status) return false
    if (filters.category !== 'all' && suggestion.category !== filters.category) return false
    if (filters.effort !== 'all' && suggestion.effort !== filters.effort) return false
    if (!keyword) return true

    return [
      suggestion.title,
      suggestion.summary,
      suggestion.whyNow,
      suggestion.risk,
      ...suggestion.evidence.flatMap((item) => [item.path, item.fact])
    ]
      .join(' ')
      .toLowerCase()
      .includes(keyword)
  })

  if (filters.sort === 'quick_win') {
    const effortScore: Record<AiSuggestionEffort, number> = { small: 3, medium: 2, large: 1 }
    return orderBy(
      matches,
      [
        (item) => item.impact * effortScore[item.effort] * item.confidence,
        (item) => item.rankScore
      ],
      ['desc', 'desc']
    )
  }
  if (filters.sort === 'impact') {
    return orderBy(matches, ['impact', 'confidence'], ['desc', 'desc'])
  }
  if (filters.sort === 'confidence') {
    return orderBy(matches, ['confidence', 'impact'], ['desc', 'desc'])
  }
  if (filters.sort === 'recent') return orderBy(matches, ['createTime'], ['desc'])
  return orderBy(matches, ['rankScore', 'position'], ['desc', 'asc'])
}
