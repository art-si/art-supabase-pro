import { useSupabase } from '@/hooks/core/useSupabase'
import { fetchAllRangePages } from '@/utils/supabase/pagination'
import { uniq } from 'lodash-es'

export type ScmReceiptTargetKind = 'inbound' | 'asset_payable'
export type ScmReceiptTargetStatus = 'draft' | 'confirmed' | 'approved'

export interface ScmReceiptTargetDocument {
  id: string
  tenantId: string
  targetKind: ScmReceiptTargetKind
  documentNo: string
  sourceReceiptId: string
  projectId: string | null
  constructionNo: string | null
  supplierId: string | null
  status: ScmReceiptTargetStatus
  totalAmount: number
  createdAt: string
  completedAt: string | null
  source?: { documentNo: string } | null
  project?: { projectCode: string; projectName: string } | null
  supplier?: { supplierCode: string; supplierName: string } | null
}

export interface ScmReceiptTargetLine {
  id: string
  sourceLineId: string
  lineSnapshot: {
    materialId?: string
    lineNo?: number
    materialCode?: string
    materialDescription?: string
    quantity?: number
    stockQuantity?: number
    stockUnit?: string
    warehouse?: string
    warehouseId?: string
    location?: string
    binId?: string | null
    batchNo?: string
    gift?: boolean
  }
  serialNos: string[]
  serialManagementEnabled?: boolean
  amount: number
}

export interface ScmReceiptTargetListLine extends ScmReceiptTargetLine {
  targetDocumentId: string
}

export interface ScmReceiptTargetQuery {
  id?: string
  keyword?: string
  status?: string
  tenantId?: string
  projectId?: string
  constructionNo?: string
  from?: number
  to?: number
}

export interface ScmReceiptProjectOption {
  id: string
  tenantId: string
  projectCode: string
  projectName: string
}

export interface ScmReceiptPlacementWarehouse {
  id: string
  warehouseCode: string
  warehouseName: string
  enableLocations: boolean
}

export interface ScmReceiptPlacementBin {
  id: string
  warehouseId: string
  binCode: string
  binName: string
  supportsSerial: boolean
}

const { supabase, responseHandle } = useSupabase()

export async function fetchScmReceiptTargets(
  kind: ScmReceiptTargetKind,
  query: ScmReceiptTargetQuery = {}
) {
  let request = supabase
    .from('scm_receipt_target_document')
    .select(
      '*,source:scm_purchase_document!scm_receipt_target_document_source_receipt_id_fkey(document_no),project:mdm_project!scm_receipt_target_document_project_id_fkey(project_code,project_name),supplier:mdm_supplier!scm_receipt_target_document_supplier_id_fkey(supplier_code,supplier_name)',
      { count: 'exact' }
    )
    .eq('target_kind', kind)
    .order('created_at', { ascending: false })
    .range(query.from ?? 0, query.to ?? 999)
  if (query.status) request = request.eq('status', query.status)
  if (query.id) request = request.eq('id', query.id)
  if (query.tenantId) request = request.eq('tenant_id', query.tenantId)
  if (query.projectId) request = request.eq('project_id', query.projectId)
  if (query.constructionNo) request = request.eq('construction_no', query.constructionNo)
  if (query.keyword?.trim()) {
    request = request.ilike('document_no', `%${query.keyword.trim()}%`)
  }
  return responseHandle<ScmReceiptTargetDocument[]>(() => request, {
    showErrorMessage: true,
    errorMessage: '目标单据加载失败，请稍后重试'
  })
}

export async function fetchScmReceiptTargetLines(targetId: string) {
  const result = await responseHandle<ScmReceiptTargetLine[]>(
    () =>
      supabase
        .from('scm_receipt_target_line')
        .select('id,source_line_id,line_snapshot,serial_nos,amount')
        .eq('target_document_id', targetId)
        .order('created_at'),
    { breakReturn: true, showErrorMessage: true, errorMessage: '目标单据明细加载失败' }
  )
  const lines = result.data ?? []
  const materialIds = uniq(
    lines.map((line) => line.lineSnapshot.materialId).filter((id): id is string => Boolean(id))
  )
  if (!materialIds.length) return result
  const controls = await responseHandle<Array<{ id: string; serialManagementEnabled: boolean }>>(
    () =>
      supabase.from('mdm_material').select('id,serial_management_enabled').in('id', materialIds),
    { breakReturn: true, showErrorMessage: true, errorMessage: '物料 SN 管控信息加载失败' }
  )
  const enabledById = new Map(
    (controls.data ?? []).map((row) => [row.id, row.serialManagementEnabled])
  )
  return {
    ...result,
    data: lines.map((line) => ({
      ...line,
      serialManagementEnabled: enabledById.get(line.lineSnapshot.materialId || '') ?? false
    }))
  }
}

export async function fetchScmReceiptTargetLinesForDocuments(
  documentIds: string[]
): Promise<ScmReceiptTargetListLine[]> {
  const lineBatches: ScmReceiptTargetListLine[][] = []
  for (let offset = 0; offset < documentIds.length; offset += 100) {
    const ids = documentIds.slice(offset, offset + 100)
    const result = await fetchAllRangePages<ScmReceiptTargetListLine>(({ from, to }) =>
      responseHandle<ScmReceiptTargetListLine[]>(
        () =>
          supabase
            .from('scm_receipt_target_line')
            .select('id,target_document_id,source_line_id,line_snapshot,serial_nos,amount')
            .in('target_document_id', ids)
            .order('created_at')
            .range(from, to),
        { breakReturn: true, showErrorMessage: true, errorMessage: '目标单据明细加载失败' }
      )
    )
    if (result.error) throw result.error
    lineBatches.push(result.data ?? [])
  }
  return lineBatches.flat()
}

export async function setScmReceiptLineSerials(lineId: string, serialNos: string[]) {
  await responseHandle(
    () =>
      supabase.rpc('wms_set_receipt_line_serials_secure', {
        p_line_id: lineId,
        p_serial_nos: serialNos
      }),
    {
      breakReturn: true,
      showMessage: true,
      message: '收料 SN 已保存',
      errorMessage: 'SN 保存失败，请核对件数、重复编码与权限'
    }
  )
}

export async function fetchScmReceiptPlacementWarehouse(tenantId: string, warehouseId: string) {
  const { data } = await responseHandle<ScmReceiptPlacementWarehouse>(
    () =>
      supabase
        .from('mdm_warehouse')
        .select('id,warehouse_code,warehouse_name,enable_locations')
        .eq('tenant_id', tenantId)
        .eq('id', warehouseId)
        .single(),
    { breakReturn: true, showErrorMessage: true, errorMessage: '收料仓库加载失败，请重试' }
  )
  return data
}

export async function fetchScmReceiptPlacementBins(tenantId: string, warehouseId: string) {
  const { data, error } = await fetchAllRangePages<ScmReceiptPlacementBin>(({ from, to }) =>
    responseHandle<ScmReceiptPlacementBin[]>(
      () =>
        supabase
          .from('mdm_warehouse_bin')
          .select('id,warehouse_id,bin_code,bin_name,supports_serial')
          .eq('tenant_id', tenantId)
          .eq('warehouse_id', warehouseId)
          .eq('status', 'available')
          .order('bin_code')
          .order('id')
          .range(from, to),
      { breakReturn: true, showErrorMessage: true, errorMessage: '可用库位加载失败，请重试' }
    )
  )
  if (error) throw error
  return data ?? []
}

export async function fetchScmReceiptPlacementBin(tenantId: string, binId: string) {
  const { data } = await responseHandle<ScmReceiptPlacementBin>(
    () =>
      supabase
        .from('mdm_warehouse_bin')
        .select('id,warehouse_id,bin_code,bin_name,supports_serial')
        .eq('tenant_id', tenantId)
        .eq('id', binId)
        .eq('status', 'available')
        .single(),
    { breakReturn: true, showErrorMessage: true, errorMessage: '库位加载失败，请重试' }
  )
  return data
}

export async function recommendScmReceiptPlacementBin(input: {
  warehouseId: string
  materialId: string
  quantity: number
}) {
  const { data } = await responseHandle<string | null>(
    () =>
      supabase.rpc('wms_recommend_bin_secure', {
        p_warehouse_id: input.warehouseId,
        p_material_id: input.materialId,
        p_quantity: input.quantity,
        p_area_sqm: null
      }),
    { breakReturn: true, showErrorMessage: true, errorMessage: '自动选位失败，请稍后重试' }
  )
  return data ?? null
}

export async function setScmReceiptLineBin(lineId: string, binId: string | null) {
  await responseHandle(
    () => supabase.rpc('wms_set_receipt_line_bin_secure', { p_line_id: lineId, p_bin_id: binId }),
    {
      breakReturn: true,
      showMessage: true,
      message: '入库库位已保存',
      errorMessage: '库位保存失败，请核对仓库、物料、容量及权限'
    }
  )
}

export async function transitionScmReceiptTarget(id: string, kind: ScmReceiptTargetKind) {
  return responseHandle<void>(
    () =>
      supabase.rpc('scm_transition_receipt_target_secure', {
        p_target_id: id,
        p_action: kind === 'inbound' ? 'confirm' : 'approve'
      }),
    {
      breakReturn: true,
      showMessage: true,
      message: kind === 'inbound' ? '已确认入库并写入库存流水' : '资产应付已审核',
      errorMessage: kind === 'inbound' ? '入库确认失败，请检查仓库与库存数量' : '应付审核失败'
    }
  )
}

export async function fetchScmReceiptProjectSections(projectId: string) {
  const { data } = await responseHandle<
    Array<{ constructionNo: string; sectionName: string; status: 'active' | 'closed' }>
  >(
    () =>
      supabase
        .from('mdm_project_construction')
        .select('construction_no,section_name,status')
        .eq('project_id', projectId)
        .order('construction_no'),
    { breakReturn: true, showErrorMessage: true, errorMessage: '施工号加载失败，请重试' }
  )
  return data ?? []
}

export async function fetchScmReceiptProjectOptions(): Promise<ScmReceiptProjectOption[]> {
  const { data } = await responseHandle<ScmReceiptProjectOption[]>(
    () =>
      supabase
        .from('mdm_project')
        .select('id,tenant_id,project_code,project_name')
        .order('project_code'),
    { breakReturn: true, showErrorMessage: true, errorMessage: '项目选项加载失败，请重试' }
  )
  return data ?? []
}

export async function setScmReceiptScope(targetId: string, constructionNo: string) {
  await responseHandle(
    () =>
      supabase.rpc('wms_set_receipt_scope_secure', {
        p_target_id: targetId,
        p_construction_no: constructionNo
      }),
    {
      breakReturn: true,
      showMessage: true,
      message: '入库施工号已保存',
      errorMessage: '施工号保存失败，请核对项目状态与权限'
    }
  )
}
