import { computed, ref, watch, type Ref } from 'vue'

const clipped = (caption: Element | null | undefined): boolean =>
  caption instanceof HTMLElement &&
  caption.clientWidth > 0 &&
  caption.scrollWidth > caption.clientWidth

function getEventOwner(event: Event) {
  const { currentTarget: content, target } = event
  if (
    content instanceof HTMLElement &&
    target instanceof HTMLElement &&
    target.closest('.art-form-item__content') === content
  ) {
    return { content, target }
  }
}

export function useOverlayLabelPreview(enabled: Readonly<Ref<boolean | undefined>>) {
  const hoveredKey = ref<string | null>(null)
  const focusedKey = ref<string | null>(null)
  const activeKey = computed(() => focusedKey.value ?? hoveredKey.value)
  let escapeOwner: string | null = null

  function showOnHover(key: string, event: MouseEvent): void {
    if (enabled.value && event.currentTarget instanceof Element && clipped(event.currentTarget))
      hoveredKey.value = key
  }

  function hideOnHover(key: string): void {
    if (hoveredKey.value === key) hoveredKey.value = null
  }

  function showOnFocus(key: string, event: FocusEvent): void {
    if (!enabled.value) return
    const owner = getEventOwner(event)
    if (!owner?.target.matches(':focus-visible')) return
    const caption = owner.content
      .closest('.el-form-item')
      ?.querySelector(':scope > .el-form-item__label .art-form-item__label-text')
    if (clipped(caption)) focusedKey.value = key
  }

  function hideOnBlur(key: string, event: FocusEvent): void {
    const owner = getEventOwner(event)
    if (!owner) return
    const next = event.relatedTarget
    if (next instanceof HTMLElement && next.closest('.art-form-item__content') === owner.content)
      return
    if (focusedKey.value === key) focusedKey.value = null
    if (escapeOwner === key) escapeOwner = null
  }

  function dismissOnEscape(key: string, event: KeyboardEvent): void {
    if (!enabled.value || event.key !== 'Escape' || event.defaultPrevented) return
    if (activeKey.value !== key && !(event.repeat && escapeOwner === key)) return
    const owner = getEventOwner(event)
    if (!owner || owner.content.ownerDocument.activeElement !== owner.target) return
    const expanded = owner.target.closest('[aria-expanded="true"]')
    if (expanded && owner.content.contains(expanded)) return

    event.preventDefault()
    event.stopPropagation()
    focusedKey.value = null
    hoveredKey.value = null
    escapeOwner = key
  }

  watch(enabled, (active) => {
    if (active) return
    focusedKey.value = null
    hoveredKey.value = null
    escapeOwner = null
  })

  return { activeKey, showOnHover, hideOnHover, showOnFocus, hideOnBlur, dismissOnEscape }
}
