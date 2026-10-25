import { Fragment, cloneVNode, isVNode, type VNode, type VNodeChild } from 'vue'
import type { ColumnOption } from '@/types/component'
import { getColumnKey, fitColumnHeaderControls } from './column-profile'

export function readSlotColumns(
  nodes: VNode[]
): Array<{ node: VNode; column: ColumnOption<unknown> }> {
  return nodes.flatMap((node) => {
    if (node.type === Fragment && Array.isArray(node.children))
      return readSlotColumns(node.children.filter(isVNode))
    if (
      typeof node.type !== 'object' ||
      !('name' in node.type) ||
      node.type.name !== 'ElTableColumn'
    )
      return []
    const props = node.props ?? {}
    const label = typeof props.label === 'string' ? props.label : ''
    const minWidth = props.minWidth ?? props['min-width']
    const overflow = props.showOverflowTooltip ?? props['show-overflow-tooltip']
    const type =
      props.type === 'selection' || props.type === 'index' || props.type === 'expand'
        ? props.type
        : undefined
    return [
      {
        node,
        column: {
          prop:
            typeof props.prop === 'string'
              ? props.prop
              : label === '操作'
                ? 'operation'
                : `__slot__${label}`,
          label,
          ...(typeof overflow === 'boolean' ? { showOverflowTooltip: overflow } : {}),
          ...(type ? { type } : {}),
          ...(typeof props.width === 'number' || typeof props.width === 'string'
            ? { width: props.width }
            : {}),
          ...(typeof minWidth === 'number' || typeof minWidth === 'string' ? { minWidth } : {}),
          ...(props.align === 'left' || props.align === 'center' || props.align === 'right'
            ? { align: props.align }
            : {}),
          ...(props.fixed === true ||
          props.fixed === false ||
          props.fixed === 'left' ||
          props.fixed === 'right'
            ? { fixed: props.fixed }
            : {}),
          ...(props.sortable === true || props.sortable === false || props.sortable === 'custom'
            ? { sortable: props.sortable }
            : {})
        }
      }
    ]
  })
}

export function renderSlotColumns(
  nodes: VNode[],
  configured: ColumnOption<unknown>[],
  header?: (column: ColumnOption<unknown>, content: VNodeChild) => VNodeChild
): VNode[] {
  const originals = new Map(
    readSlotColumns(nodes).map((entry) => [getColumnKey(entry.column), entry.node])
  )
  return configured
    .filter((column) => column.visible !== false && column.checked !== false)
    .flatMap((column) => {
      const node = originals.get(getColumnKey(column))
      if (!node) return []
      const fitted =
        column.filterType && column.filterType !== 'none' ? fitColumnHeaderControls(column) : column
      const clone = cloneVNode(node, {
        label: column.label,
        width: fitted.width,
        minWidth: fitted.minWidth,
        fixed: column.fixed,
        align: column.align,
        sortable: column.sortable,
        ...(column.showOverflowTooltip !== undefined
          ? { showOverflowTooltip: column.showOverflowTooltip }
          : {})
      })
      if (header && column.filterType && column.filterType !== 'none') {
        const children =
          node.children && typeof node.children === 'object' && !Array.isArray(node.children)
            ? node.children
            : {}
        const originalHeader = typeof children.header === 'function' ? children.header : undefined
        clone.children = {
          ...children,
          header: (scope: unknown) =>
            header(column, originalHeader ? originalHeader(scope) : column.label)
        }
        clone.shapeFlag |= 32 // Vue SLOTS_CHILDREN; preserve the original cell slots.
      }
      return [clone]
    })
}
