<template>
  <div
    class="column-config-page business-workspace-page art-full-height"
    :class="{ 'is-focused': focusMode }"
  >
    <BusinessWorkspaceHeader
      v-show="!focusMode"
      class="column-config-page__heading"
      density="compact"
      title="列配置"
      eyebrow=""
      icon="ri:table-view"
      description="选择功能菜单，配置列的来源、显示与排列。每张表独立生效。"
    >
      <template #actions>
        <ElButton
          v-if="canManage"
          v-auth="'System:ColumnConfig:Sync'"
          :loading="page.syncing"
          :disabled="busy"
          @click="syncCatalog"
        >
          <span class="art-icon-label"><ArtSvgIcon icon="ri:database-2-line" />同步目录</span>
        </ElButton>
        <BusinessWorkspaceFocusToggle v-model="focusMode" />
      </template>
    </BusinessWorkspaceHeader>

    <ArtWorkspaceSplitter
      :breakpoint="900"
      narrow-mode="hide"
      class="column-config-page__workspace"
    >
      <template #primary>
        <BusinessMenuFilter
          v-if="!isNarrow"
          v-bind="menuFilterProps"
          @select="selectMenu"
          @refresh="loadPage"
        />
      </template>

      <ArtSectionCard
        class="column-config-page__workbench"
        preserve-content-structure
        :loading="page.loading || page.profileLoading"
        :error="page.error || page.profileError"
        :empty="!selectedCatalog && catalogRows.length === 0"
        empty-title="此菜单暂无可配置主列表"
        empty-description="选择其他功能菜单，或同步最新前端列目录后重试。"
        @retry="loadPage"
      >
        <template #header>
          <header class="column-config-page__head">
            <div class="min-w-0">
              <strong class="block truncate text-base font-semibold text-g-900">{{
                selectedCatalog ? selectedMenuLabel : '主列表目录'
              }}</strong>
              <span
                class="mt-1 block truncate text-xs text-g-700"
                :title="selectedCatalog?.routePath"
                >{{ selectedCatalog?.routePath || '从左侧选择菜单，开始维护对应的表格列。' }}</span
              >
            </div>
            <div class="flex shrink-0 items-center gap-3">
              <ElButton v-if="isNarrow" @click="openMenuDrawer">选择菜单</ElButton>
              <ElSegmented
                v-if="selectedCatalog"
                v-model="editorMode"
                :options="editorModeOptions"
                size="small"
                aria-label="列配置视图"
              />
              <BusinessWorkspaceFocusToggle v-show="focusMode" v-model="focusMode" />
            </div>
          </header>
        </template>

        <div v-if="selectedCatalog" class="column-config-page__body">
          <div class="column-config-page__scope">
            <label class="column-config-page__field">
              <span>配置范围</span>
              <ElSelect
                :model-value="selection.scope"
                :disabled="busy"
                aria-label="配置层级"
                @change="changeScope"
              >
                <ElOption label="平台默认" value="platform" /><ElOption
                  label="租户"
                  value="tenant"
                />
                <ElOption label="角色" value="role" /><ElOption label="用户" value="user" />
              </ElSelect>
            </label>
            <label v-if="selection.scope !== 'platform'" class="column-config-page__field">
              <span>所属租户</span>
              <ElSelect
                :model-value="selection.tenantId"
                filterable
                :disabled="busy"
                aria-label="所属租户"
                placeholder="选择租户"
                @change="changeTenant"
              >
                <ElOption
                  v-for="tenant in tenantScope.tenantOptions"
                  :key="tenant.id"
                  :label="tenant.tenantName"
                  :value="tenant.id"
                />
              </ElSelect>
            </label>
            <label
              v-if="selection.scope === 'role' || selection.scope === 'user'"
              class="column-config-page__field"
            >
              <span>{{ selection.scope === 'role' ? '目标角色' : '目标用户' }}</span>
              <ArtUserSelect
                v-if="selection.scope === 'user'"
                :model-value="selection.subjectId || undefined"
                :options="page.subjects"
                :loading="page.subjectLoading"
                :disabled="busy || !selection.tenantId"
                aria-label="目标用户"
                @update:model-value="changeSubject"
              />
              <ElSelect
                v-else
                :model-value="selection.subjectId"
                filterable
                :loading="page.subjectLoading"
                :disabled="busy || !selection.tenantId"
                aria-label="目标角色"
                placeholder="选择角色"
                @change="changeSubject"
              >
                <ElOption
                  v-for="subject in page.subjects"
                  :key="subject.value"
                  :label="subject.label"
                  :value="subject.value"
                />
              </ElSelect>
            </label>
            <label
              v-if="selection.scope === 'role'"
              class="column-config-page__field column-config-page__field--priority"
            >
              <span>优先级</span>
              <ElInputNumber
                v-model="draft.priority"
                :min="0"
                :max="999"
                :disabled="!canManage || busy"
                aria-label="角色优先级"
                controls-position="right"
              />
            </label>
            <span
              class="column-config-page__scope-hint"
              title="用户覆盖角色，角色覆盖租户，租户覆盖平台默认；同层角色按优先级合并。"
              >平台 → 租户 → 角色 → 用户</span
            >
          </div>

          <div class="column-config-page__modebar">
            <div class="flex min-w-0 flex-wrap items-center gap-3">
              <span class="text-xs font-medium text-g-900">当前表格</span>
              <ElSwitch
                v-model="draft.source"
                active-value="configured"
                inactive-value="frontend"
                active-text="读取配置"
                inactive-text="前端定义"
                :disabled="!canManage || busy || !scopeReady"
                aria-label="当前表格读取配置"
              />
            </div>
            <div class="flex min-w-0 flex-wrap items-center justify-end gap-3">
              <ElInput
                v-if="editorMode === 'columns'"
                v-model="columnSearch"
                clearable
                class="w-64! max-w-full"
                placeholder="搜索列标题或字段"
                aria-label="搜索当前表格列"
              />
              <span class="text-xs text-g-700">{{
                draft.source === 'configured'
                  ? '全部 ' + draft.columns.length + ' 列读取配置'
                  : '全部列使用前端定义'
              }}</span>
            </div>
          </div>

          <div v-if="draft.source === 'configured'" class="px-4 pt-2 text-xs text-g-700">
            拖动手柄调整顺序。列过滤作用于当前页；排序默认作用于当前页，已有服务端排序沿用原有规则。
          </div>
          <p
            v-if="inheritancePending"
            class="px-4 pt-2 text-xs text-[var(--el-color-warning)]"
            role="alert"
            >用户角色继承资料不完整，请更新列配置服务后重新加载。</p
          >
          <ArtAsyncState
            class="column-config-page__editing"
            :empty="!scopeReady"
            empty-text="请选择完整的配置范围"
            empty-description="选择所属租户及角色或用户后，即可维护对应列方案。"
          >
            <div class="column-config-page__table">
              <ArtTable
                v-if="editorMode === 'columns'"
                :data="editingRows"
                :columns="editorColumns"
                :show-table-header="false"
                height="100%"
                row-key="key"
                :fit="false"
                scrollbar-always-on
                @row-drag-end="handleColumnDragEnd"
                empty-text="没有匹配的列"
                empty-description="请调整或清空列搜索条件。"
              />
              <ArtTable
                v-else
                :data="[]"
                :columns="previewColumns"
                :show-table-header="false"
                height="100%"
                empty-text="草稿表头预览"
                empty-description="仅预览列布局，不加载业务数据；实际字段权限以业务列表为准。"
              />
            </div>
          </ArtAsyncState>

          <ArtStickyActionBar v-if="scopeReady" embedded class="column-config-page__footer">
            <template #summary>
              <div
                class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-g-700"
                role="status"
              >
                <span :class="{ 'text-[var(--el-color-warning)]': dirty }">{{
                  dirty
                    ? '有未保存修改'
                    : currentProfile
                      ? '已保存 · 版本 ' + currentProfile.revision
                      : draft.source === 'configured'
                        ? '继承上级配置'
                        : '当前使用前端定义'
                }}</span>
                <span>{{ draft.columns.length }} 列</span>
                <span class="hidden xl:inline">此开关只影响当前菜单对应的表格</span>
              </div>
            </template>
            <ElButton :disabled="!canManage || busy" @click="restoreDefaults">恢复默认</ElButton>
            <ElButton :disabled="!dirty || busy" @click="resetDraft">撤销修改</ElButton>
            <ElButton
              v-if="canManage"
              v-auth="'System:ColumnConfig:Manage'"
              type="primary"
              :loading="page.saving"
              :disabled="!dirty || busy || inheritancePending"
              @click="saveProfile"
              >保存列方案</ElButton
            >
          </ArtStickyActionBar>
        </div>

        <div v-else class="column-config-page__directory">
          <ArtTable
            :data="catalogRows"
            :columns="catalogColumns"
            :show-table-header="false"
            height="100%"
          />
        </div>
      </ArtSectionCard>
    </ArtWorkspaceSplitter>
    <ArtDrawer ref="menuDrawerRef">
      <BusinessMenuFilter v-bind="menuFilterProps" @select="selectDrawerMenu" @refresh="loadPage" />
    </ArtDrawer>
  </div>
</template>

<script setup lang="tsx">
  import { useAssistantPage } from '@/hooks/core/useAssistantPage'
  import { computed, onMounted, reactive, ref } from 'vue'
  import { useMediaQuery } from '@vueuse/core'
  import { onBeforeRouteLeave } from 'vue-router'
  import { cloneDeep, isEqual } from 'lodash-es'
  import { normalizeNullableNumber } from '@/utils/form/normalize'
  import {
    ElButton,
    ElInput,
    ElInputNumber,
    ElMessage,
    ElOption,
    ElSegmented,
    ElSelect,
    ElSwitch
  } from 'element-plus'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import BusinessMenuFilter from '@/components/business/business-menu-filter/index.vue'
  import BusinessWorkspaceFocusToggle from '@/components/business/business-workspace-focus-toggle/index.vue'
  import { useWorkspaceFocus } from '@/hooks/core/useWorkspaceFocus'
  import type { BusinessMenuFilterLabels } from '@/components/business/business-menu-filter/types'
  import ArtWorkspaceSplitter from '@/components/core/layouts/art-workspace-splitter/index.vue'
  import ArtStickyActionBar from '@/components/core/layouts/art-sticky-action-bar/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import { TABLE_COLUMN_FILTER_OPTIONS } from '@/utils/table/column-filters'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import ArtUserSelect from '@/components/core/forms/art-user-select/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import type { ColumnOption } from '@/types/component'
  import type { AppRouteRecord } from '@/types/router'
  import type {
    TableColumnCatalog,
    TableColumnProfile,
    TableColumnScope,
    TableColumnSetting,
    TableColumnSource,
    TableColumnSubject
  } from '@/types/table-column-config'
  import {
    fetchTableColumnAdmin,
    fetchTableColumnProfiles,
    fetchTableColumnSubjects,
    saveTableColumnProfile,
    syncTableColumnCatalog
  } from '@/api/table-column-config'
  import { useUserStore } from '@/store/modules/user'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useArtFeedback, notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { invalidateTableColumnConfig } from '@/hooks/core/useConfiguredTableColumns'
  import {
    resolveColumnProfiles,
    hasVisibleBusinessColumn,
    visibleColumnSettings
  } from '@/utils/table/column-profile'
  import { resolveMenuLabel } from '@/utils/navigation/menu'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import TreeUtils from '@/utils/tree'

  defineOptions({ name: 'ColumnConfig' })
  const user = useUserStore()
  const tenantScope = useTenantScopeStore()
  const { hasAuth } = useAuth()
  const { confirmAction } = useArtFeedback()
  const { focusMode } = useWorkspaceFocus()
  const isNarrow = useMediaQuery('(max-width: 900px)')
  const menuDrawerRef = ref<ArtDrawerExpose>()
  const canManage = computed(() => user.isPlatformSuper && hasAuth('System:ColumnConfig:Manage'))
  const page = reactive({
    loading: false,
    saving: false,
    syncing: false,
    profileLoading: false,
    subjectLoading: false,
    error: '',
    profileError: '',
    catalogs: [] as TableColumnCatalog[],
    profiles: [] as TableColumnProfile[],
    menus: [] as AppRouteRecord[],
    subjects: [] as TableColumnSubject[]
  })
  const selection = reactive<{
    menuId: string
    scope: TableColumnScope
    tenantId: string
    subjectId: string
  }>({ menuId: '', scope: 'platform', tenantId: '', subjectId: '' })
  const draft = reactive<{
    source: TableColumnSource
    columns: TableColumnSetting[]
    priority: number
  }>({ source: 'inherit', columns: [], priority: 0 })
  const savedDraft = ref(cloneDeep(draft))
  const columnSearch = ref('')
  const dirty = computed(() => !isEqual(draft, savedDraft.value))
  const busy = computed(() => page.loading || page.saving || page.syncing || page.profileLoading)
  const tree = new TreeUtils({
    idKey: 'id',
    parentKey: 'parentId',
    childrenKey: 'children',
    deepClone: false
  })
  const menuTree = computed(() =>
    tree.listToTree(
      page.menus.filter((menu) => menu.type !== 'button'),
      (a, b) => (a.sort ?? 0) - (b.sort ?? 0)
    )
  )
  const selectedCatalog = computed(() =>
    page.catalogs.find((catalog) => catalog.menuId === selection.menuId)
  )
  const editorBaseRows = computed(() =>
    draft.source === 'configured' ? draft.columns : (selectedCatalog.value?.columns ?? [])
  )
  const editingRows = computed(() => {
    const query = columnSearch.value.trim().toLocaleLowerCase()
    return query
      ? editorBaseRows.value.filter((column) =>
          `${column.label} ${column.key}`.toLocaleLowerCase().includes(query)
        )
      : editorBaseRows.value
  })
  const selectedMenuLabel = computed(() => {
    const menu = page.menus.find((m) => m.id === selection.menuId)
    return menu ? resolveMenuLabel(menu) : '列方案'
  })
  useAssistantPage(() => ({
    label: selectedMenuLabel.value,
    description: '以下为列配置的存储表。所选业务的数据来源需打开对应业务页面查看。',
    routePath: selectedCatalog.value?.routePath,
    dataSources: ['sys_menu', 'sys_table_column_catalog', 'sys_table_column_profile'],
    filters: { 列标题: columnSearch.value },
    filterFields: ['列标题'],
    applyFilters: async (filters) => {
      columnSearch.value = filters['列标题'] ?? ''
    }
  }))
  const scopeReady = computed(
    () =>
      selection.scope === 'platform' ||
      Boolean(selection.tenantId && (selection.scope === 'tenant' || selection.subjectId))
  )
  const currentProfile = computed(() =>
    page.profiles.find(
      (profile) =>
        profile.scope === selection.scope &&
        profile.tenantId === (selection.scope === 'platform' ? null : selection.tenantId) &&
        profile.subjectId ===
          (selection.scope === 'user' || selection.scope === 'role' ? selection.subjectId : null)
    )
  )
  const editorMode = ref<'columns' | 'preview'>('columns')
  const selectedUserRoles = computed(() =>
    selection.scope === 'user'
      ? page.subjects.find((subject) => subject.value === selection.subjectId)?.roleIds
      : undefined
  )
  const inheritancePending = computed(
    () =>
      selection.scope === 'user' &&
      scopeReady.value &&
      selectedUserRoles.value === undefined &&
      page.profiles.some(
        (profile) => profile.scope === 'role' && profile.tenantId === selection.tenantId
      )
  )
  const editorModeOptions = [
    { label: '列设置', value: 'columns' },
    { label: '表头预览', value: 'preview' }
  ]
  const totalColumnCount = computed(() =>
    page.catalogs.reduce((sum, catalog) => sum + catalog.columns.length, 0)
  )
  const previewColumns = computed<ColumnOption[]>(() => {
    const source =
      draft.source === 'configured' ? draft.columns : (selectedCatalog.value?.columns ?? [])
    type PreviewNode = TableColumnSetting & { children?: PreviewNode[] }
    const previewTree = new TreeUtils({
      idKey: 'key',
      parentKey: 'parentKey',
      childrenKey: 'children',
      deepClone: false
    })
    const nodes = previewTree.listToTree<PreviewNode>(
      visibleColumnSettings(source, selectedCatalog.value?.columns ?? []).map((column) => ({
        ...column
      }))
    )
    const convert = (items: PreviewNode[]): ColumnOption[] =>
      items.map((column) => ({
        prop: column.key,
        label: column.label,
        width: column.width,
        minWidth: column.minWidth ?? 140,
        fixed: column.fixed,
        sortable: false,
        ...(column.children?.length ? { children: convert(column.children) } : {})
      }))
    return convert(nodes)
  })
  function descendantIds(id: string): Set<string> {
    return new Set(
      tree
        .getDescendants<AppRouteRecord>(menuTree.value, id, true)
        .flatMap((menu) => (menu.id ? [menu.id] : []))
    )
  }
  function menuCount(menu: AppRouteRecord): number {
    const ids = descendantIds(menu.id ?? '')
    return page.catalogs.filter((catalog) => ids.has(catalog.menuId)).length
  }
  function directCount(menu: AppRouteRecord): number {
    return page.catalogs.some((catalog) => catalog.menuId === menu.id) ? 1 : 0
  }
  function menuSearchTerms(menu: AppRouteRecord): string[] {
    return [
      menu.path,
      ...page.catalogs
        .filter((catalog) => catalog.menuId === menu.id)
        .flatMap((catalog) => catalog.columns.map((column) => column.label))
    ]
  }
  const catalogRows = computed(() => {
    const ids = selection.menuId ? descendantIds(selection.menuId) : null
    return page.catalogs
      .filter((catalog) => !ids || ids.has(catalog.menuId))
      .map((catalog) => ({
        ...catalog,
        title: resolveMenuLabel(
          page.menus.find((menu) => menu.id === catalog.menuId) ?? { name: catalog.routePath }
        )
      }))
  })
  const catalogColumns: ColumnOption<(typeof catalogRows.value)[number]>[] = [
    {
      prop: 'title',
      label: '功能菜单',
      minWidth: 170,
      formatter: (row) => (
        <ElButton link type="primary" onClick={() => selectMenu(row.menuId)}>
          {row.title}
        </ElButton>
      )
    },
    { prop: 'routePath', label: '菜单路径', minWidth: 250 },
    { prop: 'columnCount', label: '列数', width: 80, formatter: (row) => row.columns.length }
  ]
  const editorColumns = computed<ColumnOption<TableColumnSetting>[]>(() => [
    {
      prop: 'order',
      label: '顺序',
      width: 164,
      fixed: 'left',
      draggable: true,
      dragDisabled: () => !columnWritable() || Boolean(columnSearch.value.trim()),
      formatter: (row) => {
        const index = editorBaseRows.value.indexOf(row)
        return (
          <BusinessTableRowActions>
            <ArtButtonTable
              icon="ri:arrow-up-line"
              label={`上移${row.label}`}
              permission="System:ColumnConfig:Manage"
              disabled={!columnWritable() || index === 0}
              onClick={() => moveColumn(index, -1)}
            />
            <span class="w-5 text-center text-xs tabular-nums">{index + 1}</span>
            <ArtButtonTable
              icon="ri:arrow-down-line"
              label={`下移${row.label}`}
              permission="System:ColumnConfig:Manage"
              disabled={!columnWritable() || index === draft.columns.length - 1}
              onClick={() => moveColumn(index, 1)}
            />
          </BusinessTableRowActions>
        )
      }
    },
    {
      prop: 'visible',
      label: '显示',
      width: 72,
      formatter: (row) =>
        columnWritable() && !row.locked ? (
          <ElSwitch v-model={row.visible} aria-label={`${row.label}显示`} />
        ) : (
          <span class="text-xs text-g-700">{effectiveColumn(row).visible ? '显示' : '隐藏'}</span>
        )
    },
    {
      prop: 'label',
      label: '列标题',
      width: 240,
      fixed: 'left',
      formatter: (row) => (
        <div class="flex min-w-0 flex-col items-stretch gap-1">
          {columnWritable() && !row.locked ? (
            <ElInput v-model={row.label} maxlength={100} aria-label={`${row.key}列标题`} />
          ) : (
            <span class="font-medium text-g-900">{effectiveColumn(row).label}</span>
          )}
          <small class="block truncate text-g-700" title={row.key}>
            {row.key}
          </small>
        </div>
      )
    },
    {
      prop: 'width',
      label: '列宽',
      width: 144,
      formatter: (row) =>
        columnWritable() ? (
          <ElInputNumber
            {...{
              modelValue: row.width,
              'onUpdate:modelValue': (value: unknown) => updateColumnSize(row, 'width', value)
            }}
            min={24}
            max={1200}
            controlsPosition="right"
            class="w-full!"
            placeholder="自适应"
            aria-label={`${row.label}列宽`}
          />
        ) : (
          <span class="text-xs text-g-700">
            {effectiveColumn(row).width ? effectiveColumn(row).width + ' px' : '自适应'}
          </span>
        )
    },
    {
      prop: 'minWidth',
      label: '最小列宽',
      width: 144,
      formatter: (row) =>
        columnWritable() ? (
          <ElInputNumber
            {...{
              modelValue: row.minWidth,
              'onUpdate:modelValue': (value: unknown) => updateColumnSize(row, 'minWidth', value)
            }}
            min={24}
            max={1200}
            controlsPosition="right"
            class="w-full!"
            placeholder="不限"
            aria-label={`${row.label}最小列宽`}
          />
        ) : (
          <span class="text-xs text-g-700">
            {effectiveColumn(row).minWidth ? effectiveColumn(row).minWidth + ' px' : '—'}
          </span>
        )
    },
    {
      prop: 'fixed',
      label: '固定位置',
      width: 144,
      formatter: (row) =>
        columnWritable() && !row.locked ? (
          <ElSelect v-model={row.fixed} class="w-full!" aria-label={`${row.label}固定位置`}>
            <ElOption label="不固定" value={false} />
            <ElOption label="左侧" value="left" />
            <ElOption label="右侧" value="right" />
          </ElSelect>
        ) : (
          <span class="text-xs text-g-700">
            {effectiveColumn(row).fixed === 'left'
              ? '左侧'
              : effectiveColumn(row).fixed === 'right'
                ? '右侧'
                : '不固定'}
          </span>
        )
    },
    {
      prop: 'sortable',
      label: '允许排序',
      width: 96,
      formatter: (row) =>
        columnWritable() && !row.locked && !row.key.startsWith('__') ? (
          <ElSwitch v-model={row.sortable} aria-label={`${row.label}允许排序`} />
        ) : (
          <span class="text-xs text-g-700">{effectiveColumn(row).sortable ? '支持' : '—'}</span>
        )
    },
    {
      prop: 'filterType',
      label: '过滤方式',
      width: 176,
      formatter: (row) =>
        columnWritable() && !row.locked && !row.key.startsWith('__') ? (
          <ElSelect v-model={row.filterType} class="w-full!" aria-label={`${row.label}过滤方式`}>
            {TABLE_COLUMN_FILTER_OPTIONS.map((option) => (
              <ElOption key={option.value} label={option.label} value={option.value} />
            ))}
          </ElSelect>
        ) : (
          <span class="text-xs text-g-700">
            {TABLE_COLUMN_FILTER_OPTIONS.find(
              (option) => option.value === effectiveColumn(row).filterType
            )?.label ?? '不过滤'}
          </span>
        )
    },
    {
      prop: 'align',
      label: '对齐方式',
      width: 144,
      formatter: (row) =>
        columnWritable() ? (
          <ElSelect v-model={row.align} class="w-full!" aria-label={`${row.label}对齐方式`}>
            <ElOption label="左对齐" value="left" />
            <ElOption label="居中" value="center" />
            <ElOption label="右对齐" value="right" />
          </ElSelect>
        ) : (
          <span class="text-xs text-g-700">
            {effectiveColumn(row).align === 'right'
              ? '右对齐'
              : effectiveColumn(row).align === 'center'
                ? '居中'
                : '左对齐'}
          </span>
        )
    },
    {
      prop: 'showOverflowTooltip',
      label: '长文本提示',
      width: 112,
      formatter: (row) =>
        columnWritable() ? (
          <ElSwitch v-model={row.showOverflowTooltip} aria-label={`${row.label}长文本提示`} />
        ) : (
          <span class="text-xs text-g-700">
            {effectiveColumn(row).showOverflowTooltip === false ? '关闭' : '开启'}
          </span>
        )
    }
  ])
  const menuLabels: BusinessMenuFilterLabels = {
    ariaLabel: '列配置菜单导航',
    heading: '功能菜单',
    refresh: '刷新菜单目录',
    search: '搜索菜单或列标题',
    allAriaLabel: '全部主列表',
    all: '全部菜单',
    allDescription: '查看已登记的主列表目录',
    treeHint: '按模块展开选择',
    errorTitle: '菜单目录加载失败',
    emptyTitle: '暂无功能菜单',
    emptyDescription: '请刷新后重试',
    current: '当前菜单',
    unit: '项',
    direct: '主列表'
  }
  let profileRequest = 0,
    subjectRequest = 0
  const menuFilterProps = computed(() => ({
    data: menuTree.value,
    labels: menuLabels,
    summary: page.catalogs.length + ' 个列表 · ' + totalColumnCount.value + ' 列',
    allCount: page.catalogs.length,
    count: menuCount,
    directCount,
    searchTerms: menuSearchTerms,
    selectedMenuId: selection.menuId,
    loading: page.loading,
    error: page.error
  }))
  async function openMenuDrawer(): Promise<void> {
    await menuDrawerRef.value?.handleOpen(undefined, {
      title: '选择功能菜单',
      size: 'sm',
      contentHeight: '70vh',
      showConfirmButton: false,
      showCancelButton: false
    })
  }
  async function selectDrawerMenu(menuId: string): Promise<void> {
    await selectMenu(menuId)
    if (selection.menuId === menuId) await menuDrawerRef.value?.handleClose()
  }
  function effectiveColumn(column: TableColumnSetting): TableColumnSetting {
    return draft.source !== 'configured'
      ? (selectedCatalog.value?.columns.find((item) => item.key === column.key) ?? column)
      : column
  }
  function columnWritable(): boolean {
    return canManage.value && !busy.value && draft.source === 'configured'
  }
  async function allowDiscard(): Promise<boolean> {
    if (!dirty.value) return true
    try {
      await confirmAction('当前列方案有未保存修改，继续后将放弃这些修改。', {
        title: '切换配置',
        confirmButtonText: '放弃修改并继续'
      })
      return true
    } catch {
      return false
    }
  }
  async function selectMenu(menuId: string): Promise<void> {
    if (busy.value || !(await allowDiscard())) return
    selection.menuId = menuId
    page.profiles = []
    resetDraft()
    if (selectedCatalog.value) await loadProfiles()
  }
  async function changeScope(scope: TableColumnScope): Promise<void> {
    if (!(await allowDiscard())) return
    selection.scope = scope
    selection.subjectId = ''
    resetDraft()
    await loadSubjects()
  }
  async function changeTenant(tenantId: string): Promise<void> {
    if (!(await allowDiscard())) return
    selection.tenantId = tenantId
    selection.subjectId = ''
    resetDraft()
    await loadSubjects()
  }
  async function changeSubject(value: unknown): Promise<void> {
    if (!(await allowDiscard())) return
    selection.subjectId = typeof value === 'string' ? value : ''
    resetDraft()
  }
  async function loadSubjects(): Promise<void> {
    const request = ++subjectRequest
    page.subjects = []
    page.subjectLoading = false
    if (!selection.tenantId || (selection.scope !== 'role' && selection.scope !== 'user')) return
    page.subjectLoading = true
    try {
      const rows = await fetchTableColumnSubjects(selection.tenantId, selection.scope)
      if (request === subjectRequest) {
        page.subjects = rows
        if (selection.subjectId) resetDraft()
      }
    } catch (error) {
      notifyFriendlyError(error, '角色或用户加载失败，请重新选择租户重试')
    } finally {
      if (request === subjectRequest) page.subjectLoading = false
    }
  }
  function resetDraft(): void {
    columnSearch.value = ''
    const inherited = resolveColumnProfiles(
      page.profiles.filter(
        (profile) =>
          profile.scope === 'platform' ||
          (profile.scope === 'tenant' && profile.tenantId === selection.tenantId) ||
          (selection.scope === 'user' &&
            profile.scope === 'role' &&
            profile.tenantId === selection.tenantId &&
            Boolean(selectedUserRoles.value?.includes(profile.subjectId ?? '')))
      )
    )
    const defaults = (selectedCatalog.value?.columns ?? []).map((column) => ({
      ...column,
      fixed: column.fixed ?? false,
      align: column.align ?? ('left' as const),
      sortable: column.sortable ?? false,
      showOverflowTooltip: column.showOverflowTooltip ?? true,
      filterType: column.filterType ?? ('none' as const)
    }))
    const savedColumns = currentProfile.value?.columns.length
      ? currentProfile.value.columns
      : inherited.columns
    const defaultMap = new Map(defaults.map((column) => [column.key, column]))
    const savedKeys = new Set(savedColumns.map((column) => column.key))
    const mergedColumns = [
      ...savedColumns
        .filter((column) => defaultMap.has(column.key))
        .map((column) => {
          const base = defaultMap.get(column.key)!
          return {
            ...base,
            ...column,
            width: column.width,
            minWidth: column.minWidth,
            locked: base.locked,
            parentKey: base.parentKey,
            groups: base.groups,
            ...(base.locked
              ? { label: base.label, visible: true, fixed: base.fixed, sortable: base.sortable }
              : {})
          }
        }),
      ...defaults.filter((column) => !savedKeys.has(column.key))
    ]
    Object.assign(draft, {
      source:
        currentProfile.value?.source && currentProfile.value.source !== 'inherit'
          ? currentProfile.value.source
          : inherited.configured
            ? 'configured'
            : 'frontend',
      priority: currentProfile.value?.priority ?? 0,
      columns: cloneDeep(mergedColumns)
    })
    savedDraft.value = cloneDeep(draft)
  }
  function restoreDefaults(): void {
    draft.columns = cloneDeep(
      (selectedCatalog.value?.columns ?? []).map((column) => ({
        ...column,
        fixed: column.fixed ?? false,
        align: column.align ?? ('left' as const),
        sortable: column.sortable ?? false,
        showOverflowTooltip: column.showOverflowTooltip ?? true,
        filterType: column.filterType ?? ('none' as const)
      }))
    )
  }
  function updateColumnSize(
    column: TableColumnSetting,
    key: 'width' | 'minWidth',
    value: unknown
  ): void {
    column[key] = normalizeNullableNumber(value) ?? undefined
    if (column[key] !== undefined) column[key === 'width' ? 'minWidth' : 'width'] = undefined
  }
  function moveColumnTo(from: number, to: number): void {
    if (
      !columnWritable() ||
      from < 0 ||
      to < 0 ||
      from >= draft.columns.length ||
      to >= draft.columns.length ||
      from === to
    )
      return
    const [column] = draft.columns.splice(from, 1)
    draft.columns.splice(to, 0, column)
  }
  function moveColumn(index: number, step: number): void {
    moveColumnTo(index, index + step)
  }
  function handleColumnDragEnd(payload: { oldIndex?: number; newIndex?: number }): void {
    if (columnSearch.value.trim()) return
    if (payload.oldIndex !== undefined && payload.newIndex !== undefined)
      moveColumnTo(payload.oldIndex, payload.newIndex)
  }
  async function loadProfiles(): Promise<void> {
    if (!selectedCatalog.value) return
    const request = ++profileRequest
    page.profileLoading = true
    page.profileError = ''
    try {
      const rows = await fetchTableColumnProfiles(selectedCatalog.value.menuId)
      if (request === profileRequest) {
        page.profiles = rows
        resetDraft()
      }
    } catch (error) {
      if (request === profileRequest)
        page.profileError = getFriendlySupabaseErrorMessage(error, '列方案加载失败，请重试')
    } finally {
      if (request === profileRequest) page.profileLoading = false
    }
  }
  async function loadPage(): Promise<void> {
    if (!(await allowDiscard())) return
    if (!canManage.value) {
      page.error = '当前页面仅平台超级管理员可维护，请使用已授权账号'
      return
    }
    page.loading = true
    page.error = ''
    try {
      await tenantScope.loadTenantOptions()
      const context = await fetchTableColumnAdmin()
      page.catalogs = context.catalogs
      page.menus = context.menus
      selection.tenantId ||= tenantScope.effectiveTenantId ?? user.getUserInfo.tenantId ?? ''
      await loadProfiles()
      await loadSubjects()
    } catch (error) {
      page.error = getFriendlySupabaseErrorMessage(error, '列配置目录加载失败，请重试')
    } finally {
      page.loading = false
    }
  }
  async function saveProfile(): Promise<void> {
    if (!canManage.value || !selectedCatalog.value || !scopeReady.value || busy.value) return
    if (inheritancePending.value) {
      ElMessage.warning('用户角色资料不完整，请更新列配置服务后重新加载')
      return
    }
    if (
      draft.source === 'configured' &&
      !hasVisibleBusinessColumn(draft.columns, selectedCatalog.value.columns)
    ) {
      ElMessage.warning('请至少显示一个业务列；分组列的上级也需保持显示')
      return
    }
    page.saving = true
    try {
      await saveTableColumnProfile({
        menuId: selection.menuId,
        scope: selection.scope,
        tenantId: selection.scope === 'platform' ? null : selection.tenantId,
        subjectId:
          selection.scope === 'role' || selection.scope === 'user' ? selection.subjectId : null,
        source: draft.source,
        columns: draft.columns,
        priority: draft.priority,
        expectedRevision: currentProfile.value?.revision ?? 0
      })
      invalidateTableColumnConfig()
      await loadProfiles()
      ElMessage.success('列方案已保存')
    } catch (error) {
      notifyFriendlyError(error, '保存列方案失败，请核对后重试')
    } finally {
      page.saving = false
    }
  }
  async function syncCatalog(): Promise<void> {
    if (!canManage.value || busy.value || !(await allowDiscard())) return
    page.syncing = true
    try {
      const count = await syncTableColumnCatalog()
      invalidateTableColumnConfig()
      savedDraft.value = cloneDeep(draft)
      await loadPage()
      ElMessage.success(`已同步 ${count} 个主列表，已有方案保留`)
    } catch (error) {
      notifyFriendlyError(error, '列目录同步失败，请重试')
    } finally {
      page.syncing = false
    }
  }
  onBeforeRouteLeave(allowDiscard)
  onMounted(loadPage)
</script>

<style scoped lang="scss">
  .column-config-page {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    height: var(--art-full-height, calc(100dvh - 32px));
    min-height: 0;
    overflow: hidden;

    &__heading {
      flex: none;

      :deep(.business-workspace-header__hero) {
        padding: 12px 16px;
        background: transparent;
      }

      :deep(.business-workspace-header__copy > span) {
        display: none;
      }

      :deep(.business-workspace-header__brand) {
        width: 36px;
        height: 36px;
        color: var(--theme-color);
        background: var(--el-color-primary-light-9);
      }
    }

    &__workspace {
      flex: 1 1 0%;
      height: 0;
      min-height: 0;
    }

    &__workbench {
      display: flex;
      flex-direction: column;
      min-width: 0;
      height: 100%;
      min-height: 0;
      padding: 0;
      overflow: hidden;
    }

    &__head {
      display: flex;
      flex: none;
      gap: 16px;
      align-items: center;
      justify-content: space-between;
      min-height: 70px;
      padding: 12px 16px;
      border-bottom: 1px solid var(--el-border-color-lighter);
    }

    &__body {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-height: 0;
    }

    &__scope {
      display: flex;
      flex: none;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
      padding: 12px 16px;
    }

    &__field {
      display: flex;
      flex: 0 1 220px;
      gap: 8px;
      align-items: center;
      min-width: 0;
      font-size: 12px;
      color: var(--el-text-color-secondary);

      > span {
        flex: none;
      }

      &--priority {
        flex-basis: 165px;
      }
    }

    &__scope-hint {
      margin-left: auto;
      font-size: 12px;
      color: var(--el-text-color-secondary);
    }

    &__modebar {
      display: flex;
      flex: none;
      flex-wrap: wrap;
      gap: 8px 16px;
      align-items: center;
      justify-content: space-between;
      padding: 8px 16px;
      background: var(--el-fill-color-light);
      border-top: 1px solid var(--el-border-color-lighter);
      border-bottom: 1px solid var(--el-border-color-lighter);
    }

    &__editing {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-height: 0;
    }

    &__table {
      flex: 1;
      height: 0;
      min-height: 0;
      padding: 0 16px 12px;
    }

    &__directory {
      flex: 1;
      height: 0;
      min-height: 0;
      padding: 0 16px 12px;
    }

    &__footer {
      flex: none;
    }

    &.is-focused {
      gap: 0;
    }
  }

  @media (width <= 900px) {
    .column-config-page {
      &__scope-hint {
        display: none;
      }

      &__head {
        flex-wrap: wrap;
        gap: 8px;
      }

      &__field {
        flex: 1 1 200px;
      }
    }
  }
</style>
