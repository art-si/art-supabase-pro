const VERTICAL_SCROLL_OVERFLOW_PATTERN = /auto|scroll|overlay/

const normalizeWheelDelta = (event: WheelEvent, container: HTMLElement): number => {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 16
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * container.clientHeight
  return event.deltaY
}

const canConsumeVerticalWheel = (element: HTMLElement, deltaY: number): boolean => {
  const overflowY = window.getComputedStyle(element).overflowY
  if (!VERTICAL_SCROLL_OVERFLOW_PATTERN.test(overflowY)) return false

  const maxScrollTop = element.scrollHeight - element.clientHeight
  if (maxScrollTop <= 1) return false
  return deltaY < 0 ? element.scrollTop > 1 : element.scrollTop < maxScrollTop - 1
}

const findScrollableParent = (element: HTMLElement, deltaY: number): HTMLElement | null => {
  let parentElement = element.parentElement
  while (parentElement) {
    if (canConsumeVerticalWheel(parentElement, deltaY)) {
      return parentElement
    }
    parentElement = parentElement.parentElement
  }
  return null
}

/**
 * 将无法被内部滚动区消费的纵向滚轮移交给指定外层滚动区。
 * 适用于 ElScrollbar 嵌套、表格横向滚动容器等容易形成滚轮陷阱的场景。
 */
export const handoffVerticalWheel = (
  event: WheelEvent,
  boundaryElement: HTMLElement | null | undefined,
  ownerElement?: HTMLElement | null
): boolean => {
  if (
    event.defaultPrevented ||
    event.ctrlKey ||
    event.deltaY === 0 ||
    Math.abs(event.deltaX) >= Math.abs(event.deltaY) ||
    !boundaryElement
  ) {
    return false
  }

  const eventTarget = event.target instanceof Element ? event.target : null
  if (!eventTarget || !boundaryElement.contains(eventTarget)) return false

  let innerElement: Element | null = eventTarget
  while (innerElement && innerElement !== boundaryElement) {
    if (
      innerElement instanceof HTMLElement &&
      canConsumeVerticalWheel(innerElement, event.deltaY)
    ) {
      return false
    }
    innerElement = innerElement.parentElement
  }

  const scrollOwner = ownerElement ?? findScrollableParent(boundaryElement, event.deltaY)
  if (!scrollOwner || !canConsumeVerticalWheel(scrollOwner, event.deltaY)) return false

  event.preventDefault()
  event.stopPropagation()
  scrollOwner.scrollTop += normalizeWheelDelta(event, scrollOwner)
  return true
}
