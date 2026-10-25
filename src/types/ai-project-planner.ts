export type AiSuggestionCategory =
  'product' | 'business' | 'ui_ux' | 'security' | 'performance' | 'quality' | 'developer_experience'

export type AiSuggestionEffort = 'small' | 'medium' | 'large'
export type AiPlannerEffort = AiSuggestionEffort | 'mixed'
export type AiSuggestionStatus = 'active' | 'accepted' | 'completed' | 'dismissed' | 'expired'
export type AiSuggestionEventType =
  | 'shown'
  | 'expanded'
  | 'copied'
  | 'liked'
  | 'disliked'
  | 'accepted'
  | 'completed'
  | 'dismissed'
  | 'restored'

export interface AiPlannerRepositorySnapshot {
  schemaVersion: string
  generatedAt: string
  sourceHash: string
  sourceVersion: string
}

export interface AiPlannerCapabilities {
  version: string
  providerConfigured: boolean
  provider: string
  model: string
  providers: Array<{ name: string; model: string }>
  protocol: 'openai_compatible'
  structuredOutput: boolean
  access: {
    mode: 'platform_write' | 'tenant_read_only'
    canManageWorkflow: boolean
  }
  repositorySnapshot: AiPlannerRepositorySnapshot
  categories: AiSuggestionCategory[]
  efforts: AiPlannerEffort[]
  events: AiSuggestionEventType[]
}

export interface AiPlannerPreferenceSummary {
  totalSignals: number
  categoryScores: Record<AiSuggestionCategory, number>
  preferredCategories: AiSuggestionCategory[]
  avoidedCategories: AiSuggestionCategory[]
}

export interface AiSuggestionEvidence {
  path: string
  fact: string
}

export interface AiSuggestionFeedbackState {
  sentiment: -1 | 0 | 1
  copied: number
  expanded: number
}

export interface AiProjectSuggestion {
  id: string
  batchId: string
  category: AiSuggestionCategory
  title: string
  summary: string
  evidence: AiSuggestionEvidence[]
  whyNow: string
  impact: number
  effort: AiSuggestionEffort
  confidence: number
  risk: string
  prompt: string
  acceptanceCriteria: string[]
  status: AiSuggestionStatus
  rankScore: number
  position: number
  feedback: AiSuggestionFeedbackState
  acceptedAt: string | null
  completedAt: string | null
  dismissedAt: string | null
  createTime: string
  updateTime: string
}

export interface AiSuggestionBatch {
  id: string
  snapshotId: string
  focus: string
  effort: AiPlannerEffort
  status: 'generating' | 'succeeded' | 'failed'
  model: string
  promptVersion: string
  preferenceSummary: AiPlannerPreferenceSummary
  suggestionCount: number
  errorMessage: string | null
  finishedAt: string | null
  createTime: string
}

export interface AiPlannerStatusCounts {
  active: number
  accepted: number
  completed: number
  dismissed: number
  expired: number
}

export interface AiPlannerState {
  latestBatch: AiSuggestionBatch | null
  suggestions: AiProjectSuggestion[]
  preferenceSummary: AiPlannerPreferenceSummary
  statusCounts: AiPlannerStatusCounts
  snapshot: AiPlannerRepositorySnapshot
}

export interface GenerateAiSuggestionsRequest {
  focus: 'balanced' | AiSuggestionCategory
  effort: AiPlannerEffort
}

export interface RecordAiSuggestionEventRequest {
  suggestionId: string
  eventType: AiSuggestionEventType
  reason?: string
  metadata?: Record<string, unknown>
}

export interface RecordAiSuggestionEventResponse {
  ok: true
  suggestionId: string
  eventType: AiSuggestionEventType
  status?: AiSuggestionStatus
  acceptedAt?: string
  completedAt?: string
  dismissedAt?: string | null
}
