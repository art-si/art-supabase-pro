<template>
  <main class="grid gap-4 p-4">
    <SiteSelect
      v-if="kind === 'site'"
      v-model="single"
      v-model:selected-data="selectedSites"
      :sites="sites"
    />
    <StandardSelect
      v-else-if="kind === 'standard'"
      v-model="multipleValues"
      v-model:selected-data="selectedStandards"
      :standards="standards"
    />
    <AccidentSelect
      v-else-if="kind === 'accident'"
      v-model="single"
      v-model:selected-data="selectedAccidents"
    />
    <InspectionSelect
      v-else-if="kind === 'inspection'"
      v-model="multipleValues"
      v-model:selected-data="selectedItems"
    />
    <EquipmentSelect
      v-else
      v-model="single"
      v-model:model-values="multipleValues"
      v-model:selected-data="selectedEquipment"
      :multiple="kind === 'equipment-multiple'"
      :tenant-id="tenantId"
    />
    <output data-testid="model">{{
      JSON.stringify(isMultiple ? multipleValues : (single ?? null))
    }}</output>
    <output data-testid="records" class="break-all">{{ JSON.stringify(selectedRows) }}</output>
    <button v-if="kind.startsWith('equipment')" type="button" @click="tenantId = null"
      >移除设备租户上下文</button
    >
  </main>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import SiteSelect from '@smis/views/safety-production/anti-violation-management/shared/anti-violation-site-select.vue'
  import StandardSelect from '@smis/views/safety-production/anti-violation-management/shared/anti-violation-standard-multiple-select.vue'
  import AccidentSelect from '@smis/views/safety-production/safety-accident/shared/accident-report-select.vue'
  import InspectionSelect from '@smis/views/dual-control-system/hidden-hazard-governance/hidden-hazard-inspection-plan/modules/inspection-item-multiple-select.vue'
  import EquipmentSelect from '@pmis/views/components/equipment-select.vue'
  import type {
    SmisSite,
    SmisAntiViolationStandardOption,
    SmisAccidentOption,
    SmisInspectionItem
  } from '@smis/api'
  import type { PmisEquipmentOption } from '@pmis/api'

  const kind = new URLSearchParams(location.search).get('kind') ?? 'site'
  const isMultiple = ['standard', 'inspection', 'equipment-multiple'].includes(kind)
  const single = ref<string>()
  const multipleValues = ref<string[]>([])
  const tenantId = ref<string | null>('11111111-1111-4111-8111-111111111111')
  const selectedSites = ref<SmisSite[]>([])
  const selectedStandards = ref<SmisAntiViolationStandardOption[]>([])
  const selectedAccidents = ref<SmisAccidentOption[]>([])
  const selectedItems = ref<SmisInspectionItem[]>([])
  const selectedEquipment = ref<PmisEquipmentOption[]>([])
  const selectedRows = computed(() => {
    if (kind === 'site') return selectedSites.value
    if (kind === 'standard') return selectedStandards.value
    if (kind === 'accident') return selectedAccidents.value
    if (kind === 'inspection') return selectedItems.value
    return selectedEquipment.value
  })
  const sites: Array<SmisSite & { businessMarker: string }> = ['0', '1'].map((id) => ({
    id,
    organizationId: 'org-test',
    siteName: id === '0' ? '零号场所' : '一号场所',
    categoryCode: 'test',
    sort: Number(id),
    coordinateSystem: 'wgs84',
    imageUrls: [],
    addressDetail: '测试地址',
    businessMarker: `marker-${id}`,
    organization: { id: 'org-test', organizationCode: 'ORG-001', organizationName: '测试组织' }
  }))
  const standards: Array<SmisAntiViolationStandardOption & { businessMarker: string }> = [
    '0',
    '1'
  ].map((id) => ({
    id,
    standardCode: `STD-${id}`,
    standardName: id === '0' ? '零号违章项目' : '一号违章项目',
    categoryId: 'category-test',
    categoryName: '测试分类',
    deductionPoints: Number(id),
    businessMarker: `marker-${id}`
  }))
</script>
