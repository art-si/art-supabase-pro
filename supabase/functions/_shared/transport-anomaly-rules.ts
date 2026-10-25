export type TransportAnomalyType =
  | 'arrival_overdue'
  | 'departure_overdue'
  | 'data_stale'
  | 'missing_assignment'
  | 'missing_schedule'
  | 'status_mismatch'

export type TransportAnomalySeverity = 'critical' | 'high' | 'medium'
export type TransportRiskLevel = TransportAnomalySeverity | 'low'

export interface TransportAnomalySignal {
  type: TransportAnomalyType
  severity: TransportAnomalySeverity
  title: string
  detail: string
  evidence: string[]
}

export interface TransportAnomalyAssessment {
  orderId: string
  orderNo: string
  route: string
  orderStatus: string
  waybillStatus: string
  riskLevel: TransportRiskLevel
  riskScore: number
  confidence: number
  summary: string
  signals: TransportAnomalySignal[]
  recommendedActions: string[]
  limitations: string[]
  metrics: {
    overdueArrivalHours: number
    overdueDepartureHours: number
    staleHours: number
    hasVehicle: boolean
    hasDriver: boolean
    hasSchedule: boolean
  }
}

export interface TransportAnomaly {
  orderId: string
  orderNo: string
  type: TransportAnomalyType
  severity: TransportAnomalySeverity
  route: string
  orderStatus: string
  dispatchStatus: string
  plannedDepartureTime: string | null
  plannedArrivalTime: string | null
  overdueHours: number
  staleHours: number
}

interface AssessmentOptions {
  now?: Date
  staleHours?: number
}

const TERMINAL_STATUSES = new Set(['signed', 'completed', 'cancelled', 'canceled', 'closed'])
const ACTIVE_ORDER_STATUSES = new Set([
  'pending_load',
  'pending_order',
  'pending_pickup',
  'transporting'
])
const NOT_DEPARTED_ORDER_STATUSES = new Set(['pending_load', 'pending_order', 'pending_pickup'])
const ACTIVE_WAYBILL_STATUSES = new Set([
  'pending',
  'accepted',
  'loading',
  'transporting',
  'in_transit',
  'running',
  'unloading'
])
const TRANSPORTING_WAYBILL_STATUSES = new Set(['transporting', 'in_transit', 'running'])

const severityWeight: Record<TransportAnomalySeverity, number> = {
  critical: 3,
  high: 2,
  medium: 1
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function field(row: Record<string, unknown>, snakeKey: string, camelKey: string): unknown {
  return row[snakeKey] ?? row[camelKey]
}

function timeValue(value: unknown): number | null {
  const parsed = Date.parse(text(value))
  return Number.isFinite(parsed) ? parsed : null
}

function hoursBetween(later: number, earlier: number): number {
  return Math.max(0, Math.round(((later - earlier) / 3_600_000) * 10) / 10)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function unique(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))]
}

function formatHours(value: number): string {
  if (value < 1) return '不足 1 小时'
  return `${value} 小时`
}

function signalScore(signal: TransportAnomalySignal): number {
  const scores: Record<TransportAnomalyType, number> = {
    arrival_overdue: signal.severity === 'critical' ? 92 : 76,
    departure_overdue: signal.severity === 'critical' ? 88 : 70,
    data_stale: signal.severity === 'high' ? 72 : 52,
    missing_assignment: 78,
    missing_schedule: 46,
    status_mismatch: 74
  }
  return scores[signal.type]
}

function getRiskLevel(signals: TransportAnomalySignal[]): TransportRiskLevel {
  if (!signals.length) return 'low'
  return [...signals].sort(
    (left, right) => severityWeight[right.severity] - severityWeight[left.severity]
  )[0].severity
}

export function assessTransportAnomaly(
  row: Record<string, unknown>,
  options: AssessmentOptions = {}
): TransportAnomalyAssessment {
  const now = options.now?.getTime() ?? Date.now()
  const staleThreshold = clamp(options.staleHours ?? 24, 1, 168)
  const orderId = text(field(row, 'id', 'id'))
  const orderNo = text(field(row, 'order_no', 'orderNo')) || '未编号'
  const orderStatus = text(field(row, 'order_status', 'orderStatus')).toLowerCase()
  const waybillStatus = text(field(row, 'waybill_status', 'waybillStatus')).toLowerCase()
  const dispatchStatus = text(field(row, 'dispatch_status', 'dispatchStatus')).toLowerCase()
  const origin = text(field(row, 'origin_station', 'originStation')) || '起点未设置'
  const destination = text(field(row, 'destination_station', 'destinationStation')) || '终点未设置'
  const route = `${origin} → ${destination}`
  const plannedDepartureText = text(
    field(row, 'planned_departure_time', 'plannedDepartureTime') ??
      field(row, 'planned_load_time', 'plannedLoadTime')
  )
  const plannedArrivalText = text(
    field(row, 'planned_arrival_time', 'plannedArrivalTime') ??
      field(row, 'planned_unload_time', 'plannedUnloadTime')
  )
  const plannedDeparture = timeValue(plannedDepartureText)
  const plannedArrival = timeValue(plannedArrivalText)
  const orderUpdatedAt = timeValue(field(row, 'update_time', 'updateTime'))
  const waybillUpdatedAt = timeValue(field(row, 'waybill_update_time', 'waybillUpdateTime'))
  const latestUpdate = Math.max(orderUpdatedAt ?? 0, waybillUpdatedAt ?? 0) || null
  const overdueArrivalHours = plannedArrival && plannedArrival < now
    ? hoursBetween(now, plannedArrival)
    : 0
  const overdueDepartureHours = plannedDeparture && plannedDeparture < now
    ? hoursBetween(now, plannedDeparture)
    : 0
  const staleHours = latestUpdate && latestUpdate < now ? hoursBetween(now, latestUpdate) : 0
  const vehicleId = text(
    field(row, 'dispatch_vehicle_id', 'dispatchVehicleId') ?? field(row, 'vehicle_id', 'vehicleId')
  )
  const driverId = text(
    field(row, 'dispatch_driver_id', 'dispatchDriverId') ?? field(row, 'driver_id', 'driverId')
  )
  const hasVehicle = Boolean(vehicleId || text(field(row, 'dispatch_plate_no', 'dispatchPlateNo')))
  const hasDriver = Boolean(
    driverId || text(field(row, 'dispatch_driver_name', 'dispatchDriverName'))
  )
  const hasSchedule = Boolean(plannedDeparture && plannedArrival)
  const isTerminal = TERMINAL_STATUSES.has(orderStatus)
  const isActive = ACTIVE_ORDER_STATUSES.has(orderStatus) || ACTIVE_WAYBILL_STATUSES.has(waybillStatus)
  const signals: TransportAnomalySignal[] = []
  const actions: string[] = []
  const limitations = ['当前未接入连续 GPS 上报时间，本次不会判断真实偏航或车辆物理停驶。']

  if (!isTerminal && isActive && overdueArrivalHours > 0) {
    const severity: TransportAnomalySeverity = overdueArrivalHours >= 24 ? 'critical' : 'high'
    signals.push({
      type: 'arrival_overdue',
      severity,
      title: '计划到达已超时',
      detail: `已超过计划到达时间 ${formatHours(overdueArrivalHours)}。`,
      evidence: [`计划到达：${plannedArrivalText}`, `当前运输状态：${orderStatus || waybillStatus}`]
    })
    actions.push('立即联系司机核实当前位置、车辆状况和最新预计到达时间。')
    actions.push('向收货方同步延误信息，并在确认后更新计划到达时间。')
    if (severity === 'critical') actions.push('升级给调度负责人，登记运输异常及责任归因。')
  }

  if (
    !isTerminal &&
    isActive &&
    NOT_DEPARTED_ORDER_STATUSES.has(orderStatus) &&
    overdueDepartureHours > 0
  ) {
    const severity: TransportAnomalySeverity = overdueDepartureHours >= 12 ? 'critical' : 'high'
    signals.push({
      type: 'departure_overdue',
      severity,
      title: '计划发车已超时',
      detail: `已超过计划发车时间 ${formatHours(overdueDepartureHours)}。`,
      evidence: [`计划发车：${plannedDepartureText}`, `当前订单状态：${orderStatus}`]
    })
    actions.push('核实车辆到位、装载进度和司机接单情况。')
    actions.push('确认新的发车时间后通知发货方，并保留变更原因。')
  }

  if (
    !isTerminal &&
    ['pending_order', 'pending_pickup', 'transporting'].includes(orderStatus) &&
    (!hasVehicle || !hasDriver)
  ) {
    signals.push({
      type: 'missing_assignment',
      severity: 'high',
      title: '运输资源信息不完整',
      detail: `当前记录缺少${!hasVehicle && !hasDriver ? '车辆和司机' : !hasVehicle ? '车辆' : '司机'}信息。`,
      evidence: [`订单状态：${orderStatus}`, `配载状态：${dispatchStatus || '未设置'}`]
    })
    actions.push('补齐并核验车辆、司机及联系方式后再继续运输流转。')
  }

  if (!isTerminal && isActive && !hasSchedule) {
    signals.push({
      type: 'missing_schedule',
      severity: 'medium',
      title: '运输计划时间不完整',
      detail: `当前缺少${!plannedDeparture && !plannedArrival ? '计划发车和到达时间' : !plannedDeparture ? '计划发车时间' : '计划到达时间'}。`,
      evidence: [`计划发车：${plannedDepartureText || '未设置'}`, `计划到达：${plannedArrivalText || '未设置'}`]
    })
    actions.push('补充计划发车与到达时间，作为后续时效预警基线。')
    limitations.push('计划时间不完整会降低时效风险判断的可信度。')
  }

  if (!isTerminal && isActive && staleHours >= staleThreshold) {
    const severity: TransportAnomalySeverity = staleHours >= 72 ? 'high' : 'medium'
    signals.push({
      type: 'data_stale',
      severity,
      title: '运输业务记录长时间未更新',
      detail: `订单或运单记录已有 ${formatHours(staleHours)} 未更新。`,
      evidence: [`最近业务更新时间距今：${formatHours(staleHours)}`, `预警阈值：${staleThreshold} 小时`]
    })
    actions.push('联系司机或调度员确认实际进展，并补录最新运输节点。')
    limitations.push('该信号依据业务记录更新时间，不等同于 GPS 车辆停驶。')
  }

  const statusMismatch =
    (!isTerminal && orderStatus === 'transporting' && waybillStatus &&
      !TRANSPORTING_WAYBILL_STATUSES.has(waybillStatus)) ||
    (!isTerminal && TERMINAL_STATUSES.has(waybillStatus) && ACTIVE_ORDER_STATUSES.has(orderStatus))
  if (statusMismatch) {
    signals.push({
      type: 'status_mismatch',
      severity: 'high',
      title: '订单与运单状态不一致',
      detail: '订单和运单对同一运输任务记录了不同的生命周期阶段。',
      evidence: [`订单状态：${orderStatus || '未设置'}`, `运单状态：${waybillStatus || '未设置'}`]
    })
    actions.push('核对实际运输节点，并通过现有业务操作修正订单与运单状态。')
  }

  signals.sort(
    (left, right) =>
      severityWeight[right.severity] - severityWeight[left.severity] ||
      signalScore(right) - signalScore(left)
  )
  const riskLevel = getRiskLevel(signals)
  const riskScore = signals.length
    ? clamp(Math.max(...signals.map(signalScore)) + Math.min(7, (signals.length - 1) * 3), 0, 99)
    : 12
  let confidence = 0.45
  if (plannedDeparture) confidence += 0.1
  if (plannedArrival) confidence += 0.15
  if (latestUpdate) confidence += 0.1
  if (hasVehicle) confidence += 0.05
  if (hasDriver) confidence += 0.05
  if (waybillStatus) confidence += 0.05

  return {
    orderId,
    orderNo,
    route,
    orderStatus,
    waybillStatus,
    riskLevel,
    riskScore,
    confidence: Math.round(clamp(confidence, 0.35, 0.95) * 100) / 100,
    summary: signals.length
      ? `${orderNo} 识别到 ${signals.length} 项运输风险，最高等级为${riskLevel === 'critical' ? '严重' : riskLevel === 'high' ? '高' : '中'}风险。`
      : `${orderNo} 当前未发现基于计划时间、配载和业务状态的明确异常。`,
    signals,
    recommendedActions: unique(
      actions.length ? actions : ['保持现有运输跟踪频率，按计划节点更新业务状态。']
    ).slice(0, 6),
    limitations: unique(limitations),
    metrics: {
      overdueArrivalHours,
      overdueDepartureHours,
      staleHours,
      hasVehicle,
      hasDriver,
      hasSchedule
    }
  }
}

export function detectTransportAnomalies(
  rows: Array<Record<string, unknown>>,
  options: AssessmentOptions & { limit?: number } = {}
): TransportAnomaly[] {
  const limit = clamp(Math.trunc(options.limit ?? 20), 1, 50)

  return rows
    .map((row): TransportAnomaly | null => {
      const assessment = assessTransportAnomaly(row, options)
      const primarySignal = assessment.signals[0]
      if (!primarySignal) return null

      const overdueHours = primarySignal.type === 'arrival_overdue'
        ? assessment.metrics.overdueArrivalHours
        : primarySignal.type === 'departure_overdue'
          ? assessment.metrics.overdueDepartureHours
          : 0

      return {
        orderId: assessment.orderId,
        orderNo: assessment.orderNo,
        type: primarySignal.type,
        severity: primarySignal.severity,
        route: assessment.route,
        orderStatus: assessment.orderStatus,
        dispatchStatus: text(field(row, 'dispatch_status', 'dispatchStatus')),
        plannedDepartureTime:
          text(field(row, 'planned_departure_time', 'plannedDepartureTime')) || null,
        plannedArrivalTime:
          text(field(row, 'planned_arrival_time', 'plannedArrivalTime')) || null,
        overdueHours,
        staleHours: assessment.metrics.staleHours
      }
    })
    .filter((item): item is TransportAnomaly => Boolean(item))
    .sort((left, right) => {
      return (
        severityWeight[right.severity] - severityWeight[left.severity] ||
        right.overdueHours - left.overdueHours ||
        right.staleHours - left.staleHours
      )
    })
    .slice(0, limit)
}
