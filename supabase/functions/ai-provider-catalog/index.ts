import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { getAiConfigTenantScope } from '../_shared/ai-config-tenancy.ts'
import { resolveAiProviderEndpoints } from '../_shared/ai-provider-endpoints.ts'

interface CatalogRequest {
  action?: 'catalog' | 'benchmark'
  forceRefresh?: boolean
  model?: string
}

interface AppUser {
  tenant_id: string
  status: string | null
}

interface ConfiguredModelRow {
  model: string | null
  vision_model: string | null
  fallback_model: string | null
}

interface ProviderModel {
  id: string
  label: string
  ownedBy: string | null
  kind: 'text' | 'vision' | 'unknown'
  capability: string
  strengths: string[]
  recommendedFor: string[]
  performanceProfile: 'speed' | 'balanced' | 'quality' | 'specialized' | 'unknown'
  performanceHint: string
  parameterScale: string | null
  benchmarkable: boolean
  description: string
}

interface ModelProfile {
  kind: ProviderModel['kind']
  capability: string
  strengths: string[]
  recommendedFor: string[]
  benchmarkable: boolean
}

interface ModelBenchmark {
  model: string
  connectionMs: number
  firstResponseMs: number
  totalMs: number
  responseBytes: number
  streaming: boolean
  measuredAt: string
}

interface RemoteCatalogCache {
  expiresAt: number
  fetchedAt: string
  models: ProviderModel[]
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

const CATALOG_CACHE_TTL_MS = 5 * 60_000
const CATALOG_TIMEOUT_MS = 10_000
const BENCHMARK_TIMEOUT_MS = 30_000
let remoteCatalogCache: RemoteCatalogCache | null = null

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

function stringValue(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized || null
}

const ownerLabels: Record<string, string> = {
  '01-ai': '零一万物',
  adept: 'Adept',
  ai21labs: 'AI21 Labs',
  aisingapore: 'AI Singapore',
  baai: '智源研究院',
  bigcode: 'BigCode',
  databricks: 'Databricks',
  'deepseek-ai': 'DeepSeek',
  google: 'Google',
  ibm: 'IBM',
  meta: 'Meta',
  microsoft: 'Microsoft',
  minimaxai: 'MiniMax',
  mistralai: 'Mistral AI',
  moonshotai: '月之暗面',
  nvidia: 'NVIDIA',
  'nv-mistralai': 'NVIDIA / Mistral AI',
  openai: 'OpenAI',
  poolside: 'Poolside',
  snowflake: 'Snowflake',
  'stepfun-ai': '阶跃星辰',
  thinkingmachines: 'Thinking Machines',
  writer: 'Writer',
  'z-ai': '智谱 AI',
  zyphra: 'Zyphra'
}

function resolveOwnerLabel(id: string, ownedBy: string | null): string {
  const prefix = id.split('/')[0]?.toLowerCase() ?? ''
  if (ownerLabels[prefix]) return ownerLabels[prefix]
  const normalizedOwner = ownedBy?.trim()
  if (normalizedOwner && !/^(system|unknown)$/i.test(normalizedOwner)) return normalizedOwner
  return prefix || '远端服务'
}

function resolveModelProfile(id: string): ModelProfile {
  if (/(parse|deplot)/i.test(id)) {
    return {
      kind: 'vision',
      capability: '文档解析',
      strengths: ['表格图表理解', '文档结构提取'],
      recommendedFor: ['票据识别', '文档抽取'],
      benchmarkable: true
    }
  }
  if (/(embed|embedding|bge|retriever|e5)/i.test(id)) {
    return {
      kind: 'unknown',
      capability: '向量嵌入',
      strengths: ['语义检索', '知识库向量化'],
      recommendedFor: ['检索增强', '相似度搜索'],
      benchmarkable: false
    }
  }
  if (/rerank/i.test(id)) {
    return {
      kind: 'unknown',
      capability: '文本重排',
      strengths: ['搜索结果重排', '相关性评分'],
      recommendedFor: ['知识库检索', '搜索优化'],
      benchmarkable: false
    }
  }
  if (/(guard|safety|moderation)/i.test(id)) {
    return {
      kind: 'unknown',
      capability: '内容安全',
      strengths: ['内容审核', '风险识别'],
      recommendedFor: ['输入输出安全检查'],
      benchmarkable: false
    }
  }
  if (/(speech|audio|whisper|tts)/i.test(id)) {
    return {
      kind: 'unknown',
      capability: '语音音频',
      strengths: ['语音识别', '语音生成'],
      recommendedFor: ['音频处理'],
      benchmarkable: false
    }
  }
  if (/(^|[-_.\/])(vision|vl|vlm|image|omni)([-_.\/]|$)|fuyu|kosmos|neva|vila/i.test(id)) {
    return {
      kind: 'vision',
      capability: '视觉理解',
      strengths: ['图片理解', 'OCR 与文档识别'],
      recommendedFor: ['智能填单', '图片问答'],
      benchmarkable: true
    }
  }
  if (/(code|coder|starcoder|codestral|codellama|gemma-4)/i.test(id)) {
    return {
      kind: 'text',
      capability: '代码与 SQL',
      strengths: ['代码生成', 'SQL 编写', '调试重构'],
      recommendedFor: ['SQL 助手', '代码审查', '研发问答'],
      benchmarkable: true
    }
  }
  if (/(reason|thinking|deepseek-r1|qwq|(^|[-_/])o[134]([-_/]|$))/i.test(id)) {
    return {
      kind: 'text',
      capability: '深度推理',
      strengths: ['复杂分析', '多步推理', '方案规划'],
      recommendedFor: ['运行诊断', '项目规划', '复杂决策'],
      benchmarkable: true
    }
  }
  if (/(translate)/i.test(id)) {
    return {
      kind: 'text',
      capability: '机器翻译',
      strengths: ['多语言翻译', '术语转换'],
      recommendedFor: ['跨语言文本处理'],
      benchmarkable: true
    }
  }
  if (/(reward)/i.test(id)) {
    return {
      kind: 'unknown',
      capability: '奖励模型',
      strengths: ['回答质量评分'],
      recommendedFor: ['模型评测'],
      benchmarkable: false
    }
  }
  if (/(detector|detect)/i.test(id)) {
    return {
      kind: 'unknown',
      capability: '内容检测',
      strengths: ['内容分类', '异常检测'],
      recommendedFor: ['安全检测'],
      benchmarkable: false
    }
  }
  return {
    kind: 'text',
    capability: '通用文本',
    strengths: ['文本生成', '摘要改写', '通用问答'],
    recommendedFor: ['业务问答', '内容生成'],
    benchmarkable: true
  }
}

class ProviderBenchmarkError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 502
  ) {
    super(message)
    this.name = 'ProviderBenchmarkError'
  }
}

function resolveParameterScale(id: string): { label: string | null; billions: number | null } {
  const match = id.match(/(?:^|[-_.\/])(\d+(?:\.\d+)?)([bm])(?=[-_.\/]|$)/i)
  if (!match) return { label: null, billions: null }
  const value = Number(match[1])
  if (!Number.isFinite(value)) return { label: null, billions: null }
  const unit = match[2].toUpperCase()
  return {
    label: `${match[1]}${unit}`,
    billions: unit === 'B' ? value : value / 1000
  }
}

function resolvePerformanceProfile(
  id: string,
  parameterBillions: number | null,
  benchmarkable: boolean
): Pick<ProviderModel, 'performanceProfile' | 'performanceHint'> {
  if (!benchmarkable) {
    return {
      performanceProfile: 'specialized',
      performanceHint: '专用模型，不能通过对话生成接口比较响应速度'
    }
  }
  if (/(flash|turbo|mini|nano|lite|small|fast)/i.test(id) || (parameterBillions ?? 99) <= 4) {
    return {
      performanceProfile: 'speed',
      performanceHint: '偏轻量，通常更容易获得低延迟；实际速度取决于部署硬件与负载'
    }
  }
  if (/(large|xl|xxl|max)/i.test(id) || (parameterBillions ?? 0) >= 30) {
    return {
      performanceProfile: 'quality',
      performanceHint: '偏质量与复杂任务，延迟通常高于轻量模型；请以当前线路实测为准'
    }
  }
  return {
    performanceProfile: 'balanced',
    performanceHint: '质量与速度相对均衡；请使用测速结果确认当前线路表现'
  }
}

function createProviderModel(id: string, ownedBy: string | null): ProviderModel {
  const owner = resolveOwnerLabel(id, ownedBy)
  const profile = resolveModelProfile(id)
  const parameterScale = resolveParameterScale(id)
  const performance = resolvePerformanceProfile(id, parameterScale.billions, profile.benchmarkable)
  const description = `${owner} · ${profile.capability}；${performance.performanceHint}`
  return {
    id,
    label: `${id} · ${owner} · ${profile.capability}`,
    ownedBy,
    kind: profile.kind,
    capability: profile.capability,
    strengths: profile.strengths,
    recommendedFor: profile.recommendedFor,
    performanceProfile: performance.performanceProfile,
    performanceHint: performance.performanceHint,
    parameterScale: parameterScale.label,
    benchmarkable: profile.benchmarkable,
    description
  }
}

function normalizeRemoteModels(payload: unknown): ProviderModel[] {
  if (!payload || typeof payload !== 'object') return []
  const record = payload as Record<string, unknown>
  const source = Array.isArray(record.data)
    ? record.data
    : Array.isArray(record.models)
      ? record.models
      : []
  const modelMap = new Map<string, ProviderModel>()

  for (const item of source) {
    const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
    const id = stringValue(row.id) ?? stringValue(row.name) ?? stringValue(row.model)
    if (!id) continue
    const ownedBy =
      stringValue(row.owned_by) ?? stringValue(row.ownedBy) ?? stringValue(row.provider)
    modelMap.set(id, createProviderModel(id, ownedBy))
  }

  return [...modelMap.values()].sort((left, right) => left.id.localeCompare(right.id, 'en'))
}

function mergeConfiguredModels(
  remoteModels: ProviderModel[],
  configuredRows: ConfiguredModelRow[],
  environmentModels: Array<string | null>
): ProviderModel[] {
  const modelMap = new Map(remoteModels.map((item) => [item.id, item]))
  const configuredModels = [
    ...environmentModels,
    ...configuredRows.flatMap((row) => [row.model, row.vision_model, row.fallback_model])
  ]

  for (const value of configuredModels) {
    const id = stringValue(value)
    if (!id || modelMap.has(id)) continue
    modelMap.set(id, createProviderModel(id, null))
  }

  return [...modelMap.values()].sort((left, right) => left.id.localeCompare(right.id, 'en'))
}

async function fetchRemoteCatalog(
  baseUrl: string,
  apiKey: string,
  forceRefresh: boolean
): Promise<{ fetchedAt: string; models: ProviderModel[]; cached: boolean }> {
  if (!forceRefresh && remoteCatalogCache && remoteCatalogCache.expiresAt > Date.now()) {
    return {
      fetchedAt: remoteCatalogCache.fetchedAt,
      models: remoteCatalogCache.models,
      cached: true
    }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), CATALOG_TIMEOUT_MS)
  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      signal: controller.signal
    })
    if (!response.ok) throw new Error(`Model catalog request failed with HTTP ${response.status}`)

    const models = normalizeRemoteModels(await response.json())
    if (!models.length) throw new Error('Model catalog returned no models')
    const fetchedAt = new Date().toISOString()
    remoteCatalogCache = {
      models,
      fetchedAt,
      expiresAt: Date.now() + CATALOG_CACHE_TTL_MS
    }
    return { fetchedAt, models, cached: false }
  } finally {
    clearTimeout(timeoutId)
  }
}

async function readProviderError(response: Response): Promise<string> {
  const raw = (await response.text().catch(() => '')).slice(0, 1200)
  if (!raw) return `上游服务返回 HTTP ${response.status}`
  try {
    const payload = JSON.parse(raw) as {
      message?: unknown
      error?: { message?: unknown } | string
    }
    if (typeof payload.message === 'string') return payload.message
    if (typeof payload.error === 'string') return payload.error
    if (payload.error && typeof payload.error.message === 'string') return payload.error.message
  } catch {
    // Non-JSON provider errors fall back to the bounded response text.
  }
  return raw
}

function createProviderBenchmarkError(status: number, providerMessage: string): ProviderBenchmarkError {
  if (status === 410) {
    return new ProviderBenchmarkError(
      'model_retired',
      '当前模型的在线端点已下线，请选择其他模型并测速'
    )
  }
  if (status === 401 || status === 403) {
    return new ProviderBenchmarkError(
      'provider_auth_failed',
      '当前 AI 兼容服务鉴权失败，请检查 AI_API_KEY 与 AI_BASE_URL 是否属于同一服务商'
    )
  }
  if (status === 404 || /model.*(not found|unknown)|unknown model/i.test(providerMessage)) {
    return new ProviderBenchmarkError(
      'model_not_found',
      '当前模型在服务商侧不可用，请选择其他模型后重试'
    )
  }
  if (status === 429) {
    return new ProviderBenchmarkError('provider_rate_limited', '服务商请求过于频繁，请稍后再测速')
  }
  if (status === 400 || status === 422) {
    return new ProviderBenchmarkError(
      'provider_rejected_request',
      `服务商拒绝了测速请求（HTTP ${status}）：${providerMessage}`
    )
  }
  return new ProviderBenchmarkError(
    'provider_request_failed',
    `模型测速请求失败（HTTP ${status}）：${providerMessage}`
  )
}

async function benchmarkModel(
  baseUrl: string,
  apiKey: string,
  model: string
): Promise<ModelBenchmark> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), BENCHMARK_TIMEOUT_MS)
  const startedAt = performance.now()

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream, application/json'
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Reply with only OK.' }],
        max_tokens: 8,
        stream: true
      }),
      signal: controller.signal
    })

    const connectionMs = Math.max(0, Math.round(performance.now() - startedAt))
    if (!response.ok) {
      const providerMessage = await readProviderError(response)
      throw createProviderBenchmarkError(response.status, providerMessage)
    }

    const streaming = response.headers.get('content-type')?.includes('text/event-stream') ?? false
    let firstResponseMs: number | null = null
    let responseBytes = 0

    if (response.body) {
      const reader = response.body.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (!value?.byteLength) continue
        responseBytes += value.byteLength
        if (firstResponseMs === null) {
          firstResponseMs = Math.max(0, Math.round(performance.now() - startedAt))
        }
      }
    }

    const totalMs = Math.max(connectionMs, Math.round(performance.now() - startedAt))
    return {
      model,
      connectionMs,
      firstResponseMs: firstResponseMs ?? connectionMs,
      totalMs,
      responseBytes,
      streaming,
      measuredAt: new Date().toISOString()
    }
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ProviderBenchmarkError('provider_timeout', '模型测速超过 30 秒，请稍后重试', 504)
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ code: 'method_not_allowed', message: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey || !authHeader) {
    return json({ code: 'unauthorized', message: 'Authentication required' }, 401)
  }

  const token = authHeader.replace(/^Bearer\s+/i, '')
  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
  const {
    data: { user },
    error: authError
  } = await authClient.auth.getUser(token)
  if (authError || !user) {
    return json({ code: 'unauthorized', message: 'Invalid or expired session' }, 401)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
  const { data: appUserData, error: appUserError } = await admin
    .from('sys_user')
    .select('tenant_id,status')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const appUser = appUserData as AppUser | null
  if (appUserError || !appUser?.tenant_id || appUser.status === '0') {
    return json({ code: 'forbidden', message: 'Active application user is required' }, 403)
  }

  const sharedModel = Deno.env.get('AI_MODEL') || Deno.env.get('OPENAI_MODEL') || ''
  const [providerEndpoint] = resolveAiProviderEndpoints({
    provider: 'openai_compatible',
    model: sharedModel,
    fallbackModel: null
  })
  const apiKey = providerEndpoint?.apiKey ?? null
  const baseUrl = providerEndpoint?.baseUrl ?? 'https://api.openai.com/v1'
  const body = (await req.json().catch(() => ({}))) as CatalogRequest

  if (body.action === 'benchmark') {
    const model = stringValue(body.model)
    if (!model || model.length > 256 || /[\u0000-\u001f\u007f]/.test(model)) {
      return json({ code: 'invalid_model', message: '请选择有效的模型 ID' }, 400)
    }
    if (!apiKey) {
      return json({ code: 'provider_not_configured', message: 'AI 服务密钥尚未配置，无法测速' }, 503)
    }
    try {
      return json(await benchmarkModel(baseUrl, apiKey, model))
    } catch (error) {
      const normalized =
        error instanceof ProviderBenchmarkError
          ? error
          : new ProviderBenchmarkError('benchmark_failed', '模型测速暂时不可用')
      console.error('ai-provider-catalog benchmark failed', {
        code: normalized.code,
        model,
        provider: providerEndpoint?.label ?? 'unconfigured'
      })
      return json({ code: normalized.code, message: normalized.message }, normalized.status)
    }
  }

  const configTenantScope = await getAiConfigTenantScope(admin, appUser.tenant_id)
  const { data: configuredData } = await admin
    .from('ai_feature_config')
    .select('model,vision_model,fallback_model')
    .in('tenant_id', configTenantScope)
  const configuredRows = (configuredData ?? []) as ConfiguredModelRow[]
  const environmentModels = [
    sharedModel,
    Deno.env.get('AI_ASSISTANT_MODEL'),
    Deno.env.get('AI_ASSISTANT_FAST_MODEL'),
    Deno.env.get('AI_ASSISTANT_FALLBACK_MODEL'),
    Deno.env.get('AI_ORDER_MODEL'),
    Deno.env.get('AI_ORDER_VISION_MODEL'),
    Deno.env.get('AI_ORDER_FALLBACK_MODEL')
  ]

  let remoteModels: ProviderModel[] = []
  let source: 'remote' | 'configured' = 'configured'
  let cached = false
  let fetchedAt = new Date().toISOString()
  let warning: string | null = null

  if (apiKey) {
    try {
      const remote = await fetchRemoteCatalog(baseUrl, apiKey, body.forceRefresh === true)
      remoteModels = remote.models
      fetchedAt = remote.fetchedAt
      cached = remote.cached
      source = 'remote'
    } catch (error) {
      console.error(
        'ai-provider-catalog remote fetch failed',
        error instanceof Error ? error.message : error
      )
      warning = '远端服务暂时无法返回模型目录，当前展示已配置模型，可手动输入其他模型 ID。'
    }
  } else {
    warning = 'AI 服务密钥尚未配置，当前展示已配置模型，可手动输入其他模型 ID。'
  }

  const models = mergeConfiguredModels(remoteModels, configuredRows, environmentModels)
  return json({
    protocols: [
      {
        value: 'openai_compatible',
        label: 'OpenAI 兼容协议',
        description: '兼容 /models 与 /chat/completions 接口的服务'
      }
    ],
    models,
    source,
    cached,
    fetchedAt,
    warning
  })
})

