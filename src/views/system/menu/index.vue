<!-- 菜单管理页面 -->
<template>
  <div class="menu-page business-workspace-page art-full-height">
    <MasterDeleteProcessingNotice
      :table="tableQueryRef"
      action-hint="请核对关联菜单；可先解除角色授权或处理编号场景后返回。"
    />
    <BusinessWorkspaceHeader
      class="menu-page__overview"
      eyebrow="NAVIGATION GOVERNANCE"
      title="菜单管理"
      description="统一维护导航层级、页面入口与按钮权限，确保路由结构和角色授权边界清晰一致。"
      icon="ri:route-line"
      :tags="[
        {
          label: canSortMenu ? '专业树形排序' : '排序只读',
          type: canSortMenu ? 'success' : 'info',
          effect: 'light'
        },
        { label: '树形权限结构', type: 'primary', effect: 'plain' }
      ]"
      :metrics="overviewCards"
    >
      <template #actions>
        <BusinessTableWorkspaceActions :table="tableQueryRef" />
      </template>
    </BusinessWorkspaceHeader>

    <ArtTableQuery
      ref="tableQueryRef"
      focusable
      v-model="formFilters"
      v-model:show-search-bar="showSearchBar"
      :search-items="formItems"
      :api-fn="fetchTableData"
      :api-params="tableApiParams"
      :columns-factory="columnsFactory"
      :response-adapter="responseAdapter"
      :header-actions="headerActions"
      header-actions-placement="workspace"
      :table-header-props="tableHeaderProps"
      :table-props="tableProps"
    />

    <!-- 菜单详情与维护弹窗 -->
    <MenuDetailDrawer ref="menuDetailDrawerRef" />
    <MenuDialog ref="menuDialogRef" @submit="handleSubmit" />
    <MenuSortDialog ref="menuSortDialogRef" @submit="handleSubmit" />
    <MasterDataDeleteGuard ref="deleteGuardRef" @cleared="handleSubmit" />
  </div>
</template>

<script setup lang="ts">
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { formatMenuTitle } from '@/utils/router'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric
  } from '@/components/business/business-workspace-header/index.vue'
  import ArtButtonMore from '@/components/core/forms/art-button-more/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import type { ButtonMoreItem } from '@/components/core/forms/art-button-more/index.vue'
  import type { AppRouteRecord } from '@/types/router'
  import MenuDialog from './modules/menu-dialog.vue'
  import MenuDetailDrawer from './modules/menu-detail-drawer.vue'
  import MenuSortDialog from './modules/menu-sort-dialog.vue'
  import {
    getDirectPermissionCount,
    getMenuActionSubject,
    getMenuTypeIcon,
    getMenuTypeTag,
    getMenuTypeText
  } from './modules/menu-presentation'
  import TreeUtils from '@/utils/tree'
  import { ElMessage, ElTag } from 'element-plus'
  import { uniqBy } from 'lodash-es'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction,
    ArtTableQueryTableHeaderProps,
    ArtTableQueryTableProps
  } from '@/components/core/tables/art-table-query/index.vue'
  import type { ColumnOption } from '@/types'
  import type { ApiResponse } from '@/utils/table/table-cache'

  import { formatWithDayjs } from '@/utils/time'
  import {
    deleteMenu,
    fetchAllMenuList,
    fetchMenuChildren,
    fetchMenuList,
    type MenuListParams
  } from '@/api/system-manage'
  import { useAuth } from '@/hooks/core/useAuth'
  import MasterDataDeleteGuard, {
    type MasterDataDeleteGuardOpenOptions
  } from '@/components/business/master-data-delete-guard/index.vue'
  import MasterDeleteProcessingNotice from '@/components/business/master-delete-processing-notice/index.vue'

  defineOptions({ name: 'Menus' })

  const { confirmAction } = useArtFeedback()
  const route = useRoute()

  const treeUtils = new TreeUtils({
    idKey: 'id',
    parentKey: 'parentId',
    childrenKey: 'children',
    deepClone: true
  })

  type MenuType = 'folder' | 'menu' | 'button'

  interface MenuDialogOpenData {
    row?: AppRouteRecord | Record<string, never>
    type?: MenuType
    parent?: AppRouteRecord
    menuTree: AppRouteRecord[]
    loadMenuTree?: () => Promise<AppRouteRecord[]>
  }

  interface MenuDialogExpose {
    handleOpen: (data: MenuDialogOpenData) => Promise<void>
  }

  interface MenuSortDialogExpose {
    handleOpen: (
      menuTree: AppRouteRecord[],
      loadMenuTree: () => Promise<AppRouteRecord[]>
    ) => Promise<void>
  }

  interface MenuDetailDrawerExpose {
    handleOpen: (
      row: AppRouteRecord,
      menuTree: AppRouteRecord[],
      loadMenuTree: () => Promise<AppRouteRecord[]>
    ) => Promise<void>
  }

  interface MasterDataDeleteGuardExpose {
    inspect: (options: MasterDataDeleteGuardOpenOptions) => Promise<boolean>
  }

  const { hasAuth } = useAuth()
  const canSortMenu = computed(() => hasAuth('System:Menu:Edit'))

  const showSearchBar = ref(false)
  // 弹窗相关
  const tableQueryRef = ref<ArtTableQueryExpose>()
  const menuDialogRef = ref<MenuDialogExpose>()
  const menuDetailDrawerRef = ref<MenuDetailDrawerExpose>()
  const menuSortDialogRef = ref<MenuSortDialogExpose>()
  const deleteGuardRef = ref<MasterDataDeleteGuardExpose>()

  const openMenuDialog = async (data: MenuDialogOpenData): Promise<void> => {
    await menuDialogRef.value?.handleOpen(data)
  }

  // 搜索相关
  const initialSearchState = {
    name: '',
    path: ''
  }

  const formFilters = ref({ ...initialSearchState })
  const tableApiParams = {
    current: 1,
    size: 9999
  }

  const formItems = computed<SearchFormItem[]>(() => [
    {
      label: '菜单名称',
      key: 'name',
      type: 'input',
      props: { clearable: true, placeholder: '请输入菜单名称或权限标识' }
    },
    {
      label: '路由地址',
      key: 'path',
      type: 'input',
      props: { clearable: true, placeholder: '请输入路由、组件或外链地址' }
    }
  ])

  const tableHeaderProps: ArtTableQueryTableHeaderProps = {
    showZebra: false
  }

  const tableProps = computed<ArtTableQueryTableProps>(() => ({
    rowKey: 'id',
    tableLayout: 'fixed',
    stripe: false,
    lazy: true,
    load: loadMenuChildren,
    treeProps: { children: 'children', hasChildren: 'hasChildren' },
    rowClassName: () => 'menu-tree-row',
    defaultExpandAll: false,
    emptyText: '暂无符合条件的菜单',
    emptyDescription: '可调整筛选条件，或新增菜单后再配置页面与按钮权限。',
    paginationOptions: {
      hideOnSinglePage: true
    }
  }))

  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    {
      type: 'add',
      label: '添加菜单',
      permission: 'System:Menu:Add',
      onClick: () => handleAdd('menu')
    },
    {
      key: 'tree-sort',
      label: '树形排序',
      icon: 'ri:drag-move-2-line',
      permission: 'System:Menu:Edit',
      buttonProps: { plain: true },
      onClick: () => void handleOpenSort()
    }
  ])

  const getAccessPrimaryText = (row: AppRouteRecord): string => {
    if (row.type === 'button') return row.name || '未配置权限标识'
    return row.meta?.link || row.path || '未配置访问地址'
  }

  const getAccessSecondaryText = (row: AppRouteRecord): string => {
    if (row.type === 'button') return '操作权限'
    if (row.meta?.link && row.meta?.isIframe) return '站内嵌入页面'
    if (row.meta?.link) return '外部链接'
    return typeof row.component === 'string' && row.component ? row.component : '目录容器'
  }

  const columnsFactory = (): ColumnOption<AppRouteRecord>[] => [
    {
      prop: 'meta.title',
      label: '菜单信息',
      minWidth: 230,
      link: { permission: 'System:Menu:View', onClick: handleView },
      formatter: (row: AppRouteRecord) => {
        const permissionCount = getDirectPermissionCount({
          ...row,
          children: row.id ? loadedChildrenByParent.get(row.id) : row.children
        })
        return h('div', { class: 'menu-identity-cell' }, [
          h(
            'span',
            {
              class: ['menu-identity-cell__icon', `is-${row.type || 'menu'}`],
              'aria-hidden': 'true'
            },
            [h(ArtSvgIcon, { icon: getMenuTypeIcon(row) })]
          ),
          h('div', { class: 'menu-identity-cell__copy' }, [
            h('div', { class: 'menu-identity-cell__heading' }, [
              h(
                'strong',
                { title: formatMenuTitle(row.meta?.title) },
                formatMenuTitle(row.meta?.title)
              ),
              permissionCount
                ? h(
                    'span',
                    { class: 'menu-identity-cell__permission-count' },
                    `${permissionCount}项权限`
                  )
                : null
            ]),
            h('small', { title: row.name, translate: 'no' }, row.name || '未配置权限标识')
          ])
        ])
      }
    },
    {
      prop: 'type',
      label: '菜单类型',
      width: 96,
      formatter: (row: AppRouteRecord) => {
        return h(ElTag, { type: getMenuTypeTag(row), effect: 'light' }, () => getMenuTypeText(row))
      }
    },
    {
      prop: 'accessConfig',
      label: '访问配置',
      minWidth: 220,
      formatter: (row: AppRouteRecord) => {
        const primary = getAccessPrimaryText(row)
        const secondary = getAccessSecondaryText(row)
        return h('div', { class: 'menu-access-cell' }, [
          h('span', { title: primary, translate: 'no' }, primary),
          h('small', { title: secondary, translate: 'no' }, secondary)
        ])
      }
    },
    {
      prop: 'sort',
      label: '排序',
      width: 72,
      align: 'center'
    },
    {
      prop: 'updateTime',
      label: '最后编辑',
      width: 164,
      formatter: (row: AppRouteRecord) =>
        h('span', { class: 'menu-update-cell' }, formatWithDayjs(row?.updateTime) || '--')
    },
    {
      prop: 'status',
      label: '状态',
      width: 88,
      formatter: (row: AppRouteRecord) => {
        const enabled = row.meta?.isEnable !== false
        return h(ElTag, { type: enabled ? 'success' : 'info', effect: 'light' }, () =>
          enabled ? '启用' : '停用'
        )
      }
    },
    {
      prop: 'operation',
      label: '操作',
      width: 112,
      align: 'right',
      fixed: 'right',
      formatter: (row: AppRouteRecord) =>
        h('div', { class: 'menu-operation-cell' }, [
          h(ArtButtonTable, {
            type: 'view',
            label: '查看详情',
            permission: 'System:Menu:View',
            onClick: () => void handleView(row)
          }),
          h(ArtButtonMore, {
            list: getMenuActions(row),
            onClick: (item: ButtonMoreItem) => handleMenuAction(item, row)
          })
        ])
    }
  ]

  // 数据相关
  const tableData = ref<AppRouteRecord[]>([])
  const loadedChildrenByParent = reactive(new Map<string, AppRouteRecord[]>())
  const completeMenuTreeCache = shallowRef<AppRouteRecord[] | null>(null)
  let completeMenuTreeLoad: Promise<AppRouteRecord[]> | null = null
  const loadedMenuRows = computed(() =>
    uniqBy([tableData.value, ...loadedChildrenByParent.values()].flat(), (row) => row.id)
  )
  const overviewCards = computed<BusinessWorkspaceMetric[]>(() => {
    const rows = loadedMenuRows.value
    const navigationRows = rows.filter((row) => row.type !== 'button')
    const permissionRows = rows.filter(
      (row) => row.type === 'button' || row.meta?.menuType === 'button'
    )
    const enabledRows = rows.filter((row) => row.meta?.isEnable !== false)

    return [
      {
        label: '已加载节点',
        value: rows.length,
        description: `${tableData.value.length} 个当前入口`,
        icon: 'ri:node-tree',
        tone: 'primary'
      },
      {
        label: '导航菜单',
        value: navigationRows.length,
        description: '目录、页面与外部入口',
        icon: 'ri:menu-2-line',
        tone: 'info'
      },
      {
        label: '按钮权限',
        value: permissionRows.length,
        description: '用于角色精细化授权',
        icon: 'ri:shield-keyhole-line',
        tone: 'warning'
      },
      {
        label: '启用节点',
        value: enabledRows.length,
        description: rows.length
          ? `占全部节点 ${Math.round((enabledRows.length / rows.length) * 100)}%`
          : '暂无节点',
        icon: 'ri:checkbox-circle-line',
        tone: 'success'
      }
    ]
  })

  const getMenuActions = (row: AppRouteRecord): ButtonMoreItem[] =>
    [
      {
        key: 'add',
        label: row.type === 'folder' ? '新增子菜单' : '新增按钮权限',
        icon: row.type === 'folder' ? 'ri:file-add-line' : 'ri:add-circle-line',
        auth: 'System:Menu:Add',
        hidden: row.type === 'button'
      },
      {
        key: 'edit',
        label: `编辑${getMenuActionSubject(row)}`,
        icon: 'ri:edit-2-line',
        auth: 'System:Menu:Edit'
      },
      {
        key: 'delete',
        label: `删除${getMenuActionSubject(row)}`,
        icon: 'ri:delete-bin-4-line',
        color: 'var(--el-color-danger)',
        auth: 'System:Menu:Delete'
      }
    ].filter((item) => !item.hidden)

  const handleMenuAction = (item: ButtonMoreItem, row: AppRouteRecord): void => {
    switch (item.key) {
      case 'add':
        void handleAdd(row.type === 'folder' ? 'menu' : 'button', row)
        break
      case 'edit':
        void handleEdit(row)
        break
      case 'delete':
        void handleDelete(row)
        break
    }
  }

  const fetchTableData = (params: MenuListParams, context?: { signal?: AbortSignal }) => {
    const query: MenuListParams = {
      name: params.name,
      path: params.path,
      recordId: typeof route.query.recordId === 'string' ? route.query.recordId : undefined
    }

    return fetchMenuList(query, context?.signal)
  }

  const responseAdapter = (response: { data: AppRouteRecord[] }): ApiResponse<AppRouteRecord> => {
    loadedChildrenByParent.clear()
    completeMenuTreeCache.value = null
    tableData.value = response.data

    return {
      records: response.data,
      total: response.data.length,
      current: tableApiParams.current,
      size: tableApiParams.size
    }
  }

  const loadCompleteMenuTree = async (): Promise<AppRouteRecord[]> => {
    if (completeMenuTreeCache.value) return completeMenuTreeCache.value
    if (!completeMenuTreeLoad) {
      completeMenuTreeLoad = (async () => {
        const { data, error } = await fetchAllMenuList()
        if (error) throw error
        const tree = treeUtils.listToTree(data ?? [], (a, b) => (a.sort ?? 0) - (b.sort ?? 0))
        completeMenuTreeCache.value = tree
        return tree
      })().finally(() => {
        completeMenuTreeLoad = null
      })
    }
    return completeMenuTreeLoad
  }

  const showMenuTreeLoadError = (error: unknown): void => {
    ElMessage.error(getFriendlySupabaseErrorMessage(error, '菜单层级加载失败，请稍后重试'))
  }

  const loadMenuChildren: NonNullable<ArtTableQueryTableProps['load']> = async (
    row,
    _treeNode,
    resolve
  ) => {
    const menu = row as AppRouteRecord
    if (!menu.id) {
      resolve([])
      return
    }

    const { data, error } = await fetchMenuChildren(menu.id)
    if (error) {
      showMenuTreeLoadError(error)
      resolve([])
      return
    }

    const children = data ?? []
    loadedChildrenByParent.set(menu.id, children)
    resolve(children)
  }

  const handleView = async (row: AppRouteRecord): Promise<void> => {
    try {
      await menuDetailDrawerRef.value?.handleOpen(
        row,
        completeMenuTreeCache.value ?? [],
        loadCompleteMenuTree
      )
    } catch (error) {
      showMenuTreeLoadError(error)
    }
  }

  const handleOpenSort = async (): Promise<void> => {
    try {
      await menuSortDialogRef.value?.handleOpen(
        completeMenuTreeCache.value ?? [],
        loadCompleteMenuTree
      )
    } catch (error) {
      showMenuTreeLoadError(error)
    }
  }

  /**
   * 添加菜单/权限
   */
  const handleAdd = async (type: MenuType, row?: AppRouteRecord): Promise<void> => {
    try {
      await openMenuDialog({
        row: {},
        type,
        parent: row,
        menuTree: completeMenuTreeCache.value ?? [],
        loadMenuTree: loadCompleteMenuTree
      })
    } catch (error) {
      showMenuTreeLoadError(error)
    }
  }

  /**
   * 编辑菜单/权限
   * @param row 菜单行数据
   */
  const handleEdit = async (row: AppRouteRecord): Promise<void> => {
    try {
      await openMenuDialog({
        row,
        parent: row,
        menuTree: completeMenuTreeCache.value ?? [],
        loadMenuTree: loadCompleteMenuTree
      })
    } catch (error) {
      showMenuTreeLoadError(error)
    }
  }

  /**
   * 提交表单数据
   */
  const handleSubmit = (): void => {
    completeMenuTreeCache.value = null
    loadedChildrenByParent.clear()
    void tableQueryRef.value?.refreshData()
  }

  /**
   * 删除菜单
   */
  const handleDelete = async (row: AppRouteRecord): Promise<void> => {
    try {
      if (!row.id) throw new Error('未找到需要删除的菜单')
      const menuId = row.id

      let ids: string[] = []
      const blocked = await deleteGuardRef.value?.inspect({
        resourceType: 'menu',
        resourceLabel: '菜单',
        resources: [{ id: String(row.id), label: formatMenuTitle(row.meta?.title) }],
        resolveResources: async () => {
          const completeMenuTree = await loadCompleteMenuTree()
          const descendants = treeUtils.getDescendants(completeMenuTree, menuId, true)
          ids = descendants.map((item) => String(item.id))
          return descendants.map((item) => ({
            id: String(item.id),
            label: formatMenuTitle(item.meta?.title)
          }))
        }
      })
      if (blocked) return

      await confirmAction(
        `删除「${formatMenuTitle(row.meta?.title)}」后，其下级菜单与按钮权限会一并移除，关联角色也将失去对应访问权限。确认继续吗？`,
        '删除菜单',
        {
          confirmButtonText: '确认删除',
          cancelButtonText: '取消',
          type: 'warning',
          confirmButtonType: 'danger'
        }
      )
      await deleteMenu({ ids })
      ElMessage.success('菜单删除成功')
      completeMenuTreeCache.value = null
      loadedChildrenByParent.clear()
      await tableQueryRef.value?.refreshData()
    } catch (error) {
      if (error !== 'cancel') {
        ElMessage.error(getFriendlySupabaseErrorMessage(error, '删除失败'))
      }
    }
  }

  watch(
    () => route.query.recordId,
    () => {
      formFilters.value = { ...initialSearchState }
      void tableQueryRef.value?.refreshCreate()
    }
  )
</script>

<style scoped lang="scss">
  .menu-page {
    gap: 12px;
    min-width: 0;

    &__overview {
      flex: 0 0 auto;
      min-width: 0;
      overflow: hidden;
    }

    :deep(.menu-identity-cell) {
      display: flex;
      flex: 1;
      gap: 10px;
      align-items: center;
      min-width: 0;

      .menu-identity-cell__icon {
        display: grid;
        flex: 0 0 34px;
        place-items: center;
        width: 34px;
        height: 34px;
        font-size: 16px;
        color: var(--el-color-primary);
        background: var(--el-color-primary-light-9);
        border: 1px solid var(--el-color-primary-light-7);
        border-radius: var(--art-control-radius);

        &.is-folder {
          color: var(--el-color-warning-dark-2);
          background: var(--el-color-warning-light-9);
          border-color: var(--el-color-warning-light-7);
        }

        &.is-button {
          color: var(--el-color-danger);
          background: var(--el-color-danger-light-9);
          border-color: var(--el-color-danger-light-7);
        }
      }

      .menu-identity-cell__copy,
      .menu-identity-cell__heading {
        min-width: 0;
      }

      .menu-identity-cell__heading {
        display: flex;
        gap: 6px;
        align-items: center;

        strong {
          overflow: hidden;
          text-overflow: ellipsis;
          font-weight: 600;
          color: var(--el-text-color-primary);
          white-space: nowrap;
        }
      }

      small {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 12px;
        line-height: 18px;
        color: var(--el-text-color-secondary);
        white-space: nowrap;
      }

      .menu-identity-cell__permission-count {
        flex: none;
        padding: 1px 6px;
        font-size: 10px;
        line-height: 17px;
        color: var(--el-color-primary);
        background: var(--el-color-primary-light-9);
        border-radius: 999px;
      }
    }

    :deep(.menu-tree-row > td:first-child .cell) {
      display: flex;
      align-items: center;
    }

    :deep(.menu-tree-row .el-table__expand-icon) {
      display: inline-flex;
      flex: none;
      align-items: center;
      align-self: center;
      justify-content: center;
      margin-right: 6px;
    }

    :deep(.menu-tree-row .el-table__placeholder) {
      flex: none;
    }

    :deep(.menu-access-cell) {
      display: grid;
      min-width: 0;
      line-height: 19px;

      span,
      small {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      span {
        color: var(--el-text-color-regular);
      }

      small {
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }
    }

    :deep(.menu-update-cell) {
      font-variant-numeric: tabular-nums;
      color: var(--el-text-color-secondary);
    }

    :deep(.menu-operation-cell) {
      display: flex;
      gap: 8px;
      align-items: center;

      .art-button-table {
        margin-right: 0;
      }
    }
  }
</style>
