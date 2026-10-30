<template>
  <ArtDialog
    ref="dialogRef"
    size="md"
    :loading="loading"
    :confirm-disabled="!canSubmit"
    confirm-text="保存分配"
    @close="invalidateLoad"
  >
    <div class="grid min-w-0 gap-4">
      <ArtEntitySummary
        compact
        icon="ri:shield-user-line"
        :title="role?.roleName || '未选择角色'"
        :description="roleDescription"
      >
        <template #aside>
          <ElTag type="primary" effect="light" round>已选 {{ selectedUserIds.length }} 人</ElTag>
        </template>
      </ArtEntitySummary>

      <ElAlert
        :title="
          role?.enabled
            ? '仅调整当前角色的成员，用户的其他角色保持不变。权限将在刷新菜单或重新登录后生效。'
            : '该角色已停用，仅支持移出已有成员；新增用户前请先启用角色。'
        "
        :type="role?.enabled ? 'info' : 'warning'"
        :closable="false"
        show-icon
      />

      <ArtAsyncState
        :error="loadError"
        :empty="ready && users.length === 0"
        empty-text="暂无可分配用户"
        empty-description="该租户暂无可用账号，可先在用户管理中创建或启用用户。"
        :retryable="true"
        @retry="loadUsers"
      >
        <ArtForm
          v-model="formData"
          :items="formItems"
          :span="24"
          label-position="top"
          :show-submit="false"
          :show-reset="false"
        />
      </ArtAsyncState>

      <ElAlert v-if="saveError" :title="saveError" type="error" :closable="false" show-icon>
        <ElButton link type="primary" :disabled="saving" @click="loadUsers">重新加载成员</ElButton>
      </ElAlert>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { ElMessage } from 'element-plus'
  import { useAuth } from '@/hooks/core/useAuth'
  import { fetchRoleUsers, saveRoleUsers, type RoleUserRecord } from '@/api/system-manage'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import type { ArtUserSelectOption } from '@/components/core/forms/art-user-select/types'

  type Role = Api.SystemManage.RoleListItem
  const emit = defineEmits<{ success: [] }>()
  const { hasAuth } = useAuth()
  const dialogRef = ref<ArtDialogExpose<Role>>()
  const role = shallowRef<Role>()
  const users = shallowRef<RoleUserRecord[]>([])
  const formData = ref({ userIds: [] as string[] })
  const selectedUserIds = computed({
    get: () => formData.value.userIds,
    set: (value: string[]) => {
      formData.value.userIds = value
    }
  })
  const expectedUserIds = ref<string[]>([])
  const loading = ref(false)
  const saving = ref(false)
  const ready = ref(false)
  const loadError = ref('')
  const saveError = ref('')
  let loadVersion = 0

  const canSubmit = computed(
    () => ready.value && !saving.value && hasAuth('System:Role:AssignUser')
  )
  // ArtDialog captures options on open; keep the runtime submit gate in sync.
  watch(canSubmit, (value) => dialogRef.value?.setOptions({ confirmDisabled: !value }))

  const roleDescription = computed(() =>
    [
      role.value?.roleCode,
      role.value?.tenant?.tenantName,
      role.value?.organization?.organizationName
    ]
      .filter(Boolean)
      .join(' · ')
  )
  const userOptions = computed<ArtUserSelectOption[]>(() =>
    users.value.map((user) => ({
      value: user.id,
      label: user.nickName || user.userName || user.userEmail || '未命名用户',
      nickName: user.nickName,
      userName: user.userName,
      userEmail: user.userEmail,
      avatar: user.avatar,
      secondaryText: [user.userEmail || user.userName, user.status !== '1' ? '账号已停用' : '']
        .filter(Boolean)
        .join(' · '),
      disabled:
        !selectedUserIds.value.includes(user.id) && (user.status !== '1' || !role.value?.enabled)
    }))
  )
  const formItems = computed<FormItem[]>(() => [
    {
      key: 'userIds',
      label: '角色成员',
      type: 'userSelect',
      options: userOptions.value,
      props: {
        multiple: true,
        maxCollapseTags: 4,
        disabled: !ready.value || saving.value || !hasAuth('System:Role:AssignUser'),
        placeholder: '搜索姓名、账号或邮箱，选择角色成员'
      },
      description: '支持多选；移除已选用户会解除其当前角色。停用账号仅可保留或移出。'
    }
  ])

  function invalidateLoad() {
    loadVersion += 1
    ready.value = false
    loading.value = false
  }

  async function loadUsers() {
    const roleId = role.value?.id
    if (!roleId || saving.value) return
    const version = ++loadVersion
    loading.value = true
    ready.value = false
    loadError.value = ''
    saveError.value = ''
    try {
      const response = await fetchRoleUsers(roleId)
      if (version !== loadVersion) return
      if (!response.data || !Array.isArray(response.data.records))
        throw new Error('角色成员加载失败，请重试')
      users.value = response.data.records
      expectedUserIds.value = users.value.filter((user) => user.assigned).map((user) => user.id)
      selectedUserIds.value = [...expectedUserIds.value]
      ready.value = true
    } catch (error) {
      if (version === loadVersion)
        loadError.value = getFriendlySupabaseErrorMessage(error, '角色成员加载失败，请重试')
    } finally {
      if (version === loadVersion) loading.value = false
    }
  }

  async function handleSubmit(): Promise<boolean> {
    if (!ready.value || saving.value || !role.value?.id || !hasAuth('System:Role:AssignUser'))
      return false
    const version = loadVersion
    saving.value = true
    saveError.value = ''
    try {
      await saveRoleUsers({
        roleId: role.value.id,
        userIds: [...selectedUserIds.value],
        expectedUserIds: [...expectedUserIds.value]
      })
      if (version !== loadVersion) return false
      ElMessage.success('用户分配已保存')
      emit('success')
      return true
    } catch (error) {
      if (version === loadVersion)
        saveError.value = getFriendlySupabaseErrorMessage(
          error,
          '用户分配失败，请重试或重新加载成员'
        )
      return false
    } finally {
      saving.value = false
    }
  }

  async function handleOpen(data: Role) {
    if (saving.value) return
    invalidateLoad()
    role.value = data
    users.value = []
    selectedUserIds.value = []
    expectedUserIds.value = []
    loadError.value = ''
    saveError.value = ''
    await dialogRef.value?.handleOpen(data, {
      title: '分配用户',
      onConfirm: handleSubmit,
      onClose: () => !saving.value,
      onReset: invalidateLoad
    })
    await loadUsers()
  }

  onBeforeUnmount(invalidateLoad)
  defineExpose({ handleOpen })
</script>
