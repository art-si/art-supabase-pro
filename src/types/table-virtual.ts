export interface TableVirtualScrollConfig {
  enabled?: boolean
  rowHeight?: number
  headerHeight?: number
  estimatedRowHeight?: number
  cache?: number
  minRows?: number
  /** In compatible virtual mode, children/hasChildren are ordinary cell data, not tree rows. */
  flatData?: boolean
}

export interface TableRenderMode {
  requested: boolean
  virtual: boolean
  fallbackReason: string
}

/** Measurement metadata emitted by ArtTable's opt-in virtual renderer via column-layout. */
export interface TableColumnLayout {
  /** Actual container width passed to ElTableV2; zero after measurement means it is hidden. */
  viewportWidth: number
  /** Current visible column order, including flex growth and manual resizing. No row data. */
  columns: Array<{ key: string; width: number }>
}
