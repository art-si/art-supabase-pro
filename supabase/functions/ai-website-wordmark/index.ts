import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import {
  authenticateAiEdgeRequest,
  authorizeAiEdgeAppUser
} from '../_shared/ai-edge-user-context.ts'
import { resolveAiProviderEndpoints } from '../_shared/ai-provider-endpoints.ts'
import { loadPublishedAiPrompt } from '../_shared/ai-prompt-template.ts'
import { loadAiRuntimeConfig } from '../_shared/ai-runtime-config.ts'

const FEATURE = 'website_wordmark_generation'
const PERMISSION = 'System:WebsiteConfig:GenerateWordmark'
const DEFAULT_MODEL = 'gpt-image-2.5-flare'
const DEFAULT_FALLBACK_MODEL = 'gpt-image-1'
const NVIDIA_IMAGE_MODEL = 'black-forest-labs/flux.2-klein-4b'
const NVIDIA_IMAGE_ENDPOINT =
  'https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b'
const MAX_IMAGE_BASE64_LENGTH = 24_000_000
const FALLBACK_SYSTEM_PROMPT = [
  '你是企业应用品牌字图设计助手，负责生成横向中文品牌字图。',
  '必须逐字准确渲染调用方指定的唯一文字，不得改写、翻译、增删或拆行。',
  '不得增加英文、字母、口号、图标、图案、符号、边框、底板或水印。',
  '使用稳重、几何化、现代科技感的中文标题字，粗度较高，在小尺寸菜单头部仍清晰可读。',
  '背景必须完全透明，文字居中并尽可能占据画布横向宽度，仅保留少量透明边距。',
  '效果应安静、专业、高辨识度，禁止海报化和过度装饰。'
].join('\n')
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

interface GenerateRequest {
  siteName?: unknown
}

interface GeneratedImageData {
  b64_json?: string
  url?: string
  revised_prompt?: string | null
}

interface ImageGenerationResponse {
  data?: GeneratedImageData[]
  error?: { message?: string }
}

interface NvidiaImageGenerationResponse {
  artifacts?: Array<{ base64?: string }>
  detail?: string | Array<{ msg?: string }>
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' }
  })
}

function requiredText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().replace(/\s+/g, ' ')
  return normalized && normalized.length <= maxLength ? normalized : null
}

function buildPrompt(systemPrompt: string, siteName: string): string {
  return [
    systemPrompt,
    `为 ${JSON.stringify(siteName)} 创作一张横向科技品牌字的抽象风格参考图。`,
    '不要绘制任何文字、汉字、字母、数字、符号、图标或水印，只使用少量现代几何笔触表达字重、切角与节奏。',
    '使用纯白视觉元素和透明背景；浏览器会用真实字体精确排版系统名称，并将本图仅作为字形内部的轻微纹理。',
    '保持横向构图、简洁、高对比度；最终成品会输出到 1008×240 透明画布，并在菜单中以约 109×26px 展示。'
  ].join('\n')
}

function buildOpaqueMaskPrompt(systemPrompt: string, siteName: string): string {
  return [
    systemPrompt,
    `为 ${JSON.stringify(siteName)} 创作一张横向科技品牌字的抽象风格参考图。`,
    '严禁绘制任何文字、汉字、字母、数字、符号、图标或水印，只生成少量现代几何笔触，用于表达字重、切角与节奏。',
    '纯黑色背景、纯白色视觉元素、高对比度；禁止渐变背景、阴影、发光、边框、标语和其他内容。',
    '浏览器会使用真实中文字体精确排版系统名称，并把本图仅作为字形内部的轻微纹理，因此不要尝试拼写名称。'
  ].join('\n')
}

function imageMimeType(imageBase64: string): 'image/png' | 'image/jpeg' {
  return imageBase64.startsWith('/9j/') ? 'image/jpeg' : 'image/png'
}

function imageErrorDetail(payload: NvidiaImageGenerationResponse): string {
  if (typeof payload.detail === 'string') return payload.detail
  if (Array.isArray(payload.detail)) {
    return payload.detail.map((item) => item.msg).filter(Boolean).join('; ')
  }
  return 'Unknown error'
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

async function resolveImageBase64(image: GeneratedImageData): Promise<string | null> {
  if (typeof image.b64_json === 'string' && image.b64_json.length > 1000) {
    return image.b64_json.length <= MAX_IMAGE_BASE64_LENGTH ? image.b64_json : null
  }
  if (typeof image.url !== 'string' || !image.url.startsWith('https://')) return null

  const response = await fetch(image.url, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) return null
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength === 0 || bytes.byteLength * 1.4 > MAX_IMAGE_BASE64_LENGTH) return null
  return bytesToBase64(bytes)
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') {
    return json({ code: 'method_not_allowed', message: 'Method not allowed' }, 405)
  }

  const authentication = await authenticateAiEdgeRequest(request, '登录状态已失效，请重新登录')
  if (!authentication.ok) {
    return json(
      { code: authentication.code, message: authentication.message },
      authentication.status
    )
  }
  const context = await authorizeAiEdgeAppUser(authentication, '当前账号不可使用 AI 品牌字图')
  if (!context.ok) return json({ code: context.code, message: context.message }, context.status)
  const { admin, userClient, user, appUser } = context

  const [superResult, permissionResult] = await Promise.all([
    userClient.rpc('current_is_super'),
    userClient.rpc('current_has_permission', { p_permission: PERMISSION })
  ])
  if (
    superResult.error ||
    permissionResult.error ||
    superResult.data !== true ||
    permissionResult.data !== true
  ) {
    return json(
      { code: 'forbidden', message: '仅有获得品牌配置权限的平台超级管理员可生成品牌字图' },
      403
    )
  }

  const body = (await request.json().catch(() => ({}))) as GenerateRequest
  const siteName = requiredText(body.siteName, 60)
  if (!siteName) {
    return json({ code: 'invalid_input', message: '请提供有效的系统名称' }, 400)
  }

  const runtimeConfig = await loadAiRuntimeConfig(admin, appUser.tenant_id, FEATURE, {
    enabled: true,
    provider: 'openai',
    model: DEFAULT_MODEL,
    visionModel: null,
    fallbackModel: DEFAULT_FALLBACK_MODEL,
    timeoutMs: 120_000,
    maxRetries: 0,
    temperature: 0,
    maxTokens: 100,
    rateLimitPerMinute: 2,
    rateLimitPerDay: 30,
    promptVersion: 'v1'
  })
  if (!runtimeConfig.enabled) {
    return json({ code: 'feature_disabled', message: 'AI 品牌字图已由平台管理员停用' }, 503)
  }

  const endpoints = resolveAiProviderEndpoints(runtimeConfig, {
    openAiModel: runtimeConfig.model,
    defaultOpenAiModel: DEFAULT_MODEL
  })
  if (!endpoints.length) {
    return json({ code: 'missing_secret', message: '尚未配置可用的 AI 图片生成服务' }, 503)
  }

  const minuteAgo = new Date(Date.now() - 60_000).toISOString()
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString()
  const [minuteResult, dayResult] = await Promise.all([
    admin
      .from('ai_run')
      .select('id', { count: 'exact', head: true })
      .eq('auth_user_id', user.id)
      .eq('feature', FEATURE)
      .gte('started_at', minuteAgo),
    admin
      .from('ai_run')
      .select('id', { count: 'exact', head: true })
      .eq('auth_user_id', user.id)
      .eq('feature', FEATURE)
      .gte('started_at', dayAgo)
  ])
  if (minuteResult.error || dayResult.error) {
    return json(
      { code: 'rate_limit_check_failed', message: '无法确认 AI 生成频率，请稍后重试' },
      503
    )
  }
  if (
    (minuteResult.count ?? 0) >= runtimeConfig.rateLimitPerMinute ||
    (dayResult.count ?? 0) >= runtimeConfig.rateLimitPerDay
  ) {
    return json({ code: 'rate_limited', message: 'AI 品牌字图生成次数已达上限，请稍后重试' }, 429)
  }

  const publishedPrompt = await loadPublishedAiPrompt(admin, appUser.tenant_id, FEATURE, {
    content: FALLBACK_SYSTEM_PROMPT,
    version: 'code-v1'
  })

  const startedAt = Date.now()
  const { data: run, error: runError } = await admin
    .from('ai_run')
    .insert({
      auth_user_id: user.id,
      tenant_id: appUser.tenant_id,
      feature: FEATURE,
      model: endpoints[0].model,
      prompt_version: publishedPrompt.version,
      metadata: {
        themeVariants: ['light', 'dark'],
        requestedCanvas: '1536x1024',
        outputCanvas: '1008x240',
        providerChain: endpoints.map((item) => ({
          provider: item.label,
          models:
            item.id === 'openai_compatible' && /nvidia\.com/i.test(item.baseUrl)
              ? [NVIDIA_IMAGE_MODEL]
              : [runtimeConfig.model, runtimeConfig.fallbackModel].filter(Boolean)
        })),
        humanReviewRequired: true,
        automaticPublish: false,
        promptSource: publishedPrompt.source
      },
      create_by: appUser.user_email,
      update_by: appUser.user_email
    })
    .select('id')
    .single()
  if (runError || !run) {
    console.error('website wordmark audit create failed', runError?.message)
    return json({ code: 'audit_failed', message: '无法创建 AI 生成审计记录' }, 500)
  }

  const finishRun = async (
    status: 'succeeded' | 'failed',
    model: string,
    errorCode?: string,
    errorMessage?: string
  ): Promise<void> => {
    const { error } = await admin
      .from('ai_run')
      .update({
        status,
        model,
        latency_ms: Date.now() - startedAt,
        error_code: errorCode ?? null,
        error_message: errorMessage?.slice(0, 2000) ?? null,
        finished_at: new Date().toISOString(),
        update_by: appUser.user_email
      })
      .eq('id', run.id)
    if (error) console.error('website wordmark audit update failed', error.message)
  }

  const providerErrors: string[] = []
  let resolvedModel = endpoints[0].model
  for (const endpoint of endpoints) {
    if (endpoint.id === 'openai_compatible' && /nvidia\.com/i.test(endpoint.baseUrl)) {
      resolvedModel = NVIDIA_IMAGE_MODEL
      try {
        const response = await fetch(NVIDIA_IMAGE_ENDPOINT, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${endpoint.apiKey}`,
            Accept: 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            prompt: buildOpaqueMaskPrompt(publishedPrompt.content, siteName),
            seed: 0,
            steps: 4
          }),
          signal: AbortSignal.timeout(runtimeConfig.timeoutMs)
        })
        const payload = (await response.json().catch(() => ({}))) as NvidiaImageGenerationResponse
        if (!response.ok) {
          providerErrors.push(
            `NVIDIA/${NVIDIA_IMAGE_MODEL}: HTTP ${response.status} ${imageErrorDetail(payload)}`
          )
        } else {
          const imageBase64 = payload.artifacts?.[0]?.base64
          if (imageBase64 && imageBase64.length > 1000) {
            await finishRun('succeeded', NVIDIA_IMAGE_MODEL)
            return json({
              imageBase64,
              mimeType: imageMimeType(imageBase64),
              model: NVIDIA_IMAGE_MODEL,
              runId: run.id,
              revisedPrompt: null,
              generatedAt: new Date().toISOString()
            })
          }
          providerErrors.push(`${endpoint.label}/${NVIDIA_IMAGE_MODEL}: invalid image response`)
        }
      } catch (error) {
        providerErrors.push(
          `${endpoint.label}/${NVIDIA_IMAGE_MODEL}: ${error instanceof Error ? error.message : 'Unknown provider error'}`
        )
      }
      continue
    }

    if (endpoint.id !== 'openai') continue
    const configuredOpenAiModel = runtimeConfig.model.startsWith('gpt-image')
      ? runtimeConfig.model
      : DEFAULT_MODEL
    const configuredOpenAiFallback = runtimeConfig.fallbackModel?.startsWith('gpt-image')
      ? runtimeConfig.fallbackModel
      : DEFAULT_FALLBACK_MODEL
    const modelCandidates = [...new Set([configuredOpenAiModel, configuredOpenAiFallback])].filter(
      (model): model is string => Boolean(model)
    )
    for (const model of modelCandidates) {
      resolvedModel = model
      try {
        const response = await fetch(`${endpoint.baseUrl}/images/generations`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${endpoint.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model,
            prompt: buildPrompt(publishedPrompt.content, siteName),
            n: 1,
            size: '1536x1024',
            quality: 'medium',
            background: 'transparent',
            output_format: 'png'
          }),
          signal: AbortSignal.timeout(runtimeConfig.timeoutMs)
        })
        const payload = (await response.json().catch(() => ({}))) as ImageGenerationResponse
        if (!response.ok) {
          providerErrors.push(
            `${endpoint.label}/${model}: HTTP ${response.status} ${payload.error?.message || 'Unknown error'}`
          )
          continue
        }

        const image = payload.data?.[0]
        const imageBase64 = image ? await resolveImageBase64(image) : null
        if (!imageBase64) {
          providerErrors.push(`${endpoint.label}/${model}: invalid image response`)
          continue
        }

        await finishRun('succeeded', model)
        return json({
          imageBase64,
          mimeType: 'image/png',
          model,
          runId: run.id,
          revisedPrompt: image?.revised_prompt ?? null,
          generatedAt: new Date().toISOString()
        })
      } catch (error) {
        providerErrors.push(
          `${endpoint.label}/${model}: ${error instanceof Error ? error.message : 'Unknown provider error'}`
        )
      }
    }
  }

  const providerErrorMessage =
    providerErrors.join(' | ') || 'No image generation endpoint succeeded'
  console.error('ai-website-wordmark failed', providerErrorMessage)
  await finishRun('failed', resolvedModel, 'image_generation_failed', providerErrorMessage)

  const responseMessage = providerErrors.some((message) => /HTTP 401/.test(message))
    ? 'AI 图片服务密钥无效，请在 AI 配置中心更新密钥后重试'
    : providerErrors.some((message) => /HTTP 403/.test(message))
      ? '当前 API 项目尚未获得图片生成模型权限，请检查计费层级与模型访问权限'
      : providerErrors.some((message) => /HTTP 429/.test(message))
      ? 'AI 图片服务额度不足或请求过于频繁'
      : providerErrors.some((message) => /HTTP 404/.test(message))
        ? '当前账号尚未开通可用的 AI 图片模型'
        : 'AI 品牌字图生成失败，请稍后重试'
  return json({ code: 'image_generation_failed', message: responseMessage }, 502)
})
