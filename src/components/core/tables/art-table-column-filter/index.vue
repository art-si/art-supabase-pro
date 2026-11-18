<template>
  <ElPopover
    v-model:visible="open"
    trigger="click"
    :width="300"
    placement="bottom-start"
    role="dialog"
    :aria-label="`${label}过滤`"
    @before-enter="resetDraft"
    @after-enter="focusFilterInput"
  >
    <template #reference>
      <ArtIconButton
        ref="triggerButton"
        size="small"
        icon="ri:filter-3-line"
        :label="`${label}过滤`"
        :class="{ 'text-[var(--el-color-primary)]!': active }"
        :aria-pressed="active"
        :aria-expanded="open"
        aria-haspopup="dialog"
        data-art-column-filter
        @click="stopHeaderClick"
      />
    </template>
    <div class="flex flex-col gap-3" @click.stop @keydown.stop @keydown.esc="open = false">
      <div class="flex items-center justify-between gap-2">
        <strong class="truncate text-sm text-g-900">{{ label }}</strong>
        <span class="shrink-0 text-xs text-g-600">当前页过滤</span>
      </div>
      <ElSelect
        ref="emptySelect"
        v-model="draft.empty"
        :teleported="false"
        clearable
        placeholder="全部值"
        :aria-label="`${label}空值条件`"
      >
        <ElOption label="仅空值" value="empty" />
        <ElOption label="仅非空值" value="not-empty" />
      </ElSelect>
      <template v-if="draft.empty !== 'empty'">
        <ElInput
          v-if="type === 'text'"
          ref="primaryInput"
          v-model="draft.text"
          clearable
          placeholder="输入关键字，不区分大小写"
          :aria-label="`${label}搜索关键字`"
          @keyup.enter="apply"
        />
        <template v-else-if="type === 'select'">
          <ElInput
            ref="primaryInput"
            v-model="optionSearch"
            clearable
            placeholder="搜索选项"
            :aria-label="`${label}选项搜索`"
          />
          <ElCheckbox
            :model-value="allChecked"
            :indeterminate="partChecked"
            :disabled="visibleOptions.length === 0"
            @change="toggleAll"
            >全选当前选项</ElCheckbox
          >
          <ElScrollbar
            v-if="visibleOptions.length"
            class="art-table-column-filter__options"
            max-height="192px"
          >
            <ElCheckboxGroup v-model="draft.values" :aria-label="`${label}过滤选项`">
              <ElCheckbox
                v-for="option in visibleOptions"
                :key="option.value"
                :value="option.value"
                class="art-table-column-filter__option"
              >
                <span class="block truncate" :title="option.label">
                  <ArtDictDisplay
                    v-if="dictCode && option.value !== 'empty'"
                    :dict-code="dictCode"
                    :value="String(option.raw)"
                    display="text"
                  />
                  <template v-else>{{ option.label }}</template>
                </span>
              </ElCheckbox>
            </ElCheckboxGroup>
          </ElScrollbar>
          <p
            class="text-xs text-g-600"
            :class="{ 'sr-only': visibleOptions.length > 0 }"
            role="status"
          >
            {{ visibleOptions.length ? '' : '暂无匹配选项' }}
          </p>
        </template>
        <template v-else-if="type === 'number-range'">
          <ElInputNumber
            v-model="numberStart"
            controls-position="right"
            placeholder="最小值（含）"
            class="w-full!"
            :aria-label="`${label}最小值`"
          />
          <ElInputNumber
            v-model="numberEnd"
            controls-position="right"
            placeholder="最大值（含）"
            class="w-full!"
            :aria-label="`${label}最大值`"
          />
        </template>
        <template v-else>
          <ElDatePicker
            v-model="dateStart"
            :teleported="false"
            :type="type === 'date-range' ? 'date' : 'datetime'"
            :value-format="dateFormat"
            :format="dateFormat"
            placeholder="开始时间（可选）"
            class="w-full!"
            :aria-label="`${label}开始时间`"
          />
          <ElDatePicker
            v-model="dateEnd"
            :teleported="false"
            :type="type === 'date-range' ? 'date' : 'datetime'"
            :value-format="dateFormat"
            :format="dateFormat"
            placeholder="结束时间（可选）"
            class="w-full!"
            :aria-label="`${label}结束时间`"
          />
        </template>
      </template>
      <p v-if="invalidRange" class="text-xs text-[var(--el-color-danger)]" role="alert"
        >起始值不能大于结束值</p
      >
      <p class="text-xs leading-5 text-g-600">仅过滤当前页，不改变分页总数和导出范围。</p>
      <div
        class="flex items-center justify-between gap-2 border-t border-[var(--el-border-color-lighter)] pt-3"
      >
        <ElButton text @click="clear">清空</ElButton>
        <ElButton type="primary" :disabled="invalidRange" @click="apply">应用过滤</ElButton>
      </div>
    </div>
  </ElPopover>
</template>

<script setup lang="ts">
  import { computed, reactive, ref, useTemplateRef } from 'vue'
  import dayjs from 'dayjs'
  import { cloneDeep, uniq } from 'lodash-es'
  import { normalizeNullableNumber } from '@/utils/form/normalize'
  import { useUserStore } from '@/store/modules/user'
  import { getDictionaryDisplayLabel } from '@/utils/form/option'
  import {
    ElButton,
    ElCheckbox,
    ElCheckboxGroup,
    ElDatePicker,
    ElInput,
    ElInputNumber,
    ElOption,
    ElPopover,
    ElScrollbar,
    ElSelect,
    type InputInstance,
    type SelectInstance
  } from 'element-plus'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import { isColumnFilterActive, type ColumnFilterCondition } from '@/utils/table/column-filters'
  import type { TableColumnFilterType } from '@/types/table-column-config'

  const props = defineProps<{
    label: string
    type: TableColumnFilterType
    modelValue?: ColumnFilterCondition
    options: Array<{ value: string; label: string; raw: unknown }>
    dictCode?: string
  }>()
  const emit = defineEmits<{ 'update:modelValue': [value: ColumnFilterCondition] }>()
  const open = ref(false)
  const triggerButton = useTemplateRef<InstanceType<typeof ArtIconButton>>('triggerButton')
  const primaryInput = useTemplateRef<InputInstance>('primaryInput')
  const emptySelect = useTemplateRef<SelectInstance>('emptySelect')
  const optionSearch = ref('')
  const draft = reactive<ColumnFilterCondition>({ values: [] })
  const active = computed(() => isColumnFilterActive(props.modelValue))
  const userStore = useUserStore()
  const visibleOptions = computed(() => {
    const query = optionSearch.value.trim().toLocaleLowerCase()
    const options = props.options.map((option) => {
      const item = props.dictCode
        ? userStore.getDictDisplayItemByValue(props.dictCode, String(option.raw))
        : undefined
      return props.dictCode && option.value !== 'empty'
        ? { ...option, label: getDictionaryDisplayLabel(item, option.raw) }
        : option
    })
    return query
      ? options.filter(({ label }) => label.toLocaleLowerCase().includes(query))
      : options
  })
  const allChecked = computed(
    () =>
      visibleOptions.value.length > 0 &&
      visibleOptions.value.every((option) => draft.values?.includes(option.value))
  )
  const partChecked = computed(
    () =>
      !allChecked.value &&
      visibleOptions.value.some((option) => draft.values?.includes(option.value))
  )
  const dateFormat = computed(() =>
    props.type === 'date-range' ? 'YYYY-MM-DD' : 'YYYY-MM-DD HH:mm:ss'
  )
  const numberStart = computed({
    get: () => (typeof draft.start === 'number' ? draft.start : undefined),
    set: (value: number | undefined) => {
      draft.start = normalizeNullableNumber(value) ?? undefined
    }
  })
  const numberEnd = computed({
    get: () => (typeof draft.end === 'number' ? draft.end : undefined),
    set: (value: number | undefined) => {
      draft.end = normalizeNullableNumber(value) ?? undefined
    }
  })
  const dateStart = computed({
    get: () => (typeof draft.start === 'string' ? draft.start : ''),
    set: (value: string | null) => {
      draft.start = value || undefined
    }
  })
  const dateEnd = computed({
    get: () => (typeof draft.end === 'string' ? draft.end : ''),
    set: (value: string | null) => {
      draft.end = value || undefined
    }
  })
  const invalidRange = computed(() => {
    if (draft.empty === 'empty' || draft.start === undefined || draft.end === undefined)
      return false
    return props.type === 'number-range'
      ? Number(draft.start) > Number(draft.end)
      : dayjs(draft.start).valueOf() > dayjs(draft.end).valueOf()
  })
  function resetDraft(): void {
    Object.assign(
      draft,
      { text: undefined, start: undefined, end: undefined, empty: undefined, values: [] },
      cloneDeep(props.modelValue ?? {})
    )
    optionSearch.value = ''
  }
  function toggleAll(): void {
    const visible = new Set(visibleOptions.value.map((option) => option.value))
    draft.values = allChecked.value
      ? (draft.values ?? []).filter((value) => !visible.has(value))
      : uniq([...(draft.values ?? []), ...visible])
  }
  function focusFilterInput(): void {
    const trigger: unknown = triggerButton.value?.$el
    if (
      open.value &&
      trigger instanceof HTMLButtonElement &&
      trigger.ownerDocument.activeElement === trigger &&
      trigger.matches(':focus-visible')
    ) {
      const control = primaryInput.value ?? emptySelect.value
      control?.focus()
    }
  }
  function stopHeaderClick(event: MouseEvent): void {
    event.stopPropagation()
  }
  function clear(): void {
    emit('update:modelValue', {})
    open.value = false
  }
  function apply(): void {
    if (invalidRange.value) return
    emit('update:modelValue', cloneDeep(draft))
    open.value = false
  }
</script>

<style scoped lang="scss">
  .art-table-column-filter {
    &__options {
      min-width: 0;
    }

    &__option {
      display: flex;
      width: 100%;
      min-width: 0;
      margin-inline-end: 0;

      :deep(.el-checkbox__input) {
        flex: none;
      }

      :deep(.el-checkbox__label) {
        min-width: 0;
      }
    }
  }
</style>
