<template>
  <div
    class="art-upload-file"
    role="group"
    :aria-label="canPaste ? '附件上传区，按 Ctrl+V 或 ⌘V 粘贴文件' : undefined"
    :tabindex="canPaste ? 0 : undefined"
    :class="{
      'is-readonly': readonly,
      'is-disabled': uploadDisabled,
      'is-trigger-only': !showTip && !showFileList,
      'is-inline': inline && !showTip && !showFileList,
      'has-hover-effect': hoverEffect && !readonly
    }"
    @paste="handlePasteFiles"
  >
    <div
      v-if="!readonly"
      class="art-upload-file__controls"
      :class="{ 'has-resource-picker': canPickResource }"
    >
      <ElUpload
        ref="uploadRef"
        class="art-upload-file__local"
        v-model:file-list="fileList"
        :http-request="handleUpload"
        :before-upload="beforeUpload"
        :on-success="handleSuccess"
        :on-error="handleError"
        :on-exceed="handleExceed"
        :multiple="multiple"
        :limit="limit"
        :accept="accept"
        :disabled="uploadDisabled || uploading"
        :show-file-list="false"
        v-bind="$attrs"
      >
        <slot name="trigger" :uploading="uploading">
          <span
            class="art-upload-file__trigger"
            :class="{ 'is-disabled': uploadDisabled, 'is-loading': uploading }"
            :title="
              missingTenantTarget && !uploadRequest ? '请先在页头选择业务所属租户' : undefined
            "
          >
            <ArtSvgIcon
              :icon="uploading ? 'ri:loader-4-line' : 'ri:attachment-2'"
              :class="{ 'art-upload-file__spinner': uploading }"
              aria-hidden="true"
            />
            {{
              uploading ? '上传中…' : missingTenantTarget && !uploadRequest ? '先选择租户' : title
            }}
          </span>
        </slot>
      </ElUpload>
      <ElDropdown v-if="canPickResource" trigger="click" :disabled="uploadDisabled || uploading">
        <button
          type="button"
          class="art-upload-file__source-toggle"
          aria-label="更多附件来源"
          title="更多附件来源"
          :disabled="uploadDisabled || uploading"
        >
          <ArtSvgIcon icon="ri:arrow-down-s-line" aria-hidden="true" />
        </button>
        <template #dropdown>
          <ElDropdownMenu>
            <ElDropdownItem :disabled="pickerAtLimit" @click="resourcePickerVisible = true">
              <span class="art-icon-label whitespace-nowrap">
                <ArtSvgIcon icon="ri:folder-open-line" aria-hidden="true" />
                <span>从资源库选择</span>
              </span>
            </ElDropdownItem>
          </ElDropdownMenu>
        </template>
      </ElDropdown>
    </div>
    <div v-if="!readonly && showTip" class="art-upload-file__tip">
      <slot name="tip">{{ resolvedTip }}</slot>
      <span v-if="canPaste" class="art-upload-file__paste-tip">
        点击上传区域后按 <kbd>Ctrl+V</kbd>（Mac 为 <kbd>⌘V</kbd>）粘贴文件
      </span>
    </div>

    <ul v-if="showFileList && fileList.length" class="art-upload-file__list">
      <li
        v-for="(file, index) in fileList"
        :key="file.uid ?? file.url ?? `${file.name}-${index}`"
        class="art-upload-file__item"
      >
        <div class="art-upload-file__identity">
          <ArtSvgIcon
            :icon="file.status === 'uploading' ? 'ri:loader-4-line' : 'ri:file-line'"
            :class="{ 'art-upload-file__spinner': file.status === 'uploading' }"
            aria-hidden="true"
          />
          <ArtAttachmentLink v-if="file.url" :file="getFileTarget(file)" />
          <span v-else class="art-upload-file__pending-name">{{ file.name }}</span>
        </div>

        <div class="art-upload-file__actions">
          <ArtIconButton
            class="art-upload-file__action"
            icon="ri:download-2-line"
            label="下载附件"
            :disabled="!file.url"
            @click.stop="handleDownload(file)"
          />
          <ArtIconButton
            class="art-upload-file__action"
            icon="ri:eye-line"
            label="查看附件"
            :disabled="!file.url"
            @click.stop="handlePreview(file)"
          />
          <ArtIconButton
            v-if="!readonly"
            class="art-upload-file__action"
            icon="ri:delete-bin-2-line"
            label="删除附件"
            tone="danger"
            @click.stop="handleRemoveFile(file)"
          />
        </div>
      </li>
    </ul>

    <ArtResourcePicker
      v-if="canPickResource && !readonly"
      v-model:visible="resourcePickerVisible"
      title="从资源管理器选择文件"
      :resource-tenant-id="props.resourceTenantId"
      :multiple="multiple"
      :limit="multiple ? Math.max(limit - fileList.length, 0) : 1"
      @confirm="handleResourceConfirm"
    />
  </div>
</template>

<script setup lang="ts">
  import { uniqBy } from 'lodash-es'
  import type {
    UploadFile,
    UploadInstance,
    UploadRequestOptions,
    UploadUserFile
  } from 'element-plus'
  import { ElMessage, genFileId } from 'element-plus'
  import { uploadAttachment } from '@/api/attachments'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtResourcePicker from '@/components/core/forms/art-resource-picker/index.vue'
  import type { Resource } from '@/components/core/forms/art-resource-picker/type'
  import {
    normalizeUploadModelUrls,
    shouldSyncUploadFileList
  } from '@/components/core/forms/upload-model-utils'
  import ArtAttachmentLink from '@/components/core/media/art-file-viewer/attachment-link.vue'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import { downloadAttachment, getFileExtension, viewAttachment } from '@/utils/file'
  import { isAcceptedFileType } from '@/utils/file/accept'
  import { formatSize } from '@/utils/file/format-size'
  import { createNamedClipboardFile, getClipboardFiles } from '@/utils/file/clipboard'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'

  defineOptions({ name: 'ArtUploadFile', inheritAttrs: false })

  const props = withDefaults(
    defineProps<{
      modelValue?: string | string[] | null
      title?: string
      tip?: string
      accept?: string
      fileSize?: number
      limit?: number
      multiple?: boolean
      readonly?: boolean
      disabled?: boolean
      showFileList?: boolean
      showTip?: boolean
      showResourcePicker?: boolean
      hoverEffect?: boolean
      inline?: boolean
      resourceTenantId?: string
      fileName?: string
      uploadRequest?: (file: File) => Promise<Api.DataCenter.Resources.ResourceListItem[]>
    }>(),
    {
      modelValue: null,
      title: '选择附件',
      tip: '',
      accept: '',
      fileSize: 20 * 1024 * 1024,
      limit: 1,
      multiple: false,
      readonly: false,
      disabled: false,
      showFileList: true,
      showTip: true,
      showResourcePicker: true,
      hoverEffect: true,
      inline: false,
      resourceTenantId: '',
      fileName: ''
    }
  )

  const emit = defineEmits<{
    (event: 'update:modelValue', value: string | string[]): void
    (event: 'resource-change', value: Api.DataCenter.Resources.ResourceListItem[]): void
    (
      event: 'upload-success',
      value: Api.DataCenter.Resources.ResourceListItem,
      file: UploadFile
    ): void
  }>()

  const fileList = ref<UploadUserFile[]>([])
  const lastSyncedModelUrls = ref<string[]>([])
  const uploadRef = ref<UploadInstance>()
  const activeUploads = ref(0)
  const uploading = computed(() => activeUploads.value > 0)
  const resourcePickerVisible = ref(false)
  const tenantScopeStore = useTenantScopeStore()
  const missingTenantTarget = computed(
    () => tenantScopeStore.isAllTenants && !props.resourceTenantId.trim()
  )
  const uploadDisabled = computed(
    () => props.disabled || (missingTenantTarget.value && !props.uploadRequest)
  )
  const canPickResource = computed(
    () => props.showResourcePicker && !missingTenantTarget.value && !props.disabled
  )
  const canPaste = computed(() => !props.readonly && !uploadDisabled.value)
  const pickerAtLimit = computed(() => props.multiple && fileList.value.length >= props.limit)
  const resolvedTip = computed(
    () =>
      (missingTenantTarget.value && !props.uploadRequest
        ? '请先在页头选择业务所属租户'
        : props.tip) ||
      `单个文件不超过 ${formatSize(props.fileSize, { precision: 1, trimZeros: true })}`
  )

  watch(canPickResource, (allowed) => {
    if (!allowed) {
      resourcePickerVisible.value = false
    }
  })

  watch(
    () => [props.modelValue, props.fileName] as const,
    ([value, fileName]) => {
      if (shouldSyncUploadFileList(value, lastSyncedModelUrls.value)) {
        const urls = normalizeUploadModelUrls(value)
        lastSyncedModelUrls.value = urls
        fileList.value = urls.map((url) => ({
          name: decodeURIComponent(url.split('/').pop() || '附件'),
          url
        }))
      }
      if (!props.multiple && fileName?.trim() && fileList.value[0]) {
        fileList.value[0].name = fileName.trim()
      }
    },
    { immediate: true, deep: true }
  )

  const updateModelValue = (): void => {
    const value = props.multiple
      ? fileList.value.flatMap((file) => (file.url ? [file.url] : []))
      : (fileList.value[0]?.url ?? '')
    lastSyncedModelUrls.value = normalizeUploadModelUrls(value)
    emit('update:modelValue', value)
  }

  const beforeUpload = (file: File): boolean => {
    if (uploadDisabled.value) return false
    if (!isAcceptedFileType(file, props.accept)) {
      ElMessage.warning('文件格式不符合当前上传要求')
      return false
    }
    if (file.size <= props.fileSize) return true
    ElMessage.error(
      `单个文件不能超过 ${formatSize(props.fileSize, { precision: 1, trimZeros: true })}`
    )
    return false
  }

  const handleUpload = async (options: UploadRequestOptions): Promise<unknown> => {
    activeUploads.value += 1
    try {
      return await (props.uploadRequest?.(options.file) ??
        uploadAttachment(options.file, { targetTenantId: props.resourceTenantId || undefined }))
    } finally {
      activeUploads.value -= 1
    }
  }

  const handlePasteFiles = async (event: ClipboardEvent): Promise<void> => {
    if (!canPaste.value) return
    const sourceFiles = getClipboardFiles(event.clipboardData)
    if (!sourceFiles.length) return

    event.preventDefault()
    if (uploading.value) {
      ElMessage.warning('文件正在上传，请稍后再粘贴')
      return
    }
    if (props.limit && fileList.value.length + sourceFiles.length > props.limit) {
      handleExceed()
      return
    }

    const files = props.multiple ? sourceFiles : sourceFiles.slice(0, 1)
    files.forEach((file, index) => {
      const namedFile = createNamedClipboardFile(file, index, files.length)
      uploadRef.value?.handleStart(Object.assign(namedFile, { uid: genFileId() }))
    })
    await nextTick()
    uploadRef.value?.submit()
  }

  const clearEventOnlyUploadsIfSettled = (): void => {
    if (props.showFileList || props.modelValue != null) return
    if (fileList.value.some((file) => file.status === 'ready' || file.status === 'uploading'))
      return
    fileList.value = []
  }

  const handleSuccess = (response: unknown, uploadFile: UploadFile): void => {
    const resource = Array.isArray(response)
      ? (response[0] as Api.DataCenter.Resources.ResourceListItem | undefined)
      : undefined
    if (!resource?.url) {
      uploadFile.status = 'fail'
      handleError(new Error('附件上传未返回访问地址'))
      return
    }

    const target = fileList.value.find((file) => file.uid === uploadFile.uid)
    if (target) {
      target.url = resource.url
      target.name = resource.originName || uploadFile.name
    }
    updateModelValue()
    emit('resource-change', [resource])
    emit('upload-success', resource, uploadFile)

    clearEventOnlyUploadsIfSettled()
  }

  const handleResourceConfirm = (selected: Resource[]): void => {
    if (!canPickResource.value || uploadDisabled.value) return
    const resources = selected.filter((resource) => Boolean(resource.url?.trim()))
    if (!resources.length) {
      ElMessage.warning('请选择有可访问地址的文件')
      return
    }
    if (
      props.resourceTenantId &&
      resources.some((resource) => resource.tenantId !== props.resourceTenantId)
    ) {
      ElMessage.warning('所选文件不属于当前目标租户，请重新选择')
      return
    }
    if (
      resources.some(
        (resource) =>
          !isAcceptedFileType(
            {
              name: resource.originName || resource.objectName || `附件.${resource.suffix || ''}`,
              type: resource.mimeType || ''
            },
            props.accept
          )
      )
    ) {
      ElMessage.warning('所选文件格式不符合当前上传要求')
      return
    }

    const chosenFiles: UploadUserFile[] = resources.map((resource) => ({
      name: resource.originName || resource.objectName || '资源文件',
      url: resource.url
    }))
    const nextFiles = props.multiple
      ? uniqBy([...fileList.value, ...chosenFiles], (file) => file.url || file.uid)
      : chosenFiles.slice(0, 1)
    if (nextFiles.length > props.limit) {
      ElMessage.warning(`当前最多只能关联 ${props.limit} 个文件`)
      return
    }

    fileList.value = nextFiles
    updateModelValue()
    emit('resource-change', resources)
    clearEventOnlyUploadsIfSettled()
  }

  const getFileTarget = (file: UploadUserFile) => ({
    name: file.name,
    url: file.url,
    fileType: getFileExtension(file.name)
  })

  const handleDownload = (file: UploadUserFile): void => {
    if (!file.url) return
    downloadAttachment(getFileTarget(file))
  }

  const handlePreview = (file: UploadUserFile): void => {
    if (!file.url) return
    viewAttachment(getFileTarget(file))
  }

  const handleRemoveFile = (file: UploadUserFile): void => {
    const fileIndex = fileList.value.findIndex(
      (item) =>
        item === file ||
        (file.uid !== undefined && item.uid === file.uid) ||
        (Boolean(file.url) && item.url === file.url)
    )
    if (fileIndex < 0) return
    fileList.value.splice(fileIndex, 1)
    updateModelValue()
  }

  const handleExceed = (): void => {
    ElMessage.warning(`当前最多只能上传 ${props.limit} 个文件`)
  }

  const handleError = (error?: unknown): void => {
    clearEventOnlyUploadsIfSettled()
    ElMessage.error(getFriendlySupabaseErrorMessage(error, '附件上传失败，请重试'))
  }

  defineExpose({
    hasPendingUpload: () =>
      uploading.value || fileList.value.some((file) => !file.url && file.status !== 'fail')
  })
</script>

<style scoped lang="scss">
  .art-upload-file {
    width: 100%;

    &:focus-visible {
      outline: 2px solid color-mix(in srgb, var(--theme-color) 36%, transparent);
      outline-offset: 2px;
    }

    &.is-trigger-only {
      width: fit-content;
      max-width: 100%;
    }

    &:not(.is-readonly) {
      padding: var(--art-space-3);
      background: var(--el-bg-color);
      border: 1px dashed var(--el-border-color);
      border-radius: var(--el-border-radius-base);
    }

    &.is-inline:not(.is-readonly) {
      padding: 0;
      background: transparent;
      border: 0;
    }

    &:not(.is-readonly):focus-within {
      border-color: var(--theme-color);
    }

    &.has-hover-effect:not(.is-disabled) {
      transition: border-color var(--art-motion-duration-fast) var(--art-motion-ease-out);

      &:hover {
        border-color: var(--theme-color);
      }
    }

    &__controls {
      display: inline-flex;
      gap: 0;
      align-items: center;
      max-width: 100%;
    }

    &__local {
      display: flex;
      align-items: center;
      width: auto !important;
      max-width: 100%;
    }

    &__controls {
      :deep(.el-dropdown),
      :deep(.el-upload) {
        display: flex;
        align-items: center;
      }
    }

    &__controls.has-resource-picker {
      :deep(.art-upload-file__trigger) {
        border-top-right-radius: 0;
        border-bottom-right-radius: 0;
      }
    }

    &__source-toggle {
      box-sizing: border-box;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 34px;
      padding: 0;
      color: var(--el-color-primary);
      cursor: pointer;
      background: color-mix(in srgb, var(--el-color-primary) 4%, var(--el-bg-color));
      border: 1px solid color-mix(in srgb, var(--el-color-primary) 62%, transparent);
      border-left: 0;
      border-radius: 0 var(--el-border-radius-base) var(--el-border-radius-base) 0;
      transition: background-color 160ms ease;

      &:hover {
        background: var(--el-color-primary-light-9);
      }

      &:focus-visible {
        outline: 2px solid var(--el-color-primary);
        outline-offset: 2px;
      }

      &:disabled {
        color: var(--el-text-color-disabled);
        cursor: not-allowed;
      }
    }

    &__trigger {
      box-sizing: border-box;
      display: inline-flex;
      gap: 7px;
      align-items: center;
      justify-content: center;
      height: 34px;
      min-height: 34px;
      padding: 0 15px;
      font-family: inherit;
      font-size: 14px;
      color: var(--el-color-primary);
      white-space: nowrap;
      cursor: pointer;
      background: color-mix(in srgb, var(--el-color-primary) 4%, var(--el-bg-color));
      border: 1px solid color-mix(in srgb, var(--el-color-primary) 62%, transparent);
      border-radius: var(--el-border-radius-base);
      transition:
        color 160ms ease,
        background-color 160ms ease,
        border-color 160ms ease,
        box-shadow 160ms ease;

      &:hover {
        color: var(--el-color-primary-light-3);
        background: color-mix(in srgb, var(--el-color-primary) 9%, var(--el-bg-color));
        border-color: var(--el-color-primary);
      }

      &:focus-visible {
        outline: 2px solid color-mix(in srgb, var(--el-color-primary) 36%, transparent);
        outline-offset: 2px;
      }

      &.is-disabled,
      &:disabled {
        color: var(--el-text-color-disabled);
        cursor: not-allowed;
        background: var(--el-fill-color-light);
        border-color: var(--el-border-color-light);
      }
    }

    &__tip {
      margin-top: 7px;
      font-size: 12px;
      line-height: 1.55;
      color: var(--el-text-color-secondary);
    }

    &__paste-tip {
      display: inline-block;
      margin-left: var(--art-space-2);

      kbd {
        font-family: inherit;
        font-weight: 600;
        color: var(--el-text-color-primary);
      }
    }

    &__spinner {
      animation: art-upload-file-spin 0.9s linear infinite;
    }

    &__list {
      display: grid;
      gap: 4px;
      padding: 0;
      margin-top: 12px;
      margin-bottom: 0;
      list-style: none;
    }

    &__item {
      display: flex;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      min-width: 0;
      min-height: 36px;
      padding: 2px 4px 2px 10px;
      background: var(--el-fill-color-lighter);
      border-radius: var(--el-border-radius-base);
    }

    &__identity {
      display: flex;
      flex: 1;
      gap: 7px;
      align-items: center;
      min-width: 0;
      color: var(--el-text-color-secondary);

      > .art-svg-icon {
        flex: 0 0 auto;
        font-size: 14px;
      }

      :deep(.art-attachment-link) {
        display: inline-flex;
        align-items: center;
        min-height: 28px;
      }
    }

    &__actions {
      display: inline-flex;
      flex: 0 0 auto;
      gap: 2px;
      align-items: center;
    }

    &__pending-name {
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--el-text-color-secondary);
      white-space: nowrap;
    }

    &__action {
      width: 28px !important;
      height: 28px !important;
      font-size: 15px !important;
    }

    &.is-readonly {
      :deep(.el-upload) {
        display: none;
      }

      .art-upload-file__list {
        margin-top: 0;
      }
    }
  }

  @keyframes art-upload-file-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .art-upload-file__spinner {
      animation: none;
    }
  }
</style>
