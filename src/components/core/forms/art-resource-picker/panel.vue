<template>
  <div class="resource-panel h-full flex flex-col">
    <div class="flex flex-col justify-between gap-y-1 md:flex-row">
      <div>
        <el-segmented
          v-model="segment.active"
          :options="segment.options"
          size="default"
          block
          @change="handleFileTypesChange"
        >
          <template #default="{ item }">
            <div class="art-icon-label">
              <ArtSvgIcon :icon="item!.icon" aria-hidden="true" />
              <span>{{ typeof item.label === 'function' ? item.label() : item.label }}</span>
            </div>
          </template>
        </el-segmented>
      </div>
      <div class="flex flex-wrap items-center justify-end gap-2">
        <el-input
          v-model="queryParams.originName"
          placeholder="搜索此分类下的资源"
          clearable
          class="w-full md:w-[180px]"
          @input="searchResources"
        >
          <template #suffix>
            <ArtSvgIcon icon="ri-search-line" />
          </template>
        </el-input>
      </div>
    </div>

    <button
      v-if="props.showPasteUpload"
      type="button"
      class="resource-paste-zone"
      :class="{ 'is-uploading': uploading }"
      :disabled="uploading || !activeUploadTenantId"
      aria-label="粘贴剪贴板文件并上传"
      @paste="handlePasteFiles"
    >
      <span class="resource-paste-zone__icon" aria-hidden="true">
        <ArtSvgIcon :icon="pasteZoneIcon" />
      </span>
      <span class="resource-paste-zone__content">
        <strong>{{ uploading ? '文件上传中' : '粘贴文件上传' }}</strong>
        <span>
          {{
            uploading
              ? '正在保存剪贴板文件，请稍候'
              : '支持图片、文档和音视频；点击此框后按 Ctrl+V（macOS 为 ⌘V）'
          }}
        </span>
      </span>
      <div
        v-if="uploadProgress.visible"
        class="resource-paste-zone__progress"
        role="status"
        aria-live="polite"
      >
        <div class="resource-paste-zone__progress-copy">
          <strong>{{ uploadProgressLabel }}</strong>
          <span :title="uploadProgressDetail">{{ uploadProgressDetail }}</span>
          <small> 已处理 {{ uploadProgress.processed }}/{{ uploadProgress.total }} 个文件 </small>
        </div>
        <el-progress
          type="circle"
          :percentage="uploadProgressPercentage"
          :width="52"
          :stroke-width="5"
          :status="uploadProgressStatus"
        />
      </div>
      <kbd v-else class="resource-paste-zone__shortcut">Ctrl V</kbd>
    </button>

    <div class="mt-2 min-h-0 flex-1">
      <component :is="resourceListContainer" v-if="loading || resources.length">
        <div class="flex flex-wrap px-[2px] pt-[2px]">
          <el-space fill wrap :fill-ratio="9">
            <template v-for="resource in resources" :key="resource.id">
              <div
                class="resource-item"
                :class="{ active: isSelected(resource) }"
                @contextmenu.prevent="(e: MouseEvent) => executeContextmenu(e, resource)"
              >
                <div class="resource-item__cover">
                  <ResourceMediaCover
                    :resource="resource"
                    :playing="playingResourceKey === getResourcePlaybackKey(resource)"
                    @toggle-play="toggleMediaPlayback(resource)"
                    @playback-state-change="handleMediaPlaybackChange(resource, $event)"
                  />
                </div>
                <div class="resource-item__name cursor-default" :title="resource.originName">
                  {{ resource.originName }}
                </div>
                <button
                  type="button"
                  class="resource-item__select-surface"
                  :aria-pressed="isSelected(resource)"
                  :aria-label="`选择资源 ${resource.originName}`"
                  @click="handleClick(resource)"
                  @dblclick="handleDbClick(resource)"
                />
                <div class="resource-item__selected">
                  <ArtSvgIcon icon="ri-checkbox-circle-fill" class="resource-item__selected-icon" />
                </div>
              </div>
            </template>
            <template v-if="resources.length === 0">
              <el-skeleton
                v-for="i in skeletonNum"
                :key="i"
                class="resource-skeleton relative"
                animated
              >
                <template #template>
                  <el-skeleton-item class="absolute !h-full w-full" variant="rect" />
                </template>
              </el-skeleton>
            </template>
            <div v-for="i in 10" :key="i" class="resource-placeholder" />
          </el-space>
        </div>
      </component>
      <div v-else class="h-full w-full flex flex-1 items-center justify-center">
        <ArtEmptyState
          :title="loadError ? '资源加载失败' : '暂无可用资源'"
          :description="
            loadError ? '请检查网络后重新加载' : '可以切换资源类型，或尝试更换搜索关键词'
          "
          size="compact"
          :visual-size="76"
        >
          <el-button v-if="loadError" type="primary" plain @click="handleGetResourceList">
            重新加载
          </el-button>
        </ArtEmptyState>
      </div>

      <!-- 右键菜单组件 -->
      <ArtMenuRight
        ref="menuRef"
        :menu-items="menu.items"
        :menu-width="180"
        :submenu-width="140"
        :border-radius="10"
        @select="menu.handleSelect"
      />
    </div>

    <Teleport :to="props.footerTarget ?? 'body'" :disabled="!props.footerTarget">
      <div class="resource-panel resource-panel__footer-shell">
        <div class="resource-panel__footer flex justify-between">
          <div class="resource-panel__pagination flex items-center">
            <el-tag
              v-if="props.multiple && props.limit"
              size="large"
              class="mr-2"
              :class="{
                'color-[var(--el-color-danger)]': props.limit && selectedKeys.length >= props.limit
              }"
            >
              {{ selectedKeys.length }}
              <template v-if="props.multiple && props.limit"> /{{ props.limit }} </template>
            </el-tag>
            <el-pagination
              v-model:current-page="queryParams.page"
              :disabled="loading"
              :total="queryParams.total"
              :page-size="queryParams.pageSize"
              background
              layout="prev, pager, next"
              :pager-count="5"
              @change="handleGetResourceList"
            />
          </div>
          <div v-if="props.showAction" class="resource-panel__actions">
            <slot name="actions">
              <el-button @click="cancel">取消</el-button>
              <el-button type="primary" @click="confirm">确认</el-button>
            </slot>
          </div>
        </div>

        <div class="resource-dock" aria-label="资源上传入口">
          <template v-for="(btn, index) in resourceStore.getAllButton()" :key="btn.name">
            <div class="res-app-container">
              <input
                :ref="(element) => setFileInputRef(btn.name, element)"
                type="file"
                :name="btn.name"
                class="hidden"
                v-bind="btn.uploadConfig ?? {}"
                @change="handleFile($event, btn)"
              />
              <ArtTooltip
                :content="activeUploadTenantId ? btn.label : '当前账号缺少租户信息'"
                placement="top"
                :show-after="300"
                :offset="10"
              >
                <button
                  type="button"
                  class="res-app"
                  :class="getDockEffectClass(index)"
                  :disabled="uploading || !activeUploadTenantId"
                  :aria-label="btn.label"
                  @click="handleUploadButtonClick(btn)"
                  @mouseenter="hoveredDockIndex = index"
                  @mouseleave="hoveredDockIndex = undefined"
                >
                  <span class="res-app-icon" aria-hidden="true">
                    <ArtSvgIcon :icon="btn.icon" />
                  </span>
                </button>
              </ArtTooltip>
            </div>
          </template>
        </div>
      </div>
    </Teleport>
    <MasterDataDeleteGuard ref="deleteGuardRef" @cleared="handleGetResourceList" />
  </div>
</template>

<script setup lang="ts">
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ResourceMediaCover from './resource-media-cover.vue'
  import type { FileType, Resource, ResourcePanelProps } from './type.ts'
  import ArtMenuRight from '@/components/core/others/art-menu-right/index.vue'
  import type { MenuItemType } from '@/components/core/others/art-menu-right/index.vue'
  import { ElMessage, ElScrollbar } from 'element-plus'
  import { deleteResource, fetchResourceList, renameResource } from '@/api/data-center'
  import useResourceStore from '@/store/modules/resource'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { useUserStore } from '@/store/modules/user'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import { formatSize, viewAttachment } from '@/utils/file'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import {
    copyTextToClipboard,
    createNamedClipboardFile,
    getClipboardFiles
  } from '@/utils/file/clipboard'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import { useDebounceFn, useTimeoutFn } from '@vueuse/core'
  import MasterDataDeleteGuard, {
    type MasterDataDeleteGuardOpenOptions
  } from '@/components/business/master-data-delete-guard/index.vue'

  defineOptions({ name: 'ArtResourcePanel' })

  const props = withDefaults(defineProps<ResourcePanelProps>(), {
    multiple: false,
    limit: undefined,
    internalScroll: true,
    showAction: true,
    showCopyActions: false,
    showPasteUpload: false,
    showRenameAction: false,
    pageSize: 30,
    dbClickConfirm: false
  })

  const emit = defineEmits<{
    (e: 'cancel'): void
    (e: 'confirm', value: Resource[]): void
  }>()

  const modelValue = defineModel<string | string[] | undefined>()

  const resourceStore = useResourceStore()
  const tenantScopeStore = useTenantScopeStore()
  const userStore = useUserStore()
  const activeUploadTenantId = computed(
    () =>
      props.resourceTenantId ||
      tenantScopeStore.effectiveTenantId ||
      userStore.getUserInfo.tenantId ||
      ''
  )
  const readTenantId = computed(
    () => props.resourceTenantId || tenantScopeStore.effectiveTenantId || undefined
  )
  const { confirmDelete, promptText } = useArtFeedback()
  interface MasterDataDeleteGuardExpose {
    inspect: (options: MasterDataDeleteGuardOpenOptions) => Promise<boolean>
  }
  const deleteGuardRef = ref<MasterDataDeleteGuardExpose>()

  const menuRef = ref<InstanceType<typeof ArtMenuRight>>()

  const segment = ref({
    active: props.defaultFileType ?? '',
    options: [
      { label: () => '所有', value: '', icon: 'ri:gallery-view-2', suffix: '' },
      {
        label: () => '图片',
        value: 'image',
        icon: 'ri:image-line',
        suffix: 'png,jpg,jpeg,gif,bmp,webp'
      },
      {
        label: () => '视频',
        value: 'video',
        icon: 'ri:folder-video-line',
        suffix: 'mp4,avi,wmv,mov,flv,mkv,webm'
      },
      {
        label: () => '音频',
        value: 'audio',
        icon: 'ri:file-music-line',
        suffix: 'mp3,wav,ogg,wma,aac,flac,ape,wavpack'
      },
      {
        label: () => '文档',
        value: 'document',
        icon: 'ri:file-text-line',
        suffix: 'doc,docx,xls,xlsx,ppt,pptx,pdf'
      }
    ] as FileType[]
  })

  /**
   * 查询参数
   */
  interface ResourceQueryParams {
    page: number
    pageSize: number
    total: number
    originName: string
    suffix: string
  }

  interface UploadProgressState extends Api.DataCenter.Resources.UploadProgress {
    visible: boolean
    percentage: number
    totalBytes: number
    currentFileName: string
  }

  const createUploadProgressState = (): UploadProgressState => ({
    visible: false,
    percentage: 0,
    phase: 'preparing',
    processed: 0,
    succeeded: 0,
    failed: 0,
    total: 0,
    totalBytes: 0,
    currentFileName: ''
  })

  const queryParams = ref<ResourceQueryParams>({
    page: 1,
    pageSize: props.pageSize,
    total: 0,
    originName: '',
    suffix: ''
  })
  let resourceRequestId = 0
  const searchResources = useDebounceFn(() => {
    queryParams.value.page = 1
    void handleGetResourceList()
  }, 250)

  const fileInputRefs = new Map<string, HTMLInputElement>()
  const hoveredDockIndex = ref<number>()

  /**
   * 当前资源列表
   */
  // 资源卡片只整体替换列表，避免为大量只读资源记录创建深层响应式代理。
  const resources = shallowRef<Resource[]>([])
  const loadError = ref(false)
  const playingResourceKey = ref<string>()

  /**
   * 选中资源的key列表,该数据可用做直接返回
   */
  const selectedKeys = ref<Array<string | number>>([])

  const returnType = 'url'
  const selected = ref<Resource[]>([])

  const loading = ref(false)
  const uploading = ref(false)
  const uploadProgress = reactive<UploadProgressState>(createUploadProgressState())
  const uploadProgressPercentage = computed(() => uploadProgress.percentage)
  const uploadProgressStatus = computed<'success' | 'exception' | undefined>(() => {
    if (uploadProgress.phase === 'completed') return 'success'
    if (uploadProgress.phase === 'failed') return 'exception'
    return undefined
  })
  const uploadProgressLabel = computed(() => {
    const labels: Record<Api.DataCenter.Resources.UploadPhase, string> = {
      preparing: '正在准备文件',
      hashing: '正在校验文件',
      checking: '正在检查重复项',
      uploading: '正在上传资源',
      saving: '正在保存附件记录',
      processing: '正在处理上传队列',
      completed: '上传已完成',
      failed: uploadProgress.succeeded ? '部分文件上传失败' : '上传失败'
    }
    return labels[uploadProgress.phase]
  })
  const uploadProgressDetail = computed(() => {
    if (uploadProgress.phase === 'completed') {
      return `${uploadProgress.succeeded} 个文件 · ${formatSize(uploadProgress.totalBytes)}`
    }
    if (uploadProgress.phase === 'failed') {
      return `${uploadProgress.succeeded} 个成功，${uploadProgress.failed} 个失败`
    }
    return uploadProgress.currentFileName || `${formatSize(uploadProgress.totalBytes)} 待上传`
  })
  const pasteZoneIcon = computed(() => {
    if (uploading.value) return 'ri-loader-4-line'
    if (uploadProgress.phase === 'completed' && uploadProgress.visible) {
      return 'ri-checkbox-circle-line'
    }
    if (uploadProgress.phase === 'failed' && uploadProgress.visible) return 'ri-error-warning-line'
    return 'ri-clipboard-line'
  })
  const { start: scheduleProgressReset, stop: cancelProgressReset } = useTimeoutFn(
    () => Object.assign(uploadProgress, createUploadProgressState()),
    3200,
    { immediate: false }
  )
  const resourceListContainer = computed(() => (props.internalScroll ? ElScrollbar : 'div'))

  const menu = ref({
    resource: {} as Resource,
    items: computed((): MenuItemType[] => {
      const resource = menu.value.resource
      const copyItems: MenuItemType[] = []

      if (props.showCopyActions) {
        copyItems.push({
          key: 'copyLink',
          label: '复制链接',
          icon: 'ri-link',
          disabled: !resource.url
        })
        if (isImageResource(resource)) {
          copyItems.push({
            key: 'copyImage',
            label: '复制图片',
            icon: 'ri-image-line'
          })
        }
        if (!props.showRenameAction) {
          const lastCopyItem = copyItems.at(-1)
          if (lastCopyItem) lastCopyItem.showLine = true
        }
      }

      return [
        !isSelected(resource)
          ? {
              key: 'select',
              label: '选中',
              icon: 'ri-check-fill'
            }
          : {
              key: 'deselect',
              label: '取消选中',
              icon: 'ri-close-fill'
            },
        {
          key: 'singleSelect',
          label: '独立此项',
          icon: 'ri-checkbox-circle-line',
          showLine: true
        },
        {
          key: 'view',
          label: '查看',
          icon: 'ri-eye-line',
          disabled: !canPreview(resource)
        },
        ...(isPlayableMediaResource(resource)
          ? [
              {
                key:
                  playingResourceKey.value === getResourcePlaybackKey(resource)
                    ? 'pauseMedia'
                    : 'playMedia',
                label:
                  playingResourceKey.value === getResourcePlaybackKey(resource)
                    ? isVideoResource(resource)
                      ? '暂停视频'
                      : '暂停音频'
                    : isVideoResource(resource)
                      ? '播放视频'
                      : '播放音频',
                icon:
                  playingResourceKey.value === getResourcePlaybackKey(resource)
                    ? 'ri-pause-circle-line'
                    : 'ri-play-circle-line'
              }
            ]
          : []),
        ...copyItems,
        ...(props.showRenameAction
          ? [
              {
                key: 'rename',
                label: '重命名',
                icon: 'ri-edit-line',
                showLine: true,
                disabled: !resource.id
              }
            ]
          : []),
        {
          key: 'delete',
          label: '删除',
          icon: 'ri-delete-bin-2-line'
        }
      ]
    }),
    handleSelect(item: MenuItemType) {
      const { resource } = menu.value
      if (item.key === 'select') {
        select(resource)
      }
      if (item.key === 'deselect') {
        unSelect(resource)
      }
      if (item.key === 'singleSelect') {
        clearSelected()
        select(resource)
      }
      if (item.key === 'view') {
        viewAttachment({
          name: resource.originName,
          url: resource.url,
          fileType: resource.suffix
        })
      }
      if (item.key === 'playMedia') {
        playingResourceKey.value = getResourcePlaybackKey(resource)
      }
      if (item.key === 'pauseMedia') {
        playingResourceKey.value = undefined
      }
      if (item.key === 'copyLink') {
        void handleCopyLink(resource)
      }
      if (item.key === 'copyImage') {
        void handleCopyImage(resource)
      }
      if (item.key === 'rename') {
        void handleRename(resource)
      }
      if (item.key === 'delete') {
        if (resource?.id) {
          void handleDelete(resource)
        }
      }
    }
  })

  // 监听v-model变化，更新selectedKeys
  watch(
    () => modelValue.value,
    (newValue) => {
      selectedKeys.value = Array.isArray(newValue) ? newValue : newValue ? [newValue] : []
    },
    { deep: true, immediate: true }
  )

  // 监听selectedKeys变化，更新v-model
  watch(
    () => selectedKeys.value,
    (newKeys) => {
      const newValue = props.multiple ? [...newKeys] : newKeys[0]
      if (props.multiple) {
        const currentValue = Array.isArray(modelValue.value)
          ? modelValue.value
          : modelValue.value
            ? [modelValue.value]
            : []
        const isSame =
          currentValue.length === newKeys.length &&
          currentValue.every((key, index) => key === newKeys[index])
        if (!isSame) {
          modelValue.value = newValue as string[]
        }
        return
      }

      if (modelValue.value !== newValue) {
        modelValue.value = newValue as string | undefined
      }
    },
    { deep: true }
  )

  /**
   * 加载占位符数量
   */
  const skeletonNum = computed(() => {
    return loading.value ? queryParams.value.pageSize : 30
  })

  /**
   * 右键菜单
   */
  function executeContextmenu(e: MouseEvent, resource: Resource) {
    e.preventDefault()
    e.stopPropagation()
    menu.value.resource = resource
    nextTick(() => {
      menuRef.value?.show(e)
    })
  }

  /**
   * 判断是否能预览
   * @param resource
   */
  function canPreview(resource: Resource) {
    return Boolean(resource?.url)
  }

  function isImageResource(resource: Resource): boolean {
    if (resource.mimeType?.toLowerCase().startsWith('image/')) return true
    return /^(bmp|gif|jpe?g|png|webp)$/i.test(resource.suffix?.trim() ?? '')
  }

  function isVideoResource(resource: Resource): boolean {
    if (resource.mimeType?.toLowerCase().startsWith('video/')) return true
    return /^(avi|flv|mkv|mov|mp4|webm|wmv)$/i.test(resource.suffix?.trim() ?? '')
  }

  function isAudioResource(resource: Resource): boolean {
    if (resource.mimeType?.toLowerCase().startsWith('audio/')) return true
    return /^(aac|ape|flac|m4a|mp3|ogg|wav|wavpack|wma)$/i.test(resource.suffix?.trim() ?? '')
  }

  function isPlayableMediaResource(resource: Resource): boolean {
    return Boolean(resource.url && (isVideoResource(resource) || isAudioResource(resource)))
  }

  function getResourcePlaybackKey(resource: Resource): string {
    return String(resource.id || resource.url || '')
  }

  function toggleMediaPlayback(resource: Resource): void {
    if (!isPlayableMediaResource(resource)) return
    const key = getResourcePlaybackKey(resource)
    playingResourceKey.value = playingResourceKey.value === key ? undefined : key
  }

  function handleMediaPlaybackChange(resource: Resource, playing: boolean): void {
    const key = getResourcePlaybackKey(resource)
    if (playing) {
      playingResourceKey.value = key
      return
    }
    if (playingResourceKey.value === key) playingResourceKey.value = undefined
  }

  async function handleCopyLink(resource: Resource): Promise<void> {
    const url = resource.url?.trim()
    if (!url) {
      ElMessage.warning('当前资源没有可复制的访问链接')
      return
    }

    try {
      await copyTextToClipboard(url, { legacyFallback: true })
      ElMessage.success('资源链接已复制，可粘贴到浏览器或消息中')
    } catch {
      ElMessage.error('链接复制失败，请检查浏览器剪贴板权限后重试')
    }
  }

  async function handleCopyImage(resource: Resource): Promise<void> {
    const url = resource.url?.trim()
    if (!url || !isImageResource(resource)) {
      ElMessage.warning('当前资源不是可复制的图片')
      return
    }
    if (
      !window.isSecureContext ||
      !navigator.clipboard?.write ||
      typeof ClipboardItem === 'undefined'
    ) {
      ElMessage.warning('当前浏览器不支持直接复制图片，请改用“复制链接”')
      return
    }

    try {
      const pngBlob = fetchClipboardImage(url)
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })])
      ElMessage.success('图片已复制，可直接粘贴到聊天或文档中')
    } catch (error: unknown) {
      if (
        error instanceof DOMException &&
        (error.name === 'NotAllowedError' || error.name === 'SecurityError')
      ) {
        ElMessage.error('浏览器未允许复制图片，请开启本站剪贴板权限后重试')
        return
      }
      ElMessage.error('图片复制失败，请确认资源可访问，或改用“复制链接”')
    }
  }

  async function fetchClipboardImage(url: string): Promise<Blob> {
    const response = await fetch(url, { credentials: 'omit', mode: 'cors' })
    if (!response.ok) throw new Error('RESOURCE_FETCH_FAILED')

    const source = await response.blob()
    if (!source.type.startsWith('image/')) throw new Error('RESOURCE_NOT_IMAGE')
    if (source.type === 'image/png') return source

    const bitmap = await createImageBitmap(source)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('CANVAS_CONTEXT_UNAVAILABLE')
      context.drawImage(bitmap, 0, 0)
      return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('IMAGE_CONVERSION_FAILED'))),
          'image/png'
        )
      })
    } finally {
      bitmap.close()
    }
  }

  function getResourceExtension(resource: Resource): string {
    const suffix = resource.suffix?.trim().replace(/^\./, '') ?? ''
    return suffix ? `.${suffix}` : ''
  }

  function getResourceBaseName(resource: Resource, extension: string): string {
    const currentName = resource.originName?.trim() ?? ''
    return extension && currentName.toLowerCase().endsWith(extension.toLowerCase())
      ? currentName.slice(0, -extension.length)
      : currentName
  }

  async function handleRename(resource: Resource): Promise<void> {
    if (!resource.id) return

    const extension = getResourceExtension(resource)
    const currentBaseName = getResourceBaseName(resource, extension)
    try {
      const baseName = await promptText(
        extension ? `请输入新的文件名，扩展名 ${extension} 将自动保留` : '请输入新的文件名',
        '重命名附件',
        {
          initialValue: currentBaseName,
          placeholder: '请输入文件名',
          emptyMessage: '文件名不能为空',
          maxLength: Math.max(1, 200 - extension.length),
          maxLengthMessage: '完整文件名不能超过 200 个字符',
          confirmButtonText: '保存名称',
          type: 'info'
        }
      )
      const originName = `${baseName}${extension}`
      if (originName === resource.originName) return

      loading.value = true
      await renameResource({ id: String(resource.id), originName })
      resource.originName = originName
      await handleGetResourceList()
      ElMessage.success('附件名称已更新，原访问链接保持不变')
    } catch (error: unknown) {
      if (error !== 'cancel' && error !== 'close') {
        ElMessage.error(getFriendlySupabaseErrorMessage(error, '附件重命名失败，请稍后重试'))
      }
    } finally {
      loading.value = false
    }
  }

  /**
   * 判断是否被选中
   * @param resource
   */
  function isSelected(resource: Resource) {
    const key = resource[returnType] as string
    return selectedKeys.value.includes(key)
  }

  /**
   * 选中资源
   */
  function select(resource: Resource) {
    const key = resource[returnType] as string
    if (!key || selectedKeys.value.includes(key)) return

    if (props.multiple) {
      if (props.limit && selectedKeys.value.length >= props.limit) {
        ElMessage.warning(`最多只能选择 ${props.limit} 个资源`)
        return
      }
      selectedKeys.value.push(key)
      if (!selected.value.find((i) => i[returnType] === key)) {
        selected.value.push(resource)
      }
    } else {
      selected.value = [resource]
      selectedKeys.value = [key]
    }
  }

  /**
   * 取消选中
   */
  function unSelect(resource: Resource) {
    const key = resource[returnType] as string
    selectedKeys.value = selectedKeys.value.filter((i) => i !== key)
    selected.value = selected.value.filter((i) => i[returnType] !== key)
  }

  /**
   * 清空选中
   */
  function clearSelected() {
    selectedKeys.value = []
    selected.value = []
  }

  function cancel() {
    emit('cancel')
  }

  function confirm() {
    emit('confirm', selected.value)
  }

  /**
   * 删除选中
   */
  async function handleDelete(resource: Resource): Promise<void> {
    if (!resource.id) return
    try {
      const blocked = await deleteGuardRef.value?.inspect({
        resourceType: 'attachment',
        resourceLabel: '附件资源',
        resources: [{ id: String(resource.id), label: resource.originName || '未命名附件' }]
      })
      if (blocked) return

      await confirmDelete(
        `确定要删除“${resource.originName || '未命名附件'}”吗？删除后将无法恢复。`,
        {
          title: '删除附件'
        }
      )

      loading.value = true
      const { storageCleanupFailed } = await deleteResource({ id: resource.id })
      unSelect(resource)
      await handleGetResourceList()
      if (storageCleanupFailed) {
        ElMessage.warning('附件已从资源库删除，但源文件清理异常，请联系管理员处理')
      } else {
        ElMessage.success('附件已删除')
      }
    } catch (error: unknown) {
      if (error !== 'cancel' && error !== 'close') {
        ElMessage.error(
          getFriendlySupabaseErrorMessage(error, '删除前检查失败，附件未删除，请稍后重试')
        )
      }
    } finally {
      loading.value = false
    }
  }

  /**
   * 处理点击资源事件
   */
  function handleClick(resource: Resource) {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    isSelected(resource) ? unSelect(resource) : select(resource)
  }

  /**
   * 处理双击资源事件
   */
  function handleDbClick(resource: Resource) {
    if (!props.dbClickConfirm) return
    // 双击确认选中单个元素
    clearSelected()
    select(resource)
    confirm()
  }

  function setFileInputRef(name: string, element: unknown): void {
    if (element instanceof HTMLInputElement) {
      fileInputRefs.set(name, element)
      return
    }
    fileInputRefs.delete(name)
  }

  function handleUploadButtonClick(btn: Api.DataCenter.Resources.Button): void {
    if (uploading.value) return
    if (btn.click) {
      btn.click(btn, selected.value)
      return
    }
    if (btn.upload) fileInputRefs.get(btn.name)?.click()
  }

  function getDockEffectClass(index: number): string | undefined {
    if (hoveredDockIndex.value === undefined) return undefined
    const distance = Math.abs(index - hoveredDockIndex.value)
    if (distance === 0) return 'main-effect'
    if (distance === 1) return 'second-effect'
    if (distance === 2) return 'third-effect'
    return undefined
  }

  function prepareUploadProgress(files: File | File[]): void {
    const fileList = Array.isArray(files) ? files : [files]
    cancelProgressReset()
    Object.assign(uploadProgress, createUploadProgressState(), {
      visible: true,
      total: fileList.length,
      totalBytes: fileList.reduce((total, file) => total + file.size, 0),
      currentFileName: fileList[0]?.name ?? ''
    })
  }

  function calculateUploadPercentage(progress: Api.DataCenter.Resources.UploadProgress): number {
    if (!progress.total) return 0
    if (progress.phase === 'completed') return 100
    if (progress.phase === 'failed' && progress.processed >= progress.total) return 100

    const phaseWeight: Record<Api.DataCenter.Resources.UploadPhase, number> = {
      preparing: 0,
      hashing: 0.12,
      checking: 0.22,
      uploading: 0.68,
      saving: 0.9,
      processing: 0,
      completed: 1,
      failed: 0
    }
    const percentage = ((progress.processed + phaseWeight[progress.phase]) / progress.total) * 100
    return Math.min(99, Math.round(percentage))
  }

  function handleUploadProgress(progress: Api.DataCenter.Resources.UploadProgress): void {
    const percentage = Math.max(uploadProgress.percentage, calculateUploadPercentage(progress))
    Object.assign(uploadProgress, progress, {
      visible: true,
      percentage,
      currentFileName: progress.currentFileName ?? uploadProgress.currentFileName
    })
  }

  async function uploadFiles(
    files: File | File[],
    btn: Api.DataCenter.Resources.Button
  ): Promise<void> {
    if (!btn.upload || uploading.value) return
    if (!activeUploadTenantId.value) throw new Error('当前账号缺少租户信息，请刷新后重试')
    prepareUploadProgress(files)
    uploading.value = true
    try {
      await btn.upload(files, {
        btn,
        targetTenantId: activeUploadTenantId.value,
        handleGetResourceList,
        onProgress: handleUploadProgress
      })
      if (uploadProgress.phase !== 'completed') {
        Object.assign(uploadProgress, {
          phase: 'completed',
          percentage: 100,
          processed: uploadProgress.total,
          succeeded: uploadProgress.total,
          failed: 0
        })
      }
    } catch (error: unknown) {
      if (uploadProgress.phase !== 'failed') {
        Object.assign(uploadProgress, {
          phase: 'failed',
          percentage: Math.max(
            uploadProgress.percentage,
            uploadProgress.total
              ? Math.round((uploadProgress.processed / uploadProgress.total) * 100)
              : 0
          ),
          processed: Math.max(uploadProgress.processed, 1),
          failed: Math.max(uploadProgress.failed, 1)
        })
      }
      throw error
    } finally {
      uploading.value = false
      scheduleProgressReset()
    }
  }

  async function handleFile(ev: Event, btn: Api.DataCenter.Resources.Button): Promise<void> {
    const target = ev.target
    if (!(target instanceof HTMLInputElement)) return
    const files = target.files
    target.value = ''
    if (!files?.length) return

    try {
      await uploadFiles(files.length === 1 ? files[0] : Array.from(files), btn)
      ElMessage.success(files.length === 1 ? '文件上传成功' : `${files.length} 个文件上传成功`)
    } catch (error: unknown) {
      ElMessage.error(getFriendlySupabaseErrorMessage(error, '文件上传失败，请检查文件后重试'))
    }
  }

  async function handlePasteFiles(event: ClipboardEvent): Promise<void> {
    if (uploading.value) return
    const sourceFiles = getClipboardFiles(event.clipboardData)

    if (!sourceFiles.length) {
      ElMessage.warning('剪贴板中没有可上传的文件，请先复制图片或实际文件后重试')
      return
    }

    event.preventDefault()
    const uploadButton = resourceStore.getButton(
      sourceFiles.every((file) => file.type.startsWith('image/'))
        ? 'local-image-upload'
        : 'local-file-upload'
    )
    if (!uploadButton?.upload) {
      ElMessage.error('文件上传入口暂不可用，请刷新页面后重试')
      return
    }

    const files = sourceFiles.map((file, index) =>
      createNamedClipboardFile(file, index, sourceFiles.length)
    )
    try {
      await uploadFiles(files.length === 1 ? files[0] : files, uploadButton)
      ElMessage.success(
        files.length === 1 ? '剪贴板文件上传成功' : `${files.length} 个文件上传成功`
      )
    } catch (error: unknown) {
      ElMessage.error(getFriendlySupabaseErrorMessage(error, '剪贴板文件上传失败，请稍后重试'))
    }
  }

  const handleFileTypesChange = (value: string | number | boolean) => {
    playingResourceKey.value = undefined
    const { options } = segment.value
    queryParams.value.suffix = options.find((i) => i.value === String(value))?.suffix ?? ''
    queryParams.value.page = 1
    void handleGetResourceList()
  }

  const handleGetResourceList = async () => {
    const requestId = ++resourceRequestId
    try {
      playingResourceKey.value = undefined
      loading.value = true
      loadError.value = false
      resources.value = []
      const { suffix, originName, page: current, pageSize: size } = queryParams.value
      const { from, to } = buildSupabasePageRange({ current, size })
      const params = {
        originName,
        suffix,
        tenantId: readTenantId.value,
        from,
        to
      }
      const { data, error } = await fetchResourceList(params)
      if (requestId !== resourceRequestId) return
      loadError.value = Boolean(error)
      resources.value = data ?? []
    } catch (error) {
      if (requestId !== resourceRequestId) return
      loadError.value = true
      ElMessage.error(getFriendlySupabaseErrorMessage(error, '资源加载失败，请稍后重试'))
    } finally {
      if (requestId === resourceRequestId) loading.value = false
    }
  }

  watch(readTenantId, () => {
    selectedKeys.value = []
    queryParams.value.page = 1
    void handleGetResourceList()
  })

  onMounted(() => void handleGetResourceList())
</script>

<style scoped lang="scss">
  @keyframes fadeIn {
    from {
      opacity: 0;
    }

    to {
      opacity: 1;
    }
  }

  .resource-panel {
    position: relative;

    --resource-item-size: 120px;

    .resource-paste-zone {
      display: flex;
      gap: 12px;
      align-items: center;
      width: 100%;
      min-height: 58px;
      padding: 10px 14px;
      margin-top: 10px;
      color: var(--art-gray-800);
      text-align: left;
      cursor: pointer;
      background-color: color-mix(in srgb, var(--theme-color) 5%, var(--default-box-color));
      border: 1px dashed color-mix(in srgb, var(--theme-color) 42%, var(--default-border));
      border-radius: var(--art-control-radius);
      transition:
        color 180ms ease,
        background-color 180ms ease,
        border-color 180ms ease,
        box-shadow 180ms ease;

      &:hover,
      &:focus-visible {
        color: var(--theme-color);
        background-color: color-mix(in srgb, var(--theme-color) 9%, var(--default-box-color));
        border-color: var(--theme-color);
      }

      &:focus-visible {
        outline: none;
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--theme-color) 18%, transparent);
      }

      &:disabled {
        cursor: wait;
        opacity: 0.8;
      }

      &__icon {
        display: inline-flex;
        flex: 0 0 34px;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        font-size: 20px;
        color: var(--theme-color);
        background-color: color-mix(in srgb, var(--theme-color) 12%, transparent);
        border-radius: var(--el-border-radius-base);
      }

      &__content {
        display: flex;
        flex: 1;
        flex-direction: column;
        gap: 2px;
        min-width: 0;

        strong {
          font-size: 14px;
          line-height: 20px;
          color: inherit;
        }

        span {
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 12px;
          line-height: 18px;
          color: var(--art-gray-600);
          white-space: nowrap;
        }
      }

      &__progress {
        display: flex;
        flex: 0 1 274px;
        gap: 12px;
        align-items: center;
        justify-content: flex-end;
        min-width: 224px;
        padding: 6px 8px 6px 14px;
        background-color: color-mix(in srgb, var(--default-box-color) 84%, transparent);
        border-left: 1px solid color-mix(in srgb, var(--theme-color) 18%, var(--default-border));
        border-radius: var(--el-border-radius-base);

        :deep(.el-progress) {
          flex: none;
        }

        :deep(.el-progress__text) {
          min-width: auto;
          font-size: 11px !important;
          font-weight: 700;
          color: var(--art-gray-800);
        }
      }

      &__progress-copy {
        display: flex;
        flex: 1;
        flex-direction: column;
        gap: 1px;
        min-width: 0;

        strong,
        span,
        small {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        strong {
          font-size: 12px;
          line-height: 18px;
          color: var(--art-gray-800);
        }

        span,
        small {
          font-size: 11px;
          line-height: 16px;
          color: var(--art-gray-600);
        }
      }

      &__shortcut {
        flex: none;
        padding: 3px 7px;
        font-family: inherit;
        font-size: 11px;
        line-height: 16px;
        color: var(--art-gray-700);
        background-color: var(--default-box-color);
        border: 1px solid var(--default-border);
        border-radius: var(--el-border-radius-small);
        box-shadow: inset 0 -1px 0 color-mix(in srgb, var(--art-gray-900) 12%, transparent);
      }

      &.is-uploading &__icon {
        animation: resource-paste-spin 900ms linear infinite;
      }
    }

    .resource-dock {
      position: absolute;
      bottom: 0;
      left: 50%;
      display: flex;
      column-gap: 0.125rem;
      align-items: center;
      justify-content: center;
      padding: 4px;
      background-color: rgb(229 231 235 / 100%); /* bg-gray-2 */
      border-radius: 12px;
      transform: translate(-50%);

      /* dark-bg-dark-9 */
      :root.dark & {
        background-color: #1f2937;
      }

      .res-app-container {
        position: relative;
        display: flex;
        align-items: center;
        height: 40px;
      }

      /* 白色圆点 */
      .activate::after {
        position: absolute;
        bottom: 2px;
        left: 50%;
        display: block;
        width: 0;
        height: 0;
        content: '';
        border-color: #fff;
        border-style: solid;
        border-width: 2px;
        border-radius: 9999px;
        transform: translateX(-50%);
      }

      .res-app {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        background-color: rgb(209 213 219 / 100%); /* bg-gray-3 */
        border-radius: 10px;
        box-shadow:
          inset 0 4px 6px -1px rgb(0 0 0 / 10%),
          inset 0 2px 4px -2px rgb(0 0 0 / 10%);
        transition:
          background-color 0.3s,
          box-shadow 0.3s,
          transform 0.3s;

        &:disabled {
          cursor: wait;
          opacity: 0.62;
        }

        /* dark-bg-dark-4 dark-shadow-dark-9 */
        :root.dark & {
          background-color: #374151;
          box-shadow:
            inset 0 1px 2px rgb(0 0 0 / 60%),
            0 4px 6px rgb(0 0 0 / 60%);
        }
      }

      .res-app-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 55px;
        height: 55px;
        font-size: 1.5rem !important;
        line-height: 2rem !important;
        color: #111827;
        cursor: pointer;
        transition:
          color 0.3s,
          background-color 0.3s;

        :root.dark & {
          color: #e5e7eb;
        }
      }

      /* 主放大效果 */
      .main-effect {
        width: 80px;
        height: 80px;
        transform: translateY(-40px);
      }

      .main-effect .res-app-icon {
        width: 80px;
        height: 80px;
        font-size: 60px !important;
      }

      /* 次放大效果 */
      .second-effect {
        width: 60px;
        height: 60px;
        transform: translateY(-20px);
      }

      .second-effect .res-app-icon {
        width: 60px;
        height: 60px;
        font-size: 40px !important;
      }

      /* 最次放大效果 */
      .third-effect {
        width: 50px;
        height: 50px;
        transform: translateY(-10px);
      }

      .third-effect .res-app-icon {
        width: 50px;
        height: 50px;
        font-size: 30px !important;
      }
    }
  }

  .resource-panel__footer-shell {
    width: 100%;
    min-height: 40px;
  }

  .resource-panel__footer {
    gap: var(--art-space-3);
    align-items: center;
    width: 100%;
    min-height: 40px;
  }

  .resource-panel__pagination,
  .resource-panel__actions {
    position: relative;
    z-index: 1;
  }

  .resource-panel__actions {
    display: flex;
    flex: none;
    gap: var(--art-space-2);

    :deep(.el-button) {
      min-width: 72px;
      margin-left: 0;
    }
  }

  .resource-item {
    position: relative;
    box-sizing: border-box;
    min-width: var(--resource-item-size);
    padding-bottom: 100%;
    overflow: hidden;
    cursor: pointer;
    user-select: none;
    background-color: var(--default-box-color);
    border: 1px solid var(--default-border);
    border-radius: 8px;
    box-shadow: 0 2px 7px rgb(15 23 42 / 4%);
    transition:
      border-color 160ms ease,
      box-shadow 160ms ease,
      transform 160ms ease;
    animation: fadeIn 0.38s ease-out forwards;

    :root.dark & {
      background-color: #1f2937;
    }
  }

  .resource-item__cover {
    position: absolute;
    inset: 0;
  }

  .resource-item__name {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    height: 28px;
    padding: 0 9px;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 12px;
    font-weight: 500;
    line-height: 28px;
    color: #fff;
    white-space: nowrap;
    pointer-events: none;
    background: linear-gradient(180deg, rgb(15 23 42 / 52%), rgb(15 23 42 / 78%));
    backdrop-filter: blur(5px);
  }

  .resource-item__select-surface {
    position: absolute;
    inset: 0;
    z-index: 1;
    cursor: pointer;
    outline: none;
    background: transparent;
    border: 0;
  }

  .resource-item__selected {
    position: absolute;
    top: -30px;
    right: -30px;
    z-index: 3;
    width: 40px;
    height: 40px;
    background-image: linear-gradient(to top right, transparent 50%, var(--main-color) 50%);
  }

  .resource-item__selected-icon {
    position: absolute;
    top: 0;
    right: 0;
    padding: 2px;
    font-size: 22px;
    color: #fff;
  }

  .resource-item.active .resource-item__selected {
    top: 0;
    right: 0;
  }

  .resource-placeholder {
    min-width: var(--resource-item-size);
    height: 0;
    padding: 0;
    pointer-events: none;
  }

  .resource-skeleton {
    min-width: var(--resource-item-size);
    padding-bottom: 100%;
  }

  .resource-item:hover,
  .resource-item.active,
  .resource-item:focus-within {
    outline: none;
    border-color: var(--main-color);
    box-shadow:
      0 0 0 2px color-mix(in srgb, var(--main-color) 88%, transparent),
      0 10px 24px rgb(15 23 42 / 10%);
  }

  .resource-item:hover {
    transform: translateY(-2px);
  }

  @keyframes resource-paste-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (width <= 768px) {
    .resource-panel {
      .resource-paste-zone {
        flex-wrap: wrap;

        &__progress {
          flex-basis: 100%;
          min-width: 0;
          padding: 9px 8px 4px 46px;
          border-top: 1px solid color-mix(in srgb, var(--theme-color) 18%, var(--default-border));
          border-left: 0;
        }
      }
    }

    .resource-panel__footer-shell {
      min-height: 88px;
      padding-top: 48px;

      .resource-dock {
        top: 0;
        bottom: auto;
      }
    }
  }

  @media (width <= 640px) {
    .resource-panel {
      .resource-paste-zone {
        align-items: flex-start;

        &__content span {
          white-space: normal;
        }

        &__shortcut {
          display: none;
        }
      }
    }
  }

  @media (width <= 520px) {
    .resource-panel__footer-shell {
      min-height: 136px;
    }

    .resource-panel__footer {
      flex-direction: column;
      justify-content: center;
    }

    .resource-panel__pagination {
      justify-content: center;
      width: 100%;
    }

    .resource-panel__actions {
      justify-content: center;
      width: 100%;
    }
  }
</style>
