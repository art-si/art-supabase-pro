<!-- 图片裁剪组件 github: https://github.com/acccccccb/vue-img-cutter/tree/master -->
<template>
  <div class="cutter-container flex min-w-0 flex-wrap gap-6">
    <div class="cutter-component min-w-0 max-w-full">
      <div class="title">{{ title }}</div>
      <ElScrollbar always class="h-auto! pb-3">
        <ImgCutter
          ref="imgCutterModal"
          @cutDown="cutDownImg"
          @onPrintImg="cutterPrintImg"
          @onImageLoadComplete="handleImageLoadComplete"
          @onImageLoadError="handleImageLoadError"
          @onClearAll="handleClearAll"
          v-bind="cutterProps"
          class="img-cutter"
        >
          <template #choose>
            <ElButton type="primary" plain v-ripple>选择图片</ElButton>
          </template>
          <template #cancel>
            <ElButton type="danger" plain v-ripple>清除</ElButton>
          </template>
          <template #confirm>
            <!-- <ElButton type="primary" style="margin-left: 10px">确定</ElButton> -->
            <div></div>
          </template>
        </ImgCutter>
      </ElScrollbar>
    </div>

    <div v-if="showPreview" class="preview-container min-w-0 max-w-full">
      <div class="title">{{ previewTitle }}</div>
      <div
        class="preview-box"
        :style="{
          width: `${cutterProps.cutWidth}px`,
          maxWidth: '100%',
          aspectRatio: `${cutterProps.cutWidth} / ${cutterProps.cutHeight}`
        }"
      >
        <img
          v-if="temImgPath"
          class="preview-img"
          :src="temImgPath"
          :width="cutterProps.cutWidth"
          :height="cutterProps.cutHeight"
          alt="裁剪结果预览"
        />
      </div>
      <ElButton
        class="download-btn"
        @click="downloadFile(temImgPath, 'image.png')"
        :disabled="!temImgPath"
        v-ripple
        >下载图片</ElButton
      >
    </div>
  </div>
</template>

<script setup lang="ts">
  import ImgCutter from 'vue-img-cutter'
  import 'vue-img-cutter/vue-img-cutter.css'
  import { downloadFile } from '@/utils/file'
  import { useImage } from '@vueuse/core'

  defineOptions({ name: 'ArtCutterImg' })

  interface CutterProps {
    // 基础配置
    /** 是否模态框 */
    isModal?: boolean
    /** 是否显示工具栏 */
    tool?: boolean
    /** 工具栏背景色 */
    toolBgc?: string
    /** 标题 */
    title?: string
    /** 预览标题 */
    previewTitle?: string
    /** 是否显示预览 */
    showPreview?: boolean

    // 尺寸相关
    /** 容器宽度 */
    boxWidth?: number
    /** 容器高度 */
    boxHeight?: number
    /** 裁剪宽度 */
    cutWidth?: number
    /** 裁剪高度 */
    cutHeight?: number
    /** 是否允许大小调整 */
    sizeChange?: boolean

    // 移动和缩放
    /** 是否允许移动 */
    moveAble?: boolean
    /** 是否允许图片移动 */
    imgMove?: boolean
    /** 是否允许缩放 */
    scaleAble?: boolean

    // 图片相关
    /** 是否显示原始图片 */
    originalGraph?: boolean
    /** 是否允许跨域 */
    crossOrigin?: boolean
    /** 文件类型 */
    fileType?: 'png' | 'jpeg' | 'webp'
    /** 质量 */
    quality?: number

    // 水印
    /** 水印文本 */
    watermarkText?: string
    /** 水印字体大小 */
    watermarkFontSize?: number
    /** 水印颜色 */
    watermarkColor?: string

    // 其他功能
    /** 是否保存裁剪位置 */
    saveCutPosition?: boolean
    /** 是否预览模式 */
    previewMode?: boolean

    // 输入图片
    imgUrl?: string
  }

  interface CutterResult {
    fileName: string
    file: File
    blob: Blob
    dataURL: string
  }

  const props = withDefaults(defineProps<CutterProps>(), {
    // 基础配置默认值
    isModal: false,
    tool: true,
    toolBgc: '#fff',
    title: '',
    previewTitle: '',
    showPreview: true,

    // 尺寸相关默认值
    boxWidth: 700,
    boxHeight: 458,
    cutWidth: 470,
    cutHeight: 270,
    sizeChange: true,

    // 移动和缩放默认值
    moveAble: true,
    imgMove: true,
    scaleAble: true,

    // 图片相关默认值
    originalGraph: true,
    crossOrigin: true,
    fileType: 'png',
    quality: 0.9,

    // 水印默认值
    watermarkText: '',
    watermarkFontSize: 20,
    watermarkColor: '#ffffff',

    // 其他功能默认值
    saveCutPosition: true,
    previewMode: true
  })

  const emit = defineEmits<{
    (event: 'update:imgUrl', value: string): void
    (event: 'error', error: unknown): void
    (event: 'imageLoadComplete', result: unknown): void
    (event: 'imageLoadError', error: unknown): void
  }>()

  const temImgPath = ref('')
  const imgCutterModal = ref<{
    handleOpen: (source: { name: string; src: string }) => void
    clearAll: () => void
  }>()
  const { state: loadedImage, error: imageError } = useImage(
    () => ({
      src: props.imgUrl || 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=',
      crossorigin: 'anonymous'
    }),
    {
      immediate: Boolean(props.imgUrl),
      // The scoped error watcher owns feedback for the latest image only.
      onError: () => undefined
    }
  )

  // 计算属性：整合所有ImgCutter的props
  const cutterProps = computed(() => ({
    ...props,
    WatermarkText: props.watermarkText,
    WatermarkFontSize: props.watermarkFontSize,
    WatermarkColor: props.watermarkColor
  }))

  watch(
    [loadedImage, imgCutterModal],
    ([image, cutter]) => {
      if (image && cutter && props.imgUrl) {
        cutter.handleOpen({ name: '封面图片', src: props.imgUrl })
      }
    },
    { flush: 'post' }
  )
  watch(imageError, (error) => {
    if (error && props.imgUrl) emit('error', error)
  })

  // 监听图片URL变化
  watch(
    () => props.imgUrl,
    (newVal) => {
      temImgPath.value = newVal || ''
      if (!newVal) imgCutterModal.value?.clearAll()
    },
    { immediate: true, flush: 'sync' }
  )

  // 实时预览
  function cutterPrintImg(result: { dataURL: string }) {
    temImgPath.value = result.dataURL
  }

  // 裁剪完成
  function cutDownImg(result: CutterResult) {
    emit('update:imgUrl', result.dataURL)
  }

  // 图片加载完成
  function handleImageLoadComplete(result: unknown) {
    emit('imageLoadComplete', result)
  }

  // 图片加载失败
  function handleImageLoadError(error: unknown) {
    emit('error', error)
    emit('imageLoadError', error)
  }

  // 清除所有
  function handleClearAll() {
    temImgPath.value = ''
  }
</script>

<style lang="scss" scoped>
  .cutter-container {
    .title {
      padding-bottom: 10px;
      font-size: 18px;
      font-weight: 500;
    }

    .preview-container {
      .preview-box {
        background-color: var(--art-active-color) !important;

        .preview-img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
      }

      .download-btn {
        display: block;
        margin: 20px auto;
      }
    }

    :deep(.toolBoxControl) {
      z-index: 100;
    }

    :deep(.dialogMainModal) {
      color: var(--el-text-color-primary);
      background-color: var(--el-bg-color);
    }

    :deep(.dockMain) {
      right: 0;
      bottom: -40px;
      left: 0;
      z-index: 10;
      padding: 0;
      background-color: transparent !important;
      opacity: 1;
    }

    :deep(.copyright) {
      display: none !important;
    }

    :deep(.i-dialog-footer) {
      margin-top: 60px !important;
    }

    :deep(.dockBtn) {
      height: 26px;
      padding: 0 10px;
      font-size: 12px;
      line-height: 26px;
      color: var(--el-color-primary) !important;
      background-color: var(--el-color-primary-light-9) !important;
      border: 1px solid var(--el-color-primary-light-4) !important;
    }

    :deep(.dockBtnScrollBar) {
      margin: 0 10px 0 6px;
      background-color: var(--el-color-primary-light-1);
    }

    :deep(.scrollBarControl) {
      border-color: var(--el-color-primary);
    }

    :deep(.closeIcon) {
      line-height: 15px !important;
    }
  }

  .dark {
    .cutter-container {
      :deep(.toolBox) {
        border: transparent;
      }

      :deep(.dialogMain) {
        background-color: transparent !important;
      }

      :deep(.i-dialog-footer) {
        .btn {
          background-color: var(--el-color-primary) !important;
          border: transparent;
        }
      }
    }
  }
</style>
