import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

interface SourceUser {
  uid: string
  user_name: string | null
  nick_name: string | null
  email: string | null
  phone: string | null
  avatar: string | null
  active: boolean
}

interface TargetUser {
  Uid: string
  Name: string
}

interface MigrationState {
  environmentId: string
  migratedUids: string[]
  updatedAt: string
}

const run = (command: string, args: string[], environment: NodeJS.ProcessEnv) =>
  new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, {
      env: environment,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve(stdout)
      else reject(new Error(stderr.trim() || `Command exited with ${code}`))
    })
  })

export const normalizeCloudBaseUserName = (
  preferred: string | null,
  uid: string,
  used: Set<string>
) => {
  const normalized = preferred?.trim() ?? ''
  const base = /^[A-Za-z0-9][A-Za-z0-9._-]{0,23}$/u.test(normalized)
    ? normalized
    : `user_${uid.replace(/-/gu, '').slice(0, 18)}`
  let candidate = base
  let suffix = 1
  while (used.has(candidate.toLowerCase())) {
    const tail = `_${suffix}`
    candidate = `${base.slice(0, 24 - tail.length)}${tail}`
    suffix += 1
  }
  used.add(candidate.toLowerCase())
  return candidate
}

export const normalizeCloudBasePhone = (value: string | null) => {
  const phone = value?.replace(/\s+/gu, '') ?? ''
  return /^1\d{10}$/u.test(phone) ? phone : null
}

const parseArguments = (argv: string[]) => {
  const args = new Map<string, string>()
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!key?.startsWith('--') || !value) throw new Error(`Invalid argument near ${key ?? '<end>'}`)
    args.set(key.slice(2), value)
  }
  return args
}

async function main() {
  const args = parseArguments(process.argv.slice(2))
  const environmentId = args.get('env')
  const projectRef = args.get('project-ref')
  if (!environmentId || !projectRef) throw new Error('--env and --project-ref are required')
  const supabase = args.get('supabase') ?? 'supabase.exe'
  const tcb = path.resolve(
    args.get('tcb') ??
      'C:/Users/EDY/AppData/Local/npm-cache/_npx/88bda5ef0319b729/node_modules/@cloudbase/cli/bin/tcb'
  )
  const sourceSql = `
select
  auth_user.id::text as uid,
  business_user.user_name,
  business_user.nick_name,
  coalesce(nullif(auth_user.email, ''), nullif(business_user.user_email, '')) as email,
  coalesce(nullif(auth_user.phone, ''), nullif(business_user.user_phone, '')) as phone,
  nullif(business_user.avatar, '') as avatar,
  coalesce(business_user.status = '1' and business_user.deleted_at is null, true)
    and (auth_user.banned_until is null or auth_user.banned_until <= now()) as active
from auth.users auth_user
left join public.sys_user business_user on business_user.auth_user_id = auth_user.id
order by auth_user.id
`.trim()
  const sourceText = await run(
    supabase,
    ['db', 'query', '--linked', '--agent=no', '--output', 'json', sourceSql],
    process.env
  )
  const sourceUsers = JSON.parse(sourceText) as SourceUser[]
  if (sourceUsers.length === 0) throw new Error('Source Auth user list is empty')

  const targetText = await run(
    process.execPath,
    [tcb, 'user', 'list', '--env-id', environmentId, '--limit', '100', '--json'],
    { ...process.env, TCB_DISABLE_REPORT: '1' }
  )
  const targetEnvelope = JSON.parse(targetText) as { data?: TargetUser[] }
  const targetUsers = targetEnvelope.data ?? []
  const existingUids = new Set(targetUsers.map((user) => user.Uid))
  const usedNames = new Set(targetUsers.map((user) => user.Name.toLowerCase()))
  const statePath = path.resolve(
    args.get('state') ?? '.artifacts/cloudbase/user-migration-state.json'
  )
  let state: MigrationState
  try {
    state = JSON.parse(await readFile(statePath, 'utf8')) as MigrationState
    if (state.environmentId !== environmentId)
      throw new Error('User state belongs to another environment')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    state = { environmentId, migratedUids: [], updatedAt: new Date().toISOString() }
  }
  const migrated = new Set(state.migratedUids)

  for (const sourceUser of sourceUsers) {
    if (existingUids.has(sourceUser.uid)) migrated.add(sourceUser.uid)
  }

  for (const sourceUser of sourceUsers) {
    if (existingUids.has(sourceUser.uid) || migrated.has(sourceUser.uid)) continue
    const name = normalizeCloudBaseUserName(sourceUser.user_name, sourceUser.uid, usedNames)
    const nickname = (sourceUser.nick_name?.trim() || name).slice(0, 64)
    const command = [
      tcb,
      'user',
      'create',
      name,
      '--env-id',
      environmentId,
      '--uid',
      sourceUser.uid,
      '--type',
      'externalUser',
      '--status',
      sourceUser.active ? 'ACTIVE' : 'BLOCKED',
      '--nickname',
      nickname.length >= 2 ? nickname : `${nickname}_`,
      '--description',
      'Migrated from Supabase; password pending first-login conversion',
      '--json'
    ]
    if (sourceUser.email) command.push('--email', sourceUser.email)
    const phone = normalizeCloudBasePhone(sourceUser.phone)
    if (phone) command.push('--phone', phone)
    if (sourceUser.avatar) command.push('--avatar', sourceUser.avatar)
    await run(process.execPath, command, { ...process.env, TCB_DISABLE_REPORT: '1' })
    migrated.add(sourceUser.uid)
    state.migratedUids = [...migrated].sort()
    state.updatedAt = new Date().toISOString()
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
    process.stdout.write(
      `${JSON.stringify({ migrated: migrated.size, total: sourceUsers.length })}\n`
    )
  }

  state.migratedUids = [...migrated].sort()
  state.updatedAt = new Date().toISOString()
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')

  process.stdout.write(
    `${JSON.stringify({ sourceUsers: sourceUsers.length, coveredSourceUsers: migrated.size, targetUsersBeforeRun: existingUids.size })}\n`
  )
}

const isEntrypoint =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (isEntrypoint) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'User migration failed'}\n`)
    process.exitCode = 1
  })
}
