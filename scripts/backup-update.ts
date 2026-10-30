import postgres from 'postgres'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { isObjectRecord } from '../src/utils/record'
import type { BackupUpdateReport } from '../src/types/supabase-operations'
import {
  readCopyInventory,
  listSourceTables,
  fingerprintSourceTable,
  buildDataDump,
  type CopyInventory,
  type CopyTable,
  type SourceTable,
  type TableFingerprint,
  normalizeSequenceStatements
} from './lib/backup-update-data'
import {
  createBackupUpdateWorkspace,
  commitBackupUpdate,
  recoverBackupUpdate,
  acquireBackupUpdateSession
} from './lib/backup-update-workspace'
import {
  BACKUP_SOURCE_PROJECT,
  assertSourceConnection,
  digestValue,
  functionIdentity,
  normalizedDump,
  parseCliArray,
  parseSourceFunctions,
  readDataSchemas,
  readSourceCatalog,
  readStorageObjects,
  type BackupSourceSql,
  type SourceCatalog,
  type SourceFunction,
  type StorageObject,
  readManagedProjectSql,
  type SourceConnection
} from './lib/backup-update-source'
import {
  UPDATE_REPOSITORY_ROOT,
  exists,
  fileHash,
  makeSnapshotManifest,
  readJson,
  runUpdateCommand,
  verifyUpdateSnapshot,
  writeJson,
  type UpdateCommand
} from './lib/backup-update-io'

interface UpdateInput {
  UpdateBackupPath: string
  DbPassword: string
  PlanOnly: boolean
  ApplyUpdate: boolean
  PlanId?: string
  RecoverUpdate?: boolean
}
type UpdateItem = BackupUpdateReport['items'][number]
interface TableAction {
  source?: SourceTable
  previous?: CopyTable
  fingerprint?: TableFingerprint
  item: UpdateItem
}
interface DataActions {
  file: string
  inventory: CopyInventory
  actions: TableAction[]
  sequences?: string[]
  sequenceChanged?: boolean
}
interface UpdateIndex {
  formatVersion: 1
  algorithm: string
  manifestSha256: string
  catalog: SourceCatalog
  storage: Array<{ key: string; identity: string; sha256: string }>
}
interface SavedUpdatePlan {
  formatVersion: 1
  backupPath: string
  baseManifestSha256: string
  shape: string
  report: BackupUpdateReport
}
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[1-5][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i
const COPY_FINGERPRINT_ALGORITHM = 'copy-text-sha256-eight-lane-sum-v1'
const MAX_SOURCE_DURATION_MS = 15 * 60_000
const logStage = (message: string) => process.stdout.write(`阶段：${message}\n`)
const objectKey = (item: Pick<StorageObject, 'bucket_id' | 'name'>) =>
  `${item.bucket_id}/${item.name}`
const storageIdentity = (item: StorageObject) =>
  digestValue([item.id, item.version, item.etag, item.size, item.updated_at])
const sameFingerprint = (a: TableFingerprint, b: TableFingerprint) =>
  a.rows === b.rows && a.sums.every((value, index) => value === b.sums[index])

function isUpdateIndex(value: unknown): value is UpdateIndex {
  if (
    !isObjectRecord(value) ||
    value.formatVersion !== 1 ||
    value.algorithm !== COPY_FINGERPRINT_ALGORITHM ||
    typeof value.manifestSha256 !== 'string' ||
    !/^[a-f\d]{64}$/i.test(value.manifestSha256) ||
    !isObjectRecord(value.catalog) ||
    !Array.isArray(value.storage)
  )
    return false
  for (const key of ['schema', 'roles', 'managedSchema', 'migrationHistory'])
    if (
      typeof value.catalog[key] !== 'string' ||
      !/^[a-f\d]{32}$/i.test(String(value.catalog[key]))
    )
      return false
  return value.storage.every(
    (item: unknown) =>
      isObjectRecord(item) &&
      typeof item.key === 'string' &&
      typeof item.identity === 'string' &&
      /^[a-f\d]{64}$/i.test(item.identity) &&
      typeof item.sha256 === 'string' &&
      /^[a-f\d]{64}$/i.test(item.sha256)
  )
}
function normalizeMetadata(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (key: string, item: unknown) => {
      if (
        typeof item === 'string' &&
        ['created_at', 'updated_at'].includes(key) &&
        Number.isFinite(Date.parse(item))
      )
        return new Date(item).toISOString()
      if (
        key === 'object_count' &&
        typeof item === 'string' &&
        /^\d+$/.test(item) &&
        Number.isSafeInteger(Number(item))
      )
        return Number(item)
      return item
    })
  ) as unknown
}
async function writeMetadataIfChanged(file: string, value: unknown): Promise<boolean> {
  if (await exists(file)) {
    try {
      const old = parseCliArray(await readFile(file, 'utf8'))
      if (isDeepStrictEqual(normalizeMetadata(old), normalizeMetadata(value))) return false
    } catch {
      /* Verified non-array formats are intentionally replaced by current metadata. */
    }
  }
  await writeJson(file, value)
  return true
}

export function parseBackupUpdateInput(value: unknown): UpdateInput {
  if (
    !isObjectRecord(value) ||
    typeof value.UpdateBackupPath !== 'string' ||
    !path.isAbsolute(value.UpdateBackupPath) ||
    /[\0\r\n]/.test(value.UpdateBackupPath) ||
    typeof value.DbPassword !== 'string' ||
    (!value.DbPassword && value.RecoverUpdate !== true) ||
    value.DbPassword.includes('\0') ||
    (value.PlanId !== undefined &&
      (typeof value.PlanId !== 'string' || !UUID.test(value.PlanId))) ||
    typeof value.PlanOnly !== 'boolean' ||
    typeof value.ApplyUpdate !== 'boolean' ||
    (value.PlanOnly === value.ApplyUpdate && value.RecoverUpdate !== true)
  )
    throw new Error('请选择检查或更新模式，并填写原备份目录和来源数据库密码。')
  return {
    UpdateBackupPath: path.resolve(value.UpdateBackupPath),
    DbPassword: value.DbPassword,
    PlanOnly: value.PlanOnly,
    ApplyUpdate: value.ApplyUpdate,
    ...(typeof value.PlanId === 'string' ? { PlanId: value.PlanId } : {}),
    ...(value.RecoverUpdate === true ? { RecoverUpdate: true } : {})
  }
}

function summarize(items: UpdateItem[]): BackupUpdateReport['summary'] {
  return {
    added: items.filter((item) => item.status === 'added').length,
    changed: items.filter((item) => item.status === 'changed' || item.status === 'check').length,
    removed: items.filter((item) => item.status === 'removed').length,
    unchanged: items.filter((item) => item.status === 'unchanged').length
  }
}
function shapeOf(items: UpdateItem[]): string {
  return digestValue(
    items
      .filter((item) => item.status !== 'unchanged')
      .map((item) => [item.kind, item.key, item.status])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  )
}
function catalogItems(catalog: SourceCatalog, previous?: UpdateIndex): UpdateItem[] {
  const components = [
    ['schema', 'schema', 'schema.sql', '数据库结构、函数和 RLS 策略'],
    ['roles', 'roles', 'roles.sql', '自定义角色'],
    ['managedSchema', 'managedSchema', 'managed-schema-snapshot.sql', 'Auth / Storage 结构参考'],
    ['migrationHistory', 'migrationHistory', 'migration-history-schema.sql', '迁移历史表结构']
  ] as const
  return components.map(([field, kind, key, label]) => ({
    kind,
    key,
    label,
    status: previous
      ? previous.catalog[field] === catalog[field]
        ? 'unchanged'
        : 'changed'
      : 'check',
    ...(!previous
      ? { detail: '旧备份没有来源结构指纹，本次只校对该结构文件，不重新导出全部数据。' }
      : {})
  }))
}

async function dataActions(
  sql: BackupSourceSql,
  root: string,
  file: string,
  schemas: string[]
): Promise<DataActions> {
  logStage(`读取本地 ${file} 比较基线`)
  const inventory = await readCopyInventory(path.join(root, 'database', file))
  const sourceTables = (await listSourceTables(sql, schemas)).filter(
    (table) =>
      !['storage.buckets_vectors', 'storage.vector_indexes'].includes(
        `${table.schema}.${table.name}`
      )
  )
  const previous = new Map(inventory.tables.map((table) => [table.key, table]))
  const actions: TableAction[] = []
  for (const [index, source] of sourceTables.entries()) {
    logStage(`比较数据表 ${index + 1}/${sourceTables.length}：${source.schema}.${source.name}`)
    const fingerprint = await fingerprintSourceTable(sql, source)
    const old = previous.get(source.key)
    previous.delete(source.key)
    const equal =
      old &&
      JSON.stringify(old.columns) === JSON.stringify(source.columns) &&
      sameFingerprint(old.fingerprint, fingerprint)
    actions.push({
      source,
      previous: old,
      fingerprint,
      item: {
        kind: 'table',
        key: source.key,
        label: `${source.schema}.${source.name}`,
        status: !old ? 'added' : equal ? 'unchanged' : 'changed',
        detail: equal
          ? '内容指纹一致，复用本地 COPY 数据，不下载。'
          : '仅导出这张表的数据；其他表的 COPY 数据复用。'
      }
    })
  }
  for (const old of previous.values())
    actions.push({
      previous: old,
      item: {
        kind: 'table',
        key: old.key,
        label: `${old.schema}.${old.name}`,
        status: 'removed',
        detail: '来源已无此表，更新快照不再保留该表数据。'
      }
    })
  return { file, inventory, actions }
}

async function inspectStorage(
  root: string,
  source: StorageObject[],
  index?: UpdateIndex
): Promise<UpdateItem[]> {
  const prior = new Map((index?.storage || []).map((item) => [item.key, item]))
  const files = new Set<string>()
  async function visit(directory: string): Promise<void> {
    if (!(await exists(directory))) return
    for (const item of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, item.name)
      if (item.isSymbolicLink()) throw new Error('Storage 备份中存在链接，已停止更新。')
      if (item.isDirectory()) await visit(target)
      else if (item.isFile())
        files.add(path.relative(path.join(root, 'storage'), target).split(path.sep).join('/'))
    }
  }
  await visit(path.join(root, 'storage'))
  const items: UpdateItem[] = []
  for (const object of source) {
    const key = objectKey(object),
      target = path.join(root, 'storage', ...key.split('/'))
    const present = files.delete(key),
      old = prior.get(key)
    let equal = false
    if (present && (await stat(target)).size === object.size) {
      if (
        old &&
        old.identity === storageIdentity(object) &&
        old.sha256 === (await fileHash(target))
      )
        equal = true
      else if (object.etag && /^[a-f\d]{32}$/i.test(object.etag.replaceAll('"', '')))
        equal = (await fileHash(target, 'md5')) === object.etag.replaceAll('"', '').toLowerCase()
    }
    items.push({
      kind: 'storage',
      key,
      label: key,
      status: !present ? 'added' : equal ? 'unchanged' : 'changed',
      detail: equal
        ? '对象版本或 ETag 与本地内容一致，不下载。'
        : '对象已变化或缺少可信版本，下载后核对。'
    })
  }
  for (const key of files)
    items.push({
      kind: 'storage',
      key,
      label: key,
      status: 'removed',
      detail: '来源已移除该附件，旧文件将保留在本机历史归档。'
    })
  return items
}

async function cliFunctions(
  run: UpdateCommand
): Promise<{ functions: SourceFunction[]; raw: unknown[] }> {
  const response = await run('supabase', [
    'functions',
    'list',
    '--project-ref',
    BACKUP_SOURCE_PROJECT,
    '--output',
    'json'
  ])
  if (response.code !== 0) throw new Error('无法读取来源函数清单，请检查 Supabase CLI 登录和网络。')
  const raw = parseCliArray(response.stdout)
  return { raw, functions: parseSourceFunctions(raw) }
}

async function dumpComponent(
  file: string,
  destination: string,
  password: string,
  run: UpdateCommand
): Promise<void> {
  const argumentsByFile: Record<string, string[]> = {
    'schema.sql': ['--keep-comments'],
    'roles.sql': ['--role-only'],
    'managed-schema-snapshot.sql': ['--schema', 'auth,storage', '--keep-comments'],
    'migration-history-schema.sql': ['--schema', 'supabase_migrations']
  }
  logStage(`校对结构文件 ${file}`)
  const result = await run(
    'supabase',
    ['db', 'dump', '--linked', ...argumentsByFile[file], '--file', destination],
    {
      env: { SUPABASE_DB_PASSWORD: password, PGPASSWORD: password },
      timeoutMs: MAX_SOURCE_DURATION_MS
    }
  )
  if (result.code !== 0 || !(await exists(destination)))
    throw new Error(`结构文件 ${file} 导出失败，原备份保持不变。`)
}

async function selectPostgresImage(run: UpdateCommand, major: number): Promise<string> {
  const result = await run('docker', ['image', 'ls', '--format', '{{.Repository}}:{{.Tag}}'])
  if (result.code !== 0) throw new Error('Docker Desktop 未就绪，请启动后更新。')
  const selected = result.stdout
    .split(/\r?\n/)
    .find((line) => new RegExp(`^(?:public\\.ecr\\.aws/)?supabase/postgres:${major}\\.`).test(line))
  if (!selected)
    throw new Error('本机没有与来源数据库主版本匹配的 PostgreSQL 镜像，请先完成环境检查。')
  return selected
}

async function dumpTable(
  table: SourceTable,
  target: string,
  snapshot: string,
  connection: { Host: string; Port: number; User: string; Database: string },
  password: string,
  image: string,
  run: UpdateCommand
): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true })
  const identifier = (value: string) => `"${value.replaceAll('"', '""')}"`
  // A stdin watcher terminates pg_dump if its owning Node/Docker client dies.
  // No user text is interpolated into this shell program; dump options are argv.
  const watcher =
    'pg_dump "$@" & dump=$!; (cat >/dev/null; kill -TERM "$dump" 2>/dev/null) <&0 & guard=$!; wait "$dump"; code=$?; kill "$guard" 2>/dev/null || :; exit "$code"'
  const result = await run(
    'docker',
    [
      'run',
      '--rm',
      '-i',
      '--name',
      `art_backup_update_${randomUUID().replaceAll('-', '')}`,
      '-e',
      'PGPASSWORD',
      '-e',
      'PGTZ=UTC',
      '-e',
      'PGCLIENTENCODING=UTF8',
      '-e',
      'PGOPTIONS=-c default_transaction_read_only=on -c DateStyle=ISO,MDY -c IntervalStyle=postgres -c extra_float_digits=3 -c bytea_output=hex',
      '-v',
      `${path.dirname(target)}:/out`,
      '--entrypoint',
      '/bin/sh',
      image,
      '-c',
      watcher,
      'backup-pg-dump',
      '--host',
      connection.Host,
      '--port',
      String(connection.Port),
      '--username',
      connection.User,
      '--dbname',
      connection.Database,
      '--snapshot',
      snapshot,
      '--data-only',
      '--quote-all-identifiers',
      '--table',
      `${identifier(table.schema)}.${identifier(table.name)}`,
      '--file',
      `/out/${path.basename(target)}`
    ],
    { env: { PGPASSWORD: password }, keepStdinOpen: true, timeoutMs: MAX_SOURCE_DURATION_MS }
  )
  if (result.code !== 0)
    throw new Error(
      `数据表 ${table.schema}.${table.name} 导出失败。完整旧版本仍保留，可按同一计划重试。`
    )
}

async function readSequenceStatements(sql: BackupSourceSql, schemas: string[]): Promise<string[]> {
  const rows = await sql.unsafe(
    `select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind='S' and n.nspname=any($1::text[]) order by n.nspname,c.relname`,
    [schemas]
  )
  const statements: string[] = []
  const identifier = (value: string) => `"${value.replaceAll('"', '""')}"`
  for (const row of rows) {
    if (typeof row.nspname !== 'string' || typeof row.relname !== 'string')
      throw new Error('来源序列标识无效。')
    const name = `${identifier(row.nspname)}.${identifier(row.relname)}`
    const state = await sql.unsafe(`select last_value::text,is_called from ${name}`)
    const value = state[0]
    if (
      !value ||
      typeof value.last_value !== 'string' ||
      !/^-?\d+$/.test(value.last_value) ||
      typeof value.is_called !== 'boolean'
    )
      throw new Error('来源序列状态读取失败。')
    statements.push(
      `SELECT pg_catalog.setval('${name.replaceAll("'", "''")}', ${value.last_value}, ${value.is_called ? 'true' : 'false'});`
    )
  }
  return statements
}

async function readMetadata(sql: BackupSourceSql): Promise<Record<string, unknown>> {
  const buckets = await sql.unsafe(
    `select id,name,public,file_size_limit,allowed_mime_types,created_at::text,updated_at::text from storage.buckets order by id`
  )
  const counts = await sql.unsafe(
    `select bucket_id,count(*)::text object_count from storage.objects group by bucket_id order by bucket_id`
  )
  const realtime = await sql.unsafe(
    `select schemaname,tablename from pg_publication_tables where pubname='supabase_realtime' order by schemaname,tablename`
  )
  return {
    'storage-buckets.json': buckets,
    'storage-object-counts.json': counts,
    'realtime-publication-tables.json': realtime
  }
}

export async function runBackupUpdate(
  input: UpdateInput,
  run: UpdateCommand = runUpdateCommand,
  connectSource:(connection:SourceConnection,password:string)=>ReturnType<typeof postgres>=(connection,password)=>postgres({host:connection.Host,port:connection.Port,username:connection.User,database:connection.Database,password,ssl:{rejectUnauthorized:true},max:2,prepare:false,connect_timeout:20,idle_timeout:30,onnotice:()=>{}})
): Promise<BackupUpdateReport> {
  const root = path.resolve(input.UpdateBackupPath),
    planId = input.PlanId || randomUUID(),
    startedAt = new Date().toISOString()
  const cacheRoot = path.join(
    UPDATE_REPOSITORY_ROOT,
    '.artifacts/supabase-operations/backup-update-cache',
    digestValue(root.toLowerCase())
  )
  await mkdir(cacheRoot, { recursive: true })
  const report: BackupUpdateReport = {
    formatVersion: 1,
    mode: input.PlanOnly ? 'preview' : 'apply',
    status: 'failed',
    backupPath: root,
    sourceProjectRef: BACKUP_SOURCE_PROJECT,
    planId,
    baseManifestSha256: '0'.repeat(64),
    startedAt,
    completedAt: startedAt,
    summary: { added: 0, changed: 0, removed: 0, unchanged: 0 },
    items: [],
    warnings: [
      '未变化的表仍需只读扫描以判断内容是否变化；不会重新下载这些表。',
      '结构文件首次需要校对；发生结构或策略变化时重新导出该结构文件，业务数据按表复用。',
      '更新的是本机完整备份，不会自动修改其他人的 Docker 数据库；恢复后仍需业务核对。'
    ]
  }
  let database: ReturnType<typeof postgres> | undefined
  let releaseSession: (() => Promise<void>) | undefined
  try {
    releaseSession = await acquireBackupUpdateSession(root)
    logStage('检查上次更新状态')
    const recovered=await recoverBackupUpdate(root)
    if(recovered)report.warnings.unshift('已先恢复上次未完成文件提交的原快照。')
    if (input.RecoverUpdate) {
      report.baseManifestSha256 = await fileHash(path.join(root, 'manifest.json'))
      report.status = 'unchanged'
      report.warnings = [recovered?'已恢复上次未完成的文件提交，原完整快照可继续使用。':'未发现待恢复的文件提交，当前备份未改动。']
      return report
    }
    logStage('校验已有完整备份')
    await verifyUpdateSnapshot(root, path.join(cacheRoot, `verify-base-${randomUUID()}.json`), run)
    const manifest = await readJson(path.join(root, 'manifest.json'))
    if (
      !isObjectRecord(manifest) ||
      manifest.project_ref !== BACKUP_SOURCE_PROJECT ||
      manifest.recipient_safe_auth === true
    )
      throw new Error('只能更新本项目所有者的原始完整备份，不能更新已经清理凭据的分享包。')
    report.baseManifestSha256 = await fileHash(path.join(root, 'manifest.json'))
    const connection = await readJson(path.join(root, 'metadata/database-connection.json'))
    assertSourceConnection(connection)
    const priorValue = (await exists(path.join(cacheRoot, 'index.json')))
      ? await readJson(path.join(cacheRoot, 'index.json'))
      : null
    const index =
      isUpdateIndex(priorValue) && priorValue.manifestSha256 === report.baseManifestSha256
        ? priorValue
        : undefined
    const storedPlanFile = path.join(cacheRoot, `plan-${planId}.json`)
    const storedValue =
      input.PlanId && (await exists(storedPlanFile)) ? await readJson(storedPlanFile) : null
    if (
      input.PlanId &&
      (!isObjectRecord(storedValue) ||
        storedValue.baseManifestSha256 !== report.baseManifestSha256 ||
        storedValue.backupPath !== root)
    )
      throw new Error('更新计划对应的本地备份已经变化，请重新检查远端变化。')
    database = connectSource(connection,input.DbPassword)
    const sourceSql = database
    const originalFunctions = parseSourceFunctions(
      parseCliArray(await readFile(path.join(root, 'metadata/functions.json'), 'utf8'))
    )
    const latestFunctions = await cliFunctions(run)
    await sourceSql.begin('isolation level repeatable read read only', async (transaction) => {
      const sql: BackupSourceSql = transaction
      await sql.unsafe(
        "set local timezone='UTC'; set local datestyle='ISO, MDY'; set local intervalstyle='postgres'; set local extra_float_digits=3; set local bytea_output=hex; set local search_path=''; set local row_security=off; set local statement_timeout='120s'; set local idle_in_transaction_session_timeout='15min'"
      )
      const snapshotRows = await sql.unsafe(
        "select pg_export_snapshot() snapshot, current_setting('server_version_num') version"
      )
      const snapshot = String(snapshotRows[0]?.snapshot || ''),
        version = Number(snapshotRows[0]?.version)
      if (!/^[a-f\d-]{1,128}$/i.test(snapshot) || !Number.isSafeInteger(version))
        throw new Error('无法建立来源只读比较快照。')
      if (version >= 170000) await sql.unsafe("set local transaction_timeout='15min'")
      logStage('读取来源结构与策略指纹')
      const catalog = await readSourceCatalog(sql)
      const firstInventory = await readCopyInventory(path.join(root, 'database/data.sql'))
      const schemas = await readDataSchemas(sql, [
        ...new Set(firstInventory.tables.map((table) => table.schema))
      ])
      const mainData = await dataActions(sql, root, 'data.sql', schemas)
      const migrationData = await dataActions(sql, root, 'migration-history-data.sql', [
        'supabase_migrations'
      ])
      const data = [mainData, migrationData]
      for (const part of data) {
        part.sequences = await readSequenceStatements(
          sql,
          part.file === 'data.sql' ? schemas : ['supabase_migrations']
        )
        part.sequenceChanged =
          normalizeSequenceStatements(part.sequences) !==
          normalizeSequenceStatements(part.inventory.sequenceStatements)
      }
      const storage = await readStorageObjects(sql)
      const storageItems = await inspectStorage(root, storage, index)
      const oldFunctions = new Map(originalFunctions.map((item) => [item.slug, item]))
      const functionItems: UpdateItem[] = latestFunctions.functions.map((item) => {
        const old = oldFunctions.get(item.slug)
        oldFunctions.delete(item.slug)
        return {
          kind: 'function',
          key: item.slug,
          label: item.slug,
          status: !old
            ? 'added'
            : functionIdentity(old) === functionIdentity(item)
              ? 'unchanged'
              : 'changed'
        }
      })
      for (const item of oldFunctions.values())
        functionItems.push({
          kind: 'function',
          key: item.slug,
          label: item.slug,
          status: 'removed'
        })
      report.items = [
        ...catalogItems(catalog, index),
        ...data.flatMap((part) => part.actions.map((action) => action.item)),
        ...functionItems,
        ...storageItems
      ]
      for (const part of data)
        report.items.push({
          kind: 'table',
          key: `sequences:${part.file}`,
          label: `${part.file} 自增序列`,
          status: part.sequenceChanged ? 'changed' : 'unchanged',
          detail: '核对序列值；仅序列变化时在本机重组文件，不重新下载数据表。'
        })
      report.summary = summarize(report.items)
      if (report.items.length > 5000)
        throw new Error('变更对象数量超过本次交互可核对范围，请分批处理。')
      const shape = shapeOf(report.items)
      if (input.ApplyUpdate && isObjectRecord(storedValue) && storedValue.shape !== shape)
        throw new Error('执行时发现新的变更范围，请重新检查并核对更新计划。')
      if (input.PlanOnly) {
        report.status =
          report.summary.added + report.summary.changed + report.summary.removed > 0
            ? 'planned'
            : 'unchanged'
        await writeJson(storedPlanFile, {
          formatVersion: 1,
          backupPath: root,
          baseManifestSha256: report.baseManifestSha256,
          shape,
          report
        } satisfies SavedUpdatePlan)
        return
      }
      const changes = report.items.filter((item) => item.status !== 'unchanged')
      if (changes.length === 0) {
        report.status = 'unchanged'
        return
      }
      const workspace = await createBackupUpdateWorkspace(root, planId)
      const stage = workspace.snapshot
      const childEnv = { SUPABASE_DB_PASSWORD: input.DbPassword, PGPASSWORD: input.DbPassword }
      for (const component of report.items.filter(
        (item) =>
          ['schema', 'roles', 'managedSchema', 'migrationHistory'].includes(item.kind) &&
          item.status !== 'unchanged'
      )) {
        const temp = path.join(workspace.root, `new-${component.key}`)
        await dumpComponent(component.key, temp, input.DbPassword, run)
        const old = await readFile(path.join(root, 'database', component.key), 'utf8')
        const fresh = await readFile(temp, 'utf8')
        if (normalizedDump(old) === normalizedDump(fresh)) component.status = 'unchanged'
        else await copyFile(temp, path.join(stage, 'database', component.key))
      }
      if (
        report.items.some((item) => item.kind === 'managedSchema' && item.status !== 'unchanged') ||
        !(await exists(path.join(root, 'database/managed-project-objects.sql')))
      ) {
        const managedFile = path.join(stage, 'database/managed-project-objects.sql')
        const managedSql = await readManagedProjectSql(sql)
        const present = await exists(managedFile)
        if (!present || (await readFile(managedFile, 'utf8')) !== managedSql) {
          await writeFile(managedFile, managedSql, 'utf8')
          report.items.push({
            kind: 'metadata',
            key: 'managed-project-objects',
            label: '托管 schema 的项目策略与触发器',
            status: present ? 'changed' : 'added',
            detail: '单独保存项目自定义对象，恢复时不覆盖 Supabase 平台基础表。'
          })
        }
      }
      const image = data.some((part) =>
        part.actions.some((action) => action.item.status !== 'unchanged')
      )
        ? await selectPostgresImage(run, Math.floor(version / 10000))
        : ''
      for (const part of data) {
        const modified =
          part.sequenceChanged || part.actions.some((action) => action.item.status !== 'unchanged')
        if (!modified) {
          logStage(`跳过未变化的 ${part.file}`)
          continue
        }
        const blocks: Array<{ file: string; start: number; end: number }> = []
        for (const action of part.actions) {
          if (!action.source || action.item.status === 'removed') continue
          if (action.item.status === 'unchanged' && action.previous) {
            blocks.push({
              file: path.join(root, 'database', part.file),
              start: action.previous.start,
              end: action.previous.end
            })
            continue
          }
          const target = path.join(workspace.root, `table-${digestValue(action.source.key)}.sql`)
          let captured: CopyTable | undefined
          if (await exists(target)) {
            try {
              captured = (await readCopyInventory(target)).tables.find(
                (table) => table.key === action.source!.key
              )
            } catch {
              captured = undefined
            }
          }
          if (
            !captured ||
            !action.fingerprint ||
            !sameFingerprint(captured.fingerprint, action.fingerprint)
          ) {
            logStage(`仅下载变化表：${action.item.label}`)
            await dumpTable(
              action.source,
              target,
              snapshot,
              connection,
              input.DbPassword,
              image,
              run
            )
            captured = (await readCopyInventory(target)).tables.find(
              (table) => table.key === action.source!.key
            )
          }
          if (
            !captured ||
            !action.fingerprint ||
            JSON.stringify(captured.columns) !== JSON.stringify(action.source.columns) ||
            !sameFingerprint(captured.fingerprint, action.fingerprint)
          )
            throw new Error(`数据表 ${action.item.label} 导出校验未通过，原备份未替换。`)
          blocks.push({ file: target, start: captured.start, end: captured.end })
        }
        const sequences = part.sequences || []
        const assembled = path.join(workspace.root, `assembled-${part.file}`)
        await rm(assembled, { force: true })
        await buildDataDump(assembled, blocks, sequences)
        await copyFile(assembled, path.join(stage, 'database', part.file))
      }
      if (functionItems.some((item) => item.status !== 'unchanged')) {
        logStage('只下载变化的函数，复用现有独立函数包')
        const metadata = path.join(workspace.root, 'functions-new.json')
        await writeJson(metadata, latestFunctions.raw)
        const result = await run(
          'powershell.exe',
          [
            '-NoProfile',
            '-NonInteractive',
            '-File',
            path.join(UPDATE_REPOSITORY_ROOT, 'supabase/update-backup-functions.ps1')
          ],
          {
            input:
              JSON.stringify({
                BackupPath: root,
                StagePath: stage,
                FunctionMetadataPath: metadata
              }) + '\n',
            timeoutMs: MAX_SOURCE_DURATION_MS,
            env: childEnv
          }
        )
        if (result.code !== 0)
          throw new Error('更新函数源码失败，已完成的缓存保留，可使用同一计划重试。')
      }
      await writeMetadataIfChanged(path.join(stage, 'metadata/functions.json'), latestFunctions.raw)
      for (const item of storageItems) {
        if (item.status === 'unchanged') continue
        const target = path.join(stage, 'storage', ...item.key.split('/'))
        if (item.status === 'removed') {
          await rm(target, { force: true })
          continue
        }
        logStage(`只下载变化附件：${item.key}`)
        await mkdir(path.dirname(target), { recursive: true })
        const encoded = item.key
          .split('/')
          .map((segment) => encodeURIComponent(segment))
          .join('/')
        const response = await run(
          'supabase',
          [
            'storage',
            'cp',
            `ss:///${encoded}`,
            target,
            '--experimental',
            '--workdir',
            UPDATE_REPOSITORY_ROOT
          ],
          { env: childEnv }
        )
        if (response.code !== 0) throw new Error('变化附件下载失败，原备份保持不变。')
        const object = storage.find((candidate) => objectKey(candidate) === item.key)!
        if ((await stat(target)).size !== object.size)
          throw new Error('变化附件大小不一致，请重新检查来源状态。')
        if (
          object.etag &&
          /^[a-f\d]{32}$/i.test(object.etag.replaceAll('"', '')) &&
          (await fileHash(target, 'md5')) !== object.etag.replaceAll('"', '').toLowerCase()
        )
          throw new Error('变化附件 ETag 校验未通过，请重新检查来源状态。')
      }
      const metadata = await readMetadata(sql)
      let metadataChanged = false
      for (const [name, value] of Object.entries(metadata))
        metadataChanged =
          (await writeMetadataIfChanged(path.join(stage, 'metadata', name), value)) ||
          metadataChanged
      if (
        storageItems.some((item) => item.status !== 'unchanged') ||
        (await exists(path.join(stage, 'metadata/storage-object-inventory.json')))
      )
        metadataChanged =
          (await writeMetadataIfChanged(
            path.join(stage, 'metadata/storage-object-inventory.json'),
            storage
          )) || metadataChanged
      if (metadataChanged)
        report.items.push({
          kind: 'metadata',
          key: 'metadata',
          label: '来源元数据清单',
          status: 'changed',
          detail: '同步函数、Storage 与 Realtime 的最新描述，文件内容已校验。'
        })
      const checkFunctions = await cliFunctions(run)
      if (
        digestValue(checkFunctions.functions.map(functionIdentity).sort()) !==
        digestValue(latestFunctions.functions.map(functionIdentity).sort())
      )
        throw new Error('下载期间函数部署发生变化，原备份保留，请重新检查变化。')
      const fresh = await sourceSql.begin('read only', async (check) => {
        await check.unsafe(
          "set local timezone='UTC'; set local datestyle='ISO, MDY'; set local search_path=''"
        )
        return { catalog: await readSourceCatalog(check), storage: await readStorageObjects(check) }
      })
      if (
        digestValue(fresh.catalog) !== digestValue(catalog) ||
        digestValue(fresh.storage) !== digestValue(storage)
      )
        throw new Error('导出期间结构、角色或附件发生变化，原备份保留，请重新检查变化。')
      // Stage progress is diagnostic only; the completed snapshot is authoritative.
      await rm(path.join(stage, 'metadata/backup-progress.json'), { force: true })
      await rm(path.join(stage, 'metadata/functions-progress.json'), { force: true })
      await makeSnapshotManifest(stage, manifest, report.baseManifestSha256)
      logStage('校验更新后的完整快照')
      await verifyUpdateSnapshot(
        stage,
        path.join(workspace.root, `verify-stage-${randomUUID()}.json`),
        run
      )
      logStage('归档旧文件并提交更新，完成清单最后替换')
      const committed = await commitBackupUpdate(root, stage, report.baseManifestSha256)
      report.historyPath = committed.historyPath
      report.resultManifestSha256 = await fileHash(path.join(root, 'manifest.json'))
      const storageIndex: UpdateIndex['storage'] = []
      for (const object of storage)
        storageIndex.push({
          key: objectKey(object),
          identity: storageIdentity(object),
          sha256: await fileHash(path.join(root, 'storage', ...objectKey(object).split('/')))
        })
      await writeJson(path.join(cacheRoot, 'index.json'), {
        formatVersion: 1,
        algorithm: COPY_FINGERPRINT_ALGORITHM,
        manifestSha256: report.resultManifestSha256,
        catalog,
        storage: storageIndex
      } satisfies UpdateIndex)
      report.summary = summarize(report.items)
      report.status = committed.changedFiles + committed.removedFiles > 0 ? 'updated' : 'unchanged'
    })
    return report
  } catch (cause) {
    report.status = 'failed'
    report.error =
      cause instanceof Error &&
      /[\u4e00-\u9fff]/.test(cause.message) &&
      !/password|postgres:\/\/|postgresql:\/\//i.test(cause.message)
        ? cause.message
        : '来源数据库连接或网络异常，请检查来源密码、5432 端口和证书设置后重试。'
    return report
  } finally {
    await database?.end({ timeout: 5 }).catch(() => {})
    await releaseSession?.()
    input.DbPassword = ''
    report.completedAt = new Date().toISOString()
    report.summary = summarize(report.items)
  }
}

async function main(): Promise<void> {
  let text = ''
  for await (const chunk of process.stdin) {
    text += String(chunk)
    if (text.length > 32768) throw new Error('更新输入过大。')
  }
  const input = parseBackupUpdateInput(JSON.parse(text))
  const report = await runBackupUpdate(input)
  const requested = process.env.SUPABASE_OPS_UPDATE_REPORT_PATH
  const destination =
    requested ||
    path.join(
      UPDATE_REPOSITORY_ROOT,
      '.artifacts/supabase-operations',
      `${report.planId}.update-cli.json`
    )
  if (path.resolve(destination).startsWith(path.resolve(input.UpdateBackupPath) + path.sep))
    throw new Error('更新报告不能写入备份目录。')
  await writeJson(destination, report)
  process.stdout.write(`更新报告：${destination}\n`)
  process.stdout.write(
    `更新结果：新增 ${report.summary.added}，变化 ${report.summary.changed}，移除 ${report.summary.removed}，跳过 ${report.summary.unchanged}\n`
  )
  if (report.status === 'failed') {
    process.stderr.write((report.error || '更新未完成，旧版本已保留。') + '\n')
    process.exitCode = 1
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  void main().catch(() => {
    process.stderr.write('无法启动备份更新，请检查参数和本机依赖。\n')
    process.exitCode = 1
  })
