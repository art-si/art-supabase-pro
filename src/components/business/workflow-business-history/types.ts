export interface WorkflowBusinessHistoryTarget {
  businessType: string
  businessId: string
  businessTitle?: string
}

export interface WorkflowBusinessHistoryExpose {
  reload: () => Promise<void>
}

export interface WorkflowBusinessHistoryDrawerExpose {
  handleOpen: (target: WorkflowBusinessHistoryTarget) => Promise<void>
}
