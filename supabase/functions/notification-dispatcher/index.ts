import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

type JsonRecord = Record<string, unknown>

interface DeliveryJob {
  id: string
  tenantId: string
  recipientUserId: string
  recipientEmail?: string | null
  recipientPhone?: string | null
  channelCode: 'email' | 'sms' | 'dingtalk' | 'wecom'
  title: string
  content: string
  routePath: string
  routeQuery: JsonRecord
  attemptCount: number
  providerCode: string
  config: JsonRecord
  secret: JsonRecord
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-notification-dispatch-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })

const getText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

async function parseProviderResponse(response: Response): Promise<{ externalId: string }> {
  const text = await response.text()
  let payload: JsonRecord = {}
  try {
    payload = text ? (JSON.parse(text) as JsonRecord) : {}
  } catch {
    payload = { raw: text.slice(0, 500) }
  }
  if (!response.ok) {
    throw new Error(
      getText(payload.message) || getText(payload.error) || `渠道返回 HTTP ${response.status}`
    )
  }
  const providerCode = Number(payload.errcode ?? payload.code ?? 0)
  if (Number.isFinite(providerCode) && providerCode !== 0 && providerCode !== 200) {
    throw new Error(getText(payload.errmsg) || getText(payload.message) || `渠道返回 ${providerCode}`)
  }
  return {
    externalId:
      getText(payload.id) || getText(payload.messageId) || getText(payload.msgid) || ''
  }
}

async function createDingTalkWebhookUrl(webhookUrl: string, signSecret: string): Promise<string> {
  if (!signSecret) return webhookUrl
  const timestamp = Date.now().toString()
  const source = `${timestamp}\n${signSecret}`
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(signSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(source))
  const sign = encodeURIComponent(btoa(String.fromCharCode(...new Uint8Array(signature))))
  const separator = webhookUrl.includes('?') ? '&' : '?'
  return `${webhookUrl}${separator}timestamp=${timestamp}&sign=${sign}`
}

async function deliver(job: DeliveryJob): Promise<{ externalId: string }> {
  const config = job.config ?? {}
  const secret = job.secret ?? {}
  if (job.channelCode === 'email') {
    if (!job.recipientEmail) throw new Error('接收人未维护邮箱')
    const apiKey = getText(secret.apiKey)
    const fromEmail = getText(config.fromEmail)
    if (!apiKey || !fromEmail) throw new Error('邮件渠道缺少 API Key 或发件邮箱')
    const senderName = getText(config.senderName)
    const endpoint = getText(config.endpointUrl) || 'https://api.resend.com/emails'
    return await parseProviderResponse(
      await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: senderName ? `${senderName} <${fromEmail}>` : fromEmail,
          to: [job.recipientEmail],
          subject: job.title,
          text: `${job.content}\n\n系统入口：${job.routePath}`
        })
      })
    )
  }

  if (job.channelCode === 'sms') {
    if (!job.recipientPhone) throw new Error('接收人未维护手机号')
    const webhookUrl = getText(secret.webhookUrl)
    if (!webhookUrl) throw new Error('短信渠道缺少服务地址')
    const authorization = getText(secret.authorization)
    return await parseProviderResponse(
      await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authorization ? { Authorization: authorization } : {})
        },
        body: JSON.stringify({
          mobile: job.recipientPhone,
          title: job.title,
          content: job.content,
          deliveryId: job.id,
          templateCode: getText(config.templateCode) || undefined
        })
      })
    )
  }

  if (job.channelCode === 'dingtalk') {
    const webhookUrl = getText(secret.webhookUrl)
    if (!webhookUrl) throw new Error('钉钉渠道缺少机器人 Webhook')
    const signedUrl = await createDingTalkWebhookUrl(webhookUrl, getText(secret.signSecret))
    return await parseProviderResponse(
      await fetch(signedUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msgtype: 'markdown',
          markdown: {
            title: job.title,
            text: `### ${job.title}\n\n${job.content}\n\n系统入口：${job.routePath}`
          }
        })
      })
    )
  }

  const webhookUrl = getText(secret.webhookUrl)
  if (!webhookUrl) throw new Error('企业微信渠道缺少机器人 Webhook')
  return await parseProviderResponse(
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msgtype: 'markdown',
        markdown: { content: `### ${job.title}\n${job.content}\n系统入口：${job.routePath}` }
      })
    })
  )
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return json({ error: 'Server not configured' }, 500)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const cronToken = request.headers.get('x-notification-dispatch-token')?.trim() || ''
  let tenantScope: string | null = null

  if (cronToken) {
    const { data: validToken, error: tokenError } = await admin.rpc(
      'verify_notification_dispatch_token',
      { p_token: cronToken }
    )
    if (tokenError || validToken !== true) return json({ error: 'Invalid dispatch token' }, 401)
  } else {
    const authorization = request.headers.get('authorization')
    if (!authorization) return json({ error: 'Missing authorization' }, 401)
    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authorization } }
    })
    const { data: scope, error: scopeError } = await userClient.rpc(
      'get_notification_dispatch_scope'
    )
    if (scopeError || !scope) return json({ error: 'Dispatch permission denied' }, 403)
    tenantScope = String(scope)
  }

  const requestBody = (await request.json().catch(() => ({}))) as JsonRecord
  const limit = Math.min(Math.max(Number(requestBody.limit) || 50, 1), 200)
  const { data, error } = await admin.rpc('claim_notification_deliveries', {
    p_limit: limit,
    p_tenant_id: tenantScope
  })
  if (error) return json({ error: 'Unable to claim deliveries', detail: error.message }, 500)

  const jobs = Array.isArray(data) ? (data as DeliveryJob[]) : []
  let deliveredCount = 0
  let failedCount = 0
  for (const job of jobs) {
    try {
      const result = await deliver(job)
      const { error: finishError } = await admin.rpc('finish_notification_delivery', {
        p_delivery_id: job.id,
        p_succeeded: true,
        p_external_message_id: result.externalId || null,
        p_error_message: null,
        p_skipped: false
      })
      if (finishError) throw finishError
      deliveredCount += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const skipped = message.includes('未维护')
      await admin.rpc('finish_notification_delivery', {
        p_delivery_id: job.id,
        p_succeeded: false,
        p_external_message_id: null,
        p_error_message: message,
        p_skipped: skipped
      })
      failedCount += 1
    }
  }

  return json({ claimedCount: jobs.length, deliveredCount, failedCount })
})

