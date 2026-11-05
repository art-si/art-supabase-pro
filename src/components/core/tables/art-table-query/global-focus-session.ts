/** A manual exit pauses automatic focus for every table in the same page visit. */
const dismissedPages = new WeakSet<HTMLElement>()

export const dismissGlobalTableFocus = (page: HTMLElement): void => {
  dismissedPages.add(page)
}

export const isGlobalTableFocusDismissed = (page: HTMLElement): boolean => dismissedPages.has(page)

export const resetGlobalTableFocusDismissal = (page: HTMLElement): void => {
  dismissedPages.delete(page)
}
