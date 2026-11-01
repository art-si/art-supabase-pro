<template>
  <ArtDrawer
    ref="drawerRef"
    :size="520"
    :show-confirm-button="false"
    cancel-text="关闭"
    :show-form-focus-button="false"
    @closed="applyPendingAction"
  >
    <div class="flex flex-col gap-4">
      <div class="flex min-w-0 gap-2">
        <ElSelect
          v-if="mode === 'schema'"
          v-model="schemaFilter"
          class="w-38! shrink-0"
          filterable
          aria-label="选择数据库 schema"
        >
          <template #prefix
            ><ArtSvgIcon icon="ri:database-2-line" class="text-base text-g-600" aria-hidden="true"
          /></template>
          <ElOption label="全部 schema" value="" />
          <ElOption
            v-for="schema in metadata?.schemas || []"
            :key="schema"
            :label="schema"
            :value="schema"
          >
            <span class="flex items-center justify-between gap-3">
              <span>{{ schema }}</span>
              <span class="text-xs text-g-600">{{ schemaTableCounts[schema] || 0 }} 张表</span>
            </span>
          </ElOption>
        </ElSelect>
        <ElInput
          v-model="keyword"
          class="min-w-0 flex-1"
          clearable
          :placeholder="mode === 'schema' ? '搜索表名、字段或注释' : '搜索执行过的 SQL'"
          :aria-label="mode === 'schema' ? '搜索数据库结构' : '搜索查询历史'"
        >
          <template #prefix
            ><ElIcon><Search /></ElIcon
          ></template>
        </ElInput>
      </div>
      <template v-if="mode === 'schema'">
        <div class="flex items-center justify-between gap-3 text-xs text-g-600">
          <span
            >{{ normalizedKeyword && searchMetadata ? '数据库目录搜索 · ' : ''
            }}{{ filteredTables.length }} 张表 · 点击字段可插入编辑器{{
              metadataSearch.state.result?.searchTruncated ? ' · 结果已截断，请缩小关键词' : ''
            }}</span
          >
          <ElButton link type="primary" :loading="loading" @click="emit('refresh')"
            >刷新结构</ElButton
          >
        </div>
        <ArtAsyncState
          :loading="loading || metadataSearch.state.loading"
          :error="error || metadataSearch.state.error"
          :empty="!filteredTables.length"
          empty-text="没有匹配的表"
          empty-description="尝试其他表名或字段名，或刷新数据库结构"
          size="compact"
          @retry="metadataSearch.state.error ? metadataSearch.execute() : emit('refresh')"
        >
          <div ref="tableListRef">
            <ElCollapse v-model="expanded" accordion class="sql-object-list">
              <ElCollapseItem
                v-for="table in pagedTables"
                :key="`${table.tableSchema}.${table.tableName}`"
                :name="`${table.tableSchema}.${table.tableName}`"
              >
                <template #title>
                  <span
                    class="sql-table-title"
                    :title="`${table.tableSchema}.${table.tableName}`"
                    :data-table-schema="table.tableSchema"
                    :data-table-name="table.tableName"
                  >
                    <ArtSvgIcon
                      :icon="table.kind === 'view' ? 'ri:eye-line' : 'ri:table-line'"
                      class="sql-table-title__icon"
                    />
                    <span class="sql-table-title__identity">
                      <span class="sql-table-title__name">{{ table.tableName }}</span>
                      <span class="sql-table-title__schema"
                        >{{ table.tableSchema }} · {{ tableKindLabel(table.kind) }}</span
                      >
                    </span>
                    <span class="sql-table-title__count">{{ getColumnMatchLabel(table) }}</span>
                  </span>
                </template>
                <ArtAsyncState
                  :loading="tableLoading.has(tableKey(table))"
                  :error="tableErrors.get(tableKey(table))"
                  :min-height="100"
                  error-title="对象详情加载失败"
                  size="compact"
                  @retry="loadTable(table)"
                >
                  <template v-if="table.detailsLoaded !== false">
                    <p v-if="table.description" class="m-0 mb-3 text-xs leading-5 text-g-700">{{
                      table.description
                    }}</p>
                    <div class="sql-detail-section sql-template-actions">
                      <div class="sql-detail-section__heading">查询模板 · 载入编辑器，不会执行</div>
                      <div class="flex flex-wrap gap-2">
                        <ElButton
                          v-for="template in buildSqlTableTemplates(table, dialect)"
                          :key="template.kind"
                          size="small"
                          :aria-label="templateButtonName(template.kind)"
                          @click="restore(template.sql)"
                          >{{ templateButtonName(template.kind) }}</ElButton
                        >
                      </div>
                    </div>
                    <div class="mb-2 mt-3 flex items-center justify-between gap-2">
                      <span class="text-xs text-g-600">字段 / 约束与类型</span>
                      <ElButton
                        size="small"
                        link
                        type="primary"
                        @click="insertIdentifier(table.tableSchema, table.tableName)"
                        >插入表名</ElButton
                      >
                    </div>
                    <div v-for="column in table.columns" :key="column.name" class="sql-column-row">
                      <button
                        type="button"
                        class="sql-column-button"
                        :title="`插入 ${column.name} · ${column.isNullable ? '可为空' : '不可为空'}`"
                        @click="insertIdentifier(column.name)"
                      >
                        <span class="min-w-0 flex-1">
                          <span class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                            <span
                              class="truncate font-mono"
                              :class="
                                matchesColumn(column) ? 'font-medium text-primary' : undefined
                              "
                              >{{ column.name }}</span
                            >
                            <span v-if="column.isPrimaryKey" class="sql-column-key">PK</span>
                            <span
                              v-if="columnHasForeignKey(table, column.name)"
                              class="sql-column-key"
                              >FK</span
                            >
                          </span>
                          <span v-if="column.description" class="sql-column-description">{{
                            column.description
                          }}</span>
                          <span v-if="column.defaultValue" class="sql-column-description font-mono"
                            >默认 {{ column.defaultValue }}</span
                          >
                        </span>
                        <span class="flex shrink-0 items-center gap-2 text-xs text-g-600">
                          <span v-if="!column.isNullable">非空</span>
                          <span>{{ column.dataType }}</span>
                        </span>
                      </button>
                    </div>
                    <div v-if="tableRelations(table).length" class="sql-detail-section">
                      <div class="sql-detail-section__heading">关联关系</div>
                      <div
                        v-for="relation in tableRelations(table)"
                        :key="`${relation.constraintName}:${relation.sourceColumn}:${relation.targetColumn}`"
                        class="sql-relation-row"
                      >
                        <div class="min-w-0 text-xs leading-5">
                          <span class="font-mono">{{ relation.sourceColumn }}</span>
                          <span class="mx-1 text-g-600">→</span>
                          <span class="font-mono"
                            >{{ relation.targetSchema }}.{{ relation.targetTable }}.{{
                              relation.targetColumn
                            }}</span
                          >
                        </div>
                        <ElButton
                          v-if="hasTable(relation.targetSchema, relation.targetTable)"
                          size="small"
                          link
                          type="primary"
                          :aria-label="`定位关联表 ${relation.targetSchema}.${relation.targetTable}`"
                          @click="locateTable(relation.targetSchema, relation.targetTable)"
                          >定位关联表 {{ relation.targetSchema }}.{{
                            relation.targetTable
                          }}</ElButton
                        >
                        <span v-else class="text-xs text-g-600">目标表不在当前结构中</span>
                      </div>
                    </div>
                    <div v-if="table.indexes?.length" class="sql-detail-section">
                      <div class="sql-detail-section__heading"
                        >索引 · {{ table.indexes.length }}</div
                      >
                      <details
                        v-for="index in table.indexes"
                        :key="index.name"
                        class="sql-index-row"
                      >
                        <summary class="sql-index-row__summary">
                          <span class="min-w-0 break-all font-mono">{{ index.name }}</span>
                          <span v-if="index.isPrimary" class="sql-column-key">主键</span>
                          <span v-else-if="index.isUnique" class="sql-column-key">唯一</span>
                        </summary>
                        <div class="px-2 pb-2 text-xs leading-5 text-g-700">
                          <div>字段：{{ index.columns.join('、') || '表达式索引' }}</div>
                          <code v-if="index.definition" class="sql-index-row__definition">{{
                            index.definition
                          }}</code>
                        </div>
                      </details>
                    </div>
                  </template></ArtAsyncState
                >
              </ElCollapseItem>
            </ElCollapse>
          </div>
        </ArtAsyncState>
      </template>
      <template v-else>
        <p class="m-0 text-xs leading-5 text-g-700"
          >最近 30 次执行，仅保存在此浏览器，按账号、租户和连接隔离。点击条目预览
          SQL，再选择载入方式；不会自动执行。</p
        >
        <ArtEmptyState
          v-if="!filteredHistory.length"
          :title="history.length ? '没有匹配的历史' : '暂无查询历史'"
          :description="
            history.length
              ? '尝试其他 SQL 关键词，或清空搜索查看最近记录'
              : '执行 SQL 后，可在这里找到并复用'
          "
          size="compact"
        />
        <div v-for="entry in filteredHistory" :key="entry.id" class="min-w-0">
          <button
            type="button"
            class="sql-history-button"
            :aria-label="`预览历史 SQL：${formatDateTimeValue(entry.executedAt)}`"
            :aria-expanded="selectedHistory === entry"
            :aria-controls="selectedHistory === entry ? historyPreviewId : undefined"
            @click="toggleHistory(entry)"
          >
            <span class="flex items-center justify-between gap-3 text-xs">
              <span
                :class="
                  entry.status === 'ok'
                    ? 'text-success'
                    : entry.status === 'cancelled'
                      ? 'text-g-700'
                      : 'text-danger'
                "
                >{{
                  entry.status === 'ok'
                    ? '执行成功'
                    : entry.status === 'cancelled'
                      ? '已取消'
                      : '执行失败'
                }}</span
              >
              <span class="text-g-700">{{ formatDateTimeValue(entry.executedAt) }}</span>
            </span>
            <span v-if="entry.schema" class="break-all text-xs text-primary"
              >schema · {{ entry.schema }}</span
            >
            <code class="sql-history-button__sql">{{ entry.sql }}</code>
            <span class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-g-700"
              ><span v-if="entry.durationMs !== undefined">{{ entry.durationMs }} ms</span
              ><span v-if="entry.rowCount !== undefined">{{ entry.rowCount }} 行</span
              ><span class="ml-auto text-primary">{{
                selectedHistory === entry ? '收起预览' : '预览 SQL'
              }}</span></span
            >
          </button>
          <section
            v-if="selectedHistory === entry"
            :id="historyPreviewId"
            aria-label="历史 SQL 预览"
            class="mt-3 flex min-w-0 flex-col gap-3"
          >
            <PlanCodePreview
              :key="entry.id"
              title="历史 SQL 预览"
              :code="entry.sql"
              language="sql"
              expanded
              max-height="min(320px, 45dvh)"
            />
            <p class="m-0 text-xs leading-5 text-g-700">
              在新页签打开会保留当前 SQL 草稿；载入当前页签会替换 SQL 并清除旧结果，可用撤销恢复原
              SQL。两种方式均不会自动执行。
            </p>
            <p
              v-if="historyActionsDisabledReason"
              class="m-0 text-xs leading-5 text-g-700"
              role="status"
            >
              {{ historyActionsDisabledReason }}
            </p>
            <p
              v-else-if="historyNewTabDisabledReason"
              class="m-0 text-xs leading-5 text-g-700"
              role="status"
            >
              {{ historyNewTabDisabledReason }}
            </p>
            <div class="flex flex-wrap items-center gap-2">
              <ElButton
                type="primary"
                size="small"
                :disabled="Boolean(historyActionsDisabledReason || historyNewTabDisabledReason)"
                @click="chooseHistory(entry, 'open-query')"
              >
                <ArtSvgIcon icon="ri:file-add-line" />在新页签打开
              </ElButton>
              <ElButton
                size="small"
                :disabled="Boolean(historyActionsDisabledReason)"
                @click="chooseHistory(entry, 'restore')"
              >
                载入当前页签
              </ElButton>
            </div>
          </section>
        </div>
      </template>
    </div>
    <template #footer>
      <div
        v-if="mode === 'schema' && filteredTables.length > 30 && !error"
        class="sql-schema-pagination custom-pagination"
      >
        <span>共 {{ filteredTables.length }} 张表</span>
        <ElPagination
          v-model:current-page="page"
          :page-size="30"
          :total="filteredTables.length"
          :pager-count="5"
          layout="prev, pager, next"
          background
          size="default"
          :disabled="loading"
          aria-label="数据库结构分页"
        />
      </div>
      <ElButton v-else @click="drawerRef?.handleClose()">关闭</ElButton>
    </template>
  </ArtDrawer>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, reactive, ref, shallowRef, useId, watch } from 'vue'
  import { Search } from '@element-plus/icons-vue'
  import { countBy } from 'lodash-es'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import { formatDateTimeValue } from '@/utils/ui/format'
  import { buildSqlTableTemplates, quoteSqlIdentifier } from '@/utils/sql-workbench'
  import type { SqlHistoryEntry } from './use-sql-workspace'
  import { useSqlMetadataSearch, type SqlMetadataSearch } from './use-sql-metadata-search'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import PlanCodePreview from './plan-code-preview.vue'

  const props = withDefaults(
    defineProps<{
      metadata: Api.DataCenter.SqlConsole.DatabaseMetadata | null
      loading: boolean
      error: string | null
      history: SqlHistoryEntry[]
      owner: string
      historyActionsDisabledReason?: string
      historyNewTabDisabledReason?: string
      dialect?: 'postgres' | 'mysql' | 'dm'
      ensureTable?: (schema: string, name: string) => Promise<void>
      searchMetadata?: SqlMetadataSearch
    }>(),
    { historyActionsDisabledReason: '', historyNewTabDisabledReason: '' }
  )
  const emit = defineEmits<{
    insert: [sql: string, owner: string]
    restore: [sql: string, schema: string | undefined, owner: string]
    'restore-history': [sql: string, schema: string | undefined, owner: string]
    'open-query': [sql: string, schema: string | undefined, owner: string]
    refresh: []
  }>()
  const drawerRef = ref<ArtDrawerExpose>()
  const tableListRef = ref<HTMLElement>()
  const mode = ref<'schema' | 'history'>('schema')
  const keyword = ref('')
  const historyPreviewId = useId()
  const historyPreview = shallowRef<{
    entry: SqlHistoryEntry
    id: string
    sql: string
    schema: string
    owner: string
  } | null>(null)
  const metadataSearch = useSqlMetadataSearch(
    keyword,
    () => props.searchMetadata,
    () => mode.value === 'schema'
  )
  const normalizedKeyword = computed(() => keyword.value.trim().toLowerCase())
  const schemaTableCounts = computed(() => countBy(props.metadata?.tables || [], 'tableSchema'))
  const matchesColumn = (column: { name: string; description?: string | null }): boolean =>
    Boolean(
      normalizedKeyword.value &&
      `${column.name} ${column.description || ''}`.toLowerCase().includes(normalizedKeyword.value)
    )
  const getColumnMatchLabel = (table: Api.DataCenter.SqlConsole.TableMetadata): string => {
    if (table.matchedColumns?.length)
      return `字段匹配 · ${table.columnCount ?? table.columns.length} 列`
    const count = table.columns.filter(matchesColumn).length
    return count ? `${count} 列匹配` : `${table.columnCount ?? table.columns.length} 列`
  }
  const schemaFilter = ref('public')
  const expanded = ref('')
  const page = ref(1)
  const locatedTable = ref<{ schema: string; name: string } | null>(null)
  const tableLoading = reactive(new Set<string>())
  const tableErrors = reactive(new Map<string, string>())
  let detailGeneration = 0
  const tableKey = (table: Api.DataCenter.SqlConsole.TableMetadata) =>
    `${table.tableSchema}.${table.tableName}`
  const loadTable = async (table: Api.DataCenter.SqlConsole.TableMetadata) => {
    const key = tableKey(table)
    if (table.detailsLoaded !== false) {
      tableErrors.delete(key)
      return
    }
    if (tableLoading.has(key)) return
    const current = detailGeneration
    tableLoading.add(key)
    tableErrors.delete(key)
    try {
      if (!props.ensureTable) throw new Error('对象详情尚未加载，请刷新数据库结构后重试')
      await props.ensureTable(table.tableSchema, table.tableName)
      if (current !== detailGeneration) return
      const loaded = props.metadata?.tables.find(
        (candidate) =>
          candidate.tableSchema === table.tableSchema && candidate.tableName === table.tableName
      )
      if (!loaded || loaded.detailsLoaded === false)
        throw new Error('对象详情未返回，请刷新结构后重试')
    } catch (cause) {
      if (current === detailGeneration)
        tableErrors.set(key, getFriendlySupabaseErrorMessage(cause, '对象详情加载失败，请重试'))
    } finally {
      if (current === detailGeneration) tableLoading.delete(key)
    }
  }
  let pendingAction: {
    mode: 'insert' | 'restore' | 'open-query'
    sql: string
    schema?: string
    owner: string
    session: number
    history?: { id: string; entry: SqlHistoryEntry }
  } | null = null
  let session = 0
  let alive = true
  const tableKindLabel = (kind?: Api.DataCenter.SqlConsole.TableMetadata['kind']): string =>
    kind === 'view' ? '视图' : kind === 'materialized_view' ? '物化视图' : '数据表'
  const templateButtonName = (kind: 'select' | 'count' | 'primary-key'): string =>
    kind === 'select'
      ? '生成 SELECT 查询'
      : kind === 'count'
        ? '生成 COUNT 查询'
        : '生成主键筛选查询'
  const tableRelations = (table: Api.DataCenter.SqlConsole.TableMetadata) =>
    (props.metadata?.foreignKeys || []).filter(
      (key) => key.sourceSchema === table.tableSchema && key.sourceTable === table.tableName
    )
  const columnHasForeignKey = (
    table: Api.DataCenter.SqlConsole.TableMetadata,
    columnName: string
  ): boolean => tableRelations(table).some((key) => key.sourceColumn === columnName)
  const hasTable = (schema: string, name: string): boolean =>
    Boolean(
      props.metadata?.tables.some(
        (table) => table.tableSchema === schema && table.tableName === name
      )
    )
  const locateTable = async (schema: string, name: string) => {
    const owner = props.owner
    const currentSession = session
    schemaFilter.value = schema
    keyword.value = ''
    await nextTick()
    if (!alive || owner !== props.owner || currentSession !== session) return
    const index = filteredTables.value.findIndex(
      (table) => table.tableSchema === schema && table.tableName === name
    )
    if (index < 0) return
    page.value = Math.floor(index / 30) + 1
    await nextTick()
    if (!alive || owner !== props.owner || currentSession !== session) return
    expanded.value = `${schema}.${name}`
    locatedTable.value = { schema, name }
    const title = Array.from(
      tableListRef.value?.querySelectorAll<HTMLElement>('[data-table-schema][data-table-name]') ||
        []
    ).find(
      (element) => element.dataset.tableSchema === schema && element.dataset.tableName === name
    )
    title?.scrollIntoView({ block: 'nearest' })
  }
  const filteredTables = computed(() => {
    const search = normalizedKeyword.value
    const source = search && props.searchMetadata ? metadataSearch.state.result : props.metadata
    const loadedTables = new Map(
      (props.metadata?.tables || []).map((table) => [
        JSON.stringify([table.tableSchema, table.tableName]),
        table
      ])
    )
    const tables = (source?.tables || []).map((table) => {
      if (table.detailsLoaded !== false) return table
      const loaded = loadedTables.get(JSON.stringify([table.tableSchema, table.tableName]))
      return loaded && loaded.detailsLoaded !== false
        ? { ...loaded, matchedColumns: table.matchedColumns }
        : table
    })
    return tables.filter(
      (table) =>
        (!schemaFilter.value || table.tableSchema === schemaFilter.value) &&
        (!search ||
          metadataSearch.state.result?.metadataMode === 'search' ||
          Boolean(table.matchedColumns?.length) ||
          `${table.tableSchema}.${table.tableName}`.toLowerCase().includes(search) ||
          table.description?.toLowerCase().includes(search) ||
          table.columns.some(matchesColumn))
    )
  })
  const pagedTables = computed(() =>
    filteredTables.value.slice((page.value - 1) * 30, page.value * 30)
  )
  watch(
    () => filteredTables.value.length,
    (count) => {
      page.value = Math.min(page.value, Math.max(1, Math.ceil(count / 30)))
    }
  )
  const filteredHistory = computed(() =>
    props.history.filter((entry) => entry.sql.toLowerCase().includes(normalizedKeyword.value))
  )
  const selectedHistory = computed(() => {
    const selection = historyPreview.value
    if (!selection || selection.owner !== props.owner) return null
    return (
      filteredHistory.value.find(
        (entry) =>
          entry === selection.entry &&
          entry.id === selection.id &&
          entry.sql === selection.sql &&
          (entry.schema ?? '') === selection.schema
      ) ?? null
    )
  })
  watch(
    selectedHistory,
    (entry) => {
      if (entry) return
      historyPreview.value = null
      if (pendingAction?.history) pendingAction = null
    },
    { flush: 'sync' }
  )
  const toggleHistory = (entry: SqlHistoryEntry): void => {
    if (!alive || !filteredHistory.value.includes(entry)) return
    pendingAction = null
    historyPreview.value =
      selectedHistory.value === entry
        ? null
        : { entry, id: entry.id, sql: entry.sql, schema: entry.schema ?? '', owner: props.owner }
  }
  const chooseHistory = (entry: SqlHistoryEntry, action: 'restore' | 'open-query'): void => {
    if (
      !alive ||
      props.historyActionsDisabledReason ||
      (action === 'open-query' && props.historyNewTabDisabledReason) ||
      selectedHistory.value !== entry
    )
      return
    pendingAction = {
      mode: action,
      sql: entry.sql,
      schema: entry.schema ?? '',
      owner: props.owner,
      session,
      history: { id: entry.id, entry }
    }
    void drawerRef.value?.handleClose()
  }
  watch([keyword, schemaFilter], () => {
    page.value = 1
    expanded.value = ''
    locatedTable.value = null
  })
  watch(
    () => JSON.stringify(props.metadata?.schemas || []),
    () => {
      const metadata = props.metadata
      if (metadata && schemaFilter.value && !metadata.schemas.includes(schemaFilter.value))
        schemaFilter.value = metadata.schemas.includes('public') ? 'public' : ''
      const target = locatedTable.value
      if (metadata && target) {
        if (
          !metadata.tables.some(
            (table) => table.tableSchema === target.schema && table.tableName === target.name
          )
        ) {
          locatedTable.value = null
        }
      }
    }
  )
  watch(
    () => [expanded.value, props.metadata],
    () => {
      const table = props.metadata?.tables.find((table) => tableKey(table) === expanded.value)
      if (table) void loadTable(table)
    }
  )
  watch(page, () => {
    expanded.value = ''
    drawerRef.value?.scrollTo({ top: 0 })
  })
  const open = async (
    nextMode: 'schema' | 'history',
    target?: { schema?: string; name: string }
  ) => {
    const currentSession = ++session
    const owner = props.owner
    pendingAction = null
    historyPreview.value = null
    locatedTable.value = null
    mode.value = nextMode
    keyword.value = ''
    page.value = 1
    await drawerRef.value?.handleOpen(undefined, {
      title: nextMode === 'schema' ? '数据库结构' : '查询历史',
      subtitle: nextMode === 'schema' ? '搜索表与字段，插入光标处' : '找回并复用最近执行的 SQL',
      headerIcon: nextMode === 'schema' ? 'ri:database-2-line' : 'ri:history-line'
    })
    if (!alive || currentSession !== session || owner !== props.owner) return
    if (target && nextMode === 'schema') {
      if (target.schema && hasTable(target.schema, target.name))
        await locateTable(target.schema, target.name)
      else {
        schemaFilter.value = ''
        keyword.value = target.name
      }
    }
  }
  const insertIdentifier = (...parts: string[]) => {
    pendingAction = {
      mode: 'insert',
      sql: parts.map((part) => quoteSqlIdentifier(part, props.dialect)).join('.'),
      owner: props.owner,
      session
    }
    drawerRef.value?.handleClose()
  }
  const restore = (sql: string, schema?: string) => {
    pendingAction = { mode: 'restore', sql, schema, owner: props.owner, session }
    drawerRef.value?.handleClose()
  }
  const applyPendingAction = () => {
    const action = pendingAction
    pendingAction = null
    let historyMatches = true
    if (action?.history) {
      const expected = action.history
      historyMatches =
        !props.historyActionsDisabledReason &&
        (action.mode !== 'open-query' || !props.historyNewTabDisabledReason) &&
        filteredHistory.value.some(
          (entry) =>
            entry === expected.entry &&
            entry.id === expected.id &&
            entry.sql === action.sql &&
            (entry.schema ?? '') === action.schema
        )
    }
    historyPreview.value = null
    if (
      !action ||
      !alive ||
      action.owner !== props.owner ||
      action.session !== session ||
      !historyMatches
    )
      return
    if (action.mode === 'insert') emit('insert', action.sql, action.owner)
    else if (action.mode === 'restore') {
      if (action.history) emit('restore-history', action.sql, action.schema, action.owner)
      else emit('restore', action.sql, action.schema, action.owner)
    } else emit('open-query', action.sql, action.schema, action.owner)
  }
  const reset = () => {
    session++
    pendingAction = null
    historyPreview.value = null
    detailGeneration++
    tableLoading.clear()
    tableErrors.clear()
    metadataSearch.reset()
    keyword.value = ''
    expanded.value = ''
    locatedTable.value = null
    drawerRef.value?.handleClose()
  }
  watch(() => props.owner, reset, { flush: 'sync' })
  watch(
    [() => props.historyActionsDisabledReason, () => props.historyNewTabDisabledReason],
    ([common, newTab]) => {
      if (pendingAction?.history && (common || (pendingAction.mode === 'open-query' && newTab)))
        pendingAction = null
    },
    { flush: 'sync' }
  )
  onBeforeUnmount(() => {
    alive = false
    session++
    pendingAction = null
    historyPreview.value = null
  })
  defineExpose({ open, reset })
</script>

<style scoped lang="scss">
  .sql-column-button {
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 8px;
    text-align: left;
    cursor: pointer;
    border-radius: var(--el-border-radius-base);

    &:hover {
      background: var(--el-fill-color-light);
    }

    &:focus-visible {
      outline: 2px solid var(--theme-color);
      outline-offset: 2px;
    }
  }

  .sql-column-row + .sql-column-row {
    border-top: 1px solid var(--el-border-color-extra-light);
  }

  .sql-column-description {
    display: block;
    margin-top: 3px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--el-text-color-secondary);
    overflow-wrap: anywhere;
  }

  .sql-column-key {
    flex-shrink: 0;
    padding: 1px 5px;
    font-size: 10px;
    font-weight: 600;
    line-height: 1.4;
    color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
    border-radius: var(--el-border-radius-small);
  }

  .sql-detail-section {
    min-width: 0;
    padding-top: 12px;
    margin-top: 14px;
    border-top: 1px solid var(--el-border-color-extra-light);

    &__heading {
      margin-bottom: 8px;
      font-size: 12px;
      font-weight: 600;
      color: var(--el-text-color-primary);
    }
  }

  .sql-relation-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    align-items: center;
    justify-content: space-between;
    min-width: 0;
    padding: 6px 0;
    overflow-wrap: anywhere;
  }

  .sql-index-row {
    min-width: 0;
    border-radius: var(--el-border-radius-base);

    &__summary {
      display: flex;
      gap: 8px;
      align-items: center;
      min-height: 32px;
      padding: 4px 8px;
      font-size: 12px;
      cursor: pointer;

      &:hover {
        background: var(--el-fill-color-light);
      }

      &:focus-visible {
        outline: 2px solid var(--theme-color);
        outline-offset: 2px;
      }
    }

    &__definition {
      display: block;
      margin-top: 4px;
      overflow-wrap: anywhere;
      white-space: pre-wrap;
    }
  }

  .sql-template-actions :deep(.el-button + .el-button) {
    margin-left: 0;
  }

  .sql-history-button {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
    padding: 14px;
    text-align: left;
    cursor: pointer;
    background: var(--el-fill-color-extra-light);
    border: 1px solid var(--el-border-color-lighter);
    border-radius: var(--el-border-radius-base);

    &:hover {
      background: var(--el-fill-color-light);
      border-color: var(--el-color-primary-light-5);
    }

    &:focus-visible {
      outline: 2px solid var(--theme-color);
      outline-offset: 2px;
    }

    &__sql {
      display: -webkit-box;
      overflow: hidden;
      -webkit-line-clamp: 3;
      font-size: 12px;
      line-height: 1.7;
      overflow-wrap: anywhere;
      white-space: pre-wrap;
      -webkit-box-orient: vertical;
    }
  }

  .sql-object-list {
    min-width: 0;
    border-top: 0;

    :deep(.el-collapse-item__header) {
      height: auto;
      min-height: 60px;
      line-height: 1.4;
    }

    :deep(.el-collapse-item__title) {
      min-width: 0;
    }

    :deep(.el-collapse-item__arrow) {
      flex-shrink: 0;
      margin-left: 12px;
    }

    :deep(.el-collapse-item__content) {
      padding: 8px 0 12px 26px;
    }
  }

  .sql-table-title {
    display: flex;
    gap: var(--art-control-icon-gap);
    align-items: center;
    width: 100%;
    min-width: 0;
    padding-block: 10px;

    &__icon {
      flex-shrink: 0;
      width: 16px;
      height: 16px;
      color: var(--el-color-primary);
    }

    &__identity {
      flex: 1;
      min-width: 0;
    }

    &__name {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      font-family: var(--el-font-family);
      font-size: 13px;
      white-space: nowrap;
    }

    &__schema {
      display: block;
      margin-top: 3px;
      font-size: 11px;
      color: var(--el-text-color-secondary);
    }

    &__count {
      flex-shrink: 0;
      font-size: 12px;
      font-weight: 400;
      color: var(--el-text-color-secondary);
      white-space: nowrap;
    }
  }

  .sql-schema-pagination {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
</style>
