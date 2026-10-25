import { AiProviderRequestError, requestAiProviderWithFallback, getAiProviderFailure } from '../_shared/ai-provider-request.ts'
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import {
  loadAiRuntimeConfig,
  type AiRuntimeConfig
} from '../_shared/ai-runtime-config.ts'
import {
  resolveAiProviderEndpoints,
  type AiProviderEndpoint
} from '../_shared/ai-provider-endpoints.ts'
import { loadPublishedAiPrompt } from '../_shared/ai-prompt-template.ts'

const FEATURE = 'project_assistant'
const PROJECT_REF = 'ckbftoopuyophiebamwy'
const CONTRACT_VERSION = '3.0.0'
const DEFAULT_PROMPT = [
  '你是 Art Supabase Pro 的 Supabase 项目管理助手。',
  '你服务于已启用的系统用户，并且当前处于严格只读模式。',
  '项目事实必须通过白名单工具查询；不得猜测数据库对象或 Edge Function。',
  '你能够分析 Database、RLS、Auth、Storage、Realtime、Edge Functions、Cron、Queues、向量、扩展和性能指标。',
  '必须区分“已启用”“未启用”“未检测到”；不得把未启用能力描述成故障。',
  '你可以解释或生成 DDL、DQL、DML 草稿，但绝不能执行任何数据库变更或任意 SQL。',
  '复杂问题应主动分步查询多个工具，并区分“已验证事实”“风险判断”和“建议方案”。',
  '回答使用清晰的中文，写明 schema、对象名称、影响范围、回滚思路和人工复核步骤。'
].join('\n')

type MessageRole = 'user' | 'assistant'
type CatalogAction =
  | 'overview'
  | 'schemas'
  | 'list_objects'
  | 'object_detail'
  | 'relationships'
  | 'capability_snapshot'
  | 'edge_functions'
type ToolName =
  | 'get_project_overview'
  | 'list_database_schemas'
  | 'list_database_objects'
  | 'get_database_object_detail'
  | 'get_table_relationships'
  | 'get_supabase_capability_snapshot'
  | 'get_security_posture'
  | 'get_performance_posture'
  | 'get_auth_overview'
  | 'get_storage_overview'
  | 'get_realtime_overview'
  | 'get_database_extensions'
  | 'get_async_capabilities'
  | 'list_edge_functions'

interface AssistantMessage {
  role: MessageRole
  content: string
}

interface AssistantContext {
  routeName?: string
  routePath?: string
  pageTitle?: string
  selectedObject?: Record<string, unknown>
  query?: Record<string, unknown>
}

interface AssistantRequest {
  action?:
    | 'chat'
    | 'feedback'
    | 'catalog'
    | 'capabilities'
    | 'history_list'
    | 'history_detail'
    | 'history_rename'
    | 'catalog_update_description'
  conversationId?: string
  runId?: string
  rating?: -1 | 1
  comment?: string
  messages?: AssistantMessage[]
  context?: AssistantContext
  catalogAction?: CatalogAction
  args?: Record<string, unknown>
  query?: string
  limit?: number
  title?: string
  safetyMode?: 'read_only' | 'controlled_write'
  objectType?: string
  schema?: string
  name?: string
  description?: string | null
  confirmed?: boolean
}

interface AppUser {
  tenant_id: string
  user_email: string
  status: string | null
}

interface ProviderToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

interface ProviderMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_call_id?: string
  tool_calls?: ProviderToolCall[]
}

interface ProviderResult {
  message: ProviderMessage
  usage: { prompt_tokens?: number; completion_tokens?: number }
  model: string
}

interface ToolExecutionContext {
  capabilitySnapshot?: Record<string, unknown>
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

const MAX_HISTORY_MESSAGES = 24
const MAX_MESSAGE_LENGTH = 4000
const MAX_TOOL_CALLS = 14
const MAX_TOOL_ROUNDS = 5
const toolNames = new Set<ToolName>([
  'get_project_overview',
  'list_database_schemas',
  'list_database_objects',
  'get_database_object_detail',
  'get_table_relationships',
  'get_supabase_capability_snapshot',
  'get_security_posture',
  'get_performance_posture',
  'get_auth_overview',
  'get_storage_overview',
  'get_realtime_overview',
  'get_database_extensions',
  'get_async_capabilities',
  'list_edge_functions'
])
const capabilityToolNames = new Set<ToolName>([
  'get_supabase_capability_snapshot',
  'get_security_posture',
  'get_performance_posture',
  'get_auth_overview',
  'get_storage_overview',
  'get_realtime_overview',
  'get_database_extensions',
  'get_async_capabilities'
])
const catalogActions = new Set<CatalogAction>([
  'overview',
  'schemas',
  'list_objects',
  'object_detail',
  'relationships',
  'capability_snapshot',
  'edge_functions'
])

const edgeFunctionManifest = [
  ['sync-user', true],
  ['register-and-sync-user', false],
  ['check_user_status', false],
  ['admin_reset_password', true],
  ['execute-sql-with-columns', true],
  ['proxy-logs', true],
  ['ai-sql-assistant', true],
  ['driver-auth', false],
  ['sync-driver-waybills', true],
  ['ai-order-assistant', true],
  ['ai-assistant', true],
  ['ai-provider-catalog', true],
  ['ai-run-diagnosis', true],
  ['ai-project-assistant', true]
].map(([slug, verifyJwt]) => ({ slug, name: slug, status: 'ACTIVE', verifyJwt, source: 'manifest' }))

const tools = [
  {
    type: 'function',
    function: {
      name: 'get_project_overview',
      description: '查询当前 Supabase 项目的数据库版本以及 schema、表、视图、函数、触发器、RLS 策略和索引数量。',
      parameters: { type: 'object', properties: {}, additionalProperties: false }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_database_schemas',
      description: '列出当前用户可见的数据库 schema。需要确定对象所属命名空间时使用。',
      parameters: { type: 'object', properties: {}, additionalProperties: false }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_database_objects',
      description: '按对象类型、schema 和关键词查询数据库对象目录。',
      parameters: {
        type: 'object',
        properties: {
          objectType: {
            type: 'string',
            enum: ['all', 'table', 'view', 'function', 'trigger', 'policy', 'index']
          },
          schema: { type: 'string' },
          keyword: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: 100 }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_database_object_detail',
      description: '查看一个数据库对象的字段、约束和只读 DDL 定义。',
      parameters: {
        type: 'object',
        properties: {
          objectType: {
            type: 'string',
            enum: ['table', 'view', 'materialized_view', 'function', 'trigger', 'policy', 'index']
          },
          schema: { type: 'string' },
          name: { type: 'string' }
        },
        required: ['objectType', 'schema', 'name'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_table_relationships',
      description: '查询数据库外键关系，可限定 schema 或表名。',
      parameters: {
        type: 'object',
        properties: { schema: { type: 'string' }, name: { type: 'string' } },
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_supabase_capability_snapshot',
      description:
        '获取 Supabase 全域能力快照，覆盖数据库、RLS、安全、性能、Auth、Storage、Realtime、Cron、Queues、向量和扩展。',
      parameters: { type: 'object', properties: {}, additionalProperties: false }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_security_posture',
      description:
        '获取项目安全治理摘要，包括 RLS 覆盖率、策略、无效索引、未索引外键和 security_invoker 视图。',
      parameters: { type: 'object', properties: {}, additionalProperties: false }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_performance_posture',
      description:
        '获取数据库性能摘要，包括缓存命中率、连接数、顺序扫描、索引扫描、死元组和语句统计能力。',
      parameters: { type: 'object', properties: {}, additionalProperties: false }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_auth_overview',
      description: '获取 Supabase Auth 聚合状态，只返回用户数、已确认数和近 30 天活跃数，不返回用户身份。',
      parameters: { type: 'object', properties: {}, additionalProperties: false }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_storage_overview',
      description: '获取 Supabase Storage 聚合状态，包括桶、对象、容量、公开桶和 RLS 策略数量。',
      parameters: { type: 'object', properties: {}, additionalProperties: false }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_realtime_overview',
      description: '获取 Supabase Realtime 发布状态和已发布表数量。',
      parameters: { type: 'object', properties: {}, additionalProperties: false }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_database_extensions',
      description: '获取已安装 Postgres 扩展及版本，并检测 Vault 能力。',
      parameters: { type: 'object', properties: {}, additionalProperties: false }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_async_capabilities',
      description: '检测 Cron、Queues 和 pgvector/向量索引等异步与 AI 数据基础能力。',
      parameters: { type: 'object', properties: {}, additionalProperties: false }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_edge_functions',
      description: '列出当前项目已知的 Supabase Edge Functions、状态和 JWT 校验配置。',
      parameters: { type: 'object', properties: {}, additionalProperties: false }
    }
  }
]

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function integerValue(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(parsed)))
}

function safeJsonParse(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

function isToolName(value: string): value is ToolName {
  return toolNames.has(value as ToolName)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

function isAbortLikeError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.name === 'AbortError' || /aborted|aborterror|signal|timeout|timed out/i.test(error.message)
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeoutId)
  }
}

async function requestProvider(
  endpoint: AiProviderEndpoint,
  messages: ProviderMessage[],
  allowTools: boolean,
  config: AiRuntimeConfig
): Promise<ProviderResult> {
  const models = [...new Set([endpoint.model, endpoint.fallbackModel].filter(Boolean))] as string[]
  let lastError = new Error('AI provider request failed')
  for (const model of models) {
    for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
      const body: Record<string, unknown> = {
        model,
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        stream: false,
        messages
      }
      if (allowTools) Object.assign(body, { tools, tool_choice: 'auto', parallel_tool_calls: false })
      try {
        const response = await fetchWithTimeout(`${endpoint.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${endpoint.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        }, config.timeoutMs)
        if (!response.ok) {
          lastError = new AiProviderRequestError(response.status)
          if (response.status < 500 && response.status !== 429) break
          continue
        }
        const payload = await response.json()
        const message = payload?.choices?.[0]?.message as ProviderMessage | undefined
        if (!message) throw new Error('AI provider returned an empty response')
        return { message, usage: payload?.usage ?? {}, model }
      } catch (error) {
        lastError = isAbortLikeError(error)
          ? new Error('AI provider request timed out')
          : error instanceof Error
            ? error
            : lastError
      }
    }
  }
  throw lastError
}


async function listEdgeFunctions(): Promise<Record<string, unknown>> {
  const accessToken = Deno.env.get('SUPABASE_ACCESS_TOKEN')
  if (!accessToken) {
    return {
      projectRef: PROJECT_REF,
      functions: edgeFunctionManifest,
      source: 'bundled_manifest',
      warning: '未配置 SUPABASE_ACCESS_TOKEN，当前展示随应用发布的函数清单；源码读取将在后续安全配置完成后开放。'
    }
  }
  try {
    const response = await fetchWithTimeout(
      `https://api.supabase.com/v1/projects/${PROJECT_REF}/functions`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
      15_000
    )
    if (!response.ok) throw new Error(`Management API HTTP ${response.status}`)
    const functions = await response.json()
    return { projectRef: PROJECT_REF, functions, source: 'management_api' }
  } catch (error) {
    return {
      projectRef: PROJECT_REF,
      functions: edgeFunctionManifest,
      source: 'bundled_manifest',
      warning: error instanceof Error ? error.message : 'Management API unavailable'
    }
  }
}

async function executeCatalog(
  action: CatalogAction,
  args: Record<string, unknown>,
  userClient: SupabaseClient
): Promise<unknown> {
  if (action === 'edge_functions') return await listEdgeFunctions()
  if (action === 'capability_snapshot') {
    const { data, error } = await userClient.rpc('get_ai_project_capability_snapshot')
    if (error) throw error
    return data
  }
  const { data, error } = await userClient.rpc('get_ai_project_catalog', {
    p_action: action,
    p_args: args
  })
  if (error) throw error
  return data
}

async function executeTool(
  name: ToolName,
  args: Record<string, unknown>,
  userClient: SupabaseClient,
  context: ToolExecutionContext
): Promise<unknown> {
  if (capabilityToolNames.has(name)) {
    if (!context.capabilitySnapshot) {
      const snapshot = await executeCatalog('capability_snapshot', {}, userClient)
      if (!isRecord(snapshot)) throw new Error('Capability snapshot returned an invalid result')
      context.capabilitySnapshot = snapshot
    }
    const snapshot = context.capabilitySnapshot
    if (name === 'get_supabase_capability_snapshot') return snapshot
    if (name === 'get_security_posture') {
      return { database: snapshot.database, security: snapshot.security }
    }
    if (name === 'get_performance_posture') {
      return { database: snapshot.database, performance: snapshot.performance }
    }
    if (name === 'get_auth_overview') return snapshot.auth
    if (name === 'get_storage_overview') return snapshot.storage
    if (name === 'get_realtime_overview') return snapshot.realtime
    if (name === 'get_database_extensions') return snapshot.extensions
    if (name === 'get_async_capabilities') {
      return { cron: snapshot.cron, queues: snapshot.queues, vectors: snapshot.vectors }
    }
  }
  const actionMap: Record<ToolName, CatalogAction> = {
    get_project_overview: 'overview',
    list_database_schemas: 'schemas',
    list_database_objects: 'list_objects',
    get_database_object_detail: 'object_detail',
    get_table_relationships: 'relationships',
    get_supabase_capability_snapshot: 'capability_snapshot',
    get_security_posture: 'capability_snapshot',
    get_performance_posture: 'capability_snapshot',
    get_auth_overview: 'capability_snapshot',
    get_storage_overview: 'capability_snapshot',
    get_realtime_overview: 'capability_snapshot',
    get_database_extensions: 'capability_snapshot',
    get_async_capabilities: 'capability_snapshot',
    list_edge_functions: 'edge_functions'
  }
  return await executeCatalog(actionMap[name], args, userClient)
}

async function listConversationHistory(
  admin: SupabaseClient,
  userId: string,
  tenantId: string,
  query: string,
  limit: number
): Promise<Record<string, unknown>> {
  let conversationQuery = admin
    .from('ai_conversation')
    .select('id,title,context,create_time,update_time')
    .eq('auth_user_id', userId)
    .eq('tenant_id', tenantId)
    .eq('context->>assistantMode', 'project')
    .order('update_time', { ascending: false })
    .limit(limit)
  if (query) conversationQuery = conversationQuery.ilike('title', `%${query}%`)

  const { data: conversations, error } = await conversationQuery
  if (error) throw error
  const conversationIds = (conversations ?? []).map((item) => item.id)
  if (!conversationIds.length) return { conversations: [], total: 0 }

  const [{ data: messages, error: messageError }, { data: runs, error: runError }] = await Promise.all([
    admin
      .from('ai_message')
      .select('conversation_id,role,content,create_time')
      .in('conversation_id', conversationIds)
      .order('create_time', { ascending: false })
      .limit(limit * 12),
    admin
      .from('ai_run')
      .select('id,conversation_id,status,model,input_tokens,output_tokens,latency_ms,started_at')
      .in('conversation_id', conversationIds)
      .eq('feature', FEATURE)
      .order('started_at', { ascending: false })
      .limit(limit * 4)
  ])
  if (messageError) throw messageError
  if (runError) throw runError

  const lastMessageByConversation = new Map<string, Record<string, unknown>>()
  for (const message of messages ?? []) {
    if (!lastMessageByConversation.has(message.conversation_id)) {
      lastMessageByConversation.set(message.conversation_id, message)
    }
  }
  const lastRunByConversation = new Map<string, Record<string, unknown>>()
  for (const run of runs ?? []) {
    if (run.conversation_id && !lastRunByConversation.has(run.conversation_id)) {
      lastRunByConversation.set(run.conversation_id, run)
    }
  }

  return {
    conversations: (conversations ?? []).map((conversation) => ({
      ...conversation,
      last_message: lastMessageByConversation.get(conversation.id) ?? null,
      last_run: lastRunByConversation.get(conversation.id) ?? null
    })),
    total: conversations?.length ?? 0
  }
}

async function getConversationHistory(
  admin: SupabaseClient,
  userId: string,
  tenantId: string,
  conversationId: string
): Promise<Record<string, unknown> | null> {
  const { data: conversation, error } = await admin
    .from('ai_conversation')
    .select('id,title,context,create_time,update_time')
    .eq('id', conversationId)
    .eq('auth_user_id', userId)
    .eq('tenant_id', tenantId)
    .eq('context->>assistantMode', 'project')
    .maybeSingle()
  if (error) throw error
  if (!conversation) return null

  const [{ data: messages, error: messageError }, { data: runs, error: runError }] = await Promise.all([
    admin
      .from('ai_message')
      .select('id,role,content,usage,create_time')
      .eq('conversation_id', conversationId)
      .order('create_time', { ascending: true })
      .limit(100),
    admin
      .from('ai_run')
      .select('id,status,model,prompt_version,input_tokens,output_tokens,latency_ms,tool_calls,error_code,error_message,started_at,finished_at')
      .eq('conversation_id', conversationId)
      .eq('feature', FEATURE)
      .order('started_at', { ascending: true })
      .limit(50)
  ])
  if (messageError) throw messageError
  if (runError) throw runError
  return { conversation, messages: messages ?? [], runs: runs ?? [] }
}

async function writeToolAudit(
  admin: SupabaseClient,
  payload: {
    runId: string
    userId: string
    tenantId: string
    email: string
    name: ToolName
    args: Record<string, unknown>
    status: 'succeeded' | 'failed'
    latencyMs: number
    error?: string
  }
): Promise<void> {
  const { error } = await admin.from('ai_tool_call').insert({
    run_id: payload.runId,
    auth_user_id: payload.userId,
    tenant_id: payload.tenantId,
    tool_name: payload.name,
    arguments: payload.args,
    status: payload.status,
    result_summary: { safetyMode: 'read_only' },
    latency_ms: payload.latencyMs,
    error_message: payload.error ?? null,
    create_by: payload.email,
    update_by: payload.email
  })
  if (error) console.error('ai-project-assistant tool audit failed', error.message)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ code: 'method_not_allowed', message: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authHeader) {
    return json({ code: 'unauthorized', message: 'Authentication required' }, 401)
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
  const token = authHeader.replace(/^Bearer\s+/i, '')
  const { data: { user }, error: authError } = await authClient.auth.getUser(token)
  if (authError || !user) return json({ code: 'unauthorized', message: 'Invalid or expired session' }, 401)

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false }
  })
  const { data: appUserData, error: appUserError } = await admin
    .from('sys_user')
    .select('tenant_id,user_email,status')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const appUser = appUserData as AppUser | null
  if (appUserError || !appUser?.tenant_id || appUser.status === '0') {
    return json({ code: 'forbidden', message: '仅已启用的系统用户可使用 Supabase AI 助手' }, 403)
  }
  const { data: platformSuperData, error: platformSuperError } = await userClient.rpc('current_is_super')
  const isPlatformSuper = !platformSuperError && platformSuperData === true

  let runId = ''
  const startedAt = Date.now()
  try {
    const body = await req.json() as AssistantRequest
    if (body.action === 'capabilities') {
      return json({
        version: CONTRACT_VERSION,
        safetyMode: 'read_only',
        allowedSafetyModes: isPlatformSuper ? ['read_only', 'controlled_write'] : ['read_only'],
        access: {
          isPlatformSuper,
          controlledWrite: isPlatformSuper
        },
        features: {
          conversationHistory: true,
          conversationRename: true,
          feedback: true,
          export: true,
          multiRoundTools: true,
          objectContextLock: true,
          objectDescriptions: true,
          objectDescriptionWrite: isPlatformSuper,
          platformCapabilitySnapshot: true,
          securityPosture: true,
          performancePosture: true,
          authOverview: true,
          storageOverview: true,
          realtimeOverview: true,
          asyncCapabilities: true
        },
        domains: [
          'database',
          'rls',
          'auth',
          'storage',
          'realtime',
          'edge_functions',
          'cron',
          'queues',
          'vectors',
          'extensions',
          'performance'
        ],
        limits: {
          historyMessages: MAX_HISTORY_MESSAGES,
          messageLength: MAX_MESSAGE_LENGTH,
          toolCalls: MAX_TOOL_CALLS,
          toolRounds: MAX_TOOL_ROUNDS
        },
        tools: [...toolNames]
      })
    }

    if (body.action === 'catalog_update_description') {
      if (platformSuperError) {
        return json({ code: 'permission_check_failed', message: '无法确认平台超级管理员权限' }, 500)
      }
      if (!isPlatformSuper) {
        return json({ code: 'forbidden', message: '仅平台超级管理员可修改数据库对象说明' }, 403)
      }
      if (body.safetyMode !== 'controlled_write' || body.confirmed !== true) {
        return json({ code: 'confirmation_required', message: '请先进入受控变更模式并确认本次操作' }, 409)
      }

      const schema = textValue(body.schema)
      const name = textValue(body.name)
      const objectType = textValue(body.objectType)
      const description = typeof body.description === 'string'
        ? body.description.trim().slice(0, 500)
        : ''
      const objectKeyword = {
        table: 'TABLE',
        view: 'VIEW',
        materialized_view: 'MATERIALIZED VIEW'
      }[objectType]
      if (!schema || !name || !objectKeyword) {
        return json({ code: 'invalid_input', message: '当前仅支持修改表、视图和物化视图的对象说明' }, 400)
      }
      if (schema !== 'public') {
        return json({ code: 'protected_schema', message: '受控变更模式当前仅允许修改 public schema' }, 403)
      }

      const objectDetail = await executeCatalog('object_detail', {
        objectType,
        schema,
        name
      }, userClient) as { notFound?: boolean }
      if (objectDetail?.notFound) {
        return json({ code: 'not_found', message: '数据库对象不存在或已被删除' }, 404)
      }

      const statement = `COMMENT ON ${objectKeyword} ${quoteIdentifier(schema)}.${quoteIdentifier(name)} IS ${description ? quoteLiteral(description) : 'NULL'}`
      const startedWriteAt = Date.now()
      const { data: executionData, error: executionError } = await admin.rpc('execute_sql_query', {
        sql_query: statement
      })
      const executionResult = executionData as {
        error?: boolean
        error_message?: string
        command_tag?: string
        row_count?: number
        duration_ms?: number
      } | null
      const errorMessage = executionError?.message || executionResult?.error_message || null
      const succeeded = !executionError && !executionResult?.error
      await admin.from('sys_audit_log').insert({
        auth_user_id: user.id,
        auth_email: user.email ?? appUser.user_email,
        query_text: statement,
        is_write: true,
        status: succeeded ? 'ok' : 'error',
        error_message: errorMessage,
        command_tag: executionResult?.command_tag ?? 'COMMENT',
        row_count: executionResult?.row_count ?? 0,
        duration_ms: executionResult?.duration_ms ?? Date.now() - startedWriteAt,
        tenant_id: appUser.tenant_id,
        create_by: appUser.user_email,
        update_by: appUser.user_email
      })
      if (!succeeded) {
        return json({ code: 'write_failed', message: errorMessage || '对象说明更新失败' }, 500)
      }
      return json({
        ok: true,
        object: { schemaName: schema, objectName: name, objectType, description: description || null },
        audit: { commandTag: executionResult?.command_tag ?? 'COMMENT' }
      })
    }
    if (body.action === 'catalog') {
      const action = body.catalogAction
      if (!action || !catalogActions.has(action)) {
        return json({ code: 'invalid_action', message: '不支持的目录操作' }, 400)
      }
      const data = await executeCatalog(action, body.args ?? {}, userClient)
      return json({ data })
    }

    if (body.action === 'feedback') {
      if (!body.runId || (body.rating !== -1 && body.rating !== 1)) {
        return json({ code: 'invalid_feedback', message: 'Run ID and rating are required' }, 400)
      }
      const { data: ownedRun } = await admin.from('ai_run').select('id')
        .eq('id', body.runId).eq('auth_user_id', user.id).eq('feature', FEATURE).maybeSingle()
      if (!ownedRun) return json({ code: 'not_found', message: 'AI run was not found' }, 404)
      const { error } = await admin.from('ai_feedback').upsert({
        run_id: body.runId,
        auth_user_id: user.id,
        tenant_id: appUser.tenant_id,
        rating: body.rating,
        comment: textValue(body.comment).slice(0, 1000) || null,
        create_by: appUser.user_email,
        update_by: appUser.user_email
      }, { onConflict: 'run_id,auth_user_id' })
      if (error) throw error
      return json({ ok: true })
    }

    if (body.action === 'history_list') {
      const data = await listConversationHistory(
        admin,
        user.id,
        appUser.tenant_id,
        textValue(body.query).slice(0, 80),
        integerValue(body.limit, 30, 1, 50)
      )
      return json(data)
    }

    if (body.action === 'history_detail') {
      const conversationId = textValue(body.conversationId)
      if (!conversationId) {
        return json({ code: 'invalid_input', message: 'Conversation ID is required' }, 400)
      }
      const data = await getConversationHistory(admin, user.id, appUser.tenant_id, conversationId)
      if (!data) return json({ code: 'not_found', message: 'Conversation was not found' }, 404)
      return json(data)
    }

    if (body.action === 'history_rename') {
      const conversationId = textValue(body.conversationId)
      const title = textValue(body.title).replace(/\s+/g, ' ').slice(0, 80)
      if (!conversationId || !title) {
        return json({ code: 'invalid_input', message: 'Conversation ID and title are required' }, 400)
      }
      const { data, error } = await admin
        .from('ai_conversation')
        .update({ title, update_time: new Date().toISOString(), update_by: appUser.user_email })
        .eq('id', conversationId)
        .eq('auth_user_id', user.id)
        .eq('tenant_id', appUser.tenant_id)
        .eq('context->>assistantMode', 'project')
        .select('id,title')
        .maybeSingle()
      if (error) throw error
      if (!data) return json({ code: 'not_found', message: 'Conversation was not found' }, 404)
      return json({ conversation: data })
    }

    if (body.action && body.action !== 'chat') {
      return json({
        code: 'unsupported_action',
        message: `当前助手不支持操作：${body.action}`,
        version: CONTRACT_VERSION
      }, 400)
    }

    const messages = (body.messages ?? [])
      .filter((item): item is AssistantMessage => Boolean(item)
        && (item.role === 'user' || item.role === 'assistant')
        && Boolean(textValue(item.content)))
      .slice(-MAX_HISTORY_MESSAGES)
      .map((item) => ({ role: item.role, content: textValue(item.content).slice(0, MAX_MESSAGE_LENGTH) }))
    const latestUserMessage = [...messages].reverse().find((item) => item.role === 'user')
    if (!latestUserMessage) return json({ code: 'invalid_input', message: '请输入问题' }, 400)

    const sharedModel = Deno.env.get('AI_MODEL') || Deno.env.get('OPENAI_MODEL') || 'gpt-4.1-mini'
    const runtimeConfig = await loadAiRuntimeConfig(admin, appUser.tenant_id, FEATURE, {
      enabled: true,
      provider: 'openai_compatible',
      model: Deno.env.get('AI_PROJECT_ASSISTANT_MODEL') || sharedModel,
      visionModel: null,
      fallbackModel: Deno.env.get('AI_PROJECT_ASSISTANT_FALLBACK_MODEL') || null,
      timeoutMs: integerValue(Deno.env.get('AI_PROJECT_ASSISTANT_TIMEOUT_MS'), 30_000, 5_000, 120_000),
      maxRetries: integerValue(Deno.env.get('AI_PROJECT_ASSISTANT_MAX_RETRIES'), 0, 0, 2),
      temperature: 0.1,
      maxTokens: 1200,
      rateLimitPerMinute: 8,
      rateLimitPerDay: 100,
      promptVersion: 'v1'
    })
    if (!runtimeConfig.enabled) return json({ code: 'feature_disabled', message: 'Supabase 管理助手当前已停用' }, 503)
    const providerEndpoints = resolveAiProviderEndpoints(runtimeConfig, {
      openAiModel: Deno.env.get('AI_PROJECT_ASSISTANT_OPENAI_MODEL')
    })
    if (!providerEndpoints.length) {
      return json({ code: 'missing_secret', message: 'AI provider is not configured' }, 500)
    }
    const publishedPrompt = await loadPublishedAiPrompt(admin, appUser.tenant_id, FEATURE, {
      content: DEFAULT_PROMPT,
      version: runtimeConfig.promptVersion
    })

    const minuteAgo = new Date(Date.now() - 60_000).toISOString()
    const dayAgo = new Date(Date.now() - 86_400_000).toISOString()
    const [minuteResult, dayResult] = await Promise.all([
      admin.from('ai_run').select('id', { count: 'exact', head: true }).eq('auth_user_id', user.id).gte('started_at', minuteAgo),
      admin.from('ai_run').select('id', { count: 'exact', head: true }).eq('auth_user_id', user.id).gte('started_at', dayAgo)
    ])
    if ((minuteResult.count ?? 0) >= runtimeConfig.rateLimitPerMinute
      || (dayResult.count ?? 0) >= runtimeConfig.rateLimitPerDay) {
      return json({ code: 'rate_limited', message: 'AI 调用次数已达到限额，请稍后再试' }, 429)
    }

    const context: AssistantContext = body.context && typeof body.context === 'object' ? body.context : {}
    const requestedSafetyMode = body.safetyMode === 'controlled_write' && isPlatformSuper
      ? 'controlled_write'
      : 'read_only'
    const conversationContext = { ...context, assistantMode: 'project', safetyMode: requestedSafetyMode }
    let conversationId = textValue(body.conversationId)
    if (conversationId) {
      const { data: ownedConversation } = await admin.from('ai_conversation').select('id')
        .eq('id', conversationId).eq('auth_user_id', user.id).eq('tenant_id', appUser.tenant_id).maybeSingle()
      if (!ownedConversation) return json({ code: 'not_found', message: 'Conversation was not found' }, 404)
      await admin.from('ai_conversation').update({ context: conversationContext, update_by: appUser.user_email }).eq('id', conversationId)
    } else {
      const { data, error } = await admin.from('ai_conversation').insert({
        auth_user_id: user.id,
        tenant_id: appUser.tenant_id,
        title: latestUserMessage.content.replace(/\s+/g, ' ').slice(0, 40),
        context: conversationContext,
        create_by: appUser.user_email,
        update_by: appUser.user_email
      }).select('id').single()
      if (error) throw error
      conversationId = data.id
    }

    let resolvedModel = runtimeConfig.model
    const { data: run, error: runError } = await admin.from('ai_run').insert({
      conversation_id: conversationId,
      auth_user_id: user.id,
      tenant_id: appUser.tenant_id,
      feature: FEATURE,
      model: resolvedModel,
      prompt_version: publishedPrompt.version,
      metadata: { context: conversationContext, safetyMode: 'read_only', promptSource: publishedPrompt.source },
      create_by: appUser.user_email,
      update_by: appUser.user_email
    }).select('id').single()
    if (runError) throw runError
    runId = run.id

    const { error: userMessageError } = await admin.from('ai_message').insert({
      conversation_id: conversationId,
      auth_user_id: user.id,
      tenant_id: appUser.tenant_id,
      role: 'user',
      content: latestUserMessage.content,
      create_by: appUser.user_email,
      update_by: appUser.user_email
    })
    if (userMessageError) throw userMessageError

    const providerMessages: ProviderMessage[] = [
      { role: 'system', content: `${publishedPrompt.content}\n当前页面上下文：${JSON.stringify(conversationContext)}` },
      ...messages.map((item) => ({ role: item.role, content: item.content }))
    ]
    let inputTokens = 0
    let outputTokens = 0
    const initialProviderResponse = await requestAiProviderWithFallback(providerEndpoints, (endpoint) => requestProvider(endpoint, providerMessages, true, runtimeConfig))
    const activeProvider = initialProviderResponse.endpoint
    let response = initialProviderResponse.result
    resolvedModel = response.model
    inputTokens += response.usage.prompt_tokens ?? 0
    outputTokens += response.usage.completion_tokens ?? 0
    const executedTools: Array<{ name: string; status: string; latencyMs: number }> = []
    const toolExecutionContext: ToolExecutionContext = {}
    let toolRound = 0
    let totalToolCalls = 0
    while ((response.message.tool_calls?.length ?? 0) > 0
      && toolRound < MAX_TOOL_ROUNDS
      && totalToolCalls < MAX_TOOL_CALLS) {
      providerMessages.push(response.message)
      const requestedCalls = (response.message.tool_calls ?? [])
        .slice(0, MAX_TOOL_CALLS - totalToolCalls)
      for (const call of requestedCalls) {
        totalToolCalls += 1
        const started = Date.now()
        const args = safeJsonParse(call.function.arguments)
        if (!isToolName(call.function.name)) {
          providerMessages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: 'Unsupported tool' }) })
          continue
        }
        try {
          const result = await executeTool(
            call.function.name,
            args,
            userClient,
            toolExecutionContext
          )
          const latencyMs = Date.now() - started
          executedTools.push({ name: call.function.name, status: 'succeeded', latencyMs })
          await writeToolAudit(admin, {
            runId, userId: user.id, tenantId: appUser.tenant_id, email: appUser.user_email,
            name: call.function.name, args, status: 'succeeded', latencyMs
          })
          providerMessages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result).slice(0, 24_000) })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Tool execution failed'
          const latencyMs = Date.now() - started
          executedTools.push({ name: call.function.name, status: 'failed', latencyMs })
          await writeToolAudit(admin, {
            runId, userId: user.id, tenantId: appUser.tenant_id, email: appUser.user_email,
            name: call.function.name, args, status: 'failed', error: message, latencyMs
          })
          providerMessages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: message }) })
        }
      }
      toolRound += 1
      const allowMoreTools = toolRound < MAX_TOOL_ROUNDS && totalToolCalls < MAX_TOOL_CALLS
      response = await requestProvider(
        activeProvider,
        providerMessages,
        allowMoreTools,
        runtimeConfig
      )
      resolvedModel = response.model
      inputTokens += response.usage.prompt_tokens ?? 0
      outputTokens += response.usage.completion_tokens ?? 0
    }
    const content = textValue(response.message.content)
    if (!content) throw new Error('AI provider returned an empty message')
    const latencyMs = Date.now() - startedAt
    const { error: assistantMessageError } = await admin.from('ai_message').insert({
      conversation_id: conversationId,
      auth_user_id: user.id,
      tenant_id: appUser.tenant_id,
      role: 'assistant',
      content,
      usage: { inputTokens, outputTokens },
      create_by: appUser.user_email,
      update_by: appUser.user_email
    })
    if (assistantMessageError) throw assistantMessageError
    await admin.from('ai_run').update({
      status: 'succeeded',
      model: resolvedModel,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      latency_ms: latencyMs,
      tool_calls: executedTools,
      finished_at: new Date().toISOString(),
      update_by: appUser.user_email
    }).eq('id', runId)
    return json({
      conversationId,
      runId,
      message: content,
      tools: executedTools,
      usage: { inputTokens, outputTokens },
      model: resolvedModel,
      promptVersion: publishedPrompt.version,
      latencyMs,
      safetyMode: 'read_only'
    })
  } catch (error) {
    const providerFailure = getAiProviderFailure(error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    const providerTimedOut = isAbortLikeError(error)
    console.error('ai-project-assistant error', message)
    if (runId) {
      await admin.from('ai_run').update({
        status: 'failed',
        latency_ms: Date.now() - startedAt,
        error_code: providerTimedOut ? 'provider_timeout' : providerFailure?.code ?? 'server_error',
        error_message: message.slice(0, 2000),
        finished_at: new Date().toISOString(),
        update_by: appUser.user_email
      }).eq('id', runId)
    }
    return json(
      {
        code: providerTimedOut ? 'provider_timeout' : providerFailure?.code ?? 'server_error',
        message: providerTimedOut ? '模型响应超时，请稍后重试' : providerFailure?.message ?? '助手服务暂时不可用，请稍后重试'
      },
      providerTimedOut ? 504 : 500
    )
  }
})
