import { createClient } from 'jsr:@supabase/supabase-js@2'
import { assessTransportAnomaly } from '../_shared/transport-anomaly-rules.ts'

interface TransportAnomalyAdvisorRequest {
  orderId?: string
}

interface AppUser {
  tenant_id: string
  user_email: string
  status: string | null
}

const FEATURE = 'transport_anomaly_advisor'
const RULE_VERSION = 'transport-anomaly-rules-v1'

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
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  )
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

  const body = (await request.json().catch(() => ({}))) as TransportAnomalyAdvisorRequest
  const orderId = text(body.orderId)
  if (!isUuid(orderId)) {
    return json({ code: 'invalid_order_id', message: '缺少有效的运输订单 ID' }, 400)
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
    return json({ code: 'forbidden', message: '当前用户不可使用 AI 运输异常研判' }, 403)
  }

  const startedAt = Date.now()
  let runId = ''
  try {
    const { data: order, error: orderError } = await userClient
      .from('tms_order')
      .select(
        'id,order_no,order_status,dispatch_status,origin_station,destination_station,planned_departure_time,planned_arrival_time,dispatch_vehicle_id,dispatch_driver_id,dispatch_plate_no,dispatch_driver_name,update_time'
      )
      .eq('id', orderId)
      .maybeSingle()
    if (orderError) throw orderError
    if (!order) return json({ code: 'order_not_found', message: '未找到可查看的运输订单' }, 404)

    const { data: waybillRows, error: waybillError } = await userClient
      .from('tms_waybill')
      .select('id,status,vehicle_id,driver_id,planned_load_time,planned_unload_time,update_time')
      .eq('order_id', orderId)
      .order('update_time', { ascending: false, nullsFirst: false })
      .limit(1)
    if (waybillError) throw waybillError
    const waybill = waybillRows?.[0] ?? null

    const { data: run, error: runError } = await admin
      .from('ai_run')
      .insert({
        auth_user_id: user.id,
        tenant_id: appUser.tenant_id,
        feature: FEATURE,
        model: RULE_VERSION,
        prompt_version: RULE_VERSION,
        metadata: {
          orderId,
          decisionMode: 'advisory_only',
          gpsTelemetryAvailable: false
        },
        create_by: appUser.user_email,
        update_by: appUser.user_email
      })
      .select('id')
      .single()
    if (runError) throw runError
    runId = run.id

    const assessment = assessTransportAnomaly({
      ...order,
      waybill_status: waybill?.status,
      vehicle_id: waybill?.vehicle_id,
      driver_id: waybill?.driver_id,
      planned_load_time: waybill?.planned_load_time,
      planned_unload_time: waybill?.planned_unload_time,
      waybill_update_time: waybill?.update_time
    })

    const { error: finishError } = await admin
      .from('ai_run')
      .update({
        status: 'succeeded',
        latency_ms: Date.now() - startedAt,
        finished_at: new Date().toISOString(),
        metadata: {
          orderId,
          decisionMode: 'advisory_only',
          gpsTelemetryAvailable: false,
          riskLevel: assessment.riskLevel,
          riskScore: assessment.riskScore,
          signalCount: assessment.signals.length,
          signalTypes: assessment.signals.map((item) => item.type)
        },
        update_by: appUser.user_email
      })
      .eq('id', runId)
    if (finishError) {
      console.error('ai-transport-anomaly-advisor audit update failed', finishError.message)
    }

    return json({
      runId,
      ruleVersion: RULE_VERSION,
      generatedAt: new Date().toISOString(),
      assessment
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('ai-transport-anomaly-advisor failed', message)
    if (runId) {
      const { error: finishError } = await admin
        .from('ai_run')
        .update({
          status: 'failed',
          latency_ms: Date.now() - startedAt,
          error_code: 'transport_anomaly_advisor_failed',
          error_message: message.slice(0, 2_000),
          finished_at: new Date().toISOString(),
          update_by: appUser.user_email
        })
        .eq('id', runId)
      if (finishError) {
        console.error('ai-transport-anomaly-advisor audit update failed', finishError.message)
      }
    }
    return json(
      { code: 'transport_anomaly_advisor_failed', message: 'AI 运输异常研判失败，请稍后重试' },
      500
    )
  }
})
