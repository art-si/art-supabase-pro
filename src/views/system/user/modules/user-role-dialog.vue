<template>
  <ArtDialog ref="dialogRef" size="sm">
    <div class="user-role-dialog">
      <ArtEntitySummary
        compact
        :title="userContext?.nickName || userContext?.userName || '未选择用户'"
        :description="userContext?.userEmail || '暂无登录邮箱'"
      >
        <template #icon>
          <ElAvatar :size="34" :src="userContext?.avatar || undefined">
            {{ userAvatarFallback }}
          </ElAvatar>
        </template>
        <template #aside>
          <ElTag type="primary" effect="light" round>已选 {{ selectedRoleCount }} 项</ElTag>
        </template>
      </ArtEntitySummary>

      <ElAlert
        class="user-role-dialog__notice"
        title="保存后，新角色权限将在用户下次刷新菜单或重新登录时生效。"
        type="info"
        :closable="false"
        show-icon
      />

      <ArtForm
        ref="formRef"
        v-model="formData"
        :items="formItems"
        :rules="rules"
        :span="24"
        :gutter="20"
        label-width="96px"
        :show-reset="false"
        :show-submit="false"
      />
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import { cloneDeep } from 'lodash-es'
  import { ElMessage, type FormRules } from 'element-plus'
  import { assignUserRoles, fetchEnabledRoleList } from '@/api/system-manage'
  import { useUserStore } from '@/store/modules/user'

  type UserListItem = Api.SystemManage.UserListItem
  type UserRoleFormData = Pick<UserListItem, 'userRoles' | 'id' | 'tenantId'>

  interface Emits {
    (e: 'success'): void
  }

  const emit = defineEmits<Emits>()
  const userStore = useUserStore()
  const { getUserInfo, isPlatformSuper } = storeToRefs(userStore)
  const dialogRef = ref<ArtDialogExpose<UserListItem>>()
  const formRef = ref()
  const rules: FormRules = {}

  const createInitialForm = (): UserRoleFormData => ({
    userRoles: []
  })

  const formData = ref<UserRoleFormData>(createInitialForm())
  const userContext = shallowRef<UserListItem>()
  const currentTenantId = computed(() => getUserInfo.value.tenantId)
  const roleQueryTenantId = computed(() =>
    isPlatformSuper.value ? formData.value.tenantId : currentTenantId.value
  )
  const selectedRoleCount = computed(() => formData.value.userRoles?.length ?? 0)
  const userAvatarFallback = computed(() => {
    const displayName = (userContext.value?.nickName || userContext.value?.userName || '').trim()
    return displayName.slice(0, 1).toUpperCase() || 'U'
  })

  const formItems = computed<FormItem[]>(() => [
    {
      label: '已分配角色',
      key: 'userRoles',
      type: 'select',
      api: fetchEnabledRoleList,
      params: {
        tenantId: roleQueryTenantId.value
      },
      shouldFetch: (params) => Boolean(params?.tenantId),
      resultField: 'data',
      labelField: 'roleName',
      valueField: 'roleCode',
      props: {
        multiple: true,
        filterable: true,
        collapseTags: true,
        collapseTagsTooltip: true,
        maxCollapseTags: 3,
        disabled: !roleQueryTenantId.value,
        placeholder: roleQueryTenantId.value ? '请选择角色' : '当前用户未绑定租户'
      },
      description: '支持多选；请仅分配与当前岗位职责直接相关的角色。'
    }
  ])

  const resetForm = async (): Promise<void> => {
    formData.value = cloneDeep(createInitialForm())
    userContext.value = undefined
    await nextTick()
    formRef.value?.ref?.value?.clearValidate()
  }

  const handleSubmit = async (): Promise<boolean> => {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
    } catch (error) {
      notifyFriendlyError(error, '表单校验未完成，请稍后重试', 'warning')
      return false
    }

    try {
      const tenantId = roleQueryTenantId.value
      if (!formData.value.id || !tenantId) {
        ElMessage.warning('用户或所属租户信息缺失，请关闭后重新打开')
        return false
      }
      await assignUserRoles({
        id: formData.value.id,
        tenantId,
        userRoles: [...(formData.value.userRoles ?? [])]
      })
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '角色分配失败，请检查用户与租户后重试', 'warning')
      return false
    }
  }

  const handleOpen = async (data: UserListItem): Promise<void> => {
    await resetForm()
    userContext.value = data
    const { id, userRoles, tenantId } = data
    formData.value = {
      id,
      userRoles,
      tenantId: isPlatformSuper.value ? tenantId : currentTenantId.value
    }
    await dialogRef.value?.handleOpen(data, {
      title: '分配用户角色',
      contentMaxHeight: '60vh',
      onConfirm: handleSubmit,
      onReset: () => {
        void resetForm()
      }
    })
  }

  defineExpose({
    handleOpen,
    handleSubmit,
    handleClose: () => dialogRef.value?.handleClose()
  })
</script>

<style scoped lang="scss">
  .user-role-dialog {
    display: grid;
    gap: 16px;
    min-width: 0;

    &__notice {
      align-items: flex-start;

      :deep(.el-alert__content) {
        min-width: 0;
      }

      :deep(.el-alert__title) {
        line-height: 1.6;
      }
    }
  }
</style>
