import type { TreeV2Instance } from 'element-plus'
import { nextTick } from 'vue'

interface VirtualTreeFocusTarget {
  tree?: Pick<TreeV2Instance, 'scrollToNode'>
  viewport?: HTMLElement
  key: string | number
  isCurrent?: () => boolean
}

/** A virtual row must be scrolled into the render window before it can receive focus. */
export async function focusVirtualTreeNode({
  tree,
  viewport,
  key,
  isCurrent
}: VirtualTreeFocusTarget): Promise<void> {
  if (!tree || !viewport) return
  const { ownerDocument } = viewport
  const origin = ownerDocument.activeElement
  tree.scrollToNode(key, 'auto')
  await nextTick()
  if (!viewport.isConnected || isCurrent?.() === false) return
  const current = ownerDocument.activeElement
  if (current !== origin && (origin?.isConnected || current !== ownerDocument.body)) return
  viewport
    .querySelector<HTMLElement>(`[data-virtual-tree-key="${CSS.escape(String(key))}"]`)
    ?.focus({ preventScroll: true })
}
