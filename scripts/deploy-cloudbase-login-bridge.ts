import { spawn } from 'node:child_process'
import { readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const DEFAULT_ENVIRONMENT_ID = 'art-supabase-staging-d8a9e32316e'
const DEFAULT_TCB =
  'C:/Users/EDY/AppData/Local/npm-cache/_npx/88bda5ef0319b729/node_modules/@cloudbase/cli/bin/tcb'

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

const parseEnvFile = (content: string): Map<string, string> => {
  const values = new Map<string, string>()
  for (const line of content.split(/\r?\n/u)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/u)
    if (!match) continue
    const [, key, rawValue] = match
    const value = rawValue.replace(/^(['"])(.*)\1$/u, '$2')
    values.set(key, value)
  }
  return values
}

const run = (command: string, args: string[], cwd: string) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, TCB_DISABLE_REPORT: '1' },
      stdio: 'inherit',
      windowsHide: true
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`CloudBase CLI exited with ${code}`))
    })
  })

async function main() {
  const args = parseArguments(process.argv.slice(2))
  const workspace = process.cwd()
  const environmentId = args.get('env') ?? DEFAULT_ENVIRONMENT_ID
  const tcb = path.resolve(args.get('tcb') ?? DEFAULT_TCB)
  const values = parseEnvFile(await readFile(path.join(workspace, '.env'), 'utf8'))
  const cloudBaseCredentials = JSON.parse(
    await readFile(path.join(workspace, '.artifacts/cloudbase/credentials.json'), 'utf8')
  ) as { serverApiKey?: string }
  const sourceUrl = values.get('VITE_SUPABASE_URL')?.trim()
  const sourceAnonKey = values.get('VITE_SUPABASE_KEY')?.trim()
  if (!sourceUrl || !sourceAnonKey || !cloudBaseCredentials.serverApiKey) {
    throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_KEY are required in .env')
  }

  const configPath = path.join(workspace, 'cloudbaserc.json')
  const config = {
    envId: environmentId,
    functionRoot: './cloudbase/functions',
    functions: [
      {
        name: 'migrate-supabase-login',
        dir: './cloudbase/functions/migrate-supabase-login',
        type: 'HTTP',
        public: true,
        gatewayPath: '/login-migrate',
        runtime: 'Nodejs20.19',
        handler: 'index.main',
        timeout: 30,
        memorySize: 256,
        installDependency: true,
        envVariables: {
          CLOUDBASE_ENV_ID: environmentId,
          CLOUDBASE_REGION: 'ap-shanghai',
          CLOUDBASE_APIKEY: cloudBaseCredentials.serverApiKey,
          ALLOWED_ORIGINS:
            'https://art-supabase-staging-d8a9e32316e-1257156420.tcloudbaseapp.com,http://localhost:3006,http://127.0.0.1:3006',
          SOURCE_SUPABASE_URL: sourceUrl,
          SOURCE_SUPABASE_ANON_KEY: sourceAnonKey
        }
      }
    ]
  }

  try {
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { flag: 'wx' })
    await run(
      process.execPath,
      [
        tcb,
        'fn',
        'deploy',
        'migrate-supabase-login',
        '--install-dependency',
        'true',
        '--httpFn',
        '--path',
        '/login-migrate',
        '--yes',
        '--json'
      ],
      workspace
    )
  } finally {
    await rm(configPath, { force: true })
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Login bridge deployment failed'}\n`
  )
  process.exitCode = 1
})
