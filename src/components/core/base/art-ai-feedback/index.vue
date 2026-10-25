<template>
  <div
    v-if="runId"
    class="art-ai-feedback"
    :class="{ 'is-compact': compact, 'has-feedback': Boolean(state.rating) }"
  >
    <div class="art-ai-feedback__copy">
      <span class="art-ai-feedback__icon"><ArtSvgIcon icon="ri:message-3-line" /></span>
      <div>
        <strong>{{ state.rating ? statusTitle : '这次 AI 结果有帮助吗？' }}</strong>
        <small>{{ state.rating ? statusDescription : '你的反馈会用于评估和改进当前能力' }}</small>
      </div>
    </div>

    <div class="art-ai-feedback__actions">
      <ElButton
        :type="state.rating === 1 ? 'primary' : ''"
        :plain="state.rating !== 1"
        :loading="state.submitting === 1"
        :disabled="state.loading || Boolean(state.submitting)"
        @click="submitPositive"
      >
        <ArtSvgIcon :icon="state.rating === 1 ? 'ri:thumb-up-fill' : 'ri:thumb-up-line'" />
        有帮助
      </ElButton>
      <ElButton
        :type="state.rating === -1 ? 'danger' : ''"
        :plain="state.rating !== -1"
        :loading="state.submitting === -1"
        :disabled="state.loading || Boolean(state.submitting)"
        @click="openNegativeFeedback"
      >
        <ArtSvgIcon :icon="state.rating === -1 ? 'ri:thumb-down-fill' : 'ri:thumb-down-line'" />
        需要改进
      </ElButton>
    </div>
  </div>

  <ArtDialog ref="dialogRef">
    <div class="art-ai-feedback-dialog">
      <section class="art-ai-feedback-dialog__intro art-card-xs">
        <span><ArtSvgIcon icon="ri:lightbulb-flash-line" /></span>
        <div>
          <strong>帮助我们定位问题</strong>
          <p>请选择最主要的问题类型。补充正确结果后，后续优化会更有针对性。</p>
        </div>
      </section>

      <ArtForm
        ref="formRef"
        v-model="form.model"
        :items="form.items.value"
        :rules="form.rules"
        :span="24"
        label-position="top"
        label-width="auto"
        :show-reset="false"
        :show-submit="false"
        :validate-on-rule-change="false"
      />

      <ElAlert
        title="反馈只用于 AI 质量改进，不会自动修改当前业务数据。"
        type="info"
        show-icon
        :closable="false"
      />
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { ElMessage, type FormRules } from 'element-plus'
  import type { ComputedRef, UnwrapNestedRefs } from 'vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { useUserStore } from '@/store/modules/user'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import {
    fetchAiFeedback,
    submitAiFeedback,
    type AiFeedbackIssueType,
    type AiFeedbackRating,
    type AiFeedbackRecord
  } from '@/api/ai-feedback'

  defineOptions({ name: 'ArtAiFeedback' })

  interface Props {
    runId: string
    contextLabel?: string
    compact?: boolean
  }

  interface FeedbackState {
    loading: boolean
    rating: AiFeedbackRating | null
    record: AiFeedbackRecord | null
    submitting: AiFeedbackRating | null
  }

  interface FeedbackFormModel {
    issueType: AiFeedbackIssueType | ''
    comment: string
    correctAnswer: string
  }

  interface FormGroup {
    model: FeedbackFormModel
    items: ComputedRef<FormItem[]>
    rules: FormRules<FeedbackFormModel>
  }

  const props = withDefaults(defineProps<Props>(), {
    contextLabel: '',
    compact: false
  })
  const emit = defineEmits<{ submitted: [record: AiFeedbackRecord] }>()
  const dialogRef = ref<ArtDialogExpose<Record<string, never>>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)
  let feedbackDialogRunId = ''

  const createInitialForm = (): FeedbackFormModel => ({
    issueType: '',
    comment: '',
    correctAnswer: ''
  })

  const state: UnwrapNestedRefs<FeedbackState> = reactive<FeedbackState>({
    loading: false,
    rating: null,
    record: null,
    submitting: null
  })
  const form: FormGroup = {
    model: reactive<FeedbackFormModel>(createInitialForm()),
    items: computed<FormItem[]>(() => [
      {
        label: '主要问题',
        key: 'issueType',
        type: 'select',
        span: 24,
        props: {
          options: getDictMap.value.aiFeedbackIssueType ?? [],
          placeholder: '请选择最主要的问题类型',
          clearable: false
        }
      },
      {
        label: '问题说明',
        key: 'comment',
        type: 'input',
        span: 24,
        description: '可补充错误位置、缺失信息或不符合预期的原因。',
        props: {
          type: 'textarea',
          rows: 3,
          maxlength: 300,
          showWordLimit: true,
          resize: 'none',
          placeholder: '选填，请描述这次结果哪里需要改进'
        }
      },
      {
        label: '期望的正确结果',
        key: 'correctAnswer',
        type: 'input',
        span: 24,
        description: '如果你知道正确答案或处理方式，可以在这里提供。',
        props: {
          type: 'textarea',
          rows: 4,
          maxlength: 500,
          showWordLimit: true,
          resize: 'none',
          placeholder: '选填，请填写正确结果、关键数据或建议做法'
        }
      }
    ]),
    rules: {
      issueType: [{ required: true, message: '请选择问题类型', trigger: 'change' }]
    }
  }

  const statusTitle = computed(() => (state.rating === 1 ? '已标记为有帮助' : '改进意见已记录'))
  const statusDescription = computed(() =>
    state.rating === 1 ? '感谢确认，你仍可以更改评价' : '质量负责人可以在 AI 运营中心跟进'
  )

  async function loadFeedback(runId: string): Promise<void> {
    if (!runId) return resetState()
    const requestedRunId = runId
    state.loading = true
    try {
      const record = await fetchAiFeedback(requestedRunId)
      if (props.runId !== requestedRunId) return
      state.record = record
      state.rating = record?.rating ?? null
    } catch (error) {
      if (props.runId === requestedRunId)
        notifyFriendlyError(error, 'AI 评价状态加载失败，请刷新页面后重试')
    } finally {
      if (props.runId === requestedRunId) state.loading = false
    }
  }

  async function submitPositive(): Promise<void> {
    if (!props.runId || state.submitting) return
    const submittedRunId = props.runId
    state.submitting = 1
    try {
      const record = await submitAiFeedback({
        runId: submittedRunId,
        rating: 1,
        contextLabel: props.contextLabel
      })
      if (props.runId !== submittedRunId) return
      applyRecord(record)
      ElMessage.success('感谢反馈，已纳入 AI 质量评估')
    } catch (error) {
      if (props.runId === submittedRunId) notifyFriendlyError(error, '评价提交失败，请稍后重试')
    } finally {
      if (props.runId === submittedRunId) state.submitting = null
    }
  }

  async function openNegativeFeedback(): Promise<void> {
    if (!props.runId) return
    feedbackDialogRunId = props.runId
    const correction = state.record?.correction
    Object.assign(form.model, {
      issueType: correction?.issueType ?? '',
      comment: state.record?.rating === -1 ? (state.record.comment ?? '') : '',
      correctAnswer: correction?.correctAnswer ?? ''
    })
    await dialogRef.value?.handleOpen(
      {},
      {
        title: '提交 AI 改进反馈',
        subtitle: props.contextLabel || '反馈将绑定本次 AI 运行记录',
        size: 'sm',
        contentMaxHeight: '70vh',
        confirmText: '提交改进意见',
        onConfirm: submitNegative,
        onReset: resetForm,
        dialogProps: {
          appendToBody: true,
          closeOnClickModal: false
        }
      }
    )
  }

  async function submitNegative(): Promise<boolean> {
    if (!props.runId) return false
    if (props.runId !== feedbackDialogRunId) {
      ElMessage.warning('AI 结果已切换，请重新打开反馈表单')
      return false
    }
    const submittedRunId = props.runId
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      state.submitting = -1
      const record = await submitAiFeedback({
        runId: submittedRunId,
        rating: -1,
        issueType: form.model.issueType || null,
        comment: form.model.comment,
        correctAnswer: form.model.correctAnswer,
        contextLabel: props.contextLabel
      })
      if (props.runId !== submittedRunId) return false
      applyRecord(record)
      ElMessage.success('改进意见已提交，可在 AI 运营中心跟踪处理')
      return true
    } catch (error) {
      if (props.runId === submittedRunId)
        notifyFriendlyError(error, '改进意见提交失败，请检查内容后重试')
      return false
    } finally {
      if (props.runId === submittedRunId) state.submitting = null
    }
  }

  function applyRecord(record: AiFeedbackRecord): void {
    state.record = record
    state.rating = record.rating
    emit('submitted', record)
  }

  function resetForm(): void {
    Object.assign(form.model, createInitialForm())
    formRef.value?.clearValidate()
  }

  function resetState(): void {
    Object.assign(state, { loading: false, rating: null, record: null, submitting: null })
  }

  watch(
    () => props.runId,
    (runId, previousRunId) => {
      if (runId !== previousRunId) resetState()
      void loadFeedback(runId)
    },
    { immediate: true }
  )

  defineExpose({ refresh: () => loadFeedback(props.runId), openNegativeFeedback })
</script>

<style scoped lang="scss">
  .art-ai-feedback {
    display: flex;
    gap: var(--art-space-3);
    align-items: center;
    justify-content: space-between;
    min-width: 0;
    padding: 13px 14px;
    background: color-mix(in srgb, var(--el-color-primary) 4%, var(--el-bg-color));
    border: 1px solid var(--el-color-primary-light-8);
    border-radius: var(--el-border-radius-base);

    &__copy,
    &__actions {
      display: flex;
      align-items: center;
    }

    &__copy {
      gap: 10px;
      min-width: 0;

      > div {
        display: grid;
        gap: 3px;
        min-width: 0;
      }

      strong,
      small {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      strong {
        font-size: 13px;
        color: var(--el-text-color-primary);
      }

      small {
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }
    }

    &__icon {
      display: grid;
      flex: 0 0 34px;
      place-items: center;
      width: 34px;
      height: 34px;
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
      border-radius: var(--el-border-radius-base);
    }

    &__actions {
      flex-shrink: 0;
      gap: 8px;

      :deep(.el-button + .el-button) {
        margin-left: 0;
      }
    }

    &.is-compact {
      padding: 7px 9px;
      background: transparent;
      border-color: transparent;

      .art-ai-feedback__icon,
      .art-ai-feedback__copy small {
        display: none;
      }

      .art-ai-feedback__actions :deep(.el-button) {
        padding: 5px 8px;
      }
    }

    @media (width <= 640px) {
      flex-direction: column;
      align-items: flex-start;

      &__actions {
        width: 100%;

        :deep(.el-button) {
          flex: 1;
        }
      }

      &__copy {
        width: 100%;
      }
    }
  }

  .art-ai-feedback-dialog {
    display: grid;
    gap: var(--art-space-3);

    &__intro {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      padding: 14px;
      background: var(--el-color-primary-light-9);
      border-color: var(--el-color-primary-light-8);

      > span {
        display: grid;
        flex: 0 0 36px;
        place-items: center;
        width: 36px;
        height: 36px;
        color: var(--el-color-primary);
        background: var(--el-bg-color);
        border-radius: var(--el-border-radius-base);
      }

      > div {
        display: grid;
        gap: 4px;
        min-width: 0;
      }

      strong {
        font-size: 14px;
        color: var(--el-text-color-primary);
      }

      p {
        margin: 0;
        font-size: 12px;
        line-height: 1.6;
        color: var(--el-text-color-secondary);
      }
    }

    :deep(.art-form) {
      padding-right: 0;
      padding-left: 0;
    }
  }
</style>
