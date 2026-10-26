import { useSupabase } from '@/hooks/core/useSupabase'
import {
  parseDriverCompensation,
  type DriverCompensationSummary
} from './driver-compensation.model'

export type {
  DriverCompensationRecord,
  DriverCompensationSummary
} from './driver-compensation.model'

const { supabase, responseHandle } = useSupabase()

export async function fetchDriverCompensation(
  driverId: string
): Promise<DriverCompensationSummary | null> {
  if (!driverId) throw new Error('缺少司机标识，请返回列表重新选择')
  const result = await responseHandle<unknown>(
    () => supabase.rpc('tms_get_driver_compensation_secure', { p_driver_id: driverId }),
    {
      breakReturn: true,
      showErrorMessage: false,
      errorMessage: '司机薪酬加载失败，请重试'
    }
  )
  return parseDriverCompensation(result.data)
}
