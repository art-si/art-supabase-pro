/**
 * useCeremony - 节日庆祝管理
 *
 * 提供节日烟花效果和祝福文本展示功能，为系统增添节日氛围。
 * 自动检测当前日期是否为节日，并在首次进入时播放烟花动画和显示祝福语。
 *
 * ## 主要功能
 *
 * 1. 节日检测 - 自动匹配当前日期与节日配置列表，支持单日和跨日期节日
 * 2. 烟花动画 - 播放节日烟花特效，支持自定义图片和触发次数
 * 3. 祝福文本 - 烟花结束后显示节日祝福文本
 * 4. 状态管理 - 记录烟花播放状态，避免重复播放
 * 5. 清理机制 - 提供清理方法，支持手动停止和重置
 *
 * ## 使用示例
 *
 * ```typescript
 * // 在配置文件中定义节日
 * // 单日节日
 * {
 *   date: '2024-12-25',
 *   name: '圣诞节',
 *   image: christmasImage,
 *   count: 3 // 可选，不设置则使用默认值 3 次
 *   scrollText: 'Merry Christmas!',
 * }
 *
 * // 跨日期节日
 * {
 *   date: '2025-11-07',
 *   endDate: '2025-11-10',
 *   name: 'v3.0 测试阶段',
 *   image: '',
 *   count: 5 // 自定义烟花播放次数
 *   scrollText: '系统 v3.0 测试阶段正式开启！',
 * }
 * ```
 *
 * @module useCeremony
 */

import { useTimeoutFn, useIntervalFn, tryOnScopeDispose } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { useSettingStore } from '@/store/modules/setting'
import { mittBus } from '@/utils/sys'
import { useCurrentFestival } from './useCurrentFestival'

/**
 * 节日庆祝配置常量
 */
const FESTIVAL_CONFIG = {
  /** 初始延迟（毫秒） */
  INITIAL_DELAY: 300,
  /** 烟花播放间隔（毫秒） */
  FIREWORK_INTERVAL: 1000,
  /** 文本显示延迟（毫秒） */
  TEXT_DELAY: 2000,
  /** 默认烟花播放次数 */
  DEFAULT_FIREWORKS_COUNT: 3
} as const

/**
 * 节日庆祝功能
 * 提供节日烟花效果和祝福文本展示
 */
export function useCeremony() {
  const settingStore = useSettingStore()
  const { holidayFireworksLoaded, isShowFireworks } = storeToRefs(settingStore)
  const { currentFestivalData, currentFestivalDate } = useCurrentFestival()

  let fireworksInterval: { pause: () => void } | null = null
  let initialTimer: { stop: () => void } | null = null
  let textTimer: { stop: () => void } | null = null

  const stopTimers = (): void => {
    initialTimer?.stop()
    textTimer?.stop()
    fireworksInterval?.pause()
    initialTimer = null
    textTimer = null
    fireworksInterval = null
  }
  tryOnScopeDispose(stopTimers)

  /**
   * 更新节日日期到 store
   */
  const updateFestivalDate = () => {
    settingStore.setFestivalDate(currentFestivalData.value ? currentFestivalDate.value : '')
  }

  /**
   * 触发烟花效果
   */
  const triggerFirework = () => {
    mittBus.emit('triggerFireworks', currentFestivalData.value?.image)
  }

  /**
   * 完成烟花效果后显示文本
   */
  const showFestivalText = () => {
    settingStore.setHolidayFireworksLoaded(true)

    textTimer?.stop()
    textTimer = useTimeoutFn(() => {
      textTimer = null
      settingStore.setShowFestivalText(true)
      updateFestivalDate()
    }, FESTIVAL_CONFIG.TEXT_DELAY)
  }

  /**
   * 启动烟花循环
   */
  const startFireworksLoop = () => {
    let playedCount = 0
    // 使用节日配置的播放次数，如果没有则使用默认值
    const count = currentFestivalData.value?.count ?? FESTIVAL_CONFIG.DEFAULT_FIREWORKS_COUNT

    const { pause } = useIntervalFn(() => {
      triggerFirework()
      playedCount++

      if (playedCount >= count) {
        pause()
        showFestivalText()
      }
    }, FESTIVAL_CONFIG.FIREWORK_INTERVAL)

    fireworksInterval = { pause }
  }

  /**
   * 开启节日庆祝
   */
  const openFestival = () => {
    if (!currentFestivalData.value || !isShowFireworks.value) {
      return
    }

    stopTimers()
    initialTimer = useTimeoutFn(() => {
      initialTimer = null
      startFireworksLoop()
    }, FESTIVAL_CONFIG.INITIAL_DELAY)
  }

  /**
   * 清理烟花效果
   */
  const cleanup = () => {
    stopTimers()
    settingStore.setShowFestivalText(false)
    updateFestivalDate()
  }

  return {
    openFestival,
    cleanup,
    holidayFireworksLoaded,
    currentFestivalData,
    isShowFireworks
  }
}
