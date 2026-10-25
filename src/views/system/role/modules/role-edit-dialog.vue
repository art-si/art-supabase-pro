<template>
  <ArtDialog ref="dialogRef" size="md">
    <div class="role-edit-dialog">
      <ArtEntitySummary
        compact
        :icon="dialogType === 'add' ? 'ri:user-add-line' : 'ri:shield-user-line'"
        :title="contextTitle"
        :description="contextDescription"
      >
        <template #aside>
          <ElTag
            :type="isSystemBuiltinRole ? 'warning' : dialogType === 'add' ? 'success' : 'primary'"
            effect="light"
            round
          >
            {{ isSystemBuiltinRole ? '系统内置' : dialogType === 'add' ? '新增角色' : '编辑模式' }}
          </ElTag>
        </template>
      </ArtEntitySummary>

      <ElAlert
        v-if="isSystemBuiltinRole"
        class="role-edit-dialog__notice"
        title="该角色承担系统级职责，角色编码与启用状态受保护，仅允许调整名称和描述。"
        type="warning"
        :closable="false"
        show-icon
      />

      <ArtForm
        tenant-scope-mode="manual"
        ref="formRef"
        :model-value="form"
        @update:model-value="replaceReactiveModel(form, $event)"
        :items="formItems"
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
  import { ROLE_BUILTIN_TYPES } from '@/config/builtin-roles'
  import { replaceReactiveModel } from '@/utils/form/model'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import type { FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import { addRole, editRole, fetchEnabledOrganizationTree } from '@/api/system-manage'
  import { fetchEnabledTenantList } from '@/api/system-manage/tenant'
  import { uniqueValidator } from '@/utils/form/validator'
  import { useUserStore } from '@/store/modules/user'

  type RoleListItem = Api.SystemManage.RoleListItem
  type TenantListItem = Api.SystemManage.TenantListItem
  type DialogType = 'add' | 'edit'

  interface RoleEditDialogOpenData {
    type: DialogType
    roleData?: RoleListItem
  }

  interface ArtFormExpose {
    validate: () => Promise<boolean>
    clearValidate: () => void
    validateField: (prop: string) => void
    reloadOptions: (key?: string) => Promise<void>
  }

  interface Emits {
    (e: 'success'): void
  }

  const emit = defineEmits<Emits>()
  const userStore = useUserStore()
  const { getUserInfo, isPlatformSuper } = storeToRefs(userStore)
  const dialogRef = ref<ArtDialogExpose<RoleEditDialogOpenData>>()
  const formRef = ref<ArtFormExpose>()
  const dialogType = ref<DialogType>('add')
  const tenantOptions = shallowRef<TenantListItem[]>([])
  const canSelectTenant = computed(() => isPlatformSuper.value)
  const currentTenantId = computed(() => getUserInfo.value.tenantId)
  const selectableTenantOptions = computed(() =>
    tenantOptions.value.filter((tenant): tenant is TenantListItem & { id: string } =>
      Boolean(tenant.id)
    )
  )

  const isBuiltinRegisterRole = computed(
    () => dialogType.value === 'edit' && form.builtinType === ROLE_BUILTIN_TYPES.DEFAULT_REGISTER
  )

  const isSuperRole = computed(
    () => dialogType.value === 'edit' && form.builtinType === ROLE_BUILTIN_TYPES.PLATFORM_SUPER
  )

  const isSystemBuiltinRole = computed(() => isBuiltinRegisterRole.value || isSuperRole.value)
  const contextTitle = computed(() =>
    dialogType.value === 'add' ? '创建新的职责角色' : '调整角色定义与可用状态'
  )
  const contextDescription = computed(() =>
    dialogType.value === 'add'
      ? '角色编码用于权限关联，建议采用稳定、清晰的职责命名。'
      : '角色定义会影响关联用户的权限识别，保存前请确认职责边界。'
  )

  const createInitialForm = (): RoleListItem => ({
    id: undefined,
    tenantId: undefined,
    organizationId: null,
    roleName: '',
    roleCode: '',
    builtinType: null,
    description: '',
    enabled: true,
    createBy: undefined
  })

  const form = reactive<RoleListItem>(createInitialForm())

  const rules = computed<FormRules>(() => ({
    tenantId: canSelectTenant.value
      ? [{ required: true, message: '请选择所属租户', trigger: 'change' }]
      : [],
    roleName: [
      { required: true, message: '请输入角色名称', trigger: 'change' },
      { min: 2, max: 20, message: '长度在 2 到 20 个字符', trigger: 'change' }
    ],
    roleCode: [
      { required: true, message: '请输入角色编码', trigger: 'change' },
      { min: 2, max: 50, message: '长度在 2 到 50 个字符', trigger: 'change' },
      {
        validator: uniqueValidator({
          table: 'sys_role',
          field: 'role_code',
          getExcludeId: (): string | undefined => form.id,
          extraWhere: () => ({ tenant_id: form.tenantId }),
          message: '角色编码已存在'
        }),
        trigger: 'change'
      }
    ],
    description: [{ required: true, message: '请输入角色描述', trigger: 'change' }]
  }))

  const formatTenantOption = (tenant: TenantListItem): string =>
    tenant.tenantCode ? `${tenant.tenantName}（${tenant.tenantCode}）` : tenant.tenantName

  const formItems = computed<FormItem[]>(() => [
    {
      label: '角色定义',
      key: 'identitySection',
      type: 'divider',
      span: 24
    },
    {
      label: '所属租户',
      key: 'tenantId',
      type: 'select',
      hidden: !canSelectTenant.value,
      props: {
        disabled: dialogType.value === 'edit',
        filterable: true,
        options: selectableTenantOptions.value.map((tenant) => ({
          label: formatTenantOption(tenant),
          value: tenant.id
        })),
        onChange: handleTenantChange
      },
      help: '角色编码在同一租户内必须唯一。'
    },
    {
      label: '角色名称',
      key: 'roleName',
      type: 'input',
      props: {
        placeholder: '如：财务审核员'
      },
      description: '建议使用能够直接体现职责范围的名称。'
    },
    {
      label: '适用组织',
      key: 'organizationId',
      type: 'treeSelect',
      span: 24,
      api: fetchEnabledOrganizationTree,
      immediate: false,
      beforeFetch: () => ({ tenantId: form.tenantId }),
      resultField: 'data',
      labelField: 'organizationName',
      valueField: 'id',
      labelFn: (item) => `${item.organizationName}（${item.organizationCode}）`,
      childrenField: 'children',
      props: {
        disabled: !form.tenantId || isSystemBuiltinRole.value,
        clearable: true,
        checkStrictly: true,
        defaultExpandAll: true,
        renderAfterExpand: false,
        placeholder: form.tenantId ? '请选择角色主要适用组织' : '请先选择租户'
      },
      description: isSystemBuiltinRole.value
        ? '系统内置角色固定归入租户根组织。'
        : '用于组织治理与职责审计，不改变角色菜单权限的独立配置。'
    },
    {
      label: '角色编码',
      key: 'roleCode',
      type: 'input',
      props: {
        disabled: isSystemBuiltinRole.value,
        placeholder: '如：R_FINANCE_AUDITOR'
      },
      help: '建议使用大写字母、数字与下划线，保存后应谨慎修改。'
    },
    {
      label: '描述',
      key: 'description',
      type: 'input',
      span: 24,
      props: {
        type: 'textarea',
        rows: 3,
        maxlength: 300,
        showWordLimit: true,
        placeholder: '说明该角色的职责边界和适用成员'
      },
      description: '清晰的职责说明有助于后续权限审计。'
    },
    {
      label: '状态控制',
      key: 'statusSection',
      type: 'divider',
      span: 24
    },
    {
      label: '启用',
      key: 'enabled',
      type: 'switch',
      props: {
        disabled: isSystemBuiltinRole.value
      },
      span: 24,
      description: isSystemBuiltinRole.value
        ? '系统内置角色始终保持启用。'
        : '停用后请同步检查已关联用户的访问安排。'
    }
  ])

  const resetForm = async (): Promise<void> => {
    Object.assign(form, createInitialForm())
    await nextTick()
    formRef.value?.clearValidate()
  }

  const initializeForm = async (data: RoleEditDialogOpenData): Promise<void> => {
    await resetForm()
    dialogType.value = data.type

    if (data.roleData) {
      const {
        id,
        tenantId,
        organizationId,
        roleName,
        roleCode,
        builtinType,
        description,
        enabled,
        createBy
      } = data.roleData
      Object.assign(form, {
        id,
        tenantId,
        organizationId,
        roleName,
        roleCode,
        builtinType,
        description,
        enabled,
        createBy
      })
      return
    }

    if (!canSelectTenant.value) {
      form.tenantId = currentTenantId.value
    }
  }

  const buildRolePayload = (): Omit<RoleListItem, 'id'> => {
    const payload = { ...toRaw(form) }
    delete payload.id
    delete payload.builtinType

    if (!canSelectTenant.value) {
      payload.tenantId = currentTenantId.value
    }

    if (isSystemBuiltinRole.value) {
      payload.enabled = true
    }

    return payload
  }

  const handleSubmit = async (): Promise<boolean> => {
    if (!formRef.value) return false

    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
    } catch (error) {
      notifyFriendlyError(error, '表单校验未完成，请稍后重试', 'warning')
      return false
    }

    try {
      const payload = buildRolePayload()

      if (dialogType.value === 'add') {
        await addRole(payload)
      } else {
        await editRole({ ...payload, id: form.id })
      }
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '角色保存失败，请检查权限与租户后重试', 'warning')
      return false
    }
  }

  const loadTenantOptions = async (): Promise<void> => {
    if (!canSelectTenant.value) return
    const { data } = await fetchEnabledTenantList()
    tenantOptions.value = data ?? []
  }

  const handleTenantChange = (): void => {
    form.organizationId = null
    void formRef.value?.reloadOptions('organizationId')
    if (form.roleCode) {
      void formRef.value?.validateField('roleCode')
    }
  }

  const handleOpen = async (data: RoleEditDialogOpenData): Promise<void> => {
    await initializeForm(data)
    await dialogRef.value?.handleOpen(data, {
      title: data.type === 'add' ? '新增角色' : '编辑角色',
      contentMaxHeight: '68vh',
      loading: true,
      onOpen: async (_openData, api) => {
        try {
          await loadTenantOptions()
          await initializeForm(data)
          await formRef.value?.reloadOptions('organizationId')
        } finally {
          api.setLoading(false)
        }
      },
      onConfirm: handleSubmit,
      onReset: () => {
        void resetForm()
      }
    })
  }

  defineExpose({
    handleOpen,
    handleSubmit,
    handleClose: () => dialogRef.value?.handleClose()
  })
</script>

<style scoped lang="scss">
  .role-edit-dialog {
    display: grid;
    gap: 16px;
    min-width: 0;

    &__notice {
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
