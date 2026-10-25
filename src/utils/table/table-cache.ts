/**
 * 表格缓存管理模块
 *
 * 提供高性能的表格数据缓存机制
 *
 * ## 主要功能
 *
 * - 基于参数的智能缓存键生成（使用 ohash）
 * - LRU（最近最少使用）缓存淘汰策略
 * - 缓存过期时间管理
 * - 缓存大小限制和自动清理
 * - 基于标签的缓存分组管理
 * - 多种缓存失效策略（清空所有、清空当前、清空分页等）
 * - 缓存访问统计和命中率分析
 * - 缓存大小估算
 *
 * ## 使用场景
 *
 * - 表格数据的分页缓存
 * - 减少重复的 API 请求
 * - 提升表格切换和返回的响应速度
 * - 搜索条件变化时的智能缓存管理
 * - 数据更新后的缓存失效处理
 *
 * ## 缓存策略
 *
 * - CLEAR_ALL: 清空所有缓存（适用于全局数据更新）
 * - CLEAR_CURRENT: 仅清空当前查询条件的缓存（适用于单条数据更新）
 * - CLEAR_PAGINATION: 清空所有分页缓存但保留不同搜索条件（适用于批量操作）
 * - KEEP_ALL: 不清除缓存（适用于只读操作）
 *
 * @module utils/table/table-cache
 */
import { hash } from 'ohash'

// 缓存失效策略枚举
export enum CacheInvalidationStrategy {
  /** 清空所有缓存 */
  CLEAR_ALL = 'clear_all',
  /** 仅清空当前查询条件的缓存 */
  CLEAR_CURRENT = 'clear_current',
  /** 清空所有分页缓存（保留不同搜索条件的缓存） */
  CLEAR_PAGINATION = 'clear_pagination',
  /** 不清除缓存 */
  KEEP_ALL = 'keep_all'
}

// 通用 API 响应接口（兼容不同的后端响应格式）
export interface ApiResponse<T = unknown> {
  records?: T[]
  data?: T[]
  total?: number
  current?: number
  size?: number
  [key: string]: unknown
}

// 缓存存储接口
export interface CacheItem<T> {
  data: T[]
  response: ApiResponse<T>
  timestamp: number
  params: string
  // 缓存标签，用于分组管理
  tags: Set<string>
  // 访问次数（用于统计；LRU 使用 Map 的访问顺序）
  accessCount: number
  // 最后访问时间
  lastAccessTime: number
}

// 增强的缓存管理类
export class TableCache<T> {
  private cache = new Map<string, CacheItem<T>>()
  private cacheTime: number
  private maxSize: number
  private enableLog: boolean
  private nextExpiry = Infinity

  constructor(cacheTime = 5 * 60 * 1000, maxSize = 50, enableLog = false) {
    // 默认5分钟，最多50条缓存
    if (!Number.isFinite(cacheTime) || cacheTime < 0) {
      throw new RangeError('缓存有效期必须是非负有限数值')
    }
    if (!Number.isSafeInteger(maxSize) || maxSize < 0) {
      throw new RangeError('缓存容量必须是非负安全整数')
    }
    this.cacheTime = cacheTime
    this.maxSize = maxSize
    this.enableLog = enableLog
  }

  // 内部日志工具
  private log(message: string, ...args: unknown[]) {
    if (this.enableLog) {
      console.log(`[TableCache] ${message}`, ...args)
    }
  }

  // 生成稳定的缓存键
  private generateKey(params: unknown): string {
    return hash(params)
  }

  // 🔧 优化：增强类型安全性
  private generateTags(value: unknown): Set<string> {
    const params = value && typeof value === 'object' ? value : {}
    const tags = new Set<string>()

    // 添加搜索条件标签
    const searchEntries = Object.entries(params).filter(
      ([key, value]) =>
        !['current', 'size', 'total'].includes(key) &&
        value !== undefined &&
        value !== '' &&
        value !== null
    )

    if (searchEntries.length > 0) {
      const searchTag = hash(Object.fromEntries(searchEntries))
      tags.add(`search:${searchTag}`)
    } else {
      tags.add('search:default')
    }

    // 添加分页标签
    tags.add(`pagination:${('size' in params && params.size) || 10}`)
    // 添加通用分页标签，用于清理所有分页缓存
    tags.add('pagination')

    return tags
  }

  // 淘汰顺序由 Map 维护，无需遍历比较访问频次。
  private evictLRU(): void {
    while (this.cache.size > this.maxSize) {
      const lruKey = this.cache.keys().next().value!
      this.cache.delete(lruKey)
      this.log(`LRU 清理缓存: ${lruKey}`)
    }
  }

  // 设置缓存
  set(params: unknown, data: T[], response: ApiResponse<T>): void {
    if (this.maxSize === 0 || this.cacheTime === 0) return
    const key = this.generateKey(params)
    const tags = this.generateTags(params)
    const now = Date.now()

    // 检查是否需要清理
    this.cache.delete(key)
    if (this.cache.size >= this.maxSize && now >= this.nextExpiry) this.cleanupExpired()

    this.cache.set(key, {
      data,
      response,
      timestamp: now,
      params: key,
      tags,
      accessCount: 1,
      lastAccessTime: now
    })
    this.nextExpiry = Math.min(this.nextExpiry, now + this.cacheTime)
    this.evictLRU()
  }

  // 获取缓存
  get(params: unknown): CacheItem<T> | null {
    const key = this.generateKey(params)
    const item = this.cache.get(key)

    if (!item) return null

    // 检查是否过期
    if (Date.now() - item.timestamp >= this.cacheTime) {
      this.cache.delete(key)
      return null
    }

    // 更新访问统计
    item.accessCount++
    item.lastAccessTime = Date.now()
    // Map insertion order is the LRU list, including accesses in the same millisecond.
    this.cache.delete(key)
    this.cache.set(key, item)

    return item
  }

  // 根据标签清除缓存
  clearByTags(tags: string[]): number {
    let clearedCount = 0

    for (const [key, item] of this.cache.entries()) {
      // 检查是否包含任意一个标签
      const hasMatchingTag = tags.some((tag) => item.tags.has(tag))

      if (hasMatchingTag) {
        this.cache.delete(key)
        clearedCount++
      }
    }

    return clearedCount
  }

  // 清除当前搜索条件的缓存
  clearCurrentSearch(params: unknown): number {
    const key = this.generateKey(params)
    const deleted = this.cache.delete(key)
    return deleted ? 1 : 0
  }

  // 清除分页缓存
  clearPagination(): number {
    return this.clearByTags(['pagination'])
  }

  // 清空所有缓存
  clear(): void {
    this.cache.clear()
    this.nextExpiry = Infinity
  }

  // 获取缓存统计信息
  getStats(): { total: number; size: string; hitRate: string } {
    const total = this.cache.size
    let totalSize = 0
    let totalAccess = 0

    for (const item of this.cache.values()) {
      // 粗略估算大小（JSON字符串长度）
      totalSize += JSON.stringify(item.data).length
      totalAccess += item.accessCount
    }

    // 转换为人类可读的大小
    const sizeInKB = (totalSize / 1024).toFixed(2)
    const avgHits = total > 0 ? (totalAccess / total).toFixed(1) : '0'

    return {
      total,
      size: `${sizeInKB}KB`,
      hitRate: `${avgHits} avg hits`
    }
  }

  // 清理过期缓存
  cleanupExpired(): number {
    let cleanedCount = 0
    const now = Date.now()
    this.nextExpiry = Infinity

    for (const [key, item] of this.cache.entries()) {
      if (now - item.timestamp >= this.cacheTime) {
        this.cache.delete(key)
        cleanedCount++
      } else {
        this.nextExpiry = Math.min(this.nextExpiry, item.timestamp + this.cacheTime)
      }
    }

    return cleanedCount
  }
}
