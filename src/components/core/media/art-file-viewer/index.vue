<template>
  <main class="art-file-viewer-page">
    <header class="art-file-viewer-page__header">
      <div class="art-file-viewer-page__title">
        <strong>{{ preview.file?.name || '文件预览' }}</strong>
        <span v-if="preview.fileType">文件类型：{{ preview.fileType }}</span>
      </div>
    </header>

    <section class="art-file-viewer-page__body">
      <ElResult
        v-if="preview.error"
        icon="warning"
        title="无法打开文件预览"
        :sub-title="preview.error"
      >
        <template v-if="preview.canRetry" #extra>
          <ElButton type="primary" :loading="preview.loading" @click="loadFullRenderer()">
            重新加载
          </ElButton>
        </template>
      </ElResult>

      <FileViewer
        v-else-if="preview.file?.url && themedViewerOptions"
        :url="preview.file.url"
        :options="themedViewerOptions"
      />
      <div v-else-if="preview.loading" class="art-file-viewer-page__loading" role="status">
        正在准备文件预览…
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
  import { ElButton, ElResult } from 'element-plus'
  import { FileViewer, type FileViewerOptions } from '@file-viewer/vue3'
  import { imageRenderer } from '@file-viewer/renderer-image'
  import '@file-viewer/vue3/dist/file-viewer3.css'
  import { getFileExtension } from '@/utils/file'
  import { getFilePreviewTarget, type FilePreviewTarget } from '@/hooks/core/useFilePreview'
  import { useWebsiteConfig } from '@/hooks/core/useWebsiteConfig'
  import { useSettingStore } from '@/store/modules/setting'

  defineOptions({ name: 'ArtFileViewerPage' })

  interface PreviewState {
    file?: FilePreviewTarget
    fileType: string
    error: string
    loading: boolean
    canRetry: boolean
  }

  const imageExtensions = new Set([
    'avif',
    'bmp',
    'gif',
    'heic',
    'heif',
    'ico',
    'jpeg',
    'jpg',
    'jxl',
    'png',
    'svg',
    'tif',
    'tiff',
    'webp'
  ])

  const route = useRoute()
  const settingStore = useSettingStore()
  const { brandName } = useWebsiteConfig()
  const preview = reactive<PreviewState>({
    file: undefined,
    fileType: '',
    error: '',
    loading: false,
    canRetry: false
  })

  const commonViewerOptions: FileViewerOptions = {
    rendererMode: 'replace',
    toolbar: {
      position: 'bottom-right',
      zoom: true
    }
  }
  // The image package narrows its handler to HTMLDivElement; the Vue wrapper declares HTMLElement.
  const imageRenderers = [imageRenderer] as unknown as FileViewerOptions['renderers']
  const viewerOptions = shallowRef<FileViewerOptions | null>(null)
  const themedViewerOptions = computed<FileViewerOptions | null>(() =>
    viewerOptions.value
      ? { ...viewerOptions.value, theme: settingStore.isDark ? 'dark' : 'light' }
      : null
  )
  let previewVersion = 0

  async function loadFullRenderer(version = previewVersion): Promise<void> {
    preview.loading = true
    preview.error = ''
    preview.canRetry = false
    try {
      const { default: allRenderers } = await import('@file-viewer/preset-all')
      if (version !== previewVersion) return
      viewerOptions.value = {
        ...commonViewerOptions,
        preset: allRenderers as unknown as FileViewerOptions['preset']
      }
    } catch {
      if (version !== previewVersion) return
      preview.error = '预览组件加载失败，请检查网络后重试'
      preview.canRetry = true
    } finally {
      if (version === previewVersion) preview.loading = false
    }
  }

  watch(
    () => route.query.key,
    (queryKey) => {
      const version = ++previewVersion
      const key = Array.isArray(queryKey) ? queryKey[0] : queryKey
      const file = getFilePreviewTarget(typeof key === 'string' ? key : undefined)
      preview.file = file
      preview.fileType = file?.fileType || getFileExtension(file?.name, file?.fileType)
      preview.error = file ? '' : '预览地址不存在或已过期，请从附件名称重新打开'
      preview.canRetry = false
      viewerOptions.value = null
      if (!file?.url) {
        preview.loading = false
        return
      }
      const isImage =
        preview.fileType.startsWith('image/') ||
        imageExtensions.has(preview.fileType) ||
        imageExtensions.has(getFileExtension(file.name))
      if (isImage) {
        viewerOptions.value = { ...commonViewerOptions, renderers: imageRenderers }
        preview.loading = false
      } else {
        void loadFullRenderer(version)
      }
    },
    { immediate: true }
  )

  useTitle(computed(() => `${preview.file?.name || '文件预览'} - ${brandName.value}`))
</script>

<style scoped lang="scss">
  .art-file-viewer-page {
    display: flex;
    flex-direction: column;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background: var(--el-bg-color-page);

    &__header {
      z-index: 1;
      display: flex;
      flex: none;
      align-items: center;
      justify-content: space-between;
      min-height: 64px;
      padding: 10px 20px;
      background: var(--el-bg-color);
      border-bottom: 1px solid var(--el-border-color-light);
    }

    &__title {
      display: flex;
      flex-direction: column;
      min-width: 0;

      strong {
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 16px;
        white-space: nowrap;
      }

      span {
        margin-top: 4px;
        font-size: 13px;
        color: var(--el-text-color-secondary);
      }
    }

    &__body {
      flex: 1;
      min-height: 0;

      > :deep(*) {
        width: 100%;
        height: 100%;
      }
    }

    &__loading {
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--el-text-color-secondary);
    }

    @media (width <= 768px) {
      &__header {
        padding: 8px 12px;
      }
    }
  }
</style>
