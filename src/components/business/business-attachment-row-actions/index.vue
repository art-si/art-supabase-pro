<template>
  <BusinessTableRowActions>
    <ArtIconButton icon="ri:eye-line" label="查看附件" @click="viewAttachment(file)" />
    <ArtIconButton
      v-if="download"
      icon="ri:download-2-line"
      label="下载附件"
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
  import { downloadAttachment, viewAttachment } from '@/utils/file'

  defineOptions({ name: 'BusinessAttachmentRowActions' })
  withDefaults(
    defineProps<{
      file: FilePreviewTarget
      download?: boolean
      removable?: boolean
      removeLabel?: string
    }>(),
    { download: true, removable: false, removeLabel: '移除附件' }
  )
  const emit = defineEmits<{ remove: [] }>()
</script>
