import { createHash, createHmac } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { splitPostgresStatements } from './prepare-cloudbase-transfer'

interface CloudBaseCredential {
  tmpSecretId: string
  tmpSecretKey: string
  tmpToken: string
  tmpExpired?: number
}

interface CredentialFile {
  credential?: Partial<CloudBaseCredential>
}

interface ApplyState {
  environmentId: string
  phase: 'schema' | 'data'
  sourceSha256: string
  nextStatement: number
  appliedBatches: number
  updatedAt: string
}

interface ExecuteResponse {
  Response?: {
    Error?: { Code?: string; Message?: string }
    RequestId?: string
    [key: string]: unknown
  }
}

const SERVICE = 'tcb'
const HOST = 'tcb.tencentcloudapi.com'
const VERSION = '2018-06-08'
const ALGORITHM = 'TC3-HMAC-SHA256'
const MAX_BATCH_BYTES = 240_000
const textEncoder = new TextEncoder()

const sha256 = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')

const hmac = (key: string | Buffer, value: string) =>
  createHmac('sha256', key).update(value).digest()

const utcDate = (timestamp: number) => new Date(timestamp * 1000).toISOString().slice(0, 10)

const assertCredential = (value: CredentialFile): CloudBaseCredential => {
  const credential = value.credential
  if (
    !credential ||
    typeof credential.tmpSecretId !== 'string' ||
    typeof credential.tmpSecretKey !== 'string' ||
    typeof credential.tmpToken !== 'string'
  ) {
    throw new Error('CloudBase CLI credential is missing; run tcb login first')
  }
  if (
    typeof credential.tmpExpired === 'number' &&
    credential.tmpExpired > 0 &&
    credential.tmpExpired <= Math.floor(Date.now() / 1000) + 60
  ) {
    throw new Error('CloudBase CLI credential is expired; refresh it with tcb env list')
  }
  return credential as CloudBaseCredential
}

export function buildTc3Headers(options: {
  credential: CloudBaseCredential
  action: string
  payload: string
  region: string
  timestamp: number
}): Record<string, string> {
  const { credential, action, payload, region, timestamp } = options
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${HOST}\nx-tc-action:${action.toLowerCase()}\n`
  const signedHeaders = 'content-type;host;x-tc-action'
  const canonicalRequest = ['POST', '/', '', canonicalHeaders, signedHeaders, sha256(payload)].join(
    '\n'
  )
  const date = utcDate(timestamp)
  const credentialScope = `${date}/${SERVICE}/tc3_request`
  const stringToSign = [
    ALGORITHM,
    String(timestamp),
    credentialScope,
    sha256(canonicalRequest)
  ].join('\n')
  const secretDate = hmac(`TC3${credential.tmpSecretKey}`, date)
  const secretService = hmac(secretDate, SERVICE)
  const secretSigning = hmac(secretService, 'tc3_request')
  const signature = createHmac('sha256', secretSigning).update(stringToSign).digest('hex')

  return {
    Authorization: `${ALGORITHM} Credential=${credential.tmpSecretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    'Content-Type': 'application/json; charset=utf-8',
    Host: HOST,
    'X-TC-Action': action,
    'X-TC-Region': region,
    'X-TC-Timestamp': String(timestamp),
    'X-TC-Token': credential.tmpToken,
    'X-TC-Version': VERSION
  }
}

const executeSql = async (options: {
  credential: CloudBaseCredential
  environmentId: string
  region: string
  sql: string
}) => {
  const payload = JSON.stringify({ EnvId: options.environmentId, Sql: options.sql })
  const timestamp = Math.floor(Date.now() / 1000)
  const response = await fetch(`https://${HOST}`, {
    method: 'POST',
    headers: buildTc3Headers({
      credential: options.credential,
      action: 'ExecutePGSql',
      payload,
      region: options.region,
      timestamp
    }),
    body: payload
  })
  const result = (await response.json().catch(() => null)) as ExecuteResponse | null
  if (!response.ok || !result?.Response || result.Response.Error) {
    const code = result?.Response?.Error?.Code ?? `HTTP_${response.status}`
    const message = result?.Response?.Error?.Message ?? 'CloudBase SQL request failed'
    throw new Error(`${code}: ${message}`)
  }
  return result.Response
}

export function createSqlBatches(
  statements: string[],
  startIndex = 0,
  maxBytes = MAX_BATCH_BYTES
): Array<{ start: number; end: number; sql: string }> {
  const batches: Array<{ start: number; end: number; sql: string }> = []
  let start = startIndex
  let parts: string[] = []
  let bytes = 0

  const flush = (end: number) => {
    if (parts.length === 0) return
    batches.push({
      start,
      end,
      sql: `BEGIN;\nSET LOCAL check_function_bodies = false;\n${parts.join('\n\n')}\nCOMMIT;`
    })
    start = end
    parts = []
    bytes = 0
  }

  for (let index = startIndex; index < statements.length; index += 1) {
    const statement = statements[index]
    const statementBytes = textEncoder.encode(statement).byteLength
    if (statementBytes > maxBytes) {
      flush(index)
      batches.push({
        start: index,
        end: index + 1,
        sql: `BEGIN;\nSET LOCAL check_function_bodies = false;\n${statement}\nCOMMIT;`
      })
      start = index + 1
      continue
    }
    if (parts.length > 0 && bytes + statementBytes > maxBytes) flush(index)
    parts.push(statement)
    bytes += statementBytes
  }
  flush(statements.length)
  return batches
}

const readState = async (statePath: string): Promise<ApplyState | null> => {
  try {
    return JSON.parse(await readFile(statePath, 'utf8')) as ApplyState
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
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
  const input = args.get('input')
  const environmentId = args.get('env')
  const phase = args.get('phase')
  if (!input || !environmentId || (phase !== 'schema' && phase !== 'data')) {
    throw new Error('--input, --env and --phase schema|data are required')
  }
  const inputPath = path.resolve(input)
  const sql = await readFile(inputPath, 'utf8')
  const sourceSha256 = sha256(sql)
  const statements = splitPostgresStatements(sql).filter(
    (statement) => !/^\s*(?:--[^\n]*\n?)*\s*$/u.test(statement)
  )
  const statePath = `${inputPath}.apply-state.json`
  const previousState = await readState(statePath)
  if (
    previousState &&
    (previousState.environmentId !== environmentId ||
      previousState.phase !== phase ||
      previousState.sourceSha256 !== sourceSha256)
  ) {
    throw new Error('Apply state belongs to a different environment, phase or source file')
  }

  const credentialPath = path.join(os.homedir(), '.config', '.cloudbase', 'auth.json')
  const credential = assertCredential(
    JSON.parse(await readFile(credentialPath, 'utf8')) as CredentialFile
  )
  const state: ApplyState = previousState ?? {
    environmentId,
    phase,
    sourceSha256,
    nextStatement: 0,
    appliedBatches: 0,
    updatedAt: new Date().toISOString()
  }
  const batches = createSqlBatches(statements, state.nextStatement)
  process.stdout.write(
    `${JSON.stringify({ phase, statements: statements.length, remainingBatches: batches.length })}\n`
  )

  for (const batch of batches) {
    const batchSql =
      phase === 'data'
        ? batch.sql.replace(
            'SET LOCAL check_function_bodies = false;',
            'SET LOCAL check_function_bodies = false;\nSET LOCAL session_replication_role = replica;'
          )
        : batch.sql
    try {
      await executeSql({
        credential,
        environmentId,
        region: args.get('region') ?? 'ap-shanghai',
        sql: batchSql
      })
    } catch (error) {
      const preview = statements[batch.start].replace(/\s+/gu, ' ').slice(0, 240)
      throw new Error(`Batch ${batch.start}-${batch.end} failed near: ${preview}`, { cause: error })
    }
    state.nextStatement = batch.end
    state.appliedBatches += 1
    state.updatedAt = new Date().toISOString()
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
    process.stdout.write(
      `${JSON.stringify({ applied: batch.end, total: statements.length, batches: state.appliedBatches })}\n`
    )
  }
}

const isEntrypoint =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (isEntrypoint) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'CloudBase apply failed'
    const cause =
      error instanceof Error && error.cause instanceof Error ? error.cause.message : null
    process.stderr.write(`${message}${cause ? `\n${cause}` : ''}\n`)
    process.exitCode = 1
  })
}
