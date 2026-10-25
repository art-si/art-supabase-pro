import {
  ElMessage,
  ElMessageBox,
  type ElMessageBoxOptions,
  type MessageBoxData
} from 'element-plus'
import { getFriendlySupabaseErrorMessage, wasErrorUserNotified } from '@/utils/supabase'

/** 已由响应层提示的错误不重复弹出；其余异常统一转换为业务可读文案。 */
export function notifyFriendlyError(
  error: unknown,
  fallback: string,
  level: 'error' | 'warning' = 'error'
): void {
  if (wasErrorUserNotified(error)) return
  const message = getFriendlySupabaseErrorMessage(error, fallback)
  if (level === 'warning') ElMessage.warning(message)
  else ElMessage.error(message)
}

export interface ArtConfirmOptions extends Omit<
  ElMessageBoxOptions,
  'message' | 'title' | 'customClass'
> {
  title?: string
  customClass?: string
}

export interface ArtPromptOptions extends ArtConfirmOptions {
  allowEmpty?: boolean
  emptyMessage?: string
  initialValue?: string
  minLength?: number
  minLengthMessage?: string
  maxLength?: number
  maxLengthMessage?: string
  multiline?: boolean
  placeholder?: string
}

export type ArtReasonPromptOptions = Omit<ArtPromptOptions, 'allowEmpty' | 'multiline'>

const normalizeMessage = (message: string): string => message.trim()
const feedbackClassName = (customClass?: string): string =>
  ['art-feedback-message-box', customClass].filter(Boolean).join(' ')

export function useArtFeedback() {
  const confirmAction = (
    message: ElMessageBoxOptions['message'],
    titleOrOptions: string | ArtConfirmOptions = '操作确认',
    legacyOptions: ArtConfirmOptions = {}
  ): Promise<MessageBoxData> => {
    const options =
      typeof titleOrOptions === 'string'
        ? { ...legacyOptions, title: titleOrOptions }
        : titleOrOptions
    const { title = '操作确认', customClass, ...messageBoxOptions } = options
    const isDeleteAction =
      /^(批量)?删除|^清理/.test(title) ||
      /删除|清理/.test(messageBoxOptions.confirmButtonText ?? '')

    return ElMessageBox.confirm(message, title, {
      type: 'warning',
      confirmButtonText: isDeleteAction ? '删除' : '确定',
      cancelButtonText: '取消',
      ...messageBoxOptions,
      confirmButtonType: isDeleteAction
        ? 'danger'
        : messageBoxOptions.confirmButtonType || 'primary',
      cancelButtonType: messageBoxOptions.cancelButtonType ?? 'default',
      cancelButtonClass: ['art-feedback-cancel', messageBoxOptions.cancelButtonClass]
        .filter(Boolean)
        .join(' '),
      customClass: feedbackClassName(customClass)
    })
  }

  const confirm = (
    message: ElMessageBoxOptions['message'],
    options: ArtConfirmOptions = {}
  ): Promise<MessageBoxData> => confirmAction(message, options)

  const confirmDelete = (message: string, options: ArtConfirmOptions = {}) =>
    confirm(message, {
      title: '删除确认',
      type: 'warning',
      confirmButtonText: '删除',
      ...options,
      confirmButtonType: 'danger'
    })

  const promptText = async (
    message: string,
    title: string,
    options: ArtPromptOptions = {}
  ): Promise<string> => {
    const maxLength = options.maxLength ?? 200
    const { value } = await ElMessageBox.prompt(message, title, {
      customClass: feedbackClassName(options.multiline ? 'is-multiline' : undefined),
      type: options.type ?? 'warning',
      confirmButtonText: options.confirmButtonText ?? '确定',
      cancelButtonText: options.cancelButtonText ?? '取消',
      confirmButtonType: options.confirmButtonType || 'primary',
      cancelButtonType: options.cancelButtonType ?? 'default',
      confirmButtonClass: options.confirmButtonClass,
      cancelButtonClass: ['art-feedback-cancel', options.cancelButtonClass]
        .filter(Boolean)
        .join(' '),
      inputType: options.multiline ? 'textarea' : 'text',
      inputValue: options.initialValue ?? '',
      inputPlaceholder: options.placeholder,
      inputValidator: (input) => {
        const normalized = normalizeMessage(input ?? '')
        if (!options.allowEmpty && !normalized) return options.emptyMessage ?? '内容不能为空'
        if (options.minLength && normalized.length < options.minLength) {
          return options.minLengthMessage ?? `内容不能少于 ${options.minLength} 个字`
        }
        if (normalized.length > maxLength) {
          return options.maxLengthMessage ?? `内容不能超过 ${maxLength} 个字`
        }
        return true
      }
    })

    return normalizeMessage(String(value ?? ''))
  }

  const promptReason = (
    message: string,
    title: string,
    options: ArtReasonPromptOptions = {}
  ): Promise<string> =>
    promptText(message, title, {
      ...options,
      multiline: true,
      placeholder: options.placeholder ?? '请填写原因',
      emptyMessage: options.emptyMessage ?? '原因不能为空',
      maxLengthMessage: options.maxLengthMessage ?? `原因不能超过 ${options.maxLength ?? 200} 个字`
    })

  return {
    confirm,
    confirmAction,
    confirmDelete,
    promptText,
    promptReason
  }
}
