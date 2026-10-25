<template>
  <ArtDialog ref="dialogRef" size="lg">
    <div class="user-dialog">
      <ArtEntitySummary
        compact
        :icon="isEdit ? 'ri:user-settings-line' : 'ri:user-add-line'"
        :title="contextTitle"
        :description="contextDescription"
      >
        <template #aside>
          <ElTag
            :type="isCurrentUser ? 'warning' : isEdit ? 'primary' : 'success'"
            effect="light"
            round
          >
            {{ isCurrentUser ? '当前账号' : isEdit ? '编辑资料' : '新增账号' }}
          </ElTag>
        </template>
      </ArtEntitySummary>

      <ElAlert
        v-if="isCurrentUser"
        class="user-dialog__notice"
        title="正在维护当前登录账号，保存后的昵称与头像可能立即同步到导航栏。"
        type="warning"
        :closable="false"
        show-icon
      />

      <ArtForm
        tenant-scope-mode="manual"
        ref="formRef"
        v-model="formData"
        :items="formItems"
        :rules="rules"
        :span="12"
        :gutter="20"
        label-width="100px"
        :show-reset="false"
        :show-submit="false"
        :validate-on-rule-change="false"
      >
        <template #hrEmployeeId>
          <div class="user-dialog__employee-link">
            <ArtEmployeeSelect
              :model-value="formData.hrEmployeeId || undefined"
              :selected-data="employeeSelection.selectedRows"
              :tenant-id="formData.tenantId || undefined"
              title="从员工花名册选择"
              :subtitle="employeeSelectorSubtitle"
              :disabled="!formData.tenantId"
              :placeholder="formData.tenantId ? '请选择员工档案' : '请先选择所属租户'"
              search-placeholder="员工工号、姓名、手机、邮箱或岗位"
              @update:model-value="handleEmployeeValueChange"
              @update:selected-data="handleEmployeeRowsChange"
              @confirm="handleEmployeeConfirm"
              @clear="handleEmployeeClear"
            />
            <div v-if="isEdit && !formData.hrEmployeeId" class="user-dialog__employee-guide">
              <span>花名册中找不到本人？请先完成实名员工建档，再回来关联。</span>
              <ElButton type="primary" link @click="openEmployeeProfile">
                去新建员工档案
                <ArtSvgIcon icon="ri:arrow-right-line" />
              </ElButton>
            </div>
          </div>
        </template>
        <template #avatar>
          <ArtUploadImage v-model="formData.avatar" :resource-tenant-id="formData.tenantId || ''" />
        </template>
      </ArtForm>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import type { FormRules } from 'element-plus'
  import { useI18n } from 'vue-i18n'
  import { cloneDeep, omit } from 'lodash-es'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm from '@/components/core/forms/art-form/index.vue'
  import type { FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtUploadImage from '@/components/core/forms/art-upload-image/index.vue'
  import ArtEmployeeSelect from '@/components/business/art-employee-select/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import { useUserStore } from '@/store/modules/user'
  import { addUser, editUser, fetchEnabledOrganizationTree } from '@/api/system-manage'
  import { fetchEnabledTenantList } from '@/api/system-manage/tenant'
  import type { EmployeeIntegrationItem } from '@/api/integration/employees'
  import { useSystemParam } from '@/hooks/core/system-param'

  type UserListItem = Api.SystemManage.UserListItem
  type UserAccountIdentityType = Api.SystemManage.UserAccountIdentityType
  type SaveType = 'add' | 'edit'

  interface Emits {
    (e: 'success', type: SaveType): void
  }

  interface ArtFormExpose {
    validate: () => Promise<boolean | void>
    clearValidate: () => void
    reloadOptions: (key?: string) => Promise<void>
  }

  interface EmployeeSelectionGroup {
    selectedRows: EmployeeIntegrationItem[]
  }

  const emit = defineEmits<Emits>()
  const userStore = useUserStore()
  const router = useRouter()
  const { getDictMap, getUserInfo, isPlatformSuper } = storeToRefs(userStore)
  const { t } = useI18n()
  const {
    passwordMinLength,
    loadPasswordPolicy,
    getPasswordMinLengthMessage,
    getPasswordComplexityMessage,
    validatePasswordComplexity
  } = useSystemParam()
  const dialogRef = ref<ArtDialogExpose<Partial<UserListItem> | undefined>>()
  const formRef = ref<ArtFormExpose>()

  const createInitialForm = (): UserListItem => ({
    id: undefined,
    tenantId: undefined,
    organizationId: null,
    accountIdentityType: 'employee',
    hrEmployeeId: null,
    authUserId: undefined,
    avatar: null,
    userName: '',
    nickName: '',
    userPhone: '',
    userGender: '1',
    userEmail: '',
    password: '',
    confirmPassword: '',
    userType: '1',
    userRoles: [],
    remark: '',
    status: '1'
  })

  const formData = ref<UserListItem>(createInitialForm())
  const employeeSelection = reactive<EmployeeSelectionGroup>({
    selectedRows: []
  })
  const isEdit = computed(() => !!formData.value.id)
  const isEmployeeAccount = computed(() => formData.value.accountIdentityType === 'employee')
  const requiresIdentityReason = computed(() =>
    ['external', 'service'].includes(String(formData.value.accountIdentityType))
  )
  const isCurrentUser = computed(
    () => isEdit.value && getUserInfo.value.email === formData.value.userEmail
  )
  const isProtectedSuperUser = computed(
    () => isEdit.value && formData.value.systemProtected === true
  )
  const canSelectTenant = computed(() => isPlatformSuper.value)
  const currentTenantId = computed(() => getUserInfo.value.tenantId)
  const contextTitle = computed(() =>
    isEdit.value ? '维护用户资料与访问状态' : '创建新的登录账号'
  )
  const contextDescription = computed(() =>
    isEdit.value
      ? '账号邮箱保持锁定；员工账号必须与花名册一一关联，历史待确认账号需先完成身份归类。'
      : '先确认账号身份；员工账号必须从当前租户花名册选择，外部或服务账号需说明用途。'
  )
  const employeeSelectorSubtitle = computed(() =>
    isEdit.value
      ? '保留当前关联，或改选当前租户内在岗且尚未开通账号的员工'
      : '仅展示当前租户内在岗、且尚未开通账号的员工'
  )
  const identityTypeOptions = computed(() => {
    const options = getDictMap.value.sysUserIdentityType ?? []
    if (isProtectedSuperUser.value) {
      return options.filter((item) => item.value === 'platform')
    }
    return options.filter((item) => ['employee', 'external', 'service'].includes(item.value))
  })

  const rules = computed<FormRules>(() => ({
    tenantId: canSelectTenant.value
      ? [{ required: true, message: '请选择所属租户', trigger: 'change' }]
      : [],
    userName: [{ min: 2, max: 20, message: '长度在 2 到 20 个字符', trigger: 'change' }],
    userPhone: [{ pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号格式', trigger: 'change' }],
    userEmail: [{ required: true, type: 'email', message: '请输入正确的邮箱', trigger: 'change' }],
    accountIdentityType: [
      { required: true, validator: validateAccountIdentityType, trigger: 'change' }
    ],
    hrEmployeeId: [{ validator: validateEmployeeRequirement, trigger: 'change' }],
    remark: [{ validator: validateIdentityReason, trigger: 'change' }],
    password: [
      { required: true, validator: validatePassword, trigger: 'change' },
      {
        min: passwordMinLength.value,
        message: getPasswordMinLengthMessage(t),
        trigger: 'change'
      }
    ],
    confirmPassword: [{ required: true, validator: validateConfirmPassword, trigger: 'change' }]
  }))

  const formItems = computed<FormItem[]>(() => [
    {
      label: '基本身份',
      key: 'identitySection',
      type: 'divider',
      span: 24
    },
    {
      label: '账号身份',
      key: 'accountIdentityType',
      type: 'segment',
      span: 24,
      props: {
        options: identityTypeOptions.value,
        disabled: isProtectedSuperUser.value,
        onChange: handleAccountIdentityTypeChange
      },
      description: isProtectedSuperUser.value
        ? '平台治理账号由系统保护，不属于员工花名册。'
        : '员工用于企业内部人员；外部协作和服务账号不进入员工花名册，必须说明用途。'
    },
    {
      label: '所属租户',
      key: 'tenantId',
      type: 'select',
      span: 24,
      hidden: !canSelectTenant.value,
      api: fetchEnabledTenantList,
      resultField: 'data',
      labelField: 'tenantName',
      valueField: 'id',
      labelFn: (item) => `${item.tenantName}（${item.tenantCode}）`,
      props: {
        placeholder: '请选择所属租户',
        filterable: true,
        disabled: isProtectedSuperUser.value,
        onChange: handleTenantChange
      }
    },
    {
      label: '花名册员工',
      key: 'hrEmployeeId',
      span: 24,
      hidden: !isEmployeeAccount.value,
      description: '必选；选择后自动回填员工身份、组织与联系方式。'
    },
    {
      label: '所属组织',
      key: 'organizationId',
      type: 'treeSelect',
      span: 24,
      api: fetchEnabledOrganizationTree,
      immediate: false,
      beforeFetch: () => ({ tenantId: formData.value.tenantId }),
      resultField: 'data',
      labelField: 'organizationName',
      valueField: 'id',
      labelFn: (item) => `${item.organizationName}（${item.organizationCode}）`,
      childrenField: 'children',
      props: {
        disabled: !formData.value.tenantId,
        clearable: true,
        checkStrictly: true,
        defaultExpandAll: true,
        renderAfterExpand: false,
        placeholder: formData.value.tenantId ? '请选择所属组织' : '请先选择租户'
      },
      description: '用户归属组织决定组织治理视图；角色权限仍通过角色分配独立控制。'
    },
    {
      label: '头像',
      key: 'avatar',
      span: 24
    },
    {
      label: '用户名',
      key: 'userName',
      type: 'input',
      props: { placeholder: '请输入用户名', clearable: true }
    },
    {
      label: '昵称',
      key: 'nickName',
      type: 'input',
      props: { placeholder: '请输入昵称', clearable: true }
    },
    {
      label: '登录与联系',
      key: 'contactSection',
      type: 'divider',
      span: 24
    },
    {
      label: '手机号',
      key: 'userPhone',
      type: 'input',
      props: { placeholder: '请输入手机号', clearable: true, maxlength: 11 }
    },
    {
      label: '邮箱',
      key: 'userEmail',
      type: 'input',
      props: {
        placeholder: '请输入邮箱',
        clearable: true,
        disabled: isEdit.value
      },
      description: isEdit.value ? '登录邮箱已锁定，如需变更请通过账号迁移流程处理。' : undefined
    },
    {
      label: '密码',
      key: 'password',
      type: 'input',
      hidden: isEdit.value,
      props: {
        placeholder: '请输入密码',
        type: 'password',
        autocomplete: 'off',
        showPassword: true
      }
    },
    {
      label: '确认密码',
      key: 'confirmPassword',
      type: 'input',
      hidden: isEdit.value,
      props: {
        placeholder: '请再次输入密码',
        type: 'password',
        autocomplete: 'off',
        showPassword: true
      }
    },
    {
      label: '账号属性',
      key: 'attributeSection',
      type: 'divider',
      span: 24
    },
    {
      label: '性别',
      key: 'userGender',
      type: 'select',
      props: {
        placeholder: '请选择性别',
        options: getDictMap.value.sex ?? []
      }
    },
    {
      label: '用户类型',
      key: 'userType',
      type: 'radioGroup',
      hidden: isEdit.value,
      props: {
        optionType: 'button',
        options: getDictMap.value.userType ?? []
      }
    },
    {
      label: requiresIdentityReason.value ? '账号用途说明' : '备注',
      key: 'remark',
      type: 'input',
      span: 24,
      props: {
        placeholder: requiresIdentityReason.value
          ? '请说明外部协作范围或服务账号用途'
          : '请输入备注',
        type: 'textarea',
        rows: 3
      },
      description: requiresIdentityReason.value ? '非员工账号必须保留可审计的用途说明。' : undefined
    },
    {
      label: '状态',
      key: 'status',
      type: 'segment',
      span: 24,
      props: {
        options: getDictMap.value.status ?? [],
        disabled: isProtectedSuperUser.value
      }
    }
  ])

  function validatePassword(_rule: unknown, value: string, callback: (error?: Error) => void) {
    if (isEdit.value) {
      callback()
      return
    }

    if (!value) {
      callback(new Error(t('register.placeholder.password')))
      return
    }

    if (!validatePasswordComplexity(value)) {
      callback(new Error(getPasswordComplexityMessage(t)))
      return
    }

    callback()
  }

  function validateAccountIdentityType(
    _rule: unknown,
    value: UserAccountIdentityType | undefined,
    callback: (error?: Error) => void
  ) {
    if (isProtectedSuperUser.value && value === 'platform') {
      callback()
      return
    }
    if (!value || !['employee', 'external', 'service'].includes(value)) {
      callback(new Error('请选择员工、外部协作或服务账号'))
      return
    }
    callback()
  }

  function validateEmployeeRequirement(
    _rule: unknown,
    value: string | null | undefined,
    callback: (error?: Error) => void
  ) {
    if (isEmployeeAccount.value && !value) {
      callback(new Error('员工账号必须选择花名册员工'))
      return
    }
    if (!isEmployeeAccount.value && value) {
      callback(new Error('非员工账号不能关联花名册员工'))
      return
    }
    callback()
  }

  function validateIdentityReason(
    _rule: unknown,
    value: string | undefined,
    callback: (error?: Error) => void
  ) {
    if (requiresIdentityReason.value && !value?.trim()) {
      callback(new Error('请填写非员工账号的用途说明'))
      return
    }
    callback()
  }

  function validateConfirmPassword(
    _rule: unknown,
    value: string,
    callback: (error?: Error) => void
  ) {
    if (isEdit.value) {
      callback()
      return
    }

    if (!value) {
      callback(new Error(t('register.rule.confirmPasswordRequired')))
      return
    }

    if (value !== formData.value.password) {
      callback(new Error(t('register.rule.passwordMismatch')))
      return
    }
    callback()
  }

  const resetForm = async (): Promise<void> => {
    formData.value = cloneDeep(createInitialForm())
    employeeSelection.selectedRows = []
    await nextTick()
    formRef.value?.clearValidate()
  }

  const initializeForm = async (row?: Partial<UserListItem>): Promise<void> => {
    await resetForm()

    if (row?.id) {
      formData.value = {
        ...formData.value,
        ...cloneDeep(row)
      }
      employeeSelection.selectedRows = row.hrEmployee
        ? [
            {
              ...cloneDeep(row.hrEmployee),
              tenantId: row.hrEmployee.tenantId ?? row.tenantId ?? ''
            }
          ]
        : []
    } else if (!canSelectTenant.value) {
      formData.value.tenantId = currentTenantId.value
    }
  }

  const handleTenantChange = (): void => {
    formData.value.organizationId = null
    handleEmployeeClear()
    void formRef.value?.reloadOptions('organizationId')
  }

  const handleAccountIdentityTypeChange = (value: UserAccountIdentityType): void => {
    formData.value.accountIdentityType = value
    if (value !== 'employee') handleEmployeeClear()
  }

  const handleEmployeeValueChange = (value: string | string[] | undefined): void => {
    formData.value.hrEmployeeId = (Array.isArray(value) ? value[0] : value) ?? null
  }

  const handleEmployeeRowsChange = (rows: EmployeeIntegrationItem[]): void => {
    employeeSelection.selectedRows = rows
  }

  const handleEmployeeConfirm = (_value: unknown, rows: EmployeeIntegrationItem[]): void => {
    const employee = rows[0]
    if (!employee) return

    Object.assign(formData.value, {
      accountIdentityType: 'employee',
      hrEmployeeId: employee.id,
      organizationId: employee.organizationId ?? null,
      avatar: employee.avatarUrl ?? null,
      userName: employee.employeeNo,
      nickName: employee.employeeName,
      userPhone: employee.phone ?? '',
      userEmail: employee.email ?? '',
      userGender: employee.gender ?? '1'
    })
    employeeSelection.selectedRows = [employee]
  }

  const handleEmployeeClear = (): void => {
    formData.value.hrEmployeeId = null
    employeeSelection.selectedRows = []
  }

  const openEmployeeProfile = (): void => {
    void router.push({
      path: '/hr/personnel/employee-profile',
      query: {
        sourceUserId: formData.value.id,
        tenantId: formData.value.tenantId,
        organizationId: formData.value.organizationId || undefined,
        email: formData.value.userEmail || undefined,
        returnPath: '/system/user'
      }
    })
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
      const rawForm = toRaw(formData.value)
      const { id, userEmail, password, authUserId } = rawForm
      const rest = omit(rawForm, [
        'id',
        'authUserId',
        'userEmail',
        'password',
        'tenant',
        'organization',
        'hrEmployee',
        'systemProtected',
        'roleNames',
        'createBy',
        'createTime',
        'updateBy',
        'updateTime'
      ])
      const params: UserListItem = {
        userEmail,
        password,
        ...rest
      }
      if (!canSelectTenant.value) {
        params.tenantId = currentTenantId.value
      }

      if (!isEdit.value) {
        await addUser(params)
        emit('success', 'add')
      } else {
        await editUser({ ...params, id, authUserId })
        emit('success', 'edit')
      }
      return true
    } catch (error) {
      notifyFriendlyError(error, '用户保存失败，请检查账号信息后重试', 'warning')
      return false
    }
  }

  const handleOpen = async (row?: Partial<UserListItem>): Promise<void> => {
    await initializeForm(row)
    await dialogRef.value?.handleOpen(row, {
      title: isEdit.value ? '编辑用户' : '新增用户',
      contentMaxHeight: '70vh',
      loading: true,
      onOpen: async (_data, api) => {
        try {
          await Promise.all([
            loadPasswordPolicy(),
            userStore.ensureDictLoaded('sysUserIdentityType'),
            formRef.value?.reloadOptions('organizationId')
          ])
          if (formData.value.password) {
            await formRef.value?.validate()
          }
        } finally {
          api.setLoading(false)
        }
      },
      onConfirm: handleSubmit,
      onReset: () => void resetForm()
    })
  }

  defineExpose({
    handleOpen,
    handleSubmit,
    handleClose: () => dialogRef.value?.handleClose()
  })
</script>

<style scoped lang="scss">
  .user-dialog {
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

    &__employee-link {
      display: grid;
      gap: 8px;
      min-width: 0;
    }

    &__employee-guide {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 12px;
      align-items: center;
      justify-content: space-between;
      padding: 9px 12px;
      font-size: 12px;
      line-height: 1.5;
      color: var(--el-text-color-secondary);
      background: var(--el-color-warning-light-9);
      border: 1px solid var(--el-color-warning-light-8);
      border-radius: var(--el-border-radius-base);

      .el-button {
        flex: none;
        margin: 0;
      }
    }

    @media (width <= 640px) {
      &__employee-guide {
        align-items: flex-start;
      }
    }
  }
</style>
