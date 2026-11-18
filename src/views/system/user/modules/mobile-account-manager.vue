<template>
  <ArtDrawer ref="drawerRef">
    <div class="flex h-[calc(100dvh-180px)] min-h-[360px] flex-col gap-4">
      <ElAlert
        title="司机使用已有个人账号关联司机档案；货主为每位联系人单独开通账号。手机号绑定需由本人登录后完成。"
        type="info"
        :closable="false"
        show-icon
      />
      <ArtTableQuery
        ref="tableRef"
        class="min-h-0 flex-1"
        :api-fn="fetchRecords"
        :search-items="searchItems"
        :columns-factory="columnsFactory"
        :header-actions="headerActions"
        :table-props="{
          rowKey: 'authUserId',
          emptyText: '尚未开通移动端账号',
          emptyDescription: '可关联已有司机用户，或为货主联系人新建个人账号。'
        }"
      />
    </div>
  </ArtDrawer>
  <MobileAccountDialog ref="dialogRef" @success="tableRef?.refreshData()" />
</template>

<script setup lang="ts">
  import { computed, h, ref } from 'vue'
  import { ElAlert, ElMessage, ElTag } from 'element-plus'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtTableQuery, {
    type ArtTableQueryExpose,
    type ArtTableQueryHeaderAction
  } from '@/components/core/tables/art-table-query/index.vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import type { ColumnOption } from '@/types'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { useAuth } from '@/hooks/core/useAuth'
  import {
    fetchMobileAccounts,
    fetchMobileAccountTarget,
    type MobileAccountKind,
    type MobileAccountRecord
  } from '@/api/system-manage/mobile-account'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import { useUserStore } from '@/store/modules/user'
  import MobileAccountDialog from './mobile-account-dialog.vue'

  const drawerRef = ref<ArtDrawerExpose<Record<string, never>>>()
  const tableRef = ref<ArtTableQueryExpose>()
  const dialogRef = ref<InstanceType<typeof MobileAccountDialog>>()
  const tenantScope = useTenantScopeStore()
  const userStore = useUserStore()
  const { hasAuth } = useAuth()
  const searchItems: SearchFormItem[] = [
    {
      key: 'keyword',
      label: '账号 / 业务对象',
      type: 'input',
      props: { clearable: true, placeholder: '姓名、邮箱、手机号或客户名称' }
    },
    {
      key: 'kind',
      label: '客户端',
      type: 'select',
      props: {
        clearable: true,
        options: [
          { label: '司机端', value: 'driver' },
          { label: '货主端', value: 'shipper' }
        ]
      }
    }
  ]
  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    {
      type: 'add',
      label: '新建货主账号',
      permission: 'System:User:Add',
      onClick: () => dialogRef.value?.handleOpen({ mode: 'create', kind: 'shipper' })
    },
    {
      key: 'link-driver',
      permission: 'System:User:ManageMobile',
      label: '关联司机用户',
      onClick: () => dialogRef.value?.handleOpen({ mode: 'link', kind: 'driver' })
    }
  ])
  const columnsFactory = (): ColumnOption<MobileAccountRecord>[] => [
    {
      prop: 'displayName',
      label: '个人账号',
      minWidth: 200,
      formatter: (row) =>
        h('div', { class: 'flex min-w-0 flex-col gap-1' }, [
          h('strong', { class: 'truncate', title: row.displayName }, row.displayName),
          h(
            'span',
            { class: 'truncate text-xs text-[var(--art-gray-600)]', title: row.email },
            row.email
          )
        ])
    },
    {
      prop: 'kind',
      label: '客户端',
      width: 90,
      formatter: (row) => (row.kind === 'driver' ? '司机端' : '货主端')
    },
    {
      prop: 'business',
      label: '关联业务对象',
      minWidth: 220,
      formatter: (row) =>
        h('div', { class: 'flex min-w-0 flex-col gap-1' }, [
          h(
            'span',
            { class: 'truncate', title: row.driverName ?? row.customerName ?? '' },
            row.driverName ?? row.customerName ?? '待关联'
          ),
          h(
            'span',
            {
              class: 'truncate text-xs text-[var(--art-gray-600)]',
              title: row.carrierName ?? row.tenantName
            },
            row.carrierName ?? row.tenantName
          )
        ])
    },
    {
      prop: 'phone',
      label: '登录手机号',
      minWidth: 140,
      formatter: (row) => row.phone || '未登记'
    },
    {
      prop: 'wechatBound',
      label: '微信手机号',
      width: 120,
      formatter: (row) => (row.wechatBound ? '已绑定' : '待本人绑定')
    },
    {
      prop: 'enabled',
      label: '访问状态',
      width: 110,
      formatter: (row) =>
        h(
          ElTag,
          { type: row.enabled && row.accountEnabled ? 'success' : 'info', effect: 'light' },
          () => (!row.accountEnabled ? '账号停用' : row.enabled ? '已开通' : '客户端停用')
        )
    },
    {
      prop: 'operation',
      label: '操作',
      width: 108,
      fixed: 'right',
      formatter: (row) =>
        h(BusinessTableRowActions, null, () => [
          h(ArtButtonTable, {
            type: 'edit',
            label: '编辑业务关联',
            permission: 'System:User:ManageMobile',
            onClick: () =>
              dialogRef.value?.handleOpen({ mode: 'edit', kind: row.kind, record: row })
          }),
          hasAuth('System:User:ResetPassword') && row.userId !== userStore.getUserInfo.userId
            ? h(ArtButtonTable, {
                type: 'view',
                icon: 'ri:key-2-line',
                label: '重置密码',
                permission: 'System:User:ResetPassword',
                onClick: () =>
                  dialogRef.value?.handleOpen({ mode: 'reset', kind: row.kind, record: row })
              })
            : null
        ])
    }
  ]
  const fetchRecords = (params: Parameters<typeof fetchMobileAccounts>[0]) =>
    fetchMobileAccounts({ ...params, tenantId: tenantScope.effectiveTenantId ?? undefined })
  async function handleOpen() {
    await drawerRef.value?.handleOpen(
      {},
      {
        title: '移动端账号',
        subtitle: '统一开通、关联和停用司机端与货主端个人账号。',
        size: 'xl',
        showFooter: false,
        contentHeight: 'calc(100vh - 140px)'
      }
    )
    await tableRef.value?.refreshData()
  }
  function handleUser(data: { tenantId: string; authUserId: string; userId: string }) {
    return dialogRef.value?.handleOpen({ ...data, mode: 'link', kind: 'driver' })
  }
  async function handleAccount(authUserId: string, kind: MobileAccountKind) {
    try {
      const result = await fetchMobileAccountTarget(authUserId, kind)
      if (result.data)
        await dialogRef.value?.handleOpen({ mode: 'edit', kind, record: result.data })
    } catch (error) {
      ElMessage.error(getFriendlySupabaseErrorMessage(error, '账号关联加载失败，请重试'))
    }
  }
  defineExpose({ handleOpen, handleUser, handleAccount })
</script>
