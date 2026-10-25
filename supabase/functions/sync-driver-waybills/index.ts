import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

type SysUser = {
  id: string
  auth_user_id: string | null
  tenant_id: string
  user_name: string | null
  nick_name: string | null
  user_phone: string | null
  user_email: string | null
  status: string | null
}

type Driver = {
  id: string
  tenant_id: string
  carrier_id: string | null
  driver_name: string | null
  phone: string | null
  enabled: boolean | null
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || readKeyMap('SUPABASE_SECRET_KEYS')

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
}

function readKeyMap(name: string) {
  const raw = Deno.env.get(name)
  if (!raw) return ''
  try {
    return JSON.parse(raw).default || ''
  } catch {
    return ''
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders })
}

function getBearer(req: Request) {
  const header = req.headers.get('authorization') || ''
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
}

function getStringMeta(source: Record<string, unknown> | undefined, keys: string[]) {
  if (!source) return ''
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function getAuthPhone(authUser: {
  phone?: string
  user_metadata?: Record<string, unknown>
  app_metadata?: Record<string, unknown>
}) {
  return (
    authUser.phone ||
    getStringMeta(authUser.user_metadata, ['phone', 'user_phone', 'mobile', 'tel']) ||
    getStringMeta(authUser.app_metadata, ['phone', 'user_phone', 'mobile', 'tel'])
  )
}

async function getCurrentUser(req: Request) {
  const token = getBearer(req)
  if (!token) throw new Error('缺少登录凭证')
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) throw new Error('登录已失效，请重新登录')
  return data.user
}

async function getSysUser(authUser: { id: string; email?: string; phone?: string }) {
  const filters = [
    `auth_user_id.eq.${authUser.id}`,
    authUser.email ? `user_email.eq.${authUser.email}` : '',
    authUser.phone ? `user_phone.eq.${authUser.phone}` : ''
  ].filter(Boolean)

  const { data, error } = await admin
    .from('sys_user')
    .select('id,auth_user_id,tenant_id,user_name,nick_name,user_phone,user_email,status')
    .or(filters.join(','))
    .order('create_time', { ascending: false })
    .limit(1)

  if (error) throw error
  const user = (data || [])[0] as SysUser | undefined
  if (!user) throw new Error('当前账号未绑定系统用户')
  return user
}

async function getDriver(
  user: SysUser,
  authUser: {
    phone?: string
    user_metadata?: Record<string, unknown>
    app_metadata?: Record<string, unknown>
  }
) {
  const phone = user.user_phone || getAuthPhone(authUser)
  if (!phone) throw new Error('当前账号未绑定手机号')

  const { data, error } = await admin
    .from('mdm_driver')
    .select('id,tenant_id,carrier_id,driver_name,phone,enabled,create_time')
    .eq('tenant_id', user.tenant_id)
    .eq('phone', phone)
    .eq('enabled', true)
    .order('create_time', { ascending: false })
    .limit(1)

  if (error) throw error
  const driver = (data || [])[0] as Driver | undefined
  if (!driver) throw new Error('当前手机号未绑定启用的司机档案')
  return driver
}

async function getDriverWaybills(driver: Driver) {
  const { data, error } = await admin
    .from('tms_waybill')
    .select('waybill_no,status,create_time')
    .eq('tenant_id', driver.tenant_id)
    .eq('driver_id', driver.id)
    .order('create_time', { ascending: false })

  if (error) throw error
  return data || []
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)

  try {
    const authUser = await getCurrentUser(req)
    const sysUser = await getSysUser({
      id: authUser.id,
      email: authUser.email || undefined,
      phone: authUser.phone || undefined
    })
    const driver = await getDriver(sysUser, authUser)
    const waybills = await getDriverWaybills(driver)

    return json({
      ok: true,
      synced: waybills.length,
      waybillNos: waybills.map((row) => row.waybill_no)
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '同步运单失败'
    console.error('sync-driver-waybills error', message)
    return json({ ok: false, error: message }, 500)
  }
})

