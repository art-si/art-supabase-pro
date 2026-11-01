import { onMounted, ref, shallowRef } from 'vue'
import { chunk, orderBy, uniqBy } from 'lodash-es'
import { fetchDatabaseMetadata } from '@/api/data-center'
import { fetchSqlConnectionMetadata } from '@/api/sql-connections'
import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
import { extractSqlAliases, resolveTableRef } from '@/utils/sql-workbench'
import type { SqlConnection, SqlDialect } from '@/types/sql-connections'

type Metadata = Api.DataCenter.SqlConsole.DatabaseMetadata
type Table = Api.DataCenter.SqlConsole.TableMetadata
const tableKey = (table: Pick<Table, 'tableSchema' | 'tableName'>) =>
  JSON.stringify([table.tableSchema, table.tableName])

interface MetadataContext {
  owner: () => string
  external: () => boolean
  connection: () => SqlConnection | undefined
  base: () => string
  tenant: () => string
  dialect: () => SqlDialect
  querySchema: () => string
  publish: (metadata: Metadata) => void
}

/** One workspace owns the directory, in-flight detail batches and their lifetime. */
export function useSqlMetadata(context: MetadataContext) {
  const databaseMetadata = shallowRef<Metadata | null>(null)
  const metadataLoading = ref(false)
  const metadataError = ref<string | null>(null)
  let generation = 0
  let directory: Promise<Metadata> | null = null
  const schemas = new Set<string>()
  const schemaRequests = new Map<string, Promise<void>>()
  const tableRequests = new Map<string, Promise<void>>()
  const functions = new Set<string>()
  const functionRequests = new Map<string, Promise<void>>()
  const current = (owner: string, revision: number) =>
    owner === context.owner() && revision === generation
  const assertCurrent = (owner: string, revision: number) => {
    if (!current(owner, revision)) throw new Error('数据库范围已切换，请重新加载结构')
  }
  const publish = (metadata: Metadata) => {
    databaseMetadata.value = metadata
    context.publish(metadata)
  }
  const getMetadata = (): Promise<Metadata> => {
    if (directory) return directory
    const owner = context.owner(),
      revision = generation
    metadataLoading.value = true
    const target = context.connection()
    directory = (
      context.external()
        ? target
          ? fetchSqlConnectionMetadata(context.base(), context.tenant(), target.id)
          : Promise.reject(new Error('连接未就绪，请打开连接管理重新连接执行端'))
        : fetchDatabaseMetadata({ mode: 'catalog' })
    )
      .then((value) => {
        assertCurrent(owner, revision)
        publish(value)
        metadataError.value = null
        // Full responses from older deployments remain a complete local snapshot.
        if (
          !context.external() &&
          value.metadataMode !== 'catalog' &&
          !value.tables.some((table) => table.detailsLoaded === false)
        )
          value.schemas.forEach((schema) => functions.add(schema))
        return value
      })
      .catch((cause: unknown) => {
        if (current(owner, revision)) {
          directory = null
          metadataError.value = getFriendlySupabaseErrorMessage(
            cause,
            '数据库结构加载失败，请稍后重试'
          )
        }
        throw cause
      })
      .finally(() => {
        if (current(owner, revision)) metadataLoading.value = false
      })
    return directory
  }
  const ensureSchema = async (schema: string): Promise<void> => {
    if (!context.external()) {
      await getMetadata()
      return
    }
    if (schemas.has(schema)) return
    if (schemaRequests.has(schema)) return schemaRequests.get(schema)
    const owner = context.owner(),
      revision = generation
    const target = context.connection()
    if (!target) throw new Error('连接未就绪，请重新连接执行端')
    const pending = fetchSqlConnectionMetadata(context.base(), context.tenant(), target.id, schema)
      .then((value) => {
        assertCurrent(owner, revision)
        const metadata = databaseMetadata.value
        if (!metadata) throw new Error('数据库目录未就绪，请刷新后重试')
        publish({
          ...metadata,
          schemas: value.schemas,
          tables: [
            ...metadata.tables.filter((table) => table.tableSchema !== schema),
            ...value.tables
          ],
          columns: [
            ...metadata.columns.filter((column) => column.tableSchema !== schema),
            ...value.columns
          ],
          functions: [
            ...metadata.functions.filter((fn) => fn.routineSchema !== schema),
            ...value.functions
          ],
          foreignKeys: [
            ...metadata.foreignKeys.filter((key) => key.sourceSchema !== schema),
            ...value.foreignKeys
          ]
        })
        schemas.add(schema)
      })
      .finally(() => {
        if (current(owner, revision)) schemaRequests.delete(schema)
      })
    schemaRequests.set(schema, pending)
    return pending
  }
  const ensureTables = async (
    requested: Pick<Table, 'tableSchema' | 'tableName'>[]
  ): Promise<void> => {
    const owner = context.owner(),
      revision = generation
    await getMetadata()
    assertCurrent(owner, revision)
    if (context.external()) {
      await Promise.all(
        uniqBy(requested, 'tableSchema').map((table) => ensureSchema(table.tableSchema))
      )
      return
    }
    const waits: Promise<void>[] = []
    const missing = uniqBy(requested, tableKey).filter((target) => {
      const table = databaseMetadata.value?.tables.find(
        (item) => tableKey(item) === tableKey(target)
      )
      if (!table) throw new Error('对象不存在或没有结构读取权限，请刷新目录')
      if (table.detailsLoaded !== false) return false
      const previous = tableRequests.get(tableKey(target))
      if (previous) {
        waits.push(previous)
        return false
      }
      return true
    })
    for (const batch of chunk(missing, 32)) {
      const pending = fetchDatabaseMetadata({
        mode: 'tables',
        tables: batch.map((table) => ({ schema: table.tableSchema, name: table.tableName }))
      })
        .then((value) => {
          assertCurrent(owner, revision)
          const metadata = databaseMetadata.value
          if (!metadata) return
          const keys = new Set(batch.map(tableKey))
          if (
            batch.some(
              (table) => !value.tables.some((loaded) => tableKey(loaded) === tableKey(table))
            )
          )
            throw new Error('部分对象已不可读取，请刷新目录后重试')
          const details = new Map(
            value.tables.map((table) => [tableKey(table), { ...table, detailsLoaded: true }])
          )
          publish({
            ...metadata,
            tables: metadata.tables.map((table) => details.get(tableKey(table)) || table),
            columns: [
              ...metadata.columns.filter((column) => !keys.has(tableKey(column))),
              ...value.columns
            ],
            foreignKeys: uniqBy(
              [
                ...metadata.foreignKeys.filter(
                  (key) =>
                    !keys.has(
                      tableKey({ tableSchema: key.sourceSchema, tableName: key.sourceTable })
                    )
                ),
                ...value.foreignKeys
              ],
              (key) =>
                JSON.stringify([
                  key.sourceSchema,
                  key.sourceTable,
                  key.sourceColumn,
                  key.targetSchema,
                  key.targetTable,
                  key.targetColumn,
                  key.constraintName
                ])
            )
          })
        })
        .finally(() => {
          if (current(owner, revision))
            batch.forEach((table) => tableRequests.delete(tableKey(table)))
        })
      batch.forEach((table) => tableRequests.set(tableKey(table), pending))
      waits.push(pending)
    }
    await Promise.all(waits)
    assertCurrent(owner, revision)
  }
  const ensureTable = (schema: string, name: string) =>
    ensureTables([{ tableSchema: schema, tableName: name }])
  const ensureFunctions = async (schema: string): Promise<void> => {
    const owner = context.owner(),
      revision = generation
    await getMetadata()
    assertCurrent(owner, revision)
    if (context.external()) return ensureSchema(schema)
    if (functions.has(schema)) return
    const previous = functionRequests.get(schema)
    if (previous) return previous
    const pending = fetchDatabaseMetadata({ mode: 'functions', schema })
      .then((value) => {
        assertCurrent(owner, revision)
        const metadata = databaseMetadata.value
        if (!metadata) return
        publish({
          ...metadata,
          functions: [
            ...metadata.functions.filter((fn) => fn.routineSchema !== schema),
            ...value.functions
          ],
          functionsTruncated: metadata.functionsTruncated || value.functionsTruncated,
          functionsTruncatedSchemas: uniqBy(
            [
              ...(metadata.functionsTruncatedSchemas || []),
              ...(value.functionsTruncated ? [schema] : [])
            ],
            (value) => value
          )
        })
        functions.add(schema)
      })
      .finally(() => {
        if (current(owner, revision)) functionRequests.delete(schema)
      })
    functionRequests.set(schema, pending)
    return pending
  }
  const searchMetadata = async (keyword: string): Promise<Metadata> => {
    const owner = context.owner(),
      revision = generation
    const value = await fetchDatabaseMetadata({ mode: 'search', keyword })
    assertCurrent(owner, revision)
    return value
  }
  const ensureQueryMetadata = async (schema?: string, query = ''): Promise<Metadata> => {
    const owner = context.owner(),
      revision = generation
    const metadata = await getMetadata()
    assertCurrent(owner, revision)
    if (context.external()) {
      const fallback =
        context.dialect() === 'postgres'
          ? metadata.schemas.includes('public')
            ? 'public'
            : metadata.schemas[0]
          : context.connection()?.database || context.connection()?.username
      const scopes = uniqBy(
        [
          ...(schema ? [schema] : fallback ? [fallback] : []),
          ...extractSqlAliases(query)
            .map((alias) => alias.tableSchema)
            .filter((name) => metadata.schemas.includes(name))
        ],
        (value) => value
      )
      await Promise.all(scopes.map(ensureSchema))
    } else if (query) {
      const aliases = extractSqlAliases(query)
      const targets = aliases.flatMap((alias) => {
        const table = resolveTableRef(alias.alias, metadata, aliases)
        return table ? [table] : []
      })
      await ensureTables(targets)
    }
    assertCurrent(owner, revision)
    return databaseMetadata.value || metadata
  }
  const ensureAiMetadata = async (
    description: string,
    sql: string,
    schema?: string
  ): Promise<Metadata> => {
    const owner = context.owner(),
      revision = generation
    const metadata = await ensureQueryMetadata(schema, sql)
    if (context.external()) return metadata
    const words = Array.from(new Intl.Segmenter('zh', { granularity: 'word' }).segment(description))
      .filter(
        (segment) =>
          segment.isWordLike && segment.segment.length >= 2 && segment.segment.length <= 64
      )
      .map((segment) => segment.segment)
      .filter((word) => !['统计', '查询', '生成', '展示', 'SELECT', 'FROM', 'WHERE'].includes(word))
      .slice(0, 3)
    const matches = await Promise.all(words.map((word) => searchMetadata(word)))
    assertCurrent(owner, revision)
    const matched = new Set(matches.flatMap((value) => value.tables.map(tableKey)))
    const contextText = `${description} ${sql}`.toLowerCase()
    const permission = /角色|权限|菜单|role|permission|menu/i.test(contextText)
    const permissionTables = ['sys_user', 'sys_role', 'sys_role_menu', 'sys_menu']
    const ranked = orderBy(
      metadata.tables
        .filter(
          (table) =>
            !table.tableSchema.startsWith('backup_') ||
            contextText.includes(table.tableSchema.toLowerCase())
        )
        .map((table, index) => ({
          table,
          index,
          score:
            (permission &&
            table.tableSchema === 'public' &&
            permissionTables.includes(table.tableName)
              ? 200
              : 0) +
            (contextText.includes(`${table.tableSchema}.${table.tableName}`.toLowerCase())
              ? 100
              : 0) +
            (contextText.includes(table.tableName.toLowerCase()) ? 60 : 0) +
            (matched.has(tableKey(table)) ? 50 : 0) +
            (table.tableSchema === 'public' ? 10 : 0) +
            table.tableName
              .toLowerCase()
              .split('_')
              .filter((part) => part.length >= 3)
              .reduce((score, part) => score + (contextText.includes(part) ? 8 : 0), 0)
        })),
      ['score', 'index'],
      ['desc', 'asc']
    )
      .slice(0, 12)
      .map((item) => item.table)
    await ensureTables(ranked)
    assertCurrent(owner, revision)
    const keys = new Set(ranked.map(tableKey))
    const updated = databaseMetadata.value || metadata
    return {
      ...updated,
      tables: updated.tables.filter((table) => keys.has(tableKey(table))),
      columns: updated.columns.filter((column) => keys.has(tableKey(column))),
      foreignKeys: updated.foreignKeys
        .filter(
          (key) =>
            keys.has(tableKey({ tableSchema: key.sourceSchema, tableName: key.sourceTable })) ||
            keys.has(tableKey({ tableSchema: key.targetSchema, tableName: key.targetTable }))
        )
        .slice(0, 20),
      functions: []
    }
  }
  const resetMetadata = () => {
    generation++
    directory = null
    schemas.clear()
    schemaRequests.clear()
    tableRequests.clear()
    functions.clear()
    functionRequests.clear()
    metadataLoading.value = false
    metadataError.value = null
    publish({ schemas: [], tables: [], columns: [], functions: [], foreignKeys: [] })
    databaseMetadata.value = null
  }
  const preloadMetadata = () => {
    const owner = context.owner(),
      revision = generation
    void getMetadata()
      .then(async () => {
        const schema = context.querySchema() || context.connection()?.database
        if (context.external() && context.dialect() === 'dm' && schema) await ensureSchema(schema)
        if (current(owner, revision)) metadataError.value = null
      })
      .catch((cause: unknown) => {
        if (current(owner, revision) && !metadataError.value)
          metadataError.value = getFriendlySupabaseErrorMessage(
            cause,
            '当前 schema 结构加载失败，请重试'
          )
      })
  }
  const refreshMetadata = () => {
    if (metadataLoading.value) return
    resetMetadata()
    preloadMetadata()
  }
  onMounted(preloadMetadata)
  return {
    databaseMetadata,
    metadataLoading,
    metadataError,
    getMetadata,
    ensureSchema,
    ensureTable,
    ensureTables,
    ensureFunctions,
    searchMetadata,
    ensureQueryMetadata,
    ensureAiMetadata,
    resetMetadata,
    preloadMetadata,
    refreshMetadata
  }
}
