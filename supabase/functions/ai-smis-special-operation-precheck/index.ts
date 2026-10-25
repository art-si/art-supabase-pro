import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import {
  authenticateAiEdgeRequest,
  authorizeAiEdgeAppUser
} from '../_shared/ai-edge-user-context.ts'
import { loadAiRuntimeConfig } from '../_shared/ai-runtime-config.ts'
import {
  evaluateSpecialOperationPrecheck,
  type SpecialOperationPrecheckInput
} from '../_shared/ai-smis-special-operation-precheck-contract.ts'

interface PrecheckRequest {
  permissionCode?: unknown
  draft?: unknown
}

const FEATURE = 'smis_special_operation_precheck'
const RULE_VERSION = 'smis-special-operation-precheck-rules-v1'
const PERMISSION_CODES = new Set([
  'SmisSpecialOperationWorkbench:AiPrecheck',
  'SmisHotWorkApplication:AiPrecheck',
  'SmisWorkAtHeightApplication:AiPrecheck',
  'SmisLiftingOperationApplication:AiPrecheck',
  'SmisConfinedSpaceOperationApplication:AiPrecheck',
  'SmisTemporaryElectricityApplication:AiPrecheck',
  'SmisRoadBreakingOperationApplication:AiPrecheck',
  'SmisBlindPlateOperationApplication:AiPrecheck'
])
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

function text(value: unknown, maxLength = 500): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized ? normalized.slice(0, maxLength) : null
}

function count(value: unknown, max = 500): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.min(max, Math.trunc(parsed)))
}

function parseDraft(value: unknown): SpecialOperationPrecheckInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const draft = value as Record<string, unknown>
  const customFields = Array.isArray(draft.requiredCustomFields)
    ? draft.requiredCustomFields.slice(0, 100).map((item) => {
        const field = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
        return { label: text(field.label, 100) || '未命名字段', present: field.present === true }
      })
    : []
  return {
    operationTypeCode: text(draft.operationTypeCode, 100) || '',
    operationTypeName: text(draft.operationTypeName, 100) || '',
    workContent: text(draft.workContent),
    workStartTime: text(draft.workStartTime, 100),
    workEndTime: text(draft.workEndTime, 100),
    workLocation: text(draft.workLocation, 200),
    workUnit: text(draft.workUnit, 200),
    workSection: text(draft.workSection, 200),
    hotWorkLevel: text(draft.hotWorkLevel, 100),
    hotWorkMethodCount: count(draft.hotWorkMethodCount),
    hazardFactorCount: count(draft.hazardFactorCount),
    responsibleEmployeeSelected: draft.responsibleEmployeeSelected === true,
    guardianCount: count(draft.guardianCount),
    verifierCount: count(draft.verifierCount),
    briefingGiverCount: count(draft.briefingGiverCount),
    briefingReceiverCount: count(draft.briefingReceiverCount),
    workerCount: count(draft.workerCount),
    analystCount: count(draft.analystCount),
    siteAnalysisTotal: count(draft.siteAnalysisTotal),
    siteAnalysisCompleted: count(draft.siteAnalysisCompleted),
    safetyMeasureTotal: count(draft.safetyMeasureTotal),
    safetyMeasureConfirmed: count(draft.safetyMeasureConfirmed),
    sitePhotoCount: count(draft.sitePhotoCount, 20),
    relatedOperationCount: count(draft.relatedOperationCount, 20),
    requiredCustomFields: customFields,
    blindPlateItemCount: count(draft.blindPlateItemCount, 100)
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ code: 'method_not_allowed', message: 'Method not allowed' }, 405)

  const authentication = await authenticateAiEdgeRequest(request, '需要登录后使用特殊作业票预审')
  if (!authentication.ok) return json({ code: authentication.code, message: authentication.message }, authentication.status)

  const body = (await request.json().catch(() => ({}))) as PrecheckRequest
  const permissionCode = text(body.permissionCode, 120) || ''
  if (!PERMISSION_CODES.has(permissionCode)) {
    return json({ code: 'invalid_permission', message: '无效的特殊作业票预审权限' }, 400)
  }
  const draft = parseDraft(body.draft)
  if (!draft) return json({ code: 'invalid_draft', message: '缺少可预审的作业票草稿' }, 400)

  const context = await authorizeAiEdgeAppUser(authentication, '当前账号不可使用特殊作业票预审')
  if (!context.ok) return json({ code: context.code, message: context.message }, context.status)
  const { admin, userClient, user, appUser } = context

  const { data: hasPermission, error: permissionError } = await userClient.rpc('current_has_permission', {
    p_permission: permissionCode
  })
  if (permissionError || hasPermission !== true) {
    if (permissionError) console.error('special-operation precheck permission failed', permissionError.message)
    return json({ code: 'forbidden', message: '当前账号无权使用特殊作业票预审' }, 403)
  }

  const runtimeConfig = await loadAiRuntimeConfig(admin, appUser.tenant_id, FEATURE, {
    enabled: true,
    provider: 'rule_engine',
    model: RULE_VERSION,
    visionModel: null,
    fallbackModel: null,
    timeoutMs: 10_000,
    maxRetries: 0,
    temperature: 0,
    maxTokens: 500,
    rateLimitPerMinute: 20,
    rateLimitPerDay: 500,
    promptVersion: 'rules-v1'
  })
  if (!runtimeConfig.enabled) return json({ code: 'feature_disabled', message: '特殊作业票预审已由平台管理员停用' }, 503)

  const minuteAgo = new Date(Date.now() - 60_000).toISOString()
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString()
  const [minuteResult, dayResult] = await Promise.all([
    admin.from('ai_run').select('id', { count: 'exact', head: true }).eq('auth_user_id', user.id).eq('feature', FEATURE).gte('started_at', minuteAgo),
    admin.from('ai_run').select('id', { count: 'exact', head: true }).eq('auth_user_id', user.id).eq('feature', FEATURE).gte('started_at', dayAgo)
  ])
  if ((minuteResult.count ?? 0) >= runtimeConfig.rateLimitPerMinute || (dayResult.count ?? 0) >= runtimeConfig.rateLimitPerDay) {
    return json({ code: 'rate_limited', message: '特殊作业票预审次数已达到限额，请稍后重试' }, 429)
  }

  const startedAt = Date.now()
  let runId = ''
  try {
    const { data: run, error: runError } = await admin
      .from('ai_run')
      .insert({
        auth_user_id: user.id,
        tenant_id: appUser.tenant_id,
        feature: FEATURE,
        model: RULE_VERSION,
        prompt_version: runtimeConfig.promptVersion,
        metadata: {
          operationTypeCode: draft.operationTypeCode,
          permissionCode,
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

    const assessment = evaluateSpecialOperationPrecheck(draft)
    const { error: finishError } = await admin
      .from('ai_run')
      .update({
        status: 'succeeded',
        latency_ms: Date.now() - startedAt,
        finished_at: new Date().toISOString(),
        metadata: {
          operationTypeCode: draft.operationTypeCode,
          permissionCode,
          decisionMode: 'advisory_only',
          automaticBusinessWrite: false,
          readiness: assessment.readiness,
          score: assessment.score,
          blockerCount: assessment.blockers.length,
          warningCount: assessment.warnings.length
        },
        update_by: appUser.user_email
      })
      .eq('id', runId)
    if (finishError) console.error('special-operation precheck audit update failed', finishError.message)

    return json({ runId, ruleVersion: RULE_VERSION, generatedAt: new Date().toISOString(), assessment })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('ai-smis-special-operation-precheck failed', message)
    if (runId) {
      await admin
        .from('ai_run')
        .update({
          status: 'failed',
          latency_ms: Date.now() - startedAt,
          error_code: 'special_operation_precheck_failed',
          error_message: message.slice(0, 2_000),
          finished_at: new Date().toISOString(),
          update_by: appUser.user_email
        })
        .eq('id', runId)
    }
    return json({ code: 'special_operation_precheck_failed', message: '特殊作业票预审失败，请稍后重试' }, 500)
  }
})
