<template>
  <div class="art-chart-loading" :style="{ height }" :aria-busy="loading">
    <slot />
    <ArtOverlayLoading
      v-if="loading"
      loading
      overlay
      text="正在加载图表…"
      description="正在准备最新数据，请稍候"
    />
  </div>
</template>

<script setup lang="ts">
  import ArtOverlayLoading from '@/components/core/feedback/art-overlay-loading/index.vue'

  defineOptions({ name: 'ArtChartLoading' })

  withDefaults(
    defineProps<{
      height?: string
      loading?: boolean
    }>(),
    {
      height: '100%',
      loading: false
    }
  )
</script>

<style scoped lang="scss">
  .art-chart-loading {
    position: relative;
    min-width: 0;
  }
</style>
