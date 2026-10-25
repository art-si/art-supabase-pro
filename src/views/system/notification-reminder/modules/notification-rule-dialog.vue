<template>
  <ArtDialog ref="dialogRef" size="md">
    <div class="notification-rule-dialog">
      <section class="notification-rule-dialog__context">
        <span aria-hidden="true"><ArtSvgIcon icon="ri:timer-flash-line" /></span>
        <div>
          <strong>{{ form.id ? '调整提醒节奏' : '新增提醒规则' }}</strong>
          <p>每条规则对应一个触达阶段；例如提前 30 天一次、提前 7 天每天。</p>
        </div>
      </section>

      <ArtForm
        ref="formRef"
        :model-value="form"
        @update:model-value="replaceReactiveModel(form, $event)"
        :items="items"
        :rules="rules"
        :span="12"
        :gutter="18"
        label-width="104px"
        :show-reset="false"
        :show-submit="false"
      />
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { replaceReactiveModel } from '@/utils/form/model'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import { uniq } from 'lodash-es'
  import type { FormItemRule, FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import { saveNotificationRule } from '@/api/notification-reminder'
  import { fetchEnabledRoleList } from '@/api/system-manage'

  const notificationRecipientsModeOptions = useDictionaryOptions('notificationRecipientsMode')
  const notificationRepeatModeOptions = useDictionaryOptions('notificationRepeatMode')

  interface Props {
    tenantId: string
    scenarios: Api.NotificationReminder.Scenario[]
  }

  interface RuleForm extends Api.NotificationReminder.Rule {
    repeatMode: 'once' | 'repeat'
  }

  interface RuleFormExpose {
    validate: () => Promise<boolean>
    clearValidate: () => void
    reloadOptions: (key?: string) => Promise<unknown>
  }

  interface RoleOption {
    roleName: string
    roleCode: string
  }

  interface RoleSelectionState {
    loaded: boolean
    availableCodes: string[]
  }

  const props = defineProps<Props>()
  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<Api.NotificationReminder.Rule | undefined>>()
  const formRef = ref<RuleFormExpose>()

  const createInitialForm = (): RuleForm => ({
    id: undefined,
    tenantId: props.tenantId,
    scenarioId: props.scenarios[0]?.id ?? '',
    ruleName: '',
    leadDays: 30,
    repeatEveryDays: null,
    repeatMode: 'once',
    sendHour: 9,
    recipientStrategy: 'owner_then_roles',
    recipientRoleCodes: [],
    channels: ['in_app'],
    enabled: true
  })

  const form = reactive<RuleForm>(createInitialForm())
  const roleSelection = reactive<RoleSelectionState>({ loaded: false, availableCodes: [] })
  const unavailableRoleCodes = computed(() =>
    roleSelection.loaded
      ? form.recipientRoleCodes.filter((code) => !roleSelection.availableCodes.includes(code))
      : []
  )

  const isRoleOption = (value: unknown): value is RoleOption =>
    typeof value === 'object' &&
    value !== null &&
    'roleName' in value &&
    typeof value.roleName === 'string' &&
    'roleCode' in value &&
    typeof value.roleCode === 'string'

  const prepareRoleOptions = (result: unknown): { data: RoleOption[] } => {
    const activeRoles =
      typeof result === 'object' &&
      result !== null &&
      'data' in result &&
      Array.isArray(result.data)
        ? result.data.filter(isRoleOption)
        : []
    roleSelection.availableCodes = activeRoles.map((role) => role.roleCode)
    roleSelection.loaded = true

    const unavailableOptions = uniq(form.recipientRoleCodes)
      .filter((code) => !roleSelection.availableCodes.includes(code))
      .map<RoleOption>((code) => ({
        roleName: '已失效角色',
        roleCode: code
      }))

    return { data: [...activeRoles, ...unavailableOptions] }
  }

  const validateRoleSelection: NonNullable<FormItemRule['validator']> = (
    _rule,
    _value,
    callback
  ) => {
    if (unavailableRoleCodes.value.length) {
      callback(new Error('请移除已失效角色，并从下拉列表重新选择'))
      return
    }
    callback()
  }

  const rules: FormRules<RuleForm> = {
    scenarioId: [{ required: true, message: '请选择提醒场景', trigger: 'change' }],
    ruleName: [
      { required: true, message: '请输入规则名称', trigger: 'blur' },
      { max: 80, message: '规则名称不能超过 80 个字符', trigger: 'blur' }
    ],
    leadDays: [{ required: true, message: '请输入提前天数', trigger: 'blur' }],
    recipientRoleCodes: [
      {
        required: true,
        type: 'array',
        min: 1,
        message: '请至少选择一个通知角色',
        trigger: 'change'
      },
      {
        validator: validateRoleSelection,
        trigger: 'change'
      }
    ],
    channels: [{ required: true, type: 'array', min: 1, message: '请至少选择一个渠道' }]
  }

  const channelOptions = useDictionaryOptions('notificationChannel')

  const items = computed<FormItem[]>(() => [
    { label: '触发条件', key: 'triggerSection', type: 'divider', span: 24 },
    {
      label: '提醒场景',
      key: 'scenarioId',
      type: 'select',
      props: {
        options: props.scenarios.map((scenario) => ({
          label: `${scenario.scenarioName} · ${scenario.moduleCode.toUpperCase()}`,
          value: scenario.id
        }))
      }
    },
    {
      label: '规则名称',
      key: 'ruleName',
      type: 'input',
      props: { maxlength: 80, placeholder: '如：提前 30 天提醒一次' }
    },
    {
      label: '提前天数',
      key: 'leadDays',
      type: 'number',
      props: { min: 0, max: 3650, controlsPosition: 'right' },
      description: '0 表示到期当天开始提醒。'
    },
    {
      label: '执行时段',
      key: 'sendHour',
      type: 'select',
      props: {
        options: Array.from({ length: 24 }, (_, hour) => ({
          label: `${String(hour).padStart(2, '0')}:00`,
          value: hour
        }))
      }
    },
    {
      label: '重复方式',
      key: 'repeatMode',
      type: 'segment',
      span: 24,
      props: {
        options: notificationRepeatModeOptions
      }
    },
    {
      label: '重复间隔',
      key: 'repeatEveryDays',
      type: 'number',
      hidden: () => form.repeatMode === 'once',
      props: { min: 1, max: 365, controlsPosition: 'right' },
      description: '例如 1 表示每天，7 表示每周。'
    },
    { label: '接收与渠道', key: 'deliverySection', type: 'divider', span: 24 },
    {
      label: '接收范围',
      key: 'recipientStrategy',
      type: 'radioGroup',
      span: 24,
      props: {
        options: notificationRecipientsModeOptions
      }
    },
    {
      label: '通知角色',
      key: 'recipientRoleCodes',
      type: 'select',
      span: 24,
      api: fetchEnabledRoleList,
      immediate: false,
      params: { tenantId: props.tenantId },
      shouldFetch: (params) => Boolean(params?.tenantId),
      afterFetch: prepareRoleOptions,
      resultField: 'data',
      labelField: 'roleName',
      valueField: 'roleCode',
      labelFn: (role) => `${role.roleName}（${role.roleCode}）`,
      props: {
        multiple: true,
        filterable: true,
        clearable: true,
        collapseTags: true,
        collapseTagsTooltip: true,
        maxCollapseTags: 3,
        disabled: !props.tenantId,
        placeholder: props.tenantId ? '请选择接收提醒的角色' : '请先选择租户',
        loadingText: '正在加载可用角色…',
        noMatchText: '未找到匹配角色',
        noDataText: '当前租户暂无可用角色'
      },
      description: unavailableRoleCodes.value.length
        ? `检测到 ${unavailableRoleCodes.value.length} 个历史角色已失效，请移除后重新选择。`
        : form.recipientRoleCodes.length
          ? `已选择 ${form.recipientRoleCodes.length} 个角色；可按角色名称或编码继续搜索。`
          : '负责人缺失时将由所选角色兜底接收，请至少选择一个。'
    },
    {
      label: '通知渠道',
      key: 'channels',
      type: 'checkboxGroup',
      span: 24,
      props: { options: channelOptions },
      description: '未启用或未配置的渠道会跳过，不会被记为发送成功。'
    },
    {
      label: '启用规则',
      key: 'enabled',
      type: 'switch',
      span: 24,
      props: { activeText: '启用', inactiveText: '停用' }
    }
  ])

  const replaceForm = (next: RuleForm): void => {
    Object.assign(form, next)
  }

  const handleSubmit = async (): Promise<boolean> => {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
    } catch (error) {
      notifyFriendlyError(error, '表单校验未完成，请稍后重试', 'warning')
      return false
    }
    try {
      await saveNotificationRule({
        id: form.id,
        tenantId: props.tenantId,
        scenarioId: form.scenarioId,
        ruleName: form.ruleName.trim(),
        leadDays: Number(form.leadDays),
        repeatEveryDays:
          form.repeatMode === 'repeat' ? Math.max(Number(form.repeatEveryDays) || 1, 1) : null,
        sendHour: Number(form.sendHour),
        recipientStrategy: form.recipientStrategy,
        recipientRoleCodes: uniq(form.recipientRoleCodes),
        channels: form.channels,
        enabled: form.enabled
      })
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '提醒规则保存失败，请检查条件后重试', 'warning')
      return false
    }
  }

  const handleOpen = async (row?: Api.NotificationReminder.Rule): Promise<void> => {
    const base = createInitialForm()
    Object.assign(roleSelection, { loaded: false, availableCodes: [] })
    replaceForm(
      row
        ? {
            ...base,
            ...structuredClone(toRaw(row)),
            repeatMode: row.repeatEveryDays ? 'repeat' : 'once'
          }
        : base
    )
    await nextTick()
    formRef.value?.clearValidate()
    await dialogRef.value?.handleOpen(row, {
      title: row?.id ? '编辑提醒规则' : '新增提醒规则',
      confirmText: row?.id ? '保存修改' : '创建规则',
      loading: true,
      loadingText: '正在加载可用角色…',
      contentMaxHeight: '72vh',
      onOpen: async (_data, api) => {
        try {
          await formRef.value?.reloadOptions('recipientRoleCodes')
        } finally {
          api.setLoading(false)
        }
      },
      onConfirm: handleSubmit
    })
  }

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .notification-rule-dialog {
    display: grid;
    gap: 16px;

    &__context {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 12px;
      align-items: center;
      padding: 13px 15px;
      background: var(--el-color-primary-light-9);
      border: 1px solid var(--el-color-primary-light-8);
      border-radius: var(--art-surface-radius);

      > span {
        display: grid;
        place-items: center;
        width: 36px;
        height: 36px;
        color: var(--el-color-primary);
        background: var(--el-bg-color);
        border-radius: var(--art-control-radius);
      }

      strong {
        display: block;
        color: var(--el-text-color-primary);
      }

      p {
        margin: 3px 0 0;
        font-size: 12px;
        line-height: 1.55;
        color: var(--el-text-color-secondary);
      }
    }
  }
</style>
