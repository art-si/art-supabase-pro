/**
 * 通用类型定义模块
 *
 * 提供项目中常用的通用类型定义
 *
 * ## 主要功能
 *
 * - 状态类型（启用/禁用）
 * - 操作类型（增删改查）
 * - 坐标类型
 * - 弹窗类型
 *
 * ## 使用场景
 *
 * - 通用数据结构定义
 * - 类型约束和提示
 * - 减少重复类型定义
 *
 * @module types/common/index
 */

// 导出响应类型
export * from './response'

// 状态类型
export type Status = 0 | 1 // 0: 禁用, 1: 启用

// 操作类型
export type ActionType = 'create' | 'update' | 'delete' | 'view'

// 坐标类型
export interface Position {
  x: number
  y: number
}

// 弹窗类型
export type DialogType = 'add' | 'edit'
