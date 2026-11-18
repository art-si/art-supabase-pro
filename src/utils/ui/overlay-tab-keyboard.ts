/** Element Plus changes the active tab on Up/Down but leaves the browser scroll action pending. */
export function preventOverlayTabArrowScroll(event: KeyboardEvent): void {
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return

  const tab = event.target
  if (
    tab instanceof HTMLElement &&
    tab.matches('.el-tabs__item[role="tab"]:not(.is-disabled)') &&
    tab.parentElement?.matches('.el-tabs__nav[role="tablist"]') &&
    tab.closest('.el-tabs')?.matches('.el-tabs--top, .el-tabs--bottom')
  ) {
    event.preventDefault()
  }
}
