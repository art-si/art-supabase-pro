<!-- 图标组件 -->
<template>
  <Icon v-if="icon" :icon="icon" v-bind="attrs" class="art-svg-icon inline" />
</template>

<script setup lang="ts">
  import { Icon } from '@iconify/vue'
  import '@/plugins/icons'

  defineOptions({ name: 'ArtSvgIcon', inheritAttrs: false })

  interface Props {
    /** Iconify icon name */
    icon?: string
  }

  defineProps<Props>()

  const attrs = useAttrs()
</script>

<style scoped>
  .art-svg-icon {
    flex: none;
    vertical-align: -0.125em;
  }
</style>
