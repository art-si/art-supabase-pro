import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, open, stat, unlink } from 'node:fs/promises'
import { dirname } from 'node:path'
import type postgres from 'postgres'

export type CopySourceSql = Pick<ReturnType<typeof postgres>, 'unsafe'>

export interface TableFingerprint {
  rows: string
  sums: string[]
}

export interface CopyTable {
  key: string
  schema: string
  name: string
  columns: string[]
  fingerprint: TableFingerprint
  start: number
  end: number
}

export interface SourceTable {
  key: string
  schema: string
  name: string
  columns: string[]
  outputs: string[]
}

export interface CopyInventory {
  tables: CopyTable[]
  sequenceStatements: string[]
  prefix: string
  extraStatements: string[]
}

const MAX_LINE_BYTES = 64 * 1024 * 1024

function readQuotedIdentifier(text: string, offset: number): { value: string; next: number } {
  if (text[offset] !== '"') throw new Error('Unsupported COPY identifier syntax')
  let value = ''
  for (let index = offset + 1; index < text.length; index++) {
    const char = text[index]
    if (char !== '"') {
      value += char
      continue
    }
    if (text[index + 1] === '"') {
      value += '"'
      index++
      continue
    }
    return { value, next: index + 1 }
  }
  throw new Error('Unterminated COPY identifier')
}

function parseCopyHeader(line: string): { schema: string; name: string; columns: string[] } {
  if (!line.startsWith('COPY ')) throw new Error('Expected COPY statement')
  let offset = 5
  const schema = readQuotedIdentifier(line, offset)
  offset = schema.next
  if (line[offset] !== '.') throw new Error('Unsupported COPY table syntax')
  const name = readQuotedIdentifier(line, offset + 1)
  offset = name.next
  if (line.slice(offset, offset + 2) !== ' (')
    throw new Error('COPY without explicit columns is unsupported')
  offset += 2
  const columns: string[] = []
  while (true) {
    const column = readQuotedIdentifier(line, offset)
    columns.push(column.value)
    offset = column.next
    if (line.slice(offset, offset + 2) === ', ') {
      offset += 2
      continue
    }
    break
  }
  if (line.slice(offset) !== ') FROM stdin;' || columns.length === 0) {
    throw new Error('Unsupported COPY statement')
  }
  return { schema: schema.value, name: name.value, columns }
}

function addRowHash(sums: bigint[], row: Buffer): void {
  const digest = createHash('sha256').update(row).digest()
  for (let lane = 0; lane < 8; lane++) sums[lane] += BigInt(digest.readUInt32BE(lane * 4))
}

function quoted(name: string): string {
  if (!name || name.includes('\0')) throw new Error('Invalid SQL identifier')
  return `"${name.replaceAll('"', '""')}"`
}

function safeOutput(name: string): string {
  const part = '(?:[A-Za-z_][A-Za-z0-9_$]*|"(?:[^"]|"")+")'
  if (!new RegExp(`^${part}\\.${part}$`).test(name))
    throw new Error('Invalid PostgreSQL type output function')
  return name
}

function copyEscapedOutput(expression: string): string {
  let escaped = `replace(${expression}, chr(92), chr(92) || chr(92))`
  for (const [code, letter] of [
    [8, 'b'],
    [12, 'f'],
    [10, 'n'],
    [13, 'r'],
    [9, 't'],
    [11, 'v']
  ] as const) {
    escaped = `replace(${escaped}, chr(${code}), chr(92) || '${letter}')`
  }
  return escaped
}

export async function readCopyInventory(file: string): Promise<CopyInventory> {
  const tables: CopyTable[] = []
  const sequenceStatements: string[] = []
  const extraStatements: string[] = []
  const keys = new Set<string>()
  const prefixLines: Buffer[] = []
  let current: {
    schema: string
    name: string
    columns: string[]
    start: number
    sums: bigint[]
    rows: bigint
  } | null = null
  let sawCopy = false
  let pending = Buffer.alloc(0)
  let position = 0

  const processLine = (raw: Buffer): void => {
    const start = position
    position += raw.length
    let end = raw.length
    if (end && raw[end - 1] === 10) end--
    if (end && raw[end - 1] === 13) end--
    const lineBytes = raw.subarray(0, end)
    const line = lineBytes.toString('utf8')
    if (current) {
      if (line === '\\.') {
        const key = JSON.stringify([current.schema, current.name])
        if (keys.has(key)) throw new Error(`Duplicate COPY section: ${key}`)
        keys.add(key)
        tables.push({
          key,
          schema: current.schema,
          name: current.name,
          columns: current.columns,
          fingerprint: {
            rows: current.rows.toString(),
            sums: current.sums.map((value) => value.toString())
          },
          start: current.start,
          end: position
        })
        current = null
      } else {
        addRowHash(current.sums, lineBytes)
        current.rows++
      }
      return
    }
    if (line.startsWith('COPY ')) {
      const header = parseCopyHeader(line)
      current = { ...header, start, sums: Array<bigint>(8).fill(0n), rows: 0n }
      sawCopy = true
      return
    }
    if (/^SELECT pg_catalog\.setval\(.+\);$/.test(line)) {
      sequenceStatements.push(line)
      return
    }
    if (line === '' || line.startsWith('--')) {
      if (!sawCopy) prefixLines.push(raw)
      return
    }
    if (/^\\(?:un)?restrict [A-Za-z0-9]+$/.test(line)) {
      if (sawCopy) extraStatements.push(line)
      else prefixLines.push(raw)
      return
    }
    if (
      /^SET [A-Za-z_][A-Za-z0-9_]* = [^;]*;$/.test(line) ||
      /^SELECT pg_catalog\.set_config\('search_path', '', false\);$/.test(line)
    ) {
      if (sawCopy) extraStatements.push(line)
      else prefixLines.push(raw)
      return
    }
    throw new Error(`Unsupported non-COPY database statement at byte ${start}`)
  }

  for await (const chunk of createReadStream(file)) {
    pending = Buffer.concat([pending, chunk as Buffer])
    let newline: number
    while ((newline = pending.indexOf(10)) !== -1) {
      processLine(pending.subarray(0, newline + 1))
      pending = pending.subarray(newline + 1)
    }
    if (pending.length > MAX_LINE_BYTES) throw new Error('COPY row exceeds the supported line size')
  }
  if (pending.length) processLine(pending)
  if (current) throw new Error('Database COPY block ended without \\. terminator')
  if (tables.length === 0 && sequenceStatements.length === 0)
    throw new Error('No supported database data found')
  return {
    tables,
    sequenceStatements,
    prefix: Buffer.concat(prefixLines).toString('utf8'),
    extraStatements
  }
}

export async function listSourceTables(
  sql: CopySourceSql,
  schemas: string[]
): Promise<SourceTable[]> {
  if (!schemas.length || schemas.some((schema) => !schema || schema.includes('\0'))) {
    throw new Error('At least one valid source schema is required')
  }
  const rows = await sql.unsafe(
    `
    SELECT n.nspname AS schema, c.relname AS name,
      array_agg(a.attname ORDER BY a.attnum) FILTER(WHERE a.attnum IS NOT NULL) AS columns,
      array_agg(format('%I.%I', pn.nspname, p.proname) ORDER BY a.attnum) FILTER(WHERE pn.nspname IS NOT NULL) AS outputs
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
      AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
    LEFT JOIN pg_catalog.pg_type t ON t.oid = a.atttypid
    LEFT JOIN pg_catalog.pg_proc p ON p.oid = t.typoutput
    LEFT JOIN pg_catalog.pg_namespace pn ON pn.oid = p.pronamespace
    WHERE n.nspname = ANY($1::text[])
      AND c.relkind = 'r' AND c.relpersistence <> 't'
    GROUP BY n.nspname, c.relname
    ORDER BY n.nspname, c.relname
  `,
    [schemas]
  )
  return rows.map((row) => {
    const columns: unknown = row.columns
    const outputs: unknown = row.outputs
    if (
      typeof row.schema !== 'string' ||
      typeof row.name !== 'string' ||
      !Array.isArray(columns) ||
      !Array.isArray(outputs) ||
      !columns.length ||
      columns.length !== outputs.length ||
      !columns.every((value: unknown) => typeof value === 'string') ||
      !outputs.every((value: unknown) => typeof value === 'string')
    ) {
      throw new Error('Invalid source table column metadata')
    }
    outputs.forEach(safeOutput)
    return {
      key: JSON.stringify([row.schema, row.name]),
      schema: row.schema,
      name: row.name,
      columns,
      outputs
    }
  })
}

export function buildFingerprintQuery(table: SourceTable): string {
  if (!table.columns.length || table.columns.length !== table.outputs.length) {
    throw new Error('Source table must have explicit COPY columns')
  }
  const fields = table.columns.map((column, index) => {
    const ref = quoted(column)
    const output = `${safeOutput(table.outputs[index])}(${ref})::text`
    return `CASE WHEN ${ref} IS NULL THEN chr(92) || 'N' ELSE ${copyEscapedOutput(output)} END`
  })
  const rowText = fields.join(' || chr(9) || ')
  const tableRef = `${quoted(table.schema)}.${quoted(table.name)}`
  const sums = Array.from(
    { length: 8 },
    (_, lane) =>
      `COALESCE(sum((('x' || substring(hash_hex from ${lane * 8 + 1} for 8))::bit(32)::bigint)::numeric), 0)::text AS sum_${lane}`
  ).join(', ')
  return `WITH row_hashes AS MATERIALIZED (
    SELECT encode(sha256(convert_to(${rowText}, 'UTF8')), 'hex') AS hash_hex
    FROM ONLY ${tableRef}
  ) SELECT count(*)::text AS rows, ${sums} FROM row_hashes`
}

export async function fingerprintSourceTable(
  sql: CopySourceSql,
  table: SourceTable
): Promise<TableFingerprint> {
  const query = buildFingerprintQuery(table)
  const result = await sql.unsafe(query)
  if (result.length !== 1) throw new Error('Unexpected table fingerprint result')
  const row = result[0]
  const values = Array.from({ length: 8 }, (_, lane) => String(row[`sum_${lane}`]))
  if (!/^\d+$/.test(String(row.rows)) || values.some((value) => !/^\d+$/.test(value))) {
    throw new Error('Invalid table fingerprint values')
  }
  return { rows: String(row.rows), sums: values }
}

export async function buildDataDump(
  destination: string,
  blocks: Array<{ file: string; start: number; end: number }>,
  sequenceStatements: string[]
): Promise<void> {
  await mkdir(dirname(destination), { recursive: true })
  const output = await open(destination, 'wx')
  const writeAll = async (buffer: Buffer): Promise<void> => {
    let offset = 0
    while (offset < buffer.length) {
      const { bytesWritten } = await output.write(buffer, offset, buffer.length - offset)
      if (!bytesWritten) throw new Error('Could not write database dump')
      offset += bytesWritten
    }
  }
  try {
    await writeAll(
      Buffer.from(
        "-- Incremental database data snapshot\nSET client_encoding = 'UTF8';\nSET standard_conforming_strings = on;\nSELECT pg_catalog.set_config('search_path', '', false);\n\n"
      )
    )
    for (const block of blocks) {
      const info = await stat(block.file)
      if (
        !Number.isSafeInteger(block.start) ||
        !Number.isSafeInteger(block.end) ||
        block.start < 0 ||
        block.end <= block.start ||
        block.end > info.size
      ) {
        throw new Error('Invalid COPY byte range')
      }
      for await (const chunk of createReadStream(block.file, {
        start: block.start,
        end: block.end - 1
      })) {
        await writeAll(chunk as Buffer)
      }
      await writeAll(Buffer.from('\n'))
    }
    for (const statement of sequenceStatements) {
      if (
        !/^SELECT pg_catalog\.setval\(.+\);$/.test(statement) ||
        statement.includes('\n') ||
        statement.includes('\r')
      ) {
        throw new Error('Unsupported sequence statement')
      }
      await writeAll(Buffer.from(`${statement}\n`, 'utf8'))
    }
    await writeAll(Buffer.from('\n-- PostgreSQL database dump complete\n', 'utf8'))
  } catch (error) {
    await output.close()
    await unlink(destination).catch(() => undefined)
    throw error
  }
  await output.close()
}

/** pg_dump may quote safe names differently. Compare sequence identity/state,
 * never edit a quoted identifier by a global text replacement. */
export function normalizeSequenceStatements(statements: string[]): string {
  const entries = statements.map((statement) => {
    const match = statement.match(
      /^SELECT pg_catalog\.setval\('((?:[^']|'')+)'(?:::regclass)?,\s*(-?\d+),\s*(true|false)\);$/
    )
    if (!match) throw new Error('Unsupported sequence state in database dump')
    const name = match[1].replaceAll("''", "'")
    let offset = 0
    const names: string[] = []
    while (offset < name.length) {
      if (name[offset] === '"') {
        const part = readQuotedIdentifier(name, offset)
        names.push(part.value)
        offset = part.next
      } else {
        const part = /^[A-Za-z_][A-Za-z0-9_$]*/.exec(name.slice(offset))
        if (!part) throw new Error('Unsupported sequence identifier')
        names.push(part[0].toLowerCase())
        offset += part[0].length
      }
      if (offset === name.length) break
      if (name[offset] !== '.') throw new Error('Invalid sequence identifier')
      offset++
    }
    if (names.length !== 2) throw new Error('Sequence name must include its schema')
    return [names[0], names[1], BigInt(match[2]).toString(), match[3]]
  })
  entries.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  return JSON.stringify(entries)
}
