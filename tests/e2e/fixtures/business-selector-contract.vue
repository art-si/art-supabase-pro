<template>
  <main class="space-y-4 p-4">
    <ArtEmployeeSelect
      v-if="kind === 'employee'"
      v-model="singleValue"
      v-model:model-values="multipleValues"
      :multiple="multiple"
      :api-fn="fetchEmployees"
      title="员工记录契约"
      placeholder="打开员工记录"
      @update:selected-data="recordEmployees('selected', $event)"
      @change="(value, rows) => recordEmployees('change', rows, value)"
      @confirm="(value, rows) => recordEmployees('confirm', rows, value)"
      @confirm-multiple="(value, rows) => recordEmployees('confirm', rows, value)"
    />
    <ArtMaterialSelect
      v-else
      v-model="singleValue"
      v-model:model-values="multipleValues"
      :multiple="multiple"
      :api-fn="fetchMaterials"
      title="物料记录契约"
      placeholder="打开物料记录"
      :show-selected-panel="multiple"
      :label-key="(row) => `${row.materialName}（可用 ${row.warehouse.availableQuantity}）`"
      :disabled-key="(row) => row.warehouse.availableQuantity === 0"
      @update:selected-data="recordMaterials('selected', $event)"
      @change="(value, rows) => recordMaterials('change', rows, value)"
      @confirm="(value, rows) => recordMaterials('confirm', rows, value)"
    />
    <output data-testid="model">{{
      JSON.stringify(multiple ? multipleValues : singleValue)
    }}</output>
    <output data-testid="events">{{ JSON.stringify(events) }}</output>
    <output v-if="kind === 'employee'" data-testid="employee-range">{{
      JSON.stringify(employeeRequest)
    }}</output>
  </main>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import ArtEmployeeSelect from '@/components/business/art-employee-select/index.vue'
  import ArtMaterialSelect from '@/components/business/art-material-select/index.vue'
  import type {
    EmployeeIntegrationItem,
    EmployeeSelectorContractParams
  } from '@/api/integration/employees'
  import type { DataSelectFetchResult } from '@/components/core/forms/art-data-select/types'

  const parameters = new URLSearchParams(location.search)
  const kind = parameters.get('kind') ?? 'material'
  const multiple = parameters.has('multiple')
  const singleValue = ref<string | undefined>(
    parameters.has('unresolved') ? 'not-loaded' : undefined
  )
  const multipleValues = ref<string[]>(parameters.has('unresolved') ? ['not-loaded'] : [])
  const events = ref<unknown[]>([])
  const employeeRequest = ref<EmployeeSelectorContractParams>()

  interface StockMaterial {
    id: string
    materialCode: string
    materialName: string
    tenantId: string
    warehouse: { id: string; availableQuantity: number }
  }

  const employee: EmployeeIntegrationItem = {
    id: '0',
    tenantId: '11111111-1111-4111-8111-111111111111',
    employeeNo: 'EMP-0',
    employeeName: '零号员工',
    employmentStatus: 'active',
    phone: '13800000000',
    organization: { id: 'org-0', organizationCode: 'ORG-0', organizationName: '研发组' }
  }
  const material: StockMaterial = {
    id: '0',
    tenantId: employee.tenantId,
    materialCode: 'MAT-0',
    materialName: '零号物料',
    warehouse: { id: 'warehouse-0', availableQuantity: 7 }
  }
  const fetchEmployees = async (params: EmployeeSelectorContractParams) => {
    employeeRequest.value = params
    return { data: [employee], total: 1, error: null, fieldAccess: {} }
  }
  const fetchMaterials = (): DataSelectFetchResult<StockMaterial> => ({
    data: [material],
    total: 1
  })

  function recordEmployees(
    name: string,
    rows: EmployeeIntegrationItem[],
    value?: string | string[]
  ): void {
    events.value.push({ name, value, rows, context: rows[0]?.organization?.organizationName })
  }
  function recordMaterials(name: string, rows: StockMaterial[], value?: string | string[]): void {
    events.value.push({ name, value, rows, context: rows[0]?.warehouse.availableQuantity })
  }
</script>
