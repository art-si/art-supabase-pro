<template>
  <ArtDrawer ref="drawerRef" size="lg" :show-footer="false">
    <div v-if="user" class="user-detail">
      <section class="user-detail__hero art-card-xs">
        <ElAvatar :size="52" :src="user.avatar || undefined">
          {{ avatarFallback }}
        </ElAvatar>
        <div class="user-detail__hero-copy">
          <div class="user-detail__title-row">
            <h2>{{ user.nickName || user.userName }}</h2>
            <ElTag :type="user.status === '1' ? 'success' : 'info'" effect="light">
              {{ user.status === '1' ? '启用' : '停用' }}
            </ElTag>
            <ElTag v-if="isCurrentUser" type="primary" effect="plain">当前账号</ElTag>
          </div>
          <p>@{{ user.userName }}</p>
          <span class="art-icon-label"
            ><ArtSvgIcon icon="ri:mail-line" />{{ user.userEmail || '未填写邮箱' }}</span
          >
        </div>
      </section>

      <ArtSectionCard title="账号与归属" preserve-content-structure>
        <ArtDescriptions :data="user" :items="accountItems" :columns="2" />
      </ArtSectionCard>

      <ArtSectionCard
        title="员工档案关联"
        subtitle="该关联用于人员配置、班组排班和“我的排班”等个人业务。"
        preserve-content-structure
      >
        <ArtDescriptions :data="user" :items="employeeItems" :columns="2" />
      </ArtSectionCard>

      <ArtSectionCard title="联系与审计" preserve-content-structure>
        <ArtDescriptions :data="user" :items="auditItems" :columns="2" />
      </ArtSectionCard>
    </div>
  </ArtDrawer>
</template>

<script setup lang="ts">
  import { ElTag } from 'element-plus'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import { useUserStore } from '@/store/modules/user'
  import { formatWithDayjs } from '@/utils/time'

  type UserListItem = Api.SystemManage.UserListItem

  const drawerRef = ref<ArtDrawerExpose<UserListItem>>()
  const user = shallowRef<UserListItem>()
  const { getUserInfo } = storeToRefs(useUserStore())

  const avatarFallback = computed(() =>
    String(user.value?.nickName || user.value?.userName || 'U')
      .slice(0, 1)
      .toUpperCase()
  )
  const isCurrentUser = computed(
    () =>
      Boolean(getUserInfo.value.userId && user.value?.authUserId) &&
      getUserInfo.value.userId === user.value?.authUserId
  )

  const accountItems: ArtDescriptionItem<UserListItem>[] = [
    {
      key: 'identityType',
      label: '账号身份',
      field: 'accountIdentityType',
      dictCode: 'sysUserIdentityType'
    },
    { key: 'userType', label: '用户类型', field: 'userType', dictCode: 'userType' },
    { key: 'tenant', label: '所属租户', value: (row: UserListItem) => row.tenant?.tenantName },
    {
      key: 'organization',
      label: '所属组织',
      value: (row: UserListItem) => row.organization?.organizationName
    },
    {
      key: 'roles',
      label: '角色授权',
      value: (row: UserListItem) => row.userRoles?.join('、') || '尚未分配',
      span: 2
    },
    { key: 'remark', label: '备注 / 用途', field: 'remark', span: 2 }
  ]

  const employeeItems: ArtDescriptionItem<UserListItem>[] = [
    {
      key: 'employeeStatus',
      label: '关联状态',
      value: (row: UserListItem) => Boolean(row.hrEmployee),
      render: (value) =>
        h(ElTag, { type: value ? 'success' : 'warning', effect: 'light', size: 'small' }, () =>
          value ? '已关联员工' : '尚未关联'
        )
    },
    {
      key: 'employeeNo',
      label: '员工工号',
      value: (row: UserListItem) => row.hrEmployee?.employeeNo
    },
    {
      key: 'employeeName',
      label: '员工姓名',
      value: (row: UserListItem) => row.hrEmployee?.employeeName
    },
    {
      key: 'jobTitle',
      label: '岗位',
      value: (row: UserListItem) => row.hrEmployee?.jobTitle
    },
    {
      key: 'employeeOrganization',
      label: '员工所属组织',
      value: (row: UserListItem) => row.hrEmployee?.organization?.organizationName
    },
    {
      key: 'employmentStatus',
      label: '在职状态',
      value: (row: UserListItem) => row.hrEmployee?.employmentStatus
    }
  ]

  const auditItems: ArtDescriptionItem<UserListItem>[] = [
    { key: 'phone', label: '手机号', field: 'userPhone', copyable: true },
    { key: 'email', label: '邮箱', field: 'userEmail', copyable: true },
    { key: 'createdBy', label: '创建人', field: 'createBy' },
    {
      key: 'createdAt',
      label: '创建时间',
      value: (row: UserListItem) => formatWithDayjs(row.createTime) || '--'
    },
    { key: 'updatedBy', label: '最后编辑人', field: 'updateBy' },
    {
      key: 'updatedAt',
      label: '最后编辑时间',
      value: (row: UserListItem) => formatWithDayjs(row.updateTime) || '--'
    },
    { key: 'id', label: '用户 ID', field: 'id', span: 2, copyable: true }
  ]

  async function handleOpen(row: UserListItem): Promise<void> {
    user.value = row
    await drawerRef.value?.handleOpen(row, {
      title: '用户详情',
      subtitle: '查看账号身份、员工关联、组织角色与审计信息。',
      contentHeight: 'calc(100vh - 126px)',
      scrollbarAlways: true,
      showFooter: false,
      drawerProps: { resizable: true },
      onReset: () => {
        user.value = undefined
      }
    })
  }

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .user-detail {
    display: grid;
    gap: 16px;
    min-width: 0;

    &__hero {
      display: flex;
      gap: 14px;
      align-items: center;
      min-width: 0;
      padding: 18px;

      .el-avatar {
        flex: none;
        font-weight: 700;
        color: var(--el-color-primary);
        background: var(--el-color-primary-light-9);
        border: 1px solid var(--el-color-primary-light-7);
      }
    }

    &__hero-copy {
      display: grid;
      gap: 4px;
      min-width: 0;

      h2,
      p {
        margin: 0;
      }

      p,
      span {
        color: var(--el-text-color-secondary);
      }

      > span {
        display: inline-flex;
        gap: 6px;
        align-items: center;
        min-width: 0;
        overflow-wrap: anywhere;
      }
    }

    &__title-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
  }
</style>
