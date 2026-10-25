import { useSupabase } from '@/hooks/core/useSupabase'
import type { WmsPurchaseMaterial } from './wms-purchase.types'
import { groupBy } from 'lodash-es'

export interface WmsInboundSourceRow {
  id: string
  documentId: string
  documentNo: string
  documentType: string
  lineId: string
  lineNo: number
  projectName: string | null
  materialCode: string
  materialDescription: string | null
  specificationModel: string | null
  quantity: number
  unit: string
  deliveredQuantity: number
  undeliveredQuantity: number
  receivedQuantity: number
  unreceivedQuantity: number
  needDate: string | null
  unitPrice: number
  taxRate: number
  totalAmount: number
  supplierName: string | null
  purchaserName: string | null
  applicantName: string | null
  sourceDocument: string | null
  sourceLineNo: string | null
}

export interface WmsReturnStockRow {
  id: string
  materialId: string
  material: WmsPurchaseMaterial
  materialCode: string
  materialDescription: string | null
  specificationModel: string | null
  drawingNo: string | null
  brand: string | null
  projectId: string | null
  projectName: string | null
  constructionNo: string | null
  quantity: number
  inventoryUnit: string | null
  inventoryUnitId: string
  availableQuantity: number
  reservedQuantity: number
  batchNo: string
  serialNos: string[]
  unitPrice: number
  amount: number
  warehouseId: string
  warehouseName: string
  zoneName: string | null
  binId: string | null
  binName: string | null
  keeperId: string | null
  keeperName: string | null
  materialSource: string | null
  ownerType: 'self' | 'supplier' | 'customer'
  ownerId: string | null
  stockType: string
  stockStatus: string
}

const { supabase, responseHandle } = useSupabase()
const options = {
  breakReturn: true,
  showErrorMessage: false,
  errorMessage: '参选数据加载失败，请重试'
}
export interface WmsConstructionOption {
  constructionNo: string
  sectionName: string | null
}
export async function fetchWmsConstructionOptions(
  projectId: string,
  tenantId: string,
  keyword: string
): Promise<WmsConstructionOption[]> {
  let query = supabase
    .from('mdm_project_construction')
    .select('construction_no,section_name')
    .eq('project_id', projectId)
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .order('construction_no')
  if (keyword.trim()) query = query.ilike('construction_no', `%${keyword.trim()}%`)
  const { data } = await responseHandle<WmsConstructionOption[]>(() => query, options)
  return data ?? []
}

export async function fetchWmsInboundSources(params: {
  kind: 'purchase_order' | 'receipt_notice'
  tenantId: string
  supplierId: string | null
  projectId: string | null
  keyword: string
  page: number
  pageSize: number
}): Promise<{ data: WmsInboundSourceRow[]; total: number }> {
  const { data } = await responseHandle<{ data: WmsInboundSourceRow[]; total: number }>(
    () =>
      supabase.rpc('wms_purchase_source_picker_secure', {
        p_kind: params.kind,
        p_tenant_id: params.tenantId,
        p_supplier_id: params.supplierId,
        p_project_id: params.projectId,
        p_keyword: params.keyword,
        p_limit: params.pageSize,
        p_offset: (params.page - 1) * params.pageSize
      }),
    options
  )
  if (!data || !Array.isArray(data.data) || typeof data.total !== 'number')
    throw new Error('参选数据不完整，请重新查询')
  return data
}

export async function prepareWmsInboundSources(
  rows: WmsInboundSourceRow[]
): Promise<Array<{ targetId: string; sourceLineIds: string[] }>> {
  const selections = Object.entries(groupBy(rows, 'documentId')).map(([documentId, lines]) => ({
    document_id: documentId,
    line_ids: lines.map((line) => line.lineId)
  }))
  const { data } = await responseHandle<Array<{ targetId: string; sourceLineIds: string[] }>>(
    () => supabase.rpc('scm_prepare_purchase_inbound_secure', { p_selections: selections }),
    options
  )
  if (!data?.length) throw new Error('选中明细已无可入库数量，请刷新重试')
  return data
}

export async function fetchWmsReturnStock(params: {
  kind?: 'purchase_return' | 'entrusted_processing_return'
  tenantId: string
  organizationId: string
  warehouseId: string
  keyword: string
  page: number
  pageSize: number
}): Promise<{ data: WmsReturnStockRow[]; total: number }> {
  const { data } = await responseHandle<{ data: WmsReturnStockRow[]; total: number }>(
    () =>
      supabase.rpc('wms_purchase_return_stock_picker_secure', {
        p_tenant_id: params.tenantId,
        p_kind: params.kind || 'purchase_return',
        p_organization_id: params.organizationId,
        p_warehouse_id: params.warehouseId,
        p_keyword: params.keyword,
        p_limit: params.pageSize,
        p_offset: (params.page - 1) * params.pageSize
      }),
    options
  )
  if (!data || !Array.isArray(data.data) || typeof data.total !== 'number')
    throw new Error('库存数据不完整，请重新查询')
  return data
}
