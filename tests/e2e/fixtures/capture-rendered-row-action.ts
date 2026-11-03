/** Test-only adapter: retain a formatter action from the mounted Vue component tree. */
export function captureRenderedRowAction(
  instance: { $: { subTree: unknown } } | undefined,
  componentName: 'ArtButtonTable' | 'ArtIconButton',
  label: string | undefined
): (() => void) | undefined {
  const visited = new Set<object>()
  const find = (node: unknown): (() => void) | undefined => {
    if (!node || typeof node !== 'object' || visited.has(node)) return
    visited.add(node)
    if (Array.isArray(node)) {
      for (const child of node) {
        const action = find(child)
        if (action) return action
      }
      return
    }
    const vnode = node as {
      type?: { name?: string; __name?: string }
      props?: { label?: unknown; onClick?: unknown } | null
      children?: unknown
      component?: { subTree?: unknown }
      dynamicChildren?: unknown
    }
    const onClick = vnode.props?.onClick
    if (
      (vnode.type?.name === componentName || vnode.type?.__name === componentName) &&
      vnode.props?.label === label &&
      typeof onClick === 'function'
    )
      return onClick as () => void
    return find(vnode.component?.subTree) ?? find(vnode.children) ?? find(vnode.dynamicChildren)
  }
  return find(instance?.$.subTree)
}
