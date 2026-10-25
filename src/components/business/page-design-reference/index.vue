<template>
  <div v-if="routeIdentity" class="page-design-reference">
    <ArtIconButton
      :icon="buttonIcon"
      :label="buttonLabel"
      :loading="state.loading"
      :disabled="state.loading"
      :aria-pressed="state.loadError ? undefined : Boolean(state.reference)"
      :class="{ 'is-active': Boolean(state.reference) }"
      @click="openReferenceDialog"
    />

    <ArtDialog ref="dialogRef" size="md" :show-fullscreen-button="false">
      <div class="design-reference-dialog" @paste="handlePaste">
        <section class="design-reference-dialog__section">
          <div class="design-reference-dialog__section-heading">
            <div>
              <strong>参考截图</strong>
              <p>支持多图、拖拽上传，或在下方区域直接按 Ctrl+V 粘贴截图。</p>
            </div>
            <span>{{ imageCount }}/{{ UI_DESIGN_REFERENCE_IMAGE_LIMIT }}</span>
          </div>

          <button
            type="button"
            class="design-reference-dialog__drop-zone"
            :disabled="imageCount >= UI_DESIGN_REFERENCE_IMAGE_LIMIT"
            @click="openFilePicker"
            @dragover.prevent
            @drop.prevent="handleDrop"
          >
            <ArtSvgIcon icon="ri:image-add-line" aria-hidden="true" />
            <span>
              <strong>点击选择、拖入或粘贴图片</strong>
              <small>PNG、JPG、WebP；单张不超过 5MB，最多 6 张</small>
            </span>
          </button>
          <input
            ref="fileInputRef"
            class="sr-only"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            tabindex="-1"
            aria-hidden="true"
            @change="handleFileInput"
          />

          <div v-if="imageItems.length" class="design-reference-dialog__images">
            <article
              v-for="(image, index) in imageItems"
              :key="image.key"
              class="design-reference-dialog__image"
            >
              <ElImage
                :src="image.previewUrl"
                :alt="image.fileName"
                fit="cover"
                :preview-src-list="previewUrls"
                :initial-index="index"
                preview-teleported
              >
                <template #error>
                  <div class="design-reference-dialog__image-error">
                    <ArtSvgIcon icon="ri:image-line" />
                  </div>
                </template>
              </ElImage>
              <ArtIconButton
                class="design-reference-dialog__remove-image size-6.5! text-base!"
                icon="ri:close-line"
                tone="danger"
                :label="`移除图片：${image.fileName}`"
                @click="removeDraftImage(image)"
              />
              <span :title="image.fileName">{{ image.fileName }}</span>
            </article>
          </div>
        </section>

        <section class="design-reference-dialog__section">
          <div class="design-reference-dialog__section-heading">
            <div>
              <strong>快捷标签</strong>
              <p>选择你希望 AI 后续延续的设计特征。</p>
            </div>
          </div>
          <ElCheckboxGroup v-model="form.preferenceTags" class="design-reference-dialog__tags">
            <ElCheckboxButton
              v-for="option in preferenceOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </ElCheckboxButton>
          </ElCheckboxGroup>
        </section>

        <section class="design-reference-dialog__section">
          <div class="design-reference-dialog__section-heading">
            <div>
              <strong>补充说明</strong>
              <p>可描述喜欢的区域、需要保留的感觉，或不希望照搬的部分。</p>
            </div>
          </div>
          <ElInput
            v-model="form.note"
            type="textarea"
            :rows="4"
            resize="none"
            maxlength="500"
            show-word-limit
            aria-label="设计参考补充说明"
            placeholder="例如：喜欢整体的紧凑布局和左右分区；表格操作区保持轻量。"
          />
        </section>
      </div>

      <template v-if="state.reference" #footer-left="{ api, loading }">
        <ElPopconfirm
          title="确定取消当前路由的设计参考吗？相关截图也会删除。"
          width="260"
          confirm-button-text="取消参考"
          cancel-button-text="保留"
          @confirm="removeReference(api)"
        >
          <template #reference>
            <ElButton type="danger" text :disabled="loading">取消设计参考</ElButton>
          </template>
        </ElPopconfirm>
      </template>
    </ArtDialog>
  </div>
</template>

<script setup lang="ts">
  import { ElMessage } from 'element-plus'
  import { storeToRefs } from 'pinia'
  import { useRoute } from 'vue-router'
  import {
    fetchUiDesignReference,
    fetchUiDesignReferenceImages,
    removeUiDesignReference,
    removeUiDesignReferenceImage,
    saveUiDesignReference,
    UI_DESIGN_REFERENCE_IMAGE_LIMIT,
    UI_DESIGN_REFERENCE_IMAGE_MAX_BYTES,
    UI_DESIGN_REFERENCE_IMAGE_MIME_TYPES,
    uploadUiDesignReferenceImage,
    type UiDesignReferenceImageRecord,
    type UiDesignReferenceRecord,
    type UiDesignReferenceSurfaceKind
  } from '@/api/ui-design-reference'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { useUserStore } from '@/store/modules/user'
  import { getClipboardFiles } from '@/utils/file/clipboard'
  import { StorageConfig } from '@/utils/storage/storage-config'

  defineOptions({ name: 'PageDesignReference' })

  interface ReferenceState {
    reference: UiDesignReferenceRecord | null
    loading: boolean
    loadError: boolean
  }

  interface DraftImage {
    key: string
    fileName: string
    previewUrl: string
    file?: File
    existing?: UiDesignReferenceImageRecord
  }

  const preferenceOptions = [
    { value: 'compact-layout', label: '布局紧凑' },
    { value: 'clear-hierarchy', label: '层级清晰' },
    { value: 'balanced-spacing', label: '留白舒适' },
    { value: 'efficient-table', label: '表格高效' },
    { value: 'clear-status', label: '状态清楚' },
    { value: 'focused-actions', label: '操作聚焦' },
    { value: 'consistent-color', label: '配色统一' },
    { value: 'strong-overview', label: '概览直观' }
  ] as const

  const route = useRoute()
  const { isPlatformSuper } = storeToRefs(useUserStore())
  const dialogRef = ref<ArtDialogExpose<Record<string, unknown>>>()
  const fileInputRef = ref<HTMLInputElement>()
  const existingImages = ref<DraftImage[]>([])
  const stagedImages = ref<DraftImage[]>([])
  const removedImages = ref<UiDesignReferenceImageRecord[]>([])
  const form = reactive({
    preferenceTags: [] as string[],
    note: ''
  })
  const state = reactive<ReferenceState>({
    reference: null,
    loading: false,
    loadError: false
  })
  let loadSequence = 0

  const routeIdentity = computed(() => {
    if (!isPlatformSuper.value) return null
    const name = typeof route.name === 'string' ? route.name.trim() : ''
    if (!name) return null
    return {
      name,
      pathPattern: route.matched.at(-1)?.path?.trim() || route.path
    }
  })
  const imageItems = computed(() => [...existingImages.value, ...stagedImages.value])
  const imageCount = computed(() => imageItems.value.length)
  const previewUrls = computed(() =>
    imageItems.value.map((image) => image.previewUrl).filter(Boolean)
  )
  const buttonIcon = computed(() => {
    if (state.loading) return 'ri:loader-4-line'
    if (state.loadError) return 'ri:refresh-line'
    return state.reference ? 'ri:star-fill' : 'ri:star-line'
  })
  const buttonLabel = computed(() => {
    if (state.loading) return '正在加载当前路由的设计参考状态'
    if (state.loadError) return '设计参考状态加载失败，点击重试'
    return state.reference ? '编辑当前路由设计参考' : '将当前路由标记为设计参考'
  })

  function getPageTitle(): string {
    const matchedTitle = [...route.matched]
      .reverse()
      .map((record) => record.meta?.title)
      .find((title): title is string => typeof title === 'string' && title.trim().length > 0)
    return matchedTitle?.trim() || routeIdentity.value?.name || route.path
  }

  function getSurfaceKind(): UiDesignReferenceSurfaceKind {
    const path = route.path.toLowerCase()
    if (path.includes('/dashboard')) return 'dashboard'
    if (/\/(config|setting|permission)(\/|$)/.test(path)) return 'configuration'
    if (/\/(create|edit)(\/|$)/.test(path)) return 'form'
    if (/\/(detail|view)(\/|$)/.test(path)) return 'detail'
    return 'workspace'
  }

  function getStyleSnapshot() {
    return {
      schemaVersion: 1,
      referenceScope: 'entire-route',
      capturedFrom: 'global-header',
      matchedRouteNames: route.matched
        .map((record) => record.name)
        .filter((name): name is string => typeof name === 'string'),
      matchedPathPatterns: route.matched.map((record) => record.path)
    }
  }

  async function loadReference(): Promise<void> {
    const identity = routeIdentity.value
    if (!identity) return
    const sequence = ++loadSequence
    state.loading = true
    state.loadError = false
    try {
      const reference = await fetchUiDesignReference(identity.name)
      if (sequence === loadSequence) state.reference = reference
    } catch {
      if (sequence === loadSequence) state.loadError = true
    } finally {
      if (sequence === loadSequence) state.loading = false
    }
  }

  function resetDraft(): void {
    stagedImages.value.forEach((image) => URL.revokeObjectURL(image.previewUrl))
    existingImages.value = []
    stagedImages.value = []
    removedImages.value = []
    form.preferenceTags = [...(state.reference?.preferenceTags ?? [])]
    form.note = state.reference?.note ?? ''
    if (fileInputRef.value) fileInputRef.value.value = ''
  }

  async function loadDialogImages(): Promise<void> {
    const referenceId = state.reference?.id
    if (!referenceId) return
    const images = await fetchUiDesignReferenceImages(referenceId)
    existingImages.value = images.map((image) => ({
      key: image.id,
      fileName: image.fileName,
      previewUrl: image.signedUrl,
      existing: image
    }))
  }

  async function openReferenceDialog(): Promise<void> {
    if (!routeIdentity.value) return

    resetDraft()
    await dialogRef.value?.handleOpen(
      {},
      {
        title: state.reference ? '编辑设计参考' : '添加设计参考',
        subtitle: 'AI 后续会把当前路由的整个模块作为设计风格参考。',
        confirmText: state.reference ? '保存修改' : '保存参考',
        contentMaxHeight: '68vh',
        loading: state.loadError || Boolean(state.reference),
        loadingText: '正在加载设计参考…',
        onOpen: async (_data, api) => {
          try {
            if (state.loadError) await loadReference()
            if (state.loadError) {
              ElMessage.error('设计参考加载失败，请稍后重试')
              await api.handleClose(true)
              return
            }
            resetDraft()
            api.setOptions({
              title: state.reference ? '编辑设计参考' : '添加设计参考',
              confirmText: state.reference ? '保存修改' : '保存参考'
            })
            if (state.reference) await loadDialogImages()
          } catch {
            ElMessage.error('参考截图加载失败，请稍后重试')
          } finally {
            api.setLoading(false)
          }
        },
        onConfirm: saveReference,
        onReset: resetDraft
      }
    )
  }

  function openFilePicker(): void {
    if (imageCount.value < UI_DESIGN_REFERENCE_IMAGE_LIMIT) fileInputRef.value?.click()
  }

  function createClipboardImage(file: File, index: number): File {
    if (file.name && !/^image(?:\.[^.]+)?$/i.test(file.name)) return file
    const extension = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1] || 'png'
    return new File([file], `粘贴截图_${Date.now()}_${index + 1}.${extension}`, {
      type: file.type,
      lastModified: Date.now()
    })
  }

  function appendFiles(files: readonly File[]): void {
    const acceptedTypes = new Set<string>(UI_DESIGN_REFERENCE_IMAGE_MIME_TYPES)
    const validFiles = files.filter((file) => {
      if (!acceptedTypes.has(file.type)) {
        ElMessage.warning(`${file.name || '图片'} 格式不支持，请使用 PNG、JPG 或 WebP`)
        return false
      }
      if (file.size > UI_DESIGN_REFERENCE_IMAGE_MAX_BYTES) {
        ElMessage.warning(`${file.name || '图片'} 超过 5MB，未添加`)
        return false
      }
      return true
    })
    const remaining = UI_DESIGN_REFERENCE_IMAGE_LIMIT - imageCount.value
    if (remaining <= 0) {
      ElMessage.warning(`最多只能添加 ${UI_DESIGN_REFERENCE_IMAGE_LIMIT} 张参考图片`)
      return
    }
    if (validFiles.length > remaining) {
      ElMessage.warning(`最多还能添加 ${remaining} 张图片`)
    }
    stagedImages.value.push(
      ...validFiles.slice(0, remaining).map((file) => ({
        key: crypto.randomUUID(),
        fileName: file.name,
        previewUrl: URL.createObjectURL(file),
        file
      }))
    )
  }

  function handleFileInput(event: Event): void {
    const input = event.target as HTMLInputElement
    appendFiles(Array.from(input.files ?? []))
    input.value = ''
  }

  function handleDrop(event: DragEvent): void {
    appendFiles(Array.from(event.dataTransfer?.files ?? []))
  }

  function handlePaste(event: ClipboardEvent): void {
    const sourceFiles = getClipboardFiles(event.clipboardData)
    const imageFiles = sourceFiles.filter((file) => file.type.startsWith('image/'))
    if (!imageFiles.length) return
    event.preventDefault()
    appendFiles(imageFiles.map(createClipboardImage))
  }

  function removeDraftImage(image: DraftImage): void {
    if (image.existing) {
      existingImages.value = existingImages.value.filter((item) => item.key !== image.key)
      removedImages.value.push(image.existing)
      return
    }
    URL.revokeObjectURL(image.previewUrl)
    stagedImages.value = stagedImages.value.filter((item) => item.key !== image.key)
  }

  async function saveReference(): Promise<boolean> {
    const identity = routeIdentity.value
    if (!identity) return false
    try {
      const reference = await saveUiDesignReference({
        id: state.reference?.id,
        routeName: identity.name,
        routePathPattern: identity.pathPattern,
        pageTitle: getPageTitle(),
        surfaceKind: getSurfaceKind(),
        preferenceTags: form.preferenceTags,
        note: form.note,
        styleSnapshot: getStyleSnapshot(),
        sourceRevision: StorageConfig.CURRENT_VERSION
      })
      state.reference = reference

      const uploadedImages: UiDesignReferenceImageRecord[] = []
      try {
        for (const [index, image] of stagedImages.value.entries()) {
          if (!image.file) continue
          uploadedImages.push(
            await uploadUiDesignReferenceImage(
              reference.id,
              image.file,
              existingImages.value.length + index
            )
          )
        }
      } catch (error) {
        await Promise.allSettled(uploadedImages.map((image) => removeUiDesignReferenceImage(image)))
        notifyFriendlyError(error, '参考图片上传失败，请检查图片后重试')
        return false
      }

      stagedImages.value.forEach((image) => URL.revokeObjectURL(image.previewUrl))
      stagedImages.value = []
      existingImages.value.push(
        ...uploadedImages.map((image) => ({
          key: image.id,
          fileName: image.fileName,
          previewUrl: image.signedUrl,
          existing: image
        }))
      )

      let cleanupFailed = false
      for (const image of [...removedImages.value]) {
        const result = await removeUiDesignReferenceImage(image)
        cleanupFailed ||= result.storageCleanupFailed
        removedImages.value = removedImages.value.filter((item) => item.id !== image.id)
      }
      if (cleanupFailed) ElMessage.warning('参考已保存，但有历史图片文件未能完全清理')
      ElMessage.success('设计参考已保存，AI 将参考当前路由的整个模块')
      return true
    } catch (error) {
      notifyFriendlyError(error, '设计参考保存失败，请稍后重试')
      return false
    }
  }

  async function removeReference(api: ArtDialogExpose<Record<string, unknown>>): Promise<void> {
    const id = state.reference?.id
    if (!id) return
    api.setConfirmLoading(true)
    try {
      await removeUiDesignReference(id)
      state.reference = null
      ElMessage.success('已取消当前路由的设计参考')
      await api.handleClose(true)
    } catch (error) {
      notifyFriendlyError(error, '取消设计参考失败，请稍后重试')
      return
    } finally {
      api.setConfirmLoading(false)
    }
  }

  watch(
    () => routeIdentity.value?.name,
    (routeName) => {
      loadSequence += 1
      state.reference = null
      state.loading = false
      state.loadError = false
      if (routeName) void loadReference()
    },
    { immediate: true }
  )

  onBeforeUnmount(resetDraft)
</script>

<style scoped lang="scss">
  .page-design-reference {
    display: inline-flex;
    flex: none;
    margin-left: 12px;

    :deep(.art-icon-button.is-active) {
      color: var(--theme-color);
      background-color: color-mix(in srgb, var(--theme-color) 10%, transparent);
      box-shadow: var(--art-themed-action-active-shadow);
    }
  }

  .design-reference-dialog {
    display: grid;
    gap: var(--art-space-5);

    &__section {
      display: grid;
      gap: var(--art-space-3);
    }

    &__section + &__section {
      padding-top: var(--art-space-4);
      border-top: 1px solid var(--art-layout-divider);
    }

    &__section-heading {
      display: flex;
      gap: var(--art-space-3);
      align-items: flex-start;
      justify-content: space-between;

      strong {
        display: block;
        color: var(--el-text-color-primary);
      }

      p {
        margin: 3px 0 0;
        font-size: var(--art-font-size-caption);
        line-height: var(--art-line-height-body);
        color: var(--el-text-color-secondary);
      }

      > span {
        flex: none;
        font-size: var(--art-font-size-caption);
        font-variant-numeric: tabular-nums;
        color: var(--el-text-color-secondary);
      }
    }

    &__drop-zone {
      display: flex;
      gap: var(--art-space-3);
      align-items: center;
      width: 100%;
      min-height: 84px;
      padding: var(--art-space-4);
      color: var(--el-text-color-secondary);
      text-align: left;
      cursor: pointer;
      background: color-mix(in srgb, var(--theme-color) 3%, var(--default-box-color));
      border: 1px dashed color-mix(in srgb, var(--theme-color) 35%, var(--art-layout-divider));
      border-radius: var(--custom-radius);
      transition:
        color var(--art-motion-duration-fast) ease,
        background-color var(--art-motion-duration-fast) ease,
        border-color var(--art-motion-duration-fast) ease;

      > .art-svg-icon {
        flex: none;
        width: 28px;
        height: 28px;
        color: var(--theme-color);
      }

      span,
      strong,
      small {
        display: block;
      }

      small {
        margin-top: 4px;
        color: var(--el-text-color-placeholder);
      }

      &:not(:disabled):hover,
      &:not(:disabled):focus-visible {
        color: var(--theme-color);
        outline: none;
        background: color-mix(in srgb, var(--theme-color) 7%, var(--default-box-color));
        border-color: var(--theme-color);
      }

      &:disabled {
        cursor: not-allowed;
        opacity: 0.55;
      }
    }

    &__images {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--art-space-3);
    }

    &__image {
      position: relative;
      display: grid;
      gap: var(--art-space-1);
      min-width: 0;

      :deep(.el-image) {
        width: 100%;
        aspect-ratio: 16 / 10;
        overflow: hidden;
        background: var(--default-bg-color);
        border: 1px solid var(--art-layout-divider);
        border-radius: var(--art-control-radius);
      }

      > span {
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: var(--art-font-size-caption);
        color: var(--el-text-color-secondary);
        white-space: nowrap;
      }
    }

    &__image-error {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      color: var(--el-text-color-placeholder);
    }

    &__remove-image {
      position: absolute;
      top: 6px;
      right: 6px;
      color: white;
      background: rgb(15 23 42 / 72%);

      &:hover,
      &:focus-visible {
        outline: none;
        background: var(--el-color-danger);
      }
    }

    &__tags {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: var(--art-space-2);

      :deep(.el-checkbox-button) {
        min-width: 0;
      }

      :deep(.el-checkbox-button__inner) {
        width: 100%;
        padding-inline: var(--art-space-2);
        overflow: hidden;
        text-overflow: ellipsis;
        border: 1px solid var(--art-layout-divider);
        border-radius: var(--art-control-radius);
        box-shadow: none;
      }

      :deep(.el-checkbox-button:first-child .el-checkbox-button__inner),
      :deep(.el-checkbox-button:last-child .el-checkbox-button__inner) {
        border-radius: var(--art-control-radius);
      }
    }

    @media (width <= 640px) {
      &__images {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      &__tags {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  }
</style>
