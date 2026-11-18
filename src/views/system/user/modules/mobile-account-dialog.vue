<template>
  <ArtDialog ref="dialogRef" :loading="loading">
    <ArtAsyncState :error="loadError" @retry="loadWorkspace">
      <ArtForm ref="formRef" v-model="form" :items="items" :rules="rules" :span="12" />
    </ArtAsyncState>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { ElMessage, type FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import { useUserStore } from '@/store/modules/user'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { useSystemParam } from '@/hooks/core/system-param'
  import { fetchEnabledTenantList } from '@/api/system-manage/tenant'
  import {
    createShipperAccount,
    fetchMobileAccountWorkspace,
    resetMobileAccountPassword,
    saveMobileAccount,
    type MobileAccountKind,
    type MobileAccountRecord,
    type MobileAccountWorkspace
  } from '@/api/system-manage/mobile-account'

  interface OpenData {
    mode: 'link' | 'create' | 'edit' | 'reset'
    kind: MobileAccountKind
    tenantId?: string
    authUserId?: string
    userId?: string
    record?: MobileAccountRecord
  }
  interface AccountForm {
    tenantId: string
    userId: string
    displayName: string
    email: string
    phone: string
    password: string
    driverId: string | null
    customerId: string | null
    orderActorId: string | null
    enabled: boolean
  }
  const emptyForm = (): AccountForm => ({
    tenantId: '',
    userId: '',
    displayName: '',
    email: '',
    phone: '',
    password: '',
    driverId: null,
    customerId: null,
    orderActorId: null,
    enabled: true
  })
  const emptyWorkspace = (): MobileAccountWorkspace => ({
    account: null,
    users: [],
    drivers: [],
    customers: [],
    orderActors: []
  })
  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<OpenData>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const form = ref(emptyForm())
  const workspace = ref(emptyWorkspace())
  const openData = ref<OpenData>({ mode: 'link', kind: 'driver' })
  const authUserId = ref('')
  const loading = ref(false)
  const loadError = ref('')
  let loadRevision = 0
  const userStore = useUserStore()
  const tenantScope = useTenantScopeStore()
  const {
    loadPasswordPolicy,
    passwordMinLength,
    validatePasswordComplexity,
    getPasswordComplexityMessage
  } = useSystemParam()
  const creating = computed(() => openData.value.mode === 'create')
  const resetting = computed(() => openData.value.mode === 'reset')
  const driver = computed(() => openData.value.kind === 'driver')
  const canChooseTenant = computed(
    () => userStore.isPlatformSuper && !authUserId.value && !tenantScope.effectiveTenantId
  )
  const optionItems = (items: MobileAccountWorkspace['drivers']) =>
    items.map((item) => ({ label: item.label, value: item.id, disabled: !item.enabled }))
  const items = computed<FormItem[]>(() => [
    { key: 'account', label: '账号信息', type: 'tab', span: 24 },
    {
      key: 'tenantId',
      label: '所属租户',
      type: 'select',
      span: 24,
      hidden: !canChooseTenant.value,
      api: fetchEnabledTenantList,
      resultField: 'data',
      labelField: 'tenantName',
      valueField: 'id',
      props: { filterable: true, onChange: handleTenantChange },
      description: '新账号默认归属当前租户；业务对象与账号必须属于同一租户。'
    },
    {
      key: 'userId',
      label: '关联用户',
      type: 'select',
      span: 24,
      hidden: !driver.value || resetting.value,
      props: {
        filterable: true,
        disabled: Boolean(openData.value.authUserId || openData.value.record),
        options: optionItems(workspace.value.users),
        onChange: handleUserChange
      },
      description:
        '使用已有个人登录账号。尚未建账号的司机，请先在用户管理中新增员工或外部协作账号。'
    },
    {
      key: 'displayName',
      label: '联系人姓名',
      type: 'input',
      hidden: driver.value,
      props: {
        disabled: resetting.value,
        maxlength: 60,
        placeholder: '填写实际使用账号的联系人姓名'
      }
    },
    {
      key: 'email',
      label: '登录邮箱',
      type: 'input',
      hidden: driver.value,
      props: {
        disabled: !creating.value,
        maxlength: 254,
        autocomplete: 'off',
        placeholder: '例如 name@company.com'
      },
      description: '每位联系人使用独立账号，登录邮箱创建后固定。'
    },
    {
      key: 'phone',
      label: '登录手机号',
      type: 'input',
      hidden: driver.value || resetting.value,
      props: {
        maxlength: 11,
        inputmode: 'tel',
        autocomplete: 'off',
        placeholder: '选填，11 位大陆手机号'
      },
      description: '用于手机号加密码登录；微信一键登录需由本人登录后授权绑定。'
    },
    {
      key: 'password',
      label: resetting.value ? '新密码' : '初始密码',
      type: 'input',
      hidden: !creating.value && !resetting.value,
      props: { type: 'password', showPassword: true, autocomplete: 'new-password', maxlength: 512 },
      description: `至少 ${passwordMinLength.value} 位。通过安全渠道告知本人，重置后原会话失效。`
    },
    { key: 'business', label: '业务身份与客户端', type: 'tab', span: 24, hidden: resetting.value },
    {
      key: 'driverId',
      label: '关联司机',
      type: 'dataSelect',
      span: 24,
      hidden: !driver.value,
      props: {
        title: '选择具体司机档案',
        rowKey: 'id',
        labelKey: 'label',
        data: workspace.value.drivers,
        selectedData: workspace.value.drivers.filter((item) => item.id === form.value.driverId),
        disabledKey: (item: MobileAccountWorkspace['drivers'][number]) => !item.enabled,
        columns: [{ prop: 'label', label: '司机 / 手机号 / 承运商', minWidth: 320 }],
        clearable: true,
        placeholder: '选择具体司机档案'
      },
      description:
        '承运商沿用司机档案，司机只能处理本人任务。清空司机并停用客户端可解除关联，业务历史会保留。'
    },
    {
      key: 'customerId',
      label: '关联货主企业',
      type: 'select',
      span: 24,
      hidden: driver.value,
      props: {
        filterable: true,
        disabled: !creating.value,
        options: optionItems(workspace.value.customers),
        placeholder: '选择客户企业'
      },
      description: '一个客户可以开通多个联系人账号。客户归属创建后固定，更换企业时新开个人账号。'
    },
    {
      key: 'orderActorId',
      label: '开单归属人',
      type: 'select',
      span: 24,
      hidden: driver.value,
      props: {
        filterable: true,
        clearable: true,
        options: optionItems(workspace.value.orderActors),
        placeholder: '选择同租户内部开单归属人'
      },
      description: '不选时可以查单；配置后可以提交运输委托。开单归属人必须保持启用。'
    },
    {
      key: 'enabled',
      label: '客户端状态',
      type: 'segment',
      span: 24,
      props: {
        options: [
          { label: '启用', value: true },
          { label: '停用', value: false }
        ]
      },
      description: '停用后立即阻止该业务身份继续访问。用户账号和司机／客户档案也必须保持可用。'
    }
  ])
  const required = (message: string) => [{ required: true, message, trigger: 'change' }]
  const rules = computed<FormRules>(() => ({
    tenantId: required('请选择所属租户'),
    userId: driver.value ? required('请选择已有个人账号') : [],
    displayName: !driver.value ? required('请填写联系人姓名') : [],
    email: creating.value
      ? [
          ...required('请填写登录邮箱'),
          { type: 'email', message: '请填写有效的邮箱地址', trigger: 'blur' }
        ]
      : [],
    phone: [{ pattern: /^1[3-9]\d{9}$/, message: '请填写有效的 11 位手机号', trigger: 'blur' }],
    password: [
      {
        validator: (_rule, value: string, callback) => {
          if (!creating.value && !resetting.value) return callback()
          if (!value || value.length < passwordMinLength.value)
            return callback(new Error(`密码不能少于 ${passwordMinLength.value} 位`))
          if (!validatePasswordComplexity(value))
            return callback(new Error(getPasswordComplexityMessage()))
          callback()
        },
        trigger: 'blur'
      }
    ],
    driverId: driver.value && form.value.enabled ? required('请选择具体司机档案') : [],
    customerId: !driver.value ? required('请选择货主企业') : []
  }))

  function assignAccount(account: MobileAccountRecord) {
    authUserId.value = account.authUserId
    Object.assign(form.value, {
      tenantId: account.tenantId,
      userId: account.userId ?? '',
      displayName: account.displayName,
      email: account.email,
      phone: account.phone,
      driverId: account.driverId,
      customerId: account.customerId,
      orderActorId: account.orderActorId,
      enabled: account.version ? account.enabled : true
    })
  }
  async function loadWorkspace() {
    const revision = ++loadRevision
    loading.value = true
    loadError.value = ''
    try {
      const result = await fetchMobileAccountWorkspace({
        tenantId: form.value.tenantId,
        authUserId: authUserId.value || undefined,
        kind: openData.value.kind
      })
      if (revision !== loadRevision) return
      workspace.value = result.data ?? emptyWorkspace()
      if (workspace.value.account) assignAccount(workspace.value.account)
    } catch (error) {
      if (revision === loadRevision)
        loadError.value = getFriendlySupabaseErrorMessage(error, '账号关联加载失败，请重试')
    } finally {
      if (revision === loadRevision) loading.value = false
    }
  }
  function handleTenantChange() {
    authUserId.value = ''
    Object.assign(form.value, { userId: '', driverId: null, customerId: null, orderActorId: null })
    workspace.value = emptyWorkspace()
    void loadWorkspace()
  }
  function handleUserChange(value: string) {
    const selected = workspace.value.users.find((user) => user.id === value)
    authUserId.value = selected?.authUserId ?? ''
    form.value.driverId = null
    if (selected) void loadWorkspace()
  }
  async function submit() {
    if (loading.value || loadError.value || !(await validateArtFormForSubmit(formRef.value)))
      return false
    try {
      if (resetting.value) await resetMobileAccountPassword(authUserId.value, form.value.password)
      else {
        const input = {
          authUserId: authUserId.value,
          tenantId: form.value.tenantId,
          kind: openData.value.kind,
          displayName: form.value.displayName,
          phone: form.value.phone,
          enabled: form.value.enabled,
          driverId: driver.value ? form.value.driverId : null,
          customerId: driver.value ? null : form.value.customerId,
          orderActorId: driver.value ? null : form.value.orderActorId,
          expectedVersion: workspace.value.account?.version ?? null
        }
        if (creating.value)
          await createShipperAccount({
            ...input,
            email: form.value.email.trim(),
            password: form.value.password
          })
        else await saveMobileAccount(input)
      }
      form.value.password = ''
      ElMessage.success(resetting.value ? '密码已重置，原会话已失效' : '移动端账号已保存')
      emit('success')
      return true
    } catch (error) {
      ElMessage.error(getFriendlySupabaseErrorMessage(error, '账号保存失败，请核对信息后重试'))
      return false
    }
  }
  async function handleOpen(data: OpenData) {
    loadRevision += 1
    openData.value = data
    form.value = emptyForm()
    workspace.value = emptyWorkspace()
    loadError.value = ''
    authUserId.value = data.authUserId ?? data.record?.authUserId ?? ''
    form.value.tenantId =
      data.tenantId ??
      data.record?.tenantId ??
      tenantScope.effectiveTenantId ??
      userStore.getUserInfo.tenantId ??
      ''
    form.value.userId = data.userId ?? ''
    if (data.record) assignAccount(data.record)
    await dialogRef.value?.handleOpen(data, {
      title:
        data.mode === 'reset'
          ? '重置移动账号密码'
          : data.mode === 'create'
            ? '新建货主个人账号'
            : '业务身份与客户端',
      subtitle:
        data.kind === 'driver'
          ? '将个人账号关联到具体司机档案，承运商归属由司机档案带出。'
          : '为客户联系人开通独立账号，访问范围限定到关联客户。',
      size: 'lg',
      contentMaxHeight: '70vh',
      confirmText: data.mode === 'reset' ? '重置密码' : '保存关联',
      onOpen: async () => {
        await loadPasswordPolicy()
        if (!resetting.value) await loadWorkspace()
      },
      onConfirm: submit,
      onReset: () => {
        loadRevision += 1
        form.value = emptyForm()
        workspace.value = emptyWorkspace()
      }
    })
  }
  defineExpose({ handleOpen })
</script>
