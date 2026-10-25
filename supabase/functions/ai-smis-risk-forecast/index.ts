import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import {
  authenticateAiEdgeRequest,
  authorizeAiEdgeAppUser
} from '../_shared/ai-edge-user-context.ts'
import { loadAiRuntimeConfig } from '../_shared/ai-runtime-config.ts'
import {
  evaluateSmisRiskForecast,
  type SmisHazardForecastObservation
} from '../_shared/ai-smis-risk-forecast-contract.ts'

const FEATURE = 'smis_hazard_risk_forecast'
const PERMISSION = 'SmisDualControlHiddenHazardGovernanceTracking:AiForecast'
const MODEL = 'smis-hazard-risk-forecast-rules-v1'
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' }
  })
}

function integerValue(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(parsed)))
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ code: 'method_not_allowed', message: 'Method not allowed' }, 405)

  const authentication = await authenticateAiEdgeRequest(request, '需要登录后使用隐患风险趋势分析')
  if (!authentication.ok) return json({ code: authentication.code, message: authentication.message }, authentication.status)

  const context = await authorizeAiEdgeAppUser(authentication, '当前账号不可使用隐患风险趋势分析')
  if (!context.ok) return json({ code: context.code, message: context.message }, context.status)
  const { admin, userClient, user, appUser } = context

  const { data: allowed, error: permissionError } = await userClient.rpc('current_has_permission', {
    p_permission: PERMISSION
  })
  if (permissionError || allowed !== true) {
    if (permissionError) console.error('SMIS risk forecast permission failed', permissionError.message)
    return json({ code: 'forbidden', message: '当前账号无权使用隐患风险趋势分析' }, 403)
  }

  const body = (await request.json().catch(() => ({}))) as { lookbackDays?: unknown }
  const lookbackDays = integerValue(body.lookbackDays, 30, 7, 90)
  const runtimeConfig = await loadAiRuntimeConfig(admin, appUser.tenant_id, FEATURE, {
    enabled: true,
    provider: 'rule_engine',
    model: MODEL,
    visionModel: null,
    fallbackModel: null,
    timeoutMs: 10_000,
    maxRetries: 0,
    temperature: 0,
    maxTokens: 500,
    rateLimitPerMinute: 12,
    rateLimitPerDay: 200,
    promptVersion: 'rules-v1'
  })
  if (!runtimeConfig.enabled) return json({ code: 'feature_disabled', message: '隐患风险趋势分析已由平台管理员停用' }, 503)

  const minuteAgo = new Date(Date.now() - 60_000).toISOString()
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString()
  const [minuteResult, dayResult] = await Promise.all([
    admin.from('ai_run').select('id', { count: 'exact', head: true }).eq('auth_user_id', user.id).eq('feature', FEATURE).gte('started_at', minuteAgo),
    admin.from('ai_run').select('id', { count: 'exact', head: true }).eq('auth_user_id', user.id).eq('feature', FEATURE).gte('started_at', dayAgo)
  ])
  if ((minuteResult.count ?? 0) >= runtimeConfig.rateLimitPerMinute || (dayResult.count ?? 0) >= runtimeConfig.rateLimitPerDay) {
    return json({ code: 'rate_limited', message: '隐患风险趋势分析次数已达到限额，请稍后重试' }, 429)
  }

  const startedAt = Date.now()
  let runId = ''
  try {
    const asOf = new Date()
    const { data, error } = await userClient.rpc('smis_list_hidden_hazard_governance_secure', {
      p_from: 0,
      p_to: 199,
      p_hazard_no: null,
      p_reported_from: addDays(asOf, -lookbackDays * 2).toISOString(),
      p_reported_to: asOf.toISOString(),
      p_status: null,
      p_rectifier_keyword: null,
      p_reporter_keyword: null,
      p_inspection_type_id: null
    })
    if (error) throw error
    const payload = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
    const rows = Array.isArray(payload.records) ? (payload.records as Array<Record<string, unknown>>) : []
    const observations: SmisHazardForecastObservation[] = rows.map((item) => ({
      status: typeof item.status === 'string' ? item.status : '',
      hazardLevel: typeof item.hazardLevel === 'string' ? item.hazardLevel : null,
      reportedAt: typeof item.reportedAt === 'string' ? item.reportedAt : '',
      rectificationDeadline:
        typeof item.rectificationDeadline === 'string' ? item.rectificationDeadline : null
    }))
    const assessment = evaluateSmisRiskForecast({
      asOf: asOf.toISOString(),
      lookbackDays,
      observations
    })

    const { data: run, error: runError } = await admin
      .from('ai_run')
      .insert({
        auth_user_id: user.id,
        tenant_id: appUser.tenant_id,
        feature: FEATURE,
        model: MODEL,
        prompt_version: runtimeConfig.promptVersion,
        status: 'succeeded',
        latency_ms: Date.now() - startedAt,
        finished_at: new Date().toISOString(),
        metadata: {
          lookbackDays,
          sampleSize: observations.length,
          score: assessment.score,
          riskLevel: assessment.riskLevel,
          confidence: assessment.confidence,
          decisionMode: 'advisory_only',
          automaticBusinessWrite: false
        },
        create_by: appUser.user_email,
        update_by: appUser.user_email
      })
      .select('id')
      .single()
    if (runError) throw runError
    runId = run.id

    return json({
      runId,
      model: MODEL,
      generatedAt: new Date().toISOString(),
      dataThrough: asOf.toISOString(),
      assessment
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('ai-smis-risk-forecast failed', message)
    return json({ code: 'risk_forecast_failed', message: '隐患风险趋势分析失败，请稍后重试' }, 500)
  }
})
