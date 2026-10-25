import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { resolveAiProviderEndpoints } from 'https://raw.githubusercontent.com/869123771/art-supabase-pro/e1297b558a4856b89910d9991d397e22fb7a992a/supabase/functions/_shared/ai-provider-endpoints.ts'
import {
  inferAiBankBatchMapping,
  normalizeAiBankBatchRows,
  type AiBankBatchColumn,
  type AiBankCounterparty
} from '../_shared/ai-bank-statement-batch-contract.ts'
import type { AiCashVoucherStatementCandidate } from '../_shared/ai-cash-voucher-ocr-contract.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseJson(value: string): Record<string, unknown> | null {
  try {
    return JSON.parse(value.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, ''))
  } catch {
    return null
  }
}

async function aiHeaderMapping(headers: string[], samples: Record<string, unknown>[]) {
  const fallback = inferAiBankBatchMapping(headers)
  const endpoints = resolveAiProviderEndpoints(
    {
      model:
        Deno.env.get('AI_BANK_STATEMENT_BATCH_MODEL') || Deno.env.get('AI_MODEL') || 'gpt-4.1-mini',
      fallbackModel: null
    },
    { openAiModel: Deno.env.get('OPENAI_MODEL') }
  )
  const endpoint = endpoints[0]
  if (!endpoint)
    return { mapping: fallback, model: 'deterministic-header-mapper-v1', usedAi: false }

  const fields: AiBankBatchColumn[] = [
    'transactionDate',
    'amount',
    'receiptAmount',
    'paymentAmount',
    'direction',
    'bankReference',
    'counterpartyName',
    'payerName',
    'payeeName',
    'paymentMethod',
    'remark'
  ]
  const response = await fetch(`${endpoint.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${endpoint.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: endpoint.model,
      temperature: 0,
      max_tokens: 700,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            '你是银行流水表头映射助手。只能返回 JSON，不得编造不存在的表头。mapping 的键只能来自 allowedFields，值必须来自 headers；无法判断的字段不要输出。'
        },
        {
          role: 'user',
          content: JSON.stringify({ headers, allowedFields: fields, samples: samples.slice(0, 3) })
        }
      ]
    })
  })
  if (!response.ok) return { mapping: fallback, model: endpoint.model, usedAi: false }
  const payload = await response.json()
  const parsed = parseJson(String(payload?.choices?.[0]?.message?.content ?? ''))
  const proposed = isRecord(parsed?.mapping) ? parsed.mapping : {}
  const safeMapping = { ...fallback } as Partial<Record<AiBankBatchColumn, string>>
  for (const field of fields) {
    const header = proposed[field]
    if (typeof header === 'string' && headers.includes(header)) safeMapping[field] = header
  }
  return { mapping: safeMapping, model: endpoint.model, usedAi: true }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST')
    return json({ code: 'method_not_allowed', message: 'Method not allowed' }, 405)
  const startedAt = Date.now()
  let runId: string | null = null
  let admin: ReturnType<typeof createClient> | null = null
  try {
    const authHeader = req.headers.get('Authorization')
    const url = Deno.env.get('SUPABASE_URL') ?? ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!authHeader || !url || !anonKey || !serviceKey)
      return json({ code: 'unauthorized', message: '需要登录后使用批量流水匹配' }, 401)
    const authClient = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } }
    })
    const token = authHeader.replace(/^Bearer\s+/i, '')
    const { data: authData, error: authError } = await authClient.auth.getUser(token)
    if (authError || !authData.user)
      return json({ code: 'unauthorized', message: '登录状态已失效' }, 401)
    admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
    const { data: appUser } = await admin
      .from('sys_user')
      .select('tenant_id,user_email,status')
      .eq('auth_user_id', authData.user.id)
      .maybeSingle()
    if (!appUser?.tenant_id || appUser.status === '0')
      return json({ code: 'forbidden', message: '当前账号无权使用批量流水匹配' }, 403)
    const body = await req.json()

    if (body.action === 'commit') {
      const { data, error } = await authClient.rpc('commit_ai_bank_statement_batch', {
        p_artifact_id: body.artifactId,
        p_rows: body.rows
      })
      if (error) return json({ code: 'commit_failed', message: error.message }, 400)
      return json(data)
    }

    const rows = Array.isArray(body.rows) ? body.rows.filter(isRecord).slice(0, 300) : []
    if (!rows.length)
      return json({ code: 'invalid_rows', message: '请导入包含表头和流水数据的 Excel 文件' }, 400)
    if (JSON.stringify(rows).length > 1_200_000)
      return json({ code: 'file_too_large', message: '单次导入内容过大，请拆分后重试' }, 400)
    const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))].slice(0, 80)
    const mappingResult = await aiHeaderMapping(headers, rows)

    const [
      { data: customers },
      { data: carriers },
      customerStatementResult,
      carrierStatementResult,
      existingReferenceResult,
      { data: threshold }
    ] = await Promise.all([
      admin
        .from('mdm_customer')
        .select('id,customer_name')
        .eq('tenant_id', appUser.tenant_id)
        .limit(2000),
      admin
        .from('mdm_carrier')
        .select('id,company_name')
        .eq('tenant_id', appUser.tenant_id)
        .limit(2000),
      authClient.rpc('tms_list_customer_statement_allocatable_secure', {
        p_customer_id: null,
        p_keyword: null,
        p_from: 0,
        p_to: 499
      }),
      authClient.rpc('tms_list_carrier_statement_allocatable_secure', {
        p_carrier_id: null,
        p_keyword: null,
        p_from: 0,
        p_to: 499
      }),
      authClient.rpc('tms_list_cash_bank_references_ai_secure', { p_limit: 5000 }),
      admin
        .from('ai_ocr_quality_threshold')
        .select('review_confidence_threshold')
        .eq('tenant_id', appUser.tenant_id)
        .eq('feature', 'bank_statement_batch_match')
        .maybeSingle()
    ])
    const customerStatementPayload = isRecord(customerStatementResult.data)
      ? customerStatementResult.data
      : {}
    const carrierStatementPayload = isRecord(carrierStatementResult.data)
      ? carrierStatementResult.data
      : {}
    if (customerStatementResult.error) throw customerStatementResult.error
    if (carrierStatementResult.error) throw carrierStatementResult.error
    if (existingReferenceResult.error) throw existingReferenceResult.error
    const existingReferences = Array.isArray(existingReferenceResult.data)
      ? existingReferenceResult.data
      : []
    const customerStatements = Array.isArray(customerStatementPayload.records)
      ? customerStatementPayload.records
      : []
    const carrierStatements = Array.isArray(carrierStatementPayload.records)
      ? carrierStatementPayload.records
      : []
    const counterparties: AiBankCounterparty[] = [
      ...(customers ?? []).map((item) => ({
        id: item.id,
        name: item.customer_name,
        direction: 'receipt' as const
      })),
      ...(carriers ?? []).map((item) => ({
        id: item.id,
        name: item.company_name,
        direction: 'payment' as const
      }))
    ]
    const statementCandidates: AiCashVoucherStatementCandidate[] = [
      ...(customerStatements ?? []).map((row) => ({
        statementId: row.id,
        statementNo: row.statement_no,
        counterpartyId: row.customer_id,
        counterpartyName: row.customer_name,
        periodStart: row.period_start,
        periodEnd: row.period_end,
        statementAmount: Number(row.statement_amount),
        settledAmount: Number(row.settled_amount),
        outstandingAmount: Number(row.outstanding_amount),
        createTime: row.create_time
      })),
      ...(carrierStatements ?? []).map((row) => ({
        statementId: row.id,
        statementNo: row.statement_no,
        counterpartyId: row.carrier_id,
        counterpartyName: row.carrier_name,
        periodStart: row.period_start,
        periodEnd: row.period_end,
        statementAmount: Number(row.statement_amount),
        settledAmount: Number(row.settled_amount),
        outstandingAmount: Number(row.outstanding_amount),
        createTime: row.create_time
      }))
    ]
    const normalizedRows = normalizeAiBankBatchRows(rows, {
      mapping: mappingResult.mapping,
      counterparties,
      statementCandidates,
      existingReferences: new Set(
        existingReferences.map((row) => `${row.direction}:${row.bank_reference}`)
      )
    })
    const summary = normalizedRows.reduce(
      (acc, row) => {
        acc[row.status] = (acc[row.status] ?? 0) + 1
        return acc
      },
      {} as Record<string, number>
    )
    const confidence = normalizedRows.length
      ? normalizedRows.reduce((sum, row) => sum + Math.min(1, row.counterpartyScore / 100), 0) /
        normalizedRows.length
      : 0
    const { data: run, error: runError } = await admin
      .from('ai_run')
      .insert({
        auth_user_id: authData.user.id,
        tenant_id: appUser.tenant_id,
        feature: 'bank_statement_batch_match',
        model: mappingResult.model,
        prompt_version: 'v1',
        status: 'succeeded',
        latency_ms: Date.now() - startedAt,
        finished_at: new Date().toISOString(),
        metadata: {
          rowCount: rows.length,
          fileName: String(body.fileName ?? ''),
          usedAi: mappingResult.usedAi
        },
        create_by: appUser.user_email,
        update_by: appUser.user_email
      })
      .select('id')
      .single()
    if (runError) throw runError
    runId = run.id
    const { data: artifact, error: artifactError } = await admin
      .from('ai_artifact_review')
      .insert({
        ai_run_id: run.id,
        auth_user_id: authData.user.id,
        tenant_id: appUser.tenant_id,
        feature: 'bank_statement_batch_match',
        artifact_type: 'tms_bank_statement_batch',
        proposed_payload: { mapping: mappingResult.mapping, rows: normalizedRows },
        confidence,
        field_confidence: { headerMapping: mappingResult.usedAi ? 0.9 : 0.72 },
        warnings: normalizedRows.flatMap((row) => row.issues).slice(0, 50),
        metadata: {
          rowCount: rows.length,
          fileName: String(body.fileName ?? ''),
          summary,
          reviewConfidenceThreshold: Number(threshold?.review_confidence_threshold ?? 0.82)
        },
        create_by: appUser.user_email,
        update_by: appUser.user_email
      })
      .select('id')
      .single()
    if (artifactError) throw artifactError
    return json({
      artifactId: artifact.id,
      runId,
      generatedAt: new Date().toISOString(),
      mapping: mappingResult.mapping,
      usedAi: mappingResult.usedAi,
      confidence,
      reviewConfidenceThreshold: Number(threshold?.review_confidence_threshold ?? 0.82),
      summary,
      rows: normalizedRows
    })
  } catch (error) {
    console.error('bank statement batch match error', error)
    if (admin && runId)
      await admin
        .from('ai_run')
        .update({
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown error',
          finished_at: new Date().toISOString()
        })
        .eq('id', runId)
    return json(
      {
        code: 'server_error',
        message: error instanceof Error ? error.message : 'AI 银行流水匹配失败'
      },
      500
    )
  }
})

