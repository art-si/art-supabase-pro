import type { ColumnOption } from '@/types'
import type { WmsDocumentClassification } from '@/api/wms-document.types'

export function wmsDocumentClassificationColumns<
  T extends WmsDocumentClassification
>(): ColumnOption<T>[] {
  return [
    {
      prop: 'documentType',
      label: '单据类型',
      minWidth: 160,
      showOverflowTooltip: true,
      formatter: (row) => row.documentType?.documentTypeName || '—'
    },
    {
      prop: 'businessType',
      label: '业务类型',
      minWidth: 150,
      showOverflowTooltip: true,
      formatter: (row) => row.businessType?.businessTypeName || '—'
    },
    {
      prop: 'stockMovement',
      label: '出入库标志',
      minWidth: 110,
      dict: {
        code: 'mdmStockMovementDirection',
        display: 'text',
        value: (row) => row.businessType?.stockMovement
      }
    },
    {
      prop: 'isInitialization',
      label: '初始化单据',
      minWidth: 110,
      dict: { code: 'commonBoolean', display: 'text', value: (row) => String(row.isInitialization) }
    },
    {
      prop: 'salesperson',
      label: '销售员',
      minWidth: 120,
      formatter: (row) => row.salesperson?.employeeName || '—'
    },
    {
      prop: 'purchaser',
      label: '采购员',
      minWidth: 120,
      formatter: (row) => row.purchaser?.employeeName || '—'
    },
    {
      prop: 'keeper',
      label: '仓管员',
      minWidth: 120,
      formatter: (row) => row.keeper?.employeeName || '—'
    }
  ]
}
