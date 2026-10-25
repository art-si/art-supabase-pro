<template>
  <main
    class="art-page-shell"
    :class="{
      'art-page-shell--full-height': fullHeight,
      'art-page-shell--constrained': constrained
    }"
  >
    <ArtAsyncState
      :loading="loading"
      :loading-mode="loadingMode"
      :skeleton-rows="skeletonRows"
      :error="error"
      :retryable="retryable"
      :empty="empty"
      :empty-text="emptyText"
      :empty-description="emptyDescription"
      :full-height="fullHeight"
      :min-height="minHeight"
      @retry="emit('retry')"
    >
      <slot />

      <template #empty-action>
        <slot name="empty-action" />
      </template>

      <template #error-action>
        <slot name="error-action" />
      </template>
    </ArtAsyncState>
  </main>
</template>

<script setup lang="ts">
  defineOptions({ name: 'ArtPageShell' })

  withDefaults(
    defineProps<{
      loading?: boolean
      loadingMode?: 'mask' | 'skeleton'
      skeletonRows?: number
      error?: string | Error | null
      retryable?: boolean
      empty?: boolean
      emptyText?: string
      emptyDescription?: string
      fullHeight?: boolean
      constrained?: boolean
      minHeight?: string | number
    }>(),
    {
      loading: false,
      loadingMode: 'mask',
      skeletonRows: 6,
      error: null,
      retryable: true,
      empty: false,
      emptyText: '暂无数据',
      emptyDescription: '请调整筛选条件或刷新页面后重试。',
      fullHeight: false,
      constrained: false,
      minHeight: 240
    }
  )

  const emit = defineEmits<{ retry: [] }>()
</script>

<style scoped lang="scss">
  .art-page-shell {
    width: 100%;
    min-width: 0;

    &--full-height {
      height: var(--art-full-height);
      min-height: 0;
    }

    &--constrained {
      max-width: 1440px;
      margin-inline: auto;
    }

    :deep(> .art-async-state > *) {
      min-width: 0;
    }

    @media (width <= 640px) {
      &--full-height {
        height: auto;
      }
    }
  }
</style>
