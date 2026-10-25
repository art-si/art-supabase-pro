/** Field definitions are owned by a production work-order document type. */
export interface WorkOrderExtensionField {
  key: string
  label: string
  valueType: 'text' | 'number' | 'material'
  sourceComponentTypeId: string | null
}

export type WorkOrderExtensionValues = Record<string, string | number | null>
