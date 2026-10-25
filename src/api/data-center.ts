import { useSupabase } from '@/hooks/core/useSupabase'
import { WRITE_PERMISSION_DENIED_MESSAGE } from '@/hooks/core/useSupabase'
import type { QueryResult } from '@/types/api/response'
import { applyFilters, fetchAllRangePages, FilterSpec } from '@/utils/supabase'
import { invokeSupabaseFunctionWithSessionRecovery } from '@/utils/supabase/functions'
import TreeUtils from '@/utils/tree'

const { supabase, keysToSnakeDeep, responseHandle } = useSupabase()

type DataCenterQueryResult<T> = QueryResult<T>
type DictionaryWithType = Api.DataCenter.DictListItem & {
  dictTypeTable: { code: string; name: string }
}
export type DictionaryTypeOption = Pick<
  Api.DataCenter.DictTypeItem,
  'id' | 'name' | 'code' | 'cascadeParentTypeId'
>

const DICTIONARY_BATCH_SIZE = 500
const dictTypeTreeUtils = new TreeUtils({
  idKey: 'id',
  parentKey: 'parentId',
  childrenKey: 'children'
})

interface MetadataPayload {
  schemas: string[]
  columns: MetadataColumnRow[]
  functions?: MetadataFunctionRow[]
}

interface MetadataColumnRow {
  tableSchema: string
  tableName: string
  columnName: string
  dataType: string
  isNullable: string
  ordinalPosition: number
}

interface MetadataFunctionRow {
  routineSchema: string
  routineName: string
  returnType: string
}

function isMetadataColumnRow(value: unknown): value is MetadataColumnRow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return (
    typeof row.tableSchema === 'string' &&
    typeof row.tableName === 'string' &&
    typeof row.columnName === 'string' &&
    typeof row.dataType === 'string' &&
    typeof row.isNullable === 'string' &&
    typeof row.ordinalPosition === 'number'
  )
}

function isMetadataFunctionRow(value: unknown): value is MetadataFunctionRow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return (
    typeof row.routineSchema === 'string' &&
    typeof row.routineName === 'string' &&
    typeof row.returnType === 'string'
  )
}

function isMetadataPayload(payload: unknown): payload is MetadataPayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false
  const value = payload as Record<string, unknown>
  return (
    Array.isArray(value.schemas) &&
    value.schemas.every((schema) => typeof schema === 'string') &&
    Array.isArray(value.columns) &&
    value.columns.every(isMetadataColumnRow) &&
    (value.functions === undefined ||
      (Array.isArray(value.functions) && value.functions.every(isMetadataFunctionRow)))
  )
}

function normalizeMetadataPayload(data: unknown): MetadataPayload | null {
  const payload = Array.isArray(data) ? data[0] : data
  return isMetadataPayload(payload) ? payload : null
}

// 字典目录与类型列表
export async function fetchDictionaryTypeList(params: Partial<Api.DataCenter.DictTypeItem> = {}) {
  const { name } = params
  const specs = [{ col: 'name', op: 'ilike', val: name ? `%${name}%` : undefined }]

  let query = supabase
    .from('sys_dict_type')
    .select('*, cascade_parent_type:dict_type_cascade_parent(id, name, code)')
    .order('sort', { ascending: true })
    .order('name', { ascending: true })

  query = applyFilters(query, specs, { skipEmpty: true, camelToSnake: false })
  return await responseHandle<Api.DataCenter.DictTypeItem[]>(() => query, {})
}

/** 获取可配置为级联上级的启用字典类型。 */
export async function fetchDictionaryTypeOptions(params: { excludeId?: string } = {}) {
  let query = supabase
    .from('sys_dict_type')
    .select('id, name, code, cascade_parent_type_id')
    .eq('node_type', 'dictionary')
    .eq('status', '1')
    .order('name', { ascending: true })

  if (params.excludeId) query = query.neq('id', params.excludeId)

  return await responseHandle<DictionaryTypeOption[]>(() => query, {
    showErrorMessage: true
  })
}

/**
 * 获取可作为上级节点的字典目录树。
 * 编辑目录时排除当前目录及其后代，避免形成循环层级。
 */
export async function fetchDictionaryDirectoryTree(params: { excludeId?: string } = {}) {
  const response = await responseHandle<Api.DataCenter.DictTypeItem[]>(
    () =>
      supabase
        .from('sys_dict_type')
        .select('id, parent_id, node_type, name, code, status, sort')
        .eq('node_type', 'directory')
        .order('sort', { ascending: true })
        .order('name', { ascending: true }),
    { showErrorMessage: true }
  )
  const tree = dictTypeTreeUtils.listToTree(response.data ?? [], (a, b) => {
    const sortDiff = Number(a.sort ?? 0) - Number(b.sort ?? 0)
    return sortDiff || a.name.localeCompare(b.name, 'zh-CN')
  })
  const data = params.excludeId
    ? dictTypeTreeUtils.removeNodesByCondition(tree, (node) => node.id === params.excludeId).tree
    : tree

  return { ...response, data }
}

// 删除字典类型
export async function deleteDictType(params: Api.DataCenter.DictTypeItem) {
  const { id } = params
  return await responseHandle(
    () => supabase.from('sys_dict_type').delete({ count: 'exact' }).eq('id', id),
    {
      showMessage: true,
      requireAffected: true,
      noAffectedMessage: WRITE_PERMISSION_DENIED_MESSAGE
    }
  )
}

// 新增字典类型
export async function addDictType(params: Api.DataCenter.DictTypeItem) {
  return await responseHandle(
    () => supabase.from('sys_dict_type').insert(keysToSnakeDeep(params)),
    {
      showMessage: true,
      breakReturn: true
    }
  )
}

// 编辑字典类型
export async function editDictType(params: Api.DataCenter.DictTypeItem) {
  const { id, ...payload } = params
  return await responseHandle(
    () =>
      supabase
        .from('sys_dict_type')
        .update(keysToSnakeDeep(payload), { count: 'exact' })
        .eq('id', id),
    {
      showMessage: true,
      breakReturn: true,
      requireAffected: true,
      noAffectedMessage: WRITE_PERMISSION_DENIED_MESSAGE
    }
  )
}

export async function saveDictTypeTreeOrder(
  updates: Array<{ id: string; parentId: string | null; sort: number }>
) {
  return await responseHandle(
    () =>
      supabase.rpc('save_dict_type_tree_order', {
        p_updates: updates
      }),
    {
      breakReturn: true,
      showMessage: false
    }
  )
}

// 根据类型 ID 查询字典项
export async function fetchDictionaryListByTypeId(
  params: Partial<Api.DataCenter.DictListItem> &
    Api.Common.CommonSearchParams & { recordId?: string }
) {
  const { typeId, label = '', code, i18nScope, status, recordId } = params
  const specs = [
    { col: 'id', op: 'eq', val: recordId },
    { col: 'typeId', op: 'eq', val: typeId },
    { col: 'label', op: 'ilike', val: `%${label}%` },
    { col: 'code', op: 'eq', val: code },
    { col: 'i18nScope', op: 'eq', val: i18nScope },
    { col: 'status', op: 'eq', val: status }
  ]

  let query = supabase
    .from('sys_dictionary')
    .select('*', { count: 'exact' })
    .order('sort', { ascending: true })
    .order('label', { ascending: true })

  query = applyFilters(query, specs, { skipEmpty: true, camelToSnake: true })
  return await responseHandle(() => query, {})
}

export async function fetchDictTypeIdByDictionaryId(id: string): Promise<string | undefined> {
  const { data } = await responseHandle<{ typeId?: string } | null>(
    () => supabase.from('sys_dictionary').select('type_id').eq('id', id).maybeSingle(),
    {}
  )
  return data?.typeId
}

// 字典项列表
export async function fetchDictionaryList(): Promise<QueryResult<DictionaryWithType[]>> {
  return await fetchAllRangePages<DictionaryWithType>(
    ({ from, to }) => {
      const query = supabase
        .from('sys_dictionary')
        .select(
          `
          id,
          type_id,
          code,
          label,
          value,
          status,
          sort,
          color,
          tag_type,
          remark,
          parent_id,
          cascade_parent_id,
          dict_type_table:sys_dict_type!inner(
            code,
            name
          )
        `
        )
        .eq('status', '1')
        .eq('dict_type_table.status', '1')
        .order('sort', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)

      return responseHandle<DictionaryWithType[]>(() => query, {})
    },
    { pageSize: DICTIONARY_BATCH_SIZE }
  )
}

/** 按字典类型编码精确加载启用项，供业务页面按需补齐持久化字典缓存。 */
export async function fetchDictionaryListByTypeCode(
  dictCode: string
): Promise<QueryResult<DictionaryWithType[]>> {
  return await responseHandle<DictionaryWithType[]>(
    () =>
      supabase
        .from('sys_dictionary')
        .select(
          `
          id,
          type_id,
          code,
          label,
          value,
          status,
          sort,
          color,
          tag_type,
          remark,
          parent_id,
          cascade_parent_id,
          dict_type_table:sys_dict_type!inner(
            code,
            name
          )
        `
        )
        .eq('status', '1')
        .eq('dict_type_table.status', '1')
        .eq('dict_type_table.code', dictCode)
        .order('sort', { ascending: true })
        .order('id', { ascending: true }),
    {}
  )
}

/** 仅用于既有值展示；停用项不得合并进业务下拉选项。 */
export async function fetchDictionaryDisplayItem(
  dictCode: string,
  value: string
): Promise<QueryResult<Api.DataCenter.DictListItem[]>> {
  return responseHandle<Api.DataCenter.DictListItem[]>(
    () =>
      supabase
        .from('sys_dictionary')
        .select(
          'id,type_id,code,label,value,status,sort,color,tag_type,remark,parent_id,cascade_parent_id,dict_type_table:sys_dict_type!inner(code,name)'
        )
        .eq('dict_type_table.code', dictCode)
        .eq('value', value)
        .order('id', { ascending: true })
        .limit(1),
    {}
  )
}

// 删除字典项
export async function deleteDict(params: Api.DataCenter.DictListItem) {
  const { id } = params
  return await responseHandle(
    () => supabase.from('sys_dictionary').delete({ count: 'exact' }).eq('id', id),
    {
      showMessage: true,
      requireAffected: true,
      noAffectedMessage: WRITE_PERMISSION_DENIED_MESSAGE
    }
  )
}

// 批量删除字典项
export async function deleteDictBatch(ids: string[]) {
  return await responseHandle(
    () => supabase.from('sys_dictionary').delete({ count: 'exact' }).in('id', ids),
    {
      showMessage: true,
      requireAffected: true,
      noAffectedMessage: WRITE_PERMISSION_DENIED_MESSAGE
    }
  )
}

// 新增字典项
export async function addDict(params: Api.DataCenter.DictListItem) {
  return await responseHandle(
    () => supabase.from('sys_dictionary').insert(keysToSnakeDeep(params)),
    {
      showMessage: true,
      breakReturn: true
    }
  )
}

// 编辑字典项
export async function editDict(params: Api.DataCenter.DictListItem) {
  const { id, ...payload } = params
  return await responseHandle(
    () =>
      supabase
        .from('sys_dictionary')
        .update(keysToSnakeDeep(payload), { count: 'exact' })
        .eq('id', id),
    {
      showMessage: true,
      breakReturn: true,
      requireAffected: true,
      noAffectedMessage: WRITE_PERMISSION_DENIED_MESSAGE
    }
  )
}

// 资源列表
export async function fetchResourceList(
  params: Api.DataCenter.Resources.ResourceSearchParams & { tenantId?: string }
) {
  const { originName = '', suffix = '', tenantId, from = 0, to = 9 } = params
  const specs: FilterSpec[] = [{ col: 'originName', op: 'ilike', val: `%${originName}%` }]

  if (suffix) {
    const suffixArray = suffix
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    if (suffixArray.length > 0) {
      specs.push({ col: 'suffix', op: 'in', val: suffixArray })
    }
  }

  let query = supabase
    .from('sys_attachment')
    .select('*', { count: 'exact' })
    .order('create_time', { ascending: false })
    .range(from, to)

  if (tenantId) query = query.eq('tenant_id', tenantId)
  query = applyFilters(query, specs, { skipEmpty: true, camelToSnake: true })
  return await responseHandle<Api.DataCenter.Resources.ResourceListItem[]>(() => query, {
    showErrorMessage: true
  })
}

interface RenameResourceParams {
  id: string
  originName: string
}

// 重命名仅更新业务展示名；Storage 对象继续使用内容哈希路径，链接不会失效。
export async function renameResource(params: RenameResourceParams) {
  const { id, originName } = params
  return await responseHandle(
    () =>
      supabase
        .from('sys_attachment')
        .update({ origin_name: originName }, { count: 'exact' })
        .eq('id', id),
    {
      breakReturn: true,
      requireAffected: true,
      noAffectedMessage: WRITE_PERMISSION_DENIED_MESSAGE,
      errorMessage: '附件重命名失败，请稍后重试'
    }
  )
}

// 删除资源，同时清理 Storage 对象
export async function deleteResource(params: Api.DataCenter.Resources.ResourceListItem) {
  const { id } = params

  const { data: resourceItem } = await responseHandle(
    () => supabase.from('sys_attachment').select().eq('id', id).single(),
    {}
  )

  if (!resourceItem) throw new Error('未找到待删除的附件')
  const { storagePath, objectName } = resourceItem as Api.DataCenter.Resources.ResourceListItem

  await responseHandle(
    () => supabase.from('sys_attachment').delete({ count: 'exact' }).eq('id', id),
    {
      breakReturn: true,
      requireAffected: true,
      noAffectedMessage: WRITE_PERMISSION_DENIED_MESSAGE,
      errorMessage: '附件删除失败，请稍后重试'
    }
  )

  if (!storagePath || !objectName) return { storageCleanupFailed: false }

  const fullPath = `${storagePath}/${objectName}`
  const { error } = await supabase.storage.from('attachments').remove([fullPath])
  if (error) {
    console.warn('[AttachmentCleanup] 附件记录已删除，但存储对象清理失败:', error)
    return { storageCleanupFailed: true }
  }

  return { storageCleanupFailed: false }
}

/**
 * 读取 SQL 工作台需要的元数据。
 * 当前除了 schema / table / column / function，也会补上外键信息，
 * 这样前端才能做 JOIN 自动推断。
 */
export async function fetchDatabaseMetadata(): Promise<Api.DataCenter.SqlConsole.DatabaseMetadata> {
  const [{ data, error }, foreignKeys] = await Promise.all([
    invokeSupabaseFunctionWithSessionRecovery('execute-sql-with-columns', {
      body: { action: 'metadata' }
    }),
    fetchForeignKeysMetadata()
  ])

  if (error) throw new Error('数据库结构加载失败，请稍后重试', { cause: error })
  if (!data) throw new Error('数据库结构服务未返回数据，请稍后重试')

  const payload = normalizeMetadataPayload(data)
  if (!payload) throw new Error('数据库结构响应格式异常，请联系管理员')
  const schemas = payload.schemas

  const columns: Api.DataCenter.SqlConsole.ColumnMetadata[] = payload.columns.map((c) => ({
    tableSchema: c.tableSchema,
    tableName: c.tableName,
    columnName: c.columnName,
    dataType: c.dataType,
    isNullable: c.isNullable,
    ordinalPosition: c.ordinalPosition
  }))

  // 以后端 columns 为准重建 table 结构，保证表和列始终同步。
  const tablesMap = new Map<string, Api.DataCenter.SqlConsole.TableMetadata>()
  columns.forEach((col) => {
    const key = `${col.tableSchema}.${col.tableName}`
    if (!tablesMap.has(key)) {
      tablesMap.set(key, {
        tableSchema: col.tableSchema,
        tableName: col.tableName,
        columns: []
      })
    }
    tablesMap.get(key)!.columns.push({
      name: col.columnName,
      dataType: col.dataType,
      isNullable: col.isNullable === 'YES'
    })
  })
  const tables: Api.DataCenter.SqlConsole.TableMetadata[] = Array.from(tablesMap.values())

  const functions: Api.DataCenter.SqlConsole.FunctionMetadata[] = (payload.functions ?? []).map(
    (f) => ({
      routineSchema: f.routineSchema,
      routineName: f.routineName,
      returnType: f.returnType
    })
  )

  return {
    schemas,
    columns,
    tables,
    functions,
    foreignKeys
  }
}

// 额外查询外键关系，给 JOIN 自动推断和 AI schema 摘要使用。
async function fetchForeignKeysMetadata(): Promise<Api.DataCenter.SqlConsole.ForeignKeyMetadata[]> {
  const relationQuery = `
    SELECT
      source_ns.nspname AS source_schema,
      source_table.relname AS source_table,
      source_column.attname AS source_column,
      target_ns.nspname AS target_schema,
      target_table.relname AS target_table,
      target_column.attname AS target_column,
      relation.conname AS constraint_name
    FROM pg_catalog.pg_constraint relation
    JOIN pg_catalog.pg_class source_table ON source_table.oid = relation.conrelid
    JOIN pg_catalog.pg_namespace source_ns ON source_ns.oid = source_table.relnamespace
    JOIN pg_catalog.pg_class target_table ON target_table.oid = relation.confrelid
    JOIN pg_catalog.pg_namespace target_ns ON target_ns.oid = target_table.relnamespace
    JOIN LATERAL unnest(relation.conkey, relation.confkey)
      AS column_pair(source_attnum, target_attnum) ON true
    JOIN pg_catalog.pg_attribute source_column
      ON source_column.attrelid = source_table.oid
      AND source_column.attnum = column_pair.source_attnum
    JOIN pg_catalog.pg_attribute target_column
      ON target_column.attrelid = target_table.oid
      AND target_column.attnum = column_pair.target_attnum
    WHERE relation.contype = 'f'
      AND source_ns.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
    ORDER BY source_ns.nspname, source_table.relname, relation.conname
  `

  const { data, error } = await executeSql({ query: relationQuery })
  const rows = data?.rows
  if (error) throw new Error('数据库关联关系加载失败，请稍后重试', { cause: error })
  if (data?.status !== 'ok' || !Array.isArray(rows)) {
    throw new Error('数据库关联关系服务未返回有效数据，请稍后重试')
  }

  return rows.map((item) => {
    const readField = (camelCase: string, snakeCase: string): string => {
      const value = item[camelCase] ?? item[snakeCase]
      if (typeof value !== 'string' || !value) {
        throw new Error('数据库关联关系响应格式异常，请联系管理员')
      }
      return value
    }

    return {
      sourceSchema: readField('sourceSchema', 'source_schema'),
      sourceTable: readField('sourceTable', 'source_table'),
      sourceColumn: readField('sourceColumn', 'source_column'),
      targetSchema: readField('targetSchema', 'target_schema'),
      targetTable: readField('targetTable', 'target_table'),
      targetColumn: readField('targetColumn', 'target_column'),
      constraintName: readField('constraintName', 'constraint_name')
    }
  })
}

// SQL 执行入口，调用现有 Edge Function 并保留原始错误给编辑器做定位。
export async function executeSql(
  params: Api.DataCenter.SqlConsole.SqlExecuteRequest
): Promise<DataCenterQueryResult<Api.DataCenter.SqlConsole.SqlExecuteResponse>> {
  const invokeResp = () =>
    invokeSupabaseFunctionWithSessionRecovery<Api.DataCenter.SqlConsole.SqlExecuteResponse>(
      'execute-sql-with-columns',
      {
        body: params
      }
    )

  return await responseHandle(invokeResp, {
    convertToCamelShadow: true,
    returnRawError: true
  })
}

// AI SQL 入口单独保留，方便后面替换模型提供方而不动工作台页面。
export async function generateSqlByAi(
  params: Api.DataCenter.SqlConsole.SqlAiGenerateRequest
): Promise<QueryResult<Api.DataCenter.SqlConsole.SqlAiGenerateResponse>> {
  const invokeResp = () =>
    invokeSupabaseFunctionWithSessionRecovery<Api.DataCenter.SqlConsole.SqlAiGenerateResponse>(
      'ai-sql-assistant',
      { body: params }
    )

  return await responseHandle(invokeResp, {
    convertToCamelShadow: true,
    returnRawError: true
  })
}
