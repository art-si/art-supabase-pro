<template>
  <ElLink
    class="art-attachment-link"
    type="primary"
    :href="actionUrl || undefined"
    :disabled="!actionUrl"
    :tabindex="actionUrl ? 0 : -1"
    :aria-disabled="!actionUrl || undefined"
    :title="
      actionUrl ? `预览 ${displayName}` : `${displayName}（附件地址不可用，请重新上传或联系提供者）`
    "
    underline="never"
    @click.prevent.stop="handlePreview"
  >
    {{ displayName }}
  </ElLink>
</template>

<script setup lang="ts">
  import { ElLink } from 'element-plus'
  import type { FilePreviewTarget } from '@/hooks/core/useFilePreview'
  import { resolveFileActionUrl, viewAttachment } from '@/utils/file'

  defineOptions({ name: 'ArtAttachmentLink' })

  const props = defineProps<{
    file: FilePreviewTarget
  }>()

  const displayName = computed(() => props.file.name?.trim() || '未命名附件')
  const actionUrl = computed(() => resolveFileActionUrl(props.file.url, window.location.href))

  const handlePreview = (): void => {
    if (!actionUrl.value) return
    viewAttachment({ ...props.file, url: actionUrl.value })
  }
</script>

<style scoped lang="scss">
  .art-attachment-link {
    max-width: 100%;
    font-weight: 500;
    vertical-align: middle;

    :deep(.el-link__inner) {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
</style>
