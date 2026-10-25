<template>
  <div class="user-page business-workspace-page art-full-height">
    <MasterDeleteProcessingNotice
      :table="tableQueryRef"
      action-hint="请核对关联用户；可调整组织归属或角色授权后返回。"
    />
    <BusinessWorkspaceHeader
      class="user-page__overview"
      eyebrow="ACCOUNT GOVERNANCE"
      title="用户管理"
      description="统一维护登录身份、联系方式、租户归属与角色授权，及时识别异常或停用账号。"
      icon="ri:user-settings-line"
      :tags="[
        { label: '账号按租户隔离', type: 'success', effect: 'light' },
        { label: '角色独立授权', type: 'primary', effect: 'plain' }
      ]"
      :metrics="workspaceMetrics"
    >
      <template #actions>
        <BusinessTableWorkspaceActions :table="tableQueryRef" />
      </template>
    </BusinessWorkspaceHeader>

    <div class="user-page__workspace">
      <ArtWorkspaceSplitter :breakpoint="1200" narrow-mode="hide">
        <template #primary>
          <aside v-if="isDesktopOrganizationLayout" class="user-page__organization-panel">
            <OrganizationScopeFilter
              :data="organizationTree"
              :loading="organizationFilterLoading"
              :selected-key="selectedOrganizationKey"
              :include-descendants="includeDescendantOrganizations"
              :global-scope="isAllTenants"
              @select="handleOrganizationSelect"
              @refresh="handleOrganizationRefresh"
              @update:include-descendants="handleIncludeDescendantsChange"
            />
          </aside>
        </template>

        <div class="user-page__table-workspace">
          <BusinessMobileFilterContext
            v-if="!isDesktopOrganizationLayout"
            label="当前组织范围"
            :value="selectedOrganizationLabel"
            action-label="组织筛选"
            @action="openOrganizationDrawer"
          />

          <ArtTableQuery
            ref="tableQueryRef"
            v-model="searchForm"
            :search-items="searchItems"
            :api-fn="fetchTableData"
            :columns-factory="columnsFactory"
            :header-actions="headerActions"
            header-actions-placement="workspace"
            :table-props="tableProps"
            :on-success="handleTableSuccess"
            focusable
            focus-scope-selector=".user-page__workspace"
          />
        </div>
      </ArtWorkspaceSplitter>
    </div>

    <UserDialog ref="userDialogRef" @success="handleSaveSuccess" />
    <UserDetailDrawer ref="userDetailRef" />
    <UserRoleDialog ref="userRoleRef" @success="tableQueryRef?.refreshUpdate()" />
    <ArtDrawer ref="organizationDrawerRef">
      <OrganizationScopeFilter
        class="user-page__drawer-filter"
        :data="organizationTree"
        :loading="organizationFilterLoading"
        :selected-key="selectedOrganizationKey"
        :include-descendants="includeDescendantOrganizations"
        :global-scope="isAllTenants"
        @select="handleOrganizationSelect"
        @refresh="handleOrganizationRefresh"
        @update:include-descendants="handleIncludeDescendantsChange"
      />
    </ArtDrawer>
  </div>
</template>

<script setup lang="ts">
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useMediaQuery } from '@vueuse/core'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import ArtWorkspaceSplitter from '@/components/core/layouts/art-workspace-splitter/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import UserDialog from './modules/user-dialog.vue'
  import UserDetailDrawer from './modules/user-detail-drawer.vue'
  import OrganizationScopeFilter from '../shared/organization-scope-filter.vue'
  import { ElAvatar, ElMessage } from 'element-plus'
  import type { ColumnOption } from '@/types'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction,
    ArtTableQueryHeaderActionContext,
    ArtTableQueryProps,
    ArtTableQueryTableProps
  } from '@/components/core/tables/art-table-query/index.vue'
  import { formatWithDayjs } from '@/utils/time'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import { useUserStore } from '@/store/modules/user'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import {
    deactivateUser,
    fetchUserList,
    fetchUserOrganizationTree,
    resetUser
  } from '@/api/system-manage'
  import ArtButtonMore, { ButtonMoreItem } from '@/components/core/forms/art-button-more/index.vue'
  import UserRoleDialog from '@views/system/user/modules/user-role-dialog.vue'
  import { useSystemParam } from '@/hooks/core/system-param'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessMobileFilterContext from '@/components/business/business-mobile-filter-context/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric
  } from '@/components/business/business-workspace-header/index.vue'
  import TreeUtils from '@/utils/tree'
  import MasterDeleteProcessingNotice from '@/components/business/master-delete-processing-notice/index.vue'
  import { useAuth } from '@/hooks/core/useAuth'

  defineOptions({ name: 'User' })

  const { confirmAction } = useArtFeedback()
  const route = useRoute()

  type UserListItem = Api.SystemManage.UserListItem
  type OrganizationFilterItem = Api.SystemManage.OrganizationScopeFilterItem

  const ALL_ORGANIZATIONS_KEY = '__all_organizations__'
  const UNASSIGNED_ORGANIZATION_KEY = '__unassigned_organization__'

  const userStore = useUserStore()
  const { getDictMap, getUserInfo } = storeToRefs(userStore)
  const { effectiveTenantId, isAllTenants } = storeToRefs(useTenantScopeStore())
  const { loadPasswordPolicy, createTemporaryPassword } = useSystemParam()
  const { hasAuth } = useAuth()
  const organizationTreeUtils = new TreeUtils({
    idKey: 'id',
    parentKey: 'parentId',
    childrenKey: 'children'
  })

  interface UserDialogExpose {
    handleOpen: (row?: Partial<UserListItem>) => Promise<void>
  }

  interface UserRoleDialogExpose {
    handleOpen: (data: UserListItem) => Promise<void>
  }

  interface UserDetailDrawerExpose {
    handleOpen: (data: UserListItem) => Promise<void>
  }

  interface UserOverviewRow {
    status?: unknown
    accountIdentityType?: unknown
    userPhone?: unknown
    userEmail?: unknown
  }

  const tableQueryRef = ref<ArtTableQueryExpose>()
  const userDialogRef = ref<UserDialogExpose>()
  const userDetailRef = ref<UserDetailDrawerExpose>()
  const userRoleRef = ref<UserRoleDialogExpose>()
  const organizationDrawerRef = ref<ArtDrawerExpose<Record<string, never>>>()
  const isDesktopOrganizationLayout = useMediaQuery('(min-width: 1201px)')
  const organizationTree = ref<OrganizationFilterItem[]>([])
  const organizationFilterLoading = ref(false)
  const selectedTenantId = computed(() => effectiveTenantId.value ?? '')
  const selectedOrganizationKey = ref(ALL_ORGANIZATIONS_KEY)
  const includeDescendantOrganizations = ref(true)
  const overview = reactive<{ total: number; rows: UserOverviewRow[] }>({
    total: 0,
    rows: []
  })
  const enabledUserCount = computed(
    () => overview.rows.filter((row) => String(row.status) === '1').length
  )
  const completeContactCount = computed(
    () =>
      overview.rows.filter(
        (row) => String(row.userPhone ?? '').trim() && String(row.userEmail ?? '').trim()
      ).length
  )
  const pendingIdentityCount = computed(
    () => overview.rows.filter((row) => String(row.accountIdentityType) === 'pending_review').length
  )
  const workspaceMetrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '当前结果',
      value: overview.total,
      description: '随筛选条件实时更新',
      icon: 'ri:group-line'
    },
    {
      label: '本页启用',
      value: enabledUserCount.value,
      description: '当前页可正常登录',
      icon: 'ri:user-follow-line',
      tone: 'success'
    },
    {
      label: '联系信息完整',
      value: completeContactCount.value,
      description: '本页已填写手机和邮箱',
      icon: 'ri:contacts-book-2-line',
      tone: 'info'
    },
    {
      label: '本页待确认',
      value: pendingIdentityCount.value,
      description: '历史账号需确认人员身份',
      icon: 'ri:user-search-line',
      tone: pendingIdentityCount.value > 0 ? 'warning' : 'success'
    }
  ])
  const selectedOrganization = computed(() =>
    selectedOrganizationKey.value === ALL_ORGANIZATIONS_KEY ||
    selectedOrganizationKey.value === UNASSIGNED_ORGANIZATION_KEY
      ? null
      : organizationTreeUtils.findNode(organizationTree.value, selectedOrganizationKey.value)
  )
  const selectedOrganizationLabel = computed(() => {
    if (selectedOrganizationKey.value === UNASSIGNED_ORGANIZATION_KEY) return '待归属用户'
    if (selectedOrganizationKey.value === ALL_ORGANIZATIONS_KEY) return '全部用户'
    return selectedOrganization.value?.organizationName ?? '全部用户'
  })
  const selectedOrganizationIds = computed(() => {
    const organization = selectedOrganization.value
    if (!organization?.id) return []
    if (!includeDescendantOrganizations.value) return [organization.id]

    return organizationTreeUtils
      .getDescendants(organizationTree.value, organization.id, true)
      .map((item) => item.id)
      .filter((id): id is string => Boolean(id))
  })

  type SearchParams = Api.SystemManage.UserSearchParams
  type TableParams = SearchParams & Pick<Api.Common.PaginationParams, 'current' | 'size'>

  const searchForm = ref<SearchParams>({
    id: typeof route.query.recordId === 'string' ? route.query.recordId : undefined,
    userName: undefined,
    userGender: undefined,
    userPhone: undefined,
    userEmail: undefined,
    accountIdentityType: undefined,
    status: ''
  })

  const searchItems = computed<SearchFormItem[]>(() => [
    {
      label: '用户名',
      key: 'userName',
      type: 'input',
      placeholder: '请输入用户名',
      clearable: true
    },
    {
      label: '手机号',
      key: 'userPhone',
      type: 'input',
      props: { placeholder: '请输入手机号', maxlength: '11' }
    },
    {
      label: '邮箱',
      key: 'userEmail',
      type: 'input',
      props: { placeholder: '支持输入完整或部分邮箱', clearable: true }
    },
    {
      label: '状态',
      key: 'status',
      type: 'select',
      props: {
        placeholder: '请选择状态',
        options: getDictMap.value.status ?? []
      }
    },
    {
      label: '账号身份',
      key: 'accountIdentityType',
      type: 'select',
      props: {
        clearable: true,
        placeholder: '请选择账号身份',
        options: getDictMap.value.sysUserIdentityType ?? []
      }
    },
    {
      label: '性别',
      key: 'userGender',
      type: 'radioGroup',
      props: {
        options: getDictMap.value.sex ?? []
      }
    }
  ])

  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    {
      type: 'add',
      label: '新增用户',
      permission: 'System:User:Add',
      onClick: () => openDialog()
    },
    {
      type: 'delete',
      label: '批量注销',
      permission: 'System:User:Delete',
      content: ({ selectedCount }: ArtTableQueryHeaderActionContext) =>
        `确定注销选中的 ${selectedCount} 个用户吗？这些账号将不能继续登录，历史业务记录仍会保留。`,
      onClick: handleBatchDelete
    }
  ])

  const tableProps: ArtTableQueryTableProps = {
    rowKey: 'id',
    tableLayout: 'fixed',
    emptyText: '暂无符合条件的用户',
    emptyDescription: '可调整筛选条件，或新增用户后再查看。'
  }

  const fetchTableData = (params: TableParams) => {
    const { from, to } = buildSupabasePageRange({
      current: params.current,
      size: params.size
    })
    return fetchUserList({
      ...params,
      tenantId: selectedTenantId.value || undefined,
      organizationIds: selectedOrganizationIds.value,
      organizationUnassigned: selectedOrganizationKey.value === UNASSIGNED_ORGANIZATION_KEY,
      from,
      to
    })
  }

  const loadOrganizationTree = async (): Promise<void> => {
    organizationFilterLoading.value = true
    try {
      const response = await fetchUserOrganizationTree({
        tenantId: selectedTenantId.value || undefined
      })
      organizationTree.value = response.data ?? []

      if (
        selectedOrganizationKey.value !== ALL_ORGANIZATIONS_KEY &&
        selectedOrganizationKey.value !== UNASSIGNED_ORGANIZATION_KEY &&
        !organizationTreeUtils.findNode(organizationTree.value, selectedOrganizationKey.value)
      ) {
        selectedOrganizationKey.value = ALL_ORGANIZATIONS_KEY
      }
    } finally {
      organizationFilterLoading.value = false
    }
  }

  const refreshUsersFromOrganization = async (): Promise<void> => {
    await tableQueryRef.value?.getData()
  }

  const handleOrganizationSelect = async (key: string): Promise<void> => {
    if (selectedOrganizationKey.value === key) return
    selectedOrganizationKey.value = key
    await refreshUsersFromOrganization()
  }

  const handleIncludeDescendantsChange = async (value: boolean): Promise<void> => {
    includeDescendantOrganizations.value = value
    if (selectedOrganization.value) await refreshUsersFromOrganization()
  }

  const handleOrganizationRefresh = async (): Promise<void> => {
    await loadOrganizationTree()
    await refreshUsersFromOrganization()
  }

  const openOrganizationDrawer = async (): Promise<void> => {
    await organizationDrawerRef.value?.handleOpen(
      {},
      {
        title: '筛选组织范围',
        subtitle: '按组织节点快速定位用户；可选择是否包含全部下级组织。',
        size: 'sm',
        contentHeight: 'calc(100vh - 118px)',
        showFooter: false,
        drawerProps: {
          appendToBody: true,
          bodyClass: 'user-organization-filter-drawer__body'
        }
      }
    )
  }

  const columnsFactory = (): ColumnOption<UserListItem>[] => [
    {
      type: 'selection',
      width: 50,
      fixed: 'left',
      reserveSelection: true,
      selectable: (row: UserListItem) =>
        hasAuth('System:User:Delete') && !isCurrentUser(row) && !isProtectedUser(row)
    },
    { type: 'index', width: 60, label: '序号' },
    {
      prop: 'userInfo',
      label: '用户身份',
      minWidth: 240,
      link: {
        onClick: (row) => userDetailRef.value?.handleOpen(row)
      },
      formatter: (row: UserListItem) => {
        return h('div', { class: 'user-info-cell' }, [
          h(
            ElAvatar,
            {
              class: 'user-info-cell__avatar',
              size: 38,
              src: row.avatar || undefined,
              alt: `${row.nickName || row.userName}的头像`
            },
            () => getAvatarFallback(row)
          ),
          h('div', { class: 'user-info-cell__content' }, [
            h('div', { class: 'user-info-cell__heading' }, [
              h('p', { class: 'user-info-cell__name' }, row.nickName || row.userName),
              getUserInfo.value.email === row.userEmail
                ? h('span', { class: 'user-info-cell__self' }, '当前账号')
                : null
            ]),
            h('p', { class: 'user-info-cell__username', title: row.userName }, `@${row.userName}`)
          ])
        ])
      }
    },
    {
      prop: 'accountIdentityType',
      label: '账号身份',
      minWidth: 116,
      dict: { code: 'sysUserIdentityType', display: 'auto' }
    },
    {
      prop: 'userType',
      label: '用户类型',
      minWidth: 110,
      dict: { code: 'userType', display: 'auto' }
    },
    {
      prop: 'tenant',
      label: '所属租户',
      minWidth: 180,
      formatter: (row: UserListItem) =>
        h('div', { class: 'user-organization-cell' }, [
          h('p', { title: row.tenant?.tenantName }, row.tenant?.tenantName || '--'),
          row.tenant?.tenantCode
            ? h('small', { title: row.tenant.tenantCode }, row.tenant.tenantCode)
            : null
        ])
    },
    {
      prop: 'organization',
      label: '所属组织',
      minWidth: 180,
      formatter: (row: UserListItem) =>
        row.organization
          ? h('div', { class: 'user-organization-cell' }, [
              h(
                'p',
                { title: row.organization.organizationName },
                row.organization.organizationName
              ),
              h(
                'small',
                { title: row.organization.organizationCode },
                row.organization.organizationCode
              )
            ])
          : h('span', { class: 'user-organization-cell__empty' }, '待归入组织')
    },
    {
      prop: 'userRoles',
      label: '角色授权',
      minWidth: 170,
      formatter: (row: UserListItem) => {
        const roles = row.userRoles ?? []
        return roles.length
          ? h('div', { class: 'user-role-cell', title: roles.join('、') }, [
              h('p', null, `${roles.length} 个角色`),
              h('small', null, roles.slice(0, 2).join('、'))
            ])
          : h('span', { class: 'user-role-cell__empty' }, '尚未分配')
      }
    },
    {
      prop: 'userGender',
      label: '性别',
      width: 80,
      sortable: true,
      dict: { code: 'sex', display: 'text' }
    },
    {
      prop: 'contact',
      label: '联系方式',
      minWidth: 220,
      formatter: (row: UserListItem) =>
        h('div', { class: 'user-contact-cell' }, [
          h('p', { class: 'user-contact-cell__phone' }, row.userPhone || '未填写手机号'),
          h(
            'p',
            {
              class: ['user-contact-cell__email', { 'is-empty': !row.userEmail }],
              title: row.userEmail || undefined
            },
            row.userEmail || '未填写邮箱'
          )
        ])
    },
    {
      prop: 'status',
      label: '状态',
      width: 100,
      dict: { code: 'status', display: 'auto' }
    },
    {
      prop: 'createTime',
      label: '创建信息',
      sortable: true,
      minWidth: 190,
      formatter: (row: UserListItem) =>
        h('div', { class: 'user-created-cell' }, [
          h('p', null, formatWithDayjs(row.createTime) || '--'),
          h('small', null, row.createBy || '系统创建')
        ])
    },
    {
      prop: 'operation',
      label: '操作',
      width: 188,
      fixed: 'right',
      formatter: (row: UserListItem) =>
        h(BusinessTableRowActions, null, () => [
          h(ArtButtonTable, {
            type: 'view',
            onClick: () => userDetailRef.value?.handleOpen(row)
          }),
          h(ArtButtonTable, {
            type: 'edit',
            permission: 'System:User:Edit',
            onClick: () => openDialog(row)
          }),
          !isCurrentUser(row) && !isProtectedUser(row)
            ? h(ArtButtonTable, {
                type: 'view',
                icon: 'ri:user-add-line',
                label: '分配角色',
                permission: 'System:User:AssignRole',
                onClick: () => userRoleRef.value?.handleOpen(row)
              })
            : null,
          h(ArtButtonMore, {
            list: () => getMoreActions(row),
            onClick: (item: ButtonMoreItem) => handleButtonMoreClick(item, row)
          })
        ])
    }
  ]

  const getMoreActions = (row: UserListItem): ButtonMoreItem[] => {
    const selfExcludeButtonKeys = ['delete']
    const buttonList: ButtonMoreItem[] = [
      {
        key: 'reset',
        label: '初始化密码',
        icon: 'ri-user-received-line',
        auth: 'System:User:ResetPassword'
      },
      {
        key: 'delete',
        label: '注销用户',
        icon: 'ri:logout-box-r-line',
        color: 'var(--el-color-danger)',
        auth: 'System:User:Delete'
      }
    ]

    if (!isCurrentUser(row) && !isProtectedUser(row)) return buttonList
    return buttonList.filter((item) => !selfExcludeButtonKeys.includes(item.key as string))
  }

  const openDialog = (row?: UserListItem): void => {
    void userDialogRef.value?.handleOpen(row)
  }

  const getAvatarFallback = (row: UserListItem): string => {
    const displayName = (row.nickName || row.userName || '').trim()
    return displayName.slice(0, 1).toUpperCase() || 'U'
  }

  const isCurrentUser = (row: Pick<UserListItem, 'authUserId' | 'userEmail'>): boolean => {
    if (getUserInfo.value.userId && row.authUserId) {
      return getUserInfo.value.userId === row.authUserId
    }
    return Boolean(getUserInfo.value.email && getUserInfo.value.email === row.userEmail)
  }

  const isProtectedUser = (row: Pick<UserListItem, 'systemProtected'>): boolean =>
    row.systemProtected === true

  const handleSaveSuccess = (type: 'add' | 'edit'): void => {
    void (type === 'add'
      ? tableQueryRef.value?.refreshCreate()
      : tableQueryRef.value?.refreshUpdate())
  }

  const handleTableSuccess: NonNullable<ArtTableQueryProps['onSuccess']> = (rows, response) => {
    overview.rows = rows.map((row) => ({
      status: row.status,
      accountIdentityType: row.accountIdentityType,
      userPhone: row.userPhone,
      userEmail: row.userEmail
    }))
    overview.total = response.total ?? rows.length
  }

  const handleButtonMoreClick = (item: ButtonMoreItem, row: UserListItem) => {
    switch (item.key) {
      case 'reset':
        void handleResetPassword(row)
        break
      case 'delete':
        void handleDeleteUser(row)
        break
    }
  }

  const handleResetPassword = async (row: UserListItem): Promise<void> => {
    try {
      await loadPasswordPolicy()
      const password = createTemporaryPassword()
      await confirmAction(
        `即将为「${row.nickName || row.userName}」生成临时密码：${password}。请在安全渠道告知用户。`,
        '初始化登录密码',
        {
          confirmButtonText: '确认重置',
          cancelButtonText: '取消',
          type: 'warning'
        }
      )
      const params: Pick<UserListItem, 'userEmail' | 'password'> = {
        userEmail: row.userEmail,
        password
      }
      await resetUser(params as UserListItem)
    } catch {
      // 用户取消时无需额外提示。
    }
  }

  const handleDeleteUser = async (row: UserListItem): Promise<void> => {
    try {
      await confirmAction(
        `注销后「${row.nickName || row.userName}」将无法继续登录，历史业务记录不会被删除。`,
        '注销用户',
        {
          confirmButtonText: '确认注销',
          cancelButtonText: '取消',
          type: 'warning',
          confirmButtonType: 'danger'
        }
      )
      await deactivateUser(row)
      await tableQueryRef.value?.refreshUpdate()
    } catch {
      // 用户取消时无需额外提示。
    }
  }

  async function handleBatchDelete({
    selectedRows,
    api
  }: ArtTableQueryHeaderActionContext): Promise<void> {
    const rows = selectedRows as UserListItem[]
    let successCount = 0
    const failures: string[] = []

    for (const row of rows) {
      if (isCurrentUser(row) || isProtectedUser(row)) {
        failures.push(`${row.nickName || row.userName}：受保护账号`)
        continue
      }
      try {
        await deactivateUser(row, { showMessage: false })
        successCount += 1
      } catch (error) {
        const reason = getFriendlySupabaseErrorMessage(error, '注销失败')
        failures.push(`${row.nickName || row.userName}：${reason}`)
      }
    }

    if (successCount) await api.refreshRemove()
    if (!failures.length) {
      ElMessage.success(`已注销 ${successCount} 个用户，历史业务记录已保留`)
      return
    }

    const failurePreview = failures.slice(0, 3).join('；')
    const remaining = failures.length > 3 ? `；另有 ${failures.length - 3} 项失败` : ''
    const message = `${successCount ? `成功 ${successCount} 项，` : ''}失败 ${failures.length} 项：${failurePreview}${remaining}`
    if (successCount) ElMessage.warning(message)
    else ElMessage.error(message)
  }

  onMounted(async () => {
    await Promise.all([userStore.ensureDictLoaded('sysUserIdentityType'), loadOrganizationTree()])
  })

  watch(
    () => route.query.recordId,
    (recordId) => {
      selectedOrganizationKey.value = ALL_ORGANIZATIONS_KEY
      Object.assign(searchForm.value, {
        id: typeof recordId === 'string' ? recordId : undefined,
        userName: undefined,
        userGender: undefined,
        userPhone: undefined,
        userEmail: undefined,
        accountIdentityType: undefined,
        status: ''
      })
      void tableQueryRef.value?.refreshCreate()
    }
  )
</script>

<style scoped lang="scss">
  .user-page {
    gap: 12px;
    min-width: 0;

    &__overview {
      flex: 0 0 auto;
      min-width: 0;
      overflow: hidden;
    }

    &__workspace {
      flex: 1 1 auto;
      width: 100%;
      min-width: 0;
      min-height: 0;
    }

    &__organization-panel,
    &__table-workspace {
      min-width: 0;
      min-height: 0;
    }

    &__organization-panel {
      height: 100%;
      overflow: hidden;
    }

    &__table-workspace {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    &__drawer-filter {
      height: 100%;
      border: 0;
      border-radius: 0;
    }

    :deep(.user-info-cell) {
      display: flex;
      align-items: center;
      min-width: 0;
    }

    :deep(.user-info-cell__avatar) {
      flex: 0 0 38px;
      font-size: 14px;
      font-weight: 700;
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
      border: 1px solid var(--el-color-primary-light-7);
    }

    :deep(.user-info-cell__content) {
      min-width: 0;
      margin-left: 10px;
      line-height: 20px;
    }

    :deep(.user-info-cell__heading) {
      display: flex;
      gap: 6px;
      align-items: center;
      min-width: 0;
    }

    :deep(.user-info-cell__name),
    :deep(.user-info-cell__username),
    :deep(.user-contact-cell p) {
      max-width: 100%;
      margin: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    :deep(.user-info-cell__name) {
      min-width: 0;
      font-weight: 600;
      color: var(--el-text-color-primary);
    }

    :deep(.user-info-cell__username),
    :deep(.user-contact-cell__email) {
      font-size: 12px;
      color: var(--el-text-color-secondary);
    }

    :deep(.user-info-cell__self) {
      flex: none;
      padding: 1px 6px;
      font-size: 11px;
      line-height: 18px;
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
      border-radius: 999px;
    }

    :deep(.user-contact-cell) {
      min-width: 0;
      line-height: 20px;
    }

    :deep(.user-contact-cell__phone) {
      color: var(--el-text-color-primary);
    }

    :deep(.user-contact-cell .is-empty) {
      color: var(--el-text-color-placeholder);
    }

    :deep(.user-role-cell),
    :deep(.user-organization-cell),
    :deep(.user-created-cell) {
      display: grid;
      min-width: 0;
      line-height: 20px;

      p,
      small {
        margin: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      p {
        color: var(--el-text-color-primary);
      }

      small {
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }
    }

    :deep(.user-role-cell__empty) {
      font-size: 12px;
      color: var(--el-color-warning-dark-2);
    }

    :deep(.user-organization-cell__empty) {
      font-size: 12px;
      color: var(--el-text-color-placeholder);
    }
  }

  :global(.user-organization-filter-drawer__body) {
    --art-drawer-content-padding: 0;

    padding: 0 !important;
    overflow: hidden !important;
  }
</style>
