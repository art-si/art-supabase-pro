<template>
  <ArtDialog ref="dialogRef" size="sm" :loading="usersLoading" loading-text="正在加载审批人…">
    <div class="workflow-transfer">
      <section class="workflow-transfer__summary">
        <span><ArtSvgIcon icon="ri:user-received-2-line" /></span>
        <div>
          <strong>转交当前审批待办</strong>
          <small>{{ state.task?.instance?.businessTitle || '--' }}</small>
        </div>
      </section>

      <div class="workflow-transfer__seat">
        <div>
          <small>当前处理人</small>
          <strong>{{ state.task?.assigneeNameSnapshot || '--' }}</strong>
        </div>
        <ArtSvgIcon icon="ri:arrow-right-line" />
        <div>
          <small>原审批席位</small>
          <strong>{{
            state.task?.originalAssigneeNameSnapshot || state.task?.assigneeNameSnapshot || '--'
          }}</strong>
        </div>
      </div>

      <ArtAsyncState
        v-if="usersError"
        :error="usersError"
        size="compact"
        error-title="审批人加载失败"
        @retry="retryUsers"
      />
      <ArtForm
        ref="formRef"
        v-model="form.data"
        :items="form.items"
        :rules="form.rules"
        :show-reset="false"
        :show-submit="false"
        label-position="top"
      />

      <div class="workflow-transfer__notice">
        <ArtSvgIcon icon="ri:history-line" />
        <span
          >转交只替换实际处理人，不增加或减少审批票数；转交双方、原审批席位和原因都会永久留痕。</span
        >
      </div>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { useDetailRecord } from '@/hooks/core/useDetailRecord'
  import { useRoute } from 'vue-router'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import type { FormRules } from 'element-plus'
  import { ElMessage } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import type { ArtUserSelectOption } from '@/components/core/forms/art-user-select/types'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import { fetchWorkflowUserOptions, transferWorkflowTask } from '@/api/workflow'

  defineOptions({ name: 'WorkflowTransferDialog' })

  interface FormExpose {
    validate: () => Promise<boolean>
    clearValidate: () => void
  }

  const emit = defineEmits<{ (event: 'success'): void }>()
  const dialogRef = ref<ArtDialogExpose>()
  const formRef = ref<FormExpose>()
  const state = reactive<{
    task?: Api.Workflow.WorkflowTaskRecord
    users: Api.Workflow.WorkflowUserOption[]
  }>({ task: undefined, users: [] })
  const {
    detail: loadedUsers,
    loading: usersLoading,
    loadError: usersError,
    loadDetail: loadUsers,
    openDetail: resetUsers,
    retryLoad: retryUsers
  } = useDetailRecord<Api.Workflow.WorkflowUserOption[]>(
    (tenantId) => fetchWorkflowUserOptions({ tenantId }, { showErrorMessage: false }),
    '请检查网络后重试，已填写的转交原因会保留。'
  )
  let formRevision = 0
  const formActive = ref(false)
  const invalidateForm = () => {
    formRevision += 1
    formActive.value = false
    resetUsers('')
  }
  const route = useRoute()
  watch(() => route.fullPath, invalidateForm)
  watch(loadedUsers, (users) => {
    state.users = users ?? []
    rebuildItems()
  })
  watch([usersLoading, usersError, formActive], () => {
    rebuildItems()
    dialogRef.value?.setOptions({
      confirmDisabled: !formActive.value || usersLoading.value || !!usersError.value
    })
  })
  const form = reactive<{
    data: { assigneeUserId: string; reason: string }
    items: FormItem[]
    rules: FormRules
  }>({
    data: { assigneeUserId: '', reason: '' },
    items: [],
    rules: {
      assigneeUserId: [{ required: true, message: '请选择新审批人', trigger: 'change' }],
      reason: [
        { required: true, message: '请填写转交原因', trigger: 'blur' },
        { min: 4, max: 300, message: '转交原因应为 4 至 300 个字符', trigger: 'blur' }
      ]
    }
  })

  const displayName = (user: Api.Workflow.WorkflowUserOption) =>
    user.nickName || user.userName || user.userEmail

  const toUserSelectOption = (user: Api.Workflow.WorkflowUserOption): ArtUserSelectOption => ({
    value: user.id,
    label: displayName(user),
    avatar: user.avatar,
    userName: user.userName,
    nickName: user.nickName,
    userEmail: user.userEmail
  })

  function rebuildItems(): void {
    form.items = [
      {
        label: '新审批人',
        key: 'assigneeUserId',
        type: 'userSelect',
        span: 24,
        props: {
          placeholder: '选择同租户在职人员',
          filterable: true,
          disabled: !formActive.value || usersLoading.value || !!usersError.value,
          options: state.users
            .filter((user) => user.id !== state.task?.assigneeUserId)
            .map(toUserSelectOption)
        }
      },
      {
        label: '转交原因',
        key: 'reason',
        type: 'input',
        span: 24,
        props: {
          type: 'textarea',
          rows: 4,
          maxlength: 300,
          showWordLimit: true,
          placeholder: '请说明转交依据，便于后续审计和追溯（至少 4 个字符）'
        }
      }
    ]
  }

  async function handleSubmit(): Promise<boolean> {
    const revision = formRevision
    const task = state.task
    const assigneeUserId = form.data.assigneeUserId
    const reason = form.data.reason
    const isCurrent = () => formActive.value && revision === formRevision && task === state.task
    try {
      if (!formActive.value || usersLoading.value || usersError.value || !task) return false
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      if (!isCurrent()) return false
      if (assigneeUserId !== form.data.assigneeUserId || reason !== form.data.reason) return false
      await transferWorkflowTask({
        taskId: task.id,
        assigneeUserId,
        reason: reason.trim()
      })
      if (!isCurrent()) return false
      ElMessage.success('审批待办已转交')
      emit('success')
      return true
    } catch (error) {
      if (!isCurrent()) return false
      notifyFriendlyError(error, '审批转交失败，请刷新待办后重试', 'warning')
      return false
    }
  }

  async function handleOpen(task: Api.Workflow.WorkflowTaskRecord): Promise<void> {
    invalidateForm()
    formActive.value = true
    resetUsers(task.tenantId)
    state.task = task
    Object.assign(form.data, { assigneeUserId: '', reason: '' })
    state.users = []
    rebuildItems()
    await dialogRef.value?.handleOpen(undefined, {
      title: '转交审批待办',
      subtitle: '新审批人必须属于同一租户且账号处于启用状态。',
      confirmText: '确认转交',
      contentMaxHeight: '70vh',
      onOpen: async () => {
        await nextTick()
        formRef.value?.clearValidate()
        await loadUsers(task.tenantId)
      },
      onClose: invalidateForm,
      onConfirm: handleSubmit,
      onReset: () => {
        state.task = undefined
        state.users = []
      }
    })
  }

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .workflow-transfer {
    display: grid;
    gap: 16px;

    &__summary {
      display: flex;
      gap: 12px;
      align-items: center;
      padding: 14px;
      background: var(--el-color-warning-light-9);
      border: 1px solid var(--el-color-warning-light-7);
      border-radius: var(--el-border-radius-base);

      > span {
        display: grid;
        flex: 0 0 auto;
        place-items: center;
        width: 40px;
        height: 40px;
        font-size: 20px;
        color: var(--el-color-warning);
        background: var(--default-box-color);
        border-radius: 50%;
      }

      > div {
        display: grid;
        gap: 3px;
        min-width: 0;
      }

      strong {
        color: var(--art-gray-900);
      }

      small {
        overflow: hidden;
        text-overflow: ellipsis;
        color: var(--art-gray-500);
        white-space: nowrap;
      }
    }

    &__seat {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
      gap: 12px;
      align-items: center;
      padding: 12px;
      background: var(--art-gray-50);
      border-radius: var(--el-border-radius-base);

      > div {
        display: grid;
        gap: 3px;
        min-width: 0;
      }

      small {
        font-size: 12px;
        color: var(--art-gray-500);
      }

      strong {
        overflow: hidden;
        text-overflow: ellipsis;
        color: var(--art-gray-800);
        white-space: nowrap;
      }

      > svg {
        color: var(--art-gray-400);
      }
    }

    &__notice {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      padding: 11px 12px;
      font-size: 12px;
      line-height: 1.6;
      color: var(--el-color-warning-dark-2);
      background: var(--el-color-warning-light-9);
      border-radius: var(--el-border-radius-base);

      svg {
        flex: 0 0 auto;
        margin-top: 2px;
        font-size: 16px;
      }
    }
  }

  @media only screen and (width <= 640px) {
    .workflow-transfer {
      &__summary {
        align-items: flex-start;

        small {
          overflow-wrap: anywhere;
          white-space: normal;
        }
      }

      &__seat {
        grid-template-columns: minmax(0, 1fr);

        > svg {
          justify-self: center;
          transform: rotate(90deg);
        }

        strong {
          overflow-wrap: anywhere;
          white-space: normal;
        }
      }
    }
  }
</style>
