<template>
  <ArtForm
    ref="searchBarRef"
    v-model="modelValue"
    root-class="art-search-bar art-card-xs"
    :items="items"
    tenant-scope-mode="read"
    :span="span"
    :gutter="gutter"
    :label-position="labelPosition"
    :label-width="labelWidth"
    :button-left-limit="buttonLeftLimit"
    :show-reset="showReset"
    :reset-loading="resetLoading"
    :submit-loading="searchLoading"
    :show-submit="showSearch"
    :disabled-submit="disabledSearch"
    :sanitize-output="sanitizeOutput"
    :enable-expand="true"
    :is-expand="isExpand"
    :default-expanded="defaultExpanded"
    :show-expand="showExpand"
    :applied-search-values="appliedSearchValues"
    :reset-text="t('table.searchBar.reset')"
    :submit-text="t('table.searchBar.search')"
    v-bind="{ ...$attrs }"
    @submit="emit('search', $event)"
    @reset="emit('reset')"
    @keydown.enter="handleEnterSearch"
  >
    <template v-for="slotName in slotNames" :key="slotName" #[slotName]="slotProps">
      <slot :name="slotName" v-bind="slotProps" />
    </template>
  </ArtForm>
</template>

<script setup lang="ts">
  import type { FormInstance } from 'element-plus'
  import { computed } from 'vue'
  import { useI18n } from 'vue-i18n'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'

  defineOptions({ name: 'ArtSearchBar' })

  type SearchBarValue = Record<string, unknown>
  export type SearchFormItem = FormItem
  const enterSearchInputTypes = ['text', 'search', 'email', 'tel', 'url', 'number']

  export interface SearchBarProps {
    items: SearchFormItem[]
    span?: number
    gutter?: number
    isExpand?: boolean
    defaultExpanded?: boolean
    labelPosition?: 'left' | 'right' | 'top'
    labelWidth?: string | number
    showExpand?: boolean
    buttonLeftLimit?: number
    showReset?: boolean
    resetLoading?: boolean
    searchLoading?: boolean
    showSearch?: boolean
    disabledSearch?: boolean
    enableEnterSearch?: boolean
    sanitizeOutput?: Record<string, boolean>
    appliedSearchValues?: Readonly<SearchBarValue> | null
  }

  const props = withDefaults(defineProps<SearchBarProps>(), {
    items: () => [],
    span: 6,
    gutter: 12,
    isExpand: false,
    defaultExpanded: false,
    labelPosition: 'right',
    labelWidth: '70px',
    showExpand: true,
    buttonLeftLimit: 0,
    showReset: true,
    resetLoading: false,
    searchLoading: false,
    showSearch: true,
    disabledSearch: false,
    enableEnterSearch: true,
    sanitizeOutput: () => ({
      removeEmptyString: true,
      removeEmptyArray: true,
      removeEmptyObject: true,
      removeEmptyRichText: true
    })
  })

  const emit = defineEmits<{
    reset: []
    search: [SearchBarValue]
  }>()

  const modelValue = defineModel<SearchBarValue>({ default: () => ({}) })
  const slots = useSlots()
  const { t } = useI18n()
  const searchBarRef = ref<InstanceType<typeof ArtForm>>()

  const slotNames = computed(() =>
    props.items.map((item) => item.key).filter((name) => !!slots[name])
  )

  const handleEnterSearch = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing) return

    const { target } = event
    // Buttons and composite pickers own their Enter key, including reset and expansion.
    if (
      !(target instanceof HTMLInputElement) ||
      !enterSearchInputTypes.includes(target.type) ||
      target.closest(
        '[role="combobox"], .el-cascader, .el-date-editor, .el-time-panel, .el-input-number'
      )
    )
      return

    event.preventDefault()
    if (props.enableEnterSearch) searchBarRef.value?.submit()
  }

  defineExpose({
    ref: computed(() => searchBarRef.value?.ref),
    validate: (...args: Parameters<FormInstance['validate']>) =>
      searchBarRef.value?.validate(...args),
    clearValidate: (...args: Parameters<FormInstance['clearValidate']>) =>
      searchBarRef.value?.clearValidate(...args),
    reset: () => searchBarRef.value?.reset(),
    fetchOptions: (item: FormItem) => searchBarRef.value?.fetchOptions(item),
    reloadOptions: (key?: string) => searchBarRef.value?.reloadOptions(key),
    getOutput: () => searchBarRef.value?.getOutput()
  })
</script>
