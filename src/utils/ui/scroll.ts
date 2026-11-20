/** Resolve each call against the current preference, including changes made while the app is open. */
export const getScrollBehavior = (smooth = true): ScrollBehavior =>
  smooth &&
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 'smooth'
    : 'auto'

/** Normalize native alignment options and resolve motion at the time of scrolling. */
export const getScrollIntoViewOptions = (
  options?: boolean | ScrollIntoViewOptions,
  defaults: ScrollIntoViewOptions = { behavior: 'smooth', block: 'center' }
): ScrollIntoViewOptions => {
  const resolved: ScrollIntoViewOptions = {
    ...defaults,
    ...(typeof options === 'boolean' ? { block: options ? 'start' : 'end' } : options)
  }
  if (resolved.behavior === 'smooth') resolved.behavior = getScrollBehavior()
  return resolved
}
