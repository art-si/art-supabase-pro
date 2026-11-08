import { get, set, uniq } from 'lodash-es'
import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
import {
  isPrivateAttachmentPath,
  signPrivateAttachmentPaths
} from '@/utils/supabase/private-attachment'
import { useSupabase } from '@/hooks/core/useSupabase'
import { buildSupabasePageRange } from '@/utils/supabase/pagination'
import { normalizeNullableText } from '@/utils/form/normalize'
import type { DataSelectFetchParams } from '@/components/core/forms/art-data-select/types'

export type VehicleDriverChoiceSource =
  | 'approved_vehicle'
  | 'insurance_vehicle'
  | 'energy_vehicle'
  | 'vehicle_driver'
  | 'archive_driver'
  | 'carrier_vehicle'
  | 'carrier_driver'
  | 'agreement_driver'
  | 'commission_vehicle'
  | 'asset_vehicle'

export interface VehicleDriverChoiceContext {
  tenantId?: string | null
  vehicleId?: string | null
  carrierId?: string | null
  accountSetId?: string | null
  vehicleOwnership?: string
  driverType?: 'primary' | 'secondary'
  isNewEnergy?: boolean
}

/** Secure, paginated candidates. Every purpose retains its server-owned authorization and scope. */
export async function fetchVehicleDriverChoices<T extends object>(
  source: VehicleDriverChoiceSource,
  params: DataSelectFetchParams,
  context: VehicleDriverChoiceContext = {}
) {
  const { supabase, responseHandle } = useSupabase()
  const { from, to } = buildSupabasePageRange({ current: params.page, size: params.pageSize })
  const result = await responseHandle<{ records: T[]; total: number }>(
    () =>
      supabase.rpc('list_vehicle_driver_choices_secure', {
        p_source: source,
        p_from: from,
        p_to: to,
        p_keyword: normalizeNullableText(params.keyword),
        p_context: context
      }),
    { showErrorMessage: false }
  )
  if (result.error) throw result.error
  const data = result.data?.records ?? []
  await prepareVehicleDriverPortraits(data)
  return { data, total: result.data?.total ?? 0 }
}

/** Sign only server-authorized photo paths, once for the current page. */
export async function prepareVehicleDriverPortraits<T extends object>(rows: T[]): Promise<void> {
  const photos = rows.flatMap((row) =>
    ['portraitUrl', 'primaryDriver.portraitUrl'].flatMap((path) => {
      const value: unknown = get(row, path)
      return typeof value === 'string' && isPrivateAttachmentPath(value)
        ? [{ row, path, value }]
        : []
    })
  )
  if (!photos.length) return
  try {
    const previews = await signPrivateAttachmentPaths(
      'tms-driver-private',
      uniq(photos.map((photo) => photo.value))
    )
    for (const photo of photos)
      set(
        photo.row,
        photo.path.replace(/portraitUrl$/, 'portraitPreviewUrl'),
        previews.get(photo.value) ?? null
      )
  } catch (error) {
    notifyFriendlyError(error, '司机照片暂时无法预览，仍可按姓名和车牌选择')
  }
}
