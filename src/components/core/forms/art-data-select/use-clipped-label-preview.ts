import { onClickOutside } from '@vueuse/core'
import { onBeforeUnmount, shallowReactive, shallowRef, watch, type ObjectDirective } from 'vue'

const labelAttribute = 'data-art-clipped-label'
const labelSelector = `[${labelAttribute}]`

export function useClippedLabelPreview() {
  const clippedKeys = shallowReactive(new Set<string>())
  const preview = shallowRef<{
    key: string
    anchor: HTMLElement
    label: string
    description: string
    origin: 'focus' | 'button'
  }>()
  const captions = new WeakMap<HTMLElement, string>()
  let observer: ResizeObserver | undefined

  const hidePreview = () => (preview.value = undefined)

  function measure(elements: Iterable<Element>) {
    for (const element of elements) {
      const key = element.getAttribute(labelAttribute)
      if (key === null) continue
      const clipped = [...element.children].some(
        (part) => part.clientWidth > 0 && part.scrollWidth > part.clientWidth + 1
      )
      if (clipped) clippedKeys.add(key)
      else clippedKeys.delete(key)
    }
    if (preview.value && !clippedKeys.has(preview.value.key)) hidePreview()
  }

  const vClippedLabel: ObjectDirective<HTMLElement, string> = {
    mounted(element, { value }) {
      element.setAttribute(labelAttribute, value)
      captions.set(element, element.textContent ?? '')
      observer ??= new ResizeObserver((entries) => measure(entries.map(({ target }) => target)))
      observer.observe(element)
    },
    updated(element, { value }) {
      const text = element.textContent ?? ''
      if (text === captions.get(element)) return
      captions.set(element, text)
      if (preview.value?.key === value) hidePreview()
      measure([element])
    },
    beforeUnmount(element, { value }) {
      observer?.unobserve(element)
      captions.delete(element)
      clippedKeys.delete(value)
      if (preview.value?.key === value) hidePreview()
    }
  }

  function showPreview(anchor: HTMLElement, origin: 'focus' | 'button') {
    const wrapper = origin === 'focus' ? anchor : anchor.parentElement
    const caption = wrapper?.querySelector(labelSelector)
    const key = caption?.getAttribute(labelAttribute)
    if (!caption || key == null || !clippedKeys.has(key)) return
    if (origin === 'button' && preview.value?.key === key && preview.value.origin === origin) {
      hidePreview()
      return
    }
    const [label, description] = caption.children
    preview.value = {
      key,
      anchor,
      label: label?.textContent?.trim() ?? '',
      description: description?.textContent?.trim() ?? '',
      origin
    }
  }

  function previewClickedLabel(event: MouseEvent) {
    if (event.currentTarget instanceof HTMLElement) showPreview(event.currentTarget, 'button')
  }

  function dismissPreviewWithEscape(event: KeyboardEvent) {
    if (!preview.value || event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    hidePreview()
  }

  watch(
    () => preview.value?.anchor,
    (anchor, _, onCleanup) => {
      if (anchor) onCleanup(onClickOutside(anchor, hidePreview))
    }
  )
  onBeforeUnmount(() => observer?.disconnect())

  return {
    clippedKeys,
    preview,
    vClippedLabel,
    showPreview,
    previewClickedLabel,
    dismissPreviewWithEscape,
    hidePreview
  }
}
