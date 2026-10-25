<template>
  <div
    class="setting-item-row flex-cb"
    :class="{ 'mobile-hide': config.mobileHide, 'is-disabled': config.disabled }"
  >
    <span class="text-sm">{{ config.label }}</span>

    <!-- 开关类型 -->
    <ElSwitch
      v-if="config.type === 'switch'"
      :aria-label="config.label"
      :model-value="switchValue"
      :disabled="config.disabled"
      @change="handleChange"
    />

    <!-- 数字输入类型 -->
    <ElInputNumber
      v-else-if="config.type === 'input-number'"
      :aria-label="config.label"
      :model-value="inputNumberValue"
      :min="config.min"
      :max="config.max"
      :step="config.step"
      :style="config.style"
      :disabled="config.disabled"
      :controls-position="config.controlsPosition"
      @change="handleChange"
    />

    <!-- 选择器类型 -->
    <ElSelect
      v-else-if="config.type === 'select'"
      :aria-label="config.label"
      :model-value="selectValue"
      :style="config.style"
      :disabled="config.disabled"
      @change="handleChange"
    >
      <ElOption
        v-for="option in normalizedOptions"
        :key="String(option.value)"
        :label="option.label"
        :value="option.value"
      />
      <template #empty>
        <ArtPickerEmpty title="暂无可选设置" />
      </template>
    </ElSelect>
  </div>
</template>

<script setup lang="ts">
  import type { ComputedRef } from 'vue'
  import ArtPickerEmpty from '@/components/core/feedback/art-picker-empty/index.vue'

  type SettingValue = string | number | boolean | null | undefined
  type SettingOptionValue = string | number | boolean

  interface SettingOption {
    value: SettingOptionValue
    label: string
  }

  interface SettingItemConfig {
    key: string
    label: string
    type: 'switch' | 'input-number' | 'select'
    handler: string
    mobileHide?: boolean
    disabled?: boolean
    min?: number
    max?: number
    step?: number
    style?: Record<string, string>
    controlsPosition?: '' | 'right'
    options?: SettingOption[] | ComputedRef<SettingOption[]>
  }

  interface Props {
    config: SettingItemConfig
    modelValue: SettingValue
  }

  interface Emits {
    (e: 'change', value: SettingValue): void
  }

  const props = defineProps<Props>()
  const emit = defineEmits<Emits>()

  const switchValue = computed(() => Boolean(props.modelValue))
  const inputNumberValue = computed(() =>
    typeof props.modelValue === 'number' ? props.modelValue : undefined
  )
  const selectValue = computed<SettingOptionValue>(() =>
    props.modelValue === null || props.modelValue === undefined ? '' : props.modelValue
  )

  const normalizedOptions = computed(() => unref(props.config.options) ?? [])

  const handleChange = (value: SettingValue): void => {
    emit('change', value)
  }
</script>
