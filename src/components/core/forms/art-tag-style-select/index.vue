<template>
  <ElSelect
    v-model="modelValue"
    class="art-tag-style-select"
    :clearable="clearable"
    :disabled="disabled"
    :placeholder="placeholder"
  >
    <ElOption
      v-for="option in normalizedOptions"
      :key="option.value"
      :label="option.label"
      :value="option.value"
      :disabled="option.disabled"
    >
      <div class="art-tag-style-select__option">
        <span class="art-tag-style-select__value">{{ option.value }}</span>
        <ElTag :type="option.value" effect="light" size="small" round>
          {{ option.label }}
        </ElTag>
      </div>
    </ElOption>
    <template #empty>
      <ArtPickerEmpty title="暂无可选标签样式" />
    </template>
  </ElSelect>
</template>

<script setup lang="ts">
  import { ElOption, ElSelect, ElTag } from 'element-plus'
  import ArtPickerEmpty from '@/components/core/feedback/art-picker-empty/index.vue'

  defineOptions({ name: 'ArtTagStyleSelect' })

  interface TagStyleOption {
    label?: string
    name?: string
    value?: unknown
    disabled?: boolean
  }

  interface Props {
    options?: TagStyleOption[]
    clearable?: boolean
    disabled?: boolean
    placeholder?: string
  }

  const props = withDefaults(defineProps<Props>(), {
    options: () => [],
    clearable: false,
    disabled: false,
    placeholder: '请选择标签样式'
  })
  const modelValue = defineModel<Api.Common.TagType>({ default: '' })
  const defaultOptions: Array<{ label: string; value: Api.Common.TagPreset }> = [
    { label: '主要', value: 'primary' },
    { label: '成功', value: 'success' },
    { label: '信息', value: 'info' },
    { label: '警告', value: 'warning' },
    { label: '危险', value: 'danger' }
  ]
  const isTagPreset = (value: string): value is Api.Common.TagPreset =>
    value === 'primary' ||
    value === 'success' ||
    value === 'info' ||
    value === 'warning' ||
    value === 'danger'

  const normalizedOptions = computed(() => {
    const source: TagStyleOption[] = props.options.length ? props.options : defaultOptions
    return source.flatMap((option) => {
      const value = String(option.value ?? '')
      if (!isTagPreset(value)) return []
      return [
        {
          label: option.label || option.name || value,
          value,
          disabled: option.disabled
        }
      ]
    })
  })
</script>

<style scoped lang="scss">
  .art-tag-style-select {
    width: 100%;

    &__option {
      display: flex;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      min-width: 0;
    }

    &__value {
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--el-text-color-regular);
      white-space: nowrap;
    }
  }
</style>
