<template>
  <div class="art-status-segmented art-card-xs">
    <ElSegmented
      class="art-status-segmented__control"
      :model-value="modelValue"
      :options="options"
      :aria-label="ariaLabel"
      block
      @update:model-value="emit('update:modelValue', $event)"
    >
      <template #default="{ item }">
        <span class="art-status-segmented__option">
          <ArtSvgIcon v-if="item.icon" :icon="item.icon" />
          <span class="art-status-segmented__label">{{ item.label }}</span>
          <strong class="art-status-segmented__count">{{ item.count }}</strong>
        </span>
      </template>
    </ElSegmented>
  </div>
</template>

<script setup lang="ts">
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'

  export type ArtStatusSegmentedValue = string | number | boolean

  export interface ArtStatusSegmentedOption {
    label: string
    value: ArtStatusSegmentedValue
    count: number
    icon?: string
  }

  withDefaults(
    defineProps<{
      modelValue: ArtStatusSegmentedValue
      options: ArtStatusSegmentedOption[]
      ariaLabel?: string
    }>(),
    { ariaLabel: '状态快捷筛选' }
  )

  const emit = defineEmits<{
    'update:modelValue': [value: ArtStatusSegmentedValue]
  }>()
</script>

<style scoped lang="scss">
  .art-status-segmented {
    min-width: 0;
    padding: 7px;

    &__control {
      width: 100%;

      :deep(.el-segmented__item-label) {
        min-width: 0;
        padding-inline: 12px;
      }

      :deep(.el-segmented__item.is-selected) .art-status-segmented__count {
        color: var(--theme-color);
        background: var(--el-color-white);
        box-shadow: 0 0 0 1px color-mix(in srgb, var(--el-color-white) 55%, transparent);
      }
    }

    &__option {
      display: flex;
      gap: var(--art-control-icon-gap);
      align-items: center;
      justify-content: center;
      min-width: 0;
      min-height: 30px;
      white-space: nowrap;

      .art-svg-icon {
        flex: 0 0 auto;
        font-size: 16px;
      }
    }

    &__label {
      overflow: hidden;
      text-overflow: ellipsis;
    }

    &__count {
      display: inline-grid;
      place-items: center;
      min-width: 22px;
      height: 22px;
      padding: 0 6px;
      font-size: 11px;
      font-variant-numeric: tabular-nums;
      line-height: 1;
      color: var(--el-text-color-secondary);
      background: color-mix(in srgb, var(--el-fill-color-darker) 70%, transparent);
      border-radius: 999px;
    }

    @media (width <= 900px) {
      &__control :deep(.el-segmented__item-label) {
        padding-inline: 6px;
      }

      &__option .art-svg-icon {
        display: none;
      }
    }
  }
</style>
