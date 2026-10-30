import dmdb from 'dmdb'
import type { SqlConnection } from '../src/types/sql-connections'
import type { SqlDatabaseQuery } from './sql-gateway-driver'
import { toObjectRecord } from '../src/utils/record'

// Keep numeric precision, timestamps and LOB text intact across the JSON boundary.
dmdb.fetchAsString = [dmdb.NUMBER, dmdb.DATE, dmdb.CLOB]

export async function withDmDatabase<T>(
  connection: SqlConnection,
  password: string,
  timeoutMs: number,
  use: (query: SqlDatabaseQuery) => Promise<T>
): Promise<T> {
  if (connection.tls)
    throw new Error('达梦 TLS 需要专用客户端证书，当前连接请选择内网直连并关闭 TLS')
  let db: dmdb.Connection | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let output: { value: T } | undefined
  let failure: Error | undefined
  try {
    db = await dmdb.getConnection({
      connectString: `${connection.host.includes(':') ? `[${connection.host}]` : connection.host}:${connection.port}`,
      user: connection.username,
      password,
      schema: connection.database || undefined,
      autoCommit: false,
      connectTimeout: 5000,
      socketTimeout: timeoutMs,
      appName: 'art-sql-workbench',
      logLevel: 'off'
    })
    const active = db
    timer = setTimeout(() => {
      void active.close().catch(() => undefined)
    }, timeoutMs + 1000)
    // A session guard also covers routines that start their own transaction.
    await db.execute('CALL SP_SET_SESSION_READONLY(1)')
    await db.execute('SET TRANSACTION READ ONLY')
    output = {
      value: await use(async (sql, parameters = []) => {
        const raw: unknown = await active.execute(sql, parameters, {
          autoCommit: false,
          outFormat: dmdb.OUT_FORMAT_OBJECT,
          maxRows: 10001
        })
        const result = toObjectRecord(raw)
        const rows = Array.isArray(result.rows) ? result.rows.map(toObjectRecord) : []
        if (rows.length >= 10001) throw new Error('达梦结构对象过多，请缩小 schema 范围后重试')
        const columns = Array.isArray(result.metaData)
          ? result.metaData.map(toObjectRecord).map((column) => String(column.name || ''))
          : []
        return { rows, columns }
      })
    }
  } catch (cause) {
    const code = Number(toObjectRecord(cause).errCode)
    const message =
      code === -2501
        ? '达梦数据库认证失败，请检查账号、密码和访问权限'
        : code === -2106
          ? `当前 schema（${connection.database || '账号默认'}）中找不到该表或视图，请选择正确的查询 schema，或使用 schema.表名`
          : code === -2103
            ? '查询 schema 不存在或不可用，请从当前 schema 列表重新选择'
            : code === 6071
              ? '达梦驱动加密初始化失败，请更新并重新启动 SQL 执行端'
              : code >= 6000
                ? '达梦连接超时或中断，请检查端口、网络与查询范围后重试'
                : '达梦数据库操作失败，请检查 schema、SQL 语法和账号只读权限后重试'
    failure = Number.isFinite(code)
      ? new Error(message, { cause })
      : cause instanceof Error
        ? cause
        : new Error('达梦连接失败，请重新连接后重试', { cause })
  } finally {
    if (timer) clearTimeout(timer)
    if (db) {
      const rollback = await Promise.allSettled([db.rollback()])
      const closed = await Promise.allSettled([db.close()])
      const closeFailure = [...rollback, ...closed].find((result) => result.status === 'rejected')
      // A timeout may already have closed the session. Preserve its original diagnostic.
      if (!failure && closeFailure?.status === 'rejected')
        failure = new Error('达梦只读会话已断开，请重新连接后重试', { cause: closeFailure.reason })
    }
  }
  if (failure) throw failure
  if (!output) throw new Error('达梦查询未返回结果，请重新连接后重试')
  return output.value
}

/** Catalog aliases match the existing PostgreSQL/MySQL normalizer. Values stay bound. */
export async function inspectDmCatalog(run: SqlDatabaseQuery, schema?: string) {
  const schemas = await run(
    `SELECT OWNER AS SCHEMA_NAME FROM ALL_TAB_COMMENTS UNION SELECT USER AS SCHEMA_NAME FROM DUAL ORDER BY SCHEMA_NAME`
  )
  const empty = { rows: [] }
  if (!schema) return [schemas, empty, empty, empty, empty, empty] as const
  const params = [schema]
  const tables = await run(
    `SELECT OWNER AS TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE, COMMENTS AS DESCRIPTION FROM ALL_TAB_COMMENTS WHERE OWNER = ? AND TABLE_TYPE IN ('TABLE','VIEW') ORDER BY TABLE_NAME`,
    params
  )
  const columns = await run(
    `SELECT c.OWNER AS TABLE_SCHEMA, c.TABLE_NAME, c.COLUMN_NAME, c.DATA_TYPE, CASE WHEN c.NULLABLE='Y' THEN 'YES' ELSE 'NO' END AS IS_NULLABLE, c.COLUMN_ID AS ORDINAL_POSITION, c.DATA_DEFAULT AS COLUMN_DEFAULT, cm.COMMENTS AS COLUMN_COMMENT, CASE WHEN EXISTS (SELECT 1 FROM ALL_CONSTRAINTS pk JOIN ALL_CONS_COLUMNS pc ON pc.OWNER=pk.OWNER AND pc.CONSTRAINT_NAME=pk.CONSTRAINT_NAME WHERE pk.CONSTRAINT_TYPE='P' AND pk.OWNER=c.OWNER AND pk.TABLE_NAME=c.TABLE_NAME AND pc.COLUMN_NAME=c.COLUMN_NAME) THEN 'PRI' ELSE '' END AS COLUMN_KEY FROM ALL_TAB_COLUMNS c LEFT JOIN ALL_COL_COMMENTS cm ON cm.OWNER=c.OWNER AND cm.TABLE_NAME=c.TABLE_NAME AND cm.COLUMN_NAME=c.COLUMN_NAME WHERE c.OWNER=? ORDER BY c.TABLE_NAME,c.COLUMN_ID`,
    params
  )
  const routines = await run(
    `SELECT OWNER AS ROUTINE_SCHEMA, OBJECT_NAME AS ROUTINE_NAME, OBJECT_TYPE AS DATA_TYPE FROM ALL_PROCEDURES WHERE OWNER=? AND OBJECT_TYPE IN ('FUNCTION','PROCEDURE') ORDER BY OBJECT_NAME`,
    params
  )
  const indexes = await run(
    `SELECT i.TABLE_NAME, i.INDEX_NAME, ic.COLUMN_NAME, CASE WHEN i.UNIQUENESS='UNIQUE' THEN 0 ELSE 1 END AS NON_UNIQUE, CASE WHEN EXISTS (SELECT 1 FROM ALL_CONSTRAINTS p WHERE p.OWNER=i.OWNER AND p.INDEX_NAME=i.INDEX_NAME AND p.CONSTRAINT_TYPE='P') THEN 1 ELSE 0 END AS IS_PRIMARY FROM ALL_INDEXES i JOIN ALL_IND_COLUMNS ic ON ic.INDEX_OWNER=i.OWNER AND ic.INDEX_NAME=i.INDEX_NAME WHERE i.TABLE_OWNER=? ORDER BY i.TABLE_NAME,i.INDEX_NAME,ic.COLUMN_POSITION`,
    params
  )
  const relations = await run(
    `SELECT fk.OWNER AS SOURCE_SCHEMA, fk.TABLE_NAME AS SOURCE_TABLE, fc.COLUMN_NAME AS SOURCE_COLUMN, pk.OWNER AS TARGET_SCHEMA, pk.TABLE_NAME AS TARGET_TABLE, pc.COLUMN_NAME AS TARGET_COLUMN, fk.CONSTRAINT_NAME FROM ALL_CONSTRAINTS fk JOIN ALL_CONS_COLUMNS fc ON fc.OWNER=fk.OWNER AND fc.CONSTRAINT_NAME=fk.CONSTRAINT_NAME JOIN ALL_CONSTRAINTS pk ON pk.OWNER=fk.R_OWNER AND pk.CONSTRAINT_NAME=fk.R_CONSTRAINT_NAME JOIN ALL_CONS_COLUMNS pc ON pc.OWNER=pk.OWNER AND pc.CONSTRAINT_NAME=pk.CONSTRAINT_NAME AND pc.POSITION=fc.POSITION WHERE fk.CONSTRAINT_TYPE='R' AND fk.OWNER=? ORDER BY fk.CONSTRAINT_NAME,fc.POSITION`,
    params
  )
  return [schemas, tables, columns, routines, indexes, relations] as const
}
