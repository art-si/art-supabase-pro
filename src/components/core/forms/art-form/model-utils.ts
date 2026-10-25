import { toRaw } from 'vue'
import { cloneDeep, isPlainObject, set, unset } from 'lodash-es'

// ArtForm accepts business-owned models, including nested arrays and arbitrary records.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FormRecord = Record<string, any>

export interface SanitizeOutputOptions {
  removeEmptyString: boolean
  removeEmptyArray: boolean
  removeEmptyObject: boolean
  removeEmptyRichText: boolean
  keepZero: boolean
  keepFalse: boolean
}

export function cloneModelValue(value: FormRecord | undefined): FormRecord {
  return value ? cloneDeep(toRaw(value)) : {}
}

export function updateFormFieldValue(model: FormRecord, path: string, value: unknown): FormRecord {
  if (value === undefined) unset(model, path)
  else set(model, path, value)
  return model
}

function isRichTextEmpty(value: string): boolean {
  if (/<(img|video|audio|iframe|embed|object)\b/i.test(value)) return false

  return (
    value
      .replace(/&nbsp;/gi, '')
      .replace(/<br\s*\/?>/gi, '')
      .replace(/<[^>]*>/g, '')
      .trim() === ''
  )
}

export function sanitizeFormValue(value: unknown, options: SanitizeOutputOptions): unknown {
  if (Array.isArray(value)) {
    const sanitizedArray = value
      .map((item) => sanitizeFormValue(item, options))
      .filter((item) => item !== undefined)
    return sanitizedArray.length === 0 && options.removeEmptyArray ? undefined : sanitizedArray
  }

  if (value && typeof value === 'object' && isPlainObject(toRaw(value))) {
    const sanitizedObject = Object.entries(toRaw(value)).reduce<Record<string, unknown>>(
      (result, [key, item]) => {
        const sanitizedItem = sanitizeFormValue(item, options)
        if (sanitizedItem !== undefined) result[key] = sanitizedItem
        return result
      },
      {}
    )
    return Object.keys(sanitizedObject).length === 0 && options.removeEmptyObject
      ? undefined
      : sanitizedObject
  }

  // Date/File 等控件值不是字段字典，不能通过 Object.entries 清洗成空对象。
  if (value && typeof value === 'object') return value

  if (typeof value === 'string') {
    if (options.removeEmptyString && value.trim() === '') return undefined
    if (options.removeEmptyRichText && isRichTextEmpty(value)) return undefined
    return value
  }

  if (value === 0) return options.keepZero ? value : undefined
  if (value === false) return options.keepFalse ? value : undefined
  return value ?? undefined
}
