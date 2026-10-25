import { readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { buildTc3Headers } from './apply-cloudbase-transfer'

interface CloudBaseCredential {
  tmpSecretId: string
  tmpSecretKey: string
  tmpToken: string
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
  const sql = args.get('sql')
  const region = args.get('region') ?? 'ap-shanghai'
  if (!environmentId || !sql) throw new Error('--env and --sql are required')

  const auth = JSON.parse(
    await readFile(path.join(os.homedir(), '.config', '.cloudbase', 'auth.json'), 'utf8')
  ) as { credential?: Partial<CloudBaseCredential> }
  const credential = auth.credential
  if (!credential?.tmpSecretId || !credential.tmpSecretKey || !credential.tmpToken) {
    throw new Error('CloudBase CLI credential is missing; run tcb login first')
  }

  const payload = JSON.stringify({ EnvId: environmentId, Sql: sql })
  const timestamp = Math.floor(Date.now() / 1000)
  const response = await fetch('https://tcb.tencentcloudapi.com', {
    method: 'POST',
    headers: buildTc3Headers({
      credential: credential as CloudBaseCredential,
      action: 'ExecutePGSql',
      payload,
      region,
      timestamp
    }),
    body: payload
  })
  const result: unknown = await response.json()
  if (!response.ok) throw new Error(`CloudBase SQL request failed with HTTP ${response.status}`)
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'CloudBase query failed'}\n`)
  process.exitCode = 1
})
