<template>
  <WorkflowDesignerWorkspace
    v-if="designer.mode"
    :definition-id="designer.definitionId"
    :template-key="designer.templateKey"
    @close="closeDesigner"
    @saved="handleDesignerSaved"
  />

  <div v-else class="art-full-height workflow-definition business-workspace-page">
    <BusinessWorkspaceHeader
      eyebrow="WORKFLOW GOVERNANCE"
      title="审批流程设计"
      description="用版本化配置复用审批能力，发布中的版本保持不可变，所有流转动作完整留痕。"
      icon="ri:git-merge-line"
      :tags="!canConfigure ? [{ label: '只读', type: 'info', effect: 'plain' }] : []"
    >
      <template #actions>
        <BusinessTableWorkspaceActions :table="tableQueryRef" />
        <ElButton plain @click="openCatalog">
          <ArtSvgIcon icon="ri:apps-2-line" />业务覆盖
        </ElButton>
      </template>
    </BusinessWorkspaceHeader>

    <div class="workflow-definition__workspace">
      <ArtWorkspaceSplitter :breakpoint="1200" narrow-mode="hide">
        <template #primary>
          <aside v-if="isDesktopMenuLayout" class="workflow-definition__menu-panel">
            <WorkflowBusinessMenuFilter
              :data="menuTree"
              :selected-menu-id="selectedMenuId"
              :loading="menuLoading"
              :error="menuError"
              @select="handleMenuSelect"
              @refresh="handleMenuRefresh"
            />
          </aside>
        </template>

        <div class="workflow-definition__table-workspace">
          <BusinessMobileFilterContext
            v-if="!isDesktopMenuLayout"
            label="当前业务范围"
            :value="selectedMenuLabel"
            action-label="业务筛选"
            @action="openMenuDrawer"
          />

          <ArtTableQuery
            ref="tableQueryRef"
            focusable
            v-model="table.searchQuery"
            :search-items="table.searchItems"
            :api-fn="fetchTableData"
            :columns-factory="table.columnsFactory"
            :header-actions="table.headerActions"
            header-actions-placement="workspace"
            :search-bar-props="{ span: 8, labelWidth: 88 }"
            :table-props="{
              rowKey: 'id',
              tableLayout: 'fixed',
              emptyText: '暂无审批流程定义',
              emptyDescription: hasAuth('WorkflowDefinition:Add')
                ? '可以新建流程，或调整筛选条件后重新查询。'
                : '当前租户还没有可查看的流程，请联系管理员配置或授权。'
            }"
            focus-scope-selector=".workflow-definition__workspace"
          />
        </div>
      </ArtWorkspaceSplitter>
    </div>

    <component
      :is="versionHistoryComponent"
      v-if="versionHistoryComponent"
      ref="versionHistoryRef"
      @success="handleSaveSuccess"
    />
    <component
      :is="catalogComponent"
      v-if="catalogComponent"
      ref="catalogRef"
      :menu-tree="menuTree"
      :loading="menuLoading"
      @refresh="handleMenuRefresh"
    />
    <component
      :is="templateLibraryComponent"
      v-if="templateLibraryComponent"
      ref="templateLibraryRef"
      @select="openNewDesigner"
    />
    <ArtDrawer ref="menuDrawerRef">
      <WorkflowBusinessMenuFilter
        class="workflow-definition__drawer-filter"
        :data="menuTree"
        :selected-menu-id="selectedMenuId"
        :loading="menuLoading"
        :error="menuError"
        @select="handleDrawerMenuSelect"
        @refresh="handleMenuRefresh"
      />
    </ArtDrawer>
    <MasterDataDeleteGuard ref="deleteGuardRef" />
  </div>
</template>

<script setup lang="tsx">
  import { useMediaQuery } from '@vueuse/core'
  import { ElTag } from 'element-plus'
  import type { ComputedRef, UnwrapNestedRefs } from 'vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction
  } from '@/components/core/tables/art-table-query/index.vue'
  import type { ColumnOption } from '@/types'
  import type { AppRouteRecord } from '@/types/router'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtButtonMore, {
    type ButtonMoreItem
  } from '@/components/core/forms/art-button-more/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import ArtWorkspaceSplitter from '@/components/core/layouts/art-workspace-splitter/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessMobileFilterContext from '@/components/business/business-mobile-filter-context/index.vue'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import MasterDataDeleteGuard, {
    type MasterDataDeleteGuardOpenOptions
  } from '@/components/business/master-data-delete-guard/index.vue'
  import { fetchRecordDeleteDependencies } from '@/api/master-data-delete'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import { formatWithDayjs } from '@/utils/time'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useLazyComponent } from '@/hooks/core/useLazyComponent'
  import { useUserStore } from '@/store/modules/user'
  import {
    fetchAccessibleApplications,
    fetchCurrentUserMenus
  } from '@/api/system-manage/application-access'
  import { useAuth } from '@/hooks/core/useAuth'
  import { fetchEnabledTenantList } from '@/api/system-manage/tenant'
  import TreeUtils from '@/utils/tree'
  import {
    deleteWorkflowDefinition,
    fetchWorkflowDefinitionList,
    publishWorkflowDefinition,
    setWorkflowDefinitionEnabled
  } from '@/api/workflow'
  import WorkflowBusinessMenuFilter from './modules/workflow-business-menu-filter.vue'
  import {
    getWorkflowBusinessTypeLabel,
    workflowBusinessContracts
  } from '../modules/workflow-business-contracts'

  defineOptions({ name: 'WorkflowDefinition' })

  const WorkflowDesignerWorkspace = defineAsyncComponent(
    () => import('./modules/workflow-designer-workspace.vue')
  )

  type Definition = Api.Workflow.WorkflowDefinitionRecord
  type SearchParams = Pick<
    Api.Workflow.WorkflowDefinitionSearchParams,
    'keyword' | 'status' | 'tenantId'
  > & {
    businessTypes?: string[]
  }
  type TableParams = SearchParams & Pick<Api.Common.PaginationParams, 'current' | 'size'>

  interface VersionHistoryExpose {
    handleOpen: (row: Definition, options?: { canManage?: boolean }) => Promise<void>
  }
  interface CatalogExpose {
    handleOpen: () => Promise<void>
  }
  interface TemplateLibraryExpose {
    handleOpen: () => Promise<void>
  }

  interface TableGroup {
    searchQuery: SearchParams
    searchItems: ComputedRef<SearchFormItem[]>
    headerActions: ComputedRef<ArtTableQueryHeaderAction[]>
    columnsFactory: () => ColumnOption<Definition>[]
  }

  const userStore = useUserStore()
  const { hasAuth, hasAnyAuth } = useAuth()
  const canConfigure = computed(() =>
    hasAnyAuth([
      'WorkflowDefinition:Add',
      'WorkflowDefinition:Edit',
      'WorkflowDefinition:Publish',
      'WorkflowDefinition:Enable'
    ])
  )
  const route = useRoute()
  const router = useRouter()
  const { getDictMap, isPlatformSuper } = storeToRefs(userStore)
  const { confirmAction, confirmDelete } = useArtFeedback()
  const { component: versionHistoryComponent, load: loadVersionHistory } = useLazyComponent(
    () => import('./modules/workflow-version-history-dialog.vue')
  )
  const { component: catalogComponent, load: loadCatalog } = useLazyComponent(
    () => import('./modules/workflow-business-catalog-dialog.vue')
  )
  const { component: templateLibraryComponent, load: loadTemplateLibrary } = useLazyComponent(
    () => import('./modules/workflow-template-library-dialog.vue')
  )
  const tableQueryRef = ref<ArtTableQueryExpose>()
  const versionHistoryRef = ref<VersionHistoryExpose>()
  const catalogRef = ref<CatalogExpose>()
  const templateLibraryRef = ref<TemplateLibraryExpose>()
  const menuDrawerRef = ref<ArtDrawerExpose<Record<string, never>>>()
  const deleteGuardRef = ref<InstanceType<typeof MasterDataDeleteGuard>>()
  const menuTree = ref<AppRouteRecord[]>([])
  const menuLoading = ref(false)
  const menuError = ref('')
  const selectedMenuId = ref('')
  const selectedMenuLabel = ref('全部业务')
  const isDesktopMenuLayout = useMediaQuery('(min-width: 1201px)')
  const treeUtils = new TreeUtils({ idKey: 'id', parentKey: 'parentId', childrenKey: 'children' })
  async function openVersionHistory(row: Definition): Promise<void> {
    await loadVersionHistory()
    await versionHistoryRef.value?.handleOpen(row, {
      canManage: hasAuth('WorkflowDefinition:Edit')
    })
  }
  async function openCatalog(): Promise<void> {
    await loadCatalog()
    await catalogRef.value?.handleOpen()
  }
  async function openTemplateLibrary(): Promise<void> {
    await loadTemplateLibrary()
    await templateLibraryRef.value?.handleOpen()
  }
  const designer = reactive({
    mode: computed(() => typeof route.query.designer === 'string'),
    definitionId: computed(() =>
      typeof route.query.designer === 'string' ? route.query.designer : undefined
    ),
    templateKey: computed(() =>
      typeof route.query.template === 'string' ? route.query.template : undefined
    )
  })

  const getCurrentVersion = (row: Definition) =>
    row.versions?.find((version) => version.id === row.currentVersionId) ||
    [...(row.versions || [])].sort((a, b) => b.versionNo - a.versionNo)[0]

  const table: UnwrapNestedRefs<TableGroup> = reactive<TableGroup>({
    searchQuery: { keyword: '', businessTypes: undefined, status: '', tenantId: '' },
    searchItems: computed<SearchFormItem[]>(() => [
      {
        label: '关键词',
        key: 'keyword',
        type: 'input',
        props: { placeholder: '搜索流程名称或编码', clearable: true }
      },
      {
        label: '流程状态',
        key: 'status',
        type: 'select',
        props: {
          options: getDictMap.value.workflowDefinitionStatus ?? [],
          placeholder: '全部状态',
          clearable: true
        }
      },
      {
        label: '所属租户',
        key: 'tenantId',
        type: 'select',
        hidden: !isPlatformSuper.value,
        api: fetchEnabledTenantList,
        resultField: 'data',
        valueField: 'id',
        labelFn: (tenant) => `${tenant.tenantName}（${tenant.tenantCode}）`,
        props: {
          placeholder: '全部租户',
          filterable: true,
          clearable: true
        }
      }
    ]),
    headerActions: computed<ArtTableQueryHeaderAction[]>(() =>
      hasAuth('WorkflowDefinition:Add')
        ? [
            {
              type: 'add',
              permission: 'WorkflowDefinition:Add',
              label: '新建流程',
              onClick: () => void openTemplateLibrary()
            }
          ]
        : []
    ),
    columnsFactory: () => [
      {
        prop: 'name',
        label: '流程定义',
        minWidth: 270,
        fixed: 'left',
        formatter: (row) => (
          <div class="workflow-definition__name-cell">
            <span>
              <ArtSvgIcon icon="ri:flow-chart" />
            </span>
            <div>
              <strong>{row.name}</strong>
              <div class="workflow-definition__name-meta">
                <small>{row.code}</small>
                <i>·</i>
                <span>{row.description || '暂无流程说明'}</span>
              </div>
            </div>
          </div>
        )
      },
      {
        prop: 'businessType',
        label: '业务类型',
        minWidth: 150,
        formatter: (row) => getWorkflowBusinessTypeLabel(row.businessType)
      },
      ...(isPlatformSuper.value
        ? [
            {
              prop: 'tenant',
              label: '所属租户',
              minWidth: 190,
              formatter: (row: Definition) => (
                <div class="workflow-definition__tenant-cell">
                  <strong>{row.tenant?.tenantName || '--'}</strong>
                  <small>{row.tenant?.tenantCode || row.tenantId}</small>
                </div>
              )
            } satisfies ColumnOption<Definition>
          ]
        : []),
      {
        prop: 'status',
        label: '状态',
        width: 110,
        dict: { code: 'workflowDefinitionStatus', display: 'tag' }
      },
      {
        prop: 'version',
        label: '版本与节点',
        width: 132,
        formatter: (row) => {
          const version = getCurrentVersion(row)
          return (
            <div class="workflow-definition__version-cell">
              {version ? <ElTag effect="plain">V{version.versionNo}</ElTag> : <span>--</span>}
              <small>{version?.config.nodes.length ?? 0} 个审批节点</small>
              <button type="button" onClick={() => void openVersionHistory(row)}>
                查看版本
              </button>
            </div>
          )
        }
      },
      {
        prop: 'updateTime',
        label: '最近更新',
        width: 168,
        formatter: (row) => formatWithDayjs(row.updateTime)
      },
      ...(canConfigure.value
        ? [
            {
              prop: 'operation',
              label: '操作',
              width: 106,
              fixed: 'right',
              formatter: (row: Definition) => (
                <div class="workflow-definition__actions">
                  <ArtButtonTable
                    type="edit"
                    label="编辑流程"
                    permission="WorkflowDefinition:Edit"
                    onClick={() => openDesigner(row.id)}
                  />
                  <ArtButtonMore
                    list={() => getRowMoreActions(row)}
                    onClick={(item: ButtonMoreItem) => handleRowMoreAction(item, row)}
                  />
                </div>
              )
            } satisfies ColumnOption<Definition>
          ]
        : [])
    ]
  })

  function fetchTableData(params: TableParams) {
    const { from, to } = buildSupabasePageRange(params)
    return fetchWorkflowDefinitionList({ ...params, from, to })
  }

  async function loadMenuTree(): Promise<void> {
    menuError.value = ''
    const applications = await fetchAccessibleApplications()
    if (applications.error || !applications.data) throw new Error('业务菜单加载失败，请重试')
    const result = await fetchCurrentUserMenus(
      applications.data.map((application) => application.code)
    )
    if (result.error || !result.data) throw new Error('业务菜单加载失败，请重试')
    menuTree.value = treeUtils.listToTree(
      Object.values(result.data)
        .flat()
        .filter((menu) => menu.type !== 'button')
    )
  }

  async function handleMenuSelect(
    menuId: string,
    businessTypes: string[],
    label: string
  ): Promise<void> {
    selectedMenuId.value = menuId
    selectedMenuLabel.value = label
    table.searchQuery.businessTypes =
      businessTypes.length === workflowBusinessContracts.length ? undefined : businessTypes
    await tableQueryRef.value?.getData()
  }

  async function handleDrawerMenuSelect(
    menuId: string,
    businessTypes: string[],
    label: string
  ): Promise<void> {
    await handleMenuSelect(menuId, businessTypes, label)
    await menuDrawerRef.value?.handleClose()
  }

  async function handleMenuRefresh(): Promise<void> {
    menuLoading.value = true
    try {
      await loadMenuTree()
      if (selectedMenuId.value && !treeUtils.findNode(menuTree.value, selectedMenuId.value)) {
        await handleMenuSelect(
          '',
          workflowBusinessContracts.map((contract) => contract.businessType),
          '全部业务'
        )
      }
    } catch {
      menuError.value = '请重新加载；若持续失败，请联系管理员核对业务菜单权限。'
    } finally {
      menuLoading.value = false
    }
  }

  async function openMenuDrawer(): Promise<void> {
    await menuDrawerRef.value?.handleOpen(
      {},
      {
        title: '筛选审批业务',
        subtitle: '按业务菜单树定位流程定义，选择目录时自动包含全部下级业务。',
        size: 'sm',
        contentHeight: 'calc(100vh - 118px)',
        showFooter: false,
        drawerProps: { appendToBody: true }
      }
    )
  }

  function openNewDesigner(templateKey: string): void {
    void router.push({
      path: route.path,
      query: { designer: 'new', template: templateKey }
    })
  }

  function openDesigner(definitionId: string): void {
    void router.push({
      path: route.path,
      query: { designer: definitionId }
    })
  }

  function closeDesigner(): void {
    void router.push({ path: route.path })
  }

  function handleDesignerSaved(definitionId: string): void {
    void router.replace({
      path: route.path,
      query: { designer: definitionId }
    })
  }

  function getRowMoreActions(row: Definition): ButtonMoreItem[] {
    return [
      {
        key: 'publish',
        auth: 'WorkflowDefinition:Publish',
        label: '发布流程',
        icon: 'ri:send-plane-line',
        disabled: !row.versions?.some((version) => version.status === 'draft')
      },
      {
        key: 'toggle',
        auth: 'WorkflowDefinition:Enable',
        label: row.status === 'disabled' ? '启用流程' : '停用流程',
        icon: row.status === 'disabled' ? 'ri:play-circle-line' : 'ri:pause-circle-line',
        disabled: row.status === 'draft'
      },
      ...(isPlatformSuper.value
        ? [
            {
              key: 'delete',
              label: '删除流程',
              icon: 'ri:delete-bin-line',
              color: 'var(--el-color-danger)'
            }
          ]
        : [])
    ]
  }

  function handleRowMoreAction(item: ButtonMoreItem, row: Definition): void {
    const actionMap: Record<string, () => Promise<void>> = {
      publish: () => handlePublish(row),
      toggle: () => handleToggle(row),
      delete: () => handleDelete(row)
    }
    const action = actionMap[String(item.key)]
    if (action) void action()
  }

  async function handlePublish(row: Definition): Promise<void> {
    await confirmAction(`发布“${row.name}”后，该版本将不可直接修改，新实例会立即使用新版本。`, {
      title: '发布流程',
      confirmButtonText: '确认发布',
      type: 'warning'
    })
    await publishWorkflowDefinition(row.id)
    await tableQueryRef.value?.getData()
  }

  async function handleToggle(row: Definition): Promise<void> {
    const enabled = row.status === 'disabled'
    await confirmAction(
      enabled
        ? `启用“${row.name}”后，业务可以再次发起审批。`
        : `停用“${row.name}”后，将阻止新实例发起，运行中实例不受影响。`,
      {
        title: enabled ? '启用流程' : '停用流程',
        confirmButtonText: enabled ? '确认启用' : '确认停用'
      }
    )
    await setWorkflowDefinitionEnabled(row.id, enabled)
    await tableQueryRef.value?.getData()
  }

  async function handleDelete(row: Definition): Promise<void> {
    if (!isPlatformSuper.value) return
    const options: MasterDataDeleteGuardOpenOptions = {
      resourceLabel: '审批流程',
      navigationResource: { type: 'workflow_definition', queryKey: 'definitionId' },
      resources: [{ id: row.id, label: row.name }],
      dependencyMeta: {
        wf_instance: {
          label: '审批记录',
          unit: '条',
          order: 1,
          description: '已有审批记录的流程需保留历史，请停用流程。',
          actionLabel: '查看审批记录',
          routeName: 'WorkflowMonitor'
        }
      },
      fetchDependencies: async (ids) =>
        (await fetchRecordDeleteDependencies({ table: 'wf_definition', ids })).map((record) => ({
          ...record,
          dependencyCode: record.sourceTable,
          cleanupAllowed: false,
          createdAt: record.createdAt || ''
        }))
    }
    if (!deleteGuardRef.value || (await deleteGuardRef.value.inspect(options))) return
    const tenantLabel = row.tenant?.tenantName ? `（${row.tenant.tenantName}）` : ''
    await confirmDelete(
      `确定删除“${row.name}”${tenantLabel}吗？只有从未产生审批记录的流程可以删除；已有历史的流程必须停用。`
    )
    try {
      await deleteWorkflowDefinition(row.id)
    } catch (error) {
      await deleteGuardRef.value.inspect(options)
      throw error
    }
    await tableQueryRef.value?.refreshRemove()
  }

  async function handleSaveSuccess(): Promise<void> {
    await tableQueryRef.value?.getData()
  }

  onMounted(async () => {
    menuLoading.value = true
    try {
      await Promise.all([userStore.fetchDictList(), loadMenuTree()])
    } catch {
      menuError.value = '请重新加载；若持续失败，请联系管理员核对业务菜单权限。'
    } finally {
      menuLoading.value = false
    }
  })
</script>

<style scoped lang="scss">
  .workflow-definition {
    &__hero {
      display: flex;
      gap: 24px;
      align-items: center;
      justify-content: space-between;
      padding: 22px 24px;
      overflow: hidden;
      background:
        radial-gradient(circle at 95% 15%, rgb(64 158 255 / 15%), transparent 34%),
        var(--default-box-color);
    }

    &__hero-copy {
      display: flex;
      gap: 15px;
      align-items: center;

      > div > span {
        font-size: 11px;
        font-weight: 700;
        color: var(--el-color-primary);
        letter-spacing: 0.12em;
      }

      h1 {
        margin: 4px 0 5px;
        font-size: 24px;
        font-weight: 600;
        line-height: 1.25;
        color: var(--art-gray-900);
      }

      p {
        max-width: 620px;
        margin: 0;
        font-size: 13px;
        line-height: 1.6;
        color: var(--art-gray-500);
      }
    }

    &__heading {
      display: flex;
      gap: 10px;
      align-items: center;

      .el-tag {
        flex: none;
      }
    }

    &__hero-icon {
      display: grid;
      flex: 0 0 auto;
      place-items: center;
      width: 52px;
      height: 52px;
      font-size: 26px;
      color: #fff;
      background: linear-gradient(145deg, var(--el-color-primary), #7568f8);
      border-radius: calc(var(--el-border-radius-base) + 8px);
      box-shadow: 0 12px 25px rgb(64 120 255 / 24%);
    }

    &__principles {
      display: flex;
      flex: 0 0 auto;
      gap: 10px;

      article {
        display: flex;
        gap: 9px;
        align-items: center;
        min-width: 148px;
        padding: 11px 12px;
        background: rgb(255 255 255 / 55%);
        border: 1px solid var(--art-gray-200);
        border-radius: var(--el-border-radius-base);
      }

      article > svg {
        font-size: 19px;
        color: var(--el-color-primary);
      }

      article div {
        display: grid;
        gap: 2px;
      }

      strong {
        font-size: 13px;
        color: var(--art-gray-800);
      }

      small {
        font-size: 12px;
        line-height: 1.35;
        color: var(--art-gray-600);
      }
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

    &__menu-panel {
      display: flex;
      align-self: stretch;

      :deep(.workflow-menu-filter) {
        flex: 1 1 auto;
        height: auto;
        min-height: 0;
      }
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

    :deep(.workflow-definition__name-cell) {
      display: flex;
      gap: 10px;
      align-items: center;
    }

    :deep(.workflow-definition__name-cell > span) {
      display: grid;
      flex: 0 0 34px;
      place-items: center;
      width: 34px;
      height: 34px;
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
      border-radius: calc(var(--el-border-radius-base) + 1px);
    }

    :deep(.workflow-definition__name-cell > div) {
      display: grid;
      flex: 1 1 auto;
      gap: 2px;
      min-width: 0;
    }

    :deep(.workflow-definition__name-cell strong),
    :deep(.workflow-definition__name-meta small),
    :deep(.workflow-definition__name-meta span) {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    :deep(.workflow-definition__name-meta) {
      display: flex;
      gap: 5px;
      align-items: center;
      min-width: 0;
      font-size: 12px;
      color: var(--art-gray-500);

      small {
        flex: 0 1 auto;
        font-size: inherit;
        color: var(--art-gray-600);
      }

      i {
        flex: none;
        font-style: normal;
        color: var(--art-gray-400);
      }

      span {
        min-width: 0;
      }
    }

    :deep(.workflow-definition__version-cell) {
      display: grid;
      gap: 5px;
      justify-items: start;

      small {
        font-size: 12px;
        color: var(--art-gray-600);
      }
    }

    &__catalog-button {
      flex: 0 0 auto;
    }

    :deep(.workflow-definition__version-cell button) {
      width: fit-content;
      padding: 0;
      font-size: 11px;
      color: var(--el-color-primary);
      cursor: pointer;
      background: transparent;
      border: 0;
    }

    :deep(.workflow-definition__version-cell button:hover) {
      text-decoration: underline;
    }

    :deep(.workflow-definition__tenant-cell) {
      display: grid;
      gap: 2px;
      min-width: 0;
    }

    :deep(.workflow-definition__tenant-cell strong),
    :deep(.workflow-definition__tenant-cell small) {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    :deep(.workflow-definition__tenant-cell strong) {
      font-size: 13px;
      font-weight: 500;
      color: var(--art-gray-800);
    }

    :deep(.workflow-definition__tenant-cell small) {
      font-size: 12px;
      color: var(--art-gray-600);
    }
  }

  @media (width <= 1360px) {
    .workflow-definition__principles article:nth-child(n + 2) {
      display: none;
    }
  }

  @media (width <= 1200px) {
    .workflow-definition__workspace {
      overflow: visible;
    }

    .workflow-definition__table-workspace {
      height: auto;
      overflow: visible;
    }
  }

  @media (width <= 720px) {
    .workflow-definition__hero {
      align-items: flex-start;
      padding: 18px;
    }

    .workflow-definition__catalog-button {
      width: 100%;
    }

    .workflow-definition__principles {
      display: none;
    }

    .workflow-definition__hero-copy {
      align-items: flex-start;
    }

    .workflow-definition__hero-copy h1 {
      font-size: 20px;
    }
  }
</style>
