import { createClient } from 'jsr:@supabase/supabase-js@2'
import { assessCarrierPerformance } from '../_shared/carrier-performance-rules.ts'

interface CarrierPerformanceRequest {
  carrierId?: string
}

interface AppUser {
  tenant_id: string
  user_email: string
  status: string | null
}

interface CarrierPerformanceContext {
  carrier?: Record<string, unknown>
  statements?: Array<Record<string, unknown>>
  driver_count?: number
  vehicle_count?: number
}

const FEATURE = 'carrier_performance_advisor'
const RULE_VERSION = 'carrier-performance-rules-v1'
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

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') {
    return json({ code: 'method_not_allowed', message: 'Method not allowed' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const authHeader = request.headers.get('Authorization') ?? ''
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authHeader) {
    return json({ code: 'unauthorized', message: 'Authentication required' }, 401)
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
  const token = authHeader.replace(/^Bearer\s+/i, '')
  const {
    data: { user },
    error: authError
  } = await authClient.auth.getUser(token)
  if (authError || !user) return json({ code: 'unauthorized', message: 'Invalid session' }, 401)

  const body = (await request.json().catch(() => ({}))) as CarrierPerformanceRequest
  const carrierId = text(body.carrierId)
  if (!isUuid(carrierId)) {
    return json({ code: 'invalid_carrier_id', message: '缺少有效的承运商 ID' }, 400)
  }

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
    return json({ code: 'forbidden', message: '当前用户不可使用 AI 承运商经营评估' }, 403)
  }

  const startedAt = Date.now()
  let runId = ''
  try {
    const [contextResult, waybillResult, costResult] = await Promise.all([
      userClient.rpc('tms_get_carrier_performance_context_secure', {
        p_carrier_id: carrierId
      }),
      userClient.rpc('tms_list_carrier_waybills_secure', {
        p_carrier_id: carrierId,
        p_limit: 200
      }),
      userClient.rpc('tms_list_carrier_cost_ai_evidence_secure', {
        p_carrier_id: carrierId,
        p_limit: 300
      })
    ])
    const evidenceError = [contextResult.error, waybillResult.error, costResult.error].find(Boolean)
    if (evidenceError) throw evidenceError

    const context =
      contextResult.data && typeof contextResult.data === 'object'
        ? (contextResult.data as CarrierPerformanceContext)
        : null
    const carrier = context?.carrier
    if (!carrier) {
      return json({ code: 'carrier_not_found', message: '未找到可查看的承运商档案' }, 404)
    }

    const { data: run, error: runError } = await admin
      .from('ai_run')
      .insert({
        auth_user_id: user.id,
        tenant_id: appUser.tenant_id,
        feature: FEATURE,
        model: RULE_VERSION,
        prompt_version: RULE_VERSION,
        metadata: {
          carrierId,
          carrierCode: carrier.carrier_code,
          companyName: carrier.company_name,
          decisionMode: 'advisory_only',
          automaticCarrierWrite: false
        },
        create_by: appUser.user_email,
        update_by: appUser.user_email
      })
      .select('id')
      .single()
    if (runError) throw runError
    runId = run.id

    const secureWaybillResult =
      waybillResult.data && typeof waybillResult.data === 'object'
        ? (waybillResult.data as Record<string, unknown>)
        : {}
    const waybills = Array.isArray(secureWaybillResult.records)
      ? (secureWaybillResult.records as Array<Record<string, unknown>>)
      : []

    const assessment = assessCarrierPerformance({
      carrier,
      waybills,
      costs: costResult.data ?? [],
      statements: context.statements ?? [],
      driverCount: context.driver_count ?? 0,
      vehicleCount: context.vehicle_count ?? 0
    })
    const { error: finishError } = await admin
      .from('ai_run')
      .update({
        status: 'succeeded',
        latency_ms: Date.now() - startedAt,
        finished_at: new Date().toISOString(),
        metadata: {
          carrierId,
          carrierCode: carrier.carrier_code,
          companyName: carrier.company_name,
          decisionMode: 'advisory_only',
          automaticCarrierWrite: false,
          riskLevel: assessment.riskLevel,
          riskScore: assessment.riskScore,
          performanceScore: assessment.performanceScore,
          cooperationStrategy: assessment.cooperationStrategy,
          signalCount: assessment.signals.length,
          sampleCount: assessment.metrics.waybillCount
        },
        update_by: appUser.user_email
      })
      .eq('id', runId)
    if (finishError) {
      console.error('ai-carrier-performance-advisor audit update failed', finishError.message)
    }

    return json({
      runId,
      ruleVersion: RULE_VERSION,
      generatedAt: new Date().toISOString(),
      assessment
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('ai-carrier-performance-advisor failed', message)
    if (runId) {
      const { error: finishError } = await admin
        .from('ai_run')
        .update({
          status: 'failed',
          latency_ms: Date.now() - startedAt,
          error_code: 'carrier_performance_advisor_failed',
          error_message: message.slice(0, 2_000),
          finished_at: new Date().toISOString(),
          update_by: appUser.user_email
        })
        .eq('id', runId)
      if (finishError) {
        console.error('ai-carrier-performance-advisor audit update failed', finishError.message)
      }
    }
    return json(
      {
        code: 'carrier_performance_advisor_failed',
        message: 'AI 承运商经营评估失败，请稍后重试'
      },
      500
    )
  }
})
