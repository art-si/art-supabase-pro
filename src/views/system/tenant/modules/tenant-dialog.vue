<template>
  <ArtDialog ref="dialogRef" size="md">
    <div class="tenant-dialog">
      <ArtEntitySummary
        compact
        :icon="isEdit ? 'ri:building-2-line' : 'ri:add-circle-line'"
        :title="contextTitle"
        :description="contextDescription"
      >
        <template #aside>
          <ElTag
            :type="isSystemTenant ? 'warning' : isEdit ? 'primary' : 'success'"
            effect="light"
            round
          >
            {{ isSystemTenant ? '系统租户' : isEdit ? '编辑模式' : '新增租户' }}
          </ElTag>
        </template>
      </ArtEntitySummary>

      <ElAlert
        v-if="isSystemTenant"
        class="tenant-dialog__alert"
        title="该租户承担平台级或注册入口职责，编码与启用状态由系统保护。"
        type="warning"
        :closable="false"
        show-icon
      />

      <ArtForm
        ref="formRef"
        :model-value="form"
        @update:model-value="replaceReactiveModel(form, $event)"
        :items="items"
        :rules="rules"
        :span="12"
        :gutter="20"
        label-width="100px"
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
  import type { FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import { addTenant, editTenant } from '@/api/system-manage/tenant'
  import { useUserStore } from '@/store/modules/user'
  import { omit } from 'lodash-es'

  type Tenant = Api.SystemManage.TenantListItem

  interface Emits {
    (e: 'success', type: 'add' | 'edit'): void
  }

  const emit = defineEmits<Emits>()
  const { getDictMap } = storeToRefs(useUserStore())
  const dialogRef = ref<ArtDialogExpose<Tenant | undefined>>()
  const formRef = ref<{
    validate: () => Promise<boolean>
    clearValidate: () => void
  }>()

  const createInitialForm = (): Tenant => ({
    id: undefined,
    tenantCode: '',
    tenantName: '',
    status: '1',
    serviceStartDate: '',
    serviceEndDate: '',
    remark: '',
    createBy: undefined,
    createTime: undefined,
    updateBy: undefined,
    updateTime: undefined,
    builtinType: null
  })

  const form = reactive<Tenant>(createInitialForm())
  const isEdit = computed(() => Boolean(form.id))
  const isSystemTenant = computed(() => Boolean(form.builtinType))
  const contextTitle = computed(() =>
    isEdit.value ? '核对租户身份与访问状态' : '创建新的业务隔离空间'
  )
  const contextDescription = computed(() =>
    isEdit.value
      ? '租户编码已锁定；名称、状态和用途说明的调整会立即影响后台识别。'
      : '租户编码将作为稳定的隔离标识；服务有效期决定账号何时可以进入系统。'
  )

  const rules: FormRules<Tenant> = {
    tenantCode: [
      { required: true, message: '请输入租户编码', trigger: 'blur' },
      { min: 2, max: 50, message: '长度应为 2 到 50 个字符', trigger: 'blur' },
      {
        pattern: /^[A-Za-z0-9_-]+$/,
        message: '租户编码只能包含字母、数字、下划线和短横线',
        trigger: 'blur'
      }
    ],
    tenantName: [
      { required: true, message: '请输入租户名称', trigger: 'blur' },
      { min: 2, max: 100, message: '长度应为 2 到 100 个字符', trigger: 'blur' }
    ],
    serviceStartDate: [
      {
        validator: (_rule, value, callback) => {
          if (!isSystemTenant.value && !value) callback(new Error('请选择启用日期'))
          else callback()
        },
        trigger: 'change'
      }
    ],
    serviceEndDate: [
      {
        validator: (_rule, value, callback) => {
          if (!isSystemTenant.value && !value) {
            callback(new Error('请选择到期日期'))
            return
          }
          if (value && form.serviceStartDate && value < form.serviceStartDate) {
            callback(new Error('到期日期不能早于启用日期'))
            return
          }
          callback()
        },
        trigger: 'change'
      }
    ],
    remark: [{ max: 500, message: '备注不能超过 500 个字符', trigger: 'blur' }]
  }

  const items = computed<FormItem[]>(() => [
    {
      label: '租户身份',
      key: 'identitySection',
      type: 'divider',
      span: 24
    },
    {
      label: '租户编码',
      key: 'tenantCode',
      type: 'input',
      props: {
        maxlength: 50,
        disabled: !!form.id,
        placeholder: '如：north_china_ops'
      },
      help: '租户编码用于系统隔离与内部识别，创建后不可修改。',
      description: form.id ? '该租户编码已锁定。' : '建议使用简短、稳定的英文编码。'
    },
    {
      label: '租户名称',
      key: 'tenantName',
      type: 'input',
      props: {
        maxlength: 100,
        placeholder: '请输入组织或业务主体名称'
      },
      description: '名称将用于租户识别与后台管理展示。'
    },
    {
      label: '状态与说明',
      key: 'statusSection',
      type: 'divider',
      span: 24
    },
    {
      label: '启用日期',
      key: 'serviceStartDate',
      type: 'date',
      props: {
        type: 'date',
        valueFormat: 'YYYY-MM-DD',
        placeholder: isSystemTenant.value ? '长期有效（可不填）' : '请选择启用日期'
      },
      description: '早于该日期时，租户账号不能登录或访问租户数据。'
    },
    {
      label: '到期日期',
      key: 'serviceEndDate',
      type: 'date',
      props: {
        type: 'date',
        valueFormat: 'YYYY-MM-DD',
        placeholder: isSystemTenant.value ? '长期有效（可不填）' : '请选择到期日期',
        disabledDate: (date: Date) =>
          Boolean(
            form.serviceStartDate && date.getTime() < new Date(form.serviceStartDate).getTime()
          )
      },
      description: '到期后系统会在数据库边界阻止访问；提醒规则可在“消息提醒”中配置。'
    },
    {
      label: '状态',
      key: 'status',
      type: 'segment',
      props: {
        options: getDictMap.value.status ?? [],
        disabled: isSystemTenant.value
      },
      span: 24,
      description: isSystemTenant.value
        ? '系统预置租户必须保持启用。'
        : '停用前请确认租户内账号及业务安排已妥善处理。'
    },
    {
      label: '备注',
      key: 'remark',
      type: 'input',
      span: 24,
      props: {
        type: 'textarea',
        rows: 3,
        maxlength: 500,
        showWordLimit: true,
        placeholder: '补充租户用途、负责人或管理说明（选填）'
      },
      description: '建议记录该租户的业务范围，便于后续运维识别。'
    }
  ])

  const replaceForm = (nextForm: Tenant): void => {
    Object.keys(form).forEach((key) => {
      delete form[key as keyof Tenant]
    })
    Object.assign(form, nextForm)
  }

  const resetForm = async (): Promise<void> => {
    replaceForm(createInitialForm())
    await nextTick()
    formRef.value?.clearValidate()
  }

  const handleSubmit = async (): Promise<boolean> => {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
    } catch (error) {
      notifyFriendlyError(error, '表单校验未完成，请稍后重试', 'warning')
      return false
    }

    try {
      const payload = omit(toRaw(form), [
        'createBy',
        'createTime',
        'updateBy',
        'updateTime',
        'builtinType'
      ])
      if (form.id) {
        await editTenant(payload)
      } else {
        await addTenant(payload)
      }
      emit('success', form.id ? 'edit' : 'add')
      return true
    } catch (error) {
      notifyFriendlyError(error, '租户保存失败，请检查租户信息后重试', 'warning')
      return false
    }
  }

  const handleOpen = async (row?: Tenant): Promise<void> => {
    await resetForm()
    const isEdit = !!row?.id
    if (isEdit) {
      replaceForm(structuredClone(toRaw(row)) as Tenant)
    }

    await dialogRef.value?.handleOpen(row, {
      title: isEdit ? '编辑租户' : '新增租户',
      contentMaxHeight: '68vh',
      onConfirm: handleSubmit,
      onReset: () => void resetForm()
    })
  }

  defineExpose({
    handleOpen,
    handleClose: () => dialogRef.value?.handleClose()
  })
</script>

<style scoped lang="scss">
  .tenant-dialog {
    display: grid;
    gap: 16px;
    min-width: 0;

    &__alert {
      align-items: flex-start;

      :deep(.el-alert__content) {
        min-width: 0;
      }

      :deep(.el-alert__title) {
        line-height: 1.6;
      }
    }
  }
</style>
