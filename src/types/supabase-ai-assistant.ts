import type {
  AiAssistantChatRequest,
  AiAssistantChatResponse,
  AiAssistantFeedbackRequest
} from './ai-assistant'

export type ProjectCatalogAction =
  | 'overview'
  | 'schemas'
  | 'list_objects'
  | 'object_detail'
  | 'relationships'
  | 'capability_snapshot'
  | 'edge_functions'

export type ProjectObjectType =
  'all' | 'table' | 'view' | 'materialized_view' | 'function' | 'trigger' | 'policy' | 'index'

export interface ProjectOverview {
  projectRef: string
  databaseVersion: string
  schemas: number
  tables: number
  views: number
  functions: number
  triggers: number
  policies: number
  indexes: number
}

export interface ProjectDatabaseObject {
  schemaName: string
  objectName: string
  objectType: Exclude<ProjectObjectType, 'all'>
  description?: string | null
}

export interface ProjectObjectColumn {
  name: string
  dataType: string
  nullable: boolean
  defaultValue?: string | null
  description?: string | null
}

export interface ProjectObjectDetail extends ProjectDatabaseObject {
  ddl?: string
  tableName?: string
  identityArguments?: string
  resultType?: string
  columns?: ProjectObjectColumn[]
  constraints?: Array<{ name: string; type: string; definition: string }>
  notFound?: boolean
  [key: string]: unknown
}

export interface ProjectRelationship {
  constraintName: string
  sourceSchema: string
  sourceTable: string
  sourceColumns: string[]
  targetSchema: string
  targetTable: string
  targetColumns: string[]
  definition: string
}

export interface ProjectEdgeFunction {
  id?: string
  slug: string
  name?: string
  status?: string
  version?: number
  verifyJwt?: boolean
  verify_jwt?: boolean
  updatedAt?: number
  updated_at?: number
  source?: string
}

export interface ProjectEdgeFunctionResult {
  projectRef: string
  functions: ProjectEdgeFunction[]
  source: 'management_api' | 'bundled_manifest'
  warning?: string
}

export interface ProjectCapabilitySnapshot {
  projectRef: string
  capturedAt: string
  database: {
    version: string
    sizeBytes: number
    activeConnections: number
    maxConnections: number
    publicTables: number
    publicViews: number
    estimatedRows: number
    cacheHitPercent: number
  }
  security: {
    publicTables: number
    rlsEnabledTables: number
    forceRlsTables: number
    rlsCoveragePercent: number
    policyCount: number
    invalidIndexes: number
    unindexedForeignKeys: number
    views: number
    securityInvokerViews: number
    tablesWithoutRls: string[]
    unindexedForeignKeyTables: string[]
  }
  performance: {
    sequentialScans: number
    indexScans: number
    deadRows: number
    statements: {
      enabled: boolean
      trackedStatements: number
      meanExecutionMs?: number
      maxMeanExecutionMs?: number
    }
  }
  auth: {
    enabled: boolean
    users: number
    confirmedUsers: number
    active30d: number
  }
  storage: {
    enabled: boolean
    buckets: number
    publicBuckets: number
    objects: number
    totalBytes: number
    policies: number
  }
  realtime: {
    enabled: boolean
    publishedTables: number
  }
  cron: {
    enabled: boolean
    jobs: number
    activeJobs: number
  }
  queues: {
    enabled: boolean
    queues: number
  }
  vectors: {
    enabled: boolean
    columns: number
    indexes: number
  }
  extensions: {
    installed: Array<{ name: string; version: string }>
    vaultEnabled: boolean
  }
}

export interface ProjectCatalogRequest {
  catalogAction: ProjectCatalogAction
  args?: Record<string, unknown>
}

export interface ProjectAssistantConversationRun {
  id: string
  status: 'running' | 'succeeded' | 'failed'
  model: string
  promptVersion?: string
  inputTokens?: number
  outputTokens?: number
  latencyMs?: number | null
  toolCalls?: Array<{ name: string; status: 'succeeded' | 'failed'; latencyMs?: number }>
  errorCode?: string | null
  errorMessage?: string | null
  startedAt: string
  finishedAt?: string | null
}

export interface ProjectAssistantStoredMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  usage?: { inputTokens?: number; outputTokens?: number }
  createTime: string
}

export interface ProjectAssistantConversationSummary {
  id: string
  title: string
  context: Record<string, unknown>
  createTime: string
  updateTime: string
  lastMessage?: {
    role: 'user' | 'assistant'
    content: string
    createTime: string
  } | null
  lastRun?: ProjectAssistantConversationRun | null
}

export interface ProjectAssistantHistoryListResponse {
  conversations: ProjectAssistantConversationSummary[]
  total: number
}

export interface ProjectAssistantHistoryDetailResponse {
  conversation: ProjectAssistantConversationSummary
  messages: ProjectAssistantStoredMessage[]
  runs: ProjectAssistantConversationRun[]
}

export interface ProjectAssistantCapabilities {
  version: string
  safetyMode: 'read_only'
  allowedSafetyModes: ProjectAssistantSafetyMode[]
  access: {
    isPlatformSuper: boolean
    controlledWrite: boolean
  }
  features: {
    conversationHistory: boolean
    conversationRename: boolean
    feedback: boolean
    export: boolean
    multiRoundTools: boolean
    objectContextLock: boolean
    objectDescriptions: boolean
    objectDescriptionWrite: boolean
    platformCapabilitySnapshot: boolean
    securityPosture: boolean
    performancePosture: boolean
    authOverview: boolean
    storageOverview: boolean
    realtimeOverview: boolean
    asyncCapabilities: boolean
  }
  domains: string[]
  limits: {
    historyMessages: number
    messageLength: number
    toolCalls: number
    toolRounds: number
  }
  tools: string[]
}

export type ProjectAssistantSafetyMode = 'read_only' | 'controlled_write'

export interface ProjectObjectDescriptionUpdateRequest {
  objectType: Extract<ProjectObjectType, 'table' | 'view' | 'materialized_view'>
  schema: string
  name: string
  description: string | null
  safetyMode: 'controlled_write'
  confirmed: true
}

export interface ProjectObjectDescriptionUpdateResponse {
  ok: true
  object: ProjectDatabaseObject
  audit: { commandTag: string }
}

export type ProjectAssistantChatRequest = AiAssistantChatRequest & {
  safetyMode?: ProjectAssistantSafetyMode
}
export type ProjectAssistantChatResponse = AiAssistantChatResponse
export type ProjectAssistantFeedbackRequest = AiAssistantFeedbackRequest
