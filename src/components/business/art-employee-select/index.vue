<template>
  <ArtDataSelect
    mode="table"
    :multiple="multiple"
    :show-selected-panel="multiple"
    :model-value="multiple ? modelValues : modelValue"
    :selected-data="selectedData"
    :resolve-selected="selectedReferenceLoader"
    :api-fn="fetchEmployees"
    :columns="columns"
    :placeholder="canFetchEmployees ? placeholder : '请先选择目标租户'"
    :disabled="disabled || !canFetchEmployees"
    :clearable="clearable"
    row-key="id"
    :label-key="getEmployeeLabel"
    :description-key="getEmployeeDescription"
    :title="title"
    :subtitle="subtitle"
    :search-placeholder="searchPlaceholder"
    empty-text="暂无可选人员"
    :empty-description="
      apiFn
        ? '当前数据来源没有匹配的人员，请调整搜索条件或完善人员配置。'
        : '当前租户没有可选的在职或试用期员工，请先完善员工花名册。'
    "
    :show-pagination="true"
    :page-size="10"
    :page-sizes="[10, 20, 30, 50]"
    @update:model-value="updateValue"
    @update:selected-data="handleSelectedDataChange"
    @change="handleChange"
    @confirm="handleConfirm"
    @clear="emit('clear')"
  >
    <template v-if="!apiFn" #empty>
      <ArtDataSourceEmptyActions resource-name="员工花名册" :actions="employeeMaintenanceActions" />
    </template>
  </ArtDataSelect>
</template>

<script setup lang="ts">
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import { normalizeSingleStringKey, normalizeStringList } from '@/utils/form/normalize'

  import ArtDataSelect from '@/components/core/forms/art-data-select/index.vue'
  import ArtDataSourceEmptyActions, {
    type ArtDataSourceEmptyAction
  } from '@/components/business/art-data-source-empty-actions/index.vue'
  import type {
    DataSelectColumn,
    DataSelectFetchResult,
    DataSelectFetchParams,
    DataSelectKey
  } from '@/components/core/forms/art-data-select/types'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import {
    fetchEmployeeSelectorList,
    fetchEmployeeReferencesByIds,
    type EmployeeIntegrationItem
  } from '@/api/integration/employees'

  defineOptions({ name: 'ArtEmployeeSelect' })

  interface Props {
    modelValue?: string
    multiple?: boolean
    modelValues?: string[]
    selectedData?: EmployeeIntegrationItem[]
    tenantId?: string
    /** Allow the platform super administrator to search across tenants in the all-tenant scope. */
    allowAllTenantRead?: boolean
    title?: string
    subtitle?: string
    placeholder?: string
    searchPlaceholder?: string
    disabled?: boolean
    clearable?: boolean
    apiFn?: typeof fetchEmployeeSelectorList
    /** Available display fields for this source; never a substitute for server authorization. */
    displayFields?: readonly (
      'organization' | 'jobTitle' | 'gender' | 'age' | 'phone' | 'employmentStatus'
    )[]
  }

  const props = withDefaults(defineProps<Props>(), {
    modelValue: undefined,
    multiple: false,
    modelValues: () => [],
    selectedData: () => [],
    tenantId: '',
    allowAllTenantRead: false,
    title: '选择员工',
    subtitle: '按姓名、工号、组织或岗位检索员工档案',
    placeholder: '请选择员工',
    searchPlaceholder: '搜索姓名、工号、组织或岗位',
    disabled: false,
    clearable: true,
    displayFields: () => ['organization', 'jobTitle', 'phone', 'employmentStatus']
  })

  const emit = defineEmits<{
    'update:modelValue': [value: string | undefined]
    'update:modelValues': [value: string[]]
    confirmMultiple: [value: string[], rows: EmployeeIntegrationItem[]]
    'update:selectedData': [rows: EmployeeIntegrationItem[]]
    change: [value: string | string[] | undefined, rows: EmployeeIntegrationItem[]]
    confirm: [value: string | undefined, rows: EmployeeIntegrationItem[]]
    clear: []
  }>()

  const tenantScopeStore = useTenantScopeStore()
  const { effectiveTenantId } = storeToRefs(tenantScopeStore)
  const resolvedTenantId = computed(() => props.tenantId || effectiveTenantId.value || '')
  const canFetchEmployees = computed(
    () =>
      Boolean(resolvedTenantId.value) ||
      (props.allowAllTenantRead &&
        tenantScopeStore.isPlatformScope &&
        tenantScopeStore.isAllTenants)
  )
  const selectedReferenceLoader = computed(() => {
    const tenantId = resolvedTenantId.value
    return tenantId
      ? (keys: DataSelectKey[]) => fetchEmployeeReferencesByIds(tenantId, normalizeStringList(keys))
      : undefined
  })
  const employeeMaintenanceActions = [
    {
      label: '去维护员工花名册',
      routeName: 'HrEmployeeRoster',
      permission: 'Hr:Employee:View',
      icon: 'ri:contacts-book-3-line'
    }
  ] as const satisfies readonly ArtDataSourceEmptyAction[]

  const getEmployeeLabel = (employee: EmployeeIntegrationItem): string => {
    const employeeName = employee.employeeName || '未命名员工'
    return employee.employeeNo ? `${employeeName} · ${employee.employeeNo}` : employeeName
  }

  const getEmployeeDescription = (employee: EmployeeIntegrationItem): string => {
    return [
      props.displayFields.includes('organization') && employee.organization?.organizationName,
      props.displayFields.includes('jobTitle') && employee.jobTitle,
      props.displayFields.includes('phone') && employee.phone
    ]
      .filter(Boolean)
      .join(' · ')
  }

  const allColumns: DataSelectColumn<EmployeeIntegrationItem>[] = [
    { prop: 'employeeName', label: '员工姓名', minWidth: 130 },
    { prop: 'employeeNo', label: '员工工号', minWidth: 130 },
    {
      prop: 'organization',
      label: '所属组织',
      minWidth: 160,
      formatter: (row: EmployeeIntegrationItem) => {
        const organization = row.organization
        return organization === undefined
          ? '未提供组织信息'
          : organization?.organizationName || '未分配组织'
      }
    },
    {
      prop: 'jobTitle',
      label: '工作岗位',
      minWidth: 140,
      formatter: (row: EmployeeIntegrationItem) => {
        const jobTitle = row.jobTitle
        return jobTitle === undefined ? '未提供岗位信息' : jobTitle || '未分配岗位'
      }
    },
    { prop: 'gender', label: '性别', width: 80, dict: { code: 'sex', display: 'text' } },
    { prop: 'age', label: '年龄', width: 80 },
    { prop: 'phone', label: '手机号码', width: 140 },
    {
      prop: 'employmentStatus',
      label: '任职状态',
      width: 110,
      dict: { code: 'hrEmploymentStatus', display: 'auto' }
    }
  ]
  const columns = computed(() =>
    allColumns.filter(
      (column) =>
        column.prop === 'employeeName' ||
        column.prop === 'employeeNo' ||
        props.displayFields.some((field) => field === column.prop)
    )
  )

  const updateValue = (value: DataSelectKey | DataSelectKey[] | undefined): void => {
    if (props.multiple) emit('update:modelValues', normalizeStringList(value))
    else emit('update:modelValue', normalizeSingleStringKey(value))
  }

  const fetchEmployees = async (
    params: DataSelectFetchParams
  ): Promise<DataSelectFetchResult<EmployeeIntegrationItem>> => {
    if (!canFetchEmployees.value) return { data: [], total: 0 }
    const { from, to } = buildSupabasePageRange({ current: params.page, size: params.pageSize })
    const result = await (props.apiFn ?? fetchEmployeeSelectorList)(
      {
        tenantId: resolvedTenantId.value,
        keyword: params.keyword,
        from,
        to
      },
      { showErrorMessage: false }
    )
    if (result.error) throw result.error
    return { data: result.data, total: result.total }
  }

  const handleSelectedDataChange = (rows: EmployeeIntegrationItem[]): void =>
    emit('update:selectedData', rows)

  const handleChange = (
    value: DataSelectKey | DataSelectKey[] | undefined,
    rows: EmployeeIntegrationItem[]
  ): void =>
    emit(
      'change',
      props.multiple ? normalizeStringList(value) : normalizeSingleStringKey(value),
      rows
    )

  const handleConfirm = (
    value: DataSelectKey | DataSelectKey[] | undefined,
    rows: EmployeeIntegrationItem[]
  ): void => {
    if (props.multiple) emit('confirmMultiple', normalizeStringList(value), rows)
    else emit('confirm', normalizeSingleStringKey(value), rows)
  }
</script>
