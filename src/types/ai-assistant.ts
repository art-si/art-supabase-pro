export type AiAssistantMessageRole = 'user' | 'assistant'

export interface AiAssistantMessage {
  role: AiAssistantMessageRole
  content: string
}

export interface AiAssistantPageContext {
  routeName?: string
  routePath?: string
  pageTitle?: string
  recordId?: string
  query?: Record<string, unknown>
  capabilities?: {
    label?: string
    description?: string
    routePath?: string
    dataSources?: string[]
    filters?: Record<string, unknown>
    selection?: string[]
    filterFields?: string[]
  }[]
}

export interface AiAssistantChatRequest {
  conversationId?: string
  messages: AiAssistantMessage[]
  context?: AiAssistantPageContext
}

export interface AiAssistantToolResult {
  name: string
  status: 'succeeded' | 'failed'
  latencyMs?: number
}

export interface AiAssistantChatResponse {
  conversationId: string
  runId: string
  message: string
  tools: AiAssistantToolResult[]
  usage?: {
    inputTokens?: number
    outputTokens?: number
  }
  model?: string
  promptVersion?: string
  latencyMs?: number
  safetyMode?: 'read_only'
}

export interface AiAssistantFeedbackRequest {
  runId: string
  rating: -1 | 1
  comment?: string
}
