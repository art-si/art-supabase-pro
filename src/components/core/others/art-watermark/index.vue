<!-- 水印组件 -->
<template>
  <Teleport to="#app-content" :disabled="!teleportReady">
    <div
      v-if="resolvedVisible"
      class="art-watermark-layer"
      aria-hidden="true"
      :style="{ zIndex: zIndex }"
    >
      <ElWatermark
        class="h-full w-full"
        :content="watermarkContent"
        :font="{ fontSize: fontSize, color: resolvedFontColor }"
        :rotate="rotate"
        :gap="watermarkGap"
        :offset="watermarkOffset"
      >
        <div class="h-full"></div>
      </ElWatermark>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
  import { useSettingStore } from '@/store/modules/setting'
  import { useUserStore } from '@/store/modules/user'
  import { useWebsiteConfig } from '@/hooks/core/useWebsiteConfig'

  defineOptions({ name: 'ArtWatermark' })

  const settingStore = useSettingStore()
  const userStore = useUserStore()
  const { watermarkVisible, isDark } = storeToRefs(settingStore)
  const { websiteConfig, websiteConfigLoaded, loadWebsiteConfig, resolveWatermarkContent } =
    useWebsiteConfig()
  const teleportReady = ref(false)

  interface WatermarkProps {
    /** 水印内容 */
    content?: string
    /** 水印是否可见 */
    visible?: boolean
    /** 水印字体大小 */
    fontSize?: number
    /** 水印字体颜色 */
    fontColor?: string
    /** 水印旋转角度 */
    rotate?: number
    /** 水印间距X */
    gapX?: number
    /** 水印间距Y */
    gapY?: number
    /** 水印偏移X */
    offsetX?: number
    /** 水印偏移Y */
    offsetY?: number
    /** 水印层级 */
    zIndex?: number
  }

  const props = withDefaults(defineProps<WatermarkProps>(), {
    content: '',
    visible: false,
    fontSize: 16,
    rotate: -22,
    zIndex: 3100
  })

  const resolvedVisible = computed(() => {
    if (props.visible) return true
    if (websiteConfigLoaded.value) {
      return websiteConfig.value.watermarkEnabled
    }
    return watermarkVisible.value
  })

  const watermarkContent = computed(
    () => props.content || resolveWatermarkContent(userStore.getUserInfo)
  )
  const resolvedFontColor = computed(
    () => props.fontColor ?? (isDark.value ? 'rgba(226, 232, 240, 0.14)' : 'rgba(51, 65, 85, 0.12)')
  )
  const watermarkGap = computed<[number, number]>(() => [props.gapX ?? 240, props.gapY ?? 180])
  const watermarkOffset = computed<[number, number]>(() => [
    props.offsetX ?? 120,
    props.offsetY ?? 90
  ])

  onMounted(async () => {
    await nextTick()
    teleportReady.value = true
    void loadWebsiteConfig()
  })
</script>

<style scoped>
  .art-watermark-layer {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
  }
</style>
