import type { DataSelectColumn } from '@/components/core/forms/art-data-select/types'
import type { WmsInboundSourceRow, WmsReturnStockRow } from '@/api/wms-purchase-selection'
import { formatCurrencyValue } from '@/utils/ui/format'

export const inboundSourceColumns: DataSelectColumn<WmsInboundSourceRow>[] = [
  { prop: 'documentNo', label: '单据编号', minWidth: 170 },
  { prop: 'documentType', label: '单据类型', minWidth: 130 },
  { prop: 'lineNo', label: '明细行号', width: 95 },
  { prop: 'projectName', label: '项目名称', minWidth: 160 },
  { prop: 'materialCode', label: '物料编码', minWidth: 145 },
  { prop: 'materialDescription', label: '物料描述', minWidth: 200 },
  { prop: 'specificationModel', label: '规格型号', minWidth: 145 },
  { prop: 'quantity', label: '订单数量', width: 110 },
  { prop: 'unit', label: '采购单位', width: 100 },
  { prop: 'deliveredQuantity', label: '已收货数量', width: 120 },
  { prop: 'undeliveredQuantity', label: '未收货数量', width: 120 },
  { prop: 'receivedQuantity', label: '已入库数量', width: 120 },
  { prop: 'unreceivedQuantity', label: '未入库数量', width: 120 },
  { prop: 'needDate', label: '交货日期', width: 130 },
  {
    prop: 'unitPrice',
    label: '单价(元)',
    width: 130,
    formatter: (row) => formatCurrencyValue(row.unitPrice)
  },
  { prop: 'taxRate', label: '税率(%)', width: 100 },
  {
    prop: 'totalAmount',
    label: '价税合计(元)',
    width: 150,
    formatter: (row) => formatCurrencyValue(row.totalAmount)
  },
  { prop: 'supplierName', label: '供应商全称', minWidth: 180 },
  { prop: 'purchaserName', label: '采购员', width: 120 },
  { prop: 'applicantName', label: '申请人', width: 120 },
  { prop: 'sourceDocument', label: '来源单据', minWidth: 170 },
  { prop: 'sourceLineNo', label: '源行号', width: 95 }
]

export const returnStockColumns: DataSelectColumn<WmsReturnStockRow>[] = [
  { prop: 'materialCode', label: '物料编码', minWidth: 145 },
  { prop: 'materialDescription', label: '物料描述', minWidth: 200 },
  { prop: 'specificationModel', label: '规格型号', minWidth: 150 },
  { prop: 'drawingNo', label: '图号', minWidth: 120 },
  { prop: 'brand', label: '品牌', width: 110 },
  { prop: 'projectName', label: '项目名称', minWidth: 160 },
  { prop: 'constructionNo', label: '施工号', minWidth: 130 },
  { prop: 'quantity', label: '库存量', width: 110 },
  { prop: 'inventoryUnit', label: '库存单位', width: 100 },
  { prop: 'availableQuantity', label: '可用库存量', width: 120 },
  { prop: 'reservedQuantity', label: '已分配量', width: 110 },
  { prop: 'batchNo', label: '批次号', minWidth: 160 },
  {
    prop: 'serialNos',
    label: '序列号',
    minWidth: 160,
    formatter: (row) => row.serialNos.join('、') || '—'
  },
  {
    prop: 'unitPrice',
    label: '单价(元)',
    width: 130,
    formatter: (row) => formatCurrencyValue(row.unitPrice)
  },
  {
    prop: 'amount',
    label: '金额(元)',
    width: 140,
    formatter: (row) => formatCurrencyValue(row.amount)
  },
  { prop: 'warehouseName', label: '仓库', minWidth: 150 },
  { prop: 'zoneName', label: '库区', width: 120 },
  { prop: 'binName', label: '库位', width: 120 },
  { prop: 'keeperName', label: '仓管员', width: 120 },
  { prop: 'materialSource', label: '物料来源', minWidth: 150 }
]
