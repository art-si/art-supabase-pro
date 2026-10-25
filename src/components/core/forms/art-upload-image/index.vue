<template>
  <div
    v-if="readonly || (uploadDisabled && fileList.length > 0)"
    class="art-upload is-readonly flex flex-wrap gap-1.5"
    :class="{ 'is-full-width': width === '100%' }"
    v-bind="$attrs"
  >
    <div
      v-for="(file, index) in fileList"
      :key="file.url"
      class="preview-list upload-container relative"
      :style="getSize"
    >
      <div class="preview-mask">
        <ArtIconButton
          class="preview-action"
          icon="ri-eye-line"
          :label="`预览图片 ${file.name}`"
          @click="handleView(index)"
        />
      </div>
      <el-image
        :src="file.url"
        :alt="file.name || '上传图片预览'"
        class="absolute rounded-md"
        :style="getSize"
        :fit="previewFit"
      />
    </div>
  </div>
  <el-upload
    v-else
    v-model:file-list="fileList"
    class="art-upload"
    :class="{
      'is-disabled': uploadDisabled,
      'hide-upload-trigger': !canUpload,
      'is-full-width': width === '100%'
    }"
    :before-upload="beforeUpload"
    :http-request="handleUpload"
    :on-success="handleSuccess"
    :on-exceed="handleExceed"
    :on-error="handleError"
    :multiple="multiple"
    :limit="effectiveLimit"
    :accept="fileType"
    :disabled="readonly || uploadDisabled"
    v-bind="$attrs"
  >
    <template #trigger>
      <slot name="default">
        <component :is="btnRender()" />
      </slot>
    </template>
    <button
      v-if="canPickResource && fileList.length === 0"
      type="button"
      class="resource-picker-action"
      :style="{ width: `calc(${getSize.width} - 2px)` }"
      aria-label="从资源库选择图片"
      title="从资源库选择图片"
      @click="isOpenResource = true"
    >
      <ArtSvgIcon icon="ri-folder-open-line" aria-hidden="true" />
      <span>资源库</span>
    </button>
    <template #file="{ file, index }">
      <div class="preview-list upload-container relative" :style="getSize">
        <template v-if="file.url">
          <div class="preview-mask">
            <ArtIconButton
              class="preview-action"
              icon="ri-eye-line"
              label="预览图片"
              @click.stop="handleView(index)"
            />
            <ArtIconButton
              v-if="!uploadDisabled"
              class="preview-action preview-action--danger"
              icon="ri-delete-bin-2-line"
              tone="danger"
              label="删除图片"
              @click.stop="handleRemove(index)"
            />
          </div>
          <el-image
            :src="file.url"
            :alt="file.name || '上传图片预览'"
            class="absolute rounded-md"
            :style="getSize"
            :fit="previewFit"
          />
        </template>
        <div v-else-if="file.status === 'fail'" class="upload-state upload-state--error">
          <ArtSvgIcon icon="ri:error-warning-line" aria-hidden="true" />
          <span>加载失败</span>
          <button
            v-if="!uploadDisabled"
            type="button"
            class="upload-state__remove"
            aria-label="移除加载失败的图片"
            @click.stop="handleRemove(index)"
          >
            移除
          </button>
        </div>
        <div v-else class="upload-state upload-state--loading">
          <ArtSvgIcon icon="ri:loader-4-line" class="upload-state__spinner" aria-hidden="true" />
          <span>上传中</span>
        </div>
      </div>
    </template>
    <template #tip>
      <div v-if="$slots.tip || $attrs.tip" class="upload-tip">
        <slot name="tip">
          {{ $attrs?.tip }}
        </slot>
      </div>
    </template>
    <ArtResourcePicker
      v-if="canPickResource"
      v-model:visible="isOpenResource"
      :resource-tenant-id="resourceTenantId"
      :multiple="multiple"
      :limit="multiple ? Math.max(effectiveLimit - fileList.length, 0) : 1"
      default-file-type="image"
      @confirm="handleConfirm"
    />
  </el-upload>
  <ElImageViewer
    v-if="previewVisible"
    :url-list="previewList"
    :initial-index="previewIndex"
    :z-index="10000"
    teleported
    hide-on-click-modal
    @close="previewVisible = false"
  />
</template>

<script setup lang="tsx">
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import {
    ElMessage,
    ElImageViewer,
    UploadUserFile,
    UploadRequestOptions,
    type UploadFile
  } from 'element-plus'
  import ArtResourcePicker from '@/components/core/forms/art-resource-picker/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import {
    normalizeUploadModelUrls,
    shouldSyncUploadFileList
  } from '@/components/core/forms/upload-model-utils'
  import ResourceListItem = Api.DataCenter.Resources.ResourceListItem
  import { uploadAttachment } from '@/api/attachments'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { uniqBy } from 'lodash-es'
  import { isAcceptedFileType } from '@/utils/file/accept'
  import { formatSize } from '@/utils/file/format-size'

  defineOptions({ name: 'ArtUploadImage', inheritAttrs: false })

  const {
    modelValue = null,
    title = null,
    size = 120,
    width,
    height,
    previewFit = 'cover',
    fileSize = 10 * 1024 * 1024,
    fileType = 'image/*',
    limit = 5,
    multiple = false,
    readonly = false,
    disabled = false,
    showResourcePicker = true,
    resourceTenantId = '',
    uploadRequest
  } = defineProps<{
    modelValue?: string | string[] | null
    title?: string
    size?: number
    width?: number | string
    height?: number | string
    previewFit?: 'fill' | 'contain' | 'cover' | 'none' | 'scale-down'
    fileSize?: number
    fileType?: string
    limit?: number
    multiple?: boolean
    readonly?: boolean
    disabled?: boolean
    showResourcePicker?: boolean
    resourceTenantId?: string
    uploadRequest?: (file: File) => Promise<Api.DataCenter.Resources.ResourceListItem[]>
  }>()

  const emit = defineEmits<{
    (e: 'update:modelValue', value: string | string[]): void
    (e: 'resource-change', value: Api.DataCenter.Resources.ResourceListItem[]): void
  }>()

  const isOpenResource = ref<boolean>(false)
  const tenantScopeStore = useTenantScopeStore()
  const missingTenantTarget = computed(
    () => tenantScopeStore.isAllTenants && !resourceTenantId.trim()
  )
  const uploadDisabled = computed(() => disabled || (missingTenantTarget.value && !uploadRequest))
  const canPickResource = computed(
    () => showResourcePicker && !readonly && !uploadDisabled.value && !missingTenantTarget.value
  )
  const previewList = computed(() => fileList.value.flatMap((file) => (file.url ? [file.url] : [])))
  const previewVisible = ref(false)
  const previewIndex = ref(0)
  const effectiveLimit = computed(() => (multiple ? limit : 1))
  const canUpload = computed(() => fileList.value.length < effectiveLimit.value)

  const getSize = computed(() => {
    const toCssSize = (value: number | string): string =>
      typeof value === 'number' ? `${value}px` : value

    return {
      width: toCssSize(width ?? size ?? 120),
      height: toCssSize(height ?? size ?? 120)
    }
  })

  function btnRender() {
    return (
      <div
        class={[
          'upload-container',
          {
            'is-disabled': uploadDisabled.value,
            'has-resource-picker': canPickResource.value && fileList.value.length === 0
          }
        ]}
        style={getSize.value}
        title={
          missingTenantTarget.value && !uploadRequest ? '请先在页头选择业务所属租户' : undefined
        }
      >
        <div class="upload-prompt">
          <span class="upload-prompt__icon" aria-hidden="true">
            <ArtSvgIcon icon="ri-add-line" />
          </span>
          <span class="upload-prompt__title">
            {missingTenantTarget.value && !uploadRequest ? '先选择租户' : (title ?? '上传图片')}
          </span>
        </div>
      </div>
    )
  }

  const fileList = ref<UploadUserFile[]>([])
  const lastSyncedModelUrls = ref<string[]>([])

  watch(
    () => modelValue,
    (val: string | string[] | null) => {
      if (!shouldSyncUploadFileList(val, lastSyncedModelUrls.value)) return

      const nextUrls = normalizeUploadModelUrls(val)
      lastSyncedModelUrls.value = nextUrls
      fileList.value = nextUrls.map((url) => ({
        name: url.split('/').pop() ?? url,
        url
      }))
    },
    { immediate: true, deep: true }
  )

  function updateModelValue() {
    const value = multiple
      ? fileList.value.flatMap((file) => (file.url ? [file.url] : []))
      : (fileList.value[0]?.url ?? '')

    lastSyncedModelUrls.value = normalizeUploadModelUrls(value)
    emit('update:modelValue', value)
  }

  const getErrorMessage = (error?: unknown): string => {
    return getFriendlySupabaseErrorMessage(error, '图片上传失败，请重新上传')
  }

  function handleSuccess(res: unknown, uploadFile: UploadFile) {
    const resource = Array.isArray(res)
      ? (res[0] as Api.DataCenter.Resources.ResourceListItem | undefined)
      : undefined
    if (!resource?.url) {
      uploadFile.status = 'fail'
      handleError(new Error('图片上传失败，服务端未返回文件地址'))
      return
    }

    const index = fileList.value.findIndex((item) => item.uid === uploadFile.uid)
    if (index === -1) return

    fileList.value[index].name = resource.originName ?? uploadFile.name
    fileList.value[index].url = resource.url

    updateModelValue()
    emit('resource-change', [resource])
  }

  function beforeUpload(rawFile: File) {
    if (readonly || uploadDisabled.value) return false
    if (!isAcceptedFileType(rawFile, fileType)) {
      ElMessage.warning('图片格式不符合当前上传要求')
      return false
    }
    if (fileSize < rawFile.size) {
      ElMessage.error(`单张图片不能超过 ${formatSize(fileSize, { precision: 1, trimZeros: true })}`)
      return false
    }

    return true
  }

  function handleExceed() {
    ElMessage.warning(`当前最多只能上传 ${effectiveLimit.value} 张图片`)
  }

  function handleError(error?: unknown) {
    ElMessage.error(getErrorMessage(error))
  }

  const handleView = (index: number) => {
    const url = fileList.value[index]?.url
    if (!url) return
    previewIndex.value = previewList.value.indexOf(url)
    previewVisible.value = true
  }

  const handleRemove = (index: number) => {
    if (readonly || uploadDisabled.value) return
    fileList.value.splice(index, 1)
    updateModelValue()
  }

  const handleConfirm = (selected: ResourceListItem[]) => {
    if (readonly || uploadDisabled.value || missingTenantTarget.value) return
    if (resourceTenantId && selected.some((resource) => resource.tenantId !== resourceTenantId)) {
      ElMessage.warning('所选图片不属于当前目标租户，请重新选择')
      return
    }
    if (
      selected.some(
        (item) =>
          !isAcceptedFileType(
            { name: item.originName || item.objectName || '', type: item.mimeType || '' },
            fileType
          )
      )
    ) {
      ElMessage.warning('所选资源格式不符合当前图片要求')
      return
    }
    const chosenFiles: UploadUserFile[] = selected
      .filter((item) => item.url)
      .map((item) => {
        return { name: item.originName ?? item.objectName ?? '资源文件', url: item.url }
      })
    const nextFiles = multiple
      ? uniqBy([...fileList.value, ...chosenFiles], (file) => file.url || file.uid)
      : chosenFiles.slice(0, 1)
    if (nextFiles.length > effectiveLimit.value) {
      handleExceed()
      return
    }
    fileList.value = nextFiles
    updateModelValue()
    emit('resource-change', selected)
  }

  const handleUpload = async (options: UploadRequestOptions): Promise<unknown> => {
    return await (uploadRequest?.(options.file) ??
      uploadAttachment(options.file, { targetTenantId: resourceTenantId || undefined }))
  }
</script>

<style scoped lang="scss">
  .art-upload {
    position: relative;
    width: fit-content;
    max-width: 100%;

    &.is-full-width {
      width: 100%;

      :deep(.el-upload),
      :deep(.el-upload-list),
      :deep(.el-upload-list__item) {
        width: 100%;
      }
    }
  }

  .resource-picker-action {
    position: absolute;
    top: 1px;
    left: 1px;
    z-index: 2;
    display: inline-flex;
    flex: 0 0 auto;
    gap: 6px;
    align-items: center;
    justify-content: center;
    max-width: calc(100% - 2px);
    min-height: 32px;
    padding: 4px 10px;
    font: inherit;
    font-size: 12px;
    line-height: 1.5;
    color: var(--el-text-color-regular);
    cursor: pointer;
    background: var(--art-gray-200);
    border: 0;
    border-bottom: 1px dashed var(--el-border-color);
    border-radius: 0.375rem 0.375rem 0 0;

    &:hover {
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
      border-color: var(--el-color-primary);
    }

    &:focus-visible {
      outline: 2px solid var(--el-color-primary);
      outline-offset: 2px;
    }
  }

  .art-upload:not(.is-readonly) {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: flex-start;
  }

  :deep(.el-upload) {
    display: inline-flex;
    order: 1;
    width: auto;
    max-width: 100%;
    vertical-align: top;
  }

  .hide-upload-trigger > :deep(.el-upload) {
    display: none;
  }

  .upload-tip {
    flex-basis: 100%;
    order: 3;
    font-size: 12px;
    line-height: 1.5;
    color: var(--el-text-color-secondary);
  }

  :deep(.el-upload-list) {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    max-width: 100%;
    margin: 0;

    &:empty {
      display: none;
    }

    .el-upload-list__item {
      flex: 0 0 auto;
      width: auto;
      max-width: 100%;
      padding: 0;
      margin: 0;
      border: 0;
      border-radius: var(--el-border-radius-base);

      &:hover {
        background: none;
      }
    }
  }

  .upload-container {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--el-text-color-secondary);
    background-color: var(--color-box);
    border-color: var(--el-border-color);
    border-style: dashed;
    border-width: 1px;
    border-radius: 0.375rem;
    transition:
      color 300ms ease,
      background-color 300ms ease,
      border-color 300ms ease,
      box-shadow 300ms ease;

    .upload-prompt {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
      align-items: center;
      justify-content: center;
      width: 100%;
      padding: 4px;
      text-align: center;
    }

    &.has-resource-picker .upload-prompt {
      inset: 32px 0 0;
    }

    &.is-disabled {
      cursor: not-allowed;
      opacity: 0.65;
    }

    .upload-prompt__icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--el-color-primary);

      .art-svg-icon {
        font-size: 20px;
      }
    }

    .upload-prompt__title {
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 12px;
      line-height: 1.2;
      color: var(--el-text-color-regular);
      white-space: nowrap;
    }

    .preview-mask {
      position: absolute;
      z-index: 8;
      box-sizing: border-box;
      display: flex;
      column-gap: 6px;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      padding: 6px;
      border-radius: var(--el-border-radius-base);
      transition:
        opacity 300ms ease,
        background-color 300ms ease;

      .preview-action {
        --preview-action-focus-shadow: inset 0 0 0 2px
          color-mix(in srgb, var(--theme-color) 44%, transparent);

        display: inline-flex;
        flex: 0 0 32px;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        padding: 0;
        color: #fff;
        cursor: pointer;
        background: rgb(15 23 42 / 48%);
        border: 1px solid rgb(255 255 255 / 38%);
        border-radius: var(--art-control-radius);
        opacity: 0;
        transform: scale(0.92);
        transition:
          color 0.18s ease,
          background-color 0.18s ease,
          border-color 0.18s ease,
          opacity 0.18s ease,
          transform 0.18s ease;

        .art-svg-icon {
          font-size: 15px;
        }

        &:hover {
          background: color-mix(in srgb, var(--theme-color) 72%, rgb(15 23 42));
          border-color: color-mix(in srgb, var(--theme-color) 48%, white);
          transform: translateY(-1px) scale(1);
        }

        &:active {
          transform: translateY(0) scale(0.96);
        }

        &:focus-visible {
          outline: none;
          box-shadow: var(--preview-action-focus-shadow);
          opacity: 1;
          transform: scale(1);
        }
      }

      .preview-action--danger:hover,
      .preview-action--danger:focus-visible {
        background: var(--el-color-danger);
        border-color: color-mix(in srgb, var(--el-color-danger) 65%, white);
      }
    }

    .preview-mask:hover,
    .preview-mask:focus-within {
      background-color: rgb(15 23 42 / 52%);

      .preview-action {
        opacity: 1;
        transform: scale(1);
      }
    }

    .upload-state {
      display: flex;
      flex-direction: column;
      gap: 6px;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      padding: 8px;
      font-size: 12px;
      color: var(--el-text-color-secondary);
      text-align: center;

      > .art-svg-icon {
        font-size: 20px;
      }
    }

    .upload-state--loading {
      color: var(--el-color-primary);
      background-color: var(--el-fill-color-light);
    }

    .upload-state__spinner {
      font-size: 22px;
      animation: upload-spin 0.9s linear infinite;
    }

    .upload-state--error {
      color: var(--el-color-danger);
      background: var(--el-color-danger-light-9);
    }

    .upload-state__remove {
      padding: 2px 8px;
      font: inherit;
      color: var(--el-color-danger);
      cursor: pointer;
      background: color-mix(in srgb, var(--el-color-danger) 7%, var(--color-box));
      border: 1px solid color-mix(in srgb, var(--el-color-danger) 24%, transparent);
      border-radius: 999px;
      transition:
        color 0.18s ease,
        background-color 0.18s ease,
        border-color 0.18s ease,
        box-shadow 0.18s ease;

      &:hover {
        color: #fff;
        background: var(--el-color-danger);
        border-color: var(--el-color-danger);
      }

      &:focus-visible {
        outline: none;
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--el-color-danger) 24%, transparent);
      }
    }

    &:not(.is-disabled):hover {
      color: var(--el-color-primary);
      border-color: var(--el-color-primary);

      .upload-prompt__title {
        color: var(--el-color-primary);
      }
    }
  }

  :global(html[data-box-mode='shadow-mode'] .art-upload .preview-action) {
    --preview-action-focus-shadow: 0 0 0 3px color-mix(in srgb, var(--theme-color) 28%, transparent);

    border-color: transparent;
  }

  :global(html[data-box-mode='border-mode'] .art-upload .preview-action) {
    border-color: rgb(255 255 255 / 48%);
  }

  @keyframes upload-spin {
    from {
      transform: rotate(0deg);
    }

    to {
      transform: rotate(360deg);
    }
  }
</style>
