<!-- 混合菜单 -->
<template>
  <div ref="menuRef" class="art-mixed-menu flex-c min-w-0 flex-1">
    <!-- 左侧滚动按钮 -->
    <button
      v-show="hasOverflow"
      type="button"
      class="button-arrow"
      :disabled="!canScrollLeft"
      aria-label="向左滚动菜单"
      title="向左滚动菜单"
      @click="scroll('left')"
    >
      <ElIcon>
        <ArrowLeft />
      </ElIcon>
    </button>

    <!-- 滚动容器 -->
    <ElScrollbar
      ref="scrollbarRef"
      class="min-w-0 flex-1"
      @scroll="handleScroll"
      @wheel="handleWheel"
    >
      <div ref="trackRef" class="art-mixed-menu__track box-border flex-c w-max whitespace-nowrap">
        <template v-for="item in processedMenuList" :key="item.meta.title">
          <button
            v-if="!item.meta.isHide"
            type="button"
            class="menu-item art-icon-label relative shrink-0 h-10 px-3 text-sm c-p hover:text-theme"
            :class="{
              'menu-item-active text-theme': item.isActive
            }"
            :aria-current="item.isActive ? 'location' : undefined"
            @click="startMenuJump(item, true)"
          >
            <ArtSvgIcon
              :icon="item.meta.icon"
              class="text-g-700 dark:text-g-800"
              :class="item.isActive && '!text-theme'"
            />
            <span class="text-g-700 dark:text-g-800" :class="item.isActive && '!text-theme'">
              {{ item.formattedTitle }}
            </span>
            <span v-if="item.meta.showBadge" class="art-badge art-badge-mixed" />
          </button>
        </template>
      </div>
    </ElScrollbar>

    <!-- 右侧滚动按钮 -->
    <button
      v-show="hasOverflow"
      type="button"
      class="button-arrow"
      :disabled="!canScrollRight"
      aria-label="向右滚动菜单"
      title="向右滚动菜单"
      @click="scroll('right')"
    >
      <ElIcon>
        <ArrowRight />
      </ElIcon>
    </button>
  </div>
</template>

<script setup lang="ts">
  import { getScrollBehavior } from '@/utils/ui/scroll'
  import { ref, computed, watch } from 'vue'
  import { ArrowLeft, ArrowRight } from '@element-plus/icons-vue'
  import { useElementSize, useThrottleFn } from '@vueuse/core'
  import { formatMenuTitle } from '@/utils/router'
  import { startMenuJump } from '@/utils/navigation'
  import type { AppRouteRecord } from '@/types/router'

  defineOptions({ name: 'ArtMixedMenu' })

  interface Props {
    /** 菜单列表数据 */
    list: AppRouteRecord[]
  }

  interface ProcessedMenuItem extends AppRouteRecord {
    isActive: boolean
    formattedTitle: string
  }

  type ScrollDirection = 'left' | 'right'

  interface ScrollbarExpose {
    wrapRef?: HTMLDivElement
  }

  const route = useRoute()

  const props = withDefaults(defineProps<Props>(), {
    list: () => []
  })

  const menuRef = ref<HTMLElement>()
  const trackRef = ref<HTMLElement>()
  const scrollbarRef = ref<ScrollbarExpose>()
  const { width: menuWidth } = useElementSize(menuRef)
  const { width: trackWidth } = useElementSize(trackRef)
  const hasOverflow = computed(() => trackWidth.value > menuWidth.value)
  const canScrollLeft = ref(false)
  const canScrollRight = ref(false)

  /** 滚动配置 */
  const SCROLL_CONFIG = {
    /** 点击按钮时的滚动距离 */
    BUTTON_SCROLL_DISTANCE: 200,
    /** 鼠标滚轮快速滚动时的步长 */
    WHEEL_FAST_STEP: 35,
    /** 鼠标滚轮慢速滚动时的步长 */
    WHEEL_SLOW_STEP: 30,
    /** 区分快慢滚动的阈值 */
    WHEEL_FAST_THRESHOLD: 100
  }

  /**
   * 获取当前激活路径
   * 使用computed缓存，避免重复计算
   */
  const currentActivePath = computed(() => {
    return String(route.meta.activePath || route.path)
  })

  /**
   * 判断菜单项是否为激活状态
   * 递归检查子菜单中是否包含当前路径
   * @param item 菜单项数据
   * @returns 是否为激活状态
   */
  const isMenuItemActive = (item: AppRouteRecord): boolean => {
    const activePath = currentActivePath.value

    // 如果有子菜单，递归检查子菜单
    if (item.children?.length) {
      return item.children.some((child) => {
        if (child.children?.length) {
          return isMenuItemActive(child)
        }
        return child.path === activePath
      })
    }

    // 直接比较路径
    return item.path === activePath
  }

  /**
   * 预处理菜单列表
   * 缓存每个菜单项的激活状态和格式化标题
   */
  const processedMenuList = computed<ProcessedMenuItem[]>(() => {
    return props.list.map((item) => ({
      ...item,
      isActive: isMenuItemActive(item),
      formattedTitle: formatMenuTitle(item.meta.title)
    }))
  })

  /**
   * 处理滚动事件的核心逻辑
   * 根据滚动位置显示/隐藏滚动按钮
   */
  const handleScrollCore = (): void => {
    if (!scrollbarRef.value?.wrapRef) return

    const { scrollLeft, scrollWidth, clientWidth } = scrollbarRef.value.wrapRef

    canScrollLeft.value = scrollLeft > 0
    canScrollRight.value = scrollLeft + clientWidth < scrollWidth - 1
  }

  /**
   * 节流后的滚动事件处理函数
   * 调整节流间隔为16ms，约等于60fps
   */
  const handleScroll = useThrottleFn(handleScrollCore, 16)

  /**
   * 滚动菜单容器
   * @param direction 滚动方向，left 或 right
   */
  const scroll = (direction: ScrollDirection): void => {
    if (!scrollbarRef.value?.wrapRef) return

    const currentScroll = scrollbarRef.value.wrapRef.scrollLeft
    const targetScroll =
      direction === 'left'
        ? currentScroll - SCROLL_CONFIG.BUTTON_SCROLL_DISTANCE
        : currentScroll + SCROLL_CONFIG.BUTTON_SCROLL_DISTANCE

    // 平滑滚动到目标位置
    scrollbarRef.value.wrapRef.scrollTo({
      left: targetScroll,
      behavior: getScrollBehavior()
    })
  }

  /**
   * 处理鼠标滚轮事件
   * 优化滚轮响应性能
   * @param event 滚轮事件
   */
  const handleWheel = (event: WheelEvent): void => {
    if (event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return

    // 直接处理滚动，提升响应性
    if (!scrollbarRef.value?.wrapRef) return

    const { wrapRef } = scrollbarRef.value
    const { scrollLeft, scrollWidth, clientWidth } = wrapRef

    // 使用更小的滚动步长，让滚动更平滑
    const scrollStep =
      Math.abs(event.deltaY) > SCROLL_CONFIG.WHEEL_FAST_THRESHOLD
        ? SCROLL_CONFIG.WHEEL_FAST_STEP
        : SCROLL_CONFIG.WHEEL_SLOW_STEP
    const scrollDelta = event.deltaY > 0 ? scrollStep : -scrollStep
    const targetScroll = Math.max(0, Math.min(scrollLeft + scrollDelta, scrollWidth - clientWidth))

    if (targetScroll === scrollLeft) return
    event.preventDefault()
    event.stopPropagation()

    // 立即滚动，无动画
    wrapRef.scrollLeft = targetScroll

    // 更新滚动按钮状态
    handleScrollCore()
  }

  watch([menuWidth, trackWidth], handleScrollCore, { flush: 'post' })
</script>

<style scoped>
  .art-mixed-menu__track {
    block-size: var(--art-mixed-menu-height, var(--art-header-height));
  }

  @reference '@styles/core/tailwind.css';

  .button-arrow {
    @apply grid size-7.5 shrink-0 place-items-center rounded-surface text-g-600;

    transition:
      color var(--art-motion-duration-fast) ease,
      background-color var(--art-motion-duration-fast) ease;
  }

  .button-arrow:hover:not(:disabled) {
    @apply cursor-pointer bg-g-200 text-g-900;
  }

  .button-arrow:focus-visible,
  .menu-item:focus-visible {
    outline: 2px solid var(--theme-color);
    outline-offset: -2px;
  }

  .button-arrow:disabled {
    @apply cursor-not-allowed opacity-40;
  }
</style>

<style scoped>
  :deep(.el-scrollbar__bar.is-horizontal) {
    bottom: 5px;
    display: none;
    height: 2px;
  }

  .menu-item-active::after {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    width: 40px;
    height: 2px;
    margin: auto;
    content: '';
    background-color: var(--theme-color);
  }

  .menu-item {
    margin-inline: 2px;
    border-radius: var(--art-surface-radius);
    transition:
      color 0.18s ease,
      background-color 0.18s ease,
      box-shadow 0.18s ease;
  }

  .menu-item:hover {
    background: color-mix(in srgb, var(--theme-color) 8%, var(--default-box-color));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--theme-color) 11%, transparent);
  }
</style>
