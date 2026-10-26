import { isPlainObjectRecord } from '@/utils/type-guards'

export interface MainlineScreenEntity {
  id: string
  label: string
}

export interface MainlineScreenOrder {
  id: string
  orderNo: string
  status: string
  origin: string | null
  destination: string | null
  signal: 'active' | 'pending' | 'exception' | 'closed'
  executionCount: number
  vehicleCount: number
  driverCount: number
  vehicles: MainlineScreenEntity[]
  drivers: MainlineScreenEntity[]
  updatedAt: string | null
}

export interface MainlineScreenOverview {
  totals: {
    orders: number
    active: number
    pending: number
    exception: number
    closed: number
    vehicles: number
    drivers: number
    linkedVehicles: number
    linkedDrivers: number
    executions: number
  }
  orders: MainlineScreenOrder[]
  asOf: string
}

function record(value: unknown): Record<string, unknown> {
  if (!isPlainObjectRecord(value)) throw new Error('运营大屏数据格式异常，请刷新后重试')
  return value
}

function text(row: Record<string, unknown>, key: string): string {
  const value = row[key]
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('运营大屏数据不完整，请刷新后重试')
  }
  return value
}

function optionalText(row: Record<string, unknown>, key: string): string | null {
  const value = row[key]
  if (value == null) return null
  if (typeof value !== 'string') throw new Error('运营大屏数据格式异常，请刷新后重试')
  return value
}

function count(row: Record<string, unknown>, key: string): number {
  const value = row[key]
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('运营大屏统计异常，请刷新后重试')
  }
  return value
}

function entities(value: unknown): MainlineScreenEntity[] {
  if (!Array.isArray(value)) throw new Error('运营大屏关联数据异常，请刷新后重试')
  return value.map((item) => {
    const row = record(item)
    return { id: text(row, 'id'), label: text(row, 'label') }
  })
}

export function parseMainlineScreenOverview(value: unknown): MainlineScreenOverview {
  const data = record(value)
  const totals = record(data.totals)
  if (!Array.isArray(data.orders)) throw new Error('运营大屏订单数据异常，请刷新后重试')
  const orders = data.orders.map((item: unknown): MainlineScreenOrder => {
    const row = record(item)
    const signal = text(row, 'signal')
    if (
      signal !== 'active' &&
      signal !== 'pending' &&
      signal !== 'exception' &&
      signal !== 'closed'
    ) {
      throw new Error('运营大屏状态数据异常，请刷新后重试')
    }
    return {
      id: text(row, 'id'),
      orderNo: text(row, 'orderNo'),
      status: text(row, 'status'),
      origin: optionalText(row, 'origin'),
      destination: optionalText(row, 'destination'),
      signal,
      executionCount: count(row, 'executionCount'),
      vehicleCount: count(row, 'vehicleCount'),
      driverCount: count(row, 'driverCount'),
      vehicles: entities(row.vehicles),
      drivers: entities(row.drivers),
      updatedAt: optionalText(row, 'updatedAt')
    }
  })
  return {
    totals: {
      orders: count(totals, 'orders'),
      active: count(totals, 'active'),
      pending: count(totals, 'pending'),
      exception: count(totals, 'exception'),
      closed: count(totals, 'closed'),
      vehicles: count(totals, 'vehicles'),
      drivers: count(totals, 'drivers'),
      linkedVehicles: count(totals, 'linkedVehicles'),
      linkedDrivers: count(totals, 'linkedDrivers'),
      executions: count(totals, 'executions')
    },
    orders,
    asOf: text(data, 'asOf')
  }
}
