/**
 * 表单验证工具模块
 *
 * 提供项目当前使用的表单字段验证功能
 *
 * ## 主要功能
 *
 * - 手机号码验证（中国大陆格式）
 * - 固定电话验证（支持区号格式）
 * - 普通密码验证
 * - 邮箱地址验证（RFC 5322 标准）
 *
 * ## 验证规则
 *
 * - 手机号：1开头，第二位3-9，共11位
 * - 普通密码：6-20位，必须包含字母和数字
 *
 * @module utils/form/validator
 */

import type { FormItemRule } from 'element-plus'
import { isFieldValueTaken } from '@/api/unique-field'
import { createLatestUniqueValidation } from './latest-unique-validation'
import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'

/**
 * 验证手机号码（中国大陆）
 * @param value 手机号码字符串
 * @returns 返回验证结果，true表示格式正确
 */
export function validatePhone(value: string): boolean {
  if (!value || typeof value !== 'string') {
    return false
  }

  // 中国大陆手机号码：1开头，第二位为3-9，共11位数字
  const phoneRegex = /^1[3-9]\d{9}$/
  return phoneRegex.test(value.trim())
}

/**
 * 验证固定电话号码（中国大陆）
 * @param value 电话号码字符串
 * @returns 返回验证结果，true表示格式正确
 */
export function validateTelPhone(value: string): boolean {
  if (!value || typeof value !== 'string') {
    return false
  }

  // 支持格式：区号-号码，如：010-12345678、0755-1234567
  const telRegex = /^0\d{2,3}-?\d{7,8}$/
  return telRegex.test(value.trim().replace(/\s+/g, ''))
}

/**
 * 验证密码
 * @param value 密码字符串
 * @returns 返回验证结果，true表示格式正确
 * @description 规则：6-20位，必须包含字母和数字
 */
export function validatePassword(value: string): boolean {
  if (!value || typeof value !== 'string') {
    return false
  }

  const trimmedValue = value.trim()

  // 长度检查
  if (trimmedValue.length < 6 || trimmedValue.length > 20) {
    return false
  }

  // 必须包含字母和数字
  const hasLetter = /[a-zA-Z]/.test(trimmedValue)
  const hasNumber = /\d/.test(trimmedValue)

  return hasLetter && hasNumber
}

/**
 * 验证邮箱地址
 * @param value 邮箱地址字符串
 * @returns 返回验证结果，true表示格式正确
 */
export function validateEmail(value: string): boolean {
  if (!value || typeof value !== 'string') {
    return false
  }

  const trimmedValue = value.trim()

  // RFC 5322 标准的简化版邮箱正则
  const emailRegex =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/

  return emailRegex.test(trimmedValue) && trimmedValue.length <= 254
}

type UniqueExtraWhere = Record<string, string | number | boolean | null | undefined>

export function uniqueValidator(options: {
  table: string
  field: string
  getExcludeId?: () => string | undefined
  extraWhere?: () => UniqueExtraWhere
  message?: string
  delay?: number
}): FormItemRule['validator'] {
  const { table, field, getExcludeId, extraWhere, message = '该值已存在', delay = 300 } = options

  const validateLatest = createLatestUniqueValidation({
    delay,
    duplicateMessage: message,
    errorMessage: (error) => getFriendlySupabaseErrorMessage(error, '校验失败，请稍后重试'),
    check: (value) =>
      isFieldValueTaken({
        table,
        field,
        value,
        excludeId: getExcludeId?.(),
        extraWhere: extraWhere?.()
      })
  })

  return (_rule, value, callback) => validateLatest(value, callback)
}
