<template>
  <ArtDialog ref="dialogRef" size="lg" :dialog-props="{ appendToBody: true }">
    <div class="number-rule-dialog">
      <ArtSectionCard class="number-rule-dialog__main" preserve-content-structure>
        <template #header>
          <header class="number-rule-dialog__header">
            <div>
              <ArtSectionTitle :show-line="false">生成策略</ArtSectionTitle>
              <p>切换自动编码或手工填写，并维护正式入库时使用的编号模板。</p>
            </div>
            <ElTag :type="formModel.autoEnabled ? 'success' : 'warning'" round>
              {{ formModel.autoEnabled ? '系统自动取号' : '业务人员手工填写' }}
            </ElTag>
          </header>
        </template>

        <div class="number-rule-dialog__identity">
          <div>
            <span>规则名称</span>
            <strong>{{ formModel.ruleName }}</strong>
          </div>
          <div>
            <span>规则键</span>
            <code translate="no">{{ formModel.ruleKey }}</code>
          </div>
          <div>
            <span>生效租户</span>
            <strong>{{ tenantName }}</strong>
          </div>
          <div>
            <span>目标字段</span>
            <code translate="no">{{ formModel.targetTable }}.{{ formModel.targetColumn }}</code>
          </div>
        </div>

        <ElAlert
          v-if="!formModel.autoEnabled"
          type="warning"
          :closable="false"
          show-icon
          title="关闭自动编码后，新建业务数据必须填写编号；数据库仍会执行非空与唯一性校验。"
        />

        <ArtForm
          ref="formRef"
          :model-value="formModel"
          @update:model-value="replaceReactiveModel(formModel, $event)"
          :items="formItems"
          :rules="formRules"
          :span="12"
          :gutter="20"
          label-position="top"
          label-width="auto"
          :show-reset="false"
          :show-submit="false"
          :validate-on-rule-change="false"
        >
          <template #template>
            <ElInput
              v-model="formModel.template"
              maxlength="80"
              show-word-limit
              placeholder="例如：YD{YYYYMM}-{SEQ:3}"
            />
            <div class="number-rule-dialog__tokens" aria-label="可用模板令牌">
              <ElButton
                v-for="token in templateTokens"
                :key="token"
                size="small"
                plain
                @click="appendToken(token)"
              >
                {{ token }}
              </ElButton>
            </div>
          </template>
        </ArtForm>
      </ArtSectionCard>

      <aside class="number-rule-dialog__side" aria-label="编号预览与规则说明">
        <ArtSectionCard
          class="number-rule-dialog__preview"
          preserve-content-structure
          title="下一个编号预览"
        >
          <code translate="no">{{ previewText }}</code>
          <dl>
            <div>
              <dt>当前周期</dt>
              <dd>{{ formModel.currentPeriodKey || '永久累计' }}</dd>
            </div>
            <div>
              <dt>当前流水</dt>
              <dd>{{ formModel.currentValue ?? '尚未取号' }}</dd>
            </div>
            <div>
              <dt>规则版本</dt>
              <dd>V{{ formModel.ruleVersion }}</dd>
            </div>
          </dl>
        </ArtSectionCard>

        <ArtSectionCard
          class="number-rule-dialog__tips"
          preserve-content-structure
          title="生效规则"
        >
          <ul>
            <li>模板必须包含且只能包含一个 <code>{SEQ:n}</code>。</li>
            <li>修改模板、周期、起始值或时区后会自动启用新版本计数器。</li>
            <li>每月重置时，进入新月份后的第一张单会从起始值重新编码。</li>
            <li>正式编号由数据库事务生成，页面预览不占用流水号。</li>
          </ul>
        </ArtSectionCard>
      </aside>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { replaceReactiveModel } from '@/utils/form/model'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import type { FormRules } from 'element-plus'
  import { cloneDeep } from 'lodash-es'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtSectionTitle from '@/components/core/surfaces/art-section-title/index.vue'
  import { editDocumentNumberRule } from '@/api/document-number'
  import { renderDocumentNumber, validateDocumentNumberTemplate } from '@/utils/document-number'
  import { useUserStore } from '@/store/modules/user'

  type NumberRule = Api.SystemManage.DocumentNumberRuleItem

  interface FormExpose {
    validate: () => Promise<boolean | void>
    clearValidate: () => void
  }

  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<NumberRule>>()
  const formRef = ref<FormExpose>()
  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)

  const createInitialForm = (): NumberRule => ({
    tenantId: '',
    ruleKey: '',
    ruleName: '',
    category: 'business_document',
    targetTable: '',
    targetColumn: '',
    autoEnabled: true,
    template: 'YD{YYYYMM}-{SEQ:3}',
    resetCycle: 'month',
    sequenceStart: 1,
    timezone: 'Asia/Shanghai',
    ruleVersion: 1,
    manualRequired: true,
    builtin: true,
    enabled: true,
    remark: ''
  })

  const formModel = reactive<NumberRule>(createInitialForm())
  const resetCycleOptions = computed(() => getDictMap.value.documentNumberResetCycle ?? [])
  const tenantName = computed(
    () => formModel.tenant?.tenantName || formModel.tenant?.tenantCode || '当前租户'
  )
  const previewText = computed(() => {
    if (!formModel.autoEnabled) return '手工填写'
    try {
      return renderDocumentNumber(
        formModel.template,
        formModel.nextValue ?? formModel.sequenceStart,
        formModel.timezone
      )
    } catch {
      return '模板或时区无效'
    }
  })
  const templateTokens = [
    '{YYYYMMDD}',
    '{YYYYMM}',
    '{YYMM}',
    '{YYYY}',
    '{YY}',
    '{MM}',
    '{DD}',
    '{SEQ:3}',
    '{SEQ:4}',
    '{SEQ:6}'
  ]

  const formItems = computed<FormItem[]>(() => [
    {
      label: '自动编码',
      key: 'autoEnabled',
      type: 'switch',
      span: 12,
      description: '启用后忽略页面传入值，由数据库在保存时生成唯一编号。'
    },
    {
      label: '重置周期',
      key: 'resetCycle',
      type: 'select',
      span: 12,
      props: {
        options: resetCycleOptions.value,
        placeholder: '请选择重置周期'
      },
      description: '周期切换时自动创建新的流水计数。'
    },
    {
      label: '编号模板',
      key: 'template',
      type: 'input',
      span: 24,
      description: '日期令牌可以自由组合；SEQ 后的数字表示流水号补零长度。'
    },
    {
      label: '流水起始值',
      key: 'sequenceStart',
      type: 'number',
      span: 12,
      props: {
        min: 1,
        max: 999999999999,
        step: 1,
        stepStrictly: true,
        controlsPosition: 'right',
        style: { width: '100%' }
      }
    },
    {
      label: '业务时区',
      key: 'timezone',
      type: 'input',
      span: 12,
      props: {
        maxlength: 64,
        placeholder: '例如：Asia/Shanghai'
      }
    },
    {
      label: '维护说明',
      key: 'remark',
      type: 'input',
      span: 24,
      props: {
        type: 'textarea',
        rows: 3,
        maxlength: 255,
        showWordLimit: true,
        placeholder: '填写规则用途、调整原因或影响范围'
      }
    }
  ])

  const formRules = computed<FormRules<NumberRule>>(() => ({
    template: [
      { required: true, message: '请输入编号模板', trigger: 'blur' },
      {
        validator: (_rule, value: string, callback) => {
          const message = validateDocumentNumberTemplate(value)
          callback(message ? new Error(message) : undefined)
        },
        trigger: 'blur'
      }
    ],
    resetCycle: [{ required: true, message: '请选择重置周期', trigger: 'change' }],
    sequenceStart: [{ required: true, message: '请输入流水起始值', trigger: 'blur' }],
    timezone: [{ required: true, message: '请输入业务时区', trigger: 'blur' }]
  }))

  const appendToken = (token: string): void => {
    if (token.startsWith('{SEQ:')) {
      formModel.template = formModel.template.replace(/\{SEQ:[1-9][0-9]?\}/, '')
    }
    formModel.template += token
  }

  const handleSubmit = async (): Promise<boolean> => {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
    } catch (error) {
      notifyFriendlyError(error, '表单校验未完成，请稍后重试', 'warning')
      return false
    }
    if (!formModel.id) return false

    try {
      await editDocumentNumberRule({
        id: formModel.id,
        autoEnabled: formModel.autoEnabled,
        template: formModel.template,
        resetCycle: formModel.resetCycle,
        sequenceStart: formModel.sequenceStart,
        timezone: formModel.timezone,
        remark: formModel.remark
      })
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '编号规则保存失败，请检查模板后重试', 'warning')
      return false
    }
  }

  const handleOpen = async (row: NumberRule): Promise<void> => {
    Object.assign(formModel, createInitialForm(), cloneDeep(row))
    await nextTick()
    formRef.value?.clearValidate()
    await dialogRef.value?.handleOpen(row, {
      title: `编辑编号规则 · ${row.ruleName}`,
      contentMaxHeight: '74vh',
      confirmText: '保存并生效',
      onConfirm: handleSubmit
    })
  }

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .number-rule-dialog {
    display: flex;
    gap: 12px;
    align-items: flex-start;

    &__main {
      flex: 1;
      min-width: 0;
      overflow: hidden;
    }

    &__header {
      display: flex;
      gap: 16px;
      align-items: flex-start;
      justify-content: space-between;
      padding: 16px;
      border-bottom: 1px solid var(--el-border-color-lighter);

      :deep(.art-section-title) {
        margin: 0 0 4px;
      }

      p {
        margin: 0;
        font-size: 12px;
        line-height: 1.6;
        color: var(--el-text-color-secondary);
      }
    }

    &__identity {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      padding: 14px 16px;
      background: var(--el-fill-color-lighter);

      div {
        min-width: 0;
      }

      span {
        display: block;
        margin-bottom: 4px;
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }

      strong,
      code {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 13px;
        color: var(--el-text-color-primary);
        white-space: nowrap;
      }
    }

    :deep(.el-alert) {
      margin: 14px 16px 0;
    }

    :deep(.art-form) {
      padding: 16px 16px 4px !important;
    }

    &__tokens {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 8px;

      .el-button + .el-button {
        margin-left: 0;
      }
    }

    &__side {
      position: sticky;
      top: 0;
      display: flex;
      flex: 0 0 248px;
      flex-direction: column;
      gap: 12px;
      width: 248px;
    }

    &__preview,
    &__tips {
      padding: 14px;

      :deep(.art-section-title) {
        margin: 0 0 14px;
      }
    }

    &__preview > code {
      display: block;
      padding: 13px 10px;
      font-size: 15px;
      font-weight: 700;
      color: var(--el-color-primary);
      text-align: center;
      overflow-wrap: anywhere;
      background: var(--el-color-primary-light-9);
      border: 1px solid var(--el-color-primary-light-7);
      border-radius: var(--art-control-radius);
    }

    dl {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      margin: 12px 0 0;

      div {
        min-width: 0;
      }

      dt {
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }

      dd {
        margin: 3px 0 0;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 12px;
        font-weight: 600;
        color: var(--el-text-color-primary);
        white-space: nowrap;
      }
    }

    &__tips {
      ul {
        padding-left: 18px;
        margin: 0;
      }

      li {
        margin-bottom: 9px;
        font-size: 12px;
        line-height: 1.65;
        color: var(--el-text-color-secondary);
      }
    }
  }

  @media (width <= 900px) {
    .number-rule-dialog {
      &__side {
        display: none;
      }
    }
  }
</style>
