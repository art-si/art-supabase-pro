<template>
  <ArtDialog ref="dialogRef" size="lg">
    <div class="organization-dialog">
      <ArtEntitySummary
        compact
        :icon="dialogType === 'add' ? 'ri:node-tree' : 'ri:organization-chart'"
        :title="contextTitle"
        :description="contextDescription"
      >
        <template #aside>
          <ElTag
            :type="form.isSystem ? 'warning' : dialogType === 'add' ? 'success' : 'primary'"
            effect="light"
            round
          >
            {{ form.isSystem ? '系统根组织' : dialogType === 'add' ? '新增节点' : '编辑节点' }}
          </ElTag>
        </template>
      </ArtEntitySummary>

      <ElAlert
        v-if="form.isSystem"
        class="organization-dialog__notice"
        title="根组织由系统维护，只允许调整名称、负责人和联系信息。"
        type="warning"
        :closable="false"
        show-icon
      />

      <ArtForm
        v-model:active-tab="activeTab"
        tenant-scope-mode="manual"
        ref="formRef"
        v-model="form"
        :items="formItems"
        :rules="rules"
        :span="12"
        :gutter="20"
        label-width="104px"
      />
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { normalizeIdentityDisplayText } from '@/utils/identity-display'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import type { FormRules } from 'element-plus'
  import { cloneDeep } from 'lodash-es'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import {
    addOrganization,
    editOrganization,
    fetchEnabledOrganizationTree,
    fetchEnabledOrganizationUserList
  } from '@/api/system-manage'
  import { fetchEnabledTenantList } from '@/api/system-manage/tenant'
  import { useUserStore } from '@/store/modules/user'
  import { uniqueValidator } from '@/utils/form/validator'

  type Organization = Api.SystemManage.OrganizationListItem
  type OrganizationSavePayload = Api.SystemManage.OrganizationSavePayload
  type DialogType = 'add' | 'edit'

  interface OpenData {
    type: DialogType
    row?: Organization
    parent?: Organization
  }

  interface FormModel extends OrganizationSavePayload {
    isSystem?: boolean
  }

  interface ArtFormExpose {
    validate: () => Promise<boolean | void>
    clearValidate: () => void
    validateField: (prop: string) => void
    reloadOptions: (key?: string) => Promise<void>
  }

  interface Emits {
    (e: 'success', type: DialogType): void
  }

  const emit = defineEmits<Emits>()
  const userStore = useUserStore()
  const { getDictMap, getUserInfo, isPlatformSuper } = storeToRefs(userStore)
  const dialogRef = ref<ArtDialogExpose<OpenData>>()
  const activeTab = ref('')
  const formRef = ref<ArtFormExpose>()
  const dialogType = ref<DialogType>('add')
  const editingTenantOption = ref<Api.SystemManage.TenantListItem | null>(null)

  const canSelectTenant = computed(() => Boolean(isPlatformSuper.value))
  const currentTenantId = computed(() => getUserInfo.value.tenantId)
  const isEditing = computed(() => dialogType.value === 'edit')
  const contextTitle = computed(() =>
    dialogType.value === 'add' ? '建立新的组织节点' : '维护组织职责与归属关系'
  )
  const contextDescription = computed(() =>
    dialogType.value === 'add'
      ? '组织建立后，可在用户与角色管理中直接选择该节点完成授权归属。'
      : '层级和租户变更会影响成员、角色与菜单权限的治理视图，请谨慎调整。'
  )

  const getOrganizationUserLabel = (item: Record<string, unknown>): string => {
    const email = normalizeIdentityDisplayText(item.userEmail)
    const displayName =
      normalizeIdentityDisplayText(item.nickName) ||
      normalizeIdentityDisplayText(item.userName) ||
      email ||
      '未命名用户'

    return email && email !== displayName ? `${displayName}（${email}）` : displayName
  }

  const createInitialForm = (): FormModel => ({
    id: undefined,
    tenantId: undefined,
    parentId: null,
    organizationCode: '',
    organizationName: '',
    organizationType: 'department',
    leaderUserId: null,
    status: '1',
    sort: 0,
    phone: null,
    email: null,
    address: null,
    description: null,
    isSystem: false
  })

  const form = ref<FormModel>(createInitialForm())

  const fetchTenantOptions = async () => {
    const response = await fetchEnabledTenantList()
    const current = editingTenantOption.value
    if (!current?.id || response.error || response.data?.some((item) => item.id === current.id)) {
      return response
    }
    return { ...response, data: [...(response.data ?? []), current] }
  }

  const rules = computed<FormRules<FormModel>>(() => ({
    tenantId: canSelectTenant.value
      ? [{ required: true, message: '请选择所属租户', trigger: 'change' }]
      : [],
    organizationName: [
      { required: true, message: '请输入组织名称', trigger: 'blur' },
      { min: 2, max: 80, message: '长度应为 2 到 80 个字符', trigger: 'blur' }
    ],
    organizationCode: [
      { required: true, message: '请输入组织编码', trigger: 'blur' },
      {
        pattern: /^[A-Za-z0-9_-]{2,50}$/,
        message: '编码仅支持字母、数字、下划线和中横线，长度 2 到 50',
        trigger: 'blur'
      },
      {
        validator: uniqueValidator({
          table: 'mdm_organization',
          field: 'organization_code',
          getExcludeId: () => form.value.id,
          extraWhere: () => ({ tenant_id: form.value.tenantId }),
          message: '当前租户已存在相同组织编码'
        }),
        trigger: 'blur'
      }
    ],
    organizationType: [{ required: true, message: '请选择组织类型', trigger: 'change' }],
    email: [{ type: 'email', message: '请输入正确的联系邮箱', trigger: 'blur' }],
    phone: [{ max: 30, message: '联系电话不能超过 30 个字符', trigger: 'blur' }],
    description: [{ max: 500, message: '职责说明不能超过 500 个字符', trigger: 'blur' }]
  }))

  const formItems = computed<FormItem[]>(() => [
    {
      label: '组织层级',
      key: 'hierarchySection',
      type: 'tab',
      span: 24
    },
    {
      label: '所属租户',
      key: 'tenantId',
      type: 'select',
      span: 24,
      hidden: !canSelectTenant.value,
      api: fetchTenantOptions,
      resultField: 'data',
      labelField: 'tenantName',
      valueField: 'id',
      labelFn: (item) => `${item.tenantName}（${item.tenantCode}）`,
      props: {
        disabled: isEditing.value,
        filterable: true,
        placeholder: '请选择所属租户',
        onChange: handleTenantChange
      }
    },
    {
      label: '上级组织',
      key: 'parentId',
      type: 'treeSelect',
      span: 24,
      api: fetchEnabledOrganizationTree,
      immediate: false,
      beforeFetch: () => ({ tenantId: form.value.tenantId, excludeId: form.value.id }),
      resultField: 'data',
      labelField: 'organizationName',
      valueField: 'id',
      childrenField: 'children',
      props: {
        disabled: form.value.isSystem || !form.value.tenantId,
        clearable: true,
        checkStrictly: true,
        defaultExpandAll: true,
        renderAfterExpand: false,
        placeholder: form.value.tenantId ? '不选则为一级组织' : '请先选择租户'
      },
      description: form.value.isSystem ? '系统根组织固定为最高层级。' : '支持跨层级选择上级组织。'
    },
    {
      label: '组织名称',
      key: 'organizationName',
      type: 'input',
      props: {
        maxlength: 80,
        clearable: true,
        placeholder: '如：华东运营中心'
      }
    },
    {
      label: '组织编码',
      key: 'organizationCode',
      type: 'input',
      props: {
        disabled: form.value.isSystem,
        maxlength: 50,
        clearable: true,
        placeholder: '如：EAST_OPS'
      },
      help: '同一租户内唯一，建议使用稳定的业务编码。'
    },
    {
      label: '组织类型',
      key: 'organizationType',
      type: 'select',
      props: {
        disabled: form.value.isSystem,
        options: getDictMap.value.organizationType ?? [],
        placeholder: '请选择组织类型'
      }
    },
    {
      label: '显示排序',
      key: 'sort',
      type: 'number',
      props: {
        min: 0,
        max: 9999,
        controlsPosition: 'right',
        class: '!w-full'
      }
    },
    {
      label: '职责与联系',
      key: 'contactSection',
      type: 'tab',
      span: 24
    },
    {
      label: '组织负责人',
      key: 'leaderUserId',
      type: 'userSelect',
      span: 24,
      api: fetchEnabledOrganizationUserList,
      immediate: false,
      beforeFetch: () => ({ tenantId: form.value.tenantId }),
      resultField: 'data',
      labelField: 'nickName',
      valueField: 'id',
      labelFn: getOrganizationUserLabel,
      props: {
        disabled: !form.value.tenantId,
        clearable: true,
        filterable: true,
        placeholder: form.value.tenantId ? '请选择负责人' : '请先选择租户',
        noDataText: '当前租户暂无启用用户',
        noMatchText: '未找到匹配用户'
      },
      description: '负责人必须属于同一租户，可与成员的直接所属组织不同。'
    },
    {
      label: '联系电话',
      key: 'phone',
      type: 'input',
      props: { maxlength: 30, clearable: true, placeholder: '组织公共联系电话' }
    },
    {
      label: '联系邮箱',
      key: 'email',
      type: 'input',
      props: { maxlength: 120, clearable: true, placeholder: '组织公共联系邮箱' }
    },
    {
      label: '办公地址',
      key: 'address',
      type: 'input',
      span: 24,
      props: { maxlength: 200, clearable: true, placeholder: '可填写办公地点或服务区域' }
    },
    {
      label: '职责说明',
      key: 'description',
      type: 'input',
      span: 24,
      props: {
        type: 'textarea',
        rows: 3,
        maxlength: 500,
        showWordLimit: true,
        placeholder: '说明该组织的职责范围、服务边界或协作关系'
      }
    },
    {
      label: '状态',
      key: 'status',
      type: 'segment',
      span: 24,
      props: {
        disabled: form.value.isSystem,
        options: getDictMap.value.status ?? []
      },
      description: form.value.isSystem
        ? '系统根组织始终启用。'
        : '停用组织不会删除成员和角色，但不再出现在可选组织列表中。'
    }
  ])

  const resetForm = async (): Promise<void> => {
    Object.assign(form.value, createInitialForm())
    editingTenantOption.value = null
    await nextTick()
    formRef.value?.clearValidate()
  }

  const initializeForm = async (data: OpenData): Promise<void> => {
    await resetForm()
    dialogType.value = data.type

    if (data.row) {
      const row = cloneDeep(data.row)
      if (row.tenantId && row.tenant?.tenantName) {
        editingTenantOption.value = {
          id: row.tenantId,
          tenantName: row.tenant.tenantName,
          tenantCode: row.tenant.tenantCode
        }
      }
      Object.assign(form.value, {
        id: row.id,
        tenantId: row.tenantId,
        parentId: row.parentId ?? null,
        organizationCode: row.organizationCode,
        organizationName: row.organizationName,
        organizationType: row.organizationType,
        leaderUserId: row.leaderUserId ?? null,
        status: row.status,
        sort: row.sort,
        phone: row.phone ?? null,
        email: row.email ?? null,
        address: row.address ?? null,
        description: row.description ?? null,
        isSystem: row.isSystem
      })
      return
    }

    if (data.parent) {
      Object.assign(form.value, {
        tenantId: data.parent.tenantId,
        parentId: data.parent.id ?? null
      })
    } else if (!canSelectTenant.value) {
      form.value.tenantId = currentTenantId.value
    }
  }

  const handleTenantChange = (): void => {
    Object.assign(form.value, { parentId: null, leaderUserId: null })
    void Promise.all([
      formRef.value?.reloadOptions('parentId'),
      formRef.value?.reloadOptions('leaderUserId')
    ])
    if (form.value.organizationCode) {
      void formRef.value?.validateField('organizationCode')
    }
  }

  const buildPayload = (): OrganizationSavePayload => ({
    id: form.value.id,
    tenantId: form.value.tenantId,
    parentId: form.value.parentId || null,
    organizationCode: form.value.organizationCode.trim().toUpperCase(),
    organizationName: form.value.organizationName.trim(),
    organizationType: form.value.organizationType,
    leaderUserId: form.value.leaderUserId || null,
    status: form.value.status,
    sort: Number(form.value.sort || 0),
    phone: normalizeNullableText(form.value.phone),
    email: normalizeNullableText(form.value.email),
    address: normalizeNullableText(form.value.address),
    description: normalizeNullableText(form.value.description)
  })

  const handleSubmit = async (): Promise<boolean> => {
    if (!formRef.value) return false
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
    } catch (error) {
      notifyFriendlyError(error, '表单校验未完成，请稍后重试', 'warning')
      return false
    }

    try {
      const payload = buildPayload()
      if (dialogType.value === 'add') {
        await addOrganization(payload)
      } else {
        await editOrganization(payload)
      }
      emit('success', dialogType.value)
      return true
    } catch (error) {
      notifyFriendlyError(error, '组织保存失败，请检查层级与名称后重试', 'warning')
      return false
    }
  }

  const handleOpen = async (data: OpenData): Promise<void> => {
    activeTab.value = ''
    await initializeForm(data)
    await dialogRef.value?.handleOpen(data, {
      title: data.type === 'add' ? '新增组织' : '编辑组织',
      contentMaxHeight: '72vh',
      loading: true,
      onOpen: async (_openData, api) => {
        try {
          await Promise.all([
            canSelectTenant.value ? formRef.value?.reloadOptions('tenantId') : undefined,
            formRef.value?.reloadOptions('parentId'),
            formRef.value?.reloadOptions('leaderUserId')
          ])
        } finally {
          api.setLoading(false)
        }
      },
      onConfirm: handleSubmit,
      onReset: () => void resetForm()
    })
  }

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .organization-dialog {
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
