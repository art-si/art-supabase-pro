<template>
  <ArtDialog ref="dialogRef" size="lg">
    <div class="ai-prompt-dialog">
      <section class="ai-prompt-dialog__editor">
        <div class="ai-prompt-dialog__head">
          <div>
            <span>PROMPT VERSION</span>
            <strong>{{ headerTitle }}</strong>
            <p>这里只维护稳定的系统指令；页面上下文、工具结果和 JSON 结构由运行时安全追加。</p>
          </div>
          <ElTag type="warning" effect="light" round>草稿</ElTag>
        </div>

        <ElScrollbar class="ai-prompt-dialog__scrollbar">
          <ArtForm
            ref="formRef"
            v-model="form.model"
            :items="form.items.value"
            :rules="form.rules.value"
            :span="12"
            :gutter="20"
            label-position="top"
            label-width="auto"
            :show-reset="false"
            :show-submit="false"
            :validate-on-rule-change="false"
          />
        </ElScrollbar>
      </section>

      <ElScrollbar class="ai-prompt-dialog__guide">
        <section>
          <h3>当前版本</h3>
          <dl>
            <div>
              <dt>能力场景</dt>
              <dd>
                <ArtDictDisplay
                  v-if="form.model.feature"
                  dict-code="aiRunFeature"
                  :value="form.model.feature"
                  display="text"
                />
                <span v-else>尚未选择</span>
              </dd>
            </div>
            <div>
              <dt>版本号</dt>
              <dd>{{ form.model.version || '待填写' }}</dd>
            </div>
            <div>
              <dt>字符数</dt>
              <dd>{{ formatNumberValue(form.model.systemPrompt.length) }} / 16,000</dd>
            </div>
          </dl>
        </section>

        <section>
          <h3>编写原则</h3>
          <ul>
            <li>明确角色、能力边界和禁止事项。</li>
            <li>不要写入 API Key、客户隐私或真实业务数据。</li>
            <li>不要依赖页面内容改变系统级安全要求。</li>
            <li>一次只调整一个目标，便于观察效果与回滚。</li>
          </ul>
        </section>

        <section class="ai-prompt-dialog__flow">
          <h3>版本流程</h3>
          <div><i class="is-draft" />草稿可反复编辑</div>
          <div><i class="is-published" />发布后新请求生效</div>
          <div><i class="is-archived" />旧版本保留可回滚</div>
        </section>
      </ElScrollbar>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { formatNumberValue } from '@/utils/ui/format'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import type { FormRules } from 'element-plus'
  import type { ComputedRef } from 'vue'
  import { cloneDeep, omit } from 'lodash-es'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import { useUserStore } from '@/store/modules/user'
  import {
    createAiPromptDraft,
    updateAiPromptDraft,
    type AiPromptTemplate,
    type AiPromptWritePayload
  } from '@/api/ai-prompt'

  type OpenMode = 'create' | 'edit' | 'clone'

  export interface AiPromptDialogOpenData {
    mode: OpenMode
    row?: AiPromptTemplate
  }

  interface PromptFormModel {
    id?: string
    feature: string
    version: string
    name: string
    description: string
    systemPrompt: string
    changeNote: string
  }

  interface ArtFormExpose {
    validate: () => Promise<boolean | void>
    clearValidate: () => void
  }

  interface FormGroup {
    model: PromptFormModel
    items: ComputedRef<FormItem[]>
    rules: ComputedRef<FormRules<PromptFormModel>>
  }

  const emit = defineEmits<{ success: [] }>()

  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)
  const dialogRef = ref<ArtDialogExpose<AiPromptDialogOpenData>>()
  const formRef = ref<ArtFormExpose>()
  const openMode = ref<OpenMode>('create')

  const createInitialForm = (): PromptFormModel => ({
    id: undefined,
    feature: '',
    version: '',
    name: '',
    description: '',
    systemPrompt: '',
    changeNote: ''
  })

  const formModel = reactive<PromptFormModel>(createInitialForm())
  const form: FormGroup = {
    model: formModel,
    items: computed<FormItem[]>(() => [
      {
        label: '版本信息',
        key: 'versionDivider',
        type: 'divider',
        span: 24
      },
      {
        label: '能力场景',
        key: 'feature',
        type: 'select',
        props: {
          options: getDictMap.value.aiRunFeature ?? [],
          placeholder: '请选择能力场景',
          disabled: openMode.value === 'edit'
        }
      },
      {
        label: '版本号',
        key: 'version',
        type: 'input',
        props: {
          maxlength: 32,
          placeholder: '例如 v2、2026.08.02',
          disabled: openMode.value === 'edit'
        }
      },
      {
        label: '版本名称',
        key: 'name',
        type: 'input',
        span: 24,
        props: {
          maxlength: 100,
          placeholder: '说明这个版本解决什么问题'
        }
      },
      {
        label: '版本说明',
        key: 'description',
        type: 'input',
        span: 24,
        props: {
          type: 'textarea',
          rows: 2,
          maxlength: 500,
          showWordLimit: true,
          placeholder: '可选，描述适用范围和预期效果'
        }
      },
      {
        label: '系统指令',
        key: 'systemPrompt',
        type: 'input',
        span: 24,
        help: '运行时会在这段指令之后追加受保护的页面上下文、工具结果或结构化输出约束。',
        props: {
          type: 'textarea',
          rows: 14,
          maxlength: 16000,
          showWordLimit: true,
          resize: 'vertical',
          placeholder: '请定义 AI 的角色、任务目标、事实边界、禁止事项与回答风格'
        }
      },
      {
        label: '变更说明',
        key: 'changeNote',
        type: 'input',
        span: 24,
        props: {
          type: 'textarea',
          rows: 2,
          maxlength: 500,
          showWordLimit: true,
          placeholder: '记录本次调整内容，便于发布审计与回滚判断'
        }
      }
    ]),
    rules: computed<FormRules<PromptFormModel>>(() => ({
      feature: [{ required: true, message: '请选择能力场景', trigger: 'change' }],
      version: [
        { required: true, message: '请输入版本号', trigger: 'blur' },
        {
          pattern: /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/,
          message: '仅支持字母、数字、点、下划线和短横线，最长 32 位',
          trigger: 'blur'
        }
      ],
      name: [{ required: true, message: '请输入版本名称', trigger: 'blur' }],
      systemPrompt: [
        { required: true, message: '请输入系统指令', trigger: 'blur' },
        { min: 20, message: '系统指令至少需要 20 个字符', trigger: 'blur' }
      ]
    }))
  }

  const headerTitle = computed(() => {
    const titleMap: Record<OpenMode, string> = {
      create: '创建一个全新的 Prompt 草稿',
      edit: '编辑当前 Prompt 草稿',
      clone: '基于历史内容创建新版本'
    }
    return titleMap[openMode.value]
  })

  async function resetForm(): Promise<void> {
    Object.assign(form.model, createInitialForm())
    await nextTick()
    formRef.value?.clearValidate()
  }

  function initializeForm(data: AiPromptDialogOpenData): void {
    const row = data.row
    if (!row) return
    const base = cloneDeep(
      omit(row, [
        'tenantId',
        'metadata',
        'status',
        'publishedAt',
        'publishedBy',
        'createBy',
        'createTime',
        'updateBy',
        'updateTime'
      ])
    )
    Object.assign(form.model, createInitialForm(), base, {
      id: data.mode === 'edit' ? row.id : undefined,
      version: data.mode === 'clone' ? '' : row.version,
      name: data.mode === 'clone' ? `${row.name}（新版本）` : row.name,
      changeNote: data.mode === 'clone' ? '' : (row.changeNote ?? ''),
      description: row.description ?? ''
    })
  }

  function buildPayload(): AiPromptWritePayload {
    const raw = toRaw(form.model)
    return {
      id: raw.id,
      feature: raw.feature,
      version: raw.version.trim(),
      name: raw.name.trim(),
      description: normalizeNullableText(raw.description),
      systemPrompt: raw.systemPrompt.trim(),
      changeNote: normalizeNullableText(raw.changeNote),
      status: 'draft',
      metadata: {}
    }
  }

  async function handleSubmit(): Promise<boolean> {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
    } catch (error) {
      notifyFriendlyError(error, '表单校验未完成，请稍后重试', 'warning')
      return false
    }

    try {
      const payload = buildPayload()
      if (openMode.value === 'edit') await updateAiPromptDraft(payload)
      else await createAiPromptDraft(payload)
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, 'Prompt 草稿保存失败，请稍后重试', 'warning')
      return false
    }
  }

  async function handleOpen(data: AiPromptDialogOpenData): Promise<void> {
    openMode.value = data.mode
    await resetForm()
    initializeForm(data)
    await dialogRef.value?.handleOpen(data, {
      title:
        data.mode === 'edit'
          ? '编辑 Prompt 草稿'
          : data.mode === 'clone'
            ? '复制为新版本'
            : '新建 Prompt 版本',
      dialogProps: { class: 'ai-prompt-dialog-shell' },
      onConfirm: handleSubmit,
      onReset: () => void resetForm()
    })
  }

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .ai-prompt-dialog {
    position: relative;
    display: flex;
    gap: 12px;
    min-width: 0;
    height: 72vh;
    min-height: 0;
    max-height: 620px;
    overflow: hidden;

    :deep(.el-tag) {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
    }

    :deep(.el-tag__content) {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      line-height: 1;
    }

    &__editor {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      border: 1px solid var(--el-border-color-light);
      border-radius: var(--el-border-radius-base);
    }

    &__head {
      display: flex;
      gap: 16px;
      align-items: flex-start;
      justify-content: space-between;
      padding: 16px 18px 13px;
      border-bottom: 1px solid var(--el-border-color-lighter);

      span {
        display: block;
        margin-bottom: 5px;
        font-size: 10px;
        font-weight: 700;
        color: var(--el-color-primary);
        letter-spacing: 0.12em;
      }

      strong {
        display: block;
        margin-bottom: 5px;
        font-size: 15px;
        color: var(--el-text-color-primary);
      }

      p {
        margin: 0;
        font-size: 12px;
        line-height: 1.6;
        color: var(--el-text-color-secondary);
      }
    }

    &__scrollbar {
      flex: 1;
      height: 100%;
      min-height: 0;
      overscroll-behavior: contain;

      :deep(.art-form) {
        padding: 12px 18px 4px !important;
      }

      :deep(.el-scrollbar__view) {
        min-height: 100%;
      }

      :deep(.el-form-item) {
        margin-bottom: 18px;
      }

      :deep(.el-textarea__inner) {
        font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
        line-height: 1.7;
      }
    }

    &__guide {
      flex: 0 0 238px;
      width: 238px;
      height: 100%;
      min-height: 0;
      overscroll-behavior: contain;

      :deep(.el-scrollbar__view) {
        display: grid;
        gap: 12px;
      }

      section {
        padding: 15px;
        border: 1px solid var(--el-border-color-light);
        border-radius: var(--el-border-radius-base);
      }

      h3 {
        margin: 0 0 13px;
        font-size: 14px;
        color: var(--el-text-color-primary);
      }

      dl,
      ul {
        margin: 0;
      }

      dl div {
        margin-bottom: 12px;
      }

      dt {
        margin-bottom: 4px;
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }

      dd {
        margin: 0;
        font-size: 13px;
        color: var(--el-text-color-primary);
        overflow-wrap: anywhere;
      }

      ul {
        padding-left: 17px;
      }

      li {
        margin-bottom: 9px;
        font-size: 12px;
        line-height: 1.65;
        color: var(--el-text-color-secondary);
      }
    }

    &__flow {
      div {
        display: flex;
        gap: 8px;
        align-items: center;
        margin-bottom: 10px;
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }

      i {
        width: 8px;
        height: 8px;
        border-radius: 50%;

        &.is-draft {
          background: var(--el-color-warning);
        }

        &.is-published {
          background: var(--el-color-success);
        }

        &.is-archived {
          background: var(--el-color-info);
        }
      }
    }
  }

  @media (width <= 900px) {
    .ai-prompt-dialog {
      height: 72vh;
      max-height: 620px;

      &__guide {
        display: none;
      }
    }
  }

  :global(.ai-prompt-dialog-shell > .el-dialog__body) {
    overflow: hidden;
  }
</style>
