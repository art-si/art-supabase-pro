<template>
  <ElLink
    class="art-attachment-link"
    type="primary"
    :href="file.url || '#'"
    :title="file.url ? `预览 ${displayName}` : `${displayName}（无可用地址）`"
    underline="never"
    @click.prevent.stop="handlePreview"
  >
    {{ displayName }}
  </ElLink>
</template>

<script setup lang="ts">
  import { ElLink } from 'element-plus'
  import type { FilePreviewTarget } from '@/hooks/core/useFilePreview'
  import { viewAttachment } from '@/utils/file'

  defineOptions({ name: 'ArtAttachmentLink' })

  const props = defineProps<{
    file: FilePreviewTarget
  }>()

  const displayName = computed(() => props.file.name?.trim() || '未命名附件')

  const handlePreview = (): void => {
    viewAttachment(props.file)
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
