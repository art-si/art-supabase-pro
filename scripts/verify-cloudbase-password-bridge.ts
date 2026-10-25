import cloudbase from '@cloudbase/js-sdk'
import { createClient } from '@supabase/supabase-js'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const ENVIRONMENT_ID = 'art-supabase-staging-d8a9e32316e'
const TCB =
  'C:/Users/EDY/AppData/Local/npm-cache/_npx/88bda5ef0319b729/node_modules/@cloudbase/cli/bin/tcb'

const parseEnv = (content: string, key: string): string => {
  const value = content.match(new RegExp(`^\\s*${key}\\s*=\\s*(.+)$`, 'mu'))?.[1]?.trim()
  if (!value) throw new Error(`${key} is missing`)
  return value.replace(/^(['"])(.*)\1$/u, '$2')
}

const runTcb = (args: string[], confirmation?: string) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [path.resolve(TCB), ...args], {
      windowsHide: true,
      stdio: ['pipe', 'ignore', 'pipe']
    })
    let stderr = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => (stderr += chunk))
    if (confirmation) child.stdin.end(confirmation)
    else child.stdin.end()
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(stderr.trim() || `CloudBase CLI exited with ${code}`))
    })
  })

const sourceEnvironment = await readFile('.env', 'utf8')
const sourceSecrets = JSON.parse(
  await readFile('.artifacts/cloudbase/source-function-secrets.json', 'utf8')
) as { SUPABASE_SERVICE_ROLE_KEY?: string }
const cloudBaseCredentials = JSON.parse(
  await readFile('.artifacts/cloudbase/credentials.json', 'utf8')
) as { publishableKey?: string }
const sourceUrl = parseEnv(sourceEnvironment, 'VITE_SUPABASE_URL')
const sourceServiceKey = sourceSecrets.SUPABASE_SERVICE_ROLE_KEY
const publishableKey = cloudBaseCredentials.publishableKey
if (!sourceServiceKey || !publishableKey) throw new Error('Migration credentials are incomplete')

const suffix = randomBytes(4).toString('hex')
const email = `bridge-${suffix}@x.io`
const password = `Cb!${randomBytes(10).toString('hex')}aA1`
const source = createClient(sourceUrl, sourceServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})
let sourceUserId = ''
let targetCreated = false

try {
  const sourceCreate = await source.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  })
  if (sourceCreate.error || !sourceCreate.data.user?.id) {
    throw new Error('Source Auth probe user creation failed', { cause: sourceCreate.error })
  }
  sourceUserId = sourceCreate.data.user.id
  await runTcb([
    'user',
    'create',
    `bridge_${suffix}`,
    '--env-id',
    ENVIRONMENT_ID,
    '--uid',
    sourceUserId,
    '--type',
    'externalUser',
    '--status',
    'ACTIVE',
    '--nickname',
    '密码迁移验证',
    '--email',
    email,
    '--json'
  ])
  targetCreated = true

  const migrationResponse = await fetch(
    'https://art-supabase-staging-d8a9e32316e-1257156420.ap-shanghai.app.tcloudbase.com/login-migrate',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${publishableKey}`,
        Origin: 'https://art-supabase-staging-d8a9e32316e-1257156420.tcloudbaseapp.com',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ identifier: email, password })
    }
  )
  const migration = (await migrationResponse.json().catch(() => null)) as {
    ok?: boolean
    code?: string
    diagnostic?: string
  } | null
  if (!migrationResponse.ok || migration?.ok !== true) {
    throw new Error(
      `Password bridge failed with HTTP ${migrationResponse.status}: ${migration?.code ?? 'unknown'} ${migration?.diagnostic ?? ''}`
    )
  }

  const target = cloudbase.init({
    env: ENVIRONMENT_ID,
    region: 'ap-shanghai',
    accessKey: publishableKey
  })
  const targetAuth =
    typeof target.auth === 'function' ? target.auth({ persistence: 'none' }) : target.auth
  const targetLogin = await targetAuth.signInWithPassword({ email, password })
  if (targetLogin.error || targetLogin.data?.user?.id !== sourceUserId) {
    throw new Error('Migrated password could not log in to CloudBase', {
      cause: targetLogin.error
    })
  }
  await targetAuth.signOut()
  process.stdout.write(
    `${JSON.stringify({ sourcePasswordVerified: true, passwordMigrated: true, targetLogin: true })}\n`
  )
} finally {
  if (targetCreated) {
    await runTcb(
      ['user', 'delete', sourceUserId, '--env-id', ENVIRONMENT_ID, '--json'],
      'y\n'
    ).catch(() => undefined)
  }
  if (sourceUserId) await source.auth.admin.deleteUser(sourceUserId).catch(() => undefined)
}
process.exit(0)
