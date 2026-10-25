<template>
  <div class="organization-page business-workspace-page art-full-height">
    <MasterDeleteProcessingNotice
      :table="tableQueryRef"
      action-hint="请核对关联组织；请先处理成员、角色或下级组织。"
    />
    <BusinessWorkspaceHeader
      class="organization-page__overview"
      eyebrow="ORGANIZATION GOVERNANCE"
      title="组织管理"
      description="用统一组织树串联成员归属、职责角色与菜单权限，清晰呈现每个组织的访问边界。"
      icon="ri:organization-chart"
      :tags="[
        { label: '权限按角色授权', type: 'success', effect: 'light' },
        { label: '用户 · 角色 · 菜单联动', type: 'primary', effect: 'plain' }
      ]"
      :metrics="workspaceMetrics"
    >
      <template #actions>
        <BusinessTableWorkspaceActions :table="tableQueryRef" />
      </template>
    </BusinessWorkspaceHeader>

    <ArtTableQuery
      ref="tableQueryRef"
      v-model="searchForm"
      :api-fn="fetchTableData"
      :api-params="tableApiParams"
      :search-items="searchItems"
      :columns-factory="columnsFactory"
      :header-actions="headerActions"
      header-actions-placement="workspace"
      :table-props="tableProps"
      :on-success="handleTableSuccess"
      focusable
    />

    <component
      :is="organizationDialogComponent"
      v-if="organizationDialogComponent"
      ref="organizationDialogRef"
      @success="handleSaveSuccess"
    />
    <component
      :is="organizationDetailDrawerComponent"
      v-if="organizationDetailDrawerComponent"
      ref="organizationDetailDrawerRef"
    />
    <MasterDataDeleteGuard ref="deleteGuardRef" @cleared="handleDeleteDependenciesCleared" />
  </div>
</template>

<script setup lang="ts">
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useLazyComponent } from '@/hooks/core/useLazyComponent'
  import type { ColumnOption } from '@/types'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction,
    ArtTableQueryProps,
    ArtTableQueryTableProps
  } from '@/components/core/tables/art-table-query/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtButtonMore, {
    type ButtonMoreItem
  } from '@/components/core/forms/art-button-more/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric
  } from '@/components/business/business-workspace-header/index.vue'
  import { useUserStore } from '@/store/modules/user'
  import { deleteOrganization, fetchOrganizationTree } from '@/api/system-manage'
  import { formatWithDayjs } from '@/utils/time'
  import TreeUtils from '@/utils/tree'
  import MasterDataDeleteGuard, {
    type MasterDataDeleteGuardOpenOptions
  } from '@/components/business/master-data-delete-guard/index.vue'
  import MasterDeleteProcessingNotice from '@/components/business/master-delete-processing-notice/index.vue'

  defineOptions({ name: 'Organization' })

  type Organization = Api.SystemManage.OrganizationListItem
  type OrganizationSearchParams = Api.SystemManage.OrganizationSearchParams

  interface OrganizationDialogExpose {
    handleOpen: (data: {
      type: 'add' | 'edit'
      row?: Organization
      parent?: Organization
    }) => Promise<void>
  }

  interface OrganizationDetailDrawerExpose {
    handleOpen: (row: Organization) => Promise<void>
  }

  interface MasterDataDeleteGuardExpose {
    inspect: (options: MasterDataDeleteGuardOpenOptions) => Promise<boolean>
  }

  interface OverviewState {
    organizations: number
    members: number
    roles: number
    menus: number
  }

  const { confirmDelete } = useArtFeedback()
  const route = useRoute()
  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)
  const treeUtils = new TreeUtils({ idKey: 'id', parentKey: 'parentId', childrenKey: 'children' })
  const tableQueryRef = ref<ArtTableQueryExpose>()
  const organizationDialogRef = ref<OrganizationDialogExpose>()
  const organizationDetailDrawerRef = ref<OrganizationDetailDrawerExpose>()
  const deleteGuardRef = ref<MasterDataDeleteGuardExpose>()
  const { component: organizationDialogComponent, load: loadOrganizationDialog } = useLazyComponent(
    () => import('./modules/organization-dialog.vue')
  )
  const { component: organizationDetailDrawerComponent, load: loadOrganizationDetailDrawer } =
    useLazyComponent(() => import('./modules/organization-detail-drawer.vue'))
  const organizationDepthMap = shallowRef(new Map<string, number>())
  const overview = reactive<OverviewState>({
    organizations: 0,
    members: 0,
    roles: 0,
    menus: 0
  })
  const workspaceMetrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '组织节点',
      value: overview.organizations,
      description: '当前筛选范围',
      icon: 'ri:node-tree'
    },
    {
      label: '归属成员',
      value: overview.members,
      description: '已纳入组织管理',
      icon: 'ri:group-line',
      tone: 'success'
    },
    {
      label: '组织角色',
      value: overview.roles,
      description: '承载职责授权',
      icon: 'ri:shield-user-line',
      tone: 'warning'
    },
    {
      label: '菜单覆盖',
      value: overview.menus,
      description: '各组织去重后汇总',
      icon: 'ri:menu-line',
      tone: 'info'
    }
  ])

  const searchForm = ref<OrganizationSearchParams>({
    recordId: typeof route.query.recordId === 'string' ? route.query.recordId : '',
    keyword: '',
    organizationType: undefined,
    status: undefined
  })

  const tableApiParams = { current: 1, size: 1000 }

  const searchItems = computed<SearchFormItem[]>(() => [
    {
      label: '组织关键字',
      key: 'keyword',
      type: 'input',
      props: {
        clearable: true,
        placeholder: '搜索组织名称、编码或职责说明'
      }
    },
    {
      label: '组织类型',
      key: 'organizationType',
      type: 'select',
      props: {
        clearable: true,
        placeholder: '全部类型',
        options: getDictMap.value.organizationType ?? []
      }
    },
    {
      label: '状态',
      key: 'status',
      type: 'select',
      props: {
        clearable: true,
        placeholder: '全部状态',
        options: getDictMap.value.status ?? []
      }
    }
  ])

  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    {
      type: 'add',
      label: '新增组织',
      permission: 'System:Organization:Add',
      onClick: () => void openOrganizationDialog('add')
    }
  ])

  const tableProps: ArtTableQueryTableProps = {
    rowKey: 'id',
    tableLayout: 'fixed',
    treeProps: { children: 'children', hasChildren: 'hasChildren' },
    indent: 24,
    defaultExpandAll: true,
    rowClassName: ({ row }) => {
      const organization = row as Organization
      const depth = organization.id ? (organizationDepthMap.value.get(organization.id) ?? 0) : 0
      return [
        'organization-tree-row',
        depth === 0 ? 'is-root' : 'is-child',
        `is-depth-${Math.min(depth, 6)}`,
        organization.children?.length ? 'has-children' : 'is-leaf'
      ].join(' ')
    },
    emptyText: '暂无符合条件的组织',
    emptyDescription: '可调整筛选条件；组织管理员也可以新增组织节点。',
    paginationOptions: {
      hideOnSinglePage: true
    }
  }

  const getOrganizationIcon = (type: Api.SystemManage.OrganizationType): string => {
    const iconMap: Record<Api.SystemManage.OrganizationType, string> = {
      company: 'ri:building-4-line',
      division: 'ri:git-branch-line',
      department: 'ri:team-line',
      team: 'ri:group-2-line'
    }
    return iconMap[type]
  }

  const getMenuCoverage = (row: Organization): number => {
    if (typeof row.menuCount === 'number') return row.menuCount

    const menuIds = new Set(
      (row.roles ?? []).flatMap((role) =>
        (role.roleMenus ?? []).map((roleMenu) => roleMenu.menuId).filter(Boolean)
      )
    )
    return menuIds.size
  }

  const getOrganizationDepth = (row: Organization): number =>
    row.id ? (organizationDepthMap.value.get(row.id) ?? 0) : 0

  const getMemberCount = (row: Organization): number => row.memberCount ?? row.members?.length ?? 0

  const getRoleCount = (row: Organization): number => row.roleCount ?? row.roles?.length ?? 0

  const isProtectedOrganization = (row: Organization): boolean => Boolean(row.isSystem)

  const columnsFactory = (): ColumnOption<Organization>[] => [
    {
      prop: 'organizationIdentity',
      label: '组织层级',
      minWidth: 340,
      link: { permission: 'System:Organization:View', onClick: openOrganizationDetail },
      formatter: (row) => {
        const depth = getOrganizationDepth(row)
        const childCount = row.children?.length ?? 0
        return h('div', { class: 'organization-identity-cell' }, [
          h(
            'span',
            {
              class: ['organization-identity-cell__icon', `is-${row.organizationType}`],
              'aria-hidden': 'true'
            },
            [h(ArtSvgIcon, { icon: getOrganizationIcon(row.organizationType) })]
          ),
          h('div', { class: 'organization-identity-cell__copy' }, [
            h('div', { class: 'organization-identity-cell__heading' }, [
              h('strong', { title: row.organizationName }, row.organizationName),
              isProtectedOrganization(row)
                ? h('span', { class: 'organization-identity-cell__system' }, '系统预置')
                : null
            ]),
            h('div', { class: 'organization-identity-cell__meta' }, [
              h('small', { title: row.organizationCode, translate: 'no' }, row.organizationCode),
              h('i', { 'aria-hidden': 'true' }),
              h('span', { class: 'organization-identity-cell__level' }, `第 ${depth + 1} 级`),
              childCount
                ? h('span', { class: 'organization-identity-cell__children' }, [
                    h(ArtSvgIcon, { icon: 'ri:git-branch-line' }),
                    `${childCount} 个直属下级`
                  ])
                : null
            ])
          ])
        ])
      }
    },
    {
      prop: 'organizationType',
      label: '组织类型',
      width: 110,
      dict: { code: 'organizationType', display: 'auto' }
    },
    {
      prop: 'tenant',
      label: '所属租户',
      minWidth: 160,
      formatter: (row) =>
        h('div', { class: 'organization-tenant-cell' }, [
          h('span', { title: row.tenant?.tenantName }, row.tenant?.tenantName || '当前租户'),
          row.tenant?.tenantCode
            ? h('small', { title: row.tenant.tenantCode }, row.tenant.tenantCode)
            : null
        ])
    },
    {
      prop: 'leader',
      label: '负责人',
      minWidth: 150,
      formatter: (row) =>
        row.leader
          ? h('div', { class: 'organization-leader-cell' }, [
              h('strong', null, row.leader.nickName || row.leader.userName),
              h('small', { title: row.leader.userEmail }, row.leader.userEmail)
            ])
          : h('span', { class: 'organization-empty-cell' }, '待指定')
    },
    {
      prop: 'accessChain',
      label: '用户 / 角色 / 菜单',
      minWidth: 190,
      formatter: (row) =>
        h('div', { class: 'organization-access-cell' }, [
          h('span', null, [
            h('strong', null, String(getMemberCount(row))),
            h('small', null, '成员')
          ]),
          h('span', null, [h('strong', null, String(getRoleCount(row))), h('small', null, '角色')]),
          h('span', null, [
            h('strong', null, String(getMenuCoverage(row))),
            h('small', null, '菜单')
          ])
        ])
    },
    {
      prop: 'status',
      label: '状态',
      width: 88,
      dict: { code: 'status', display: 'auto' }
    },
    {
      prop: 'updateTime',
      label: '最后更新',
      width: 166,
      formatter: (row) => formatWithDayjs(row.updateTime) || '--'
    },
    {
      prop: 'operation',
      label: '操作',
      width: 112,
      fixed: 'right',
      formatter: (row) =>
        h('div', { class: 'organization-operation-cell' }, [
          h(ArtButtonTable, {
            type: 'view',
            label: '治理详情',
            permission: 'System:Organization:View',
            onClick: () => void openOrganizationDetail(row)
          }),
          h(ArtButtonMore, {
            list: getOrganizationActions(row),
            onClick: (item: ButtonMoreItem) => handleOrganizationAction(item, row)
          })
        ])
    }
  ]

  const fetchTableData = (params: OrganizationSearchParams) => fetchOrganizationTree(params)

  const getOrganizationActions = (row: Organization): ButtonMoreItem[] => {
    const actions: ButtonMoreItem[] = [
      {
        key: 'addChild',
        label: '新增下级组织',
        icon: 'ri:node-tree',
        auth: 'System:Organization:Add'
      },
      {
        key: 'edit',
        label: '编辑组织',
        icon: 'ri:edit-2-line',
        auth: 'System:Organization:Edit'
      },
      {
        key: 'delete',
        label: '删除组织',
        icon: 'ri:delete-bin-4-line',
        color: 'var(--el-color-danger)',
        auth: 'System:Organization:Delete'
      }
    ]

    return isProtectedOrganization(row) ? actions.filter((item) => item.key !== 'delete') : actions
  }

  const handleOrganizationAction = (item: ButtonMoreItem, row: Organization): void => {
    if (item.disabled) return
    if (item.key === 'addChild') {
      void openOrganizationDialog('add', undefined, row)
    } else if (item.key === 'edit') {
      void openOrganizationDialog('edit', row)
    } else if (item.key === 'delete') {
      void handleDelete(row)
    }
  }

  const openOrganizationDialog = async (
    type: 'add' | 'edit',
    row?: Organization,
    parent?: Organization
  ): Promise<void> => {
    await loadOrganizationDialog()
    await organizationDialogRef.value?.handleOpen({ type, row, parent })
  }

  const openOrganizationDetail = async (row: Organization): Promise<void> => {
    await loadOrganizationDetailDrawer()
    await organizationDetailDrawerRef.value?.handleOpen(row)
  }

  const handleTableSuccess: NonNullable<ArtTableQueryProps['onSuccess']> = (rows) => {
    const depthMap = new Map<string, number>()
    treeUtils.traverse(rows as Organization[], (organization, depth) => {
      if (organization.id) depthMap.set(organization.id, depth)
    })
    organizationDepthMap.value = depthMap

    const organizations = treeUtils.treeToList(rows as Organization[])
    const menuIds = new Set<string>()
    let members = 0
    let roles = 0
    let menuCount = 0

    organizations.forEach((organization) => {
      members += getMemberCount(organization)
      roles += getRoleCount(organization)

      if (typeof organization.menuCount === 'number') {
        menuCount += organization.menuCount
      } else {
        organization.roles?.forEach((role) => {
          role.roleMenus?.forEach((roleMenu) => {
            if (roleMenu.menuId) menuIds.add(roleMenu.menuId)
          })
        })
      }
    })

    Object.assign(overview, {
      organizations: organizations.length,
      members,
      roles,
      menus: menuCount + menuIds.size
    })
  }

  const handleSaveSuccess = (type: 'add' | 'edit'): void => {
    void (type === 'add'
      ? tableQueryRef.value?.refreshCreate()
      : tableQueryRef.value?.refreshUpdate())
  }

  const handleDelete = async (row: Organization): Promise<void> => {
    if (!row.id || isProtectedOrganization(row)) return
    try {
      const blocked = await deleteGuardRef.value?.inspect({
        resourceType: 'organization',
        resourceLabel: '组织',
        resources: [{ id: row.id, label: row.organizationName }]
      })
      if (blocked) return

      await confirmDelete(
        `确定删除组织「${row.organizationName}」吗？删除后无法恢复。仅无下级组织、无成员且无角色的节点可以删除。`
      )
      await deleteOrganization(row.id)
      await tableQueryRef.value?.refreshRemove()
    } catch {
      // 用户取消或数据库阻止删除时，反馈由统一请求层处理。
    }
  }

  const handleDeleteDependenciesCleared = (): void => {
    void tableQueryRef.value?.refreshData()
  }

  watch(
    () => route.query.recordId,
    (recordId) => {
      Object.assign(searchForm.value, {
        recordId: typeof recordId === 'string' ? recordId : '',
        keyword: '',
        organizationType: undefined,
        status: undefined
      })
      void tableQueryRef.value?.refreshCreate()
    }
  )
</script>

<style scoped lang="scss">
  .organization-page {
    gap: 12px;
    min-width: 0;

    &__overview {
      flex: 0 0 auto;
      min-width: 0;
      overflow: hidden;
    }

    :deep(.organization-identity-cell) {
      display: flex;
      gap: 12px;
      align-items: center;
      min-width: 0;
      min-height: 44px;
    }

    :deep(.organization-tree-row > td:first-child) {
      position: relative;
    }

    :deep(.organization-tree-row.is-root > td:first-child) {
      box-shadow: inset 3px 0 0 var(--theme-color);
    }

    :deep(.organization-tree-row.is-root > td) {
      background: color-mix(in srgb, var(--theme-color) 3%, var(--el-bg-color));
    }

    :deep(.organization-tree-row.is-child > td) {
      background: var(--el-bg-color);
    }

    :deep(.organization-tree-row.is-depth-1 > td) {
      background: color-mix(in srgb, var(--theme-color) 1.2%, var(--el-bg-color));
    }

    :deep(.organization-tree-row > td:first-child .cell) {
      position: relative;
      display: flex;
      align-items: center;
      overflow: hidden;
    }

    :deep(.organization-tree-row .el-table__expand-icon) {
      display: inline-flex;
      flex: 0 0 22px;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      margin-right: 6px;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 8%, var(--el-bg-color));
      border: 1px solid color-mix(in srgb, var(--theme-color) 18%, var(--el-border-color));
      border-radius: var(--el-border-radius-small);

      &:hover,
      &:focus-visible {
        background: color-mix(in srgb, var(--theme-color) 13%, var(--el-bg-color));
      }
    }

    :deep(.organization-tree-row .el-table__placeholder) {
      flex: 0 0 28px;
      width: 28px;
    }

    :deep(.organization-tree-row.is-child .el-table__indent) {
      position: relative;
      align-self: stretch;
      min-height: 44px;

      &::after {
        position: absolute;
        top: 50%;
        right: 5px;
        width: 10px;
        content: '';
        border-top: 1px solid color-mix(in srgb, var(--theme-color) 24%, var(--el-border-color));
      }
    }

    :deep(.organization-identity-cell__icon) {
      display: grid;
      flex: 0 0 34px;
      place-items: center;
      width: 34px;
      height: 34px;
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
      border: 1px solid var(--el-color-primary-light-7);
      border-radius: var(--el-border-radius-base);

      &.is-division {
        color: var(--el-color-warning-dark-2);
        background: var(--el-color-warning-light-9);
        border-color: var(--el-color-warning-light-7);
      }

      &.is-department,
      &.is-team {
        color: var(--el-color-success-dark-2);
        background: var(--el-color-success-light-9);
        border-color: var(--el-color-success-light-7);
      }
    }

    :deep(.organization-identity-cell__copy),
    :deep(.organization-identity-cell__heading),
    :deep(.organization-identity-cell__meta) {
      min-width: 0;
    }

    :deep(.organization-identity-cell__heading) {
      display: flex;
      gap: 6px;
      align-items: center;

      strong {
        flex: 0 1 auto;
        overflow: hidden;
        text-overflow: ellipsis;
        font-weight: 600;
        line-height: 20px;
        color: var(--el-text-color-primary);
        white-space: nowrap;
      }
    }

    :deep(.organization-identity-cell__meta) {
      display: flex;
      flex-wrap: wrap;
      gap: 3px 7px;
      align-items: center;
      min-height: 18px;

      > i {
        width: 3px;
        height: 3px;
        background: var(--el-border-color-darker);
        border-radius: 50%;
      }
    }

    :deep(.organization-identity-cell__meta small),
    :deep(.organization-tenant-cell small),
    :deep(.organization-leader-cell small) {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 12px;
      color: var(--el-text-color-secondary);
      white-space: nowrap;
    }

    :deep(.organization-identity-cell__system),
    :deep(.organization-identity-cell__children) {
      flex: none;
      padding: 0 6px;
      font-size: 10px;
      line-height: 17px;
      border-radius: 999px;
    }

    :deep(.organization-identity-cell__system) {
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
    }

    :deep(.organization-identity-cell__level) {
      flex: none;
      font-size: 11px;
      color: var(--el-text-color-secondary);
    }

    :deep(.organization-identity-cell__children) {
      display: inline-flex;
      gap: 3px;
      align-items: center;
      color: var(--el-text-color-secondary);
      background: var(--el-fill-color-light);

      svg {
        width: 11px;
        height: 11px;
      }
    }

    :deep(.organization-tenant-cell),
    :deep(.organization-leader-cell) {
      display: grid;
      min-width: 0;
      line-height: 20px;

      span,
      strong {
        overflow: hidden;
        text-overflow: ellipsis;
        color: var(--el-text-color-primary);
        white-space: nowrap;
      }
    }

    :deep(.organization-access-cell) {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      align-items: center;
      min-width: 0;

      span {
        display: grid;
        gap: 1px;
        justify-items: center;
        min-width: 0;

        &:not(:last-child) {
          border-right: 1px solid var(--el-border-color-lighter);
        }
      }

      strong {
        font-size: 13px;
        font-variant-numeric: tabular-nums;
        line-height: 18px;
        color: var(--el-text-color-primary);
      }

      small {
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 10px;
        color: var(--el-text-color-secondary);
        white-space: nowrap;
      }
    }

    :deep(.organization-empty-cell) {
      font-size: 12px;
      color: var(--el-text-color-placeholder);
    }

    :deep(.organization-operation-cell) {
      display: flex;
      gap: 8px;
      align-items: center;

      .art-button-table {
        margin-right: 0;
      }
    }
  }

  :global(
    html[data-box-mode='border-mode']
      .organization-page
      .organization-tree-row
      .el-table__expand-icon:hover
  ),
  :global(
    html[data-box-mode='border-mode']
      .organization-page
      .organization-tree-row
      .el-table__expand-icon:focus-visible
  ) {
    border-color: color-mix(in srgb, var(--theme-color) 48%, var(--el-border-color));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--theme-color) 20%, transparent);
  }

  :global(
    html[data-box-mode='shadow-mode']
      .organization-page
      .organization-tree-row
      .el-table__expand-icon
  ) {
    border-color: transparent;
  }

  :global(
    html[data-box-mode='shadow-mode']
      .organization-page
      .organization-tree-row
      .el-table__expand-icon:hover
  ),
  :global(
    html[data-box-mode='shadow-mode']
      .organization-page
      .organization-tree-row
      .el-table__expand-icon:focus-visible
  ) {
    border-color: transparent;
    box-shadow: 0 4px 12px color-mix(in srgb, var(--theme-color) 18%, transparent);
  }
</style>
