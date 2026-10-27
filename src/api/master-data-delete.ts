import { useSupabase } from '@/hooks/core/useSupabase'
import { fetchAllRangePages } from '@/utils/supabase/pagination'
import type { DeleteReferenceContext } from '@/utils/supabase/delete-reference'

export interface RecordDeleteDependency extends Omit<
  MasterDataDeleteDependencyDetail,
  'dependencyCode' | 'cleanupAllowed' | 'createdAt'
> {
  sourceTable: string
  createdAt: string | null
}

const scopedDeleteReaders: Partial<Record<string, string>> = {
  tms_contract: 'get_tms_contract_delete_dependencies_secure',
  vehicle_maintenance_record: 'vms_get_maintenance_delete_dependencies_secure',
  fms_payable_writeoff_automation: 'get_fms_payable_automation_delete_dependencies_secure',
  mdm_payment_term: 'get_mdm_payable_master_delete_dependencies_secure',
  mdm_payment_purpose: 'get_mdm_payable_master_delete_dependencies_secure',
  mdm_settlement_method: 'get_mdm_payable_master_delete_dependencies_secure',
  mdm_document_type: 'get_mdm_document_type_delete_dependencies_secure',
  fms_travel_application: 'get_fms_travel_application_delete_dependencies_secure',
  fms_travel_loan: 'get_fms_travel_loan_delete_dependencies_secure',
  tms_expense_reimbursement: 'get_fms_reimbursement_delete_dependencies_secure',
  fms_payee_information: 'get_fms_payee_delete_dependencies_secure',
  fms_travel_repayment: 'get_fms_repayment_delete_dependencies_secure',
  mdm_position: 'hr_get_position_delete_dependencies_secure'
}

export async function fetchRecordDeleteDependencies(
  context: DeleteReferenceContext
): Promise<RecordDeleteDependency[]> {
  const { data, error } = await fetchAllRangePages<RecordDeleteDependency>(({ from, to }) =>
    responseHandle<RecordDeleteDependency[]>(
      () => {
        const reader = scopedDeleteReaders[context.table]
        const query = supabase.rpc(reader ?? 'get_record_delete_dependency_details', {
          ...(reader && reader !== 'get_mdm_payable_master_delete_dependencies_secure'
            ? {}
            : { p_table: context.table }),
          p_ids: context.ids,
          p_constraint: context.constraint ?? null
        })
        return query.range(from, to)
      },
      { breakReturn: true, showErrorMessage: false, errorMessage: '关联记录检查失败，请重试' }
    )
  )
  if (error || !data) throw new Error('关联记录检查失败，请重试', { cause: error })
  return data
}

export type MasterDataDeleteResourceType =
  | 'carrier'
  | 'driver'
  | 'cargo'
  | 'customer_address'
  | 'vehicle'
  | 'organization'
  | 'role'
  | 'menu'
  | 'dict_type'
  | 'dictionary'
  | 'attachment'
  | 'order'

export interface MasterDataDeleteDependencyDetail {
  resourceId: string
  dependencyCode: string
  recordId: string
  targetId: string
  recordNo: string
  recordSummary?: string | null
  recordStatus?: string | null
  recordAmount?: number | null
  createdAt: string
  cleanupAllowed: boolean
}

export interface CleanupMasterDataDeleteDependencyPayload {
  resourceType: MasterDataDeleteResourceType
  resourceIds: string[]
  dependencyCode: string
  recordIds: string[]
}

const { supabase, responseHandle } = useSupabase()

export async function deleteSupplierMasterRecords(ids: string[]) {
  return await responseHandle<number>(
    () => supabase.rpc('smis_delete_suppliers_secure', { p_ids: ids }),
    {
      breakReturn: true,
      showErrorMessage: false,
      requireAffected: true,
      noAffectedMessage: '所选供应商未删除，请刷新列表核对权限和数据状态后重试',
      errorMessage: '供应商删除失败，请检查业务引用后重试'
    }
  )
}

export type VehicleReminderDeleteSourceType =
  'insurance' | 'inspection' | 'maintenance' | 'part' | 'vehicle'

export interface VehicleReminderDeleteDestination {
  sourceType: VehicleReminderDeleteSourceType
  sourceKey: string
}

export async function fetchEquipmentInspectionDeleteDestination(
  inspectionId: string
): Promise<{ equipmentId: string } | null> {
  const { data } = await responseHandle<{ equipmentId: string }>(
    () =>
      supabase
        .from('smis_equipment_inspection')
        .select('equipmentId:equipment_id')
        .eq('id', inspectionId)
        .maybeSingle(),
    { breakReturn: true, showErrorMessage: false }
  )
  return data ?? null
}

export async function fetchVehicleBackupDriverDeleteDestination(
  linkId: string
): Promise<{ vehicleId: string } | null> {
  const { data } = await responseHandle<{ vehicleId: string }>(
    () =>
      supabase
        .from('vehicle_backup_driver')
        .select('vehicleId:vehicle_id')
        .eq('id', linkId)
        .maybeSingle(),
    { breakReturn: true, showErrorMessage: false }
  )
  return data ?? null
}

export async function fetchWmsDocumentDeleteDestination(
  table:
    | 'wms_purchase_document'
    | 'wms_sales_document'
    | 'wms_production_material_document'
    | 'wms_count_adjustment_document'
    | 'wms_transfer_business_document',
  documentId: string
): Promise<{ kind: string } | null> {
  const { data } = await responseHandle<{ kind: string }>(
    () => supabase.from(table).select('kind').eq('id', documentId).maybeSingle(),
    { breakReturn: true, showErrorMessage: false }
  )
  return data && typeof data.kind === 'string' ? data : null
}

export async function fetchScmPurchaseDeleteDestination(
  documentId: string
): Promise<{ kind: string } | null> {
  const { data } = await responseHandle<{ kind: string }>(
    () => supabase.from('scm_purchase_document').select('kind').eq('id', documentId).maybeSingle(),
    { breakReturn: true, showErrorMessage: false }
  )
  return data && typeof data.kind === 'string' ? data : null
}

export async function fetchScmSalesDeleteDestination(
  documentId: string
): Promise<{ kind: string } | null> {
  const { data } = await responseHandle<{ kind: string }>(
    () => supabase.from('scm_sales_document').select('kind').eq('id', documentId).maybeSingle(),
    { breakReturn: true, showErrorMessage: false }
  )
  return data && typeof data.kind === 'string' ? data : null
}

export async function fetchVehicleReminderDeleteDestination(
  workOrderId: string
): Promise<VehicleReminderDeleteDestination | null> {
  const { data } = await responseHandle<VehicleReminderDeleteDestination>(
    () =>
      supabase
        .from('vehicle_reminder_work_order')
        .select('sourceType:source_type,sourceKey:source_key')
        .eq('id', workOrderId)
        .maybeSingle(),
    { breakReturn: true, showErrorMessage: false }
  )
  return data ?? null
}

export async function fetchMasterDataDeleteDependencies(
  resourceType: MasterDataDeleteResourceType,
  resourceIds: string[]
): Promise<MasterDataDeleteDependencyDetail[]> {
  if (!resourceIds.length) return []
  const { data } = await responseHandle<MasterDataDeleteDependencyDetail[]>(
    () => {
      if (resourceType === 'attachment') {
        return supabase.rpc('get_attachment_delete_dependency_details', {
          p_resource_ids: resourceIds
        })
      }
      return supabase.rpc('get_governed_delete_dependency_details', {
        p_resource_type: resourceType,
        p_resource_ids: resourceIds
      })
    },
    { breakReturn: true, showErrorMessage: false }
  )
  return (data ?? []).map((item) => ({
    ...item,
    cleanupAllowed: Boolean(item.cleanupAllowed),
    recordAmount:
      item.recordAmount === null || item.recordAmount === undefined
        ? null
        : Number(item.recordAmount)
  }))
}

export async function cleanupMasterDataDeleteDependencies(
  payload: CleanupMasterDataDeleteDependencyPayload
): Promise<number> {
  if (!payload.resourceIds.length || !payload.recordIds.length) return 0
  const { data } = await responseHandle<number>(
    () =>
      supabase.rpc('cleanup_governed_delete_dependencies', {
        p_resource_type: payload.resourceType,
        p_resource_ids: payload.resourceIds,
        p_dependency_code: payload.dependencyCode,
        p_record_ids: payload.recordIds
      }),
    { breakReturn: true }
  )
  return Number(data) || 0
}
