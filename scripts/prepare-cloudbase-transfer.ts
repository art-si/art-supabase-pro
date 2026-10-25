import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

interface TransferReport {
  schema: {
    inputStatements: number
    outputStatements: number
    skippedExtensions: string[]
    skippedFunctions: string[]
    skippedAuthForeignKeys: number
    skippedAuthDeleteTriggers: number
    skippedOwnerStatements: number
    skippedRealtimeStatements: number
    skippedSessionAuthorizationStatements: number
    skippedDefaultPrivilegeStatements: number
    rewrittenAuthUidReferences: number
  }
  data: {
    copiedTables: number
    copiedRows: number
    skippedTables: Record<string, number>
    insertStatements: number
  }
  storage: {
    metadataUpdates: number
  }
}

interface CopyBlock {
  table: string
  columns: string
  rows: string[]
}

const DEFAULT_BATCH_ROWS = 50
const DEFAULT_BATCH_BYTES = 400_000
const SKIPPED_DATA_SCHEMAS = new Set(['auth', 'storage', 'supabase_migrations', 'vault'])

const normalizeNewlines = (value: string) => value.replace(/\r\n?/gu, '\n')

export function splitPostgresStatements(sql: string): string[] {
  const statements: string[] = []
  let start = 0
  let singleQuoted = false
  let doubleQuoted = false
  let lineComment = false
  let blockComment = false
  let dollarTag: string | null = null

  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index]
    const next = sql[index + 1]

    if (lineComment) {
      if (character === '\n') lineComment = false
      continue
    }
    if (blockComment) {
      if (character === '*' && next === '/') {
        blockComment = false
        index += 1
      }
      continue
    }
    if (dollarTag) {
      if (sql.startsWith(dollarTag, index)) {
        index += dollarTag.length - 1
        dollarTag = null
      }
      continue
    }
    if (singleQuoted) {
      if (character === "'" && next === "'") {
        index += 1
      } else if (character === "'") {
        singleQuoted = false
      }
      continue
    }
    if (doubleQuoted) {
      if (character === '"' && next === '"') {
        index += 1
      } else if (character === '"') {
        doubleQuoted = false
      }
      continue
    }

    if (character === '-' && next === '-') {
      lineComment = true
      index += 1
      continue
    }
    if (character === '/' && next === '*') {
      blockComment = true
      index += 1
      continue
    }
    if (character === "'") {
      singleQuoted = true
      continue
    }
    if (character === '"') {
      doubleQuoted = true
      continue
    }
    if (character === '$') {
      const match = sql.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/u)
      if (match) {
        dollarTag = match[0]
        index += dollarTag.length - 1
        continue
      }
    }
    if (character === ';') {
      const statement = sql.slice(start, index + 1).trim()
      if (statement) statements.push(statement)
      start = index + 1
    }
  }

  const tail = sql.slice(start).trim()
  if (tail) statements.push(tail)
  return statements
}

const extractFunctionIdentity = (statement: string): string | null => {
  const match = statement.match(
    /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+((?:"[^"]+"\.)?"[^"]+")\s*\(/iu
  )
  return match?.[1]?.toLowerCase() ?? null
}

const referencesSkippedFunction = (statement: string, functions: Set<string>): boolean => {
  const normalized = statement.toLowerCase()
  return [...functions].some((identity) =>
    new RegExp(
      `\\bFUNCTION\\s+${identity.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}\\s*\\(`,
      'iu'
    ).test(normalized)
  )
}

const authUidPattern = /(?<![A-Za-z0-9_])(?:auth\.uid\(\)|"auth"\."uid"\(\))/giu
const tenantScopeHeaderReadPattern =
  /current_setting\('request\.headers',\s*true\)::jsonb\s*->>\s*'x-art-tenant-scope'/giu

const AUTH_UID_HELPER = `
CREATE OR REPLACE FUNCTION "app_private"."auth_uid_uuid"() RETURNS "uuid"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select case
    when auth.uid() ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then auth.uid()::uuid
    else null
  end
$$;
`.trim()

export function transformSchema(source: string): {
  sql: string
  report: TransferReport['schema']
} {
  const statements = splitPostgresStatements(normalizeNewlines(source))
  const skippedFunctions = new Set<string>()
  const skippedExtensions: string[] = []
  let skippedAuthForeignKeys = 0
  let skippedAuthDeleteTriggers = 0
  let skippedOwnerStatements = 0
  let skippedRealtimeStatements = 0
  let skippedSessionAuthorizationStatements = 0
  let skippedDefaultPrivilegeStatements = 0
  let rewrittenAuthUidReferences = 0

  for (const statement of statements) {
    if (!/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\b/iu.test(statement)) continue
    if (!/(?:"vault"\.|\bvault\.|"net"\.|\bnet\.http)/iu.test(statement)) continue
    const identity = extractFunctionIdentity(statement)
    if (identity) skippedFunctions.add(identity)
  }

  const output: string[] = []
  let helperInserted = false
  for (const statement of statements) {
    const extensionMatch = statement.match(/CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+"([^"]+)"/iu)
    if (extensionMatch) {
      skippedExtensions.push(extensionMatch[1])
      continue
    }
    if (/\bOWNER\s+TO\s+"postgres"\s*;/iu.test(statement)) {
      skippedOwnerStatements += 1
      continue
    }
    if (/\b(?:GRANT|REVOKE)\b[\s\S]*\b"postgres"\b/iu.test(statement)) continue
    if (/REFERENCES\s+"auth"\."users"/iu.test(statement)) {
      skippedAuthForeignKeys += 1
      continue
    }
    if (
      /CREATE\s+TRIGGER\s+"?sys_user_after_delete_sync_auth_user"?[\s\S]*sync_delete_auth_user_on_app_delete/iu.test(
        statement
      )
    ) {
      skippedAuthDeleteTriggers += 1
      continue
    }
    if (/\b(?:CREATE|ALTER)\s+PUBLICATION\s+"supabase_realtime"/iu.test(statement)) {
      skippedRealtimeStatements += 1
      continue
    }
    if (/\b(?:SET|RESET)\s+SESSION\s+AUTHORIZATION\b/iu.test(statement)) {
      skippedSessionAuthorizationStatements += 1
      continue
    }
    if (/\bALTER\s+DEFAULT\s+PRIVILEGES\b/iu.test(statement)) {
      skippedDefaultPrivilegeStatements += 1
      continue
    }
    if (referencesSkippedFunction(statement, skippedFunctions)) continue
    const identity = extractFunctionIdentity(statement)
    if (identity && skippedFunctions.has(identity)) continue

    const matches = statement.match(authUidPattern)
    rewrittenAuthUidReferences += matches?.length ?? 0
    const rewritten = statement
      .replace(authUidPattern, 'app_private.auth_uid_uuid()')
      .replace(
        tenantScopeHeaderReadPattern,
        (headerRead) =>
          `coalesce(${headerRead}, current_setting('request.headers', true)::jsonb ->> 'x-metadata')`
      )
    output.push(rewritten)

    if (
      !helperInserted &&
      /CREATE\s+SCHEMA\s+IF\s+NOT\s+EXISTS\s+"app_private"/iu.test(statement)
    ) {
      output.push(AUTH_UID_HELPER)
      helperInserted = true
    }
  }

  if (!helperInserted) throw new Error('Source schema does not create app_private')
  return {
    sql: `${output.join('\n\n')}\n`,
    report: {
      inputStatements: statements.length,
      outputStatements: output.length,
      skippedExtensions: [...new Set(skippedExtensions)].sort(),
      skippedFunctions: [...skippedFunctions].sort(),
      skippedAuthForeignKeys,
      skippedAuthDeleteTriggers,
      skippedOwnerStatements,
      skippedRealtimeStatements,
      skippedSessionAuthorizationStatements,
      skippedDefaultPrivilegeStatements,
      rewrittenAuthUidReferences
    }
  }
}

const parseCopyHeader = (line: string): { table: string; columns: string } | null => {
  const match = line.match(/^COPY\s+((?:"[^"]+"\.)"[^"]+")\s+\((.+)\)\s+FROM\s+stdin;$/u)
  return match ? { table: match[1], columns: match[2] } : null
}

const tableSchema = (table: string): string => table.match(/^"([^"]+)"\./u)?.[1] ?? ''

const decodeCopyValue = (value: string): string | null => {
  if (value === '\\N') return null
  return value.replace(/\\([btnrfv\\])/gu, (_match, escape: string) => {
    const replacements: Record<string, string> = {
      b: '\b',
      t: '\t',
      n: '\n',
      r: '\r',
      f: '\f',
      v: '\v',
      '\\': '\\'
    }
    return replacements[escape] ?? escape
  })
}

const sqlLiteral = (value: string): string => `'${value.replace(/'/gu, "''")}'`

const copyRowsToInserts = (block: CopyBlock, maxRows: number, maxBytes: number): string[] => {
  const statements: string[] = []
  let batch: string[] = []
  let batchBytes = 0

  const flush = () => {
    if (batch.length === 0) return
    statements.push(
      `INSERT INTO ${block.table} (${block.columns}) OVERRIDING SYSTEM VALUE VALUES\n${batch.join(',\n')};`
    )
    batch = []
    batchBytes = 0
  }

  for (const row of block.rows) {
    const values = row.split('\t').map(decodeCopyValue)
    const tuple = `(${values.map((value) => (value === null ? 'NULL' : sqlLiteral(value))).join(', ')})`
    if (batch.length > 0 && (batch.length >= maxRows || batchBytes + tuple.length > maxBytes))
      flush()
    batch.push(tuple)
    batchBytes += tuple.length
  }
  flush()
  return statements
}

export function transformData(
  source: string,
  options: { maxRows?: number; maxBytes?: number } = {}
): { sql: string; report: TransferReport['data'] } {
  const lines = normalizeNewlines(source).split('\n')
  const output: string[] = []
  const skippedTables: Record<string, number> = {}
  let copiedTables = 0
  let copiedRows = 0
  let insertStatements = 0

  for (let index = 0; index < lines.length; index += 1) {
    const header = parseCopyHeader(lines[index])
    if (!header) {
      const line = lines[index]
      if (
        /pg_catalog\.setval\('"(?:auth|storage|supabase_migrations|vault)"\./u.test(line) ||
        /^-- Data for Name: .+; Type: TABLE DATA; Schema: (?:auth|storage|supabase_migrations|vault);/u.test(
          line
        )
      ) {
        continue
      }
      output.push(line)
      continue
    }

    const rows: string[] = []
    index += 1
    while (index < lines.length && lines[index] !== '\\.') {
      rows.push(lines[index])
      index += 1
    }
    const schema = tableSchema(header.table)
    if (SKIPPED_DATA_SCHEMAS.has(schema)) {
      skippedTables[header.table] = rows.length
      continue
    }

    copiedTables += 1
    copiedRows += rows.length
    const statements = copyRowsToInserts(
      { ...header, rows },
      options.maxRows ?? DEFAULT_BATCH_ROWS,
      options.maxBytes ?? DEFAULT_BATCH_BYTES
    )
    insertStatements += statements.length
    output.push(...statements)
  }

  return {
    sql: `${output.join('\n')}\n`,
    report: { copiedTables, copiedRows, skippedTables, insertStatements }
  }
}

export function transformStorageMetadata(source: string): {
  sql: string
  report: TransferReport['storage']
} {
  const lines = normalizeNewlines(source).split('\n')
  const statements: string[] = []
  for (let index = 0; index < lines.length; index += 1) {
    const header = parseCopyHeader(lines[index])
    if (!header || header.table !== '"storage"."objects"') continue
    const columns = [...header.columns.matchAll(/"([^"]+)"/gu)].map((match) => match[1])
    const columnIndex = new Map(columns.map((column, columnOffset) => [column, columnOffset]))
    index += 1
    while (index < lines.length && lines[index] !== '\\.') {
      const values = lines[index].split('\t').map(decodeCopyValue)
      const read = (column: string) => {
        const offset = columnIndex.get(column)
        return offset === undefined ? null : values[offset]
      }
      const bucketId = read('bucket_id')
      const name = read('name')
      if (!bucketId || !name) throw new Error('Storage object is missing bucket_id or name')
      const ownerId = read('owner_id') ?? read('owner')
      const userMetadata = read('user_metadata')
      const createdAt = read('created_at')
      const updatedAt = read('updated_at')
      const lastAccessedAt = read('last_accessed_at')
      const assignments = [
        `owner_id = ${ownerId === null ? 'NULL' : sqlLiteral(ownerId)}`,
        `user_metadata = ${userMetadata === null ? 'NULL' : `${sqlLiteral(userMetadata)}::jsonb`}`
      ]
      if (createdAt) assignments.push(`created_at = ${sqlLiteral(createdAt)}::timestamptz`)
      if (updatedAt) assignments.push(`updated_at = ${sqlLiteral(updatedAt)}::timestamptz`)
      if (lastAccessedAt)
        assignments.push(`last_accessed_at = ${sqlLiteral(lastAccessedAt)}::timestamptz`)
      statements.push(
        `UPDATE storage.objects SET ${assignments.join(', ')} WHERE bucket_id = ${sqlLiteral(bucketId)} AND name = ${sqlLiteral(name)};`
      )
      index += 1
    }
    break
  }
  return {
    sql: `${statements.join('\n')}\n`,
    report: { metadataUpdates: statements.length }
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
  const backup = args.get('backup')
  if (!backup) throw new Error('--backup is required')
  const backupRoot = path.resolve(backup)
  const outputRoot = path.resolve(args.get('output') ?? path.join(backupRoot, 'cloudbase-transfer'))
  const schemaSource = await readFile(path.join(backupRoot, 'database/schema.sql'), 'utf8')
  const dataSource = await readFile(path.join(backupRoot, 'database/data.sql'), 'utf8')
  const schema = transformSchema(schemaSource)
  const data = transformData(dataSource)
  const storage = transformStorageMetadata(dataSource)

  await mkdir(outputRoot, { recursive: true })
  await writeFile(path.join(outputRoot, 'schema.sql'), schema.sql, 'utf8')
  await writeFile(path.join(outputRoot, 'data.sql'), data.sql, 'utf8')
  await writeFile(path.join(outputRoot, 'storage-metadata.sql'), storage.sql, 'utf8')
  const report: TransferReport = {
    schema: schema.report,
    data: data.report,
    storage: storage.report
  }
  await writeFile(
    path.join(outputRoot, 'report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8'
  )
  process.stdout.write(`${JSON.stringify({ outputRoot, report }, null, 2)}\n`)
}

const isEntrypoint =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (isEntrypoint) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'CloudBase transfer failed'}\n`
    )
    process.exitCode = 1
  })
}
