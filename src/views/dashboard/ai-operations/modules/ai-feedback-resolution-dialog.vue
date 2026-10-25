<template>
  <ArtDialog ref="dialogRef">
    <div class="ai-feedback-resolution">
      <section v-if="current" class="ai-feedback-resolution__summary art-card-xs">
        <div class="ai-feedback-resolution__summary-icon">
          <ArtSvgIcon icon="ri:thumb-down-line" />
        </div>
        <div class="ai-feedback-resolution__summary-main">
          <div>
            <ArtDictDisplay dict-code="aiRunFeature" :value="current.feature" display="text" />
            <ArtDictDisplay
              dict-code="aiFeedbackResolutionStatus"
              :value="current.status"
              display="tag"
            />
          </div>
          <strong>{{ current.comment || '用户未填写具体说明' }}</strong>
          <span>{{ current.model }} · {{ formatDateTime(current.feedbackTime) }}</span>
        </div>
      </section>

      <ElAlert
        title="处理结论会独立留痕，不会修改用户原始评价。关闭问题前请说明核查结果或无需处理的依据。"
        type="info"
        show-icon
        :closable="false"
      />

      <ArtForm
        ref="formRef"
        v-model="form.model"
        :items="form.items.value"
        :rules="form.rules"
        :span="12"
        :gutter="20"
        label-position="top"
        label-width="auto"
        :show-reset="false"
        :show-submit="false"
        :validate-on-rule-change="false"
      />
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { createDateTimeFormatter } from '@/utils/ui/format'
  import { ElMessage, type FormRules } from 'element-plus'
  import type { ComputedRef } from 'vue'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import { useUserStore } from '@/store/modules/user'
  import {
    updateAiFeedbackResolution,
    type AiFeedbackIssueType,
    type AiFeedbackQueueItem,
    type AiFeedbackResolutionStatus
  } from '@/api/ai-operations'

  defineOptions({ name: 'AiFeedbackResolutionDialog' })

  interface DialogOpenData {
    item: AiFeedbackQueueItem
  }

  interface ResolutionFormModel {
    status: AiFeedbackResolutionStatus
    issueType: AiFeedbackIssueType | ''
    resolutionNote: string
  }

  interface FormGroup {
    model: ResolutionFormModel
    items: ComputedRef<FormItem[]>
    rules: FormRules<ResolutionFormModel>
  }

  interface ArtFormExpose {
    validate: () => Promise<boolean | void>
    clearValidate: () => void
  }

  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<DialogOpenData>>()
  const formRef = ref<ArtFormExpose>()
  const current = shallowRef<AiFeedbackQueueItem>()
  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)

  const createInitialForm = (): ResolutionFormModel => ({
    status: 'open',
    issueType: '',
    resolutionNote: ''
  })

  const formModel = reactive<ResolutionFormModel>(createInitialForm())
  const form: FormGroup = {
    model: formModel,
    items: computed<FormItem[]>(() => [
      {
        label: '处理状态',
        key: 'status',
        type: 'select',
        span: 12,
        props: {
          options: resolutionStatusOptions.value,
          clearable: false,
          placeholder: '请选择处理状态'
        }
      },
      {
        label: '问题类型',
        key: 'issueType',
        type: 'select',
        span: 12,
        props: {
          options: getDictMap.value.aiFeedbackIssueType ?? [],
          clearable: true,
          placeholder: '请选择问题类型'
        }
      },
      {
        label: '核查与处理结论',
        key: 'resolutionNote',
        type: 'textarea',
        span: 24,
        description: isClosingStatus.value
          ? '关闭问题前必须填写核查结果、修复内容或无需处理的依据。'
          : '处理中可记录当前发现、负责人或下一步动作。',
        props: {
          rows: 5,
          maxlength: 500,
          showWordLimit: true,
          resize: 'none',
          placeholder: '请输入核查过程、处理动作和结论'
        }
      }
    ]),
    rules: {
      status: [{ required: true, message: '请选择处理状态', trigger: 'change' }],
      issueType: [{ required: true, message: '请选择问题类型', trigger: 'change' }],
      resolutionNote: [
        {
          validator: (_rule, value, callback) => {
            if (isClosingStatus.value && String(value ?? '').trim().length < 5) {
              callback(new Error('关闭问题时请填写至少 5 个字的处理结论'))
              return
            }
            callback()
          },
          trigger: 'blur'
        }
      ]
    }
  }

  const isClosingStatus = computed(() => ['resolved', 'dismissed'].includes(form.model.status))
  const resolutionStatusOptions = computed(() => {
    const options = getDictMap.value.aiFeedbackResolutionStatus ?? []
    if (!current.value || !['resolved', 'dismissed'].includes(current.value.status)) return options
    return options.filter((item) => ['open', current.value?.status].includes(String(item.value)))
  })

  async function handleOpen(data: DialogOpenData): Promise<void> {
    current.value = data.item
    Object.assign(form.model, {
      status: data.item.status,
      issueType: data.item.issueType ?? '',
      resolutionNote: data.item.resolutionNote ?? ''
    })
    await dialogRef.value?.handleOpen(data, {
      title: 'AI 反馈处理',
      size: 'md',
      contentMaxHeight: '68vh',
      confirmText: '保存处理结果',
      onConfirm: handleSubmit,
      onReset: resetDialog,
      dialogProps: {
        appendToBody: true,
        closeOnClickModal: false
      }
    })
  }

  async function handleSubmit(): Promise<boolean> {
    if (!current.value) return false
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      await updateAiFeedbackResolution({
        feedbackId: current.value.feedbackId,
        status: form.model.status,
        issueType: form.model.issueType || null,
        resolutionNote: form.model.resolutionNote
      })
      ElMessage.success(isClosingStatus.value ? '反馈问题已关闭' : '处理进度已保存')
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '反馈处理进度保存失败，请稍后重试', 'warning')
      return false
    }
  }

  function resetDialog(): void {
    current.value = undefined
    Object.assign(form.model, createInitialForm())
    formRef.value?.clearValidate()
  }

  const formatDateTime = createDateTimeFormatter({ format: 'YYYY-MM-DD HH:mm' })

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .ai-feedback-resolution {
    display: grid;
    gap: var(--art-space-3);

    &__summary {
      display: flex;
      gap: var(--art-space-3);
      align-items: flex-start;
      padding: var(--art-section-padding);
      background: color-mix(in srgb, var(--el-color-danger) 4%, var(--el-bg-color));
      border-color: var(--el-color-danger-light-8);
    }

    &__summary-icon {
      display: grid;
      flex: 0 0 42px;
      place-items: center;
      width: 42px;
      height: 42px;
      color: var(--el-color-danger);
      background: var(--el-color-danger-light-9);
      border-radius: var(--el-border-radius-base);

      :deep(svg) {
        width: 20px;
        height: 20px;
      }
    }

    &__summary-main {
      display: grid;
      flex: 1;
      gap: 7px;
      min-width: 0;

      > div {
        display: flex;
        gap: 8px;
        align-items: center;
        justify-content: space-between;
      }

      strong {
        font-size: 14px;
        line-height: 1.6;
        color: var(--el-text-color-primary);
        overflow-wrap: anywhere;
      }

      span {
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 12px;
        color: var(--el-text-color-secondary);
        white-space: nowrap;
      }
    }

    :deep(.art-form) {
      padding-right: 0;
      padding-left: 0;
    }

    @media (width <= 560px) {
      &__summary-main > div {
        flex-direction: column;
        align-items: flex-start;
      }
    }
  }
</style>
