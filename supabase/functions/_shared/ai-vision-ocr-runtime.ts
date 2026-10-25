import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { resolveAiProviderEndpoints, type AiProviderEndpoint } from './ai-provider-endpoints.ts'
import { extractAiProviderJson, extractAiProviderText } from './ai-provider-json.ts'
import { loadAiRuntimeConfig } from './ai-runtime-config.ts'
import { loadPublishedAiPrompt } from './ai-prompt-template.ts'
import { normalizeOcrRawText } from './ai-ocr-text.ts'

export interface VisionOcrReviewRequest {
  action?: 'analyze' | 'review'
  imageUrls?: string[]
  artifactId?: string
  entityId?: string
  outcome?: 'applied' | 'rejected'
  finalPayload?: Record<string, unknown>
  reviewNote?: string
}

export interface VisionOcrNormalizedResult {
  rawText: string
  confidence: number
  fieldConfidence: Record<string, number> | Partial<Record<string, number>>
  warnings: string[]
}

export interface VisionOcrRuntimeContext<TInput, TResult extends VisionOcrNormalizedResult> {
  admin: SupabaseClient
  appUser: { tenant_id: string; user_email: string }
  userId: string
  input: TInput
  result: TResult
}

export interface VisionOcrConfig<TInput, TResult extends VisionOcrNormalizedResult> {
  feature: string
  artifactType: string
  entityType: string
  entityTable: string
  envPrefix: string
  inlineImages?: boolean
  strictProvider?: boolean
  requiredPermission?: string | ((body: Record<string, unknown>) => string | null)
  allowReview?: boolean
  authorizeImageUrls?: (context: {
    admin: SupabaseClient
    userClient: SupabaseClient
    appUser: { tenant_id: string; user_email: string }
    userId: string
    imageUrls: string[]
    requestedTenantId: string | null
    supabaseUrl: string
  }) => Promise<boolean>
  defaultPrompt: string
  expectedShape: Record<string, unknown>
  defaultMaxTokens?: number
  modelRequestOptions?: (endpoint: AiProviderEndpoint, model: string) => {
    reasoning_effort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'max'
    chat_template_kwargs?: { enable_thinking?: boolean }
  }
  parseInput: (body: Record<string, unknown>) => TInput
  inputMetadata: (input: TInput) => Record<string, unknown>
  validate: (payload: unknown) => { valid: boolean; errors: string[] }
  classifyInvalidResponse?: (
    errors: string[]
  ) => { code: string; message: string; status: number } | null
  normalize: (payload: Record<string, unknown>) => TResult
  proposedPayload: (result: TResult) => Record<string, unknown>
  compare: (
    proposed: Record<string, unknown>,
    finalPayload: Record<string, unknown>
  ) => { acceptedFields: string[]; correctedFields: string[] }
  enrichResponse?: (
    context: VisionOcrRuntimeContext<TInput, TResult>
  ) => Promise<Record<string, unknown>>
  artifactMetadata?: (
    context: VisionOcrRuntimeContext<TInput, TResult>,
    extraResponse: Record<string, unknown>
  ) => Record<string, unknown>
  labels: {
    unauthorized: string
    forbidden: string
    invalidImages: string
    invalidImageContent?: string
    disabled: string
    rateLimited: string
    providerFailed: string
    invalidResponse: string
    timeout: string
    serverError: string
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-art-tenant-scope',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

class ProviderTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`AI provider timed out after ${timeoutMs} ms`)
    this.name = 'ProviderTimeoutError'
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stringValue(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized || null
}

function isUuid(value: string | null): value is string {
  return Boolean(
    value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  )
}

function integerValue(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.trunc(parsed))) : fallback
}

async function loadImageDataUrl(url: string): Promise<string | null> {
  const response = await fetchWithTimeout(url, { method: 'GET' }, 15_000)
  if (!response.ok || !response.body) return null
  const mime = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
  if (mime !== 'image/jpeg' && mime !== 'image/png' && mime !== 'image/webp') {
    await response.body.cancel()
    return null
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > 8 * 1024 * 1024) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  if (!size) return null
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }
  return `data:${mime};base64,${btoa(binary)}`
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (error) {
    if (controller.signal.aborted) throw new ProviderTimeoutError(timeoutMs)
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

export function createVisionOcrHandler<TInput, TResult extends VisionOcrNormalizedResult>(
  config: VisionOcrConfig<TInput, TResult>
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (req.method !== 'POST') {
      return json({ code: 'method_not_allowed', message: 'Method not allowed' }, 405)
    }

    let finishRun: (
      status: 'succeeded' | 'failed',
      usage?: { prompt_tokens?: number; completion_tokens?: number },
      errorCode?: string,
      errorMessage?: string
    ) => Promise<void> = async () => {}

    try {
      const authHeader = req.headers.get('Authorization')
      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
      const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      if (!authHeader || !supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
        return json({ code: 'unauthorized', message: config.labels.unauthorized }, 401)
      }

      const token = authHeader.replace(/^Bearer\s+/i, '')
      const authClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      })
      const { data: authData, error: authError } = await authClient.auth.getUser(token)
      if (authError || !authData.user) {
        return json({ code: 'unauthorized', message: '登录状态已失效' }, 401)
      }

      const user = authData.user
      const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      })
      const { data: appUser, error: appUserError } = await admin
        .from('sys_user')
        .select('tenant_id,user_email,status')
        .eq('auth_user_id', user.id)
        .maybeSingle()
      if (appUserError || !appUser?.tenant_id || appUser.status === '0') {
        return json({ code: 'forbidden', message: config.labels.forbidden }, 403)
      }
      const body = (await req.json()) as Record<string, unknown>
      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { autoRefreshToken: false, persistSession: false }
      })
      const requiredPermission =
        typeof config.requiredPermission === 'function'
          ? config.requiredPermission(body)
          : config.requiredPermission
      if (requiredPermission) {
        const { data: hasPermission, error: permissionError } = await userClient.rpc(
          'current_has_permission',
          { p_permission: requiredPermission }
        )
        if (permissionError || hasPermission !== true) {
          if (permissionError) {
            console.error('AI permission check failed', requiredPermission, permissionError.message)
          }
          return json({ code: 'forbidden', message: config.labels.forbidden }, 403)
        }
      }

      const action = body.action === 'review' ? 'review' : 'analyze'
      if (action === 'review') {
        if (config.allowReview === false) {
          return json({ code: 'forbidden', message: config.labels.forbidden }, 403)
        }
        const artifactId = stringValue(body.artifactId)
        const entityId = stringValue(body.entityId)
        if (
          !isUuid(artifactId) ||
          body.outcome !== 'applied' ||
          !isUuid(entityId) ||
          !isRecord(body.finalPayload)
        ) {
          return json({ code: 'invalid_input', message: 'AI 质量反馈参数无效' }, 400)
        }
        if (JSON.stringify(body.finalPayload).length > 30_000) {
          return json({ code: 'invalid_input', message: 'AI 质量反馈内容过大' }, 400)
        }

        const { data: artifact, error: artifactError } = await admin
          .from('ai_artifact_review')
          .select('id,proposed_payload')
          .eq('id', artifactId)
          .eq('tenant_id', appUser.tenant_id)
          .eq('auth_user_id', user.id)
          .eq('feature', config.feature)
          .eq('artifact_type', config.artifactType)
          .eq('status', 'pending')
          .maybeSingle()
        if (artifactError) throw artifactError
        if (!artifact) {
          return json({ code: 'artifact_not_found', message: '识别记录不存在或已反馈' }, 404)
        }

        const { data: entity, error: entityError } = await admin
          .from(config.entityTable)
          .select('id')
          .eq('id', entityId)
          .eq('tenant_id', appUser.tenant_id)
          .maybeSingle()
        if (entityError) throw entityError
        if (!entity) return json({ code: 'entity_not_found', message: '关联业务记录不存在' }, 404)

        const finalPayload = body.finalPayload
        const comparison = config.compare(
          isRecord(artifact.proposed_payload) ? artifact.proposed_payload : {},
          finalPayload
        )
        const { data: reviewed, error: reviewError } = await admin
          .from('ai_artifact_review')
          .update({
            status: 'applied',
            final_payload: finalPayload,
            accepted_fields: comparison.acceptedFields,
            corrected_fields: comparison.correctedFields,
            entity_type: config.entityType,
            entity_id: entityId,
            review_note: stringValue(body.reviewNote)?.slice(0, 1000) ?? null,
            reviewed_at: new Date().toISOString(),
            update_by: appUser.user_email
          })
          .eq('id', artifact.id)
          .eq('status', 'pending')
          .select('id,status,accepted_fields,corrected_fields')
          .maybeSingle()
        if (reviewError) throw reviewError
        if (!reviewed) {
          return json({ code: 'review_conflict', message: '识别记录已被处理' }, 409)
        }
        return json({
          artifactId: reviewed.id,
          status: reviewed.status,
          acceptedFields: reviewed.accepted_fields,
          correctedFields: reviewed.corrected_fields
        })
      }

      const imageUrls = (Array.isArray(body.imageUrls) ? body.imageUrls : [])
        .map(stringValue)
        .filter((item): item is string => Boolean(item && /^https?:\/\//i.test(item)))
        .slice(0, 3)
      if (!imageUrls.length) {
        return json({ code: 'invalid_input', message: config.labels.invalidImages }, 400)
      }
      if (
        config.authorizeImageUrls &&
        !(await config.authorizeImageUrls({
          admin,
          userClient,
          appUser,
          userId: user.id,
          imageUrls,
          requestedTenantId: req.headers.get('x-art-tenant-scope'),
          supabaseUrl
        }))
      ) {
        return json({ code: 'forbidden', message: config.labels.forbidden }, 403)
      }
      const input = config.parseInput(body)

      const sharedModel = Deno.env.get('OPENAI_MODEL') || Deno.env.get('AI_MODEL') || 'gpt-4.1-mini'
      const model = Deno.env.get(`AI_${config.envPrefix}_MODEL`) || sharedModel
      const runtimeConfig = await loadAiRuntimeConfig(admin, appUser.tenant_id, config.feature, {
        enabled: true,
        provider: 'openai_compatible',
        model,
        visionModel: model,
        fallbackModel: Deno.env.get(`AI_${config.envPrefix}_FALLBACK_MODEL`) || null,
        timeoutMs: integerValue(
          Deno.env.get(`AI_${config.envPrefix}_TIMEOUT_MS`),
          60_000,
          10_000,
          120_000
        ),
        maxRetries: integerValue(Deno.env.get(`AI_${config.envPrefix}_MAX_RETRIES`), 0, 0, 2),
        temperature: 0,
        maxTokens: config.defaultMaxTokens ?? 1400,
        rateLimitPerMinute: integerValue(
          Deno.env.get(`AI_${config.envPrefix}_PER_MINUTE`),
          6,
          1,
          60
        ),
        rateLimitPerDay: integerValue(Deno.env.get(`AI_${config.envPrefix}_PER_DAY`), 100, 1, 5000),
        promptVersion: 'v1'
      })
      if (!runtimeConfig.enabled) {
        return json({ code: 'feature_disabled', message: config.labels.disabled }, 503)
      }

      const resolvedEndpoints = resolveAiProviderEndpoints(
        {
          provider: runtimeConfig.provider,
          model: runtimeConfig.visionModel || runtimeConfig.model,
          fallbackModel: runtimeConfig.fallbackModel
        },
        { openAiModel: Deno.env.get(`AI_${config.envPrefix}_OPENAI_MODEL`) }
      )
      const endpoints = config.strictProvider
        ? resolvedEndpoints.filter((endpoint) => endpoint.id === runtimeConfig.provider)
        : resolvedEndpoints
      if (!endpoints.length) {
        return json({ code: 'missing_secret', message: 'AI 服务尚未配置' }, 500)
      }

      const minuteAgo = new Date(Date.now() - 60_000).toISOString()
      const dayAgo = new Date(Date.now() - 86_400_000).toISOString()
      const [minuteResult, dayResult] = await Promise.all([
        admin
          .from('ai_run')
          .select('id', { count: 'exact', head: true })
          .eq('auth_user_id', user.id)
          .eq('feature', config.feature)
          .gte('started_at', minuteAgo),
        admin
          .from('ai_run')
          .select('id', { count: 'exact', head: true })
          .eq('auth_user_id', user.id)
          .eq('feature', config.feature)
          .gte('started_at', dayAgo)
      ])
      if (
        (minuteResult.count ?? 0) >= runtimeConfig.rateLimitPerMinute ||
        (dayResult.count ?? 0) >= runtimeConfig.rateLimitPerDay
      ) {
        return json({ code: 'rate_limited', message: config.labels.rateLimited }, 429)
      }

      const prompt = await loadPublishedAiPrompt(admin, appUser.tenant_id, config.feature, {
        content: config.defaultPrompt,
        version: runtimeConfig.promptVersion
      })
      const runtimePrompt = [
        prompt.content,
        '必须把图片中可见文字按自然阅读顺序完整抄录到 rawText；保留换行，不得把任务说明、字段模板或推测内容写入 rawText。',
        '即使没有识别到文字，也必须返回 rawText 空字符串。'
      ].join('\n')
      if (config.inlineImages && !config.authorizeImageUrls) {
        throw new Error('Inline OCR images require an image authorization policy')
      }
      const providerImageUrls = config.inlineImages
        ? await Promise.all(imageUrls.map((url) => loadImageDataUrl(url)))
        : imageUrls
      if (providerImageUrls.some((url) => !url)) {
        return json(
          {
            code: 'invalid_image_content',
            message: config.labels.invalidImageContent ?? config.labels.invalidImages
          },
          422
        )
      }
      let resolvedModel = endpoints[0].model
      const startedAt = Date.now()
      const inputMetadata = config.inputMetadata(input)
      const { data: run, error: runError } = await admin
        .from('ai_run')
        .insert({
          auth_user_id: user.id,
          tenant_id: appUser.tenant_id,
          feature: config.feature,
          model: resolvedModel,
          prompt_version: prompt.version,
          metadata: {
            imageCount: imageUrls.length,
            ...inputMetadata,
            promptSource: prompt.source,
            providerChain: endpoints.map((item) => item.label)
          },
          create_by: appUser.user_email,
          update_by: appUser.user_email
        })
        .select('id')
        .single()
      if (runError) throw runError

      finishRun = async (status, usage, errorCode, errorMessage) => {
        const { error } = await admin
          .from('ai_run')
          .update({
            status,
            model: resolvedModel,
            input_tokens: usage?.prompt_tokens ?? 0,
            output_tokens: usage?.completion_tokens ?? 0,
            latency_ms: Date.now() - startedAt,
            error_code: errorCode ?? null,
            error_message: errorMessage?.slice(0, 2000) ?? null,
            finished_at: new Date().toISOString(),
            update_by: appUser.user_email
          })
          .eq('id', run.id)
        if (error) console.error(`${config.feature} audit update failed`, error.message)
      }

      const userContent = [
        {
          type: 'text',
          text: JSON.stringify({ context: inputMetadata, expectedShape: config.expectedShape }, null, 2)
        },
        ...providerImageUrls.map((url) => ({ type: 'image_url', image_url: { url } }))
      ]
      const requestBody: Record<string, unknown> = {
        model: resolvedModel,
        temperature: runtimeConfig.temperature,
        max_tokens: runtimeConfig.maxTokens,
        stream: false,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: runtimePrompt },
          { role: 'user', content: userContent }
        ]
      }
      const deadline = Date.now() + runtimeConfig.timeoutMs
      const requestProvider = (endpoint: AiProviderEndpoint) => {
        const remainingMs = deadline - Date.now()
        if (remainingMs <= 0) throw new ProviderTimeoutError(runtimeConfig.timeoutMs)
        return fetchWithTimeout(
          `${endpoint.baseUrl}/chat/completions`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${endpoint.apiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
          },
          remainingMs
        )
      }
      const requestConfiguredModel = async (endpoint: AiProviderEndpoint, targetModel: string) => {
        resolvedModel = targetModel
        requestBody.model = targetModel
        delete requestBody.reasoning_effort
        delete requestBody.chat_template_kwargs
        Object.assign(requestBody, config.modelRequestOptions?.(endpoint, targetModel))
        let response = await requestProvider(endpoint)
        let errorText = ''
        for (let attempt = 0; !response.ok; attempt += 1) {
          errorText = await response.text()
          if (
            response.status === 400 &&
            'response_format' in requestBody &&
            /response_format|json_object|unsupported/i.test(errorText)
          ) {
            delete requestBody.response_format
            response = await requestProvider(endpoint)
            continue
          }
          if (!(
            (response.status === 429 || response.status >= 500) &&
            attempt < runtimeConfig.maxRetries
          )) {
            break
          }
          response = await requestProvider(endpoint)
        }
        return { response, errorText }
      }

      let activeEndpoint = endpoints[0]
      let providerResult: { response: Response; errorText: string } | null = null
      for (const endpoint of endpoints) {
        let result = await requestConfiguredModel(endpoint, endpoint.model)
        if (
          !result.response.ok &&
          endpoint.fallbackModel &&
          endpoint.fallbackModel !== resolvedModel
        ) {
          result = await requestConfiguredModel(endpoint, endpoint.fallbackModel)
        }
        providerResult = result
        if (result.response.ok) {
          activeEndpoint = endpoint
          break
        }
        console.error(
          `${config.feature} provider attempt failed`,
          endpoint.label,
          result.response.status
        )
      }
      if (!providerResult?.response.ok) {
        await finishRun(
          'failed',
          undefined,
          'provider_error',
          `AI provider returned HTTP ${providerResult?.response.status ?? 'unknown'}`
        )
        return json({ code: 'provider_error', message: config.labels.providerFailed }, 502)
      }

      let providerPayload = await providerResult.response.json()
      let usage = providerPayload?.usage
      let providerMessage = providerPayload?.choices?.[0]?.message
      let content = extractAiProviderText(providerMessage)
      let parsed = extractAiProviderJson(providerMessage)
      let validation = config.validate(parsed)
      if (!validation.valid) {
        requestBody.temperature = 0
        requestBody.messages = [
          { role: 'system', content: runtimePrompt },
          { role: 'user', content: userContent },
          { role: 'assistant', content: content.slice(0, 12_000) },
          {
            role: 'user',
            content: `上一个响应不符合 JSON 契约：${validation.errors.join('；')}。请修复后只返回完整 JSON，不得编造。`
          }
        ]
        const repair = await requestConfiguredModel(activeEndpoint, resolvedModel)
        if (repair.response.ok) {
          providerPayload = await repair.response.json()
          usage = {
            prompt_tokens:
              (usage?.prompt_tokens ?? 0) + (providerPayload?.usage?.prompt_tokens ?? 0),
            completion_tokens:
              (usage?.completion_tokens ?? 0) + (providerPayload?.usage?.completion_tokens ?? 0)
          }
          providerMessage = providerPayload?.choices?.[0]?.message
          content = extractAiProviderText(providerMessage)
          parsed = extractAiProviderJson(providerMessage)
          validation = config.validate(parsed)
        }
      }
      if (!parsed || !validation.valid) {
        const message = validation.errors.join('; ').slice(0, 2000) || 'Invalid JSON response'
        const classified = config.classifyInvalidResponse?.(validation.errors)
        await finishRun('failed', usage, classified?.code ?? 'invalid_ai_response', message)
        return json(
          {
            code: classified?.code ?? 'invalid_ai_response',
            message: classified?.message ?? config.labels.invalidResponse
          },
          classified?.status ?? 502
        )
      }

      const result = config.normalize(parsed)
      const rawOcrText = normalizeOcrRawText(result.rawText)
      const proposedPayload = config.proposedPayload(result)
      const runtimeContext = {
        admin,
        appUser,
        userId: user.id,
        input,
        result
      }
      const extraResponse = config.enrichResponse ? await config.enrichResponse(runtimeContext) : {}
      const { data: thresholdRow } = await admin
        .from('ai_ocr_quality_threshold')
        .select('review_confidence_threshold')
        .eq('tenant_id', appUser.tenant_id)
        .eq('feature', config.feature)
        .maybeSingle()
      const reviewConfidenceThreshold = Number(thresholdRow?.review_confidence_threshold ?? 0.82)
      const artifactMetadata = config.artifactMetadata?.(runtimeContext, extraResponse) ?? {}
      const { data: artifact, error: artifactError } = await admin
        .from('ai_artifact_review')
        .insert({
          ai_run_id: run.id,
          auth_user_id: user.id,
          tenant_id: appUser.tenant_id,
          feature: config.feature,
          artifact_type: config.artifactType,
          proposed_payload: proposedPayload,
          confidence: result.confidence,
          field_confidence: result.fieldConfidence,
          warnings: result.warnings,
          raw_ocr_text: rawOcrText,
          metadata: {
            imageCount: imageUrls.length,
            imageUrls,
            ...inputMetadata,
            ...artifactMetadata,
            reviewConfidenceThreshold
          },
          create_by: appUser.user_email,
          update_by: appUser.user_email
        })
        .select('id')
        .single()
      if (artifactError) throw artifactError

      await finishRun('succeeded', usage)
      return json({
        ...result,
        rawText: rawOcrText,
        ...extraResponse,
        artifactId: artifact.id,
        runId: run.id,
        reviewConfidenceThreshold,
        generatedAt: new Date().toISOString()
      })
    } catch (error) {
      if (error instanceof ProviderTimeoutError) {
        await finishRun('failed', undefined, 'provider_timeout', error.message)
        return json({ code: 'provider_timeout', message: config.labels.timeout }, 504)
      }
      console.error(`${config.feature} error`, error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      await finishRun('failed', undefined, 'server_error', message)
      return json({ code: 'server_error', message: config.labels.serverError }, 500)
    }
  }
}
