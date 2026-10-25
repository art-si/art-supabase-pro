<template>
  <section class="business-mobile-filter-context art-card-xs" :aria-label="label">
    <span class="business-mobile-filter-context__icon" aria-hidden="true">
      <ArtSvgIcon :icon="icon" />
    </span>
    <div class="business-mobile-filter-context__copy">
      <small>{{ label }}</small>
      <strong :title="value">{{ value }}</strong>
    </div>
    <ElButton type="primary" plain @click="emit('action')">
      <ArtSvgIcon :icon="actionIcon" />
      {{ actionLabel }}
    </ElButton>
  </section>
</template>

<script setup lang="ts">
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'

  defineOptions({ name: 'BusinessMobileFilterContext' })

  withDefaults(
    defineProps<{
      icon?: string
      label: string
      value: string
      actionIcon?: string
      actionLabel: string
    }>(),
    {
      icon: 'ri:node-tree',
      actionIcon: 'ri:filter-3-line'
    }
  )

  const emit = defineEmits<{ action: [] }>()
</script>

<style scoped lang="scss">
  .business-mobile-filter-context {
    display: flex;
    flex: none;
    gap: 11px;
    align-items: center;
    min-width: 0;
    padding: 12px 14px;
    margin-bottom: 12px;
    background: linear-gradient(145deg, var(--el-color-primary-light-9), var(--el-bg-color) 76%);

    &__icon {
      display: inline-flex;
      flex: 0 0 36px;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      color: var(--el-color-primary);
      background: var(--el-bg-color);
      border: 1px solid var(--el-color-primary-light-7);
      border-radius: var(--custom-radius);
    }

    &__copy {
      display: grid;
      flex: 1;
      min-width: 0;

      small,
      strong {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      small {
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }

      strong {
        font-size: 14px;
        color: var(--el-text-color-primary);
      }
    }

    .el-button {
      flex: none;
    }

    @media (width <= 640px) {
      .el-button {
        padding-inline: 10px;
      }
    }
  }
</style>
