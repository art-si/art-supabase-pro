<template>
  <ArtOverlayLoading
    v-if="loading"
    class="art-picker-empty"
    loading
    size="compact"
    :min-height="112"
    :text="loadingText"
    description="正在获取最新选项，请稍候"
  />
  <ArtEmptyState
    v-else
    class="art-picker-empty"
    :title="title"
    :description="description"
    :visual-size="80"
    size="compact"
  />
</template>

<script setup lang="ts">
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtOverlayLoading from '@/components/core/feedback/art-overlay-loading/index.vue'

  defineOptions({ name: 'ArtPickerEmpty' })

  withDefaults(
    defineProps<{
      title?: string
      description?: string
      loading?: boolean
      loadingText?: string
    }>(),
    { title: '暂无可选数据', description: '', loading: false, loadingText: '正在加载选项…' }
  )
</script>

<style scoped>
  .art-picker-empty {
    box-sizing: border-box;
    min-width: min(240px, calc(100vw - 32px));
    overflow-wrap: anywhere;
    white-space: normal;
  }

  .art-picker-empty :deep(.art-empty-state__copy strong) {
    word-break: break-all;
  }

  :global(.el-cascader-menu:has(.art-picker-empty)) {
    min-width: min(240px, calc(100vw - 32px));
  }

  :global(.el-cascader-menu__empty-text:has(.art-picker-empty)) {
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
  }
</style>
