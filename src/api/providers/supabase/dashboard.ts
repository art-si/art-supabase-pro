import dayjs, { type Dayjs } from 'dayjs'
import { useSupabase } from '@/hooks/core/useSupabase'
import type { SupabaseQueryLike } from '@/api/providers/supabase/query'

const { supabase, responseHandle } = useSupabase()

export type DashboardReminderKey = 'insurance' | 'inspection' | 'maintenance' | 'part' | 'vehicle'
export type DashboardTrendPeriod = 'today' | 'week' | 'month' | 'year'

export interface DashboardOrder {
  id?: string
  orderNo: string
  orderStatus?: string | null
  dispatchStatus?: string | null
  originStation?: string | null
  destinationStation?: string | null
  shippingCustomerName?: string | null
  dispatchPlateNo?: string | null
  dispatchDriverName?: string | null
  plannedArrivalTime?: string | null
  totalFee?: number | string | null
  createTime?: string | null
}

export interface DashboardTrendPoint {
  date: string
  label: string
  orderCount: number
  freightAmount: number
}

export interface DashboardReminder {
  key: DashboardReminderKey
  label: string
  count: number
  severity: 'danger' | 'warning'
}

export interface DashboardData {
  todayOrderCount: number
  todayFreightAmount: number
  pendingDispatchCount: number
  inTransitCount: number
  vehicleCount: number
  operatingVehicleCount: number
  pendingAuditVehicleCount: number
  completedTodayCount: number
  trend: DashboardTrendPoint[]
  statusCounts: Record<string, number>
  transitOrders: DashboardOrder[]
  recentOrders: DashboardOrder[]
  reminders: DashboardReminder[]
}

interface DashboardOrderRow {
  id?: string
  orderNo: string
  orderStatus?: string | null
  dispatchStatus?: string | null
  originStation?: string | null
  destinationStation?: string | null
  shippingCustomerName?: string | null
  shippingCustomer?: {
    customerName?: string | null
  } | null
  dispatchPlateNo?: string | null
  dispatchDriverName?: string | null
  plannedArrivalTime?: string | null
  totalFee?: number | string | null
  createTime?: string | null
}

interface DashboardTrendAggregateRow {
  date: string
  orderCount: number
  freightAmount: number
}

interface DashboardConsoleResult {
  todayOrderCount: number
  todayFreightAmount: number
  pendingDispatchCount: number
  inTransitCount: number
  vehicleCount: number
  operatingVehicleCount: number
  pendingAuditVehicleCount: number
  completedTodayCount: number
  trend: DashboardTrendAggregateRow[]
  statusCounts: Record<string, number>
  transitOrders: DashboardOrderRow[]
  recentOrders: DashboardOrderRow[]
  reminders: DashboardReminder[]
}

interface DashboardTrendRange {
  start: Dayjs
  pointCount: number
  unit: 'hour' | 'day' | 'month'
  keyFormat: string
  labelFormat: string
}

function toDashboardOrder(row: DashboardOrderRow): DashboardOrder {
  return {
    id: row.id,
    orderNo: row.orderNo,
    orderStatus: row.orderStatus,
    dispatchStatus: row.dispatchStatus,
    originStation: row.originStation,
    destinationStation: row.destinationStation,
    shippingCustomerName: row.shippingCustomer?.customerName ?? row.shippingCustomerName ?? null,
    dispatchPlateNo: row.dispatchPlateNo,
    dispatchDriverName: row.dispatchDriverName,
    plannedArrivalTime: row.plannedArrivalTime,
    totalFee: row.totalFee,
    createTime: row.createTime
  }
}

function asDashboardQuery(query: unknown): SupabaseQueryLike {
  return query as SupabaseQueryLike
}

function getMondayStart(reference: Dayjs): Dayjs {
  const daysFromMonday = (reference.day() + 6) % 7
  return reference.subtract(daysFromMonday, 'day').startOf('day')
}

function getTrendRange(period: DashboardTrendPeriod, reference = dayjs()): DashboardTrendRange {
  if (period === 'today') {
    return {
      start: reference.startOf('day'),
      pointCount: 24,
      unit: 'hour',
      keyFormat: 'YYYY-MM-DD HH',
      labelFormat: 'HH:mm'
    }
  }
  if (period === 'month') {
    return {
      start: reference.startOf('month'),
      pointCount: reference.daysInMonth(),
      unit: 'day',
      keyFormat: 'YYYY-MM-DD',
      labelFormat: 'MM/DD'
    }
  }
  if (period === 'year') {
    return {
      start: reference.startOf('year'),
      pointCount: 12,
      unit: 'month',
      keyFormat: 'YYYY-MM',
      labelFormat: 'M月'
    }
  }
  return {
    start: getMondayStart(reference),
    pointCount: 7,
    unit: 'day',
    keyFormat: 'YYYY-MM-DD',
    labelFormat: 'MM/DD'
  }
}

function createTrend(
  rows: DashboardTrendAggregateRow[],
  range: DashboardTrendRange
): DashboardTrendPoint[] {
  const pointMap = new Map<string, DashboardTrendPoint>()
  const points = Array.from({ length: range.pointCount }, (_, index) => {
    const pointDate = range.start.add(index, range.unit)
    const point = {
      date: pointDate.format(range.keyFormat),
      label: pointDate.format(range.labelFormat),
      orderCount: 0,
      freightAmount: 0
    }
    pointMap.set(point.date, point)
    return point
  })

  rows.forEach((row) => {
    const point = pointMap.get(row.date)
    if (!point) return
    point.orderCount = Number(row.orderCount) || 0
    point.freightAmount = Number(row.freightAmount) || 0
  })

  return points
}

export async function fetchDashboardData(
  period: DashboardTrendPeriod = 'month'
): Promise<DashboardData> {
  const reference = dayjs()
  const trendRange = getTrendRange(period, reference)
  const { data } = await responseHandle<DashboardConsoleResult>(
    () =>
      asDashboardQuery(
        supabase.rpc('get_dashboard_console', {
          p_period: period,
          p_reference_date: reference.format('YYYY-MM-DD')
        })
      ),
    {
      breakReturn: true,
      errorMessage: '运营工作台加载失败，请稍后重试'
    }
  )

  if (!data) throw new Error('运营工作台未返回可用数据')

  return {
    ...data,
    trend: createTrend(data.trend, trendRange),
    transitOrders: data.transitOrders.map(toDashboardOrder),
    recentOrders: data.recentOrders.map(toDashboardOrder)
  }
}
