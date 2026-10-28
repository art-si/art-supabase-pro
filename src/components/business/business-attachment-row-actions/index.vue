<template>
  <BusinessTableRowActions>
    <ArtIconButton
      icon="ri:eye-line"
      label="查看附件"
      :disabled="!actionUrl"
      :title="actionUrl ? '查看附件' : '附件地址不可用，请重新上传或联系提供者'"
      @click="viewAttachment(file)"
    />
    <ArtIconButton
      v-if="download"
      icon="ri:download-2-line"
      label="下载附件"
      :disabled="!actionUrl"
      :title="actionUrl ? '下载附件' : '附件地址不可用，请重新上传或联系提供者'"
      @click="downloadAttachment(file)"
    />
    <ArtIconButton
      v-if="removable"
      icon="ri:delete-bin-5-line"
      :label="removeLabel"
      tone="danger"
      @click="emit('remove')"
    />
  </BusinessTableRowActions>
</template>

<script setup lang="ts">
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import type { FilePreviewTarget } from '@/hooks/core/useFilePreview'
  import { downloadAttachment, resolveFileActionUrl, viewAttachment } from '@/utils/file'

  defineOptions({ name: 'BusinessAttachmentRowActions' })
  const props = withDefaults(
    defineProps<{
      file: FilePreviewTarget
      download?: boolean
      removable?: boolean
      removeLabel?: string
    }>(),
    { download: true, removable: false, removeLabel: '移除附件' }
  )
  const actionUrl = computed(() => resolveFileActionUrl(props.file.url, window.location.href))
  const emit = defineEmits<{ remove: [] }>()
</script>
