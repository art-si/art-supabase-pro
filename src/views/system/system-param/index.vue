<template>
  <div class="system-param-page business-workspace-page art-full-height">
    <BusinessWorkspaceHeader
      density="compact"
      eyebrow="SYSTEM GOVERNANCE"
      title="参数设置"
      description="统一管理系统运行参数、登录体验、安全策略与审计策略。支持分组维护、内置保护、缓存刷新与按键名读取，便于后续业务模块复用。"
      icon="ri:settings-4-line"
      :tags="[
        {
          label: canManage ? '已授权维护' : '安全只读视图',
          type: canManage ? 'primary' : 'info'
        },
        { label: `缓存项：${overview.stats.total}` },
        { label: `最近刷新：${overview.lastRefreshText}` }
      ]"
      :metrics="overview.statCards"
    >
      <template #actions>
        <BusinessTableWorkspaceActions :table="tableQueryRef" />
      </template>
    </BusinessWorkspaceHeader>

    <div class="system-param-page__groups art-card-xs">
      <ElSegmented
        :model-value="table.searchQuery.groupCode"
        :options="groupSegmentOptions"
        @change="handleGroupFilter"
      />
    </div>

    <ArtTableQuery
      ref="tableQueryRef"
      focusable
      v-model="table.searchQuery"
      :search-items="table.searchItems"
      :api-fn="fetchTableData"
      :columns-factory="columnsFactory"
      :header-actions="table.headerActions"
      header-actions-placement="workspace"
      :table-header-props="{ layout: 'refresh,size,fullscreen,columns,settings' }"
      :table-props="tableProps"
    />

    <SystemParamDialog ref="dialogRef" @success="handleSaveSuccess" />
  </div>
</template>

<script setup lang="tsx">
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { ElMessage } from 'element-plus'
  import { omit } from 'lodash-es'
  import type { ComputedRef, UnwrapNestedRefs } from 'vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric
  } from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction,
    ArtTableQueryHeaderActionContext,
    ArtTableQueryTableProps
  } from '@/components/core/tables/art-table-query/index.vue'
  import type { ColumnOption, DialogType } from '@/types'
  import {
    deleteSystemParam,
    deleteSystemParamBatch,
    fetchSystemParamList,
    fetchSystemParamStats
  } from '@/api/system-manage/system-param'
  import { clearSystemParamCache } from '@/hooks/core/system-param/read-system-param'
  import { loadAppearanceConfig } from '@/hooks/core/useAppearanceConfig'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useUserStore } from '@/store/modules/user'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import { formatWithDayjs } from '@/utils/time'
  import SystemParamDialog from './modules/system-param-dialog.vue'

  defineOptions({ name: 'SystemParam' })

  const { confirmAction } = useArtFeedback()

  type SystemParam = Api.SystemManage.SystemParamItem
  type SearchParams = Api.SystemManage.SystemParamSearchParams
  type TableParams = SearchParams & Pick<Api.Common.PaginationParams, 'current' | 'size'>

  interface DialogExpose {
    handleOpen: (row?: SystemParam) => Promise<void>
  }

  interface OverviewGroup {
    stats: Api.SystemManage.SystemParamStats
    lastRefreshText: ComputedRef<string>
    statCards: ComputedRef<BusinessWorkspaceMetric[]>
  }

  interface TableGroup {
    searchQuery: SearchParams
    searchItems: ComputedRef<SearchFormItem[]>
    headerActions: ComputedRef<ArtTableQueryHeaderAction[]>
  }

  const tableQueryRef = ref<ArtTableQueryExpose>()
  const dialogRef = ref<DialogExpose>()
  const userStore = useUserStore()
  const { getDictMap, getUserInfo, isPlatformSuper } = storeToRefs(userStore)
  const { hasAuth, hasAnyAuth } = useAuth()
  const canManage = computed(() =>
    hasAnyAuth(['System:SystemParam:Add', 'System:SystemParam:Edit', 'System:SystemParam:Delete'])
  )
  const isWritableRow = (row: SystemParam): boolean =>
    isPlatformSuper.value || row.tenantId === getUserInfo.value.tenantId
  const groupOptions = computed(() => getDictMap.value.systemParamGroup ?? [])
  const typeOptions = computed(() => getDictMap.value.systemParamType ?? [])

  const overview: UnwrapNestedRefs<OverviewGroup> = reactive<OverviewGroup>({
    stats: {
      total: 0,
      enabled: 0,
      builtin: 0,
      groups: 0,
      groupCounts: {},
      lastRefreshTime: undefined
    },
    lastRefreshText: computed(() =>
      overview.stats.lastRefreshTime ? formatWithDayjs(overview.stats.lastRefreshTime) || '-' : '-'
    ),
    statCards: computed(() => [
      {
        label: '参数总量',
        value: overview.stats.total,
        description: '包括内置参数与业务扩展参数',
        icon: 'ri:database-2-line',
        tone: 'primary'
      },
      {
        label: '启用参数',
        value: overview.stats.enabled,
        description: '当前会参与读取和缓存的有效参数',
        icon: 'ri:checkbox-circle-line',
        tone: 'success'
      },
      {
        label: '内置参数',
        value: overview.stats.builtin,
        description: '平台基础参数，建议谨慎修改',
        icon: 'ri:shield-keyhole-line',
        tone: 'warning'
      },
      {
        label: '参数分组',
        value: overview.stats.groups,
        description: '可按业务域划分不同配置命名空间',
        icon: 'ri:folder-settings-line',
        tone: 'info'
      }
    ])
  })

  const groupSegmentOptions = computed(() => [
    {
      label: `全部分组 (${overview.stats.total})`,
      value: ''
    },
    ...groupOptions.value.map((group) => {
      const value = String(group.value)
      return {
        label: `${group.label} (${overview.stats.groupCounts[value] ?? 0})`,
        value
      }
    })
  ])

  const table: UnwrapNestedRefs<TableGroup> = reactive<TableGroup>({
    searchQuery: {
      keyword: '',
      groupCode: '',
      paramType: undefined
    },
    searchItems: computed<SearchFormItem[]>(() => [
      {
        label: '关键字',
        key: 'keyword',
        type: 'input',
        props: {
          clearable: true,
          placeholder: '搜索参数名称、键名或说明'
        }
      },
      {
        label: '参数类型',
        key: 'paramType',
        type: 'select',
        props: {
          clearable: true,
          placeholder: '请选择参数类型',
          options: typeOptions.value
        }
      }
    ]),
    headerActions: computed<ArtTableQueryHeaderAction[]>(
      () =>
        [
          {
            type: 'add',
            label: '新增参数',
            permission: 'System:SystemParam:Add',
            onClick: () => openDialog()
          },
          {
            type: 'delete',
            permission: 'System:SystemParam:Delete',
            disabled: ({ selectedRows }) => selectedRows.every((row) => Boolean(row.builtin)),
            content: ({ selectedRows }: ArtTableQueryHeaderActionContext) => {
              const removableCount = selectedRows.filter((row) => !row.builtin).length
              return `确定删除选中的 ${removableCount} 个非内置参数吗？内置参数会被自动跳过。`
            },
            onClick: async ({ selectedRows }) => {
              const ids = selectedRows
                .filter((row) => !row.builtin)
                .map((row) => String(row.id))
                .filter(Boolean)
              if (!ids.length) {
                ElMessage.warning('请选择非内置参数')
                return
              }
              await deleteSystemParamBatch(ids)
              await refreshAfterRemove()
            }
          },
          {
            key: 'refresh-cache',
            label: '刷新缓存',
            icon: 'ri:refresh-line',
            buttonProps: { plain: true },
            onClick: async () => {
              await userStore.fetchDictList()
              clearSystemParamCache()
              await refreshPage()
              ElMessage.success('缓存已刷新')
            }
          }
        ] as ArtTableQueryHeaderAction[]
    )
  })

  const tableProps: ArtTableQueryTableProps = {
    rowKey: 'id',
    tableLayout: 'fixed',
    height: '100%',
    showOverflowTooltip: true,
    emptyText: '暂无符合条件的系统参数',
    emptyDescription: '可调整分组或筛选条件；平台管理员也可以新增业务扩展参数。'
  }

  const fetchTableData = (params: TableParams) => {
    const { from, to } = buildSupabasePageRange({
      current: params.current,
      size: params.size
    })
    return fetchSystemParamList({
      ...params,
      from,
      to
    })
  }

  const columnsFactory = (): ColumnOption<SystemParam>[] =>
    [
      {
        type: 'selection',
        width: 50,
        fixed: 'left',
        reserveSelection: true,
        selectable: (row: SystemParam) =>
          hasAuth('System:SystemParam:Delete') && isWritableRow(row) && !row.builtin
      },
      {
        prop: 'paramIdentity',
        label: '参数定义',
        minWidth: 270,
        formatter: (row) => (
          <div class="system-param-identity-cell">
            <span
              class={['system-param-identity-cell__icon', { 'is-builtin': row.builtin }]}
              aria-hidden="true"
            >
              <ArtSvgIcon icon={row.builtin ? 'ri:shield-keyhole-line' : 'ri:settings-3-line'} />
            </span>
            <div class="system-param-identity-cell__copy">
              <div class="system-param-identity-cell__heading">
                <strong title={row.paramName}>{row.paramName}</strong>
                <span class={['system-param-identity-cell__badge', { 'is-builtin': row.builtin }]}>
                  {row.builtin ? '内置' : '自定义'}
                </span>
              </div>
              <code title={row.paramKey} translate="no">
                {row.paramKey}
              </code>
            </div>
          </div>
        )
      },
      {
        prop: 'classification',
        label: '分类',
        minWidth: 156,
        formatter: (row) => (
          <div class="system-param-class-cell">
            <ArtDictDisplay dictCode="systemParamGroup" value={row.groupCode} display="text" />
            <ArtDictDisplay dictCode="systemParamType" value={row.paramType} display="tag" />
          </div>
        )
      },
      {
        prop: 'paramValue',
        label: '当前值与说明',
        minWidth: 220,
        formatter: (row) => (
          <div class="system-param-value-cell">
            {row.paramType === 'boolean' ? (
              <ArtDictDisplay
                dictCode="commonBoolean"
                value={String(row.paramValue === 'true')}
                display="tag"
              />
            ) : (
              <code title={row.paramValue} translate="no">
                {row.paramValue || '--'}
              </code>
            )}
            <small title={row.remark || ''}>{row.remark || '暂无补充说明'}</small>
          </div>
        )
      },
      {
        prop: 'enabled',
        label: '是否启用',
        width: 92,
        formatter: (row) => (
          <ArtDictDisplay
            dictCode="commonBoolean"
            value={String(row.enabled ?? '')}
            display="tag"
          />
        )
      },
      {
        prop: 'updateTime',
        label: '更新信息',
        minWidth: 174,
        formatter: (row) => (
          <div class="system-param-update-cell">
            <span>{formatWithDayjs(row.updateTime) || '--'}</span>
            <small>{row.updateBy || '系统维护'}</small>
          </div>
        )
      },
      {
        prop: 'operation',
        label: '操作',
        width: 120,
        fixed: 'right',
        formatter: (row) =>
          isWritableRow(row) ? (
            <div class="inline-flex items-center gap-2">
              <ArtButtonTable
                type="edit"
                permission="System:SystemParam:Edit"
                onClick={() => openDialog(row)}
              />
              <ArtButtonTable
                type="delete"
                permission="System:SystemParam:Delete"
                disabled={row.builtin}
                onClick={() => void handleDelete(row)}
              />
            </div>
          ) : null
      }
    ] as ColumnOption<SystemParam>[]

  const openDialog = (row?: SystemParam): void => {
    void dialogRef.value?.handleOpen(row ? (omit(row, []) as SystemParam) : undefined)
  }

  const handleDelete = async (row: SystemParam): Promise<void> => {
    if (!row.id || row.builtin) {
      ElMessage.warning('内置参数不允许删除')
      return
    }

    try {
      await confirmAction(`确定删除参数“${row.paramName}”吗？删除后无法恢复。`, '删除确认', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonType: 'danger'
      })
      await deleteSystemParam(row.id)
      await refreshAfterRemove()
    } catch {
      // 用户取消删除，无需提示。
    }
  }

  const handleGroupFilter = async (groupCode: string | number): Promise<void> => {
    table.searchQuery.groupCode = String(groupCode)
    await tableQueryRef.value?.getData()
  }

  const loadStats = async (): Promise<void> => {
    const { data } = await fetchSystemParamStats()
    Object.assign(overview.stats, data, {
      lastRefreshTime: data.lastRefreshTime || new Date().toISOString()
    })
  }

  const refreshPage = async (): Promise<void> => {
    await Promise.all([tableQueryRef.value?.refreshData(), loadStats()])
  }

  const refreshAfterRemove = async (): Promise<void> => {
    clearSystemParamCache()
    await Promise.all([tableQueryRef.value?.refreshRemove(), loadStats()])
  }

  const handleSaveSuccess = (type: DialogType): void => {
    clearSystemParamCache()
    void loadAppearanceConfig()
    void Promise.all([
      type === 'add' ? tableQueryRef.value?.refreshCreate() : tableQueryRef.value?.refreshUpdate(),
      loadStats()
    ])
  }

  onMounted(() => {
    void userStore.ensureDictLoaded('systemParamGroup')
    void userStore.ensureDictLoaded('systemParamType')
    void loadStats()
  })
</script>

<style scoped lang="scss">
  .system-param-page {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;

    &__groups {
      padding: 8px 12px;
    }

    :deep(.system-param-identity-cell) {
      display: flex;
      gap: 10px;
      align-items: center;
      min-width: 0;

      .system-param-identity-cell__icon {
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

        &.is-builtin {
          color: var(--el-color-warning-dark-2);
          background: var(--el-color-warning-light-9);
          border-color: var(--el-color-warning-light-7);
        }
      }

      .system-param-identity-cell__copy,
      .system-param-identity-cell__heading {
        min-width: 0;
      }

      .system-param-identity-cell__heading {
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

      code {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 12px;
        color: var(--el-text-color-secondary);
        white-space: nowrap;
      }

      .system-param-identity-cell__badge {
        flex: none;
        padding: 1px 6px;
        font-size: 10px;
        line-height: 17px;
        color: var(--el-text-color-secondary);
        background: var(--el-fill-color-light);
        border-radius: 999px;

        &.is-builtin {
          color: var(--el-color-warning-dark-2);
          background: var(--el-color-warning-light-9);
        }
      }
    }

    :deep(.system-param-class-cell),
    :deep(.system-param-value-cell),
    :deep(.system-param-update-cell) {
      display: grid;
      gap: 3px;
      align-items: start;
      min-width: 0;
    }

    :deep(.system-param-class-cell) {
      justify-items: start;
    }

    :deep(.system-param-value-cell) {
      code,
      small {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      code {
        color: var(--el-text-color-primary);
      }

      small {
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }
    }

    :deep(.system-param-update-cell) {
      span,
      small {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      small {
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }
    }

    :deep(.art-table-query) {
      flex: 1;
      min-height: 0;
    }

    &__groups :deep(.el-segmented) {
      --el-segmented-item-selected-color: var(--el-color-white);
      --el-segmented-item-selected-bg-color: var(--el-color-primary);

      max-width: 100%;

      .el-segmented__group {
        flex-wrap: wrap;
      }

      .el-segmented__item {
        color: var(--el-color-primary);

        &.is-selected {
          color: var(--el-color-white);
        }
      }
    }
  }
</style>
