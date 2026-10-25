<template>
  <div class="setting-section-title" :style="style">
    <span></span>
    <p>{{ title }}</p>
  </div>
</template>

<script setup lang="ts">
  import type { CSSProperties } from 'vue'

  interface Props {
    title: string
    style?: CSSProperties
  }

  defineProps<Props>()
</script>
