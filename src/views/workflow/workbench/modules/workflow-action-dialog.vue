<template>
  <ArtDialog
    ref="dialogRef"
    size="md"
    :loading="state.snapshotLoading"
    loading-text="正在加载审批资料…"
  >
    <div :class="['workflow-action', `is-${state.action}`]">
      <div class="workflow-action__summary">
        <span
          ><ArtSvgIcon
            :icon="state.action === 'approve' ? 'ri:check-double-line' : 'ri:close-circle-line'"
        /></span>
        <div>
          <strong>
            {{
              state.platformOverride
                ? state.action === 'approve'
                  ? '代为通过审批'
                  : '代为驳回申请'
                : state.action === 'approve'
                  ? '通过审批'
                  : '驳回申请'
            }}
          </strong>
          <small>
            {{ state.task?.instance?.businessTitle || '--' }}
            <template v-if="state.platformOverride && state.task?.tenant?.tenantName">
              · {{ state.task.tenant.tenantName }}
            </template>
          </small>
        </div>
      </div>
      <div v-if="state.platformOverride" class="workflow-action__override-warning">
        <ArtSvgIcon icon="ri:shield-user-line" />
        <div>
          <strong>平台超管代审批</strong>
          <span>
            您将代替“{{
              state.task?.assigneeNameSnapshot || '原审批人'
            }}”作出本次决定；实际操作人、原审批人和干预原因都会写入审计轨迹。
          </span>
        </div>
      </div>
      <div class="workflow-action__context" aria-label="本次审批决策上下文">
        <article>
          <span><ArtSvgIcon icon="ri:node-tree" /></span>
          <div
            ><small>当前节点</small><strong>{{ state.task?.nodeName || '--' }}</strong></div
          >
        </article>
        <article>
          <span><ArtSvgIcon icon="ri:user-follow-line" /></span>
          <div>
            <small>审批席位</small>
            <strong>{{ state.task?.assigneeNameSnapshot || '--' }}</strong>
          </div>
        </article>
        <article>
          <span><ArtSvgIcon icon="ri:git-branch-line" /></span>
          <div
            ><small>决策规则</small><strong>{{ decisionRuleText }}</strong></div
          >
        </article>
      </div>
      <ArtAsyncState
        v-if="state.snapshotError"
        :error="state.snapshotError"
        error-title="业务资料暂时不可用"
        :min-height="132"
        @retry="loadSnapshot"
      />
      <WorkflowBusinessSnapshot v-else-if="state.snapshot" :snapshot="state.snapshot" />
      <ArtForm
        ref="formRef"
        v-model="form"
        :items="formItems"
        :rules="formRules"
        :show-reset="false"
        :show-submit="false"
        label-position="top"
      />
      <div :class="['workflow-action__notice', { 'is-danger': state.action === 'reject' }]">
        <ArtSvgIcon :icon="state.action === 'reject' ? 'ri:alert-line' : 'ri:information-line'" />
        <span>{{ actionNotice }}</span>
      </div>
    </div>

    <template #footer="{ loading, api }">
      <div class="workflow-action__footer">
        <span class="art-icon-label"
          ><ArtSvgIcon icon="ri:history-line" />本次决定将写入审批审计轨迹</span
        >
        <div>
          <ElButton :disabled="state.snapshotLoading || loading" @click="api.handleClose()"
            >取消</ElButton
          >
          <ElButton
            :type="state.action === 'reject' ? 'danger' : 'primary'"
            :loading="loading"
            :disabled="state.snapshotLoading"
            @click="api.handleConfirm()"
          >
            {{ confirmText }}
          </ElButton>
        </div>
      </div>
    </template>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import type { FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import WorkflowBusinessSnapshot from '../../modules/workflow-business-snapshot.vue'
  import { actWorkflowTask, fetchWorkflowBusinessSnapshot } from '@/api/workflow'

  defineOptions({ name: 'WorkflowActionDialog' })

  type WorkflowAction = 'approve' | 'reject'
  interface FormExpose {
    validate: () => Promise<boolean>
    clearValidate: () => void
  }

  interface ActionDialogState {
    task?: Api.Workflow.WorkflowTaskRecord
    action: WorkflowAction
    platformOverride: boolean
    snapshot: Api.Workflow.WorkflowBusinessSnapshot | null
    snapshotLoading: boolean
    snapshotError: Error | null
  }

  const emit = defineEmits<{ (event: 'success', action: WorkflowAction): void }>()
  const dialogRef = ref<ArtDialogExpose>()
  const formRef = ref<FormExpose>()
  const state = reactive<ActionDialogState>({
    task: undefined,
    action: 'approve',
    platformOverride: false,
    snapshot: null,
    snapshotLoading: false,
    snapshotError: null
  })
  const form = ref({ comment: '' })
  let snapshotRequestId = 0

  const formItems = computed<FormItem[]>(() => [
    {
      label: state.platformOverride
        ? '代审批干预原因'
        : state.action === 'approve'
          ? '审批意见（选填）'
          : '驳回原因',
      key: 'comment',
      type: 'input',
      span: 24,
      props: {
        type: 'textarea',
        rows: 4,
        maxlength: 500,
        showWordLimit: true,
        placeholder: state.platformOverride
          ? '请说明为什么需要由平台超级管理员代为处理（至少4个字符）'
          : state.action === 'approve'
            ? '可补充本次审批意见'
            : '请清晰说明驳回原因，便于发起人调整'
      }
    }
  ])
  const formRules = computed<FormRules>(() => ({
    comment: state.platformOverride
      ? [
          { required: true, message: '请填写代审批干预原因', trigger: 'blur' },
          { min: 4, message: '干预原因至少填写4个字符', trigger: 'blur' }
        ]
      : state.action === 'reject'
        ? [{ required: true, message: '请填写驳回原因', trigger: 'blur' }]
        : []
  }))
  const decisionRuleText = computed(() => {
    const task = state.task
    if (!task) return '当前节点规则'
    if (task.approvalMode === 'all') return '全员通过'
    if (task.approvalMode === 'percentage') {
      return `${task.approvalThresholdPercent}% 比例会签`
    }
    return '或签（一人通过）'
  })
  const actionNotice = computed(() => {
    if (state.platformOverride) {
      return `本次只代替当前审批席位作出决定，仍严格遵循${decisionRuleText.value}和原有否决规则，不会强制结束整条流程。`
    }
    if (state.action === 'approve') {
      return `本节点采用${decisionRuleText.value}；达到通过条件后进入下一节点，最后节点通过时同步业务单据。`
    }
    return state.task?.rejectVetoEnabled
      ? '本节点已开启一票否决；确认驳回后流程立即结束，并同步业务单据为驳回状态。'
      : '本节点采用容错计算；本次驳回会保留审计记录，仅在剩余审批人已无法达到通过条件时结束流程。'
  })
  const confirmText = computed(() => {
    if (state.platformOverride) {
      return state.action === 'approve' ? '确认代为通过' : '确认代为驳回'
    }
    return state.action === 'approve' ? '确认通过' : '确认驳回'
  })

  async function handleSubmit(): Promise<boolean> {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      if (!state.task) return false
      await actWorkflowTask({
        taskId: state.task.id,
        action: state.action,
        comment: normalizeNullableText(form.value.comment)
      })
      emit('success', state.action)
      return true
    } catch (error) {
      notifyFriendlyError(error, '审批处理失败，请刷新待办后重试', 'warning')
      return false
    }
  }

  async function loadSnapshot(): Promise<void> {
    const instanceId = state.task?.instanceId
    if (!instanceId) return
    const requestId = ++snapshotRequestId
    state.snapshotLoading = true
    state.snapshotError = null
    try {
      const response = await fetchWorkflowBusinessSnapshot(instanceId, {
        showErrorMessage: false
      })
      if (requestId !== snapshotRequestId || state.task?.instanceId !== instanceId) return
      if (!response.data) throw new Error('业务资料暂时无法加载')
      state.snapshot = response.data
    } catch {
      if (requestId !== snapshotRequestId || state.task?.instanceId !== instanceId) return
      state.snapshot = null
      state.snapshotError = new Error(
        '业务资料暂时无法加载，不影响当前审批操作。请根据单据信息谨慎确认，或稍后重试。'
      )
    } finally {
      if (requestId === snapshotRequestId) state.snapshotLoading = false
    }
  }

  function resetDialogState(): void {
    snapshotRequestId += 1
    Object.assign(state, {
      task: undefined,
      action: 'approve',
      platformOverride: false,
      snapshot: null,
      snapshotLoading: false,
      snapshotError: null
    } satisfies ActionDialogState)
    form.value.comment = ''
  }

  async function handleOpen(
    task: Api.Workflow.WorkflowTaskRecord,
    action: WorkflowAction,
    options: { platformOverride?: boolean } = {}
  ): Promise<void> {
    state.task = task
    state.action = action
    state.platformOverride = Boolean(options.platformOverride)
    state.snapshot = null
    state.snapshotLoading = true
    state.snapshotError = null
    form.value.comment = ''
    await dialogRef.value?.handleOpen(undefined, {
      title: state.platformOverride
        ? action === 'approve'
          ? '代为通过审批'
          : '代为驳回申请'
        : action === 'approve'
          ? '通过审批'
          : '驳回申请',
      confirmText: confirmText.value,
      contentMaxHeight: '70vh',
      onOpen: async () => {
        await nextTick()
        formRef.value?.clearValidate()
        void loadSnapshot()
      },
      onConfirm: handleSubmit,
      onReset: resetDialogState
    })
  }

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .workflow-action {
    display: grid;
    gap: 16px;

    &__summary {
      display: flex;
      gap: 12px;
      align-items: center;
      padding: 14px;
      background: var(--el-color-success-light-9);
      border: 1px solid var(--el-color-success-light-7);
      border-radius: var(--el-border-radius-base);

      > span {
        display: grid;
        place-items: center;
        width: 38px;
        height: 38px;
        font-size: 20px;
        color: var(--el-color-success);
        background: var(--default-box-color);
        border-radius: 50%;
      }

      div {
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
        color: var(--art-gray-600);
        white-space: nowrap;
      }
    }

    &.is-reject &__summary {
      background: var(--el-color-danger-light-9);
      border-color: var(--el-color-danger-light-7);
    }

    &.is-reject &__summary > span {
      color: var(--el-color-danger);
    }

    &__override-warning {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      padding: 12px 14px;
      color: var(--el-color-warning-dark-2);
      background: var(--el-color-warning-light-9);
      border: 1px solid var(--el-color-warning-light-7);
      border-radius: var(--el-border-radius-base);

      > svg {
        flex: 0 0 auto;
        margin-top: 2px;
        font-size: 18px;
      }

      > div {
        display: grid;
        gap: 4px;
      }

      strong {
        font-size: 13px;
        color: var(--art-gray-900);
      }

      span {
        font-size: 12px;
        line-height: 1.55;
      }
    }

    &__context {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;

      article {
        display: flex;
        gap: 9px;
        align-items: center;
        min-width: 0;
        padding: 11px 12px;
        background: var(--art-gray-50);
        border: 1px solid var(--art-gray-200);
        border-radius: var(--el-border-radius-base);

        > span {
          display: grid;
          flex: 0 0 auto;
          place-items: center;
          width: 30px;
          height: 30px;
          font-size: 16px;
          color: var(--theme-color);
          background: color-mix(in srgb, var(--theme-color) 9%, var(--el-bg-color));
          border-radius: var(--el-border-radius-small);
        }

        > div {
          display: grid;
          gap: 2px;
          min-width: 0;
        }

        small,
        strong {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        small {
          font-size: 12px;
          color: var(--art-gray-600);
        }

        strong {
          font-size: 13px;
          color: var(--art-gray-900);
        }
      }
    }

    &__notice {
      display: flex;
      gap: 7px;
      align-items: flex-start;
      padding: 10px 12px;
      font-size: 12px;
      line-height: 1.55;
      color: var(--art-gray-500);
      background: var(--art-gray-50);
      border-radius: var(--el-border-radius-base);

      svg {
        flex: 0 0 auto;
        margin-top: 2px;
        color: var(--el-color-primary);
      }

      &.is-danger {
        color: var(--el-color-danger-dark-2);
        background: var(--el-color-danger-light-9);
        border: 1px solid var(--el-color-danger-light-7);

        svg {
          color: var(--el-color-danger);
        }
      }
    }

    &__footer {
      display: flex;
      gap: 16px;
      align-items: center;
      justify-content: space-between;
      width: 100%;

      > span {
        display: flex;
        gap: 6px;
        align-items: center;
        font-size: 12px;
        color: var(--art-gray-600);
      }

      > div {
        display: flex;
        gap: 10px;
      }
    }
  }

  @media (width <= 640px) {
    .workflow-action {
      &__summary {
        align-items: flex-start;

        small {
          overflow-wrap: anywhere;
          white-space: normal;
        }
      }

      &__context {
        grid-template-columns: minmax(0, 1fr);
      }

      &__footer {
        flex-wrap: wrap;

        > span {
          width: 100%;
        }

        > div {
          justify-content: flex-end;
          width: 100%;
        }
      }
    }
  }
</style>
