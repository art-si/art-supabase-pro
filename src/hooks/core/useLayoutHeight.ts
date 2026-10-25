/**
 * useLayoutHeight - 页面布局高度管理
 *
 * 自动计算和管理页面内容区域的高度，确保内容区域能够正确填充剩余空间。
 * 监听头部元素高度变化，动态调整内容区域高度，避免出现滚动条或布局错乱。
 *
 * ## 主要功能
 *
 * 1. 动态高度计算 - 根据头部元素高度自动计算内容区域高度
 * 2. 响应式监听 - 自动监听元素尺寸变化并更新高度
 * 3. CSS 变量同步 - 自动更新 CSS 变量，方便全局使用
 * 4. 灵活配置 - 支持自定义间距、CSS 变量名等
 * 5. 自动查找模式 - 提供通过 ID 自动查找元素的便捷方式
 *
 * @module useLayoutHeight
 */

import { ref, computed, watch, onMounted } from 'vue'
import { useElementSize, useRafFn } from '@vueuse/core'

/**
 * 页面容器高度配置
 */
interface LayoutHeightOptions {
  /** 页面内容区需要额外扣除的垂直留白，默认跟随全局页面间距变量 */
  extraSpacing?: number | string
  /** 是否自动更新 CSS 变量（默认 true） */
  updateCssVar?: boolean
  /** CSS 变量名称（默认 '--art-full-height'） */
  cssVarName?: string
}

export function useLayoutHeight(options: LayoutHeightOptions = {}) {
  const {
    extraSpacing = 'var(--art-page-vertical-inset, 28px)',
    updateCssVar = true,
    cssVarName = '--art-full-height'
  } = options
  const normalizedExtraSpacing =
    typeof extraSpacing === 'number' ? `${extraSpacing}px` : extraSpacing

  // 元素引用
  const headerRef = ref<HTMLElement>()
  const contentHeaderRef = ref<HTMLElement>()

  // 使用 VueUse 自动监听元素尺寸变化
  const { height: headerHeight } = useElementSize(headerRef, undefined, { box: 'border-box' })
  const { height: contentHeaderHeight } = useElementSize(contentHeaderRef, undefined, {
    box: 'border-box'
  })

  // 计算容器最小高度（响应式）
  const containerMinHeight = computed(() => {
    const layoutHeight = headerHeight.value + contentHeaderHeight.value
    return `calc(100dvh - ${layoutHeight}px - ${normalizedExtraSpacing})`
  })

  if (updateCssVar) {
    watch(
      containerMinHeight,
      (newHeight) => {
        document.documentElement.style.setProperty(cssVarName, newHeight)
      },
      { immediate: true, flush: 'post' }
    )
  }

  return {
    /** 容器最小高度（响应式） */
    containerMinHeight,
    /** 头部元素引用 */
    headerRef,
    /** 内容头部元素引用 */
    contentHeaderRef,
    /** 头部高度（响应式） */
    headerHeight,
    /** 内容头部高度（响应式） */
    contentHeaderHeight
  }
}

/**
 * 通过 ID 自动查找元素的布局高度管理
 * 适用于无法直接获取元素引用的场景
 *
 * @param headerIds 头部元素的 ID 数组
 * @param options 配置选项
 *
 * ```
 */
export function useAutoLayoutHeight(
  headerIds: string[] = [
    'app-header',
    'app-work-tab-header',
    'app-brand-header',
    'app-content-header'
  ],
  options: LayoutHeightOptions = {}
) {
  const {
    extraSpacing = 'var(--art-page-vertical-inset, 28px)',
    updateCssVar = true,
    cssVarName = '--art-full-height'
  } = options
  const normalizedExtraSpacing =
    typeof extraSpacing === 'number' ? `${extraSpacing}px` : extraSpacing

  // 创建元素引用
  const layoutElementRefs = headerIds.map(() => ref<HTMLElement>())
  const layoutElementHeights = layoutElementRefs.map(
    (elementRef) => useElementSize(elementRef, undefined, { box: 'border-box' }).height
  )
  const headerRef = layoutElementRefs[0] ?? ref<HTMLElement>()
  const contentHeaderIndex = headerIds.indexOf('app-content-header')
  const contentHeaderRef =
    layoutElementRefs[contentHeaderIndex >= 0 ? contentHeaderIndex : 1] ?? ref<HTMLElement>()

  // 使用 VueUse 自动监听元素尺寸变化
  const headerHeight = layoutElementHeights[0] ?? ref(0)
  const contentHeaderHeight =
    layoutElementHeights[contentHeaderIndex >= 0 ? contentHeaderIndex : 1] ?? ref(0)

  // 计算容器最小高度（响应式）
  const containerMinHeight = computed(() => {
    const layoutHeight = layoutElementHeights.reduce(
      (sum, elementHeight) => sum + elementHeight.value,
      0
    )
    return `calc(100dvh - ${layoutHeight}px - ${normalizedExtraSpacing})`
  })

  if (updateCssVar) {
    watch(
      containerMinHeight,
      (newHeight) => {
        document.documentElement.style.setProperty(cssVarName, newHeight)
      },
      { immediate: true, flush: 'post' }
    )
  }

  // 下一帧查找挂载后的布局元素；组件卸载会取消尚未执行的查找。
  const { resume: findLayoutElements, pause: stopFindingLayoutElements } = useRafFn(
    () => {
      stopFindingLayoutElements()
      headerIds.forEach((headerId, index) => {
        const element = document.getElementById(headerId)
        const elementRef = layoutElementRefs[index]
        if (element && elementRef) elementRef.value = element
      })
    },
    { immediate: false }
  )
  onMounted(findLayoutElements)

  return {
    /** 容器最小高度（响应式） */
    containerMinHeight,
    /** 头部元素引用 */
    headerRef,
    /** 内容头部元素引用 */
    contentHeaderRef,
    /** 头部高度（响应式） */
    headerHeight,
    /** 内容头部高度（响应式） */
    contentHeaderHeight
  }
}
