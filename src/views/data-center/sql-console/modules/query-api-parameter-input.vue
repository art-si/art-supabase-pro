<template>
  <div class="flex w-full min-w-0 items-center gap-1">
    <div class="min-w-0 flex-1">
      <ElSelect
        v-if="parameter.type === 'boolean'"
        ref="input"
        class="w-full!"
        filterable
        :model-value="booleanValue"
        :placeholder="placeholder"
        :aria-label="`API 参数 ${parameter.name}`"
        :disabled="disabled"
        :clearable="!parameter.required"
        :validate-event="false"
        @update:model-value="updateBoolean"
      >
        <ElOption label="true" :value="true" />
        <ElOption label="false" :value="false" />
      </ElSelect>
      <ElDatePicker
        v-else-if="parameter.type === 'date'"
        ref="input"
        class="w-full! min-w-0!"
        type="date"
        value-format="YYYY-MM-DD"
        :model-value="textValue"
        :placeholder="placeholder"
        :aria-label="`API 参数 ${parameter.name}`"
        :disabled="disabled"
        :clearable="!parameter.required"
        :validate-event="false"
        @update:model-value="updateText"
      />
      <ElInput
        v-else
        ref="input"
        :model-value="textValue"
        :placeholder="placeholder"
        :aria-label="`API 参数 ${parameter.name}`"
        :disabled="disabled"
        :clearable="!parameter.required"
        :validate-event="false"
        @update:model-value="updateText"
      />
    </div>
    <ElDropdown
      ref="modeMenu"
      trigger="click"
      placement="bottom-end"
      :disabled="disabled"
      @command="selectMode"
    >
      <ArtIconButton
        size="small"
        icon="ri:equalizer-line"
        :label="`参数 ${parameter.name} 的值方式`"
        :title="`当前：${modeLabel}；选择未提供、NULL 或输入值`"
        :disabled="disabled"
      />
      <template #dropdown>
        <ElDropdownMenu>
          <ElDropdownItem command="omit" :aria-current="modelValue.kind === 'omit' || undefined">
            未提供
          </ElDropdownItem>
          <ElDropdownItem
            command="null"
            :disabled="parameter.required"
            :title="parameter.required ? '必填参数不能为 NULL' : '显式发送 NULL'"
            :aria-current="modelValue.kind === 'null' || undefined"
          >
            NULL
          </ElDropdownItem>
          <ElDropdownItem command="value" :aria-current="hasInputValue || undefined">
            输入值
          </ElDropdownItem>
          <ElDropdownItem
            v-if="parameter.type === 'string'"
            command="empty"
            :aria-current="isEmptyString || undefined"
          >
            空字符串
          </ElDropdownItem>
        </ElDropdownMenu>
      </template>
    </ElDropdown>
  </div>
</template>

<script setup lang="ts">
  import {
    computed,
    nextTick,
    onActivated,
    onBeforeUnmount,
    onDeactivated,
    ref,
    toRaw,
    watch
  } from 'vue'
  import {
    ElDatePicker,
    ElDropdown,
    ElDropdownItem,
    ElDropdownMenu,
    ElInput,
    ElOption,
    ElSelect,
    useFormItem,
    type DropdownInstance
  } from 'element-plus'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import type { SqlQueryApiParameter, SqlQueryApiParameterDraft } from '@/types/sql-query-api'

  defineOptions({ name: 'SqlQueryApiParameterInput', inheritAttrs: false })
  const props = withDefaults(
    defineProps<{
      modelValue?: SqlQueryApiParameterDraft
      parameter: SqlQueryApiParameter
      disabled?: boolean
    }>(),
    { modelValue: () => ({ kind: 'omit' }), disabled: false }
  )
  const emit = defineEmits<{
    'update:modelValue': [value: SqlQueryApiParameterDraft]
  }>()
  const { formItem } = useFormItem()
  const input = ref<{ focus: () => void }>()
  const modeMenu = ref<DropdownInstance>()
  const textValue = computed(() =>
    props.modelValue.kind === 'value' && typeof props.modelValue.value === 'string'
      ? props.modelValue.value
      : ''
  )
  const booleanValue = computed(() =>
    props.modelValue.kind === 'value' && typeof props.modelValue.value === 'boolean'
      ? props.modelValue.value
      : undefined
  )
  const isEmptyString = computed(
    () =>
      props.parameter.type === 'string' &&
      props.modelValue.kind === 'value' &&
      props.modelValue.value === ''
  )
  const hasInputValue = computed(() => props.modelValue.kind === 'value' && !isEmptyString.value)
  const modeLabel = computed(() =>
    props.modelValue.kind === 'omit'
      ? '未提供'
      : props.modelValue.kind === 'null'
        ? 'NULL'
        : isEmptyString.value
          ? '空字符串 ""'
          : '输入值'
  )
  const placeholder = computed(() => {
    if (props.modelValue.kind !== 'value' || isEmptyString.value) return modeLabel.value
    if (props.parameter.type === 'number') return '保留十进制文本，不自动舍入'
    if (props.parameter.type === 'uuid') return '输入 UUID'
    if (props.parameter.type === 'date') return 'YYYY-MM-DD'
    return `输入 ${props.parameter.name}`
  })
  let revision = 0
  let alive = true
  let active = true
  const invalidate = (): void => {
    revision++
    modeMenu.value?.handleClose()
  }
  const commit = async (draft: SqlQueryApiParameterDraft, focus = false): Promise<void> => {
    if (!alive || !active || props.disabled) return
    const current = ++revision
    const parameter = props.parameter
    const value = toRaw(draft)
    emit('update:modelValue', value)
    await nextTick()
    if (
      !alive ||
      !active ||
      props.disabled ||
      current !== revision ||
      parameter !== props.parameter ||
      toRaw(props.modelValue) !== value
    )
      return
    if (focus) input.value?.focus()
    // ElFormItem owns displaying validation failures; the callback keeps them in that boundary.
    void formItem?.validate('change', () => undefined)
  }
  const updateText = (value: unknown): void => {
    void commit(
      typeof value === 'string' && value !== '' ? { kind: 'value', value } : { kind: 'omit' }
    )
  }
  const updateBoolean = (value: unknown): void => {
    void commit(typeof value === 'boolean' ? { kind: 'value', value } : { kind: 'omit' })
  }
  const selectMode = (mode: unknown): void => {
    if (mode === 'omit') void commit({ kind: 'omit' })
    else if (mode === 'null' && !props.parameter.required) void commit({ kind: 'null' })
    else if (mode === 'empty' && props.parameter.type === 'string')
      void commit({ kind: 'value', value: '' }, true)
    else if (mode === 'value')
      void commit(
        props.modelValue.kind === 'value'
          ? props.modelValue
          : { kind: 'value', value: props.parameter.type === 'boolean' ? false : '' },
        true
      )
  }
  watch(
    () => props.modelValue,
    () => modeMenu.value?.handleClose(),
    { flush: 'sync' }
  )
  watch(
    [
      () => props.parameter,
      () => props.parameter.name,
      () => props.parameter.type,
      () => props.parameter.required,
      () => props.disabled
    ],
    invalidate,
    { flush: 'sync' }
  )
  onActivated(() => {
    active = true
  })
  onDeactivated(() => {
    active = false
    invalidate()
  })
  onBeforeUnmount(() => {
    alive = false
    invalidate()
  })
</script>
