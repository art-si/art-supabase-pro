import type { DatePickerInstance } from 'element-plus'
import type { ComponentPublicInstance } from 'vue'

type DateRangePicker = Pick<DatePickerInstance, 'blur' | 'handleClose'>

function isDateRangePicker(
  target: Element | ComponentPublicInstance | null
): target is ComponentPublicInstance & DateRangePicker {
  return Boolean(
    target &&
    'handleClose' in target &&
    typeof target.handleClose === 'function' &&
    'blur' in target &&
    typeof target.blur === 'function'
  )
}

export function useQueryDateRangeKeyboard() {
  const pickers = new Map<string, DateRangePicker>()

  function trackPicker(key: string, picker: Element | ComponentPublicInstance | null): void {
    if (isDateRangePicker(picker)) pickers.set(key, picker)
    else pickers.delete(key)
  }

  function clearOnEnter(key: string, value: unknown, event: KeyboardEvent): void {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.key !== 'Enter' ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      !Array.isArray(value) ||
      value.length !== 2 ||
      value.some((date) => date === null || date === undefined || date === '')
    )
      return

    const input = event.target
    if (!(input instanceof HTMLInputElement) || !input.classList.contains('el-range-input')) return
    const inputs = input
      .closest('.el-range-editor')
      ?.querySelectorAll<HTMLInputElement>('.el-range-input')
    if (
      inputs?.length !== 2 ||
      Array.from(inputs).some((part) => part.disabled || part.readOnly || part.value !== '')
    )
      return
    const picker = pickers.get(key)
    if (!picker) return

    event.preventDefault()
    event.stopPropagation()
    // Element Plus commits a blank range on blur, but rejects it as a date when Enter is pressed.
    picker.blur()
    const { activeElement, body } = input.ownerDocument
    if (input.isConnected && activeElement === body) input.focus({ preventScroll: true })
    picker.handleClose()
  }

  return { trackPicker, clearOnEnter }
}
