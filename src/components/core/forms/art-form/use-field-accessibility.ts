import { useLocale, type FormInstance } from 'element-plus'
import { computed, onScopeDispose, useId, watchPostEffect, type Ref } from 'vue'
import type { FormItem } from './index.vue'
import type { FormRecord } from './model-utils'

const descriptionAttribute = 'aria-describedby'
const nameAttribute = 'aria-labelledby'
const dateRangeTypes = new Set(['daterange', 'datetimerange', 'monthrange', 'yearrange'])

const cleanText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

function localElement(root: HTMLElement, id: string | undefined) {
  const element = id ? root.ownerDocument.getElementById(id) : null
  return element && root.contains(element) ? element : null
}

function updateDescription(target: HTMLElement, id: string, add: boolean) {
  const current = target.getAttribute(descriptionAttribute)
  const ids = new Set(current?.match(/\S+/g))
  if (add) ids.add(id)
  else ids.delete(id)
  const next = [...ids].join(' ') || null
  if (next === current) return
  if (next) target.setAttribute(descriptionAttribute, next)
  else target.removeAttribute(descriptionAttribute)
}

export function useFieldAccessibility(
  form: Readonly<Ref<FormInstance | null>>,
  items: Readonly<Ref<readonly FormItem[]>>,
  getProps: (item: FormItem) => FormRecord
) {
  const prefix = useId()
  const { t } = useLocale()
  const fieldId = (item: FormItem) => `${prefix}-${encodeURIComponent(item.key)}`
  const getDescriptionId = (item: FormItem) =>
    item.description ? `${fieldId(item)}-description` : undefined

  const rangeNames = computed(() => {
    const names = new Map<string, { id: string; text: string }[]>()
    for (const item of items.value) {
      if (item.render || !item.type) continue
      const config = getProps(item)
      const type = item.type === 'date' ? config.type : item.type
      const timeRange = type === 'timePicker' && (config.isRange ?? config['is-range']) === true
      if (!timeRange && !dateRangeTypes.has(cleanText(type))) continue

      const start = cleanText(config.startPlaceholder ?? config['start-placeholder'])
      const end = cleanText(config.endPlaceholder ?? config['end-placeholder'])
      const unit = timeRange || type === 'datetimerange' ? 'Time' : 'Date'
      const texts =
        start && end && start !== end
          ? [start, end]
          : [t(`el.datepicker.start${unit}`), t(`el.datepicker.end${unit}`)]
      names.set(
        item.key,
        texts.map((text, index) => ({ id: `${fieldId(item)}-range-${index}`, text }))
      )
    }
    return names
  })
  const getRangeNames = (item: FormItem) => rangeNames.value.get(item.key)

  let linkedDescriptions = new Map<HTMLElement, string>()
  let linkedNames = new Map<HTMLElement, string>()
  watchPostEffect(() => {
    const descriptions = new Map<HTMLElement, string>()
    const names = new Map<HTMLElement, string>()
    for (const item of items.value) {
      const id = getDescriptionId(item)
      const parts = getRangeNames(item)
      if (!id && !parts) continue
      const field = form.value?.getField(item.key)
      const root = field?.$el
      if (!field || !root) continue
      const description = localElement(root, id)

      // ElSelect keeps attributes on its wrapper. Use the control registered with ElFormItem.
      const inputId = field.for ?? (field.inputIds.length === 1 ? field.inputIds[0] : undefined)
      const input = localElement(root, inputId)
      if (input) {
        // Element Plus registers only the first input of a date or time range.
        const editor = input.closest('.el-range-editor')
        if (editor && root.contains(editor)) {
          editor.querySelectorAll<HTMLInputElement>('.el-range-input').forEach((control, index) => {
            if (description) descriptions.set(control, description.id)
            const part = parts?.[index]
            if (
              !part ||
              !localElement(root, part.id) ||
              cleanText(control.getAttribute('aria-label'))
            )
              return
            const currentName = control.getAttribute(nameAttribute)
            if (currentName && currentName !== linkedNames.get(control)) return
            const label = localElement(root, field.labelId)
            names.set(control, label ? `${label.id} ${part.id}` : part.id)
          })
        } else if (description) descriptions.set(input, description.id)
      } else if (field.isGroup && description) descriptions.set(root, description.id)
    }

    for (const [target, id] of linkedDescriptions) {
      if (descriptions.get(target) !== id) updateDescription(target, id, false)
    }
    for (const [target, id] of descriptions) updateDescription(target, id, true)
    for (const [target, name] of linkedNames) {
      if (!names.has(target) && target.getAttribute(nameAttribute) === name)
        target.removeAttribute(nameAttribute)
    }
    for (const [target, name] of names) {
      if (target.getAttribute(nameAttribute) !== name) target.setAttribute(nameAttribute, name)
    }
    linkedDescriptions = descriptions
    linkedNames = names
  })

  onScopeDispose(() => {
    for (const [target, id] of linkedDescriptions) updateDescription(target, id, false)
    for (const [target, name] of linkedNames) {
      if (target.getAttribute(nameAttribute) === name) target.removeAttribute(nameAttribute)
    }
  })

  return { getDescriptionId, getRangeNames }
}
