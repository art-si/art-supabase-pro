<template>
  <ArtDataSelect
    mode="table"
    :multiple="multiple"
    :model-value="multiple ? modelValues : modelValue"
    :selected-data="selectedData"
    :api-fn="apiFn"
    :columns="columns"
    :navigation="navigation"
    row-key="id"
    :label-key="labelKey || getMaterialLabel"
    :description-key="getMaterialDescription"
    :title="title"
    :subtitle="subtitle"
    :dialog-width="dialogWidth"
    :placeholder="placeholder"
    :search-placeholder="searchPlaceholder"
    :empty-text="emptyText"
    :empty-description="emptyDescription"
    :disabled-key="disabledKey"
    :disabled="disabled"
    :clearable="clearable"
    :show-selected-panel="showSelectedPanel"
    :reset-draft-on-open="resetDraftOnOpen"
    :show-pagination="true"
    :page-size="10"
    :page-sizes="[10, 20, 30, 50]"
    @update:model-value="updateValue"
    @update:selected-data="handleSelectedDataChange"
    @change="handleChange"
    @confirm="handleConfirm"
    @clear="emit('clear')"
  >
    <template v-if="$slots.trigger" #trigger="slotProps">
      <slot name="trigger" v-bind="slotProps" />
    </template>
  </ArtDataSelect>
</template>

<script setup lang="ts" generic="T extends MaterialSelectRecord = MaterialSelectRecord">
  import ArtDataSelect from '@/components/core/forms/art-data-select/index.vue'
  import type {
    ArtDataSelectProps,
    DataSelectApiFn,
    DataSelectColumn,
    DataSelectKey
  } from '@/components/core/forms/art-data-select/types'
  import { normalizeSingleStringKey, normalizeStringList } from '@/utils/form/normalize'
  import { buildMaterialCategoryNavigation } from '@/utils/business/material-category'
  import type { MaterialSelectCategory, MaterialSelectRecord } from './types'

  defineOptions({ name: 'ArtMaterialSelect' })

  interface Props {
    modelValue?: string
    multiple?: boolean
    modelValues?: string[]
    selectedData?: T[]
    apiFn: DataSelectApiFn<T>
    categories?: MaterialSelectCategory[]
    title?: string
    subtitle?: string
    dialogWidth?: ArtDataSelectProps['dialogWidth']
    placeholder?: string
    searchPlaceholder?: string
    emptyText?: string
    emptyDescription?: string
    disabledKey?: string | ((row: T) => boolean)
    disabled?: boolean
    clearable?: boolean
    showSelectedPanel?: boolean
    labelKey?: string | ((row: T) => string)
    resetDraftOnOpen?: boolean
  }

  const props = withDefaults(defineProps<Props>(), {
    modelValue: undefined,
    multiple: false,
    modelValues: () => [],
    selectedData: () => [],
    categories: () => [],
    title: '数据来源物料编码',
    subtitle: '按物料分类筛选并选择业务所需的物料编码',
    placeholder: '请选择物料',
    searchPlaceholder: '搜索物料编码、名称、规格型号或图号',
    emptyText: '暂无可选物料',
    emptyDescription: '请先维护物料编码后再继续当前业务。',
    disabledKey: undefined,
    disabled: false,
    clearable: true,
    showSelectedPanel: true,
    resetDraftOnOpen: false
  })

  const emit = defineEmits<{
    'update:modelValue': [value: string | undefined]
    'update:modelValues': [value: string[]]
    'update:selectedData': [rows: T[]]
    change: [value: string | string[] | undefined, rows: T[]]
    confirm: [value: string | string[] | undefined, rows: T[]]
    clear: []
  }>()

  const getMaterialLabel = (row: T): string => row.materialName || '未命名物料'

  const getMaterialDescription = (row: T): string => row.materialCode || '未维护编码'

  const columns: DataSelectColumn<T>[] = [
    { prop: 'materialCode', label: '物料编码', minWidth: 150 },
    { prop: 'materialName', label: '物料名称', minWidth: 180 },
    { prop: 'description', label: '物料描述', minWidth: 220 },
    { prop: 'specificationModel', label: '规格型号', minWidth: 150 },
    { prop: 'drawingNo', label: '图号', minWidth: 130 },
    { prop: 'materialComposition', label: '材质', minWidth: 120 },
    { prop: 'brand', label: '品牌', minWidth: 120 },
    { prop: 'category.categoryName', label: '物料分类', minWidth: 140 },
    {
      prop: 'materialTypeRef.typeName',
      label: '物料类型',
      minWidth: 120,
      formatter: (row: MaterialSelectRecord) => {
        return row.materialTypeRef?.typeName || row.materialType || '—'
      }
    },
    {
      prop: 'materialSource',
      label: '物料来源',
      minWidth: 110,
      dict: { code: 'mdmMaterialSource' }
    },
    {
      prop: 'specialPurchaseType',
      label: '特殊采购类',
      minWidth: 120,
      dict: { code: 'mdmMaterialSpecialPurchaseType', display: 'tag' }
    }
  ]

  const navigation = computed(() =>
    props.categories.length ? buildMaterialCategoryNavigation(props.categories) : undefined
  )

  const updateValue = (value: DataSelectKey | DataSelectKey[] | undefined): void => {
    if (props.multiple) emit('update:modelValues', normalizeStringList(value))
    else emit('update:modelValue', normalizeSingleStringKey(value))
  }

  const normalizedEventValue = (
    value: DataSelectKey | DataSelectKey[] | undefined
  ): string | string[] | undefined =>
    props.multiple ? normalizeStringList(value) : normalizeSingleStringKey(value)

  const handleSelectedDataChange = (rows: T[]): void => emit('update:selectedData', rows)

  const handleChange = (value: DataSelectKey | DataSelectKey[] | undefined, rows: T[]): void =>
    emit('change', normalizedEventValue(value), rows)

  const handleConfirm = (value: DataSelectKey | DataSelectKey[] | undefined, rows: T[]): void =>
    emit('confirm', normalizedEventValue(value), rows)
</script>
