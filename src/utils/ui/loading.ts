/**
 * 全局 Loading 加载管理模块
 *
 * 提供统一的全屏加载动画管理
 *
 * ## 主要功能
 *
 * - 全屏 Loading 显示和隐藏
 * - 自动适配明暗主题背景色
 * - 品牌化 SVG 加载动画
 * - 单例模式防止重复创建
 * - 锁定页面交互
 *
 * ## 使用场景
 *
 * - 页面初始化加载
 * - 大量数据请求
 * - 路由切换过渡
 * - 异步操作等待
 *
 * ## 特性
 *
 * - 自动检测当前主题并应用对应背景色
 * - 使用品牌轨迹 SVG 与完整状态文案
 * - 单例模式确保同时只有一个 Loading
 * - 提供便捷的显示/隐藏方法
 *
 * @module utils/ui/loading
 */
import { brandLoaderSvg } from '@/assets/svg/loading'
import AppConfig from '@/config'

/**
 * 获取当前主题对应的loading背景色
 * @returns 背景色字符串
 */
const getLoadingBackground = (): string => {
  const isDark = document.documentElement.classList.contains('dark')
  return isDark ? 'rgba(7, 8, 18, 0.97)' : 'rgba(247, 249, 255, 0.98)'
}

const getLoadingTitle = (): string => document.title.trim() || AppConfig.systemInfo.name

const DEFAULT_LOADING_CONFIG = {
  lock: true,
  get background() {
    return getLoadingBackground()
  },
  svg: brandLoaderSvg,
  svgViewBox: '0 0 96 96',
  customClass: 'art-loading-fix art-global-loading'
} as const

let loadingInstance: ReturnType<typeof ElLoading.service> | null = null

export const loadingService = {
  /**
   * 显示 loading
   * @param text 本次操作的状态文案
   * @returns 关闭 loading 的函数
   */
  showLoading(text?: string): () => void {
    if (!loadingInstance) {
      // 每次显示时获取最新的配置，确保背景色与当前主题同步
      const config = {
        ...DEFAULT_LOADING_CONFIG,
        background: getLoadingBackground(),
        text: text || getLoadingTitle()
      }
      const instance = ElLoading.service(config)
      loadingInstance = instance
      instance.$el?.setAttribute('role', 'status')
      instance.$el?.setAttribute('aria-live', 'polite')
      instance.$el?.setAttribute('aria-label', '系统正在加载，请稍候')
    } else if (text && loadingInstance.$el) {
      const textElement = loadingInstance.$el.querySelector<HTMLElement>('.el-loading-text')
      if (textElement) textElement.textContent = text
    }
    return () => this.hideLoading()
  },

  /**
   * 隐藏 loading
   */
  hideLoading(): void {
    if (loadingInstance) {
      loadingInstance.close()
      loadingInstance = null
    }
  }
}
