export function getFocusedKeyboardButton(event?: MouseEvent): HTMLButtonElement | undefined {
  const button = event?.currentTarget
  if (
    event?.detail === 0 &&
    button instanceof HTMLButtonElement &&
    button.ownerDocument.activeElement === button
  ) {
    return button
  }
}

/** Disabling a native button can drop keyboard focus onto the document body. */
export function restoreButtonFocusIfLost(button: HTMLButtonElement): void {
  const { ownerDocument } = button
  if (
    button.isConnected &&
    !button.disabled &&
    ownerDocument.hasFocus() &&
    ownerDocument.activeElement === ownerDocument.body
  ) {
    button.focus({ preventScroll: true })
  }
}
