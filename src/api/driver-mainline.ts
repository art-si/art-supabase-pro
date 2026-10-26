import { useSupabase } from '@/hooks/core/useSupabase'
import { buildSupabaseRpcRange } from '@/utils/supabase/pagination'
import {
  parseDriverQualificationPage,
  parseDriverSafetyPage,
  parseDriverTrainingResult,
  type DriverQualificationPage,
  type DriverSafetyKind,
  type DriverSafetyPage,
  type DriverTrainingResult
} from './driver-mainline.model'

export type {
  DriverQualification,
  DriverQualificationPage,
  DriverSafetyKind,
  DriverSafetyPage,
  DriverSafetyRecord,
  DriverTraining,
  DriverTrainingResult
} from './driver-mainline.model'

const { supabase, responseHandle } = useSupabase()

export async function fetchDriverSafetyPage(
  driverId: string,
  kind: DriverSafetyKind,
  from = 0,
  to = 19
): Promise<DriverSafetyPage> {
  const result = await responseHandle<unknown>(
    () =>
      supabase.rpc('tms_list_driver_mainline_safety_secure', {
        p_driver_id: driverId,
        p_kind: kind,
        ...buildSupabaseRpcRange(from, to)
      }),
    {
      breakReturn: true,
      showErrorMessage: false,
      errorMessage: '司机安全记录加载失败，请重试'
    }
  )
  return parseDriverSafetyPage(result.data, kind)
}

export async function fetchDriverQualificationPage(
  driverId: string,
  from = 0,
  to = 19
): Promise<DriverQualificationPage> {
  const result = await responseHandle<unknown>(
    () =>
      supabase.rpc('tms_list_driver_mainline_qualifications_secure', {
        p_driver_id: driverId,
        ...buildSupabaseRpcRange(from, to)
      }),
    {
      breakReturn: true,
      showErrorMessage: false,
      errorMessage: '司机资质加载失败，请重试'
    }
  )
  return parseDriverQualificationPage(result.data)
}

/** Uses the HR profile reader, including its employee permission and career-record field policy. */
export async function fetchDriverTrainingResult(employeeId: string): Promise<DriverTrainingResult> {
  const result = await responseHandle<unknown>(
    () => supabase.rpc('hr_get_employee_profile_secure', { p_employee_id: employeeId }),
    {
      breakReturn: true,
      showErrorMessage: false,
      errorMessage: '司机培训记录加载失败，请重试'
    }
  )
  return parseDriverTrainingResult(result.data)
}
