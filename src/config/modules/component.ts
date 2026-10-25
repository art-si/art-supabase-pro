/**
 * 全局组件配置
 *
 * 统一管理系统级全局组件的注册。
 * 这些组件会在应用启动时全局注册，可在任何地方使用。
 *
 * ## 主要功能
 *
 * - 组件配置 - 集中管理全局组件的配置信息
 * - 异步加载 - 状态型组件随布局挂载，交互型组件首次使用时加载
 * - 开关控制 - 支持通过 enabled 字段启用/禁用组件
 * - 配置查询 - 提供工具函数快速查询组件配置
 *
 * @module config/component
 */

import { defineAsyncComponent, type Component } from 'vue'

export type GlobalComponentModule = { default: Component }
export type GlobalComponentActivationEvent =
  'openSetting' | 'openSearchDialog' | 'openChat' | 'triggerFireworks'

/**
 * 全局组件配置列表
 */
export const globalComponentsConfig: GlobalComponentConfig[] = [
  {
    name: '设置面板',
    key: 'settings-panel',
    loader: () => import('@/components/core/layouts/art-settings-panel/index.vue'),
    enabled: true,
    activationEvent: 'openSetting'
  },
  {
    name: '全局搜索',
    key: 'global-search',
    loader: () => import('@/components/core/layouts/art-global-search/index.vue'),
    enabled: true,
    activationEvent: 'openSearchDialog'
  },
  {
    name: '锁屏',
    key: 'screen-lock',
    component: defineAsyncComponent(
      () => import('@/components/core/layouts/art-screen-lock/index.vue')
    ),
    enabled: true
  },
  {
    name: '聊天窗口',
    key: 'chat-window',
    loader: () => import('@/components/core/layouts/art-chat-window/index.vue'),
    enabled: true,
    activationEvent: 'openChat'
  },
  {
    name: '礼花效果',
    key: 'fireworks-effect',
    loader: () => import('@/components/core/layouts/art-fireworks-effect/index.vue'),
    enabled: true,
    activationEvent: 'triggerFireworks'
  },
  {
    name: '水印效果',
    key: 'watermark',
    component: defineAsyncComponent(
      () => import('@/components/core/others/art-watermark/index.vue')
    ),
    enabled: true
  }
]

/**
 * 全局组件配置接口
 */
interface GlobalComponentConfigBase {
  /** 组件名称 */
  name: string
  /** 组件标识 */
  key: string
  /** 是否启用 */
  enabled?: boolean
  /** 组件描述 */
  description?: string
}

export type GlobalComponentConfig = GlobalComponentConfigBase &
  (
    | {
        /** 始终随全局布局挂载的组件 */
        component: Component
        loader?: never
        activationEvent?: never
      }
    | {
        component?: never
        /** 首次使用时加载的组件 */
        loader: () => Promise<GlobalComponentModule>
        /** 首次收到该全局事件后再挂载 */
        activationEvent: GlobalComponentActivationEvent
      }
  )

/**
 * 获取启用的全局组件
 * @returns 已启用的组件配置列表
 */
export const getEnabledGlobalComponents = () => {
  return globalComponentsConfig.filter((config) => config.enabled !== false)
}

/**
 * 根据 key 获取组件配置
 * @param key 组件标识
 * @returns 组件配置对象
 */
export const getGlobalComponentByKey = (key: string) => {
  return globalComponentsConfig.find((config) => config.key === key)
}
