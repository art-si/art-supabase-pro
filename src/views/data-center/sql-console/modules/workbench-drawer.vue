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
          <span>{{ filteredTables.length }} 张表 · 点击字段可插入编辑器</span>
          <ElButton link type="primary" :loading="loading" @click="emit('refresh')"
            >刷新结构</ElButton
          >
        </div>
        <ArtAsyncState
          :loading="loading"
          :error="error"
          :empty="!filteredTables.length"
          empty-text="没有匹配的表"
          empty-description="尝试其他表名或字段名，或刷新数据库结构"
          size="compact"
          @retry="emit('refresh')"
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
                          :class="matchesColumn(column) ? 'font-medium text-primary' : undefined"
                          >{{ column.name }}</span
                        >
                        <span v-if="column.isPrimaryKey" class="sql-column-key">PK</span>
                        <span v-if="columnHasForeignKey(table, column.name)" class="sql-column-key"
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
                      >定位关联表 {{ relation.targetSchema }}.{{ relation.targetTable }}</ElButton
                    >
                    <span v-else class="text-xs text-g-600">目标表不在当前结构中</span>
                  </div>
                </div>
                <div v-if="table.indexes?.length" class="sql-detail-section">
                  <div class="sql-detail-section__heading">索引 · {{ table.indexes.length }}</div>
                  <details v-for="index in table.indexes" :key="index.name" class="sql-index-row">
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
              </ElCollapseItem>
            </ElCollapse>
          </div>
        </ArtAsyncState>
      </template>
      <template v-else>
        <p class="m-0 text-xs leading-5 text-g-600"
          >最近 30 次执行，仅保存在此浏览器，按账号和租户隔离。点击载入
          SQL，不会自动执行；可用撤销恢复原稿。</p
        >
        <ArtEmptyState
          v-if="!filteredHistory.length"
          title="暂无查询历史"
          description="执行 SQL 后，可在这里找到并复用"
          size="compact"
        />
        <button
          v-for="entry in filteredHistory"
          :key="entry.id"
          type="button"
          class="sql-history-button"
          @click="restore(entry.sql, entry.schema ?? '')"
        >
          <span class="flex items-center justify-between gap-3 text-xs">
            <span :class="entry.status === 'ok' ? 'text-success' : 'text-danger'">{{
              entry.status === 'ok' ? '执行成功' : '执行失败'
            }}</span>
            <span class="text-g-600">{{ formatDateTimeValue(entry.executedAt) }}</span>
          </span>
          <span v-if="entry.schema" class="text-xs text-primary">schema · {{ entry.schema }}</span>
          <code class="sql-history-button__sql">{{ entry.sql }}</code>
          <span class="flex gap-3 text-xs text-g-600"
            ><span v-if="entry.durationMs !== undefined">{{ entry.durationMs }} ms</span
            ><span v-if="entry.rowCount !== undefined">{{ entry.rowCount }} 行</span
            ><span class="ml-auto text-primary">载入编辑器 →</span></span
          >
        </button>
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
  import { computed, nextTick, ref, watch } from 'vue'
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

  const props = defineProps<{
    metadata: Api.DataCenter.SqlConsole.DatabaseMetadata | null
    loading: boolean
    error: string | null
    history: SqlHistoryEntry[]
    dialect?: 'postgres' | 'mysql' | 'dm'
  }>()
  const emit = defineEmits<{
    insert: [sql: string]
    restore: [sql: string, schema?: string]
    refresh: []
  }>()
  const drawerRef = ref<ArtDrawerExpose>()
  const tableListRef = ref<HTMLElement>()
  const mode = ref<'schema' | 'history'>('schema')
  const keyword = ref('')
  const normalizedKeyword = computed(() => keyword.value.trim().toLowerCase())
  const schemaTableCounts = computed(() => countBy(props.metadata?.tables || [], 'tableSchema'))
  const matchesColumn = (column: { name: string; description?: string | null }): boolean =>
    Boolean(
      normalizedKeyword.value &&
      `${column.name} ${column.description || ''}`.toLowerCase().includes(normalizedKeyword.value)
    )
  const getColumnMatchLabel = (table: Api.DataCenter.SqlConsole.TableMetadata): string => {
    const count = table.columns.filter(matchesColumn).length
    return count ? `${count} 列匹配` : `${table.columns.length} 列`
  }
  const schemaFilter = ref('public')
  const expanded = ref('')
  const page = ref(1)
  const locatedTable = ref<{ schema: string; name: string } | null>(null)
  let pendingAction: { mode: 'insert' | 'restore'; sql: string; schema?: string } | null = null
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
    schemaFilter.value = schema
    keyword.value = ''
    await nextTick()
    const index = filteredTables.value.findIndex(
      (table) => table.tableSchema === schema && table.tableName === name
    )
    if (index < 0) return
    page.value = Math.floor(index / 30) + 1
    await nextTick()
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
    return (props.metadata?.tables || []).filter(
      (table) =>
        (!schemaFilter.value || table.tableSchema === schemaFilter.value) &&
        (!search ||
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
  watch([keyword, schemaFilter], () => {
    page.value = 1
    expanded.value = ''
    locatedTable.value = null
  })
  watch(
    () => props.metadata,
    async (metadata) => {
      if (metadata && schemaFilter.value && !metadata.schemas.includes(schemaFilter.value))
        schemaFilter.value = metadata.schemas.includes('public') ? 'public' : ''
      const target = locatedTable.value
      if (metadata && target) {
        if (
          metadata.tables.some(
            (table) => table.tableSchema === target.schema && table.tableName === target.name
          )
        ) {
          await locateTable(target.schema, target.name)
        } else {
          locatedTable.value = null
        }
      }
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
    pendingAction = null
    locatedTable.value = null
    mode.value = nextMode
    keyword.value = ''
    page.value = 1
    await drawerRef.value?.handleOpen(undefined, {
      title: nextMode === 'schema' ? '数据库结构' : '查询历史',
      subtitle: nextMode === 'schema' ? '搜索表与字段，插入光标处' : '找回并复用最近执行的 SQL',
      headerIcon: nextMode === 'schema' ? 'ri:database-2-line' : 'ri:history-line'
    })
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
      sql: parts.map((part) => quoteSqlIdentifier(part, props.dialect)).join('.')
    }
    drawerRef.value?.handleClose()
  }
  const restore = (sql: string, schema?: string) => {
    pendingAction = { mode: 'restore', sql, schema }
    drawerRef.value?.handleClose()
  }
  const applyPendingAction = () => {
    if (pendingAction?.mode === 'insert') emit('insert', pendingAction.sql)
    if (pendingAction?.mode === 'restore') emit('restore', pendingAction.sql, pendingAction.schema)
    pendingAction = null
  }
  const reset = () => {
    pendingAction = null
    drawerRef.value?.handleClose()
  }
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
