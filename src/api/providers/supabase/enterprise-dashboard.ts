import dayjs from 'dayjs'
import { useSupabase } from '@/hooks/core/useSupabase'
import { fetchDashboardData, type DashboardData } from './dashboard'
import type { SupabaseQueryLike } from './query'

const { supabase, responseHandle } = useSupabase()

export interface EnterpriseFleetSummary {
  total: number
  operating: number
  pendingAudit: number
  dueDocuments: number
}

export interface EnterpriseFinanceSummary {
  voucherCount: number
  postedAmount: number
  cashInflow: number
  cashOutflow: number
  receivable: number
  payable: number
  approvedWaybillCost: number
}

export interface EnterpriseWorkforceSummary {
  total: number
  active: number
  probation: number
  expiringContracts: number
}

export interface EnterpriseSafetySummary {
  openHazards: number
  overdueHazards: number
  overdueInspections: number
  recentAccidents: number
  equipmentTotal: number
  equipmentNormal: number
  criticalEquipment: number
}

export interface EnterpriseDashboardSummary {
  generatedAt: string
  fleet: EnterpriseFleetSummary
  finance: EnterpriseFinanceSummary
  workforce: EnterpriseWorkforceSummary
  safety: EnterpriseSafetySummary
}

export interface EnterpriseDashboardData extends EnterpriseDashboardSummary {
  transport: DashboardData
}

export interface AssetEquipmentSummary {
  total: number
  enabled: number
  normal: number
  maintenance: number
  fault: number
  idle: number
  critical: number
  connected: number
  unassigned: number
}

export interface AssetInspectionSummary {
  todayTotal: number
  todayCompleted: number
  pending: number
  overdue: number
  abnormal30d: number
}

export interface AssetMaintenanceSummary {
  enabledPlans: number
  pending: number
  overdue: number
  pendingConfirm: number
  completedMonth: number
  scheduled30Days: number
}

export interface AssetRepairSummary {
  open: number
  reported: number
  inProgress: number
  pendingConfirm: number
  overdue: number
  emergency: number
  completedMonth: number
}

export interface AssetDepartmentLoad {
  departmentName: string
  equipmentTotal: number
  faultCount: number
  openRepairCount: number
}

export interface AssetCategoryDistribution {
  categoryName: string
  value: number
}

export interface AssetActiveWorkOrder {
  id: string
  workOrderNo: string
  equipmentCode: string
  equipmentName: string
  departmentName: string | null
  urgency: 'normal' | 'urgent' | 'expedite' | 'emergency'
  status: 'reported' | 'in_progress' | 'pending_confirm'
  faultSymptom: string
  reportedAt: string
  requiredCompleteAt: string | null
  repairerName: string | null
  priority: string
}

export interface AssetUpcomingTask {
  id: string
  taskNo: string
  planKind: 'maintenance' | 'preventive'
  planName: string
  equipmentCode: string
  equipmentName: string
  departmentName: string | null
  plannedDate: string
  dueDate: string
  status: 'pending' | 'pending_confirm'
  responsibleName: string | null
}

export interface AssetMaintenanceDashboardData {
  generatedAt: string
  equipment: AssetEquipmentSummary
  inspection: AssetInspectionSummary
  maintenance: AssetMaintenanceSummary
  repair: AssetRepairSummary
  departmentLoad: AssetDepartmentLoad[]
  categoryDistribution: AssetCategoryDistribution[]
  activeWorkOrders: AssetActiveWorkOrder[]
  upcomingTasks: AssetUpcomingTask[]
}

function asDashboardQuery(query: unknown): SupabaseQueryLike {
  return query as SupabaseQueryLike
}

export async function fetchEnterpriseDashboardData(): Promise<EnterpriseDashboardData> {
  const [transport, enterpriseResult] = await Promise.all([
    fetchDashboardData('month'),
    responseHandle<EnterpriseDashboardSummary>(
      () =>
        asDashboardQuery(
          supabase.rpc('get_enterprise_dashboard', {
            p_reference_date: dayjs().format('YYYY-MM-DD')
          })
        ),
      {
        breakReturn: true,
        errorMessage: '企业经营大屏加载失败，请稍后重试'
      }
    )
  ])

  if (!enterpriseResult.data) throw new Error('企业经营大屏未返回可用数据')

  return {
    ...enterpriseResult.data,
    transport
  }
}

export async function fetchAssetMaintenanceDashboardData(): Promise<AssetMaintenanceDashboardData> {
  const result = await responseHandle<AssetMaintenanceDashboardData>(
    () =>
      asDashboardQuery(
        supabase.rpc('get_asset_maintenance_dashboard', {
          p_reference_date: dayjs().format('YYYY-MM-DD')
        })
      ),
    {
      breakReturn: true,
      errorMessage: '设备运维大屏加载失败，请稍后重试'
    }
  )

  if (!result.data) throw new Error('设备运维大屏未返回可用数据')
  return result.data
}
