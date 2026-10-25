<template>
  <header class="setting-header">
    <div class="setting-header__identity">
      <span class="setting-header__mark">
        <ArtSvgIcon icon="ri:palette-line" />
      </span>
      <div>
        <span>APPEARANCE STUDIO</span>
        <h2>界面工作室</h2>
        <p>让工作台更鲜明、更高效，也更像你的产品。</p>
      </div>
    </div>
    <ArtIconButton
      class="setting-header__close"
      icon="ri:close-line"
      label="关闭界面设置"
      @click="$emit('close')"
    />
  </header>
</template>

<script setup lang="ts">
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'

  defineEmits<{
    close: []
  }>()
</script>
