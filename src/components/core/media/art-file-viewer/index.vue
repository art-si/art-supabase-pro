<template>
  <main class="art-file-viewer-page">
    <header class="art-file-viewer-page__header">
      <div class="art-file-viewer-page__title">
        <h1 class="art-file-viewer-page__name" :aria-label="preview.file?.name || '文件预览'">
          <ArtTooltip
            v-if="preview.file?.name"
            ref="nameTooltip"
            :content="preview.file.name"
            trigger="click"
            placement="bottom-start"
          >
            <button
              type="button"
              :title="preview.file.name"
              :aria-label="`查看完整文件名：${preview.file.name}`"
              @keydown.esc="nameTooltip?.hide()"
            >
              {{ preview.file.name }}
            </button>
          </ArtTooltip>
          <template v-else>文件预览</template>
        </h1>
        <span v-if="preview.fileType">文件类型：{{ preview.fileType }}</span>
      </div>
    </header>

    <section
      ref="previewRegion"
      class="art-file-viewer-page__body"
      aria-label="文件预览内容"
      :aria-busy="preview.loading"
      tabindex="-1"
    >
      <ElResult
        v-if="preview.error"
        icon="warning"
        title="无法打开文件预览"
        :sub-title="preview.error"
      >
        <template v-if="preview.canRetry" #extra>
          <ElButton ref="retryButton" type="primary" @click="retryPreview"> 重新加载 </ElButton>
        </template>
      </ElResult>

      <FileViewer
        v-else-if="preview.file?.url && viewer"
        :key="viewer.key"
        :file="blobFile"
        :url="blobFile ? undefined : preview.file.url"
        :options="viewer.options"
        @load-start="viewer.onLoadStart"
        @load-complete="viewer.onLoadComplete"
        @error="viewer.onError"
      />
      <div v-else-if="preview.loading" class="art-file-viewer-page__loading" role="status">
        正在准备文件预览…
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
  import { ElButton, ElResult, type ButtonInstance } from 'element-plus'
  import { useTemplateRef } from 'vue'
  import { FileViewer, type FileViewerOptions } from '@file-viewer/vue3'
  import { imageRenderer } from '@file-viewer/renderer-image'
  import '@file-viewer/vue3/dist/file-viewer3.css'
  import { getFileExtension } from '@/utils/file'
  import { getFilePreviewTarget, type FilePreviewTarget } from '@/hooks/core/useFilePreview'
  import { useWebsiteConfig } from '@/hooks/core/useWebsiteConfig'
  import { useSettingStore } from '@/store/modules/setting'
  import ArtTooltip from '@/components/core/feedback/art-tooltip/index.vue'
  import { getFocusedKeyboardButton } from '@/utils/ui/button-focus'
  import { fileViewerOptions } from './options'

  defineOptions({ name: 'ArtFileViewerPage' })

  interface PreviewState {
    file?: FilePreviewTarget
    fileType: string
    error: string
    loading: boolean
    canRetry: boolean
  }

  interface PreviewViewer {
    key: symbol
    options: FileViewerOptions
    onLoadStart: () => void
    onLoadComplete: () => void
    onError: () => void
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
  const nameTooltip = useTemplateRef<InstanceType<typeof ArtTooltip>>('nameTooltip')
  const previewRegion = useTemplateRef<HTMLElement>('previewRegion')
  const retryButton = useTemplateRef<ButtonInstance>('retryButton')
  const preview = reactive<PreviewState>({
    file: undefined,
    fileType: '',
    error: '',
    loading: false,
    canRetry: false
  })

  // The image package narrows its handler to HTMLDivElement; the Vue wrapper declares HTMLElement.
  const imageRenderers = [imageRenderer] as unknown as FileViewerOptions['renderers']
  const blobFile = shallowRef<File>()
  const viewerOptions = shallowRef<FileViewerOptions | null>(null)
  let previewVersion = 0
  let blobController: AbortController | undefined
  let keyboardRetryVersion: number | undefined

  const viewer = computed<PreviewViewer | null>(() => {
    if (!viewerOptions.value) return null
    const version = previewVersion
    let loading = false
    const current: PreviewViewer = {
      key: Symbol('file-preview'),
      options: { ...viewerOptions.value, theme: settingStore.isDark ? 'dark' : 'light' },
      onLoadStart() {
        if (!isCurrent()) return
        loading = true
        preview.loading = true
      },
      onLoadComplete() {
        if (!isCurrent()) return
        loading = false
        preview.loading = false
        keyboardRetryVersion = undefined
      },
      onError() {
        // The public error event also reports toolbar actions after a successful load.
        if (!isCurrent() || !loading) return
        loading = false
        showPreviewError(
          '附件读取失败，请检查网络或访问权限后重新加载；若仍失败，请从附件名称重新打开',
          version
        )
      }
    }
    function isCurrent(): boolean {
      return version === previewVersion && viewer.value === current
    }
    return current
  })

  function retryPreview(event: MouseEvent): void {
    const trigger = getFocusedKeyboardButton(event)
    if (trigger) previewRegion.value?.focus({ preventScroll: true })
    void loadPreview(Boolean(trigger))
  }

  function showPreviewError(message: string, version: number): void {
    if (version !== previewVersion) return
    preview.error = message
    preview.loading = false
    preview.canRetry = true
    if (keyboardRetryVersion === version) void restoreRetryFocus(version)
  }

  async function restoreRetryFocus(version: number): Promise<void> {
    await nextTick()
    const region = previewRegion.value
    const retry: unknown = retryButton.value?.$el
    if (
      version === previewVersion &&
      region?.ownerDocument.activeElement === region &&
      retry instanceof HTMLButtonElement
    ) {
      retry.focus()
    }
  }

  async function loadPreview(restoreFocus = false): Promise<void> {
    const version = ++previewVersion
    keyboardRetryVersion = restoreFocus ? version : undefined
    blobController?.abort()
    blobController = undefined
    blobFile.value = undefined
    viewerOptions.value = null
    const source = preview.file
    if (!source?.url) {
      preview.loading = false
      return
    }

    preview.loading = true
    preview.error = ''
    preview.canRetry = false
    const isBlob = source.url.startsWith('blob:')
    let readingBlob = isBlob
    let controller: AbortController | undefined
    try {
      let localFile: File | undefined
      if (isBlob) {
        controller = new AbortController()
        blobController = controller
        const response = await fetch(source.url, { signal: controller.signal })
        if (!response.ok) throw new Error('Blob preview failed')
        const blob = await response.blob()
        if (version !== previewVersion || controller.signal.aborted) return
        const fileType = getFileExtension(undefined, source.fileType || blob.type)
        const fallbackExtension = fileType.startsWith('image/')
          ? fileType.slice('image/'.length).split('+')[0]
          : fileType === 'application/pdf'
            ? 'pdf'
            : /^[a-z0-9]+$/i.test(fileType)
              ? fileType
              : 'bin'
        const sourceName = source.name?.trim()
        const filename =
          sourceName && getFileExtension(sourceName)
            ? sourceName
            : `${sourceName || '预览文件'}.${fallbackExtension}`
        localFile = new File([blob], filename, { type: blob.type })
        readingBlob = false
      }

      const fileType = source.fileType || getFileExtension(source.name, source.fileType)
      const isImage =
        fileType.startsWith('image/') ||
        imageExtensions.has(fileType) ||
        imageExtensions.has(getFileExtension(localFile?.name || source.name))
      let options: FileViewerOptions
      if (isImage) {
        options = { ...fileViewerOptions, renderers: imageRenderers }
      } else {
        const { default: allRenderers } = await import('@file-viewer/preset-all')
        if (version !== previewVersion) return
        options = {
          ...fileViewerOptions,
          preset: allRenderers as unknown as FileViewerOptions['preset']
        }
      }
      if (version !== previewVersion) return
      blobFile.value = localFile
      viewerOptions.value = options
    } catch {
      if (version !== previewVersion || controller?.signal.aborted) return
      showPreviewError(
        readingBlob
          ? '本地附件读取失败，请从附件名称重新打开后重试'
          : '预览组件加载失败，请检查网络后重试',
        version
      )
    } finally {
      if (version === previewVersion) preview.loading = false
      if (blobController === controller) blobController = undefined
    }
  }

  watch(
    () => route.query.key,
    (queryKey) => {
      const key = Array.isArray(queryKey) ? queryKey[0] : queryKey
      const file = getFilePreviewTarget(typeof key === 'string' ? key : undefined)
      preview.file = file
      preview.fileType = file?.fileType || getFileExtension(file?.name, file?.fileType)
      preview.error = file ? '' : '预览地址不存在或已过期，请从附件名称重新打开'
      preview.canRetry = false
      void loadPreview()
    },
    { immediate: true }
  )

  onBeforeUnmount(() => {
    previewVersion += 1
    blobController?.abort()
  })

  useTitle(computed(() => `${preview.file?.name || '文件预览'} - ${brandName.value}`))
</script>

<style scoped lang="scss">
  .art-file-viewer-page {
    display: flex;
    flex-direction: column;
    width: 100vw;
    height: 100dvh;
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

      span {
        margin-top: 4px;
        font-size: 13px;
        color: var(--el-text-color-secondary);
      }
    }

    &__name {
      min-width: 0;
      margin: 0;
      font-size: 16px;
      font-weight: 600;

      button {
        display: block;
        max-width: 100%;
        padding: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        color: inherit;
        text-align: start;
        white-space: nowrap;
        cursor: pointer;
        background: transparent;
        border: 0;

        &:focus-visible {
          outline: 2px solid var(--theme-color);
          outline-offset: 2px;
        }
      }
    }

    &__body {
      position: relative;
      flex: 1;
      min-height: 0;

      &:focus-visible {
        outline: none;

        &::after {
          position: absolute;
          inset: 0;
          z-index: 1;
          pointer-events: none;
          content: '';
          border: 2px solid var(--theme-color);
        }
      }

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
