import { buildOrIlikeFilter } from '@/utils/supabase/search'
import { buildSupabasePageRange } from '@/utils/supabase/pagination'
import { createFriendlySupabaseFunctionError } from '@/utils/supabase/error'
import { useSupabase } from '@/hooks/core/useSupabase'

const { supabase, keysToSnakeDeep, responseHandle } = useSupabase()

export interface AiFeatureConfig {
  id: string
  tenantId: string
  sourceTenantId: string
  inherited: boolean
  feature: string
  enabled: boolean
  provider: string
  model: string
  visionModel?: string | null
  fallbackModel?: string | null
  timeoutMs: number
  maxRetries: number
  temperature: number
  maxTokens: number
  rateLimitPerMinute: number
  rateLimitPerDay: number
  promptVersion: string
  metadata: Record<string, unknown>
  createBy?: string | null
  createTime: string
  updateBy?: string | null
  updateTime: string
}

export interface AiFeatureConfigSearchParams {
  current: number
  size: number
  feature?: string
  enabled?: boolean | ''
  keyword?: string
}

export interface AiProviderProtocol {
  value: string
  label: string
  description: string
}

export interface AiProviderModel {
  id: string
  label: string
  ownedBy?: string | null
  kind: 'text' | 'vision' | 'unknown'
  capability: string
  strengths: string[]
  recommendedFor: string[]
  performanceProfile: 'speed' | 'balanced' | 'quality' | 'specialized' | 'unknown'
  performanceHint: string
  parameterScale?: string | null
  benchmarkable: boolean
  description: string
}

export interface AiModelBenchmark {
  model: string
  connectionMs: number
  firstResponseMs: number
  totalMs: number
  responseBytes: number
  streaming: boolean
  measuredAt: string
}

export interface AiProviderCatalog {
  protocols: AiProviderProtocol[]
  models: AiProviderModel[]
  source: 'remote' | 'configured'
  cached: boolean
  fetchedAt: string
  warning?: string | null
}

export type AiFeatureConfigWritePayload = Pick<
  AiFeatureConfig,
  | 'id'
  | 'enabled'
  | 'provider'
  | 'model'
  | 'visionModel'
  | 'fallbackModel'
  | 'timeoutMs'
  | 'maxRetries'
  | 'temperature'
  | 'maxTokens'
  | 'rateLimitPerMinute'
  | 'rateLimitPerDay'
  | 'promptVersion'
>

let providerCatalogPromise: Promise<AiProviderCatalog> | null = null

export const clearAiProviderCatalogCache = (): void => {
  providerCatalogPromise = null
}

function inferLegacyModelMetadata(model: AiProviderModel) {
  const parameterMatch = model.id.match(/(?:^|[-_./])(\d+(?:\.\d+)?)([bm])(?=[-_./]|$)/i)
  const parameterValue = parameterMatch ? Number(parameterMatch[1]) : null
  const parameterBillions =
    parameterValue == null
      ? null
      : parameterMatch?.[2].toLowerCase() === 'm'
        ? parameterValue / 1000
        : parameterValue
  const parameterScale = parameterMatch
    ? `${parameterMatch[1]}${parameterMatch[2].toUpperCase()}`
    : null
  const performanceProfile: AiProviderModel['performanceProfile'] =
    model.kind === 'unknown'
      ? 'specialized'
      : parameterBillions == null
        ? 'unknown'
        : parameterBillions <= 4
          ? 'speed'
          : parameterBillions >= 30
            ? 'quality'
            : 'balanced'
  const performanceHint =
    performanceProfile === 'specialized'
      ? '专用模型，不能通过对话生成接口比较响应速度'
      : performanceProfile === 'speed'
        ? '偏轻量，通常更容易获得低延迟；实际速度取决于部署硬件与负载'
        : performanceProfile === 'quality'
          ? '偏质量与复杂任务，延迟通常高于轻量模型；请以当前线路实测为准'
          : '远端目录暂未提供性能倾向，请以当前线路实测为准'

  if (/(code|coder|starcoder|codestral|codellama)/i.test(model.id)) {
    return {
      capability: '代码与 SQL',
      strengths: ['代码生成', 'SQL 编写', '调试重构'],
      recommendedFor: ['SQL 助手', '代码审查', '研发问答'],
      parameterScale,
      performanceProfile,
      performanceHint
    }
  }
  if (model.kind === 'vision') {
    return {
      capability: '视觉理解',
      strengths: ['图片理解', 'OCR 与文档识别'],
      recommendedFor: ['智能填单', '图片问答'],
      parameterScale,
      performanceProfile,
      performanceHint
    }
  }
  return {
    capability: model.description?.split('·').at(-1)?.trim() || '通用文本',
    strengths: ['文本生成', '摘要改写', '通用问答'],
    recommendedFor: ['业务问答', '内容生成'],
    parameterScale,
    performanceProfile,
    performanceHint
  }
}

function normalizeProviderModel(model: AiProviderModel): AiProviderModel {
  const inferred = inferLegacyModelMetadata(model)
  return {
    ...model,
    capability: model.capability || inferred.capability,
    strengths: Array.isArray(model.strengths) ? model.strengths : inferred.strengths,
    recommendedFor: Array.isArray(model.recommendedFor)
      ? model.recommendedFor
      : inferred.recommendedFor,
    performanceProfile: model.performanceProfile || inferred.performanceProfile,
    performanceHint: model.performanceHint || inferred.performanceHint,
    parameterScale: model.parameterScale ?? inferred.parameterScale,
    benchmarkable: model.benchmarkable ?? model.kind !== 'unknown'
  }
}

export async function fetchAiProviderCatalog(params?: {
  forceRefresh?: boolean
}): Promise<AiProviderCatalog> {
  if (!providerCatalogPromise || params?.forceRefresh) {
    const request = (async () => {
      const { data, error } = await supabase.functions.invoke<AiProviderCatalog>(
        'ai-provider-catalog',
        { body: { forceRefresh: params?.forceRefresh === true } }
      )
      if (error) throw await createFriendlySupabaseFunctionError(error, '远端模型目录暂时不可用')
      if (!data || !Array.isArray(data.models)) throw new Error('远端模型目录返回格式无效')
      return { ...data, models: data.models.map(normalizeProviderModel) }
    })()
    providerCatalogPromise = request
    request.catch(() => {
      if (providerCatalogPromise === request) providerCatalogPromise = null
    })
  }
  return await providerCatalogPromise
}

export async function benchmarkAiProviderModel(model: string): Promise<AiModelBenchmark> {
  const normalizedModel = model.trim()
  if (!normalizedModel) throw new Error('请先选择需要测速的模型')

  const { data, error } = await supabase.functions.invoke<AiModelBenchmark>('ai-provider-catalog', {
    body: { action: 'benchmark', model: normalizedModel }
  })
  if (error) throw await createFriendlySupabaseFunctionError(error, '模型测速暂时不可用')
  if (!data || data.model !== normalizedModel || !Number.isFinite(data.totalMs)) {
    throw new Error('模型测速返回格式无效')
  }
  return data
}

export async function fetchAiFeatureConfigList(params: AiFeatureConfigSearchParams) {
  const { from, to } = buildSupabasePageRange(params)

  let query = supabase
    .rpc('get_effective_ai_feature_configs', {}, { count: 'exact' })
    .order('feature', { ascending: true })
    .order('id')
    .range(from, to)

  if (params.feature) query = query.eq('feature', params.feature)
  if (typeof params.enabled === 'boolean') query = query.eq('enabled', params.enabled)
  if (params.keyword?.trim()) {
    const keyword = params.keyword.trim()
    query = query.or(buildOrIlikeFilter(['model', 'vision_model', 'fallback_model'], keyword))
  }

  return await responseHandle<AiFeatureConfig[]>(() => query, {
    showErrorMessage: true
  })
}

export async function updateAiFeatureConfig(params: AiFeatureConfigWritePayload): Promise<void> {
  const { id, ...writeData } = params
  await responseHandle(
    () => supabase.from('ai_feature_config').update(keysToSnakeDeep(writeData)).eq('id', id),
    { breakReturn: true, showMessage: true }
  )
}
