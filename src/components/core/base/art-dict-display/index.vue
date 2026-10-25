<template>
  <ElTag
    v-if="resolvedMode === 'tag'"
    :type="tagType"
    effect="light"
    size="small"
    round
    class="art-dict-display__tag"
  >
    {{ label }}
  </ElTag>

  <ElBadge
    v-else-if="resolvedMode === 'badge'"
    is-dot
    :color="badgeColor"
    class="art-dict-display__badge"
  >
    <span class="art-dict-display__label" :style="{ color: badgeColor }">{{ label }}</span>
  </ElBadge>

  <span v-else>{{ label }}</span>
</template>

<script setup lang="ts">
  import { ElBadge, ElTag } from 'element-plus'
  import { useUserStore } from '@/store/modules/user'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import type { DictDisplayMode } from '@/types/component'
  import { toDictionaryOption } from '@/utils/form/option'

  defineOptions({ name: 'ArtDictDisplay' })

  interface Props {
    dictCode?: string
    value?: string | number | null
    item?: Api.DataCenter.DictListItem
    display?: DictDisplayMode
    emptyText?: string
    unknownText?: string
  }

  const props = withDefaults(defineProps<Props>(), {
    dictCode: '',
    value: undefined,
    item: undefined,
    display: 'auto',
    emptyText: '--'
  })

  const userStore = useUserStore()
  watch(
    () => [props.dictCode, props.value, props.item] as const,
    ([dictCode, value, item]) => {
      if (dictCode && !item)
        void userStore
          .ensureDictDisplayItemLoaded(dictCode, value)
          .catch((error: unknown) =>
            notifyFriendlyError(error, '字典资料加载失败，请刷新页面后重试')
          )
    },
    { immediate: true }
  )

  const dictItem = computed<Api.DataCenter.DictListItem | undefined>(
    () => props.item ?? userStore.getDictDisplayItemByValue(props.dictCode, props.value)
  )
  const label = computed(() => {
    if (dictItem.value) {
      const optionLabel = toDictionaryOption(dictItem.value).label
      if (optionLabel) return optionLabel
    }
    if (props.value === undefined || props.value === null || props.value === '') {
      return props.emptyText
    }
    return props.unknownText ?? String(props.value)
  })
  const tagType = computed<Api.Common.TagPreset | undefined>(() => {
    const type = dictItem.value?.tagType
    return type ? (type as Api.Common.TagPreset) : undefined
  })
  const badgeColor = computed(() => {
    if (dictItem.value?.color) return dictItem.value.color

    const tagColorMap: Record<Api.Common.TagPreset, string> = {
      primary: 'var(--el-color-primary)',
      success: 'var(--el-color-success)',
      warning: 'var(--el-color-warning)',
      danger: 'var(--el-color-danger)',
      info: 'var(--el-color-info)'
    }
    return tagType.value ? tagColorMap[tagType.value] : 'var(--el-color-primary)'
  })
  const resolvedMode = computed<Exclude<DictDisplayMode, 'auto'>>(() => {
    if (props.display !== 'auto') return props.display
    if (tagType.value) return 'tag'
    if (dictItem.value?.color) return 'badge'
    return 'text'
  })
</script>

<style scoped lang="scss">
  .art-dict-display {
    &__tag {
      max-width: 100%;
      vertical-align: middle;

      :deep(.el-tag__content) {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }

    &__badge {
      display: inline-flex;
      flex-direction: row-reverse;
      gap: 6px;
      align-items: center;
      max-width: 100%;

      :deep(.el-badge__content.is-fixed.is-dot) {
        position: static;
        flex: 0 0 auto;
        transform: none;
      }
    }

    &__label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
</style>
