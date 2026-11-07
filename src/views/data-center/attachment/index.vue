<template>
  <div class="resource-manager art-full-height business-workspace-page">
    <BusinessWorkspaceHeader
      eyebrow="DIGITAL ASSET LIBRARY"
      title="资源管理"
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
        :can-view="capabilities.canView"
        :can-upload="capabilities.canUpload"
        :can-rename="capabilities.canRename"
        :can-delete="capabilities.canDelete"
      />
    </section>
  </div>
</template>

<script setup lang="ts">
  import { ElMessage } from 'element-plus'
  import { fetchResourceCapabilities } from '@/api/data-center'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import ArtResourcePanel from '@/components/core/forms/art-resource-picker/panel.vue'
  const capabilities = reactive({
    canView: false,
    canUpload: false,
    canRename: false,
    canDelete: false
  })
  onMounted(async () => {
    try {
      Object.assign(capabilities, await fetchResourceCapabilities())
    } catch {
      ElMessage.error('资源操作权限暂时无法加载，请刷新页面重试')
    }
  })
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
