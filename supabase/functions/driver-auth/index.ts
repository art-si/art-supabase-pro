import { createClient } from "npm:@supabase/supabase-js@2.45.4"

type SysUserRow = {
  user_email: string | null
  user_phone: string | null
  tenant_id: string | null
  auth_user_id: string | null
  status: string | null
  create_time?: string | null
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || readKeyMap("SUPABASE_SECRET_KEYS")
const PUBLISHABLE_KEY = Deno.env.get("SUPABASE_ANON_KEY") || readKeyMap("SUPABASE_PUBLISHABLE_KEYS")

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })
const authClient = createClient(SUPABASE_URL, PUBLISHABLE_KEY, { auth: { persistSession: false } })

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
}

function readKeyMap(name: string) {
  const raw = Deno.env.get(name)
  if (!raw) return ""
  try {
    return JSON.parse(raw).default || ""
  } catch {
    return ""
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders })
}

function normalizePhone(value: string) {
  return value.replace(/[^0-9]/g, "")
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

async function readBody(req: Request) {
  try {
    return await req.json()
  } catch {
    return {}
  }
}

async function signInWithPassword(email: string, password: string) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: PUBLISHABLE_KEY,
      Authorization: `Bearer ${PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ email, password }),
  })

  const data = await response.json().catch(() => ({}))
  return { ok: response.ok, status: response.status, data }
}

async function getCandidateUsersByPhone(phone: string) {
  const { data: users, error } = await admin
    .from("sys_user")
    .select("user_email,user_phone,tenant_id,auth_user_id,status,create_time")
    .eq("user_phone", phone)
    .order("create_time", { ascending: false })

  if (error) throw error

  return ((users || []) as SysUserRow[]).filter((user) => {
    return user.user_email && (!user.status || ["1", "enabled", "active", "normal"].includes(user.status))
  })
}

async function resolveEmails(account: string) {
  const normalized = account.trim()
  if (isEmail(normalized)) return [normalized]

  const phone = normalizePhone(normalized)
  if (!phone || phone.length < 6) return []

  const users = await getCandidateUsersByPhone(phone)
  return Array.from(new Set(users.map((user) => user.user_email).filter(Boolean))) as string[]
}

async function passwordLogin(account: string, password: string) {
  if (!account || !password) return json({ ok: false, error: "账号和密码不能为空" }, 400)

  const emails = await resolveEmails(account)
  if (emails.length === 0) return json({ ok: false, error: "账号或密码错误" }, 400)

  let lastError: unknown = null
  for (const email of emails) {
    const result = await signInWithPassword(email, password)
    if (result.ok) return json(result.data)
    lastError = result.data
  }

  console.warn("driver password login failed", { accountType: isEmail(account) ? "email" : "phone", emails, lastError })
  return json({ ok: false, error: "账号或密码错误" }, 400)
}

async function getWechatAccessToken() {
  const appId = Deno.env.get("WECHAT_MP_APPID")
  const secret = Deno.env.get("WECHAT_MP_SECRET")
  if (!appId || !secret) throw new Error("未配置 WECHAT_MP_APPID / WECHAT_MP_SECRET")

  const url = new URL("https://api.weixin.qq.com/cgi-bin/token")
  url.searchParams.set("grant_type", "client_credential")
  url.searchParams.set("appid", appId)
  url.searchParams.set("secret", secret)

  const response = await fetch(url)
  const data = await response.json()
  if (!response.ok || !data.access_token) throw new Error(data.errmsg || "获取微信 access_token 失败")
  return data.access_token as string
}

async function getWechatPhoneNumber(phoneCode: string) {
  const accessToken = await getWechatAccessToken()
  const response = await fetch(
    `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: phoneCode }),
    },
  )
  const data = await response.json()
  const phone = data?.phone_info?.phoneNumber || data?.phone_info?.purePhoneNumber
  if (!response.ok || !phone) throw new Error(data.errmsg || "获取微信手机号失败")
  return normalizePhone(String(phone))
}

async function createPasswordlessSession(email: string) {
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  })
  if (linkError) throw linkError

  const tokenHash = linkData.properties?.hashed_token
  if (!tokenHash) throw new Error("生成登录令牌失败")

  const { data, error } = await authClient.auth.verifyOtp({
    type: "email",
    token_hash: tokenHash,
  })
  if (error) throw error
  if (!data.session) throw new Error("创建登录会话失败")
  return data.session
}

async function wechatPhoneLogin(phoneCode: string) {
  if (!phoneCode) return json({ ok: false, error: "缺少微信手机号授权 code" }, 400)

  const phone = await getWechatPhoneNumber(phoneCode)
  const users = await getCandidateUsersByPhone(phone)
  const emails = Array.from(new Set(users.map((user) => user.user_email).filter(Boolean))) as string[]

  if (emails.length === 0) return json({ ok: false, error: "该手机号未绑定司机账号" }, 404)
  if (emails.length > 1) {
    return json({ ok: false, error: "该手机号绑定多个账号，请使用手机号密码登录" }, 409)
  }

  const session = await createPasswordlessSession(emails[0])
  return json(session)
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders })
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405)

  try {
    const body = await readBody(req)
    if (body.type === "wechat-phone") return await wechatPhoneLogin(String(body.phoneCode || ""))
    return await passwordLogin(String(body.account || ""), String(body.password || ""))
  } catch (error) {
    const message = error instanceof Error ? error.message : "登录失败"
    console.error("driver-auth error", message)
    return json({ ok: false, error: message }, 500)
  }
})
