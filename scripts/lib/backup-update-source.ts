import type { Sql } from 'postgres'
import { createHash } from 'node:crypto'
import { isObjectRecord } from '../../src/utils/record'

export const BACKUP_SOURCE_PROJECT = 'ckbftoopuyophiebamwy'
export type BackupSourceSql = Pick<Sql, 'unsafe'>
export interface SourceConnection {
  Host: string
  Port: number
  User: string
  Database: string
}
export interface SourceFunction {
  slug: string
  id: string
  version: number
  ezbr_sha256: string
  verify_jwt: boolean
  entrypoint_path?: string
  import_map?: boolean
}
export interface StorageObject {
  id: string
  bucket_id: string
  name: string
  version: string | null
  etag: string | null
  size: number
  updated_at: string | null
  content_type: string | null
  cache_control: string | null
}
export interface SourceCatalog {
  schema: string
  roles: string
  managedSchema: string
  migrationHistory: string
}

export function digestValue(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export function assertSourceConnection(value: unknown): asserts value is SourceConnection {
  if (
    !isObjectRecord(value) ||
    typeof value.Host !== 'string' ||
    !Number.isInteger(value.Port) ||
    value.Port !== 5432 ||
    value.Database !== 'postgres' ||
    !(
      (value.Host === `db.${BACKUP_SOURCE_PROJECT}.supabase.co` && value.User === 'postgres') ||
      (/^[a-z0-9-]+\.pooler\.supabase\.com$/.test(value.Host) &&
        value.User === `postgres.${BACKUP_SOURCE_PROJECT}`)
    )
  )
    throw new Error('备份中的来源连接不属于本项目，或不是支持快照的 5432 端口。请检查项目关联。')
}

export function parseCliArray(text: string): unknown[] {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start < 0 || end < start) throw new Error('来源命令未返回有效清单。')
  const value: unknown = JSON.parse(text.slice(start, end + 1))
  if (!Array.isArray(value)) throw new Error('来源命令清单格式无效。')
  if (value.length === 1 && isObjectRecord(value[0]) && Array.isArray(value[0].rows))
    return value[0].rows
  return value
}

export function parseSourceFunctions(rows: unknown[]): SourceFunction[] {
  const slugs = new Set<string>()
  return rows.map((row) => {
    if (
      !isObjectRecord(row) ||
      typeof row.slug !== 'string' ||
      !/^[a-z0-9][a-z0-9_-]*$/.test(row.slug) ||
      slugs.has(row.slug) ||
      typeof row.id !== 'string' ||
      !Number.isInteger(row.version) ||
      typeof row.ezbr_sha256 !== 'string' ||
      !/^[a-f\d]{64}$/i.test(row.ezbr_sha256) ||
      typeof row.verify_jwt !== 'boolean'
    )
      throw new Error('来源函数清单缺少可核对的部署版本。')
    slugs.add(row.slug)
    return {
      slug: row.slug,
      id: row.id,
      version: Number(row.version),
      ezbr_sha256: row.ezbr_sha256,
      verify_jwt: row.verify_jwt,
      ...(typeof row.entrypoint_path === 'string' ? { entrypoint_path: row.entrypoint_path } : {}),
      ...(typeof row.import_map === 'boolean' ? { import_map: row.import_map } : {})
    }
  })
}

export function functionIdentity(value: SourceFunction): string {
  return digestValue([
    value.slug,
    value.id,
    value.version,
    value.ezbr_sha256,
    value.verify_jwt,
    value.entrypoint_path || '',
    Boolean(value.import_map)
  ])
}

/** Source-only catalog signatures; OIDs are stable within this exact project.
 * Exclude vacuum/statistics counters so normal DML does not re-export schema. */
export async function readSourceCatalog(sql: BackupSourceSql): Promise<SourceCatalog> {
  const rows = await sql.unsafe(`
    with ns as (
      select oid,nspname from pg_namespace
      where nspname !~ '^pg_' and nspname <> 'information_schema'
    ), objects as (
      select n.nspname, 'namespace' kind, n.oid::text key, to_jsonb(n0) value
      from ns n join pg_namespace n0 using(oid)
      union all select n.nspname,'class',c.oid::text,
        to_jsonb(c) - array['relpages','reltuples','relallvisible','relallfrozen','relfrozenxid','relminmxid','relfilenode']
        from pg_class c join ns n on n.oid=c.relnamespace
      union all select n.nspname,'attribute',a.attrelid::text||':'||a.attnum::text,to_jsonb(a)
        from pg_attribute a join pg_class c on c.oid=a.attrelid join ns n on n.oid=c.relnamespace
        where a.attnum>0
      union all select n.nspname,'default',a.oid::text,to_jsonb(a)
        from pg_attrdef a join pg_class c on c.oid=a.adrelid join ns n on n.oid=c.relnamespace
      union all select n.nspname,'rewrite',r.oid::text,to_jsonb(r)
        from pg_rewrite r join pg_class c on c.oid=r.ev_class join ns n on n.oid=c.relnamespace
      union all select n.nspname,'inherit',i.inhrelid::text||':'||i.inhseqno::text,to_jsonb(i)
        from pg_inherits i join pg_class c on c.oid=i.inhrelid join ns n on n.oid=c.relnamespace
      union all select n.nspname,'partition',p.partrelid::text,to_jsonb(p)
        from pg_partitioned_table p join pg_class c on c.oid=p.partrelid join ns n on n.oid=c.relnamespace
      union all select n.nspname,'constraint',c.oid::text,to_jsonb(c)
        from pg_constraint c join ns n on n.oid=c.connamespace
      union all select n.nspname,'index',i.indexrelid::text,to_jsonb(i)
        from pg_index i join pg_class c on c.oid=i.indrelid join ns n on n.oid=c.relnamespace
      union all select n.nspname,'procedure',p.oid::text,to_jsonb(p)
        from pg_proc p join ns n on n.oid=p.pronamespace
      union all select n.nspname,'type',t.oid::text,to_jsonb(t)
        from pg_type t join ns n on n.oid=t.typnamespace
      union all select n.nspname,'enum',e.oid::text,to_jsonb(e)
        from pg_enum e join pg_type t on t.oid=e.enumtypid join ns n on n.oid=t.typnamespace
      union all select n.nspname,'range',r.rngtypid::text,to_jsonb(r)
        from pg_range r join pg_type t on t.oid=r.rngtypid join ns n on n.oid=t.typnamespace
      union all select n.nspname,'policy',p.oid::text,to_jsonb(p)
        from pg_policy p join pg_class c on c.oid=p.polrelid join ns n on n.oid=c.relnamespace
      union all select n.nspname,'trigger',t.oid::text,to_jsonb(t)
        from pg_trigger t join pg_class c on c.oid=t.tgrelid join ns n on n.oid=c.relnamespace
      union all select n.nspname,'default_acl',a.oid::text,to_jsonb(a)
        from pg_default_acl a left join ns n on n.oid=a.defaclnamespace
      union all select n.nspname,'sequence',s.seqrelid::text,to_jsonb(s)
        from pg_sequence s join pg_class c on c.oid=s.seqrelid join ns n on n.oid=c.relnamespace
      union all select n.nspname,'collation',c.oid::text,to_jsonb(c)
        from pg_collation c join ns n on n.oid=c.collnamespace
      union all select '', 'extension',e.oid::text,to_jsonb(e) from pg_extension e
      union all select '', 'publication',p.oid::text,to_jsonb(p) from pg_publication p
      union all select '', 'cast',c.oid::text,to_jsonb(c) from pg_cast c
      union all select '', 'language',l.oid::text,to_jsonb(l) from pg_language l
      union all select '', 'event_trigger',t.oid::text,to_jsonb(t) from pg_event_trigger t
      union all select n.nspname,'publication_table',p.oid::text,to_jsonb(p)
        from pg_publication_rel p join pg_class c on c.oid=p.prrelid join ns n on n.oid=c.relnamespace
      union all select null,'description',d.classoid::text||':'||d.objoid::text||':'||d.objsubid::text,to_jsonb(d)
        from pg_description d
    ) select
      md5(coalesce(string_agg(kind||':'||key||':'||md5(value::text),E'\\n' order by kind,key)
        filter(where nspname not in ('auth','storage','supabase_migrations') or nspname is null),'')) schema,
      md5(coalesce(string_agg(kind||':'||key||':'||md5(value::text),E'\\n' order by kind,key)
        filter(where nspname in ('auth','storage') or nspname is null),'')) managed,
      md5(coalesce(string_agg(kind||':'||key||':'||md5(value::text),E'\\n' order by kind,key)
        filter(where nspname='supabase_migrations'),'')) migration,
      (select md5(coalesce(jsonb_agg(to_jsonb(r) - 'rolpassword' order by rolname),'[]'::jsonb)::text)
        from pg_roles r) roles from objects`)
  const row: unknown = rows[0]
  if (!isObjectRecord(row)) throw new Error('来源数据库结构指纹读取失败。')
  for (const key of ['schema', 'managed', 'migration', 'roles'])
    if (typeof row[key] !== 'string' || !/^[a-f\d]{32}$/.test(String(row[key])))
      throw new Error('来源数据库结构指纹格式无效。')
  return {
    schema: String(row.schema),
    managedSchema: String(row.managed),
    migrationHistory: String(row.migration),
    roles: String(row.roles)
  }
}

export async function readDataSchemas(sql: BackupSourceSql, existing: string[]): Promise<string[]> {
  const rows = await sql.unsafe(`select n.nspname from pg_namespace n
    where n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
      and not exists(select 1 from pg_depend d where d.classid='pg_namespace'::regclass
        and d.objid=n.oid and d.deptype='e') order by n.nspname`)
  const schemas = new Set(existing)
  for (const row of rows) if (typeof row.nspname === 'string') schemas.add(row.nspname)
  for (const schema of ['public', 'app_private', 'auth', 'storage']) schemas.add(schema)
  schemas.delete('supabase_migrations')
  // Supabase service state is not a project-transfer dataset. Existing COPY
  // schemas are retained explicitly, but newly discovered service schemas skip.
  const serviceSchemas = new Set([
    '_analytics',
    '_realtime',
    'realtime',
    'net',
    'cron',
    'vault',
    'supabase_functions',
    'supabase_storage_admin',
    'extensions',
    'graphql',
    'graphql_public',
    'pgbouncer',
    'pgsodium',
    'pgsodium_masks'
  ])
  return [...schemas]
    .filter((schema) => existing.includes(schema) || !serviceSchemas.has(schema))
    .sort()
}

export async function readStorageObjects(sql: BackupSourceSql): Promise<StorageObject[]> {
  const rows = await sql.unsafe(`select id::text,bucket_id,name,version,
    coalesce(metadata->>'eTag',metadata->>'etag') etag,
    coalesce((metadata->>'size')::bigint,0)::text size,updated_at::text,
    metadata->>'mimetype' content_type,metadata->>'cacheControl' cache_control
    from storage.objects order by bucket_id,name`)
  return rows.map((row) => {
    if (
      typeof row.id !== 'string' ||
      typeof row.bucket_id !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(row.bucket_id) ||
      typeof row.name !== 'string' ||
      !row.name ||
      row.name
        .split('/')
        .some(
          (part: string) =>
            !part || part === '.' || part === '..' || part.includes('\\') || part.includes(':')
        ) ||
      !Number.isSafeInteger(Number(row.size)) ||
      Number(row.size) < 0
    )
      throw new Error('Storage 对象清单包含无法安全保存的路径或大小。')
    const optional = (key: string) => (typeof row[key] === 'string' ? String(row[key]) : null)
    return {
      id: row.id,
      bucket_id: row.bucket_id,
      name: row.name,
      size: Number(row.size),
      version: optional('version'),
      etag: optional('etag'),
      updated_at: optional('updated_at'),
      content_type: optional('content_type'),
      cache_control: optional('cache_control')
    }
  })
}

export function normalizedDump(text: string): string {
  return text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/^\\(?:un)?restrict\s+\S+\n/gm, '')
    .replace(/^-- (?:Started|Completed) on .+\n/gm, '')
    .replace(/^-- Dumped (?:from database|by pg_dump) version .+\n/gm, '')
    .trim()
}

/** Only project policies and triggers backed by project functions. Managed
 * Supabase base tables/functions are retained in the reference dump, not replayed. */
export async function readManagedProjectSql(sql: BackupSourceSql): Promise<string> {
  const rows = await sql.unsafe(`
    select 'policy' kind,n.nspname||'.'||c.relname||'.'||p.polname key,
      format('DROP POLICY IF EXISTS %I ON %I.%I;',p.polname,n.nspname,c.relname)||E'\\n'||
      format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s;',p.polname,n.nspname,c.relname,
        case when p.polpermissive then 'PERMISSIVE' else 'RESTRICTIVE' end,
        case p.polcmd when '*' then 'ALL' when 'r' then 'SELECT' when 'a' then 'INSERT' when 'w' then 'UPDATE' when 'd' then 'DELETE' end,
        (select string_agg(case when r.role_id=0 then 'PUBLIC' else quote_ident(pr.rolname) end,', ' order by r.ordinality)
          from unnest(p.polroles) with ordinality r(role_id,ordinality) left join pg_roles pr on pr.oid=r.role_id),
        case when p.polqual is not null then ' USING ('||pg_get_expr(p.polqual,p.polrelid)||')' else '' end,
        case when p.polwithcheck is not null then ' WITH CHECK ('||pg_get_expr(p.polwithcheck,p.polrelid)||')' else '' end) ddl
    from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('auth','storage')
    union all
    select 'trigger',n.nspname||'.'||c.relname||'.'||t.tgname,
      format('DROP TRIGGER IF EXISTS %I ON %I.%I;',t.tgname,n.nspname,c.relname)||E'\\n'||pg_get_triggerdef(t.oid,true)||';'
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
      join pg_proc p on p.oid=t.tgfoid join pg_namespace fn on fn.oid=p.pronamespace
    where n.nspname in ('auth','storage') and fn.nspname in ('public','app_private') and not t.tgisinternal
    order by kind,key`)
  const statements = rows.map((row) => {
    if (typeof row.ddl !== 'string') throw new Error('托管 schema 项目策略读取失败。')
    return row.ddl
  })
  return (
    '-- Project-owned policies and triggers in managed schemas.\n-- Review managed-schema-snapshot.sql for platform base-schema differences.\n\n' +
    statements.join('\n\n') +
    '\n'
  )
}
