import { fetchWmsInventoryOrganizationOptions } from './wms-inventory-organization'
import { useSupabase } from '@/hooks/core/useSupabase'
import { buildOrIlikeFilter } from '@/utils/supabase/search'
import { buildSupabasePageRange, fetchAllRangePages } from '@/utils/supabase/pagination'
import { loadAllDocumentPages } from '@/utils/business/document-detail-list'
import type {
  WmsInitializationStatusRow,
  WmsPendingInitializationDocument,
  WmsPurchaseBin,
  WmsPurchaseDocument,
  WmsPurchaseKind,
  WmsPurchaseListRow,
  WmsPurchaseMaterial,
  WmsPurchaseOption,
  WmsPurchaseOrderTarget,
  WmsPurchasePayload,
  WmsPurchaseSourceBatch,
  WmsPurchaseUnit,
  WmsPurchaseWarehouse
} from './wms-purchase.types'

export * from './wms-purchase.types'

const { supabase, responseHandle, keysToSnakeDeep } = useSupabase()
const readOptions = {
  breakReturn: true,
  showErrorMessage: false,
  errorMessage: '采购库存单据加载失败，请重试'
}
const writeOptions = {
  breakReturn: true,
  showMessage: true,
  showErrorMessage: true,
  requireAffected: false,
  errorMessage: '采购库存单据操作失败，请检查数据与权限'
}

const documentSelect = `*,
 organization:mdm_organization!wms_purchase_document_organization_id_fkey(organization_name,organization_code),
 supplier:mdm_supplier!wms_purchase_document_supplier_id_fkey(supplier_name,supplier_code),
 customer:mdm_customer!wms_purchase_document_customer_id_fkey(customer_name,customer_code),
 purchaser:mdm_employee!wms_purchase_document_purchaser_id_fkey(id,tenant_id,employee_no,employee_name,employment_status),
 keeper:mdm_employee!wms_purchase_document_keeper_id_fkey(id,tenant_id,employee_no,employee_name,employment_status),
 lines:wms_purchase_document_line(*,
 purchaser:mdm_employee!wms_purchase_line_purchaser_tenant_fk(id,tenant_id,employee_no,employee_name,employment_status),
 keeper:mdm_employee!wms_purchase_document_line_keeper_id_fkey(id,tenant_id,employee_no,employee_name,employment_status),
 bin:mdm_warehouse_bin!wms_purchase_document_line_bin_id_fkey(bin_name,bin_code),
 material:mdm_material!wms_purchase_document_line_material_id_fkey(id,tenant_id,code:material_code,name:material_name,description,specification_model,inventory_unit_id,base_unit_id,auxiliary_unit_id,auxiliary_unit_2_id,unit_conversions,serial_management_enabled,batch_management_enabled),
 project:mdm_project!wms_purchase_document_line_project_id_fkey(id,tenant_id,code:project_code,name:project_name))`

interface OrderTargetRecord {
  id: string
  tenantId: string
  documentNo: string
  projectId: string | null
  supplierId: string
  status: 'draft' | 'partial' | 'completed'
  source: {
    documentNo: string
    details: { buyer?: string; keeper?: string; constructionNo?: string }
  } | null
}

interface OrderTargetLineRecord {
  id: string
  sourceLineId: string
  lineSnapshot: Record<string, unknown>
}

interface OrderTargetRemainingRecord {
  targetLineId: string
  orderedQuantity: number
  receivedQuantity: number
  remainingQuantity: number
}

export async function fetchWmsPurchaseOrderTargets(
  tenantId?: string
): Promise<OrderTargetRecord[]> {
  return loadAllDocumentPages<OrderTargetRecord, { tenantId?: string; from?: number; to?: number }>(
    ({ tenantId, from = 0, to = 499 }) => {
      let request = supabase
        .from('scm_order_target_document')
        .select(
          'id,tenant_id,document_no,project_id,supplier_id,status,source:scm_purchase_document!scm_order_target_document_source_order_id_fkey(document_no)',
          { count: 'exact' }
        )
        .eq('target_kind', 'purchase_inbound')
        .in('status', ['draft', 'partial'])
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to)
      if (tenantId) request = request.eq('tenant_id', tenantId)
      return responseHandle<OrderTargetRecord[]>(() => request, readOptions)
    },
    { tenantId }
  )
}

export async function fetchWmsPurchaseOrderTarget(id: string): Promise<WmsPurchaseOrderTarget> {
  const { data: target } = await responseHandle<OrderTargetRecord>(
    () =>
      supabase
        .from('scm_order_target_document')
        .select(
          'id,tenant_id,document_no,project_id,supplier_id,status,source:scm_purchase_document!scm_order_target_document_source_order_id_fkey(document_no,details)'
        )
        .eq('id', id)
        .eq('target_kind', 'purchase_inbound')
        .single(),
    readOptions
  )
  if (!target) throw new Error('采购订单下推目标不存在或无权查看')
  const [{ data: sourceLines }, { data: remainingRows }] = await Promise.all([
    responseHandle<OrderTargetLineRecord[]>(
      () =>
        supabase
          .from('scm_order_target_line')
          .select('id,source_line_id,line_snapshot')
          .eq('target_document_id', id)
          .eq('tenant_id', target.tenantId)
          .order('created_at'),
      readOptions
    ),
    responseHandle<OrderTargetRemainingRecord[]>(
      () => supabase.rpc('wms_purchase_order_target_remaining', { p_target_id: id }),
      readOptions
    )
  ])
  const rawLines = sourceLines ?? []
  const remainingById = new Map((remainingRows ?? []).map((row) => [row.targetLineId, row]))
  if (remainingById.size !== rawLines.length) throw new Error('采购订单剩余数量加载失败，请重试')
  const materialIds: string[] = []
  for (const line of rawLines) {
    if (typeof line.lineSnapshot.materialId === 'string')
      materialIds.push(line.lineSnapshot.materialId)
  }
  if (!rawLines.length || materialIds.length !== rawLines.length) {
    throw new Error('采购订单下推明细缺少有效物料')
  }
  const { data: materials } = await responseHandle<WmsPurchaseMaterial[]>(
    () =>
      supabase
        .from('mdm_material')
        .select(
          'id,tenant_id,code:material_code,name:material_name,description,specification_model,inventory_unit_id,base_unit_id,auxiliary_unit_id,auxiliary_unit_2_id,unit_conversions,serial_management_enabled,batch_management_enabled'
        )
        .eq('tenant_id', target.tenantId)
        .eq('status', 'enabled')
        .in('id', materialIds),
    readOptions
  )
  const materialById = new Map((materials ?? []).map((material) => [material.id, material]))
  const lines = rawLines
    .map((line, index) => {
      const snapshot = line.lineSnapshot
      const material = materialById.get(String(snapshot.materialId))
      const remaining = remainingById.get(line.id)
      const quantity = Number(remaining?.remainingQuantity)
      const unitCode = snapshot.unit
      if (!material || !Number.isFinite(quantity) || quantity < 0 || typeof unitCode !== 'string') {
        throw new Error(`采购订单下推第 ${index + 1} 行物料、单位或数量无效`)
      }
      const ownerType: 'self' | 'supplier' | 'customer' =
        snapshot.ownerType === 'supplier' || snapshot.ownerType === 'customer'
          ? snapshot.ownerType
          : 'self'
      return {
        id: line.id,
        sourceLineId: line.sourceLineId,
        lineNo: Number(snapshot.lineNo) || (index + 1) * 10,
        material,
        orderedQuantity: Number(remaining?.orderedQuantity) || 0,
        receivedQuantity: Number(remaining?.receivedQuantity) || 0,
        quantity,
        unitCode,
        unitPrice: Number(snapshot.unitPrice) || 0,
        taxRate: Number(snapshot.taxRate) || 0,
        discountRate: Number(snapshot.discountRate) || 0,
        gift: snapshot.gift === true,
        ownerType,
        ownerId: typeof snapshot.ownerId === 'string' ? snapshot.ownerId : null,
        warehouseId: typeof snapshot.warehouseId === 'string' ? snapshot.warehouseId : null,
        binId: typeof snapshot.binId === 'string' ? snapshot.binId : null,
        batchNo: typeof snapshot.batchNo === 'string' ? snapshot.batchNo : '',
        serialNos: Array.isArray(snapshot.serialNumbers)
          ? snapshot.serialNumbers.filter((value): value is string => typeof value === 'string')
          : []
      }
    })
    .filter((line) => line.quantity > 0)
  if (!lines.length) throw new Error('采购订单明细已全部入库')
  return {
    id: target.id,
    tenantId: target.tenantId,
    documentNo: target.documentNo,
    sourceOrderNo: target.source?.documentNo || target.documentNo,
    projectId: target.projectId,
    supplierId: target.supplierId,
    purchaserId: target.source?.details?.buyer || null,
    keeperId: target.source?.details?.keeper || null,
    constructionNo: target.source?.details?.constructionNo || null,
    lines
  }
}

export interface WmsPurchasePageQuery {
  kind: WmsPurchaseKind
  documentId?: string
  documentIds?: string[]
  tenantId?: string
  status?: string
  supplier?: string
  projectName?: string
  materialDescription?: string
  materialCode?: string
  current: number
  size: number
}

/** Page parent records; matching embeds filter documents without truncating their sibling lines. */
export async function fetchWmsPurchaseDocumentIdPage(
  query: WmsPurchasePageQuery
): Promise<{ data: Array<{ id: string }>; total: number }> {
  const pageRange = buildSupabasePageRange(query)
  const projectFilter = query.projectName?.trim()
  const partyFilter = query.supplier?.trim()
  const entrusted = query.kind.startsWith('entrusted_processing_')
  const fields = [
    'id',
    `matchingLines:wms_purchase_document_line!wms_purchase_document_line_document_id_tenant_id_fkey!inner(
      material:mdm_material!wms_purchase_document_line_material_id_fkey!inner()
      ${projectFilter ? ',project:mdm_project!wms_purchase_document_line_project_id_fkey!inner()' : ''}
    )`,
    ...(partyFilter
      ? [
          entrusted
            ? 'party:mdm_customer!wms_purchase_document_customer_id_fkey!inner()'
            : 'party:mdm_supplier!wms_purchase_document_supplier_id_fkey!inner()'
        ]
      : [])
  ].join(',')
  let request = supabase
    .from('wms_purchase_document')
    .select(fields, { count: 'exact' })
    .order('create_time', { ascending: false })
    .order('id')
  request =
    query.kind === 'other_inbound'
      ? request.in('kind', ['other_inbound', 'other_return'])
      : request.eq('kind', query.kind)
  if (query.tenantId) request = request.eq('tenant_id', query.tenantId)
  if (query.status) request = request.eq('status', query.status)
  if (partyFilter)
    request = request.ilike(
      entrusted ? 'party.customer_name' : 'party.supplier_name',
      `%${partyFilter}%`
    )
  if (projectFilter)
    request = request.ilike('matchingLines.project.project_name', `%${projectFilter}%`)
  if (query.materialCode?.trim())
    request = request.ilike(
      'matchingLines.material.material_code',
      `%${query.materialCode.trim()}%`
    )
  if (query.materialDescription?.trim())
    request = request.ilike(
      'matchingLines.material.description',
      `%${query.materialDescription.trim()}%`
    )
  const { data, total } = await responseHandle<Array<{ id: string }>>(
    () => request.range(pageRange.from, pageRange.to),
    readOptions
  )
  return { data: data ?? [], total: total ?? 0 }
}

export async function fetchWmsPurchasePage(
  query: WmsPurchasePageQuery
): Promise<{ data: WmsPurchaseListRow[]; total: number }> {
  const pageRange = buildSupabasePageRange(query)
  if (query.documentIds && !query.documentIds.length) return { data: [], total: 0 }
  let request = supabase
    .from('wms_purchase_document_list')
    .select('*', { count: 'exact' })
    .order('create_time', { ascending: false })
    .order('document_id')
    .order('line_no')
    .order('line_id')
  request =
    query.kind === 'other_inbound'
      ? request.in('kind', ['other_inbound', 'other_return'])
      : request.eq('kind', query.kind)
  if (query.tenantId) request = request.eq('tenant_id', query.tenantId)
  if (query.documentId) request = request.eq('document_id', query.documentId)
  if (query.documentIds) request = request.in('document_id', query.documentIds)
  if (query.status) request = request.eq('status', query.status)
  if (query.supplier?.trim())
    request = request.ilike(
      query.kind.startsWith('entrusted_processing_') ? 'customer_name' : 'supplier_name',
      `%${query.supplier.trim()}%`
    )
  if (query.projectName?.trim())
    request = request.ilike('project_name', `%${query.projectName.trim()}%`)
  if (query.materialDescription?.trim())
    request = request.ilike('material_description', `%${query.materialDescription.trim()}%`)
  if (query.materialCode?.trim())
    request = request.ilike('material_code', `%${query.materialCode.trim()}%`)
  const { data, total } = await responseHandle<WmsPurchaseListRow[]>(
    () => request.range(pageRange.from, pageRange.to),
    readOptions
  )
  return { data: data ?? [], total: total ?? 0 }
}

export async function fetchWmsPurchaseDocument(id: string): Promise<WmsPurchaseDocument> {
  const { data } = await responseHandle<WmsPurchaseDocument>(
    () => supabase.from('wms_purchase_document').select(documentSelect).eq('id', id).single(),
    readOptions
  )
  if (!data) throw new Error('采购库存单据不存在或无权查看')
  return data
}

export async function saveWmsPurchaseDocument(payload: WmsPurchasePayload): Promise<string> {
  const { data } = await responseHandle<string>(
    () =>
      supabase.rpc('wms_save_purchase_document_secure', { p_payload: keysToSnakeDeep(payload) }),
    { ...writeOptions, message: '采购库存单据已暂存' }
  )
  if (!data) throw new Error('采购库存单据保存失败')
  return data
}

export async function changeWmsPurchaseStatus(
  id: string,
  action: 'submit' | 'approve' | 'withdraw' | 'delete'
): Promise<void> {
  await responseHandle(
    () =>
      supabase.rpc('wms_change_purchase_document_status_secure', {
        p_document_id: id,
        p_action: action
      }),
    {
      ...writeOptions,
      message:
        action === 'withdraw'
          ? '单据已撤回，可继续修改'
          : action === 'submit'
            ? '单据已提交'
            : action === 'approve'
              ? '单据已审核'
              : '单据已删除'
    }
  )
}

export async function fetchWmsInitializationStatusPage(query: {
  tenantId?: string
  keyword?: string
  status?: string
  current: number
  size: number
}): Promise<{ data: WmsInitializationStatusRow[]; total: number }> {
  const pageRange = buildSupabasePageRange(query)
  const rows = (await fetchWmsInventoryOrganizationOptions(query.tenantId, 'company'))
    .filter((row) => Boolean(row.enabledOn))
    .map((row): WmsInitializationStatusRow => ({
      ...row,
      initializationStatus: row.initializationClosedAt ? 'initialized' : 'not_initialized'
    }))
  const keyword = query.keyword?.trim().toLowerCase()
  const filtered = rows.filter(
    (row) =>
      (!keyword ||
        row.organizationCode.toLowerCase().includes(keyword) ||
        row.organizationName.toLowerCase().includes(keyword)) &&
      (!query.status || row.initializationStatus === query.status)
  )
  return {
    data: filtered.slice(pageRange.from, pageRange.to + 1),
    total: filtered.length
  }
}

export async function changeWmsInitializationStatus(
  organizationId: string,
  action: 'close' | 'reopen'
): Promise<void> {
  await responseHandle(
    () =>
      supabase.rpc('wms_change_initialization_status_secure', {
        p_organization_id: organizationId,
        p_action: action
      }),
    {
      ...writeOptions,
      showMessage: false,
      showErrorMessage: false,
      errorMessage: action === 'close' ? '结束初始化失败，请重试' : '反初始化失败，请重试'
    }
  )
}

export async function fetchWmsPendingInitializationDocuments(
  tenantId: string,
  organizationId: string
): Promise<WmsPendingInitializationDocument[]> {
  const options = {
    ...readOptions,
    errorMessage: '待处理初始化单据加载失败，请重试'
  }
  const [stock, purchase, sales] = await Promise.all([
    fetchAllRangePages<Record<string, unknown>>(({ from, to }) =>
      responseHandle<Record<string, unknown>[]>(
        () =>
          supabase
            .from('wms_initial_stock_document')
            .select('id,document_no,status')
            .eq('tenant_id', tenantId)
            .eq('organization_id', organizationId)
            .neq('status', 'approved')
            .order('id')
            .range(from, to),
        options
      )
    ),
    fetchAllRangePages<Record<string, unknown>>(({ from, to }) =>
      responseHandle<Record<string, unknown>[]>(
        () =>
          supabase
            .from('wms_purchase_document')
            .select('id,document_no,status,kind')
            .eq('tenant_id', tenantId)
            .eq('organization_id', organizationId)
            .eq('is_initialization', true)
            .neq('status', 'approved')
            .order('id')
            .range(from, to),
        options
      )
    ),
    fetchAllRangePages<Record<string, unknown>>(({ from, to }) =>
      responseHandle<Record<string, unknown>[]>(
        () =>
          supabase
            .from('wms_sales_document')
            .select('id,document_no,status,kind')
            .eq('tenant_id', tenantId)
            .eq('organization_id', organizationId)
            .eq('is_initialization', true)
            .neq('status', 'approved')
            .order('id')
            .range(from, to),
        options
      )
    )
  ])
  const queryError = stock.error ?? purchase.error ?? sales.error
  if (queryError || !stock.data || !purchase.data || !sales.data) {
    throw new Error('待处理初始化单据加载失败，请重试', { cause: queryError })
  }

  function normalize(
    rows: Record<string, unknown>[],
    source: WmsPendingInitializationDocument['source']
  ): WmsPendingInitializationDocument[] {
    return rows.map((row) => {
      if (
        typeof row.id !== 'string' ||
        typeof row.documentNo !== 'string' ||
        typeof row.status !== 'string'
      ) {
        throw new Error('待处理初始化单据数据异常，请刷新后重试')
      }
      return {
        id: row.id,
        source,
        kind: typeof row.kind === 'string' ? row.kind : null,
        documentNo: row.documentNo,
        status: row.status
      }
    })
  }

  return [
    ...normalize(stock.data, 'stock'),
    ...normalize(purchase.data, 'purchase'),
    ...normalize(sales.data, 'sales')
  ].sort((left, right) => left.documentNo.localeCompare(right.documentNo, 'zh-CN'))
}

export async function fetchWmsPurchaseMaterials(params: {
  tenantId: string
  keyword: string
  materialCode?: string
  categoryId?: string
  categoryIds?: string[]
  current: number
  size: number
}): Promise<{ data: WmsPurchaseMaterial[]; total: number }> {
  const pageRange = buildSupabasePageRange(params)
  let request = supabase
    .from('mdm_material')
    .select(
      'id,tenant_id,code:material_code,name:material_name,description,specification_model,inventory_unit_id,base_unit_id,auxiliary_unit_id,auxiliary_unit_2_id,unit_conversions,serial_management_enabled,batch_management_enabled',
      { count: 'exact' }
    )
    .eq('tenant_id', params.tenantId)
    .eq('status', 'enabled')
    .order('material_code')
    .order('id')
  if (params.categoryId) request = request.eq('category_id', params.categoryId)
  if (params.categoryIds?.length) request = request.in('category_id', params.categoryIds)
  if (params.materialCode !== undefined) request = request.eq('material_code', params.materialCode)
  else if (params.keyword.trim())
    request = request.or(
      buildOrIlikeFilter(['material_code', 'material_name', 'description'], params.keyword)
    )
  const { data, total } = await responseHandle<WmsPurchaseMaterial[]>(
    () => request.range(pageRange.from, pageRange.to),
    readOptions
  )
  return { data: data ?? [], total: total ?? 0 }
}

export async function fetchWmsPurchaseOptions(
  table:
    | 'mdm_document_type'
    | 'mdm_business_type'
    | 'mdm_project'
    | 'mdm_supplier'
    | 'mdm_customer'
    | 'mdm_organization',
  tenantId: string
): Promise<WmsPurchaseOption[]> {
  const config = {
    mdm_document_type: [
      'id,tenant_id,menu_ids,is_default,enabled,document_type_code,document_type_name',
      'documentTypeCode',
      'documentTypeName'
    ],
    mdm_business_type: [
      'id,tenant_id,document_type_id,document_type_ids,menu_ids,is_default,enabled,business_type_code,business_type_name,stock_movement',
      'businessTypeCode',
      'businessTypeName'
    ],
    mdm_project: ['id,tenant_id,project_code,project_name', 'projectCode', 'projectName'],
    mdm_supplier: ['id,tenant_id,supplier_code,supplier_name', 'supplierCode', 'supplierName'],
    mdm_customer: ['id,tenant_id,customer_code,customer_name', 'customerCode', 'customerName'],
    mdm_organization: [
      'id,tenant_id,organization_code,organization_name',
      'organizationCode',
      'organizationName'
    ]
  }[table]
  const { data } = await responseHandle<Record<string, unknown>[]>(
    () => supabase.from(table).select(config[0]).eq('tenant_id', tenantId).order('id'),
    readOptions
  )
  return (data ?? []).map((row) => {
    const code = row[config[1]]
    const name = row[config[2]]
    return {
      id: typeof row.id === 'string' ? row.id : '',
      tenantId: typeof row.tenantId === 'string' ? row.tenantId : '',
      code: typeof code === 'string' ? code : '',
      name: typeof name === 'string' ? name : '',
      documentTypeId: typeof row.documentTypeId === 'string' ? row.documentTypeId : undefined,
      documentTypeIds: Array.isArray(row.documentTypeIds)
        ? row.documentTypeIds.filter((id): id is string => typeof id === 'string')
        : undefined,
      isDefault: row.isDefault === true,
      enabled: row.enabled === true,
      stockMovement: typeof row.stockMovement === 'string' ? row.stockMovement : undefined,
      menuIds: Array.isArray(row.menuIds)
        ? row.menuIds.filter((id): id is string => typeof id === 'string')
        : undefined
    }
  })
}

export async function fetchWmsPurchaseDocumentTypes(
  tenantId: string,
  menuName: string
): Promise<WmsPurchaseOption[]> {
  const { data: menu } = await responseHandle<{ id: string }>(
    () => supabase.from('sys_menu').select('id').eq('name', menuName).eq('type', 'menu').single(),
    readOptions
  )
  if (!menu) return []
  const rows = await fetchWmsPurchaseOptions('mdm_document_type', tenantId)
  return rows.filter((row) => row.enabled && row.menuIds?.includes(menu.id))
}

export async function fetchWmsPurchaseMenuId(menuName: string): Promise<string> {
  const { data } = await responseHandle<{ id: string }>(
    () => supabase.from('sys_menu').select('id').eq('name', menuName).eq('type', 'menu').single(),
    readOptions
  )
  if (!data?.id) throw new Error('单据菜单功能未配置，请联系管理员')
  return data.id
}

export async function fetchWmsPurchaseWarehouses(
  tenantId?: string
): Promise<WmsPurchaseWarehouse[]> {
  let query = supabase
    .from('mdm_warehouse')
    .select('id,tenant_id,organization_id,warehouse_code,warehouse_name,status')
    .order('warehouse_code')
  if (tenantId) query = query.eq('tenant_id', tenantId)
  const { data } = await responseHandle<WmsPurchaseWarehouse[]>(() => query, readOptions)
  return data ?? []
}

export async function fetchWmsPurchaseBins(warehouseId: string): Promise<WmsPurchaseBin[]> {
  const { data } = await responseHandle<WmsPurchaseBin[]>(
    () =>
      supabase
        .from('mdm_warehouse_bin')
        .select('id,warehouse_id,bin_code,bin_name,status')
        .eq('warehouse_id', warehouseId)
        .order('bin_code'),
    readOptions
  )
  return data ?? []
}

export async function fetchWmsPurchaseSourceBatches(params: {
  tenantId: string
  organizationId: string
  materialId: string
  warehouseId: string
  binId: string | null
  projectId: string | null
  constructionNo: string | null
  ownerType: string
  ownerId: string | null
  stockType: string
  stockStatus: string
  keyword: string
  current: number
  size: number
}): Promise<{ data: WmsPurchaseSourceBatch[]; total: number }> {
  const pageRange = buildSupabasePageRange(params)
  let request = supabase
    .from('wms_inventory_batch')
    .select('id,batch_no,quantity,bin_id,received_at', { count: 'exact' })
    .eq('tenant_id', params.tenantId)
    .eq('organization_id', params.organizationId)
    .eq('material_id', params.materialId)
    .eq('warehouse_id', params.warehouseId)
    .eq('owner_type', params.ownerType)
    .eq('stock_type', params.stockType)
    .eq('status', params.stockStatus === 'available' ? 'normal' : params.stockStatus)
    .gt('quantity', 0)
    .order('received_at', { ascending: false })
    .order('id')
  request = params.binId ? request.eq('bin_id', params.binId) : request.is('bin_id', null)
  request = params.projectId
    ? request.eq('project_id', params.projectId)
    : request.is('project_id', null)
  request = params.constructionNo
    ? request.eq('construction_no', params.constructionNo)
    : request.is('construction_no', null)
  request = params.ownerId ? request.eq('owner_id', params.ownerId) : request.is('owner_id', null)
  if (params.keyword.trim()) request = request.ilike('batch_no', `%${params.keyword.trim()}%`)
  const { data, total } = await responseHandle<WmsPurchaseSourceBatch[]>(
    () => request.range(pageRange.from, pageRange.to),
    readOptions
  )
  return { data: data ?? [], total: total ?? 0 }
}

export async function fetchWmsPurchaseUnits(tenantId: string): Promise<WmsPurchaseUnit[]> {
  const { data } = await responseHandle<WmsPurchaseUnit[]>(
    () =>
      supabase
        .from('mdm_unit_of_measure')
        .select('id,tenant_id,unit_code,unit_name')
        .eq('tenant_id', tenantId)
        .order('unit_code'),
    readOptions
  )
  return data ?? []
}
