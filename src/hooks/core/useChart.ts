/**
 * useChart - ECharts 图表管理
 *
 * 提供完整的 ECharts 图表生命周期管理和配置能力，简化图表开发流程。
 * 自动处理图表初始化、更新、销毁、主题切换、响应式调整等复杂逻辑。
 *
 * ## 核心功能
 *
 * 1. 图表生命周期管理 - 自动处理初始化、更新、销毁，支持延迟加载和可见性检测
 * 2. 主题自动适配 - 响应系统主题变化，自动更新图表样式和配色
 * 3. 响应式调整 - 监听窗口大小、菜单展开等变化，自动调整图表尺寸
 * 4. 空状态处理 - 优雅的空数据展示，自动显示"暂无数据"提示
 * 5. 样式配置统一 - 提供坐标轴、图例、提示框等统一的样式配置方法
 * 6. 性能优化 - 防抖处理、样式缓存、requestAnimationFrame 优化
 * 7. 高级组件抽象 - useChartComponent 提供更高层次的图表组件封装
 *
 * ## 使用示例
 *
 * ```typescript
 * // 基础用法
 * const {
 *   chartRef,
 *   initChart,
 *   updateChart,
 *   getAxisLineStyle,
 *   getTooltipStyle
 * } = useChart()
 *
 * onMounted(() => {
 *   initChart({
 *     xAxis: { type: 'category', data: ['Mon', 'Tue', 'Wed'] },
 *     yAxis: { type: 'value' },
 *     series: [{ data: [120, 200, 150], type: 'bar' }]
 *   })
 * })
 *
 * // 高级用法 - 组件抽象
 * const chart = useChartComponent({
 *   props,
 *   generateOptions: () => ({
 *     // ECharts 配置
 *   }),
 *   checkEmpty: () => data.value.length === 0,
 *   watchSources: [() => props.data]
 * })
 * ```
 *
 * @module useChart
 */

import { echarts, type EChartsOption } from '@/plugins/echarts'
import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
import { storeToRefs } from 'pinia'
import { useSettingStore } from '@/store/modules/setting'
import { getCssVar } from '@/utils/ui'
import type { BaseChartProps, ChartThemeConfig, UseChartOptions } from '@/types/component/chart'
import { h, render, type WatchSource } from 'vue'
import {
  useEventListener,
  useIntersectionObserver,
  usePreferredReducedMotion,
  useResizeObserver
} from '@vueuse/core'
import { debounce } from 'lodash-es'
import type { SeriesOption } from 'echarts'

// 图表主题配置
export const useChartOps = (): ChartThemeConfig => {
  const cssColor = (name: string): string => getCssVar(name).trim()
  const themeColor = cssColor('--theme-color') || cssColor('--el-color-primary')

  return {
    /** */
    chartHeight: '16rem',
    /** 字体大小 */
    fontSize: 13,
    /** 字体颜色 */
    fontColor: cssColor('--el-text-color-secondary'),
    /** 主题颜色 */
    themeColor,
    /** 颜色组 */
    colors: [
      themeColor,
      cssColor('--el-color-success'),
      cssColor('--el-color-warning'),
      cssColor('--el-color-danger'),
      cssColor('--el-color-info'),
      cssColor('--el-color-primary-light-3')
    ]
  }
}

// 常量定义
const RESIZE_DELAYS = [50, 100, 200, 350] as const
const MENU_RESIZE_DELAYS = [50, 100, 200] as const
const RESIZE_DEBOUNCE_DELAY = 100

type ChartStyleConfig = Record<string, unknown>

export function useChart(options: UseChartOptions = {}) {
  const { initOptions, initDelay = 0, threshold = 0.1, autoTheme = true } = options

  const settingStore = useSettingStore()
  const { isDark, menuOpen, menuType } = storeToRefs(settingStore)
  const motionPreference = usePreferredReducedMotion()
  const prefersReducedMotion = computed(() => motionPreference.value === 'reduce')

  const chartRef = ref<HTMLElement>()
  let chart: echarts.ECharts | null = null
  let latestOptions: EChartsOption | undefined
  const applyChartOptions = (options: EChartsOption): void => {
    latestOptions = options
    const animation = !prefersReducedMotion.value && (options.animation ?? true)
    const series = options.series
    const applySeriesMotion = (item: SeriesOption): SeriesOption => ({
      ...item,
      animation: !prefersReducedMotion.value && (item.animation ?? animation)
    })
    chart?.setOption({
      ...options,
      animation,
      ...(series
        ? {
            series: Array.isArray(series)
              ? series.map(applySeriesMotion)
              : applySeriesMotion(series)
          }
        : {})
    })
  }
  watch(prefersReducedMotion, () => {
    if (latestOptions && !emptyStateDiv && !isDestroyed) applyChartOptions(latestOptions)
  })
  let pendingOptions: EChartsOption | null = null
  let resizeFrameId: number | null = null
  let initTimerId: number | null = null
  let isDestroyed = false
  let emptyStateDiv: HTMLElement | null = null
  const delayedResizeTimerIds = new Set<number>()
  const scheduledFrameIds = new Set<number>()

  const clearInitTimer = () => {
    if (initTimerId !== null) {
      clearTimeout(initTimerId)
      initTimerId = null
    }
  }

  const scheduleFrame = (callback: FrameRequestCallback): number => {
    const frameId = requestAnimationFrame((timestamp) => {
      scheduledFrameIds.delete(frameId)
      callback(timestamp)
    })
    scheduledFrameIds.add(frameId)
    return frameId
  }

  // 清理定时器的统一方法
  const clearTimers = () => {
    debouncedResize.cancel()
    if (resizeFrameId !== null) {
      cancelAnimationFrame(resizeFrameId)
      resizeFrameId = null
    }
    clearInitTimer()
    delayedResizeTimerIds.forEach((timerId) => clearTimeout(timerId))
    delayedResizeTimerIds.clear()
    scheduledFrameIds.forEach((frameId) => cancelAnimationFrame(frameId))
    scheduledFrameIds.clear()
  }

  // 使用 requestAnimationFrame 优化 resize 处理
  const requestAnimationResize = () => {
    if (resizeFrameId) {
      cancelAnimationFrame(resizeFrameId)
    }
    resizeFrameId = requestAnimationFrame(() => {
      handleResize()
      resizeFrameId = null
    })
  }

  // 防抖的resize处理（用于窗口resize事件）
  const debouncedResize = debounce(requestAnimationResize, RESIZE_DEBOUNCE_DELAY)
  const stopWindowResize = useEventListener(window, 'resize', debouncedResize)
  const { stop: stopContainerResize } = useResizeObserver(chartRef, requestAnimationResize)

  // 多延迟resize处理 - 统一方法
  const multiDelayResize = (delays: readonly number[]) => {
    // 菜单连续切换时仅保留最后一组补偿重绘，避免积累无效 resize。
    delayedResizeTimerIds.forEach((timerId) => clearTimeout(timerId))
    delayedResizeTimerIds.clear()

    // 立即调用一次，快速响应
    nextTick(requestAnimationResize)

    // 使用延迟时间，确保图表正确适应变化
    delays.forEach((delay) => {
      const timerId = window.setTimeout(() => {
        delayedResizeTimerIds.delete(timerId)
        requestAnimationResize()
      }, delay)
      delayedResizeTimerIds.add(timerId)
    })
  }

  // 收缩菜单时，重新计算图表大小（仅在图表存在时监听）
  let menuOpenStopHandle: (() => void) | null = null
  let menuTypeStopHandle: (() => void) | null = null

  const setupMenuWatchers = () => {
    menuOpenStopHandle = watch(menuOpen, () => multiDelayResize(RESIZE_DELAYS))
    menuTypeStopHandle = watch(menuType, () => {
      nextTick(requestAnimationResize)
      const timerId = window.setTimeout(() => {
        delayedResizeTimerIds.delete(timerId)
        multiDelayResize(MENU_RESIZE_DELAYS)
      }, 0)
      delayedResizeTimerIds.add(timerId)
    })
  }

  const cleanupMenuWatchers = () => {
    menuOpenStopHandle?.()
    menuTypeStopHandle?.()
    menuOpenStopHandle = null
    menuTypeStopHandle = null
  }

  // 主题变化时重新设置图表选项
  let themeStopHandle: (() => void) | null = null

  const setupThemeWatcher = () => {
    if (autoTheme) {
      themeStopHandle = watch(isDark, () => {
        if (chart && !isDestroyed) {
          // 使用 requestAnimationFrame 优化主题更新
          scheduleFrame(() => {
            if (chart && !isDestroyed) {
              if (latestOptions && !emptyStateDiv) {
                updateChart(latestOptions)
              }
            }
          })
        }
      })
    }
  }

  const cleanupThemeWatcher = () => {
    themeStopHandle?.()
    themeStopHandle = null
  }

  // 样式生成器 - 统一的样式配置
  const createLineStyle = (color: string, width = 1, type?: 'solid' | 'dashed') => ({
    color,
    width,
    ...(type && { type })
  })

  // 缓存样式配置以减少重复计算
  const styleCache: {
    axisLabel: ChartStyleConfig | null
    axisLine: ChartStyleConfig | null
    splitLine: ChartStyleConfig | null
    lastDarkValue: boolean
  } = {
    axisLine: null,
    splitLine: null,
    axisLabel: null,
    lastDarkValue: isDark.value
  }

  const clearStyleCache = () => {
    styleCache.axisLine = null
    styleCache.splitLine = null
    styleCache.axisLabel = null
    styleCache.lastDarkValue = isDark.value
  }

  // 坐标轴线样式
  const getAxisLineStyle = (show: boolean = true) => {
    if (styleCache.lastDarkValue !== isDark.value) {
      clearStyleCache()
    }
    if (!styleCache.axisLine) {
      styleCache.axisLine = {
        show,
        lineStyle: createLineStyle(getCssVar('--el-border-color'))
      }
    }
    return styleCache.axisLine
  }

  // 分割线样式
  const getSplitLineStyle = (show: boolean = true) => {
    if (styleCache.lastDarkValue !== isDark.value) {
      clearStyleCache()
    }
    if (!styleCache.splitLine) {
      styleCache.splitLine = {
        show,
        lineStyle: createLineStyle(getCssVar('--el-border-color-light'), 1, 'dashed')
      }
    }
    return styleCache.splitLine
  }

  // 坐标轴标签样式
  const getAxisLabelStyle = (show: boolean = true) => {
    if (styleCache.lastDarkValue !== isDark.value) {
      clearStyleCache()
    }
    if (!styleCache.axisLabel) {
      const { fontSize } = useChartOps()
      styleCache.axisLabel = {
        show,
        color: getCssVar('--el-text-color-secondary'),
        fontSize
      }
    }
    return styleCache.axisLabel
  }

  // 坐标轴刻度样式（静态配置，无需缓存）
  const getAxisTickStyle = () => ({
    show: false
  })

  // 获取动画配置
  const getAnimationConfig = (animationDelay: number = 50, animationDuration: number = 1500) => ({
    animationDelay: (idx: number) => idx * animationDelay + 200,
    animationDuration: (idx: number) => animationDuration - idx * 50,
    animationEasing: 'quarticOut' as const
  })

  // 获取统一的 tooltip 配置
  const getTooltipStyle = (
    trigger: 'item' | 'axis' = 'axis',
    customOptions: ChartStyleConfig = {}
  ) => ({
    trigger,
    backgroundColor: isDark.value ? 'rgba(0, 0, 0, 0.8)' : 'rgba(255, 255, 255, 0.9)',
    borderColor: isDark.value ? '#333' : '#ddd',
    borderWidth: 1,
    textStyle: {
      color: isDark.value ? '#fff' : '#333'
    },
    ...customOptions
  })

  // 获取统一的图例配置
  const getLegendStyle = (
    position: 'bottom' | 'top' | 'left' | 'right' = 'bottom',
    customOptions: ChartStyleConfig = {}
  ) => {
    const baseConfig = {
      textStyle: {
        color: isDark.value ? '#fff' : '#333'
      },
      itemWidth: 12,
      itemHeight: 12,
      itemGap: 20,
      ...customOptions
    }

    // 根据位置设置不同的配置
    switch (position) {
      case 'bottom':
        return {
          ...baseConfig,
          bottom: 0,
          left: 'center',
          orient: 'horizontal' as const,
          icon: 'roundRect' as const
        }
      case 'top':
        return {
          ...baseConfig,
          top: 0,
          left: 'center',
          orient: 'horizontal' as const,
          icon: 'roundRect' as const
        }
      case 'left':
        return {
          ...baseConfig,
          left: 0,
          top: 'center',
          orient: 'vertical' as const,
          icon: 'roundRect' as const
        }
      case 'right':
        return {
          ...baseConfig,
          right: 0,
          top: 'center',
          orient: 'vertical' as const,
          icon: 'roundRect' as const
        }
      default:
        return baseConfig
    }
  }

  // 根据图例位置计算 grid 配置
  const getGridWithLegend = (
    showLegend: boolean,
    legendPosition: 'bottom' | 'top' | 'left' | 'right' = 'bottom',
    baseGrid: ChartStyleConfig = {}
  ) => {
    const defaultGrid = {
      top: 15,
      right: 15,
      bottom: 8,
      left: 0,
      containLabel: true,
      ...baseGrid
    }

    if (!showLegend) {
      return defaultGrid
    }

    // 根据图例位置调整 grid
    switch (legendPosition) {
      case 'bottom':
        return {
          ...defaultGrid,
          bottom: 40
        }
      case 'top':
        return {
          ...defaultGrid,
          top: 40
        }
      case 'left':
        return {
          ...defaultGrid,
          left: 120
        }
      case 'right':
        return {
          ...defaultGrid,
          right: 120
        }
      default:
        return defaultGrid
    }
  }

  const intersectionObserver = useIntersectionObserver(
    chartRef,
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && pendingOptions && !isDestroyed) {
          // 使用 requestAnimationFrame 确保在下一帧初始化图表
          scheduleFrame(() => {
            if (
              !isDestroyed &&
              pendingOptions &&
              chartRef.value &&
              isContainerVisible(chartRef.value)
            ) {
              try {
                // 元素变为可见，初始化图表
                const visibleOptions = pendingOptions
                performChartInit(visibleOptions)

                // 触发自定义事件，让组件处理动画逻辑
                const event = new CustomEvent('chartVisible', {
                  detail: { options: visibleOptions }
                })
                entry.target.dispatchEvent(event)

                pendingOptions = null
                intersectionObserver.pause()
              } catch (error) {
                console.error('图表初始化失败:', error)
              }
            }
          })
        }
      })
    },
    { threshold, immediate: false }
  )

  // 检查容器是否可见
  const isContainerVisible = (element: HTMLElement): boolean => {
    const rect = element.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight && rect.bottom > 0
  }

  // 图表初始化核心逻辑
  const performChartInit = (options: EChartsOption) => {
    if (!chartRef.value || isDestroyed) return
    if (!isContainerVisible(chartRef.value)) {
      pendingOptions = options
      intersectionObserver.resume()
      return
    }
    if (!chart) {
      chart = echarts.init(chartRef.value)
      // 图表创建后立即设置监听器
      setupMenuWatchers()
      setupThemeWatcher()
    }
    if (chart && !isDestroyed) {
      applyChartOptions(options)
      pendingOptions = null
    }
  }

  // 图表空数据也使用统一的反馈组件
  const emptyStateManager = {
    create: () => {
      pendingOptions = null
      intersectionObserver.pause()
      clearInitTimer()
      if (!chartRef.value || emptyStateDiv) return

      emptyStateDiv = document.createElement('div')
      emptyStateDiv.style.cssText =
        'position: absolute; inset: 0; display: grid; place-items: center; z-index: 10; pointer-events: none;'
      render(
        h(ArtEmptyState, { title: '暂无数据', size: 'compact', visualSize: 56 }),
        emptyStateDiv
      )

      // 确保父容器有相对定位
      if (
        chartRef.value.style.position !== 'relative' &&
        chartRef.value.style.position !== 'absolute'
      ) {
        chartRef.value.style.position = 'relative'
      }

      chartRef.value.appendChild(emptyStateDiv)
    },

    remove: () => {
      if (!emptyStateDiv) return
      render(null, emptyStateDiv)
      emptyStateDiv.remove()
      emptyStateDiv = null
    }
  }

  // 初始化图表
  const initChart = (options: EChartsOption = {}, isEmpty: boolean = false) => {
    if (!chartRef.value || isDestroyed) return

    clearInitTimer()
    pendingOptions = null
    const mergedOptions = { ...initOptions, ...options }

    try {
      if (isEmpty) {
        // 处理空数据情况 - 显示自定义空状态div
        if (chart) {
          chart.clear()
        }
        emptyStateManager.create()
        return
      } else {
        // 有数据时移除空状态div
        emptyStateManager.remove()
      }

      if (isContainerVisible(chartRef.value)) {
        intersectionObserver.pause()
        // 容器可见，正常初始化
        if (initDelay > 0) {
          initTimerId = window.setTimeout(() => {
            initTimerId = null
            performChartInit(mergedOptions)
          }, initDelay)
        } else {
          performChartInit(mergedOptions)
        }
      } else {
        // 容器不可见，保存选项并设置监听器
        pendingOptions = mergedOptions
        intersectionObserver.resume()
      }
    } catch (error) {
      console.error('图表初始化失败:', error)
    }
  }

  // 更新图表
  const updateChart = (options: EChartsOption) => {
    if (isDestroyed) return

    try {
      if (!chart) {
        // 如果图表不存在，先初始化
        initChart(options)
        return
      }
      applyChartOptions(options)
    } catch (error) {
      console.error('图表更新失败:', error)
    }
  }

  // 处理窗口大小变化
  const handleResize = () => {
    if (chart && !isDestroyed) {
      try {
        chart.resize()
      } catch (error) {
        console.error('图表resize失败:', error)
      }
    }
  }

  // 销毁图表
  const destroyChart = () => {
    isDestroyed = true

    if (chart) {
      try {
        chart.dispose()
      } catch (error) {
        console.error('图表销毁失败:', error)
      } finally {
        chart = null
      }
    }

    // 清理所有监听器和资源
    cleanupMenuWatchers()
    cleanupThemeWatcher()
    emptyStateManager.remove()
    intersectionObserver.stop()
    stopWindowResize()
    stopContainerResize()
    clearTimers()
    clearStyleCache()
    pendingOptions = null
    latestOptions = undefined
  }

  // 获取图表实例
  const getChartInstance = () => chart

  // 获取图表是否已初始化
  const isChartInitialized = () => chart !== null

  onBeforeUnmount(destroyChart)

  return {
    isDark,
    chartRef,
    prefersReducedMotion,
    initChart,
    updateChart,
    handleResize,
    destroyChart,
    getChartInstance,
    isChartInitialized,
    emptyStateManager,
    getAxisLineStyle,
    getSplitLineStyle,
    getAxisLabelStyle,
    getAxisTickStyle,
    getAnimationConfig,
    getTooltipStyle,
    getLegendStyle,
    useChartOps,
    getGridWithLegend
  }
}

// 高级图表组件抽象
interface UseChartComponentOptions<T extends BaseChartProps> {
  /** Props响应式对象 */
  props: T
  /** 图表配置生成函数 */
  generateOptions: () => EChartsOption
  /** 空数据检查函数 */
  checkEmpty?: () => boolean
  /** 自定义监听的响应式数据 */
  watchSources?: WatchSource<unknown>[]
  /** 自定义可视事件处理 */
  onVisible?: () => void
  /** useChart选项 */
  chartOptions?: UseChartOptions
}

export function useChartComponent<T extends BaseChartProps>(options: UseChartComponentOptions<T>) {
  const {
    props,
    generateOptions,
    checkEmpty,
    watchSources = [],
    onVisible,
    chartOptions = {}
  } = options

  const chart = useChart(chartOptions)
  const { chartRef, initChart, isDark, emptyStateManager } = chart

  // 检查是否为空数据
  const isEmpty = computed(() => {
    if (props.isEmpty) return true
    if (checkEmpty) return checkEmpty()
    return false
  })

  // 更新图表
  const updateChart = () => {
    nextTick(() => {
      if (isEmpty.value) {
        // 处理空数据情况 - 显示自定义空状态div
        if (chart.getChartInstance()) {
          chart.getChartInstance()?.clear()
        }
        emptyStateManager.create()
      } else {
        // 有数据时移除空状态div并初始化图表
        emptyStateManager.remove()
        initChart(generateOptions())
      }
    })
  }

  // 处理图表进入可视区域时的逻辑
  const handleChartVisible = () => {
    if (onVisible) {
      onVisible()
    } else {
      updateChart()
    }
  }

  useEventListener(chartRef, 'chartVisible', handleChartVisible)

  // 存储监听器停止函数
  const stopHandles: (() => void)[] = []

  // 设置数据监听
  const setupWatchers = () => {
    // 监听自定义数据源
    if (watchSources.length > 0) {
      const stopHandle = watch(watchSources, updateChart, { deep: true })
      stopHandles.push(stopHandle)
    }

    // 监听主题变化
    const themeStopHandle = watch(isDark, () => {
      updateChart()
    })
    stopHandles.push(themeStopHandle)
  }

  // 清理所有监听器
  const cleanupWatchers = () => {
    stopHandles.forEach((stop) => stop())
    stopHandles.length = 0
  }

  // 设置生命周期
  const setupLifecycle = () => {
    onMounted(() => {
      updateChart()
    })

    onBeforeUnmount(() => {
      // 清理所有监听器
      cleanupWatchers()
      // 清理空状态div
      emptyStateManager.remove()
    })
  }

  // 初始化
  setupWatchers()
  setupLifecycle()

  return {
    ...chart,
    isEmpty,
    updateChart,
    handleChartVisible
  }
}
