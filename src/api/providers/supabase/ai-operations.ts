import { normalizeNullableText } from '@/utils/form/normalize'
import { buildSupabasePageRange } from '@/utils/supabase/pagination'
import dayjs from 'dayjs'
import { useSupabase } from '@/hooks/core/useSupabase'
import { createFriendlySupabaseFunctionError } from '@/utils/supabase/error'
import type { AiFeedbackIssueType } from '@/api/providers/supabase/ai-feedback'

export type { AiFeedbackIssueType } from '@/api/providers/supabase/ai-feedback'

const { supabase, responseHandle } = useSupabase()

export type AiRunStatus = 'running' | 'succeeded' | 'failed'

export interface AiOperationsTrendPoint {
  date: string
  total: number
  succeeded: number
  failed: number
}

export interface AiOperationsFeatureStat {
  feature: string
  total: number
  succeeded: number
  failed: number
  averageLatencyMs: number
}

export interface AiOperationsErrorStat {
  code: string
  count: number
}

export interface AiQualityTrendPoint {
  date: string
  total: number
  applied: number
  rejected: number
  acceptedFields: number
  correctedFields: number
}

export interface AiFieldQualityStat {
  field: string
  total: number
  accepted: number
  corrected: number
  acceptanceRate: number
}

export type AiFeedbackResolutionStatus = 'open' | 'in_progress' | 'resolved' | 'dismissed'

export interface AiFeatureFeedbackQuality {
  feature: string
  totalRuns: number
  successRate: number
  feedbackCount: number
  feedbackCoverageRate: number
  positiveFeedback: number
  negativeFeedback: number
  openIssues: number
}

export interface AiFeedbackQueueItem {
  feedbackId: number
  runId: string
  feature: string
  model: string
  comment?: string | null
  feedbackTime: string
  runStartedAt: string
  status: AiFeedbackResolutionStatus
  issueType?: AiFeedbackIssueType | null
  resolutionNote?: string | null
  resolvedAt?: string | null
  handledBy?: string | null
}

export interface AiFeedbackQualityOverview {
  days: number
  canManageFeedback: boolean
  totalRuns: number
  totalFeedback: number
  unratedRuns: number
  feedbackCoverageRate: number
  positiveFeedback: number
  negativeFeedback: number
  positiveRate: number
  openFeedbackIssues: number
  closedFeedbackIssues: number
  resolutionRate: number
  featureQuality: AiFeatureFeedbackQuality[]
  feedbackQueue: AiFeedbackQueueItem[]
}

export interface AiQualityOverview {
  totalArtifacts: number
  pendingArtifacts: number
  reviewedArtifacts: number
  appliedArtifacts: number
  rejectedArtifacts: number
  supersededArtifacts: number
  reviewCompletionRate: number
  applicationRate: number
  acceptedFields: number
  correctedFields: number
  fieldAcceptanceRate: number
  averageConfidence: number
  dailyTrend: AiQualityTrendPoint[]
  fieldQuality: AiFieldQualityStat[]
}

export interface AiOperationsOverview {
  days: number
  totalRuns: number
  succeededRuns: number
  failedRuns: number
  runningRuns: number
  successRate: number
  averageLatencyMs: number
  p95LatencyMs: number
  inputTokens: number
  outputTokens: number
  positiveFeedback: number
  negativeFeedback: number
  dailyTrend: AiOperationsTrendPoint[]
  featureBreakdown: AiOperationsFeatureStat[]
  topErrors: AiOperationsErrorStat[]
  quality: AiQualityOverview
  feedbackQuality: AiFeedbackQualityOverview
}

export interface AiOcrFeatureQuality {
  feature: string
  label: string
  artifacts: number
  reviewed: number
  applied: number
  averageConfidence: number
  acceptedFields: number
  correctedFields: number
  acceptanceRate: number
  threshold: number
  lowConfidence: number
  recommendedThreshold: number
}

export interface AiOcrQualityOverview {
  days: number
  canManage: boolean
  totalArtifacts: number
  reviewedArtifacts: number
  lowConfidenceArtifacts: number
  acceptedFields: number
  correctedFields: number
  features: AiOcrFeatureQuality[]
}

export interface AiRunFeedback {
  rating: -1 | 1
  comment?: string | null
  createTime?: string | null
}

export interface AiRunToolSummary {
  name: string
  status: 'succeeded' | 'failed'
}

export interface AiRunListItem {
  id: string
  conversationId?: string | null
  authUserId: string
  feature: string
  model: string
  promptVersion: string
  status: AiRunStatus
  inputTokens: number
  outputTokens: number
  latencyMs?: number | null
  toolCalls: AiRunToolSummary[]
  errorCode?: string | null
  errorMessage?: string | null
  metadata: Record<string, unknown>
  startedAt: string
  finishedAt?: string | null
  createBy?: string | null
  feedback?: AiRunFeedback[]
}

export interface AiRunSearchParams {
  current: number
  size: number
  feature?: string
  status?: AiRunStatus | ''
  model?: string
  timeRange?: string[]
}

export interface AiToolCallDetail {
  id: number
  toolName: string
  arguments: Record<string, unknown>
  status: 'succeeded' | 'failed'
  resultSummary: Record<string, unknown>
  latencyMs?: number | null
  errorMessage?: string | null
  createTime: string
}

export interface AiConversationMessage {
  id: number
  role: 'user' | 'assistant' | 'tool'
  content: string
  toolName?: string | null
  usage: Record<string, unknown>
  createTime: string
}

export interface AiRunConversation {
  title: string
  context: Record<string, unknown>
}

export interface AiRunDetail extends AiRunListItem {
  conversation?: AiRunConversation | null
  toolCallDetails: AiToolCallDetail[]
  messages: AiConversationMessage[]
}

export type AiDiagnosisSeverity = 'low' | 'medium' | 'high' | 'critical'
export type AiDiagnosisCategory =
  'provider' | 'configuration' | 'prompt' | 'tool' | 'data' | 'performance' | 'unknown'
export type AiDiagnosisPriority = 'P0' | 'P1' | 'P2'
export type AiDiagnosisOwner = 'platform' | 'tenant' | 'provider'

export interface AiDiagnosisRootCause {
  title: string
  evidence: string
  confidence: number
}

export interface AiDiagnosisAction {
  priority: AiDiagnosisPriority
  title: string
  steps: string[]
  owner: AiDiagnosisOwner
}

export interface AiRunDiagnosis {
  severity: AiDiagnosisSeverity
  category: AiDiagnosisCategory
  confidence: number
  summary: string
  rootCauses: AiDiagnosisRootCause[]
  actions: AiDiagnosisAction[]
  prevention: string[]
  observations: string[]
}

export interface AiRunDiagnosisResponse {
  diagnosis: AiRunDiagnosis
  runId: string
  targetRunId: string
  model: string
  provider: string
  promptVersion: string
  providerDurationMs: number
  durationMs: number
}

export interface AiFeedbackResolutionPayload {
  feedbackId: number
  status: AiFeedbackResolutionStatus
  issueType?: AiFeedbackIssueType | null
  resolutionNote?: string | null
}

export interface AiFeedbackResolutionRecord {
  id: string
  feedbackId: number
  status: AiFeedbackResolutionStatus
  issueType?: AiFeedbackIssueType | null
  resolutionNote?: string | null
  handledBy: string
  resolvedBy?: string | null
  resolvedAt?: string | null
  updateTime: string
}

const runListSelect = `
  id,
  conversation_id,
  auth_user_id,
  feature,
  model,
  prompt_version,
  status,
  input_tokens,
  output_tokens,
  latency_ms,
  tool_calls,
  error_code,
  error_message,
  metadata,
  started_at,
  finished_at,
  create_by,
  feedback:ai_feedback(rating,comment,create_time)
`

export function createEmptyAiOperationsOverview(days = 30): AiOperationsOverview {
  return {
    days,
    totalRuns: 0,
    succeededRuns: 0,
    failedRuns: 0,
    runningRuns: 0,
    successRate: 0,
    averageLatencyMs: 0,
    p95LatencyMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    positiveFeedback: 0,
    negativeFeedback: 0,
    dailyTrend: [],
    featureBreakdown: [],
    topErrors: [],
    quality: createEmptyAiQualityOverview(days),
    feedbackQuality: createEmptyAiFeedbackQualityOverview(days)
  }
}

export function createEmptyAiFeedbackQualityOverview(days = 30): AiFeedbackQualityOverview {
  return {
    days,
    canManageFeedback: false,
    totalRuns: 0,
    totalFeedback: 0,
    unratedRuns: 0,
    feedbackCoverageRate: 0,
    positiveFeedback: 0,
    negativeFeedback: 0,
    positiveRate: 0,
    openFeedbackIssues: 0,
    closedFeedbackIssues: 0,
    resolutionRate: 100,
    featureQuality: [],
    feedbackQueue: []
  }
}

export function createEmptyAiQualityOverview(days = 30): AiQualityOverview {
  const safeDays = Math.min(Math.max(Math.trunc(days), 1), 90)
  return {
    totalArtifacts: 0,
    pendingArtifacts: 0,
    reviewedArtifacts: 0,
    appliedArtifacts: 0,
    rejectedArtifacts: 0,
    supersededArtifacts: 0,
    reviewCompletionRate: 0,
    applicationRate: 0,
    acceptedFields: 0,
    correctedFields: 0,
    fieldAcceptanceRate: 0,
    averageConfidence: 0,
    dailyTrend: Array.from({ length: safeDays }, (_, index) => ({
      date: dayjs()
        .subtract(safeDays - index - 1, 'day')
        .format('YYYY-MM-DD'),
      total: 0,
      applied: 0,
      rejected: 0,
      acceptedFields: 0,
      correctedFields: 0
    })),
    fieldQuality: []
  }
}

export async function fetchAiOperationsOverview(days = 30): Promise<AiOperationsOverview> {
  const safeDays = Math.min(Math.max(Math.trunc(days), 1), 90)
  const [operationsResult, feedbackResult] = await Promise.all([
    responseHandle<AiOperationsOverview>(
      () => supabase.rpc('ai_operations_overview', { p_days: safeDays }),
      { breakReturn: true, showErrorMessage: true }
    ),
    responseHandle<AiFeedbackQualityOverview>(
      () => supabase.rpc('ai_quality_feedback_overview', { p_days: safeDays }),
      { breakReturn: true, showErrorMessage: true }
    )
  ])
  const data = operationsResult.data
  const overview = data ?? createEmptyAiOperationsOverview(safeDays)
  return {
    ...overview,
    quality: overview.quality ?? createEmptyAiQualityOverview(safeDays),
    feedbackQuality:
      feedbackResult.data ??
      overview.feedbackQuality ??
      createEmptyAiFeedbackQualityOverview(safeDays)
  }
}

export async function updateAiFeedbackResolution(
  payload: AiFeedbackResolutionPayload
): Promise<AiFeedbackResolutionRecord> {
  const { data } = await responseHandle<AiFeedbackResolutionRecord>(
    () =>
      supabase.rpc('upsert_ai_feedback_resolution', {
        p_feedback_id: payload.feedbackId,
        p_status: payload.status,
        p_issue_type: payload.issueType ?? null,
        p_resolution_note: normalizeNullableText(payload.resolutionNote)
      }),
    { breakReturn: true, showErrorMessage: true }
  )
  if (!data) throw new Error('AI 反馈处理结果未返回')
  return data
}

export async function fetchAiOcrQualityOverview(days = 30): Promise<AiOcrQualityOverview> {
  const { data } = await responseHandle<AiOcrQualityOverview>(
    () =>
      supabase.rpc('ai_ocr_quality_overview', {
        p_days: Math.min(Math.max(Math.trunc(days), 1), 90)
      }),
    { breakReturn: true, showErrorMessage: true }
  )
  return (
    data ?? {
      days,
      canManage: false,
      totalArtifacts: 0,
      reviewedArtifacts: 0,
      lowConfidenceArtifacts: 0,
      acceptedFields: 0,
      correctedFields: 0,
      features: []
    }
  )
}

export async function applyAiOcrQualityThreshold(params: {
  feature: string
  threshold: number
  reason: string
}): Promise<number> {
  const { data } = await responseHandle<number>(
    () =>
      supabase.rpc('apply_ai_ocr_quality_threshold', {
        p_feature: params.feature,
        p_threshold: params.threshold,
        p_reason: params.reason.trim()
      }),
    { breakReturn: true, showErrorMessage: true }
  )
  return Number(data ?? 0)
}

export async function fetchAiRunList(params: AiRunSearchParams) {
  const { from, to } = buildSupabasePageRange(params)

  let query = supabase
    .from('ai_run')
    .select(runListSelect, { count: 'exact' })
    .order('started_at', { ascending: false })
    .order('id')
    .range(from, to)

  if (params.feature) query = query.eq('feature', params.feature)
  if (params.status) query = query.eq('status', params.status)
  if (params.model?.trim()) query = query.ilike('model', `%${params.model.trim()}%`)
  if (params.timeRange?.[0]) {
    query = query.gte('started_at', dayjs(params.timeRange[0]).startOf('day').toISOString())
  }
  if (params.timeRange?.[1]) {
    query = query.lte('started_at', dayjs(params.timeRange[1]).endOf('day').toISOString())
  }

  return await responseHandle<AiRunListItem[]>(() => query, {
    showErrorMessage: true
  })
}

export async function fetchAiRunDetail(id: string): Promise<AiRunDetail> {
  const { data: run } = await responseHandle<AiRunListItem & { conversation?: AiRunConversation }>(
    () =>
      supabase
        .from('ai_run')
        .select(`${runListSelect},conversation:ai_conversation(title,context)`)
        .eq('id', id)
        .single(),
    { breakReturn: true, showErrorMessage: true }
  )
  if (!run) throw new Error('AI 运行记录不存在或无权查看')

  const toolPromise = responseHandle<AiToolCallDetail[]>(
    () =>
      supabase
        .from('ai_tool_call')
        .select('id,tool_name,arguments,status,result_summary,latency_ms,error_message,create_time')
        .eq('run_id', id)
        .order('create_time', { ascending: true }),
    { breakReturn: true }
  )
  const messagePromise = run.conversationId
    ? responseHandle<AiConversationMessage[]>(
        () =>
          supabase
            .from('ai_message')
            .select('id,role,content,tool_name,usage,create_time')
            .eq('conversation_id', run.conversationId)
            .order('create_time', { ascending: true }),
        { breakReturn: true }
      )
    : Promise.resolve({ data: [] as AiConversationMessage[], error: null })

  const [toolResult, messageResult] = await Promise.all([toolPromise, messagePromise])
  return {
    ...run,
    toolCallDetails: toolResult.data ?? [],
    messages: messageResult.data ?? []
  }
}

export async function diagnoseAiRun(id: string): Promise<AiRunDiagnosisResponse> {
  const { data, error } = await supabase.functions.invoke<AiRunDiagnosisResponse>(
    'ai-run-diagnosis',
    { body: { runId: id } }
  )
  if (error) throw await createFriendlySupabaseFunctionError(error, 'AI 运行诊断暂时不可用')
  if (!data?.runId || !data.diagnosis?.summary) throw new Error('AI 运行诊断返回格式无效')
  return data
}
