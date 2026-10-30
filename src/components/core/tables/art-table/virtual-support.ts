import type {
  ColumnOption,
  TableEditConfig,
  TableRenderMode,
  TableVirtualScrollConfig
} from '@/types'

/** Never silently discard a native-table feature when virtual rendering is requested. */
export function resolveTableRenderMode(options: {
  virtualScroll?: boolean | TableVirtualScrollConfig
  columns: ColumnOption[]
  rows: Record<string, unknown>[]
  hasNativeColumns: boolean
  lazy?: boolean
  treeChildren?: string
  spanMethod?: unknown
  showSummary?: boolean
  maxHeight?: unknown
  height?: unknown
  editConfig?: TableEditConfig
  defaultSort?: unknown
  headerCellStyle?: unknown
  rowStyle?: unknown
  fit?: boolean
}): TableRenderMode {
  const config = options.virtualScroll
  const requested = Boolean(config && (typeof config === 'boolean' || config.enabled !== false))
  const fallback = (reason: string): TableRenderMode => ({
    requested,
    virtual: false,
    fallbackReason: requested ? reason : ''
  })
  if (!requested) return fallback('')
  if (options.defaultSort || options.headerCellStyle || options.rowStyle || options.fit === false)
    return fallback('原生初始排序或自定义布局样式保留原表格渲染')
  if (typeof config === 'object' && options.rows.length < (config.minRows || 0))
    return fallback('当前行数低于虚拟滚动阈值')
  if (options.hasNativeColumns) return fallback('原生 ElTableColumn 插槽保留原表格渲染')
  if (options.columns.some((column) => column.children?.length))
    return fallback('分组表头保留原表格渲染')
  if (options.columns.some((column) => column.type === 'expand'))
    return fallback('展开行保留原表格渲染')
  if (options.columns.some((column) => column.draggable))
    return fallback('行排序拖拽保留原表格渲染')
  if (options.columns.some((column) => column.filters?.length))
    return fallback('原生列过滤保留原表格渲染')
  if (
    options.columns.some(
      (column) =>
        (typeof column.width === 'string' && column.width.includes('%')) ||
        (typeof column.minWidth === 'string' && column.minWidth.includes('%'))
    )
  )
    return fallback('百分比列宽保留原表格渲染')
  if (
    options.lazy ||
    options.rows.some(
      (row) =>
        (Array.isArray(row[options.treeChildren || 'children']) &&
          (row[options.treeChildren || 'children'] as unknown[]).length > 0) ||
        row.hasChildren
    )
  )
    return fallback('树形与懒加载行保留原表格渲染')
  if (options.spanMethod || options.showSummary)
    return fallback('合并单元格与原生合计行保留原表格渲染')
  if (options.maxHeight != null && !options.height)
    return fallback('自然增长的 maxHeight 表格保留原渲染，请为虚拟表格提供有界高度')
  if (
    options.editConfig &&
    options.editConfig.enabled !== false &&
    options.editConfig?.editor !== 'external' &&
    options.columns.some((column) => column.editRender?.name === 'textarea') &&
    !(typeof config === 'object' && config.estimatedRowHeight)
  )
    return fallback('多行行内编辑需要 estimatedRowHeight，当前保留原表格渲染')
  return { requested: true, virtual: true, fallbackReason: '' }
}
