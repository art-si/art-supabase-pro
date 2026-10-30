export interface TableVirtualScrollConfig {
  enabled?: boolean
  rowHeight?: number
  headerHeight?: number
  estimatedRowHeight?: number
  cache?: number
  minRows?: number
}

export interface TableRenderMode {
  requested: boolean
  virtual: boolean
  fallbackReason: string
}
