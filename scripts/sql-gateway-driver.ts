import postgres from 'postgres'
import mysql from 'mysql2/promise'
import sqlParser from 'node-sql-parser'
import { mapKeys, uniqBy } from 'lodash-es'
import { withDmDatabase, inspectDmCatalog } from './sql-gateway-dm'
import { getSqlStatements } from '../src/utils/sql-workbench'
import type {
  SqlConnection,
  SqlConnectionMetadata,
  SqlDialect,
  SqlGatewayQuery,
  SqlGatewayResult
} from '../src/types/sql-connections'

const parser = new sqlParser.Parser()
import { toObjectRecord as object } from '../src/utils/record'
const text = (value: unknown) => (value === null || value === undefined ? '' : String(value))
export type SqlDatabaseQuery = (
  sql: string,
  parameters?: (string | number)[]
) => Promise<{ rows: Record<string, unknown>[]; columns: string[] }>

/** The parser restricts statement shape; database read-only transactions enforce writes independently. */
export function prepareReadOnlyQuery(query: string, dialect: SqlDialect): string {
  if (!query.trim() || query.length > 100_000 || /\/\*!/.test(query))
    throw new Error('请输入单条只读查询，长度不超过 100000 字符')
  const database = dialect === 'mysql' ? 'MySQL' : 'Postgresql'
  try {
    const parsed = parser.astify(query, { database })
    const statements = Array.isArray(parsed) ? parsed : [parsed]
    if (statements.length !== 1 || statements[0].type !== 'select') throw new Error('readonly')
    const inspect = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(inspect)
        return
      }
      const row = object(value)
      if (
        [
          'insert',
          'update',
          'delete',
          'replace',
          'create',
          'drop',
          'alter',
          'call',
          'set'
        ].includes(text(row.type).toLowerCase()) ||
        object(row.into).position ||
        row.locking_read
      )
        throw new Error('readonly')
      Object.values(row).forEach((child) => {
        if (child && typeof child === 'object') inspect(child)
      })
    }
    inspect(statements[0])
    if (dialect === 'dm') return getSqlStatements(query, dialect)[0].sql.replace(/;$/, '')
    return parser.sqlify(statements[0], { database })
  } catch {
    throw new Error('外接库支持单条 SELECT / WITH 查询，请移除写入、锁定或不受支持的语法后重试')
  }
}

export function validateGatewayQuery(value: unknown): SqlGatewayQuery {
  const row = object(value)
  if (
    typeof row.query !== 'string' ||
    (row.action !== 'execute' && row.action !== 'explain') ||
    typeof row.maxRows !== 'number' ||
    !Number.isInteger(row.maxRows) ||
    row.maxRows < 1 ||
    row.maxRows > 1000 ||
    typeof row.timeoutMs !== 'number' ||
    !Number.isInteger(row.timeoutMs) ||
    row.timeoutMs < 1000 ||
    row.timeoutMs > 30000
  )
    throw new Error('查询设置无效：最多返回 1000 行，超时为 1 至 30 秒')
  if (
    row.schema !== undefined &&
    (typeof row.schema !== 'string' ||
      !row.schema.trim() ||
      row.schema.length > 200 ||
      /\p{Cc}/u.test(row.schema))
  )
    throw new Error('请选择有效的查询 schema')
  return {
    query: row.query,
    action: row.action,
    maxRows: row.maxRows,
    timeoutMs: row.timeoutMs,
    ...(typeof row.schema === 'string' ? { schema: row.schema } : {})
  }
}

export async function withSqlDatabase<T>(
  connection: SqlConnection,
  password: string,
  timeoutMs: number,
  use: (query: SqlDatabaseQuery) => Promise<T>
): Promise<T> {
  if (connection.dialect === 'dm') return withDmDatabase(connection, password, timeoutMs, use)
  if (connection.dialect === 'postgres') {
    const sql = postgres({
      host: connection.host,
      port: connection.port,
      database: connection.database,
      username: connection.username,
      password,
      ssl: connection.tls ? 'verify-full' : false,
      max: 1,
      connect_timeout: 5,
      idle_timeout: 1,
      prepare: false,
      connection: {
        application_name: 'art-sql-workbench',
        statement_timeout: timeoutMs,
        default_transaction_read_only: true
      },
      onnotice: () => undefined
    })
    const timer = setTimeout(() => {
      void sql.end({ timeout: 0 })
    }, timeoutMs + 1000)
    try {
      const result = await sql.begin('read only', async (transaction) => ({
        value: await use(async (query, parameters = []) => {
          const result = await transaction.unsafe(query, parameters)
          return { rows: Array.from(result), columns: result.columns.map((column) => column.name) }
        })
      }))
      return result.value
    } finally {
      clearTimeout(timer)
      await sql.end({ timeout: 0 })
    }
  }
  const db = await mysql.createConnection({
    host: connection.host,
    port: connection.port,
    database: connection.database,
    user: connection.username,
    password,
    ssl: connection.tls ? { rejectUnauthorized: true } : undefined,
    connectTimeout: 5000,
    multipleStatements: false,
    supportBigNumbers: true,
    bigNumberStrings: true,
    dateStrings: true,
    // SELECT INTO LOCAL INFILE is never supported by this workbench.
    flags: ['-LOCAL_FILES']
  })
  const timer = setTimeout(() => db.destroy(), timeoutMs)
  try {
    await db.query(`SET SESSION MAX_EXECUTION_TIME = ${timeoutMs}`)
    await db.query('SET TRANSACTION READ ONLY')
    await db.query('START TRANSACTION READ ONLY')
    return await use(async (query, parameters = []) => {
      const [rows, fields] = await db.query(query, parameters)
      if (!Array.isArray(rows)) throw new Error('查询未返回结果集')
      return { rows: rows.map(object), columns: fields.map((field) => field.name) }
    })
  } finally {
    clearTimeout(timer)
    db.destroy()
  }
}

export async function querySqlConnection(
  connection: SqlConnection,
  password: string,
  request: SqlGatewayQuery
): Promise<SqlGatewayResult> {
  if (connection.dialect === 'dm' && request.action === 'explain')
    throw new Error('当前达梦驱动不提供可读取的执行计划，请使用数据库管理工具查看')
  if (request.schema && connection.dialect !== 'dm')
    throw new Error('此连接请使用 schema.表名 指定查询范围')
  const started = performance.now()
  const query = prepareReadOnlyQuery(request.query, connection.dialect)
  return withSqlDatabase(
    request.schema ? { ...connection, database: request.schema } : connection,
    password,
    request.timeoutMs,
    async (run) => {
      const sql =
        request.action === 'explain'
          ? `${connection.dialect === 'postgres' ? 'EXPLAIN (FORMAT JSON)' : 'EXPLAIN FORMAT=JSON'} ${query}`
          : connection.dialect === 'dm'
            ? `SELECT * FROM (${query}\n) art_query_result WHERE ROWNUM <= ${request.maxRows + 1}`
            : `SELECT ${connection.dialect === 'mysql' ? `/*+ MAX_EXECUTION_TIME(${request.timeoutMs}) */ ` : ''}* FROM (${query}) AS art_query_result LIMIT ${request.maxRows + 1}`
      const result = await run(sql)
      if (performance.now() - started >= request.timeoutMs)
        throw new Error('查询已超时，请减少查询范围或增加超时后重试')
      if (JSON.stringify(result.rows).length > 8_000_000)
        throw new Error('结果内容过大，请减少字段或返回行数后重试')
      return {
        status: 'ok',
        rows: result.rows.slice(0, request.maxRows),
        columns: result.columns.map((name) => ({ name })),
        commandTag: request.action === 'explain' ? 'EXPLAIN' : 'SELECT',
        rowCount: Math.min(result.rows.length, request.maxRows),
        truncated: result.rows.length > request.maxRows,
        durationMs: Math.round(performance.now() - started),
        maxRows: request.maxRows,
        timeoutMs: request.timeoutMs
      }
    }
  )
}

export async function inspectSqlConnection(
  connection: SqlConnection,
  password: string,
  schema?: string
): Promise<SqlConnectionMetadata> {
  return withSqlDatabase(connection, password, 10000, async (execute) => {
    const run = async (query: string, parameters: (string | number)[] = []) => {
      const result = await execute(query, parameters)
      return {
        ...result,
        rows: result.rows.map((row) => mapKeys(row, (_value, key) => key.toLowerCase()))
      }
    }
    const pg = connection.dialect === 'postgres'
    const parameters = schema ? [schema] : []
    const predicate = schema ? ` AND table_schema = ${pg ? '$1' : '?'}` : ''
    const [schemas, tables, columns, routines, indexes, relations] =
      connection.dialect === 'dm'
        ? await inspectDmCatalog(run, schema)
        : await Promise.all([
            run(
              pg
                ? "SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT LIKE 'pg_temp_%' AND schema_name NOT LIKE 'pg_toast_temp_%' ORDER BY schema_name"
                : 'SELECT schema_name FROM information_schema.schemata ORDER BY schema_name'
            ),
            // Schema-only loading is used when expanding an object-tree schema.
            schema
              ? run(
                  pg
                    ? `SELECT table_schema, table_name, table_type, obj_description(to_regclass(format('%I.%I',table_schema,table_name)),'pg_class') AS description FROM information_schema.tables WHERE 1=1${predicate} UNION ALL SELECT schemaname, matviewname, 'MATERIALIZED VIEW', obj_description(to_regclass(format('%I.%I',schemaname,matviewname)),'pg_class') FROM pg_catalog.pg_matviews WHERE schemaname=$1 ORDER BY table_name`
                    : `SELECT table_schema, table_name, table_type, table_comment AS description FROM information_schema.tables WHERE 1=1${predicate} ORDER BY table_name`,
                  parameters
                )
              : Promise.resolve({ rows: [] }),
            schema
              ? run(
                  pg
                    ? `SELECT n.nspname AS table_schema, pc.relname AS table_name, a.attname AS column_name, format_type(a.atttypid,a.atttypmod) AS data_type, CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END AS is_nullable, a.attnum AS ordinal_position, pg_get_expr(ad.adbin,ad.adrelid) AS column_default, col_description(pc.oid,a.attnum) AS column_comment, EXISTS(SELECT 1 FROM pg_catalog.pg_index ix WHERE ix.indrelid=pc.oid AND ix.indisprimary AND a.attnum=ANY(ix.indkey)) AS is_primary_key FROM pg_catalog.pg_namespace n JOIN pg_catalog.pg_class pc ON pc.relnamespace=n.oid JOIN pg_catalog.pg_attribute a ON a.attrelid=pc.oid LEFT JOIN pg_catalog.pg_attrdef ad ON ad.adrelid=pc.oid AND ad.adnum=a.attnum WHERE n.nspname=$1 AND pc.relkind IN ('r','p','v','m','f') AND a.attnum>0 AND NOT a.attisdropped AND has_table_privilege(pc.oid,'SELECT') ORDER BY pc.relname,a.attnum`
                    : `SELECT table_schema, table_name, column_name, data_type, is_nullable, ordinal_position, column_default, column_comment, column_key FROM information_schema.columns WHERE 1=1${predicate} ORDER BY table_name, ordinal_position`,
                  parameters
                )
              : Promise.resolve({ rows: [] }),
            schema
              ? run(
                  `SELECT routine_schema, routine_name, data_type FROM information_schema.routines WHERE routine_schema = ${pg ? '$1' : '?'} ORDER BY routine_name`,
                  parameters
                )
              : Promise.resolve({ rows: [] }),
            schema
              ? run(
                  pg
                    ? `SELECT t.relname AS table_name, idx.relname AS index_name, pg_get_indexdef(i.indexrelid) AS definition, i.indisprimary AS is_primary, i.indisunique AS is_unique, ARRAY(SELECT a.attname FROM unnest(i.indkey) WITH ORDINALITY k(attnum,ord) JOIN pg_catalog.pg_attribute a ON a.attrelid=t.oid AND a.attnum=k.attnum ORDER BY k.ord) AS columns FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class t ON t.oid=i.indrelid JOIN pg_catalog.pg_class idx ON idx.oid=i.indexrelid JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=$1`
                    : `SELECT table_name, index_name, column_name, non_unique, seq_in_index FROM information_schema.statistics WHERE table_schema = ? ORDER BY table_name, index_name, seq_in_index`,
                  parameters
                )
              : Promise.resolve({ rows: [] }),
            schema
              ? run(
                  pg
                    ? `SELECT ns.nspname AS source_schema, s.relname AS source_table, sa.attname AS source_column, nt.nspname AS target_schema, t.relname AS target_table, ta.attname AS target_column, c.conname AS constraint_name FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class s ON s.oid=c.conrelid JOIN pg_catalog.pg_namespace ns ON ns.oid=s.relnamespace JOIN pg_catalog.pg_class t ON t.oid=c.confrelid JOIN pg_catalog.pg_namespace nt ON nt.oid=t.relnamespace CROSS JOIN LATERAL unnest(c.conkey,c.confkey) AS k(source_attnum,target_attnum) JOIN pg_catalog.pg_attribute sa ON sa.attrelid=s.oid AND sa.attnum=k.source_attnum JOIN pg_catalog.pg_attribute ta ON ta.attrelid=t.oid AND ta.attnum=k.target_attnum WHERE c.contype='f' AND ns.nspname=$1 AND has_table_privilege(s.oid,'SELECT') AND has_table_privilege(t.oid,'SELECT')`
                    : `SELECT table_schema AS source_schema, table_name AS source_table, column_name AS source_column, referenced_table_schema AS target_schema, referenced_table_name AS target_table, referenced_column_name AS target_column, constraint_name FROM information_schema.key_column_usage WHERE referenced_table_name IS NOT NULL AND table_schema=?`,
                  parameters
                )
              : Promise.resolve({ rows: [] })
          ])
    const result: SqlConnectionMetadata = {
      schemas: schemas.rows.map((row) => text(row.schema_name)),
      tables: [],
      columns: [],
      functions: [],
      foreignKeys: []
    }
    result.columns = columns.rows.map((row) => ({
      tableSchema: text(row.table_schema),
      tableName: text(row.table_name),
      columnName: text(row.column_name),
      dataType: text(row.data_type),
      isNullable: text(row.is_nullable),
      ordinalPosition: Number(row.ordinal_position),
      defaultValue: row.column_default === null ? null : text(row.column_default),
      description: text(row.column_comment),
      isPrimaryKey: row.is_primary_key === true || row.column_key === 'PRI'
    }))
    result.tables = tables.rows.map((row) => ({
      tableSchema: text(row.table_schema),
      tableName: text(row.table_name),
      description: text(row.description),
      kind:
        row.table_type === 'VIEW'
          ? 'view'
          : row.table_type === 'MATERIALIZED VIEW'
            ? 'materialized_view'
            : 'table',
      columns: result.columns
        .filter(
          (column) => column.tableName === row.table_name && column.tableSchema === row.table_schema
        )
        .map((column) => ({
          name: column.columnName,
          dataType: column.dataType,
          isNullable: column.isNullable === 'YES',
          description: column.description,
          defaultValue: column.defaultValue,
          isPrimaryKey: column.isPrimaryKey
        })),
      indexes: indexes.rows
        .filter((index) => index.table_name === row.table_name)
        .reduce<NonNullable<SqlConnectionMetadata['tables'][number]['indexes']>>((list, index) => {
          const existing = list.find((item) => item.name === index.index_name)
          if (existing) existing.columns.push(text(index.column_name))
          else
            list.push({
              name: text(index.index_name),
              columns:
                pg && Array.isArray(index.columns)
                  ? index.columns.map(text)
                  : [text(index.column_name)],
              isUnique: pg ? index.is_unique === true : Number(index.non_unique) === 0,
              isPrimary:
                index.is_primary === true ||
                Number(index.is_primary) === 1 ||
                index.index_name === 'PRIMARY',
              definition: pg ? text(index.definition) : undefined
            })
          return list
        }, [])
    }))
    result.functions = uniqBy(
      routines.rows.map((row) => ({
        routineSchema: text(row.routine_schema),
        routineName: text(row.routine_name),
        returnType: text(row.data_type)
      })),
      (fn) => `${fn.routineSchema}.${fn.routineName}`
    )
    result.foreignKeys = relations.rows.map((row) => ({
      sourceSchema: text(row.source_schema),
      sourceTable: text(row.source_table),
      sourceColumn: text(row.source_column),
      targetSchema: text(row.target_schema),
      targetTable: text(row.target_table),
      targetColumn: text(row.target_column),
      constraintName: text(row.constraint_name)
    }))
    return result
  })
}
