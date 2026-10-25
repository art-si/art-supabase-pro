export type VehicleHealthSignalType =
  | 'insurance_expired'
  | 'insurance_expiring'
  | 'inspection_expired'
  | 'inspection_expiring'
  | 'maintenance_overdue'
  | 'maintenance_history_missing'
  | 'repair_frequency_high'
  | 'unresolved_accident'
  | 'routine_inspection_failed'
  | 'part_service_due'
  | 'mileage_data_stale'

export type VehicleHealthSeverity = 'critical' | 'high' | 'medium'
export type VehicleHealthRiskLevel = VehicleHealthSeverity | 'low'

export interface VehicleHealthSignal {
  type: VehicleHealthSignalType
  severity: VehicleHealthSeverity
  title: string
  detail: string
  evidence: string[]
}

export interface VehicleHealthAssessment {
  vehicleId: string
  plateNo: string
  vehicleType: string
  operationStatus: string
  riskLevel: VehicleHealthRiskLevel
  riskScore: number
  healthScore: number
  confidence: number
  summary: string
  signals: VehicleHealthSignal[]
  recommendedActions: string[]
  limitations: string[]
  metrics: {
    currentMileage: number | null
    insuranceDaysRemaining: number | null
    inspectionDaysRemaining: number | null
    daysSinceMaintenance: number | null
    repairCount90Days: number
    unresolvedAccidentCount: number
    failedRoutineInspectionCount: number
    duePartCount: number
  }
}

export interface VehicleHealthInput {
  vehicle: Record<string, unknown>
  insurance?: Array<Record<string, unknown>>
  inspections?: Array<Record<string, unknown>>
  maintenance?: Array<Record<string, unknown>>
  mileage?: Array<Record<string, unknown>>
  accidents?: Array<Record<string, unknown>>
  routineInspections?: Array<Record<string, unknown>>
  parts?: Array<Record<string, unknown>>
}

interface AssessmentOptions {
  now?: Date
  maintenanceIntervalDays?: number
  mileageStaleDays?: number
}

const DAY_MS = 86_400_000
const severityWeight: Record<VehicleHealthSeverity, number> = {
  critical: 3,
  high: 2,
  medium: 1
}

function field(row: Record<string, unknown>, snakeKey: string, camelKey: string): unknown {
  return row[snakeKey] ?? row[camelKey]
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function numberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function booleanValue(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1'
}

function timeValue(value: unknown): number | null {
  const parsed = Date.parse(text(value))
  return Number.isFinite(parsed) ? parsed : null
}

function latestBy(
  rows: Array<Record<string, unknown>>,
  snakeKey: string,
  camelKey: string
): Record<string, unknown> | null {
  return (
    [...rows].sort(
      (left, right) =>
        (timeValue(field(right, snakeKey, camelKey)) ?? 0) -
        (timeValue(field(left, snakeKey, camelKey)) ?? 0)
    )[0] ?? null
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function daysBetween(later: number, earlier: number): number {
  return Math.floor((later - earlier) / DAY_MS)
}

function daysRemaining(value: unknown, now: number): number | null {
  const target = timeValue(value)
  return target === null ? null : Math.ceil((target - now) / DAY_MS)
}

function unique(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))]
}

function dateLabel(value: unknown): string {
  const raw = text(value)
  return raw ? raw.slice(0, 10) : '未记录'
}

function signalScore(signal: VehicleHealthSignal): number {
  const scores: Record<VehicleHealthSignalType, number> = {
    insurance_expired: 96,
    inspection_expired: 96,
    unresolved_accident: 86,
    routine_inspection_failed: 82,
    maintenance_overdue: 78,
    part_service_due: 76,
    repair_frequency_high: 70,
    insurance_expiring: 62,
    inspection_expiring: 62,
    maintenance_history_missing: 55,
    mileage_data_stale: 48
  }
  return scores[signal.type]
}

function getRiskLevel(signals: VehicleHealthSignal[]): VehicleHealthRiskLevel {
  if (!signals.length) return 'low'
  return [...signals].sort(
    (left, right) => severityWeight[right.severity] - severityWeight[left.severity]
  )[0].severity
}

function createComplianceSignal(
  kind: 'insurance' | 'inspection',
  remaining: number,
  expireDate: unknown
): VehicleHealthSignal | null {
  const name = kind === 'insurance' ? '车辆保险' : '车辆年检'
  if (remaining < 0) {
    return {
      type: kind === 'insurance' ? 'insurance_expired' : 'inspection_expired',
      severity: 'critical',
      title: `${name}已过期`,
      detail: `${name}已过期 ${Math.abs(remaining)} 天，继续营运存在合规和停运风险。`,
      evidence: [`到期日期：${dateLabel(expireDate)}`, `距今已过期：${Math.abs(remaining)} 天`]
    }
  }
  if (remaining <= 30) {
    return {
      type: kind === 'insurance' ? 'insurance_expiring' : 'inspection_expiring',
      severity: remaining <= 7 ? 'high' : 'medium',
      title: `${name}即将到期`,
      detail: `${name}将在 ${remaining} 天内到期，应提前完成续保或送检安排。`,
      evidence: [`到期日期：${dateLabel(expireDate)}`, `剩余天数：${remaining} 天`]
    }
  }
  return null
}

export function assessVehicleHealth(
  input: VehicleHealthInput,
  options: AssessmentOptions = {}
): VehicleHealthAssessment {
  const now = options.now?.getTime() ?? Date.now()
  const maintenanceIntervalDays = clamp(options.maintenanceIntervalDays ?? 180, 30, 730)
  const mileageStaleDays = clamp(options.mileageStaleDays ?? 30, 7, 365)
  const vehicleId = text(field(input.vehicle, 'id', 'id'))
  const plateNo = text(field(input.vehicle, 'plate_no', 'plateNo')) || '未登记车牌'
  const vehicleType = text(field(input.vehicle, 'vehicle_type', 'vehicleType')) || '车型未记录'
  const operationStatus = text(
    field(input.vehicle, 'operation_status', 'operationStatus')
  ).toLowerCase()
  const insurance = input.insurance ?? []
  const inspections = input.inspections ?? []
  const maintenance = input.maintenance ?? []
  const mileage = input.mileage ?? []
  const accidents = input.accidents ?? []
  const routineInspections = input.routineInspections ?? []
  const parts = input.parts ?? []
  const signals: VehicleHealthSignal[] = []
  const actions: string[] = []
  const limitations = [
    '本次研判基于业务台账，不包含车辆 ECU、OBD、胎压、油耗或实时故障码。',
    '结果只提供维保优先级建议，不会自动停用车辆、创建维修单或修改业务状态。'
  ]

  const latestInsurance = latestBy(insurance, 'create_time', 'createTime')
  const insuranceExpireDates = latestInsurance
    ? [
        field(latestInsurance, 'commercial_expire_date', 'commercialExpireDate'),
        field(latestInsurance, 'compulsory_expire_date', 'compulsoryExpireDate')
      ]
    : []
  const insuranceDays = insuranceExpireDates
    .map((value) => ({ value, remaining: daysRemaining(value, now) }))
    .filter((item): item is { value: unknown; remaining: number } => item.remaining !== null)
    .sort((left, right) => left.remaining - right.remaining)[0]
  const latestInspection = latestBy(inspections, 'expire_date', 'expireDate')
  const inspectionExpireDate = latestInspection
    ? field(latestInspection, 'expire_date', 'expireDate')
    : null
  const inspectionDays = daysRemaining(inspectionExpireDate, now)

  if (insuranceDays) {
    const signal = createComplianceSignal(
      'insurance',
      insuranceDays.remaining,
      insuranceDays.value
    )
    if (signal) signals.push(signal)
  } else {
    limitations.push('未找到有效保险到期日期，无法判断续保时效。')
  }
  if (inspectionDays !== null) {
    const signal = createComplianceSignal('inspection', inspectionDays, inspectionExpireDate)
    if (signal) signals.push(signal)
  } else {
    limitations.push('未找到有效年检到期日期，无法判断送检时效。')
  }

  if (signals.some((item) => item.type === 'insurance_expired')) {
    actions.push('立即核实交强险与商业险状态；完成续保前不要继续安排营运任务。')
  } else if (signals.some((item) => item.type === 'insurance_expiring')) {
    actions.push('在到期日前完成续保询价、审批和保单归档。')
  }
  if (signals.some((item) => item.type === 'inspection_expired')) {
    actions.push('立即安排年检并核实车辆是否具备继续营运条件。')
  } else if (signals.some((item) => item.type === 'inspection_expiring')) {
    actions.push('预留停驶窗口并预约年检，避免影响后续配载。')
  }

  const latestMaintenance = latestBy(maintenance, 'start_time', 'startTime')
  const latestMaintenanceTime = latestMaintenance
    ? timeValue(field(latestMaintenance, 'start_time', 'startTime'))
    : null
  const daysSinceMaintenance = latestMaintenanceTime
    ? daysBetween(now, latestMaintenanceTime)
    : null
  if (daysSinceMaintenance === null) {
    signals.push({
      type: 'maintenance_history_missing',
      severity: 'medium',
      title: '缺少维保基线',
      detail: '未找到维修保养记录，无法建立车辆的周期性维保基线。',
      evidence: ['维修保养记录：0 条']
    })
    actions.push('补录最近一次保养时间、项目和里程，建立后续预警基线。')
  } else if (daysSinceMaintenance > maintenanceIntervalDays) {
    const overdueDays = daysSinceMaintenance - maintenanceIntervalDays
    signals.push({
      type: 'maintenance_overdue',
      severity: overdueDays >= 90 ? 'high' : 'medium',
      title: '周期保养已逾期',
      detail: `距最近一次维保已 ${daysSinceMaintenance} 天，超过当前 ${maintenanceIntervalDays} 天检查基线。`,
      evidence: [
        `最近维保：${dateLabel(field(latestMaintenance!, 'start_time', 'startTime'))}`,
        `超过基线：${overdueDays} 天`
      ]
    })
    actions.push('结合车型手册和近期里程核实保养周期，并尽快安排进场检查。')
  }

  const repairs90Days = maintenance.filter((item) => {
    if (text(field(item, 'maintenance_type', 'maintenanceType')).toLowerCase() !== 'repair') {
      return false
    }
    const startedAt = timeValue(field(item, 'start_time', 'startTime'))
    return startedAt !== null && daysBetween(now, startedAt) <= 90
  })
  if (repairs90Days.length >= 3) {
    const totalCost = repairs90Days.reduce(
      (sum, item) => sum + (numberValue(field(item, 'cost_amount', 'costAmount')) ?? 0),
      0
    )
    signals.push({
      type: 'repair_frequency_high',
      severity: 'high',
      title: '近期维修频率偏高',
      detail: `近 90 天发生 ${repairs90Days.length} 次维修，建议排查重复故障和部件系统性问题。`,
      evidence: [`维修次数：${repairs90Days.length} 次`, `维修费用合计：¥${totalCost.toFixed(2)}`]
    })
    actions.push('对近 90 天维修项目做重复故障归因，并安排一次针对性全车检查。')
  }

  const unresolvedAccidents = accidents.filter(
    (item) => !booleanValue(field(item, 'processed', 'processed'))
  )
  if (unresolvedAccidents.length) {
    signals.push({
      type: 'unresolved_accident',
      severity: 'high',
      title: '存在未处理事故记录',
      detail: `当前有 ${unresolvedAccidents.length} 条事故记录尚未完成处理，车辆安全状态可能未闭环。`,
      evidence: unresolvedAccidents.slice(0, 3).map((item) => {
        const damageLevel = text(field(item, 'damage_level', 'damageLevel')) || '事故等级未记录'
        return `${dateLabel(field(item, 'accident_time', 'accidentTime'))} · ${damageLevel}`
      })
    })
    actions.push('核实事故维修、保险理赔和复检结论，确认安全闭环后再安排运输。')
  }

  const failedRoutineInspections = routineInspections.filter(
    (item) => text(field(item, 'check_result', 'checkResult')).toLowerCase() === 'unqualified'
  )
  if (failedRoutineInspections.length) {
    signals.push({
      type: 'routine_inspection_failed',
      severity: 'high',
      title: '例检存在不合格记录',
      detail: `识别到 ${failedRoutineInspections.length} 条不合格例检记录，应核实整改和复检状态。`,
      evidence: failedRoutineInspections.slice(0, 3).map((item) => {
        const condition = text(field(item, 'check_condition', 'checkCondition')) || '问题未说明'
        return `${dateLabel(field(item, 'inspection_time', 'inspectionTime'))} · ${condition}`
      })
    })
    actions.push('逐条核实例检问题的处理方法与复检结果，未闭环项目不得忽略。')
  }

  const latestMileage = latestBy(mileage, 'end_time', 'endTime') ?? latestBy(mileage, 'start_time', 'startTime')
  const currentMileage = latestMileage
    ? numberValue(field(latestMileage, 'end_mileage', 'endMileage')) ??
      numberValue(field(latestMileage, 'running_mileage', 'runningMileage')) ??
      numberValue(field(latestMileage, 'start_mileage', 'startMileage'))
    : null
  const latestMileageTime = latestMileage
    ? timeValue(field(latestMileage, 'end_time', 'endTime')) ??
      timeValue(field(latestMileage, 'start_time', 'startTime'))
    : null
  if (!latestMileageTime || daysBetween(now, latestMileageTime) > mileageStaleDays) {
    const staleDays = latestMileageTime ? daysBetween(now, latestMileageTime) : null
    signals.push({
      type: 'mileage_data_stale',
      severity: 'medium',
      title: '里程数据不够新',
      detail: staleDays === null
        ? '未找到有效里程记录，无法判断按里程触发的维保需求。'
        : `最近里程记录距今 ${staleDays} 天，可能影响按里程维保判断。`,
      evidence: [
        `最近里程：${currentMileage === null ? '未记录' : `${currentMileage.toLocaleString('zh-CN')} km`}`,
        `最近记录时间：${latestMileageTime ? new Date(latestMileageTime).toISOString().slice(0, 10) : '未记录'}`
      ]
    })
    actions.push('更新当前里程，作为轮胎、机油和关键部件寿命判断的基础。')
  }

  const dueParts = parts.filter((item) => {
    if (text(field(item, 'status', 'status')).toLowerCase() !== 'normal') return false
    const usedMileage = numberValue(field(item, 'used_mileage', 'usedMileage'))
    const serviceMileage = numberValue(field(item, 'service_mileage', 'serviceMileage'))
    const mileageDue =
      booleanValue(field(item, 'service_mileage_enabled', 'serviceMileageEnabled')) &&
      usedMileage !== null &&
      serviceMileage !== null &&
      usedMileage >= serviceMileage
    const enableTime = timeValue(field(item, 'enable_date', 'enableDate'))
    const serviceYears = numberValue(field(item, 'service_years', 'serviceYears'))
    const dateDue =
      booleanValue(field(item, 'service_years_enabled', 'serviceYearsEnabled')) &&
      enableTime !== null &&
      serviceYears !== null &&
      now >= enableTime + serviceYears * 365.25 * DAY_MS
    return mileageDue || dateDue
  })
  if (dueParts.length) {
    signals.push({
      type: 'part_service_due',
      severity: dueParts.length >= 3 ? 'high' : 'medium',
      title: '零部件达到维护基线',
      detail: `有 ${dueParts.length} 个在用零部件达到台账中的里程或年限维护基线。`,
      evidence: dueParts.slice(0, 4).map((item) => {
        const partName = text(field(item, 'part_name', 'partName')) || '未命名部件'
        const usedMileage = numberValue(field(item, 'used_mileage', 'usedMileage'))
        const serviceMileage = numberValue(field(item, 'service_mileage', 'serviceMileage'))
        return `${partName}：已用 ${usedMileage ?? '--'} km / 基线 ${serviceMileage ?? '--'} km`
      })
    })
    actions.push('核对到期部件的实际磨损、质保和更换记录，按检查结果安排更换。')
  }

  signals.sort(
    (left, right) =>
      severityWeight[right.severity] - severityWeight[left.severity] ||
      signalScore(right) - signalScore(left)
  )
  const riskLevel = getRiskLevel(signals)
  const riskScore = signals.length
    ? clamp(Math.max(...signals.map(signalScore)) + Math.min(6, (signals.length - 1) * 2), 0, 99)
    : 10
  let confidence = 0.35
  if (insurance.length) confidence += 0.1
  if (inspections.length) confidence += 0.1
  if (maintenance.length) confidence += 0.12
  if (mileage.length) confidence += 0.12
  if (routineInspections.length) confidence += 0.06
  if (parts.length) confidence += 0.05
  if (accidents.length) confidence += 0.05

  return {
    vehicleId,
    plateNo,
    vehicleType,
    operationStatus,
    riskLevel,
    riskScore,
    healthScore: clamp(100 - riskScore, 1, 100),
    confidence: Math.round(clamp(confidence, 0.35, 0.95) * 100) / 100,
    summary: signals.length
      ? `${plateNo} 识别到 ${signals.length} 项车辆健康风险，建议按风险优先级完成核查。`
      : `${plateNo} 当前未发现基于合规、维保和安全台账的明确风险。`,
    signals,
    recommendedActions: unique(
      actions.length ? actions : ['保持例检、里程和维保台账更新，按车辆手册执行周期保养。']
    ).slice(0, 7),
    limitations: unique(limitations),
    metrics: {
      currentMileage,
      insuranceDaysRemaining: insuranceDays?.remaining ?? null,
      inspectionDaysRemaining: inspectionDays,
      daysSinceMaintenance,
      repairCount90Days: repairs90Days.length,
      unresolvedAccidentCount: unresolvedAccidents.length,
      failedRoutineInspectionCount: failedRoutineInspections.length,
      duePartCount: dueParts.length
    }
  }
}

