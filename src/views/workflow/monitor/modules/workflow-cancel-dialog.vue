<template>
  <ArtDialog ref="dialogRef" size="sm">
    <div class="workflow-cancel">
      <div class="workflow-cancel__summary">
        <span><ArtSvgIcon icon="ri:stop-circle-line" /></span>
        <div>
          <strong>终止运行中的审批流程</strong>
          <small>{{ state.instance?.businessTitle || '--' }}</small>
        </div>
      </div>

      <ArtForm
        ref="formRef"
        v-model="form.data"
        :items="form.items"
        :rules="form.rules"
        :show-reset="false"
        :show-submit="false"
        label-position="top"
      />

      <div class="workflow-cancel__notice">
        <ArtSvgIcon icon="ri:alert-line" />
        <span
          >终止后所有待办立即取消，当前流程不可恢复；业务单据将回到可修正、可重新提交的状态。</span
        >
      </div>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import type { FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import { cancelWorkflowInstance } from '@/api/workflow'

  defineOptions({ name: 'WorkflowCancelDialog' })

  interface FormExpose {
    validate: () => Promise<boolean>
    clearValidate: () => void
  }
  interface CancelFormData {
    comment: string
  }
  interface CancelFormGroup {
    data: CancelFormData
    items: FormItem[]
    rules: FormRules
  }

  const emit = defineEmits<{ (event: 'success'): void }>()
  const dialogRef = ref<ArtDialogExpose>()
  const formRef = ref<FormExpose>()
  const state = reactive<{ instance?: Api.Workflow.WorkflowMonitorRecord }>({ instance: undefined })
  const form = reactive<CancelFormGroup>({
    data: { comment: '' },
    items: [
      {
        label: '终止原因',
        key: 'comment',
        type: 'input',
        props: {
          type: 'textarea',
          rows: 5,
          maxlength: 500,
          showWordLimit: true,
          placeholder: '请说明异常原因、处理依据或后续安排（至少4个字符）'
        }
      }
    ],
    rules: {
      comment: [
        { required: true, message: '请填写终止原因', trigger: 'blur' },
        { min: 4, max: 500, message: '终止原因应为4至500个字符', trigger: 'blur' }
      ]
    }
  })

  async function handleSubmit(): Promise<boolean> {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      if (!state.instance) return false
      await cancelWorkflowInstance(state.instance.id, form.data.comment.trim())
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '审批流程终止失败，请刷新后重试', 'warning')
      return false
    }
  }

  async function handleOpen(instance: Api.Workflow.WorkflowMonitorRecord): Promise<void> {
    state.instance = instance
    form.data.comment = ''
    await dialogRef.value?.handleOpen(undefined, {
      title: '终止审批流程',
      subtitle: '该操作会改变流程与关联业务单据状态，并写入不可修改的审计轨迹。',
      confirmText: '确认终止',
      onConfirm: handleSubmit
    })
    await nextTick()
    formRef.value?.clearValidate()
  }

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .workflow-cancel {
    display: grid;
    gap: 16px;

    &__summary {
      display: flex;
      gap: 12px;
      align-items: center;
      padding: 14px;
      background: var(--el-color-danger-light-9);
      border: 1px solid var(--el-color-danger-light-7);
      border-radius: var(--el-border-radius-base);

      > span {
        display: grid;
        flex: 0 0 auto;
        place-items: center;
        width: 40px;
        height: 40px;
        font-size: 21px;
        color: var(--el-color-danger);
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

    &__notice {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      padding: 11px 12px;
      font-size: 12px;
      line-height: 1.6;
      color: var(--el-color-danger-dark-2);
      background: var(--el-color-danger-light-9);
      border-radius: var(--el-border-radius-base);

      svg {
        flex: 0 0 auto;
        margin-top: 2px;
        font-size: 16px;
      }
    }
  }
</style>
