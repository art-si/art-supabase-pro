/** Resolve each call against the current preference, including changes made while the app is open. */
export const getScrollBehavior = (smooth = true): ScrollBehavior =>
  smooth &&
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 'smooth'
    : 'auto'
