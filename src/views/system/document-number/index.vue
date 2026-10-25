<template>
  <div class="number-rule-page business-workspace-page art-full-height">
    <MasterDeleteProcessingNotice
      :table="tableQueryRef"
      :record-id="targetRuleKey"
      record-key="ruleKey"
      action-hint="请核对关联菜单的编号场景；请调整或迁移规则后返回。"
    />
    <BusinessWorkspaceHeader
      density="compact"
      eyebrow="NUMBER GOVERNANCE"
      title="编号规则"
      description="统一维护运输单据、财务单据、基础资料和车辆业务的编码方式。系统取号由数据库事务完成，支持租户隔离、周期重置与并发防重。"
      icon="ri:hashtag"
      :tags="[
        {
          label: canManage ? '已授权维护' : '本租户只读视图',
          type: canManage ? 'primary' : 'info'
        },
        { label: `覆盖租户：${overview.stats.tenantCount}` },
        { label: `最近更新：${overview.lastUpdateText}` }
      ]"
      :metrics="overview.cards"
    >
      <template #actions>
        <BusinessTableWorkspaceActions :table="tableQueryRef" />
      </template>
    </BusinessWorkspaceHeader>

    <section class="number-rule-page__category art-card-xs">
      <ElScrollbar>
        <ElSegmented
          :model-value="table.searchQuery.category ?? ''"
          :options="categorySegments"
          @change="handleCategoryChange"
        />
      </ElScrollbar>
    </section>

    <div class="number-rule-page__workspace">
      <ArtWorkspaceSplitter :breakpoint="1200" narrow-mode="hide">
        <template #primary>
          <aside v-if="isDesktopMenuLayout" class="number-rule-page__menu-panel">
            <DocumentNumberMenuFilter
              :data="menuTree"
              :scenes="scenes"
              :selected-menu-id="selectedMenuId"
              :loading="menuFilterLoading"
              @select="handleMenuSelect"
              @refresh="handleMenuRefresh"
            />
          </aside>
        </template>

        <div class="number-rule-page__table-workspace">
          <BusinessMobileFilterContext
            v-if="!isDesktopMenuLayout"
            label="当前功能范围"
            :value="selectedMenuLabel"
            action-label="菜单筛选"
            @action="openMenuDrawer"
          />

          <ArtTableQuery
            ref="tableQueryRef"
            focusable
            v-model="table.searchQuery"
            :search-items="table.searchItems"
            :header-actions="table.headerActions"
            header-actions-placement="workspace"
            :api-fn="fetchTableData"
            :columns-factory="columnsFactory"
            :table-header-props="{ layout: 'refresh,size,fullscreen,columns,settings' }"
            :table-props="tableProps"
            focus-scope-selector=".number-rule-page__workspace"
          />
        </div>
      </ArtWorkspaceSplitter>
    </div>

    <DocumentNumberDialog
      v-if="hasAuth('System:DocumentNumberRule:Edit')"
      ref="dialogRef"
      @success="handleSaveSuccess"
    />
    <DocumentNumberCreateDialog
      v-if="hasAuth('System:DocumentNumberRule:Add')"
      ref="createDialogRef"
      @success="handleSaveSuccess"
    />
    <ArtDrawer ref="menuDrawerRef">
      <DocumentNumberMenuFilter
        class="number-rule-page__drawer-filter"
        :data="menuTree"
        :scenes="scenes"
        :selected-menu-id="selectedMenuId"
        :loading="menuFilterLoading"
        @select="handleDrawerMenuSelect"
        @refresh="handleMenuRefresh"
      />
    </ArtDrawer>
  </div>
</template>

<script setup lang="tsx">
  import { createMenuPathResolver, resolveMenuLabel } from '@/utils/navigation/menu'
  import type { ComputedRef, UnwrapNestedRefs } from 'vue'
  import { useMediaQuery } from '@vueuse/core'
  import { ElTag } from 'element-plus'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import ArtWorkspaceSplitter from '@/components/core/layouts/art-workspace-splitter/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessMobileFilterContext from '@/components/business/business-mobile-filter-context/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric
  } from '@/components/business/business-workspace-header/index.vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction,
    ArtTableQueryTableProps
  } from '@/components/core/tables/art-table-query/index.vue'
  import type { ColumnOption } from '@/types'
  import type { AppRouteRecord } from '@/types/router'
  import {
    fetchDocumentNumberRuleList,
    fetchDocumentNumberRuleStats,
    fetchDocumentNumberSceneList
  } from '@/api/document-number'
  import { fetchMenuCatalog } from '@/api/system-manage'
  import { fetchEnabledTenantList } from '@/api/system-manage/tenant'
  import { useUserStore } from '@/store/modules/user'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { useAuth } from '@/hooks/core/useAuth'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import { formatWithDayjs } from '@/utils/time'
  import TreeUtils from '@/utils/tree'
  import DocumentNumberDialog from './modules/document-number-dialog.vue'
  import DocumentNumberCreateDialog from './modules/document-number-create-dialog.vue'
  import DocumentNumberMenuFilter from './modules/document-number-menu-filter.vue'
  import MasterDeleteProcessingNotice from '@/components/business/master-delete-processing-notice/index.vue'

  defineOptions({ name: 'DocumentNumberRule' })

  type NumberRule = Api.SystemManage.DocumentNumberRuleItem
  type SearchParams = Api.SystemManage.DocumentNumberRuleSearchParams
  type Category = Api.SystemManage.DocumentNumberCategory
  type TableParams = SearchParams & Pick<Api.Common.PaginationParams, 'current' | 'size'>

  interface DialogExpose {
    handleOpen: (row: NumberRule) => Promise<void>
  }

  interface CreateDialogExpose {
    handleOpen: () => Promise<void>
  }

  interface OverviewGroup {
    stats: Api.SystemManage.DocumentNumberRuleStats
    lastUpdateText: ComputedRef<string>
    cards: ComputedRef<BusinessWorkspaceMetric[]>
  }

  const tableQueryRef = ref<ArtTableQueryExpose>()
  const route = useRoute()
  const dialogRef = ref<DialogExpose>()
  const createDialogRef = ref<CreateDialogExpose>()
  const menuDrawerRef = ref<ArtDrawerExpose<Record<string, never>>>()
  const tenantOptions = ref<Array<{ label: string; value: string }>>([])
  const menuTree = ref<AppRouteRecord[]>([])
  const scenes = ref<Api.SystemManage.DocumentNumberSceneItem[]>([])
  const selectedMenuId = ref(typeof route.query.menuId === 'string' ? route.query.menuId : '')
  const targetRuleKey = computed(() =>
    route.query.fromMasterDelete === '1' &&
    route.query.dependencyCode === 'menu_document_number_scene' &&
    typeof route.query.recordNo === 'string'
      ? route.query.recordNo
      : ''
  )
  const menuFilterLoading = ref(false)
  const isDesktopMenuLayout = useMediaQuery('(min-width: 1201px)')
  const treeUtils = new TreeUtils({ idKey: 'id', parentKey: 'parentId', childrenKey: 'children' })
  const userStore = useUserStore()
  const tenantScopeStore = useTenantScopeStore()
  const { getDictMap, isPlatformSuper } = storeToRefs(userStore)
  const { hasAuth, hasAnyAuth } = useAuth()
  const canManage = computed(() =>
    hasAnyAuth(['System:DocumentNumberRule:Add', 'System:DocumentNumberRule:Edit'])
  )

  const overview: UnwrapNestedRefs<OverviewGroup> = reactive<OverviewGroup>({
    stats: {
      total: 0,
      automatic: 0,
      manual: 0,
      tenantCount: 0,
      categoryCounts: { business_document: 0, master_data: 0, vehicle: 0 }
    },
    lastUpdateText: computed(() => formatWithDayjs(overview.stats.lastUpdateTime) || '-'),
    cards: computed(() => [
      {
        label: '规则总量',
        value: overview.stats.total,
        description: '已接入数据库编号引擎的业务字段',
        icon: 'ri:file-list-3-line',
        tone: 'primary'
      },
      {
        label: '自动编码',
        value: overview.stats.automatic,
        description: '保存时由系统生成正式唯一编号',
        icon: 'ri:magic-line',
        tone: 'success'
      },
      {
        label: '手工填写',
        value: overview.stats.manual,
        description: '由业务人员填写并接受唯一性校验',
        icon: 'ri:edit-box-line',
        tone: 'warning'
      },
      {
        label: '业务单据',
        value: overview.stats.categoryCounts.business_document,
        description: '运输、合同、财务及异常工单编号',
        icon: 'ri:bill-line',
        tone: 'info'
      }
    ])
  })

  const categoryOptions = computed(() => getDictMap.value.documentNumberCategory ?? [])
  const booleanOptions = computed(() =>
    (getDictMap.value.commonBoolean ?? []).map((item) => ({
      ...item,
      value: String(item.value) === 'true'
    }))
  )
  const categorySegments = computed(() => [
    { label: `全部 (${overview.stats.total})`, value: '' },
    ...categoryOptions.value.map((item) => {
      const value = String(item.value) as Category
      return {
        label: `${item.label} (${overview.stats.categoryCounts[value] ?? 0})`,
        value
      }
    })
  ])
  const selectedMenu = computed(() =>
    selectedMenuId.value ? treeUtils.findNode(menuTree.value, selectedMenuId.value) : null
  )
  const selectedMenuLabel = computed(() =>
    selectedMenu.value ? resolveMenuLabel(selectedMenu.value) : '全部功能'
  )
  const selectedRuleKeys = computed(() => {
    if (!selectedMenuId.value) return []
    const menuIds = new Set(
      treeUtils
        .getDescendants(menuTree.value, selectedMenuId.value, true)
        .map((menu) => menu.id)
        .filter((id): id is string => Boolean(id))
    )
    return scenes.value.filter((scene) => menuIds.has(scene.menuId)).map((scene) => scene.ruleKey)
  })

  const table = reactive({
    searchQuery: {
      keyword: '',
      tenantId: undefined,
      category: undefined,
      autoEnabled: undefined
    } as SearchParams,
    searchItems: computed<SearchFormItem[]>(() => [
      {
        label: '关键字',
        key: 'keyword',
        type: 'input',
        props: { clearable: true, placeholder: '搜索名称、规则键或目标表' }
      },
      ...(tenantScopeStore.isAllTenants
        ? [
            {
              label: '生效租户',
              key: 'tenantId',
              type: 'select' as const,
              props: {
                clearable: true,
                filterable: true,
                options: tenantOptions.value,
                placeholder: '全部租户'
              }
            }
          ]
        : []),
      {
        label: '生成方式',
        key: 'autoEnabled',
        type: 'select',
        props: { clearable: true, options: booleanOptions.value, placeholder: '全部方式' }
      }
    ]),
    headerActions: computed<ArtTableQueryHeaderAction[]>(() =>
      hasAuth('System:DocumentNumberRule:Add')
        ? [
            {
              type: 'add',
              label: '新增规则',
              permission: 'System:DocumentNumberRule:Add',
              onClick: () => void createDialogRef.value?.handleOpen()
            }
          ]
        : []
    )
  })

  const tableProps: ArtTableQueryTableProps = {
    rowKey: 'id',
    tableLayout: 'fixed',
    height: '100%',
    showOverflowTooltip: true,
    emptyText: '暂无符合条件的编号规则',
    emptyDescription: '可调整租户、业务分类或生成方式后重试。'
  }

  const fetchTableData = (params: TableParams) => {
    const { from, to } = buildSupabasePageRange({ current: params.current, size: params.size })
    return fetchDocumentNumberRuleList({
      ...params,
      ruleKeys: targetRuleKey.value
        ? [targetRuleKey.value]
        : selectedMenuId.value
          ? selectedRuleKeys.value
          : undefined,
      from,
      to
    })
  }

  const columnsFactory = (): ColumnOption<NumberRule>[] => [
    {
      prop: 'ruleName',
      label: '规则定义',
      minWidth: 240,
      fixed: 'left',
      formatter: (row) => (
        <div class="number-rule-identity">
          <span class="number-rule-identity__icon" aria-hidden="true">
            <ArtSvgIcon icon="ri:hashtag" />
          </span>
          <div>
            <strong title={row.ruleName}>{row.ruleName}</strong>
            <code title={row.ruleKey} translate="no">
              {row.ruleKey}
            </code>
          </div>
        </div>
      )
    },
    {
      prop: 'scene',
      label: '功能菜单',
      minWidth: 230,
      formatter: (row) => (
        <div class="number-rule-menu">
          <strong title={menuPathResolver.value.resolve(row.scene?.menuId)}>
            {menuPathResolver.value.resolve(row.scene?.menuId) || '--'}
          </strong>
          <small>
            {row.scene?.fieldLabel || row.targetColumn} · {row.scene?.menu?.component || '--'}
          </small>
        </div>
      )
    },
    ...(isPlatformSuper.value
      ? [
          {
            prop: 'tenant',
            label: '生效租户',
            minWidth: 150,
            formatter: (row: NumberRule) => (
              <div class="number-rule-tenant">
                <strong>{row.tenant?.tenantName || '--'}</strong>
                <small>{row.tenant?.tenantCode || '--'}</small>
              </div>
            )
          } satisfies ColumnOption<NumberRule>
        ]
      : []),
    {
      prop: 'category',
      label: '业务分类',
      width: 110,
      formatter: (row) => (
        <ArtDictDisplay dictCode="documentNumberCategory" value={row.category} display="tag" />
      )
    },
    {
      prop: 'template',
      label: '模板与预览',
      minWidth: 235,
      formatter: (row) => (
        <div class="number-rule-template">
          <code title={row.template} translate="no">
            {row.template}
          </code>
          <span title={row.preview} translate="no">
            {row.preview || '--'}
          </span>
        </div>
      )
    },
    {
      prop: 'autoEnabled',
      label: '生成方式',
      width: 110,
      formatter: (row) => (
        <ElTag type={row.autoEnabled ? 'success' : 'warning'} effect="light">
          {row.autoEnabled ? '自动编码' : '手工填写'}
        </ElTag>
      )
    },
    {
      prop: 'counter',
      label: '当前计数',
      minWidth: 132,
      formatter: (row) => (
        <div class="number-rule-counter">
          <strong>{row.currentValue ?? 0}</strong>
          <small>
            {row.currentPeriodKey || '永久累计'} · V{row.ruleVersion}
          </small>
        </div>
      )
    },
    {
      prop: 'resetCycle',
      label: '重置周期',
      width: 108,
      formatter: (row) => (
        <ArtDictDisplay dictCode="documentNumberResetCycle" value={row.resetCycle} display="text" />
      )
    },
    {
      prop: 'updateTime',
      label: '更新信息',
      minWidth: 168,
      formatter: (row) => (
        <div class="number-rule-update">
          <span>{formatWithDayjs(row.updateTime) || '--'}</span>
          <small>{row.updateBy || '系统维护'}</small>
        </div>
      )
    },
    ...(hasAuth('System:DocumentNumberRule:Edit')
      ? [
          {
            prop: 'operation',
            label: '操作',
            width: 88,
            fixed: 'right',
            formatter: (row: NumberRule) => (
              <ArtButtonTable
                type="edit"
                permission="System:DocumentNumberRule:Edit"
                onClick={() => void dialogRef.value?.handleOpen(row)}
              />
            )
          } satisfies ColumnOption<NumberRule>
        ]
      : [])
  ]

  let statsRequestId = 0
  const loadStats = async (): Promise<void> => {
    const requestId = ++statsRequestId
    const { data } = await fetchDocumentNumberRuleStats(table.searchQuery.tenantId)
    if (requestId === statsRequestId) Object.assign(overview.stats, data)
  }

  const loadTenantOptions = async (): Promise<void> => {
    if (!isPlatformSuper.value) return
    const { data } = await fetchEnabledTenantList()
    tenantOptions.value = (data ?? []).map((tenant) => ({
      label: `${tenant.tenantName}（${tenant.tenantCode}）`,
      value: String(tenant.id)
    }))
  }

  const loadMenuTree = async (): Promise<void> => {
    const { data } = await fetchMenuCatalog()
    menuTree.value = treeUtils.listToTree((data ?? []).filter((menu) => menu.type !== 'button'))
  }

  const loadScenes = async (): Promise<void> => {
    const { data } = await fetchDocumentNumberSceneList()
    scenes.value = data ?? []
  }

  const menuPathResolver = computed(() => createMenuPathResolver(menuTree.value))

  const handleCategoryChange = async (value: string | number): Promise<void> => {
    table.searchQuery.category = (String(value) || undefined) as Category | undefined
    await tableQueryRef.value?.getData()
  }

  const handleMenuSelect = async (menuId: string): Promise<void> => {
    if (selectedMenuId.value === menuId) return
    selectedMenuId.value = menuId
    await tableQueryRef.value?.getData()
  }

  const handleDrawerMenuSelect = async (menuId: string): Promise<void> => {
    await handleMenuSelect(menuId)
    await menuDrawerRef.value?.handleClose()
  }

  const handleMenuRefresh = async (): Promise<void> => {
    menuFilterLoading.value = true
    try {
      await Promise.all([loadMenuTree(), loadScenes()])
      if (selectedMenuId.value && !treeUtils.findNode(menuTree.value, selectedMenuId.value)) {
        selectedMenuId.value = ''
      }
      await tableQueryRef.value?.getData()
    } finally {
      menuFilterLoading.value = false
    }
  }

  const openMenuDrawer = async (): Promise<void> => {
    await menuDrawerRef.value?.handleOpen(
      {},
      {
        title: '筛选功能菜单',
        subtitle: '按业务菜单树定位编号规则，选择目录时自动包含全部下级菜单。',
        size: 'sm',
        contentHeight: 'calc(100vh - 118px)',
        showFooter: false,
        drawerProps: {
          appendToBody: true,
          bodyClass: 'document-number-menu-filter-drawer__body'
        }
      }
    )
  }

  const handleSaveSuccess = (): void => {
    void Promise.all([tableQueryRef.value?.refreshUpdate(), loadStats()])
  }

  onMounted(async () => {
    menuFilterLoading.value = true
    try {
      await Promise.all([
        userStore.ensureDictLoaded('documentNumberCategory'),
        userStore.ensureDictLoaded('documentNumberResetCycle'),
        loadStats(),
        loadTenantOptions(),
        loadMenuTree(),
        loadScenes()
      ])
      await tableQueryRef.value?.getData()
    } finally {
      menuFilterLoading.value = false
    }
  })

  watch(
    () => [route.query.menuId, targetRuleKey.value] as const,
    async ([menuId]) => {
      selectedMenuId.value = typeof menuId === 'string' ? menuId : ''
      table.searchQuery.keyword = ''
      await tableQueryRef.value?.refreshCreate()
    }
  )

  watch(
    () => table.searchQuery.tenantId,
    () => void loadStats()
  )

  watch(
    () => tenantScopeStore.revision,
    async () => {
      const hadTenantFilter = Boolean(table.searchQuery.tenantId)
      table.searchQuery.tenantId = undefined
      await Promise.all([
        tableQueryRef.value?.refreshCreate(),
        ...(hadTenantFilter ? [] : [loadStats()])
      ])
    }
  )
</script>

<style scoped lang="scss">
  .number-rule-page {
    gap: 12px;
    min-width: 0;
    overflow: hidden;

    &__category {
      flex: none;
      padding: 8px 12px;
    }

    &__workspace {
      flex: 1 1 auto;
      width: 100%;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
    }

    &__menu-panel,
    &__table-workspace {
      min-width: 0;
      height: 100%;
      min-height: 0;
      overflow: hidden;
    }

    &__table-workspace {
      display: flex;
      flex-direction: column;
    }

    &__drawer-filter {
      height: 100%;
      border: 0;
      border-radius: 0;
    }

    :deep(.art-table-query) {
      flex: 1 1 auto;
      height: 100%;
      min-height: 0;
      overflow: hidden;
    }
  }

  :deep(.number-rule-identity) {
    display: flex;
    gap: 10px;
    align-items: center;
    min-width: 0;

    div {
      min-width: 0;
    }

    strong,
    code {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    strong {
      color: var(--el-text-color-primary);
    }

    code {
      margin-top: 3px;
      font-size: 11px;
      color: var(--el-text-color-secondary);
    }
  }

  :deep(.number-rule-identity__icon) {
    display: grid;
    flex: 0 0 34px;
    place-items: center;
    width: 34px;
    height: 34px;
    color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
    border-radius: var(--art-control-radius);
  }

  :deep(.number-rule-tenant),
  :deep(.number-rule-menu),
  :deep(.number-rule-template),
  :deep(.number-rule-counter),
  :deep(.number-rule-update) {
    strong,
    span,
    code,
    small {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    small {
      margin-top: 3px;
      color: var(--el-text-color-secondary);
    }
  }

  :deep(.number-rule-template) {
    code {
      color: var(--el-text-color-primary);
    }

    span {
      margin-top: 4px;
      font-size: 12px;
      color: var(--el-color-primary);
    }
  }

  :deep(.number-rule-menu) {
    strong {
      color: var(--el-text-color-primary);
    }

    small {
      max-width: 100%;
    }
  }

  :deep(.number-rule-counter strong) {
    font-size: 16px;
    font-variant-numeric: tabular-nums;
  }

  :global(.document-number-menu-filter-drawer__body) {
    --art-drawer-content-padding: 0;

    padding: 0 !important;
    overflow: hidden !important;
  }
</style>
