<template>
  <ElSelect
    v-bind="$attrs"
    class="art-user-select"
    :model-value="modelValue"
    :multiple="multiple"
    :loading="loading"
    :placeholder="placeholder"
    :clearable="clearable"
    :filterable="filterable"
    :collapse-tags="collapseTags"
    :collapse-tags-tooltip="collapseTagsTooltip"
    :max-collapse-tags="maxCollapseTags"
    :no-data-text="noDataText"
    :no-match-text="noMatchText"
    :popper-class="mergedPopperClass"
    :filter-method="handleFilter"
    @update:model-value="handleUpdate"
    @change="handleChange"
  >
    <ElOption
      v-for="option in filteredOptions"
      :key="option.value"
      :label="option.label"
      :value="option.value"
      :disabled="option.disabled"
    >
      <div class="art-user-select__option">
        <ElAvatar
          class="art-user-select__avatar"
          :size="34"
          :src="option.avatar || undefined"
          :style="getAvatarStyle(option)"
          fit="cover"
        >
          {{ getInitial(option) }}
        </ElAvatar>
        <span class="art-user-select__identity">
          <strong>{{ getDisplayName(option) }}</strong>
          <small v-if="getSecondaryIdentity(option)">{{ getSecondaryIdentity(option) }}</small>
        </span>
      </div>
    </ElOption>
    <template #empty>
      <ArtPickerEmpty :title="searchKeyword ? noMatchText : noDataText" />
    </template>
  </ElSelect>
</template>

<script setup lang="ts">
  import { computed, ref, type CSSProperties } from 'vue'
  import ArtPickerEmpty from '@/components/core/feedback/art-picker-empty/index.vue'
  import type { ArtUserSelectOption, ArtUserSelectValue } from './types'

  defineOptions({ name: 'ArtUserSelect', inheritAttrs: false })

  const props = withDefaults(
    defineProps<{
      modelValue?: ArtUserSelectValue
      options?: ArtUserSelectOption[]
      multiple?: boolean
      loading?: boolean
      placeholder?: string
      clearable?: boolean
      filterable?: boolean
      collapseTags?: boolean
      collapseTagsTooltip?: boolean
      maxCollapseTags?: number
      noDataText?: string
      noMatchText?: string
      popperClass?: string
      filterMethod?: (query: string) => void
    }>(),
    {
      modelValue: undefined,
      options: () => [],
      multiple: false,
      loading: false,
      placeholder: '请选择用户',
      clearable: true,
      filterable: true,
      collapseTags: true,
      collapseTagsTooltip: true,
      maxCollapseTags: 2,
      noDataText: '暂无可选用户',
      noMatchText: '未找到匹配用户',
      popperClass: ''
    }
  )

  const emit = defineEmits<{
    (event: 'update:modelValue', value: ArtUserSelectValue): void
    (event: 'change', value: ArtUserSelectValue): void
  }>()

  const avatarPalette = [
    ['#4f46e5', '#eef2ff'],
    ['#0284c7', '#e0f2fe'],
    ['#059669', '#d1fae5'],
    ['#d97706', '#fef3c7'],
    ['#db2777', '#fce7f3']
  ] as const

  const mergedPopperClass = computed(() =>
    ['art-user-select-popper', props.popperClass].filter(Boolean).join(' ')
  )
  const searchKeyword = ref('')
  const filteredOptions = computed(() => {
    const keyword = normalizeSearchText(searchKeyword.value)
    if (!keyword) return props.options

    return props.options.filter((option) =>
      [
        option.nickName,
        option.userEmail,
        option.userName,
        option.label,
        option.departmentName,
        option.secondaryText
      ].some((value) => normalizeSearchText(value).includes(keyword))
    )
  })

  function normalizeSearchText(value: string | null | undefined): string {
    return normalizeIdentityText(value).toLocaleLowerCase()
  }

  function normalizeIdentityText(value: string | null | undefined): string {
    const text = String(value ?? '').trim()
    return /^(null|undefined)$/i.test(text) ? '' : text
  }

  function getDisplayName(option: ArtUserSelectOption): string {
    return (
      normalizeIdentityText(option.nickName) ||
      normalizeIdentityText(option.userName) ||
      normalizeIdentityText(option.label) ||
      normalizeIdentityText(option.userEmail) ||
      '未命名用户'
    )
  }

  function getSecondaryIdentity(option: ArtUserSelectOption): string {
    const secondaryText = normalizeIdentityText(option.secondaryText)
    if (secondaryText) return secondaryText
    const email = normalizeIdentityText(option.userEmail)
    const departmentName = normalizeIdentityText(option.departmentName)
    const identities = [departmentName, email === getDisplayName(option) ? '' : email].filter(
      Boolean
    )
    return identities.join(' · ') || '未设置邮箱'
  }

  function getInitial(option: ArtUserSelectOption): string {
    return Array.from(getDisplayName(option).trim())[0]?.toUpperCase() || 'U'
  }

  function getAvatarStyle(option: ArtUserSelectOption): CSSProperties | undefined {
    if (option.avatar) return undefined
    const seed = Array.from(option.value).reduce((total, char) => total + char.charCodeAt(0), 0)
    const [color, backgroundColor] = avatarPalette[seed % avatarPalette.length]
    return { color, backgroundColor }
  }

  function handleUpdate(value: ArtUserSelectValue): void {
    emit('update:modelValue', value)
  }

  function handleChange(value: ArtUserSelectValue): void {
    emit('change', value)
  }

  function handleFilter(query: string): void {
    searchKeyword.value = query
    props.filterMethod?.(query)
  }
</script>

<style scoped lang="scss">
  .art-user-select {
    width: 100%;
  }

  .art-user-select__option {
    display: flex;
    gap: 10px;
    align-items: center;
    min-width: 0;
    padding: 5px 0;
  }

  .art-user-select__avatar {
    flex: 0 0 auto;
    font-size: 13px;
    font-weight: 700;
    border: 1px solid var(--el-border-color-lighter);
  }

  .art-user-select__identity {
    display: grid;
    min-width: 0;
    line-height: 1.25;

    strong,
    small {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    strong {
      font-size: 13px;
      font-weight: 600;
      color: var(--el-text-color-primary);
    }

    small {
      margin-top: 3px;
      font-size: 12px;
      color: var(--el-text-color-secondary);
    }
  }
</style>

<style lang="scss">
  .art-user-select-popper {
    .el-select-dropdown__item {
      box-sizing: border-box;
      height: 54px !important;
      min-height: 54px;
      padding: 2px 12px;
      line-height: normal !important;
    }

    .el-select-dropdown__item.is-hovering,
    .el-select-dropdown__item.is-selected {
      border-radius: var(--el-border-radius-base);
    }

    .el-select-dropdown__list {
      padding: 6px;
    }
  }
</style>
