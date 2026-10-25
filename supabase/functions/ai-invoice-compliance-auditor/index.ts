import { createClient } from 'jsr:@supabase/supabase-js@2'
import { assessInvoiceCompliance } from '../_shared/invoice-compliance-audit-rules.ts'

interface InvoiceAuditRequest {
  invoiceId?: string
}

interface AppUser {
  tenant_id: string
  user_email: string
  status: string | null
}

const FEATURE = 'invoice_compliance_audit'
const RULE_VERSION = 'invoice-compliance-audit-rules-v2'

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

  const body = (await request.json().catch(() => ({}))) as InvoiceAuditRequest
  const invoiceId = text(body.invoiceId)
  if (!isUuid(invoiceId)) {
    return json({ code: 'invalid_invoice_id', message: '缺少有效的发票 ID' }, 400)
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
    return json({ code: 'forbidden', message: '当前用户不可使用 AI 发票合规审核' }, 403)
  }

  const startedAt = Date.now()
  let runId = ''
  try {
    const { data: auditPayload, error: auditPayloadError } = await userClient.rpc(
      'tms_get_invoice_compliance_audit_secure',
      { p_invoice_id: invoiceId }
    )
    if (auditPayloadError) {
      if (auditPayloadError.code === '42501') {
        return json(
          { code: 'invoice_field_permission_denied', message: auditPayloadError.message },
          403
        )
      }
      throw auditPayloadError
    }
    if (!auditPayload || typeof auditPayload !== 'object') {
      return json({ code: 'invoice_not_found', message: '未找到可查看的发票' }, 404)
    }
    const payload = auditPayload as Record<string, unknown>
    const invoice =
      payload.invoice && typeof payload.invoice === 'object'
        ? (payload.invoice as Record<string, unknown>)
        : null
    if (!invoice) return json({ code: 'invoice_not_found', message: '未找到可查看的发票' }, 404)
    const statementLinks = Array.isArray(payload.statementLinks) ? payload.statementLinks : []
    const duplicateInvoices = Array.isArray(payload.duplicateInvoices)
      ? payload.duplicateInvoices
      : []

    const { data: run, error: runError } = await admin
      .from('ai_run')
      .insert({
        auth_user_id: user.id,
        tenant_id: appUser.tenant_id,
        feature: FEATURE,
        model: RULE_VERSION,
        prompt_version: RULE_VERSION,
        metadata: {
          invoiceId,
          decisionMode: 'advisory_only',
          automaticFinancialWrite: false
        },
        create_by: appUser.user_email,
        update_by: appUser.user_email
      })
      .select('id')
      .single()
    if (runError) throw runError
    runId = run.id

    const assessment = assessInvoiceCompliance({
      invoice,
      statementLinks,
      duplicateInvoices
    })

    const { error: finishError } = await admin
      .from('ai_run')
      .update({
        status: 'succeeded',
        latency_ms: Date.now() - startedAt,
        finished_at: new Date().toISOString(),
        metadata: {
          invoiceId,
          decisionMode: 'advisory_only',
          automaticFinancialWrite: false,
          riskLevel: assessment.riskLevel,
          riskScore: assessment.riskScore,
          recommendation: assessment.recommendation,
          signalCount: assessment.signals.length,
          signalTypes: assessment.signals.map((item) => item.type)
        },
        update_by: appUser.user_email
      })
      .eq('id', runId)
    if (finishError) {
      console.error('ai-invoice-compliance-auditor audit update failed', finishError.message)
    }

    return json({
      runId,
      ruleVersion: RULE_VERSION,
      generatedAt: new Date().toISOString(),
      assessment
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('ai-invoice-compliance-auditor failed', message)
    if (runId) {
      const { error: finishError } = await admin
        .from('ai_run')
        .update({
          status: 'failed',
          latency_ms: Date.now() - startedAt,
          error_code: 'invoice_compliance_audit_failed',
          error_message: message.slice(0, 2_000),
          finished_at: new Date().toISOString(),
          update_by: appUser.user_email
        })
        .eq('id', runId)
      if (finishError) {
        console.error('ai-invoice-compliance-auditor audit update failed', finishError.message)
      }
    }
    return json(
      { code: 'invoice_compliance_audit_failed', message: 'AI 发票合规审核失败，请稍后重试' },
      500
    )
  }
})
