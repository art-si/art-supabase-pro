<template>
  <ElPopover
    v-model:visible="open"
    trigger="click"
    :width="300"
    placement="bottom-start"
    @show="resetDraft"
  >
    <template #reference>
      <ArtIconButton
        size="small"
        icon="ri:filter-3-line"
        :label="`${label}过滤`"
        :class="{ 'text-[var(--el-color-primary)]!': active }"
        :aria-pressed="active"
        @click="stopHeaderClick"
      />
    </template>
    <div class="flex flex-col gap-3" @click.stop @keydown.stop @keydown.esc="open = false">
      <div class="flex items-center justify-between gap-2">
        <strong class="truncate text-sm text-g-900">{{ label }}</strong>
        <span class="shrink-0 text-xs text-g-600">当前页过滤</span>
      </div>
      <ElSelect
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
          v-model="draft.text"
          clearable
          placeholder="输入关键字，不区分大小写"
          :aria-label="`${label}搜索关键字`"
          @keyup.enter="apply"
        />
        <template v-else-if="type === 'select'">
          <ElInput
            v-model="optionSearch"
            clearable
            placeholder="搜索选项"
            :aria-label="`${label}选项搜索`"
          />
          <ElCheckbox :model-value="allChecked" :indeterminate="partChecked" @change="toggleAll"
            >全选当前选项</ElCheckbox
          >
          <ElCheckboxGroup
            v-model="draft.values"
            class="max-h-48 overflow-y-auto"
            :aria-label="`${label}过滤选项`"
          >
            <div v-for="option in visibleOptions" :key="option.value" class="min-w-0">
              <ElCheckbox :value="option.value" class="max-w-full">
                <ArtDictDisplay
                  v-if="dictCode && option.value !== 'empty'"
                  :dict-code="dictCode"
                  :value="String(option.raw)"
                  display="text"
                />
                <span
                  v-else
                  class="inline-block max-w-52 truncate align-middle"
                  :title="option.label"
                  >{{ option.label }}</span
                >
              </ElCheckbox>
            </div>
          </ElCheckboxGroup>
          <p v-if="!visibleOptions.length" class="text-xs text-g-600">暂无匹配选项</p>
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
  import { computed, reactive, ref } from 'vue'
  import dayjs from 'dayjs'
  import { cloneDeep, uniq } from 'lodash-es'
  import { normalizeNullableNumber } from '@/utils/form/normalize'
  import { useUserStore } from '@/store/modules/user'
  import { toDictionaryOption } from '@/utils/form/option'
  import {
    ElButton,
    ElCheckbox,
    ElCheckboxGroup,
    ElDatePicker,
    ElInput,
    ElInputNumber,
    ElOption,
    ElPopover,
    ElSelect
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
  const optionSearch = ref('')
  const draft = reactive<ColumnFilterCondition>({ values: [] })
  const active = computed(() => isColumnFilterActive(props.modelValue))
  const userStore = useUserStore()
  const visibleOptions = computed(() =>
    props.options
      .map((option) => {
        const item = props.dictCode
          ? userStore.getDictDisplayItemByValue(props.dictCode, String(option.raw))
          : undefined
        return item ? { ...option, label: toDictionaryOption(item).label || option.label } : option
      })
      .filter((option) =>
        option.label.toLocaleLowerCase().includes(optionSearch.value.trim().toLocaleLowerCase())
      )
  )
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
