import { createClient } from 'jsr:@supabase/supabase-js@2'
import { recommendDispatchResources } from '../_shared/dispatch-recommendation-rules.ts'

interface DispatchAdvisorRequest {
  orderId?: string
  limit?: number
}

interface AppUser {
  tenant_id: string
  user_email: string
  status: string | null
}

const FEATURE = 'dispatch_recommendation'
const RULE_VERSION = 'dispatch-rules-v1'
const HISTORY_DAYS = 180
const MAX_VEHICLES = 500
const MAX_HISTORY_ROWS = 2_000

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

function integer(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.trunc(parsed))) : fallback
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

  const body = (await request.json().catch(() => ({}))) as DispatchAdvisorRequest
  const orderId = text(body.orderId)
  if (!isUuid(orderId)) {
    return json({ code: 'invalid_order_id', message: '缺少有效的待调度订单 ID' }, 400)
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
    return json({ code: 'forbidden', message: '当前用户不可使用 AI 调度推荐' }, 403)
  }

  const startedAt = Date.now()
  let runId = ''
  try {
    const historyStart = new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString()
    const { data: contextData, error: contextError } = await userClient.rpc(
      'tms_get_dispatch_recommendation_context_secure',
      {
        p_order_id: orderId,
        p_history_from: historyStart,
        p_max_vehicles: MAX_VEHICLES,
        p_max_history: MAX_HISTORY_ROWS
      }
    )
    if (contextError) throw contextError
    const context = (contextData ?? null) as Record<string, unknown> | null
    const order = (context?.order ?? null) as Record<string, unknown> | null
    if (!order) return json({ code: 'order_not_found', message: '未找到可查看的订单' }, 404)
    if (order.dispatch_status !== 'pending') {
      return json({ code: 'already_dispatched', message: '该订单已配载，请刷新列表后重试' }, 409)
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
          orderId,
          historyDays: HISTORY_DAYS,
          decisionMode: 'advisory_only'
        },
        create_by: appUser.user_email,
        update_by: appUser.user_email
      })
      .select('id')
      .single()
    if (runError) throw runError
    runId = run.id

    const vehicleRows = Array.isArray(context.vehicles)
      ? (context.vehicles as Array<Record<string, unknown>>)
      : []
    const activeAssignments = Array.isArray(context.active_assignments)
      ? (context.active_assignments as Array<Record<string, unknown>>)
      : []
    const history = Array.isArray(context.history)
      ? (context.history as Array<Record<string, unknown>>)
      : []
    const sourceVehicleCount = Number(context.vehicle_count ?? vehicleRows.length)

    const result = recommendDispatchResources({
      order: order as Record<string, unknown>,
      vehicles: vehicleRows,
      activeAssignments,
      history,
      limit: integer(body.limit, 5, 1, 10)
    })

    const { error: finishError } = await admin
      .from('ai_run')
      .update({
        status: 'succeeded',
        latency_ms: Date.now() - startedAt,
        finished_at: new Date().toISOString(),
        metadata: {
          orderId,
          historyDays: HISTORY_DAYS,
          decisionMode: 'advisory_only',
          evaluatedVehicles: result.evaluatedVehicles,
          eligibleVehicles: result.eligibleVehicles,
          recommendationCount: result.recommendations.length,
          sourceVehicleCount,
          sourceTruncated: sourceVehicleCount > MAX_VEHICLES
        },
        update_by: appUser.user_email
      })
      .eq('id', runId)
    if (finishError) console.error('ai-dispatch-advisor audit update failed', finishError.message)

    return json({
      runId,
      ruleVersion: RULE_VERSION,
      generatedAt: new Date().toISOString(),
      order: {
        id: order.id,
        orderNo: order.order_no,
        originStation: order.origin_station,
        destinationStation: order.destination_station
      },
      summary: result.recommendations.length
        ? `已从 ${result.evaluatedVehicles} 辆候选车辆中生成 ${result.recommendations.length} 条推荐`
        : '当前没有同时满足车辆、司机、载重和占用条件的候选资源',
      ...result
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('ai-dispatch-advisor failed', message)
    if (runId) {
      const { error: finishError } = await admin
        .from('ai_run')
        .update({
          status: 'failed',
          latency_ms: Date.now() - startedAt,
          error_code: 'dispatch_advisor_failed',
          error_message: message.slice(0, 2_000),
          finished_at: new Date().toISOString(),
          update_by: appUser.user_email
        })
        .eq('id', runId)
      if (finishError) console.error('ai-dispatch-advisor audit update failed', finishError.message)
    }
    return json(
      { code: 'dispatch_advisor_failed', message: 'AI 调度推荐生成失败，请稍后重试' },
      500
    )
  }
})
