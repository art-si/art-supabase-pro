import { useSupabase } from '@/hooks/core/useSupabase'
import { buildSupabaseRpcRange } from '@/utils/supabase/pagination'
import {
  parseMainlineCosts,
  parseVehicleFuelExecutions,
  type MainlinePage,
  type MainlineCostRecord,
  type VehicleFuelExecution
} from './mainline-operating.model'

export type {
  MainlineCostRecord,
  VehicleFuelExecution,
  MainlinePage
} from './mainline-operating.model'

const { supabase, responseHandle } = useSupabase()

export async function fetchMainlineCosts(query: {
  vehicleId?: string
  driverId?: string
  from?: number
  to?: number
}): Promise<MainlinePage<MainlineCostRecord>> {
  if (Boolean(query.vehicleId) === Boolean(query.driverId)) {
    throw new Error('请选择车辆或司机查询费用')
  }
  const from = query.from ?? 0
  const result = await responseHandle<unknown>(
    () =>
      supabase.rpc('tms_list_mainline_costs_secure', {
        p_vehicle_id: query.vehicleId || null,
        p_driver_id: query.driverId || null,
        ...buildSupabaseRpcRange(from, query.to ?? from + 19)
      }),
    { breakReturn: true, showErrorMessage: false, errorMessage: '费用流水加载失败，请重试' }
  )
  return parseMainlineCosts(result.data)
}

export async function fetchVehicleFuelExecutions(query: {
  vehicleId: string
  from?: number
  to?: number
}): Promise<MainlinePage<VehicleFuelExecution>> {
  if (!query.vehicleId) throw new Error('缺少车辆标识')
  const from = query.from ?? 0
  const result = await responseHandle<unknown>(
    () =>
      supabase.rpc('vms_list_vehicle_fuel_execution_secure', {
        p_vehicle_id: query.vehicleId,
        ...buildSupabaseRpcRange(from, query.to ?? from + 19)
      }),
    { breakReturn: true, showErrorMessage: false, errorMessage: '车辆油耗记录加载失败，请重试' }
  )
  return parseVehicleFuelExecutions(result.data)
}
