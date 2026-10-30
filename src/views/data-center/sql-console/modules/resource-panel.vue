<template>
  <aside class="sql-resource-panel flex h-full min-h-0 flex-col" aria-label="数据库资源">
    <div class="flex shrink-0 items-center justify-between gap-2 px-3 py-3">
      <span class="art-icon-label text-sm font-medium"
        ><ArtSvgIcon icon="ri:database-2-line" />数据库资源</span
      >
      <ArtIconButton
        size="small"
        icon="ri:side-bar-line"
        label="收起数据库资源"
        @click="emit('collapse')"
      />
    </div>
    <div class="shrink-0 px-3 pb-3">
      <ElInput
        v-model="keyword"
        clearable
        placeholder="搜索表、字段、函数或注释"
        aria-label="搜索数据库资源"
        ><template #prefix><ArtSvgIcon icon="ri:search-line" /></template
      ></ElInput>
    </div>
    <div class="sql-resource-panel__sections">
      <section
        v-if="pins.length"
        class="sql-resource-panel__group"
        :class="{ 'is-open': activeGroup === 'pins' }"
      >
        <button
          type="button"
          class="sql-resource-panel__heading"
          :id="`${panelId}-pins-heading`"
          :aria-controls="`${panelId}-pins-body`"
          :aria-expanded="activeGroup === 'pins'"
          aria-label="常用对象"
          @click="toggleGroup('pins')"
          ><span class="art-icon-label"><ArtSvgIcon icon="ri:star-line" />常用对象</span
          ><ArtSvgIcon icon="ri:arrow-right-s-line" class="sql-resource-panel__chevron"
        /></button>
        <div
          v-show="activeGroup === 'pins'"
          :id="`${panelId}-pins-body`"
          role="region"
          :aria-labelledby="`${panelId}-pins-heading`"
          class="sql-resource-panel__body"
        >
          <ElScrollbar class="h-full">
            <div
              v-for="pin in pins"
              :key="`${pin.schema}.${pin.name}`"
              class="flex min-w-0 items-center gap-1 px-3 py-1"
            >
              <button
                type="button"
                class="min-w-0 flex-1 truncate text-left text-xs"
                :title="`${pin.schema}.${pin.name}`"
                @click="emit('table', pin.schema, pin.name)"
                >{{ pin.schema }}.{{ pin.name }}</button
              >
              <ArtIconButton
                size="small"
                icon="ri:star-fill"
                :label="`取消收藏对象 ${pin.name}`"
                @click="emit('pin', pin)"
              />
            </div> </ElScrollbar
        ></div>
      </section>
      <section class="sql-resource-panel__group" :class="{ 'is-open': activeGroup === 'objects' }">
        <button
          type="button"
          class="sql-resource-panel__heading"
          :id="`${panelId}-objects-heading`"
          :aria-controls="`${panelId}-objects-body`"
          :aria-expanded="activeGroup === 'objects'"
          aria-label="数据库对象"
          @click="toggleGroup('objects')"
          ><span class="art-icon-label"><ArtSvgIcon icon="ri:database-line" />数据库对象</span
          ><ArtSvgIcon icon="ri:arrow-right-s-line" class="sql-resource-panel__chevron"
        /></button>
        <div
          v-show="activeGroup === 'objects'"
          :id="`${panelId}-objects-body`"
          role="region"
          :aria-labelledby="`${panelId}-objects-heading`"
          class="sql-resource-panel__body"
        >
          <div class="flex items-center justify-between gap-2 px-3 pb-2">
            <ElCheckbox v-model="showSystem" size="small">系统 schema</ElCheckbox>
            <div class="flex items-center gap-1"
              ><ArtIconButton
                size="small"
                icon="ri:collapse-diagonal-line"
                label="收起全部对象"
                @click="collapseAll" /><ArtIconButton
                size="small"
                icon="ri:refresh-line"
                label="刷新数据库资源"
                :loading="loading"
                @click="refresh"
            /></div>
          </div>
          <ArtAsyncState
            class="sql-resource-panel__objects-state"
            :loading="loading"
            :error="error"
            :empty="!metadata"
            :min-height="0"
            empty-text="等待加载数据库结构"
            empty-description="可刷新结构，或在连接管理中重新连接执行端"
            size="compact"
            @retry="refresh"
          >
            <ElScrollbar v-if="keyword.trim()" class="min-h-0 flex-1"
              ><div class="flex flex-col gap-1 px-2 pb-2">
                <p class="m-0 px-1 text-xs leading-5 text-g-600"
                  >已加载对象中的匹配 · {{ matches.length + functionMatches.length }} 项</p
                >
                <div
                  v-for="node in searchNodes"
                  :key="node.key"
                  class="sql-resource-panel__match-row"
                  @contextmenu.prevent.stop="contextMenu($event, node)"
                  @keydown="nodeKeydown($event, node)"
                >
                  <button
                    type="button"
                    class="sql-resource-panel__match min-w-0 flex-1"
                    :aria-label="
                      node.kind === 'table'
                        ? `查看对象 ${node.schema}.${node.name}`
                        : `插入函数 ${node.schema}.${node.name}`
                    "
                    :title="`${node.schema}.${node.name}`"
                    @click="
                      node.kind === 'table' ? emit('table', node.schema, node.name!) : insert(node)
                    "
                  >
                    <span class="art-icon-label min-w-0 text-xs"
                      ><ArtSvgIcon :icon="node.icon" /><span class="truncate">{{
                        node.label
                      }}</span></span
                    >
                    <span class="w-full truncate text-xs text-g-600"
                      >{{ node.schema }} · {{ node.description }}</span
                    >
                    <span
                      v-if="node.table && matchedColumns(node.table)"
                      class="w-full truncate text-xs text-primary"
                      >{{ matchedColumns(node.table) }}</span
                    >
                  </button>
                  <div class="flex shrink-0 items-center gap-1 pr-1">
                    <ArtIconButton
                      v-if="node.kind === 'table'"
                      size="small"
                      :icon="isPinned(node) ? 'ri:star-fill' : 'ri:star-line'"
                      :label="`${isPinned(node) ? '取消收藏' : '收藏'}对象 ${node.name}`"
                      @click="emit('pin', { schema: node.schema, name: node.name! })"
                    />
                    <ArtIconButton
                      v-if="node.kind === 'table'"
                      size="small"
                      icon="ri:file-add-line"
                      :label="`新页签查询 ${node.name}`"
                      @click="openTableQuery(node)"
                    />
                    <ArtIconButton
                      v-else
                      size="small"
                      icon="ri:corner-down-left-line"
                      :label="`插入 ${node.label}`"
                      @click="insert(node)"
                    />
                    <ArtIconButton
                      size="small"
                      icon="ri:more-2-fill"
                      :label="`更多操作 ${node.label}`"
                      @click="contextMenu($event, node)"
                    />
                  </div>
                </div>
                <p
                  v-if="matches.length + functionMatches.length > 100"
                  class="m-0 px-1 text-xs text-g-600"
                  >仅展示前 100 项，继续输入名称可缩小范围。</p
                >
                <ArtEmptyState
                  v-if="!matches.length && !functionMatches.length"
                  title="没有匹配的已加载对象"
                  description="展开 schema 加载更多对象后再搜索"
                  size="compact"
                /> </div
            ></ElScrollbar>
            <div v-else class="sql-resource-panel__tree-viewport">
              <ElAutoResizer
                ><template #default="{ height }">
                  <ElTreeV2
                    :data="resourceNodes"
                    :height="Math.max(1, height)"
                    :item-size="TREE_ROW_HEIGHT"
                    :default-expanded-keys="expandedKeys"
                    :current-node-key="currentKey"
                    :props="{ label: 'label', value: 'key', children: 'children' }"
                    :indent="14"
                    highlight-current
                    :expand-on-click-node="true"
                    @node-expand="loadResourceNode"
                    @node-collapse="collapseNode"
                    @current-change="selectNode"
                  >
                    <template #default="{ data }">
                      <div
                        class="sql-resource-panel__node"
                        :title="[data.label, data.description].filter(Boolean).join('\n')"
                        @keydown="nodeKeydown($event, data)"
                        @contextmenu.prevent.stop="contextMenu($event, data)"
                      >
                        <span
                          v-if="data.kind === 'detail' && !data.retryParent"
                          class="text-xs text-g-600"
                          role="status"
                          >{{ data.label }}</span
                        >
                        <button
                          v-else
                          type="button"
                          class="sql-resource-panel__label art-icon-label min-w-0 flex-1 text-left"
                          :aria-label="`定位对象 ${data.label}`"
                          @click="retryNode($event, data)"
                          @dblclick.stop="activate(data)"
                          @keydown.enter.prevent.stop="activate(data)"
                        >
                          <ArtSvgIcon :icon="data.icon" class="shrink-0 text-g-600" /><span
                            class="truncate"
                            >{{ data.label }}</span
                          >
                        </button>
                        <span
                          v-if="loadingKeys.has(data.key)"
                          class="inline-flex shrink-0"
                          role="status"
                          :aria-label="`正在加载 ${data.label}`"
                        >
                          <ArtSvgIcon
                            icon="ri:refresh-line"
                            class="sql-resource-panel__loading text-primary"
                            aria-hidden="true"
                          />
                        </span>
                        <ArtIconButton
                          v-if="data.kind === 'table'"
                          size="small"
                          :icon="isPinned(data) ? 'ri:star-fill' : 'ri:star-line'"
                          :label="`${isPinned(data) ? '取消收藏' : '收藏'}对象 ${data.name}`"
                          @click.stop="emit('pin', { schema: data.schema, name: data.name })"
                        />
                        <ArtIconButton
                          v-if="data.kind === 'table'"
                          size="small"
                          icon="ri:information-line"
                          :label="`查看 ${data.label} 结构`"
                          @click.stop="emit('table', data.schema, data.name)"
                        />
                        <ArtIconButton
                          v-if="data.kind === 'column' || data.kind === 'function'"
                          size="small"
                          icon="ri:corner-down-left-line"
                          :label="`插入 ${data.label}`"
                          @click.stop="insert(data)"
                        />
                        <ArtIconButton
                          v-if="data.kind === 'index'"
                          size="small"
                          icon="ri:code-s-slash-line"
                          :label="`查看索引 ${data.label}`"
                          @click.stop="showIndex(data)"
                        />
                        <ArtIconButton
                          v-if="data.kind === 'foreign'"
                          size="small"
                          icon="ri:external-link-line"
                          :label="`定位关联表 ${data.target?.name}`"
                          @click.stop="emit('table', data.target.schema, data.target.name)"
                        />
                        <ArtIconButton
                          v-if="hasMenu(data)"
                          size="small"
                          icon="ri:more-2-fill"
                          :label="`更多操作 ${data.label}`"
                          @click.stop="contextMenu($event, data)"
                        />
                      </div>
                    </template>
                  </ElTreeV2> </template
              ></ElAutoResizer>
            </div>
            <p class="sql-resource-panel__hint m-0 shrink-0 px-3 py-2 text-xs leading-5 text-g-600"
              >展开加载对象 · 双击插入名称 · 右键更多操作</p
            >
          </ArtAsyncState>
        </div>
      </section>
      <section class="sql-resource-panel__group" :class="{ 'is-open': activeGroup === 'queries' }">
        <button
          type="button"
          class="sql-resource-panel__heading"
          :id="`${panelId}-queries-heading`"
          :aria-controls="`${panelId}-queries-body`"
          :aria-expanded="activeGroup === 'queries'"
          aria-label="SQL 收藏"
          @click="toggleGroup('queries')"
          ><span class="art-icon-label"><ArtSvgIcon icon="ri:bookmark-line" />SQL 收藏</span
          ><span class="art-icon-label text-xs text-g-600"
            >{{ queries.length
            }}<ArtSvgIcon icon="ri:arrow-right-s-line" class="sql-resource-panel__chevron" /></span
        ></button>
        <div
          v-show="activeGroup === 'queries'"
          :id="`${panelId}-queries-body`"
          role="region"
          :aria-labelledby="`${panelId}-queries-heading`"
          class="sql-resource-panel__body"
        >
          <ElScrollbar class="h-full">
            <div class="px-3 pb-2">
              <ElPopover v-model:visible="queryPopoverOpen" trigger="click" :width="280"
                ><template #reference
                  ><ElButton size="small" :disabled="!hasSql">收藏当前脚本</ElButton></template
                >
                <ArtForm
                  v-model="savedName"
                  :items="[{ key: 'name', label: '收藏名称', span: 24, props: { maxlength: 80 } }]"
                  :show-submit="false"
                  :show-reset="false"
                />
                <ElButton
                  size="small"
                  type="primary"
                  :disabled="!savedName.name.trim()"
                  @click="saveNamedQuery"
                  >保存收藏</ElButton
                >
              </ElPopover>
            </div>
            <div
              v-for="query in queries"
              :key="query.id"
              class="flex min-w-0 items-center gap-1 px-3 py-1"
            >
              <button
                type="button"
                class="min-w-0 flex-1 truncate text-left text-xs"
                :title="query.sql"
                @click="emit('restore', query.sql, query.schema ?? '')"
                >{{ query.name }}</button
              >
              <ArtIconButton
                size="small"
                icon="ri:file-add-line"
                :label="`新页签打开 ${query.name}`"
                @click="emit('open-query', query.sql, query.schema ?? '')"
              />
              <ArtIconButton
                size="small"
                icon="ri:bookmark-fill"
                :label="`取消收藏脚本 ${query.name}`"
                @click="emit('unstar-query', query.id)"
              />
            </div> </ElScrollbar
        ></div>
      </section>
      <section
        class="sql-resource-panel__group"
        :class="{ 'is-open': activeGroup === 'statements' }"
      >
        <button
          type="button"
          class="sql-resource-panel__heading"
          :id="`${panelId}-statements-heading`"
          :aria-controls="`${panelId}-statements-body`"
          :aria-expanded="activeGroup === 'statements'"
          aria-label="语句导航"
          @click="toggleGroup('statements')"
          ><span class="art-icon-label"><ArtSvgIcon icon="ri:list-check" />语句导航</span
          ><span class="art-icon-label text-xs text-g-600"
            >{{ statements.length
            }}<ArtSvgIcon icon="ri:arrow-right-s-line" class="sql-resource-panel__chevron" /></span
        ></button>
        <div
          v-show="activeGroup === 'statements'"
          :id="`${panelId}-statements-body`"
          role="region"
          :aria-labelledby="`${panelId}-statements-heading`"
          class="sql-resource-panel__body"
        >
          <div class="min-h-0 flex-1"
            ><StatementNavigator
              :show-heading="false"
              :statements="statements"
              :active-offset="activeOffset"
              @locate="emit('locate', $event)"
          /></div>
        </div>
      </section>
    </div>
    <ArtMenuRight
      ref="menuRef"
      :menu-items="menuItems"
      :menu-width="236"
      scrollable
      @select="selectMenu"
    />
    <ArtDrawer ref="indexDrawerRef" :size="620" :show-confirm-button="false" cancel-text="关闭"
      ><PlanCodePreview title="索引信息" :language="indexLanguage" :code="indexDefinition" expanded
    /></ArtDrawer>
  </aside>
</template>
<script setup lang="ts">
  import { computed, ref, watch, shallowRef, reactive, onBeforeUnmount, useId } from 'vue'
  import { ElMessage, ElTreeV2 } from 'element-plus'
  import { ElAutoResizer } from 'element-plus/es/components/table-v2/index.mjs'
  import { toObjectRecord } from '@/utils/record'
  import ArtMenuRight, {
    type MenuItemType
  } from '@/components/core/others/art-menu-right/index.vue'
  import StatementNavigator from './statement-navigator.vue'
  import {
    buildSqlTableTemplates,
    quoteSqlIdentifier,
    type SqlStatementRef,
    type SqlTableRef,
    type SqlColumnRef,
    type SqlForeignKeyRef
  } from '@/utils/sql-workbench'
  import { isHiddenSqlSchema } from '@/utils/sql-connections'
  import { copyTextToClipboard } from '@/utils/file/clipboard'
  import type { SqlDialect } from '@/types/sql-connections'
  import type { SqlObjectLocation, SavedSqlQuery } from './use-sql-tools'
  import ArtForm from '@/components/core/forms/art-form/index.vue'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import PlanCodePreview from './plan-code-preview.vue'
  import {
    buildColumnQuery,
    buildForeignKeyQueries,
    buildStructureMarkdown,
    buildTableNullQuery,
    isSqlNumericColumn,
    supportsSqlDistribution,
    type ColumnQueryKind
  } from './resource-sql'

  interface ResourceNode {
    key: string
    kind:
      | 'schema'
      | 'tables'
      | 'views'
      | 'functions'
      | 'table'
      | 'columns'
      | 'indexes'
      | 'foreignKeys'
      | 'column'
      | 'function'
      | 'detail'
      | 'index'
      | 'foreign'
    label: string
    schema: string
    name?: string
    icon: string
    leaf?: boolean
    table?: SqlTableRef
    description?: string
    target?: SqlObjectLocation
    indexLanguage?: 'sql' | 'json'
    column?: SqlColumnRef
    foreignKey?: SqlForeignKeyRef
    children?: ResourceNode[]
    retryParent?: ResourceNode
  }
  const props = defineProps<{
    metadata: Api.DataCenter.SqlConsole.DatabaseMetadata | null
    loading: boolean
    error: string | null
    statements: SqlStatementRef[]
    activeOffset: number
    dialect: SqlDialect
    ensureSchema: (schema: string) => Promise<void>
    statementPreference: boolean | null
    pins: SqlObjectLocation[]
    queries: SavedSqlQuery[]
    hasSql: boolean
    querySchema?: string
  }>()
  const emit = defineEmits<{
    collapse: []
    refresh: []
    insert: [value: string]
    restore: [value: string, schema?: string]
    table: [schema: string, name: string]
    locate: [value: SqlStatementRef]
    'statement-preference': [value: boolean]
    pin: [value: SqlObjectLocation]
    'save-query': [name: string]
    'unstar-query': [id: string]
    'open-query': [sql: string, schema?: string]
    'query-schema': [schema: string]
  }>()
  const keyword = ref('')
  const savedName = ref({ name: '' })
  const queryPopoverOpen = ref(false)
  const saveNamedQuery = () => {
    const name = savedName.value.name.trim()
    if (!name) return
    emit('save-query', name)
    savedName.value.name = ''
    queryPopoverOpen.value = false
  }
  const indexDrawerRef = ref<ArtDrawerExpose>()
  const indexDefinition = ref('')
  const indexLanguage = ref<'sql' | 'json'>('sql')
  const showIndex = (data: ResourceNode) => {
    indexDefinition.value = data.description || '索引定义暂不可用，请刷新结构后重试'
    indexLanguage.value = data.indexLanguage || 'sql'
    void indexDrawerRef.value?.handleOpen(undefined, {
      title: data.label,
      subtitle: '只读索引信息',
      headerIcon: 'ri:key-2-line'
    })
  }
  const isPinned = (data: ResourceNode) =>
    props.pins.some((pin) => pin.schema === data.schema && pin.name === data.name)
  const matchedColumns = (table: SqlTableRef) =>
    table.columns
      .filter((column) =>
        `${column.name} ${column.description || ''}`
          .toLowerCase()
          .includes(keyword.value.trim().toLowerCase())
      )
      .slice(0, 3)
      .map((column) => column.name)
      .join(' · ')
  const showSystem = ref(false)
  const treeChildren = shallowRef(new Map<string, ResourceNode[]>())
  const loadingKeys = reactive(new Set<string>())
  const expandedKeys = ref<string[]>([])
  const currentKey = ref<string>()
  let treeRevision = 0
  let disposed = false
  onBeforeUnmount(() => {
    disposed = true
    treeRevision++
  })
  type ResourceGroup = 'pins' | 'objects' | 'queries' | 'statements'
  const panelId = useId()
  const statementOpen = computed(() => props.statementPreference ?? props.statements.length > 1)
  const activeGroup = ref<ResourceGroup | null>(statementOpen.value ? 'statements' : 'objects')
  let groupTouched = false
  const toggleGroup = (group: ResourceGroup) => {
    groupTouched = true
    const wasStatements = activeGroup.value === 'statements'
    activeGroup.value = activeGroup.value === group ? null : group
    if (group === 'statements' || wasStatements)
      emit('statement-preference', activeGroup.value === 'statements')
  }
  watch(statementOpen, (open) => {
    if (!groupTouched) activeGroup.value = open ? 'statements' : 'objects'
  })
  watch(keyword, (value) => {
    if (value.trim()) {
      groupTouched = true
      activeGroup.value = 'objects'
    }
  })
  watch(
    () => props.pins.length,
    (count) => {
      if (!count && activeGroup.value === 'pins') activeGroup.value = 'objects'
    }
  )
  const menuRef = ref<InstanceType<typeof ArtMenuRight>>()
  const selected = ref<ResourceNode>()
  const menuItems = computed<MenuItemType[]>(() => {
    const data = selected.value
    if (!data) return []
    const items: MenuItemType[] = []
    if (data.kind === 'schema' && props.dialect === 'dm')
      items.push({
        key: 'query-schema',
        label: props.querySchema === data.schema ? '当前查询 schema' : '设为查询 schema',
        icon: 'ri:check-line',
        disabled: props.querySchema === data.schema,
        showLine: true
      })
    if (data.table)
      items.push({
        key: 'structure',
        label: data.kind === 'table' ? '查看对象结构' : '查看所属表结构',
        icon: 'ri:information-line'
      })
    if (data.kind === 'table' && data.table) {
      items.push({
        key: 'new-select',
        label: '新页签查询前 100 行',
        icon: 'ri:file-add-line',
        showLine: true
      })
      items.push(
        ...buildSqlTableTemplates(data.table, props.dialect).map((template) => ({
          key: template.kind,
          label:
            template.kind === 'select'
              ? '生成查询 SQL'
              : template.kind === 'count'
                ? '生成行数统计'
                : template.label,
          icon: 'ri:code-s-slash-line'
        }))
      )
      items.push({ key: 'nulls', label: '生成字段空值统计', icon: 'ri:bar-chart-line' })
      if (tableForeignKeys(data).length)
        items.push({ key: 'joins', label: '生成外键关联查询', icon: 'ri:links-line' })
      items[items.length - 1].showLine = true
      items.push(
        { key: 'copy-columns', label: '复制字段列表', icon: 'ri:list-check' },
        { key: 'copy-markdown', label: '复制结构 Markdown', icon: 'ri:markdown-line' },
        { key: 'copy-json', label: '复制结构 JSON', icon: 'ri:braces-line', showLine: true },
        {
          key: 'pin',
          label: isPinned(data) ? '取消收藏对象' : '收藏对象',
          icon: isPinned(data) ? 'ri:star-fill' : 'ri:star-line'
        }
      )
    }
    if (data.column) {
      items.push(
        { key: 'select-column', label: '新页签查询此字段', icon: 'ri:file-add-line' },
        { key: 'column-nulls', label: '生成字段空值统计', icon: 'ri:bar-chart-line' }
      )
      if (supportsSqlDistribution(data.column))
        items.push(
          { key: 'column-distinct', label: '生成去重值查询', icon: 'ri:filter-line' },
          { key: 'column-frequency', label: '生成值分布统计', icon: 'ri:bar-chart-horizontal-line' }
        )
      if (isSqlNumericColumn(data.column))
        items.push({ key: 'column-range', label: '生成数值范围统计', icon: 'ri:calculator-line' })
      items[items.length - 1].showLine = true
    }
    if (data.kind === 'index')
      items.push(
        { key: 'index', label: '查看索引信息', icon: 'ri:key-2-line' },
        { key: 'copy-definition', label: '复制索引信息', icon: 'ri:file-copy-line', showLine: true }
      )
    if (data.kind === 'foreign')
      items.push(
        { key: 'related', label: '查看关联表结构', icon: 'ri:external-link-line' },
        { key: 'joins', label: '生成外键关联查询', icon: 'ri:links-line', showLine: true }
      )
    if (['schema', 'table', 'column', 'function'].includes(data.kind))
      items.push(
        { key: 'copy', label: '复制完整名称', icon: 'ri:file-copy-line' },
        { key: 'copy-short', label: '复制对象名称', icon: 'ri:clipboard-line' },
        { key: 'insert', label: '插入完整引用', icon: 'ri:corner-down-left-line' },
        { key: 'insert-short', label: '插入对象名称', icon: 'ri:input-method-line' }
      )
    if (data.kind === 'schema')
      items.push({ key: 'refresh', label: '刷新数据库结构', icon: 'ri:refresh-line' })
    return items
  })
  const tableForeignKeys = (data: ResourceNode) =>
    (props.metadata?.foreignKeys || []).filter(
      (key) => key.sourceSchema === data.schema && key.sourceTable === data.table?.tableName
    )
  const matches = computed(() => {
    const query = keyword.value.trim().toLowerCase()
    return (props.metadata?.tables || []).filter(
      (table) =>
        (showSystem.value || !isHiddenSqlSchema(table.tableSchema)) &&
        [
          table.tableSchema,
          table.tableName,
          table.description,
          ...table.columns.flatMap((column) => [column.name, column.description])
        ].some((value) => value?.toLowerCase().includes(query))
    )
  })
  const functionMatches = computed(() => {
    const query = keyword.value.trim().toLowerCase()
    return (props.metadata?.functions || []).filter(
      (fn) =>
        (showSystem.value || !isHiddenSqlSchema(fn.routineSchema)) &&
        `${fn.routineSchema} ${fn.routineName} ${fn.returnType}`.toLowerCase().includes(query)
    )
  })
  const make = (
    kind: ResourceNode['kind'],
    label: string,
    parent: ResourceNode | undefined,
    icon: string,
    fields: Partial<ResourceNode> = {}
  ): ResourceNode => ({
    key: `${parent?.key || ''}/${kind}:${label}`,
    kind,
    label,
    schema: parent?.schema || label,
    table: parent?.table,
    name: parent?.name,
    icon,
    ...fields
  })
  const searchNodes = computed<ResourceNode[]>(() => [
    ...matches.value.slice(0, 100).map((table) =>
      make(
        'table',
        table.tableName,
        undefined,
        table.kind && table.kind !== 'table' ? 'ri:eye-line' : 'ri:table-line',
        {
          key: `search-table:${table.tableSchema}.${table.tableName}`,
          schema: table.tableSchema,
          name: table.tableName,
          table,
          description: table.description || `${table.columns.length} 个字段`
        }
      )
    ),
    ...functionMatches.value.slice(0, Math.max(0, 100 - matches.value.length)).map((fn) =>
      make('function', fn.routineName, undefined, 'ri:function-line', {
        key: `search-function:${fn.routineSchema}.${fn.routineName}`,
        schema: fn.routineSchema,
        name: fn.routineName,
        description: fn.returnType,
        leaf: true
      })
    )
  ])
  const openTableQuery = (node: ResourceNode) => {
    if (!node.table) return
    const sql = buildSqlTableTemplates(node.table, props.dialect).find(
      (item) => item.kind === 'select'
    )?.sql
    if (sql) emit('open-query', sql)
  }
  const loadChildren = async (data: ResourceNode): Promise<ResourceNode[]> => {
    if (data.kind === 'schema') {
      await props.ensureSchema(data.schema)
      return [
        make('tables', '表', data, 'ri:table-line'),
        make('views', '视图', data, 'ri:eye-line'),
        make('functions', '函数', data, 'ri:function-line')
      ]
    }
    if (data.kind === 'tables' || data.kind === 'views') {
      return (props.metadata?.tables || [])
        .filter(
          (table) =>
            table.tableSchema === data.schema &&
            (data.kind === 'tables'
              ? !table.kind || table.kind === 'table'
              : table.kind === 'view' || table.kind === 'materialized_view')
        )
        .map((table) =>
          make(
            'table',
            table.tableName,
            data,
            data.kind === 'views' ? 'ri:eye-line' : 'ri:table-line',
            { name: table.tableName, table, description: table.description || undefined }
          )
        )
    }
    if (data.kind === 'functions') {
      return (props.metadata?.functions || [])
        .filter((fn) => fn.routineSchema === data.schema)
        .map((fn) =>
          make('function', fn.routineName, data, 'ri:function-line', {
            name: fn.routineName,
            leaf: true,
            description: fn.returnType
          })
        )
    }
    if (data.kind === 'table') {
      return [
        make('columns', `字段 · ${data.table?.columns.length || 0}`, data, 'ri:list-check'),
        make('indexes', '索引', data, 'ri:key-2-line'),
        make('foreignKeys', '外键', data, 'ri:links-line')
      ]
    }
    if (data.kind === 'columns') {
      return (data.table?.columns || []).map((column) =>
        make(
          'column',
          `${column.name} · ${column.dataType}`,
          data,
          column.isPrimaryKey ? 'ri:key-2-line' : 'ri:code-s-slash-line',
          {
            name: column.name,
            leaf: true,
            description: column.description || undefined,
            column
          }
        )
      )
    }
    if (data.kind === 'indexes') {
      return (data.table?.indexes || []).map((index) =>
        make('index', index.name, data, 'ri:key-2-line', {
          leaf: true,
          description: index.definition || JSON.stringify(index, null, 2),
          indexLanguage: index.definition ? 'sql' : 'json'
        })
      )
    }
    if (data.kind === 'foreignKeys') {
      return (props.metadata?.foreignKeys || [])
        .filter((key) => key.sourceSchema === data.schema && key.sourceTable === data.name)
        .map((key) =>
          make(
            'foreign',
            `${key.sourceColumn} → ${key.targetSchema}.${key.targetTable}.${key.targetColumn}`,
            data,
            'ri:links-line',
            {
              leaf: true,
              target: { schema: key.targetSchema, name: key.targetTable },
              foreignKey: key
            }
          )
        )
    }
    return []
  }
  const attachChildren = (data: ResourceNode): ResourceNode =>
    data.leaf
      ? data
      : {
          ...data,
          children: (
            treeChildren.value.get(data.key) || [
              make('detail', '正在加载对象…', data, 'ri:database-line', { leaf: true })
            ]
          ).map(attachChildren)
        }
  const resourceNodes = computed(() =>
    (props.metadata?.schemas || [])
      .filter((schema) => showSystem.value || !isHiddenSqlSchema(schema))
      .map((schema) => attachChildren(make('schema', schema, undefined, 'ri:database-line')))
  )
  const TREE_ROW_HEIGHT = 32
  // Element Plus erases custom node fields. Every value entering this adapter is made by make().
  const resourceData = (value: unknown): ResourceNode | undefined => {
    const data = toObjectRecord(value)
    return typeof data.key === 'string' && typeof data.kind === 'string'
      ? (value as ResourceNode)
      : undefined
  }
  const loadResourceNode = async (value: unknown) => {
    const data = resourceData(value)
    if (!data || data.leaf) return
    groupTouched = true
    if (!expandedKeys.value.includes(data.key))
      expandedKeys.value = [...expandedKeys.value, data.key]
    if (treeChildren.value.has(data.key) || loadingKeys.has(data.key)) return
    const revision = treeRevision
    loadingKeys.add(data.key)
    try {
      const children = await loadChildren(data)
      if (!disposed && revision === treeRevision)
        treeChildren.value = new Map(treeChildren.value).set(data.key, children)
    } catch {
      if (!disposed && revision === treeRevision) {
        treeChildren.value = new Map(treeChildren.value).set(data.key, [
          make('detail', `加载失败，重试 ${data.label}`, data, 'ri:refresh-line', {
            leaf: true,
            retryParent: data
          })
        ])
        ElMessage.warning('对象加载失败，可点击节点重试')
      }
    } finally {
      if (!disposed && revision === treeRevision) loadingKeys.delete(data.key)
    }
  }
  const selectNode = (value: unknown) => {
    currentKey.value = resourceData(value)?.key
  }
  const collapseNode = (value: unknown) => {
    const data = resourceData(value)
    if (data)
      expandedKeys.value = expandedKeys.value.filter(
        (key) => key !== data.key && !key.startsWith(`${data.key}/`)
      )
  }
  const collapseAll = () => {
    expandedKeys.value = []
    currentKey.value = undefined
  }
  const resetTree = () => {
    treeRevision++
    collapseAll()
    treeChildren.value = new Map()
    loadingKeys.clear()
  }
  const retryResource = (data: ResourceNode) => {
    const children = new Map(treeChildren.value)
    children.delete(data.key)
    treeChildren.value = children
    void loadResourceNode(data)
  }
  const retryNode = (event: MouseEvent, data: ResourceNode) => {
    if (!data.retryParent) return
    event.stopPropagation()
    retryResource(data.retryParent)
  }
  const fullName = (data: ResourceNode) =>
    [
      data.schema,
      ...(data.kind === 'column' && data.table ? [data.table.tableName] : []),
      ...(data.name ? [data.name] : [])
    ]
      .map((value) => quoteSqlIdentifier(value, props.dialect))
      .join('.')
  const insert = (data: ResourceNode) => {
    if (['schema', 'table', 'column', 'function'].includes(data.kind))
      emit('insert', fullName(data))
  }
  const activate = (data: ResourceNode) => {
    if (data.retryParent) {
      retryResource(data.retryParent)
      return
    }
    if (data.kind === 'schema' && props.dialect === 'dm') emit('query-schema', data.schema)
    else insert(data)
  }
  const contextMenu = (event: Event, data: ResourceNode) => {
    if (!(event instanceof MouseEvent)) return
    if (!hasMenu(data)) return
    event.preventDefault()
    selected.value = data
    currentKey.value = data.key
    const bounds =
      event.currentTarget instanceof HTMLElement
        ? event.currentTarget.getBoundingClientRect()
        : undefined
    menuRef.value?.show(
      event.type === 'click' && event.detail === 0 && bounds
        ? new MouseEvent('contextmenu', { clientX: bounds.left, clientY: bounds.bottom })
        : event
    )
  }
  const hasMenu = (data: ResourceNode) =>
    ['schema', 'table', 'column', 'function', 'index', 'foreign'].includes(data.kind)
  const nodeKeydown = (event: KeyboardEvent, data: ResourceNode) => {
    if (!hasMenu(data) || !(event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)))
      return
    event.preventDefault()
    event.stopPropagation()
    if (!(event.currentTarget instanceof HTMLElement)) return
    const bounds = event.currentTarget.getBoundingClientRect()
    contextMenu(
      new MouseEvent('contextmenu', { clientX: bounds.left, clientY: bounds.bottom }),
      data
    )
  }
  const selectMenu = async (item: MenuItemType) => {
    const data = selected.value
    if (!data) return
    if (item.key === 'query-schema') {
      emit('query-schema', data.schema)
      return
    }
    if (item.key.startsWith('copy')) {
      let value = fullName(data)
      if (item.key === 'copy-short') value = data.name || data.schema
      else if (item.key === 'copy-columns' && data.table)
        value = data.table.columns
          .map((column) => quoteSqlIdentifier(column.name, props.dialect))
          .join(',\n')
      else if (item.key === 'copy-markdown' && data.table)
        value = buildStructureMarkdown(data.table)
      else if (item.key === 'copy-json' && data.table) value = JSON.stringify(data.table, null, 2)
      else if (item.key === 'copy-definition') value = data.description || ''
      try {
        await copyTextToClipboard(value)
        ElMessage.success('已复制到剪贴板')
      } catch {
        ElMessage.warning('复制失败，请重试')
      }
    } else if (item.key === 'insert') insert(data)
    else if (item.key === 'insert-short')
      emit('insert', quoteSqlIdentifier(data.name || data.schema, props.dialect))
    else if (item.key === 'structure' && data.table)
      emit('table', data.table.tableSchema, data.table.tableName)
    else if (item.key === 'pin' && data.name) emit('pin', { schema: data.schema, name: data.name })
    else if (item.key === 'refresh') refresh()
    else if (item.key === 'index') showIndex(data)
    else if (item.key === 'related' && data.target)
      emit('table', data.target.schema, data.target.name)
    else if (item.key === 'joins') {
      const keys = tableForeignKeys(data).filter(
        (key) => !data.foreignKey || key.constraintName === data.foreignKey.constraintName
      )
      const sql = buildForeignKeyQueries(keys, props.dialect)
      if (sql) emit('open-query', sql)
    } else if (data.table) {
      const columnKinds: ColumnQueryKind[] = [
        'select-column',
        'column-nulls',
        'column-distinct',
        'column-frequency',
        'column-range'
      ]
      const columnKind = columnKinds.find((kind) => kind === item.key)
      if (columnKind && data.column) {
        const sql = buildColumnQuery(data.table, data.column, columnKind, props.dialect)
        if (sql) emit('open-query', sql)
        return
      }
      if (item.key === 'nulls') {
        emit('open-query', buildTableNullQuery(data.table, props.dialect))
        return
      }
      const sql = buildSqlTableTemplates(data.table, props.dialect).find(
        (template) => template.kind === (item.key === 'new-select' ? 'select' : item.key)
      )?.sql
      if (sql) {
        if (item.key === 'new-select') emit('open-query', sql)
        else emit('restore', sql)
      }
    }
  }
  const refresh = () => {
    resetTree()
    emit('refresh')
  }
  watch(
    () => JSON.stringify(props.metadata?.schemas || []),
    () => {
      resetTree()
    }
  )
</script>
<style scoped lang="scss">
  .sql-resource-panel {
    background: var(--el-fill-color-extra-light);

    &__sections,
    &__body,
    &__objects-state,
    &__tree-viewport {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
    }

    &__objects-state {
      overflow: hidden;
    }

    &__loading {
      animation: art-button-action-spin var(--art-motion-duration-spin, 800ms) linear infinite;
    }

    @media (prefers-reduced-motion: reduce) {
      &__loading {
        animation: none;
      }
    }

    &__group {
      display: flex;
      flex: 0 0 auto;
      flex-direction: column;
      min-height: 0;
      border-top: 1px solid var(--el-border-color-lighter);

      &.is-open {
        flex: 1;
      }

      > .sql-resource-panel__heading {
        display: flex;
        flex-shrink: 0;
        gap: 8px;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        min-height: 42px;
        padding: 8px 12px;
        font-size: 12px;
        font-weight: 500;
        text-align: left;
        cursor: pointer;

        &:focus-visible {
          outline: 2px solid var(--el-color-primary);
          outline-offset: -2px;
        }
      }

      &.is-open > .sql-resource-panel__heading .sql-resource-panel__chevron {
        transform: rotate(90deg);
      }
    }

    @media (height <= 640px) {
      &__group > .sql-resource-panel__heading {
        min-height: 34px;
        padding-block: 4px;
      }

      &__hint {
        display: none;
      }
    }

    &__node {
      display: flex;
      gap: 4px;
      align-items: center;
      width: 100%;
      min-width: 0;
      font-size: 12px;

      > .sql-resource-panel__label {
        justify-content: flex-start;
        height: 30px;
      }
    }

    &__match {
      display: flex;
      flex-direction: column;
      gap: 4px;
      align-items: flex-start;
      padding: 10px;
      text-align: left;
      border-radius: var(--el-border-radius-base);

      &:hover {
        background: var(--el-fill-color-light);
      }

      &:focus-visible {
        outline: 2px solid var(--el-color-primary);
      }
    }

    &__match-row {
      display: flex;
      align-items: center;
      min-width: 0;
      border-radius: var(--el-border-radius-base);

      &:hover,
      &:focus-within {
        background: var(--el-fill-color-light);
      }
    }

    :deep(.el-tree) {
      background: transparent;

      --el-tree-node-content-height: 32px;

      .el-tree-node__content {
        padding-right: 8px;
      }
    }
  }
</style>
