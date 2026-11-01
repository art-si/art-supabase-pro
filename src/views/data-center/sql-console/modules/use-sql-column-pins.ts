import { computed, shallowRef, type ComputedRef, type ShallowRef } from 'vue'
import { isEqual, uniqBy } from 'lodash-es'
import type { TableColumnLayout } from '@/types'
import {
  requestSqlColumnPin,
  resolveSqlColumnPins,
  type SqlColumnPin,
  type SqlColumnPinLayout,
  type SqlColumnPinLayoutInput,
  type SqlColumnPinSide,
  type SqlColumnPinSuspensionReason
} from './result-column-pins'

export interface SqlColumnPinOptions {
  /** Current authorized visible columns, in their actual display order. */
  columns: () => readonly { key: string; label: string }[]
  disabled: () => boolean
}

export interface SqlColumnPinActionResult {
  accepted: boolean
  message?: string
}

export interface SqlColumnPinState {
  desiredPins: ShallowRef<SqlColumnPin[]>
  rawLayout: ShallowRef<TableColumnLayout>
  resolve: ComputedRef<SqlColumnPinLayout>
  ready: ComputedRef<boolean>
  handleLayout: (layout: TableColumnLayout) => void
  setPin: (key: string, side: SqlColumnPinSide | null) => SqlColumnPinActionResult
  clearPins: () => void
  clearLayout: () => void
  reset: () => void
}

const rejectionMessages: Record<SqlColumnPinSuspensionReason, string> = {
  'invalid-key': '无法识别该字段，请重新选择结果列。',
  'duplicate-column': '结果包含重名字段，请使用 AS 指定唯一字段名后重试。',
  'duplicate-request': '固定列设置重复，请先取消该字段的固定后重试。',
  'unavailable-column': '该字段当前不可显示，请先恢复字段显示后重试。',
  'invalid-width': '字段宽度尚未就绪，请稍后重试。',
  'invalid-viewport': '表格布局正在更新，请稍后重试。',
  'narrow-viewport': '当前结果区域过窄，展开结果区域后可固定列。',
  'insufficient-space': '固定后空间不足，请减少固定列或缩小列宽后重试。'
}

/** SQL result presentation state only; the parent owns result/scope resets and feedback. */
export function useSqlColumnPins(options: SqlColumnPinOptions): SqlColumnPinState {
  const desiredPins = shallowRef<SqlColumnPin[]>([])
  const rawLayout = shallowRef<TableColumnLayout>({ viewportWidth: 0, columns: [] })
  const ready = computed(() => {
    if (options.disabled()) return false
    const columns = options.columns()
    const layout = rawLayout.value
    return (
      Number.isFinite(layout.viewportWidth) &&
      layout.viewportWidth > 0 &&
      columns.every((column) => Boolean(column.key)) &&
      uniqBy(columns, 'key').length === columns.length &&
      isEqual(
        columns.map((column) => column.key),
        layout.columns.map((column) => column.key)
      ) &&
      layout.columns.every((column) => Number.isFinite(column.width) && column.width > 0)
    )
  })
  const input = computed<SqlColumnPinLayoutInput>(() => {
    const measured = new Map(rawLayout.value.columns.map((column) => [column.key, column.width]))
    return {
      columns: options.columns().map((column) => ({
        key: column.key,
        width: ready.value ? (measured.get(column.key) ?? NaN) : NaN
      })),
      viewportWidth: ready.value ? rawLayout.value.viewportWidth : NaN,
      desiredPins: options.disabled() ? [] : desiredPins.value
    }
  })
  const resolve = computed(() => resolveSqlColumnPins(input.value))
  const handleLayout = (layout: TableColumnLayout): void => {
    // Keep measurements from editing too: a resize there may not emit again on exit.
    // Pin application remains disabled until the ordinary visible key order matches.
    rawLayout.value = {
      viewportWidth: layout.viewportWidth,
      columns: layout.columns.map((column) => ({ ...column }))
    }
  }
  const setPin = (key: string, side: SqlColumnPinSide | null): SqlColumnPinActionResult => {
    if (side === null) {
      desiredPins.value = desiredPins.value.filter((pin) => pin.key !== key)
      return { accepted: true }
    }
    if (options.disabled()) return { accepted: false, message: '当前结果暂不支持设置固定列。' }
    if (!ready.value) return { accepted: false, message: '布局正在更新，请稍后重试。' }
    const result = requestSqlColumnPin(input.value, { key, side })
    if (!result.accepted)
      return {
        accepted: false,
        message: result.reason
          ? rejectionMessages[result.reason]
          : '暂时无法固定该字段，请调整结果区域后重试。'
      }
    desiredPins.value = result.desiredPins
    return { accepted: true }
  }
  const clearPins = (): void => {
    desiredPins.value = []
  }
  const clearLayout = (): void => {
    rawLayout.value = { viewportWidth: 0, columns: [] }
  }
  const reset = (): void => {
    clearPins()
    clearLayout()
  }
  return {
    desiredPins,
    rawLayout,
    resolve,
    ready,
    handleLayout,
    setPin,
    clearPins,
    clearLayout,
    reset
  }
}
