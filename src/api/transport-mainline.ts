import { useSupabase } from '@/hooks/core/useSupabase'
import { isPlainObjectRecord } from '@/utils/type-guards'

/** One order-to-waybill execution link. An order may have several of these rows. */
export interface TransportMainlineRelation {
  tenantId: string
  orderId: string
  orderNo: string
  orderStatus: string
  waybillId: string | null
  waybillNo: string | null
  waybillStatus: string | null
  vehicleId: string | null
  plateNo: string | null
  driverId: string | null
  driverName: string | null
  departedAt: string | null
  completedAt: string | null
}

export interface TransportMainlineQuery {
  orderIds?: string[]
  vehicleId?: string
  driverId?: string
  /** Zero-based inclusive page start. */
  from?: number
  /** Zero-based inclusive page end. The server caps each page at 100 rows. */
  to?: number
}

const { supabase, responseHandle } = useSupabase()

function readRequiredText(row: Record<string, unknown>, key: string): string {
  const value = row[key]
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('主线关联数据不完整，请刷新后重试')
  }
  return value
}

function readNullableText(row: Record<string, unknown>, key: string): string | null {
  const value = row[key]
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') {
    throw new Error('主线关联数据格式异常，请刷新后重试')
  }
  return value
}

export function parseTransportMainlineRelations(value: unknown): {
  data: TransportMainlineRelation[]
  total: number
} {
  if (!isPlainObjectRecord(value) || !Array.isArray(value.records)) {
    throw new Error('主线关联查询结果异常，请刷新后重试')
  }
  if (typeof value.total !== 'number' || !Number.isSafeInteger(value.total) || value.total < 0) {
    throw new Error('主线关联查询总数异常，请刷新后重试')
  }

  const data = value.records.map((item: unknown) => {
    if (!isPlainObjectRecord(item)) {
      throw new Error('主线关联数据格式异常，请刷新后重试')
    }
    const row = item
    return {
      tenantId: readRequiredText(row, 'tenantId'),
      orderId: readRequiredText(row, 'orderId'),
      orderNo: readRequiredText(row, 'orderNo'),
      orderStatus: readRequiredText(row, 'orderStatus'),
      waybillId: readNullableText(row, 'waybillId'),
      waybillNo: readNullableText(row, 'waybillNo'),
      waybillStatus: readNullableText(row, 'waybillStatus'),
      vehicleId: readNullableText(row, 'vehicleId'),
      plateNo: readNullableText(row, 'plateNo'),
      driverId: readNullableText(row, 'driverId'),
      driverName: readNullableText(row, 'driverName'),
      departedAt: readNullableText(row, 'departedAt'),
      completedAt: readNullableText(row, 'completedAt')
    } satisfies TransportMainlineRelation
  })
  return { data, total: value.total }
}

export async function fetchTransportMainlineRelations(
  query: TransportMainlineQuery
): Promise<{ data: TransportMainlineRelation[]; total: number }> {
  const from = Math.max(0, Math.floor(query.from ?? 0))
  const to = Math.max(from, Math.floor(query.to ?? from + 49))
  const result = await responseHandle<unknown>(
    () =>
      supabase.rpc('tms_list_transport_mainline_relations_secure', {
        p_order_ids: query.orderIds?.length ? query.orderIds : null,
        p_vehicle_id: query.vehicleId || null,
        p_driver_id: query.driverId || null,
        p_from: from,
        p_to: to
      }),
    {
      breakReturn: true,
      showErrorMessage: false,
      errorMessage: '主线关联查询失败，请刷新后重试'
    }
  )
  return parseTransportMainlineRelations(result.data)
}

/** Current, departed execution links for one driver, paged independently from history. */
export async function fetchCurrentDriverMainlineRelations(
  driverId: string,
  from = 0,
  to = 19
): Promise<{ data: TransportMainlineRelation[]; total: number }> {
  const pageFrom = Math.max(0, Math.floor(from))
  const pageTo = Math.max(pageFrom, Math.floor(to))
  const result = await responseHandle<unknown>(
    () =>
      supabase.rpc('tms_list_current_driver_mainline_relations_secure', {
        p_driver_id: driverId,
        p_from: pageFrom,
        p_to: pageTo
      }),
    {
      breakReturn: true,
      showErrorMessage: false,
      errorMessage: '当前出车查询失败，请刷新后重试'
    }
  )
  return parseTransportMainlineRelations(result.data)
}
