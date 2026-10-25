<template>
  <ArtDialog ref="dialogRef" size="lg">
    <div class="system-param-dialog">
      <ArtSectionCard class="system-param-dialog__form" preserve-content-structure>
        <template #header>
          <div class="system-param-dialog__section-head">
            <div>
              <ArtSectionTitle :show-line="false">参数信息</ArtSectionTitle>
              <p>配置键名、分组和值内容，保存后可刷新缓存使新值生效。</p>
            </div>
            <ElTag round :type="formState.model.builtin ? 'warning' : 'info'" effect="light">
              {{ formState.model.builtin ? '内置参数' : '自定义参数' }}
            </ElTag>
          </div>
        </template>

        <div class="system-param-dialog__form-body">
          <ArtForm
            ref="formRef"
            v-model="formState.model"
            :items="formState.items.value"
            :rules="formState.rules.value"
            :span="12"
            :gutter="20"
            label-position="top"
            label-width="auto"
            :show-reset="false"
            :show-submit="false"
            :validate-on-rule-change="false"
          >
            <template #defaultValue v-if="formState.model.paramType === 'json'">
              <button
                type="button"
                class="system-param-dialog__json-trigger"
                @click="openJsonEditor('defaultValue', '默认值')"
              >
                <span>{{ formState.model.defaultValue || '点击编辑 JSON 默认值' }}</span>
                <ArtSvgIcon icon="ri:code-s-slash-line" />
              </button>
            </template>
            <template #paramValue>
              <button
                v-if="formState.model.paramType === 'json'"
                type="button"
                class="system-param-dialog__json-trigger"
                @click="openJsonEditor('paramValue', '参数值')"
              >
                <span>{{ formState.model.paramValue || '点击编辑 JSON 参数值' }}</span>
                <ArtSvgIcon icon="ri:code-s-slash-line" />
              </button>
              <ElSelect
                v-else-if="isRegistrationRoleParam"
                v-model="formState.model.paramValue"
                class="system-param-dialog__full-control"
                filterable
                :loading="registrationRoleLoading"
                placeholder="请选择新用户注册后的默认角色"
              >
                <ElOption
                  v-for="role in registrationRoleOptions"
                  :key="role.id"
                  :label="`${role.roleName}（${role.roleCode}）`"
                  :value="role.id"
                >
                  <div class="system-param-dialog__role-option">
                    <span>{{ role.roleName }}</span>
                    <small>{{ role.roleCode }}</small>
                  </div>
                </ElOption>
              </ElSelect>
              <ElInput
                v-else-if="formState.model.paramType === 'single_text'"
                v-model="formState.model.paramValue"
                maxlength="500"
                show-word-limit
                placeholder="请输入参数值"
              />
              <ElInput
                v-else-if="formState.model.paramType === 'multi_text'"
                v-model="formState.model.paramValue"
                type="textarea"
                :rows="5"
                maxlength="5000"
                show-word-limit
                placeholder="请输入多行文本内容"
              />
              <ElInputNumber
                v-else-if="formState.model.paramType === 'number'"
                v-model="numberParamValue"
                placeholder="请输入数字"
                class="!w-full"
              />
              <ElSelect
                v-else-if="formState.model.paramType === 'boolean'"
                v-model="formState.model.paramValue"
                placeholder="请选择布尔值"
                class="system-param-dialog__full-control"
              >
                <ElOption
                  v-for="option in booleanOptions"
                  :key="String(option.value)"
                  :label="option.label"
                  :value="String(option.value)"
                />
              </ElSelect>
            </template>
            <template #extendConfigText v-if="formState.model.paramType === 'json'">
              <button
                type="button"
                class="system-param-dialog__json-trigger"
                @click="openJsonEditor('extendConfigText', '扩展配置')"
              >
                <span>{{ formState.model.extendConfigText || '点击编辑 JSON 扩展配置' }}</span>
                <ArtSvgIcon icon="ri:code-s-slash-line" />
              </button>
            </template>
          </ArtForm>
        </div>
      </ArtSectionCard>

      <aside class="system-param-dialog__side" aria-label="参数配置辅助信息">
        <ArtSectionCard
          class="system-param-dialog__preview"
          preserve-content-structure
          title="配置预览"
        >
          <dl>
            <div>
              <dt>键名</dt>
              <dd translate="no">{{ formState.model.paramKey || '-' }}</dd>
            </div>
            <div>
              <dt>分组</dt>
              <dd>{{ formState.model.groupName || '-' }}</dd>
            </div>
            <div class="system-param-dialog__preview-grid">
              <div>
                <dt>类型</dt>
                <dd
                  ><ElTag effect="plain">{{ typeLabel || '-' }}</ElTag></dd
                >
              </div>
              <div>
                <dt>状态</dt>
                <dd>
                  <ElTag :type="formState.model.enabled ? 'success' : 'info'" effect="light">
                    {{ formState.model.enabled ? '启用' : '停用' }}
                  </ElTag>
                </dd>
              </div>
            </div>
            <div>
              <dt>值预览</dt>
              <dd class="system-param-dialog__value-preview" translate="no">
                {{ previewValue }}
              </dd>
            </div>
          </dl>
        </ArtSectionCard>

        <ArtSectionCard
          class="system-param-dialog__tips"
          preserve-content-structure
          title="维护建议"
        >
          <ul>
            <li>键名建议采用“业务域.模块.字段”的层级命名。</li>
            <li>内置参数用于平台底层策略，建议限制删除和变更范围。</li>
            <li>JSON 类型可承载复杂配置，但需要保持结构稳定。</li>
            <li>修改完成后建议执行一次缓存刷新，确保新值及时生效。</li>
          </ul>
        </ArtSectionCard>
      </aside>
    </div>
    <JsonValueDrawer ref="jsonDrawerRef" />
  </ArtDialog>
</template>
<script setup lang="ts">
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import type { FormRules } from 'element-plus'
  import type { ComputedRef } from 'vue'
  import { cloneDeep, omit } from 'lodash-es'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtSectionTitle from '@/components/core/surfaces/art-section-title/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import JsonValueDrawer from './json-value-drawer.vue'
  import {
    addSystemParam,
    editSystemParam,
    fetchRegistrationRoleOptions
  } from '@/api/system-manage/system-param'
  import { useUserStore } from '@/store/modules/user'
  import { uniqueValidator } from '@/utils/form/validator'

  type SystemParam = Api.SystemManage.SystemParamItem
  type SystemParamType = Api.SystemManage.SystemParamType

  interface SystemParamForm extends Omit<SystemParam, 'extendConfig'> {
    extendConfigText: string
  }

  interface ArtFormExpose {
    validate: () => Promise<boolean | void>
    clearValidate: () => void
  }

  interface SystemParamFormState {
    model: SystemParamForm
    items: ComputedRef<FormItem[]>
    rules: ComputedRef<FormRules<SystemParamForm>>
  }

  const emit = defineEmits<{
    success: [type: 'add' | 'edit']
  }>()

  const dialogRef = ref<ArtDialogExpose<SystemParam | undefined>>()
  const formRef = ref<ArtFormExpose>()
  const jsonDrawerRef = ref<InstanceType<typeof JsonValueDrawer>>()
  const registrationRoleLoading = ref(false)
  const registrationRoleOptions = shallowRef<Api.SystemManage.RegistrationRoleOption[]>([])
  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)

  const createInitialForm = (): SystemParamForm => ({
    id: undefined,
    paramName: '',
    paramKey: '',
    groupCode: '',
    groupName: '',
    paramType: 'single_text',
    defaultValue: '',
    paramValue: '',
    extendConfigText: '',
    enabled: true,
    builtin: false,
    sort: 1,
    remark: ''
  })

  const groupOptions = computed(() => getDictMap.value.systemParamGroup ?? [])
  const typeOptions = computed(() => getDictMap.value.systemParamType ?? [])
  const booleanOptions = computed(() => getDictMap.value.commonBoolean ?? [])

  const openJsonEditor = (
    key: 'defaultValue' | 'paramValue' | 'extendConfigText',
    label: string
  ) => {
    void jsonDrawerRef.value?.handleOpen({
      label,
      paramKey: formModel.paramKey,
      fieldKey: key,
      value: formModel[key] ?? '',
      onApply: (value) => {
        formModel[key] = value
        void nextTick(() => formRef.value?.clearValidate())
      }
    })
  }

  const formModel = reactive<SystemParamForm>(createInitialForm())
  const isRegistrationRoleParam = computed(
    () => formModel.paramKey === 'registration.default_role_id'
  )
  const isUnsupportedRuntimeParam = computed(() =>
    [
      'audit.logs.retention_days',
      'audit.security.login_fail_threshold',
      'audit.security.login_fail_window_minutes'
    ].includes(formModel.paramKey)
  )

  const formState: SystemParamFormState = {
    model: formModel,
    items: computed<FormItem[]>(() => [
      {
        label: '基础信息',
        key: 'basicInfoTitle',
        type: 'divider',
        span: 24
      },
      {
        label: '参数名称',
        key: 'paramName',
        type: 'input',
        props: {
          maxlength: 100,
          placeholder: '例如：密码最小长度'
        },
        description: '使用业务人员能够理解的名称，方便检索与审计。'
      },
      {
        label: '参数键名',
        key: 'paramKey',
        type: 'input',
        props: {
          maxlength: 150,
          disabled: !!formModel.id,
          placeholder: '例如：security.password.min_length'
        },
        description: '保存后不可修改，建议采用“业务域.模块.字段”的稳定命名。'
      },
      {
        label: '分组',
        key: 'groupCode',
        type: 'select',
        props: {
          options: groupOptions.value,
          placeholder: '请选择分组',
          onChange: handleGroupChange
        }
      },
      {
        label: '排序',
        key: 'sort',
        type: 'number',
        props: {
          min: 0,
          step: 1,
          stepStrictly: true,
          controlsPosition: 'right',
          style: { width: '100%' }
        }
      },
      {
        label: '参数类型',
        key: 'paramType',
        type: 'select',
        props: {
          options: typeOptions.value,
          placeholder: '请选择参数类型',
          onChange: handleTypeChange
        },
        description: '切换类型会重置当前参数值，请确认后操作。'
      },
      {
        label: '状态与内容',
        key: 'statusContentTitle',
        type: 'divider',
        span: 24
      },
      {
        label: '状态',
        key: 'enabled',
        type: 'switch',
        span: 6,
        props: { disabled: isUnsupportedRuntimeParam.value },
        description: isUnsupportedRuntimeParam.value
          ? '尚未接入执行入口，当前不可启用；原值保留供后续接入。'
          : '停用后不再参与有效参数读取。'
      },
      {
        label: '内置参数',
        key: 'builtin',
        type: 'switch',
        span: 6,
        props: {
          disabled: formState.model.id && formState.model.builtin
        },
        description: '内置参数受平台保护，不能删除。'
      },
      {
        label: '默认值',
        key: 'defaultValue',
        type: 'input',
        span: 24,
        props: {
          maxlength: 500,
          placeholder: '可选，用于记录兜底值或回滚基线'
        }
      },
      {
        label: '参数值',
        key: 'paramValue',
        type: 'input',
        span: 24
      },
      {
        label: '扩展配置',
        key: 'extendConfigText',
        type: 'input',
        span: 24,
        props: {
          type: 'textarea',
          rows: 4,
          maxlength: 5000,
          showWordLimit: true,
          placeholder: '可选，支持 JSON 对象，如下拉选项、说明元数据等'
        }
      },
      {
        label: '备注',
        key: 'remark',
        type: 'input',
        span: 24,
        props: {
          type: 'textarea',
          rows: 3,
          maxlength: 255,
          showWordLimit: true,
          placeholder: '请输入参数用途、影响范围或维护说明'
        }
      }
    ]),
    rules: computed<FormRules<SystemParamForm>>(() => ({
      paramName: [{ required: true, message: '请输入参数名称', trigger: 'blur' }],
      paramKey: [
        { required: true, message: '请输入参数键名', trigger: 'blur' },
        {
          pattern: /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/,
          message: '键名需使用小写字母、数字、下划线和点号分层，例如 security.password.min_length',
          trigger: 'blur'
        },
        {
          validator: uniqueValidator({
            table: 'sys_param',
            field: 'param_key',
            getExcludeId: (): string | undefined => formModel.id,
            message: '参数键名已存在'
          }),
          trigger: 'blur'
        }
      ],
      groupCode: [{ required: true, message: '请选择分组', trigger: 'change' }],
      paramType: [{ required: true, message: '请选择参数类型', trigger: 'change' }],
      paramValue: [
        { required: true, message: '请输入参数值', trigger: 'blur' },
        { validator: validateParamValue, trigger: 'blur' }
      ],
      defaultValue: [{ validator: validateDefaultValue, trigger: 'change' }],
      extendConfigText: [{ validator: validateExtendConfig, trigger: 'blur' }]
    }))
  }

  const typeLabel = computed(
    () => typeOptions.value.find((item) => item.value === formState.model.paramType)?.label ?? ''
  )
  const previewValue = computed(() => {
    if (formState.model.paramValue === '') return '-'
    if (isRegistrationRoleParam.value) {
      const role = registrationRoleOptions.value.find(
        (item) => item.id === formState.model.paramValue
      )
      return role ? `${role.roleName}（${role.roleCode}）` : '正在读取角色信息…'
    }
    return formState.model.paramValue.length > 120
      ? `${formState.model.paramValue.slice(0, 120)}…`
      : formState.model.paramValue
  })
  const numberParamValue = computed<number | undefined>({
    get: () => {
      if (formState.model.paramValue === '') return undefined
      const value = Number(formState.model.paramValue)
      return Number.isNaN(value) ? undefined : value
    },
    set: (value) => {
      formState.model.paramValue = value === undefined ? '' : String(value)
    }
  })

  const handleGroupChange = (value: string): void => {
    const group = groupOptions.value.find((item) => item.value === value)
    formState.model.groupName = group?.label ?? ''
  }

  const handleTypeChange = (value: SystemParamType): void => {
    if (value === 'boolean') {
      formState.model.paramValue = 'true'
      formState.model.defaultValue = formState.model.defaultValue || 'true'
      return
    }

    if (value === 'json') {
      formState.model.paramValue = '{}'
      formState.model.defaultValue = formState.model.defaultValue || '{}'
      return
    }

    formState.model.paramValue = ''
  }

  const validateParamValue = (_rule: unknown, value: string, callback: (error?: Error) => void) => {
    if (formState.model.paramType === 'number' && Number.isNaN(Number(value))) {
      callback(new Error('参数值必须是数字'))
      return
    }

    if (formState.model.paramType === 'boolean' && !['true', 'false'].includes(String(value))) {
      callback(new Error('参数值必须选择 true 或 false'))
      return
    }

    if (formState.model.paramType === 'json') {
      try {
        const parsed = JSON.parse(value)
        if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
          callback(new Error('参数值必须是 JSON 对象'))
          return
        }
      } catch {
        callback(new Error('请输入合法 JSON'))
        return
      }
    }

    callback()
  }

  const validateDefaultValue = (
    _rule: unknown,
    value: string,
    callback: (error?: Error) => void
  ) => {
    if (formState.model.paramType !== 'json' || !value) return callback()
    try {
      const parsed: unknown = JSON.parse(value)
      callback(
        parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? undefined
          : new Error('默认值必须是 JSON 对象')
      )
    } catch {
      callback(new Error('默认值不是合法 JSON'))
    }
  }

  const validateExtendConfig = (
    _rule: unknown,
    value: string,
    callback: (error?: Error) => void
  ) => {
    if (!value) {
      callback()
      return
    }

    try {
      const parsed = JSON.parse(value)
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
        callback(new Error('扩展配置必须是 JSON 对象'))
        return
      }
    } catch {
      callback(new Error('请输入合法 JSON'))
      return
    }

    callback()
  }

  const resetForm = async (): Promise<void> => {
    Object.assign(formState.model, createInitialForm())
    await nextTick()
    formRef.value?.clearValidate()
  }

  const initializeForm = (row: SystemParam): void => {
    Object.assign(formState.model, {
      ...createInitialForm(),
      ...cloneDeep(omit(row, ['extendConfig'])),
      extendConfigText: row.extendConfig ? JSON.stringify(row.extendConfig, null, 2) : ''
    })
  }

  const buildPayload = (): SystemParam => {
    const raw = toRaw(formState.model)
    const group = groupOptions.value.find((item) => item.value === raw.groupCode)
    const payload = omit(raw, [
      'extendConfigText',
      'tenantId',
      'createBy',
      'createTime',
      'updateBy',
      'updateTime'
    ]) as SystemParam

    return {
      ...payload,
      groupName: group?.label ?? raw.groupName,
      defaultValue: raw.defaultValue === '' ? null : raw.defaultValue,
      extendConfig: raw.extendConfigText ? JSON.parse(raw.extendConfigText) : {}
    }
  }

  const handleSubmit = async (): Promise<boolean> => {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
    } catch (error) {
      notifyFriendlyError(error, '表单校验未完成，请稍后重试', 'warning')
      return false
    }

    try {
      const payload = buildPayload()
      if (formState.model.id) {
        await editSystemParam(payload)
      } else {
        await addSystemParam(payload)
      }
      emit('success', formState.model.id ? 'edit' : 'add')
      return true
    } catch (error) {
      notifyFriendlyError(error, '系统参数保存失败，请检查格式后重试', 'warning')
      return false
    }
  }

  const handleOpen = async (row?: SystemParam): Promise<void> => {
    await resetForm()
    if (row?.id) {
      initializeForm(row)
    }
    if (!formState.model.groupName && formState.model.groupCode) {
      handleGroupChange(formState.model.groupCode)
    }

    await dialogRef.value?.handleOpen(row, {
      title: row?.id ? '编辑参数' : '新增参数',
      contentMaxHeight: '72vh',
      confirmText: row?.id ? '保存修改' : '创建参数',
      loading: isRegistrationRoleParam.value,
      loadingText: '正在加载注册角色…',
      onOpen: async (_openData, api) => {
        if (!isRegistrationRoleParam.value) return
        registrationRoleLoading.value = true
        try {
          const { data } = await fetchRegistrationRoleOptions()
          registrationRoleOptions.value = data ?? []
        } finally {
          registrationRoleLoading.value = false
          api.setLoading(false)
        }
      },
      onConfirm: handleSubmit,
      onReset: () => void resetForm()
    })
  }

  defineExpose({
    handleOpen
  })
</script>

<style scoped lang="scss">
  .system-param-dialog {
    position: relative;
    display: flex;
    gap: 12px;
    align-items: flex-start;

    &__form {
      flex: 1;
      min-width: 0;
    }

    &__section-head {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      justify-content: space-between;
      padding: 16px 16px 12px;
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

    &__form-body {
      :deep(.art-form) {
        padding: 12px 16px 4px !important;
      }

      :deep(.el-form-item) {
        margin-bottom: 18px;
      }

      :deep(.el-form-item__label) {
        align-items: center;
        height: auto;
        margin-bottom: 6px;
        line-height: 1.4;
      }
    }

    &__full-control {
      width: 100%;
    }

    &__json-trigger {
      display: flex;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      min-height: 40px;
      padding: 8px 12px;
      color: var(--el-text-color-regular);
      text-align: left;
      cursor: pointer;
      background: var(--el-fill-color-blank);
      border: 1px solid var(--el-border-color);
      border-radius: var(--el-border-radius-base);

      &:focus-visible {
        outline: 2px solid var(--el-color-primary);
        outline-offset: 2px;
      }

      span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }

    &__role-option {
      display: flex;
      gap: 12px;
      align-items: center;
      justify-content: space-between;

      small {
        color: var(--el-text-color-secondary);
      }
    }

    &__side {
      position: sticky;
      top: 0;
      display: flex;
      flex: 0 0 230px;
      flex-direction: column;
      gap: 12px;
      align-self: flex-start;
      width: 230px;
    }

    &__preview,
    &__tips {
      padding: 14px;

      :deep(.art-section-title) {
        margin: 0 0 14px;
      }
    }

    &__preview {
      dl {
        margin: 0;
      }

      dt {
        margin-bottom: 5px;
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }

      dd {
        min-width: 0;
        margin: 0 0 12px;
        font-size: 13px;
        color: var(--el-text-color-primary);
        overflow-wrap: anywhere;

        .el-tag {
          max-width: 100%;
        }
      }
    }

    &__preview-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    &__value-preview {
      min-height: 34px;
      padding: 9px 10px;
      background: var(--el-fill-color-lighter);
      border: 1px solid var(--el-border-color-lighter);
      border-radius: var(--art-control-radius);
    }

    &__tips {
      ul {
        padding-left: 18px;
        margin: 0;
        list-style: disc;
      }

      li {
        margin-bottom: 10px;
        font-size: 12px;
        line-height: 1.7;
        color: var(--el-text-color-secondary);
      }
    }

    &__full-control {
      width: 100%;
    }
  }

  @media (width <= 900px) {
    .system-param-dialog {
      &__side {
        display: none;
      }
    }
  }
</style>
