const TREE_ITEM = '[role="treeitem"]'
const VISIBLE_TREE_ITEM = `${TREE_ITEM}:not(.is-hidden)`
const TREE_TAB_STOP = `${TREE_ITEM}[tabindex="0"]`
const EXPAND_CONTROL = ':scope > .el-tree-node__content > .el-tree-node__expand-icon:not(.is-leaf)'
const CHECKBOX = ':scope > .el-tree-node__content > .el-checkbox input[type="checkbox"]'

const getEventTreeItem = ({ target, currentTarget }: Event) =>
  target instanceof HTMLElement &&
  target.matches(TREE_ITEM) &&
  target.closest('[role="tree"]') === currentTarget
    ? target
    : undefined

/** Element Plus only initializes the tab stop on mount, when remote rows may still be empty. */
export function syncSelectableTreeTabStop(tree: HTMLElement, focusedItem?: HTMLElement): void {
  const current = tree.querySelector<HTMLElement>(TREE_TAB_STOP)
  if (!focusedItem && current?.getClientRects().length) return
  const next =
    focusedItem ??
    Array.from(tree.querySelectorAll<HTMLElement>(VISIBLE_TREE_ITEM)).find(
      (item) => item.getClientRects().length > 0
    )
  if (current === next) return
  if (current) current.tabIndex = -1
  if (next) next.tabIndex = 0
}

export function handleSelectableTreeFocusin(event: FocusEvent): void {
  const item = getEventTreeItem(event)
  if (item && event.currentTarget instanceof HTMLElement) {
    syncSelectableTreeTabStop(event.currentTarget, item)
  }
}

/** Keep navigation separate from activation, then use the original click or checkbox action. */
export function handleSelectableTreeKeydown(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.isComposing) return
  const { key } = event
  const activate = key === 'Enter' || key === ' '
  if (!activate && key !== 'ArrowLeft' && key !== 'ArrowRight') return
  const target = getEventTreeItem(event)
  if (!target) return

  event.preventDefault()
  event.stopPropagation()
  if (!target.matches(VISIBLE_TREE_ITEM)) return
  if (activate) {
    if (!event.repeat && target.getAttribute('aria-disabled') !== 'true') {
      const control = target.querySelector<HTMLInputElement>(CHECKBOX) ?? target
      control.click()
    }
    return
  }

  const expandControl = target.querySelector<HTMLElement>(EXPAND_CONTROL)
  const expanded = target.getAttribute('aria-expanded') === 'true'
  const moveIntoBranch = key === 'ArrowRight'
  if (expandControl && moveIntoBranch !== expanded) {
    expandControl.click()
    return
  }

  const next = moveIntoBranch
    ? target.querySelector<HTMLElement>(`:scope > [role="group"] > ${VISIBLE_TREE_ITEM}`)
    : target.parentElement?.closest<HTMLElement>(VISIBLE_TREE_ITEM)
  next?.focus()
}
