import cloudbase from '@cloudbase/js-sdk'
import { readFile } from 'node:fs/promises'

const localEnvironment = await readFile('.env.local', 'utf8')
const publishableKey = localEnvironment.match(/^VITE_CLOUDBASE_PUBLISHABLE_KEY=(.+)$/mu)?.[1]
if (!publishableKey) throw new Error('CloudBase publishable key is missing')

const app = cloudbase.init({
  env: 'art-supabase-staging-d8a9e32316e',
  region: 'ap-shanghai',
  accessKey: publishableKey.trim()
})
const auth = typeof app.auth === 'function' ? app.auth({ persistence: 'none' }) : app.auth
const session = await auth.getSession()
const sessionError = session.error as { code?: string; name?: string; message?: string } | null
const response = await fetch(
  'https://art-supabase-staging-d8a9e32316e-1257156420.ap-shanghai.app.tcloudbase.com/login-migrate',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${publishableKey.trim()}`,
      Origin: 'https://art-supabase-staging-d8a9e32316e-1257156420.tcloudbaseapp.com'
    },
    body: '{}'
  }
)
const responseText = await response.text()
let result: { ok?: boolean; code?: string }
try {
  result = JSON.parse(responseText) as { ok?: boolean; code?: string }
} catch (error) {
  throw new Error(
    `CloudBase public function returned HTTP ${response.status}: ${responseText.slice(0, 120)}`,
    { cause: error }
  )
}
if (response.status !== 400 || result.ok !== false || result.code !== 'invalid_credentials') {
  throw new Error('CloudBase public function probe returned an unexpected response')
}
process.stdout.write(
  `${JSON.stringify({
    publishableKey: 'ok',
    loginBridge: 'ok',
    anonymousSession: {
      hasSession: Boolean(session.data?.session),
      errorCode: sessionError?.code,
      errorName: sessionError?.name,
      errorMessage: sessionError?.message
    }
  })}\n`
)
process.exit(0)
