import { createClient } from 'jsr:@supabase/supabase-js@2'
import { assessReceivablesCollection } from '../_shared/receivables-collection-rules.ts'

interface AppUser {
  tenant_id: string
  user_email: string
  status: string | null
}

const FEATURE = 'receivables_collection_advisor'
const RULE_VERSION = 'receivables-collection-rules-v1'
const ROW_LIMIT = 300

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
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
    return json({ code: 'forbidden', message: '当前用户不可使用 AI 回款风险助手' }, 403)
  }

  const startedAt = Date.now()
  let runId = ''
  try {
    const statementResult = await userClient.rpc(
      'tms_list_customer_statements_receivables_ai_secure',
      { p_limit: ROW_LIMIT }
    )
    if (statementResult.error) throw statementResult.error

    const statementPayload = isRecord(statementResult.data) ? statementResult.data : {}
    const statements = Array.isArray(statementPayload.records)
      ? statementPayload.records.filter(isRecord)
      : []
    const invoiceableStatements = statements.map((row) => ({
      statement_id: row.id,
      direction: 'receivable',
      statement_amount: row.statement_amount,
      invoiced_amount: row.invoiced_amount,
      uninvoiced_amount: row.uninvoiced_amount
    }))

    const { data: run, error: runError } = await admin
      .from('ai_run')
      .insert({
        auth_user_id: user.id,
        tenant_id: appUser.tenant_id,
        feature: FEATURE,
        model: RULE_VERSION,
        prompt_version: RULE_VERSION,
        metadata: {
          scope: 'tenant_receivables',
          rowLimit: ROW_LIMIT,
          decisionMode: 'advisory_only',
          automaticFinancialWrite: false,
          paymentTermSource: 'unavailable'
        },
        create_by: appUser.user_email,
        update_by: appUser.user_email
      })
      .select('id')
      .single()
    if (runError) throw runError
    runId = run.id

    const assessment = assessReceivablesCollection({
      statements,
      invoiceableStatements
    })
    const { error: finishError } = await admin
      .from('ai_run')
      .update({
        status: 'succeeded',
        latency_ms: Date.now() - startedAt,
        finished_at: new Date().toISOString(),
        metadata: {
          scope: 'tenant_receivables',
          decisionMode: 'advisory_only',
          automaticFinancialWrite: false,
          paymentTermSource: 'unavailable',
          riskLevel: assessment.riskLevel,
          riskScore: assessment.riskScore,
          recommendation: assessment.recommendation,
          signalCount: assessment.signals.length,
          openStatementCount: assessment.metrics.openStatementCount,
          outstandingAmount: assessment.metrics.outstandingAmount,
          atRiskAmount: assessment.metrics.atRiskAmount
        },
        update_by: appUser.user_email
      })
      .eq('id', runId)
    if (finishError) {
      console.error('ai-receivables-collection-advisor audit update failed', finishError.message)
    }

    return json({
      runId,
      ruleVersion: RULE_VERSION,
      generatedAt: new Date().toISOString(),
      assessment
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('ai-receivables-collection-advisor failed', message)
    if (runId) {
      const { error: finishError } = await admin
        .from('ai_run')
        .update({
          status: 'failed',
          latency_ms: Date.now() - startedAt,
          error_code: 'receivables_collection_analysis_failed',
          error_message: message.slice(0, 2_000),
          finished_at: new Date().toISOString(),
          update_by: appUser.user_email
        })
        .eq('id', runId)
      if (finishError) {
        console.error('ai-receivables-collection-advisor audit update failed', finishError.message)
      }
    }
    return json(
      {
        code: 'receivables_collection_analysis_failed',
        message: 'AI 回款风险分析失败，请稍后重试'
      },
      500
    )
  }
})
