<template>
  <ElPopover
    v-model:visible="visible"
    placement="bottom"
    :width="336"
    :trigger="[]"
    :show-arrow="false"
    popper-class="art-tiptap-editor-popper"
  >
    <template #reference>
      <span class="art-tiptap-editor__popover-trigger">
        <ToolbarButton
          :label="label"
          :icon="icon"
          :disabled="disabled"
          :tooltip="false"
          @click="visible = true"
        />
      </span>
    </template>

    <div class="art-tiptap-editor__media-panel">
      <div class="art-tiptap-editor__panel-heading">
        <span class="art-tiptap-editor__panel-icon" aria-hidden="true">
          <ArtSvgIcon :icon="icon" />
        </span>
        <span>
          <strong>{{ panelTitle }}</strong>
          <small>{{ panelDescription }}</small>
        </span>
      </div>

      <ArtUploadFile
        :model-value="null"
        :resource-tenant-id="resourceTenantId"
        :title="uploadLabel"
        :accept="accept"
        :file-size="maxSize"
        :limit="1"
        :disabled="disabled"
        :show-file-list="false"
        :show-tip="false"
        @resource-change="handleResourceChange"
      >
        <template #trigger="{ uploading }">
          <span
            class="art-tiptap-editor__media-upload"
            :class="{ 'is-loading': uploading }"
            :aria-busy="uploading"
          >
            <span class="art-tiptap-editor__media-upload-icon" aria-hidden="true">
              <ArtSvgIcon :icon="uploading ? 'ri:loader-4-line' : 'ri:upload-cloud-2-line'" />
            </span>
            <span>
              <strong>{{ uploading ? '正在上传…' : uploadLabel }}</strong>
              <small>{{ uploadHint }}</small>
            </span>
          </span>
        </template>
      </ArtUploadFile>

      <div v-if="allowUrl" class="art-tiptap-editor__panel-divider"
        ><span>或使用网络地址</span></div
      >

      <form v-if="allowUrl" class="art-tiptap-editor__inline-form" @submit.prevent="submitUrl">
        <input
          v-model="url"
          type="url"
          :placeholder="urlPlaceholder"
          :aria-label="`${label}地址`"
          autocomplete="off"
        />
        <input
          v-if="kind === 'file'"
          v-model="fileName"
          type="text"
          placeholder="附件显示名称（可选）"
          aria-label="附件显示名称"
        />
        <button type="submit" :disabled="!url.trim()">插入</button>
      </form>
    </div>
  </ElPopover>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import ArtUploadFile from '@/components/core/forms/art-upload-file/index.vue'
  import ToolbarButton from './art-tiptap-toolbar-button.vue'
  import type { ArtTiptapMediaKind } from './types'

  defineOptions({ name: 'ArtTiptapMediaPopover' })

  const props = withDefaults(
    defineProps<{
      kind: ArtTiptapMediaKind
      label: string
      icon: string
      accept: string
      maxSize: number
      resourceTenantId?: string
      disabled?: boolean
      allowUrl?: boolean
      urlPlaceholder?: string
    }>(),
    {
      disabled: false,
      resourceTenantId: '',
      allowUrl: true,
      urlPlaceholder: 'https://example.com/file'
    }
  )

  const emit = defineEmits<{
    upload: [resource: Api.DataCenter.Resources.ResourceListItem, fileName: string]
    url: [value: { url: string; name?: string }]
    visibilityChange: [visible: boolean]
  }>()

  const visible = ref(false)
  const url = ref('')
  const fileName = ref('')

  watch(visible, (value) => emit('visibilityChange', value))

  const panelTitle = computed(() => {
    const titles: Record<ArtTiptapMediaKind, string> = {
      image: '插入图片',
      video: '插入视频',
      audio: '插入音频',
      file: '插入附件'
    }
    return titles[props.kind]
  })

  const panelDescription = computed(() => {
    const descriptions: Record<ArtTiptapMediaKind, string> = {
      image: '上传后直接嵌入正文，支持粘贴与拖拽',
      video: '推荐 MP4 或 WebM，上传后可直接播放',
      audio: '推荐 MP3、WAV 或 OGG 格式',
      file: '上传文档或压缩包，并生成附件卡片'
    }
    return descriptions[props.kind]
  })

  const uploadLabel = computed(() => {
    const labels: Record<ArtTiptapMediaKind, string> = {
      image: '选择本地图片',
      video: '选择本地视频',
      audio: '选择本地音频',
      file: '选择本地附件'
    }
    return labels[props.kind]
  })

  const uploadHint = computed(() => {
    const size = Math.ceil(props.maxSize / 1024 / 1024)
    return `单个文件不超过 ${size} MB`
  })

  const handleResourceChange = (resources: Api.DataCenter.Resources.ResourceListItem[]) => {
    const resource = resources[0]
    if (!resource) return
    emit('upload', resource, resource.originName || resource.objectName || '附件')
    visible.value = false
  }

  const submitUrl = () => {
    const value = url.value.trim()
    if (!value) return
    emit('url', { url: value, name: fileName.value.trim() || undefined })
    url.value = ''
    fileName.value = ''
    visible.value = false
  }
</script>
