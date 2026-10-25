<template>
  <div class="resource-manager art-full-height business-workspace-page">
    <BusinessWorkspaceHeader
      eyebrow="DIGITAL ASSET LIBRARY"
      title="附件管理"
      description="统一管理业务图片、文档与媒体资源，并支持分类检索和安全预览。"
      icon="ri:attachment-2"
    />
    <section class="resource-manager__content business-workspace-content art-card-xs">
      <ArtResourcePanel
        v-model="model"
        :show-action="false"
        show-copy-actions
        show-paste-upload
        show-rename-action
      />
    </section>
  </div>
</template>

<script setup lang="ts">
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import ArtResourcePanel from '@/components/core/forms/art-resource-picker/panel.vue'
  const model = ref<string | string[]>()
</script>

<style scoped lang="scss">
  .resource-manager {
    &__content {
      min-height: 0;
      padding: 16px;
    }
  }
</style>
