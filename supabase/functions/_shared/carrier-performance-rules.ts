export type CarrierPerformanceSeverity = 'critical' | 'high' | 'medium'
export type CarrierPerformanceRiskLevel = CarrierPerformanceSeverity | 'low'
export type CarrierCooperationStrategy =
  | 'manual_qualification_review'
  | 'conditional_cooperation'
  | 'improve_and_monitor'
  | 'preferred_partner'
  | 'insufficient_evidence'

export interface CarrierPerformanceSignal {
  type: string
  severity: CarrierPerformanceSeverity
  title: string
  detail: string
  evidence: string[]
}

export interface CarrierPerformanceWaybill {
  id: string
  waybillNo: string
  route: string
  status: string
  freightAmount: number | null
  plannedUnloadTime: string | null
  arrivedAt: string | null
  riskScore: number
  reasons: string[]
}

export interface CarrierPerformanceAssessment {
  carrierId: string
  carrierCode: string
  companyName: string
  riskLevel: CarrierPerformanceRiskLevel
  riskScore: number
  performanceScore: number
  confidence: number
  cooperationStrategy: CarrierCooperationStrategy
  summary: string
  signals: CarrierPerformanceSignal[]
  riskWaybills: CarrierPerformanceWaybill[]
  recommendedActions: string[]
  limitations: string[]
  metrics: {
    waybillCount: number
    completedCount: number
    cancelledCount: number
    activeCount: number
    completionRate: number
    cancellationRate: number
    onTimeRate: number | null
    onTimeSampleCount: number
    routeCount: number
    totalFreightAmount: number | null
    totalCostAmount: number
    costToFreightRate: number | null
    pendingCostCount: number
    rejectedCostCount: number
    openStatementCount: number
    driverCount: number
    vehicleCount: number
    daysSinceLastWaybill: number | null
  }
}

export interface CarrierPerformanceInput {
  carrier: Record<string, unknown>
  waybills?: Array<Record<string, unknown>>
  costs?: Array<Record<string, unknown>>
  statements?: Array<Record<string, unknown>>
  driverCount?: number | null
  vehicleCount?: number | null
}

interface AssessmentOptions {
  now?: Date
}

interface NormalizedWaybill {
  id: string
  waybillNo: string
  route: string
  status: string
  freightAmount: number | null
  plannedUnloadTime: string | null
  arrivedAt: string | null
  createTime: string | null
}

const DAY_MS = 86_400_000
const COMPLETED_STATUSES = new Set(['completed', 'signed'])
const ACTIVE_STATUSES = new Set([
  'accepted',
  'loaded',
  'departed',
  'arrived',
  'unloaded',
  'in_transit'
])
const CLOSED_STATEMENT_STATUSES = new Set(['approved', 'paid', 'settled', 'voided'])

function field(row: Record<string, unknown>, snakeKey: string, camelKey: string): unknown {
  return row[snakeKey] ?? row[camelKey]
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function number(value: unknown): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '' || value === '***') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function boolean(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1'
}

function timestamp(value: unknown): number | null {
  const parsed = Date.parse(text(value))
  return Number.isFinite(parsed) ? parsed : null
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits
  return Math.round((value + Number.EPSILON) * factor) / factor
}

function percentage(part: number, total: number): number {
  return total > 0 ? round((part / total) * 100) : 0
}

function normalizeWaybill(row: Record<string, unknown>): NormalizedWaybill {
  const origin = text(field(row, 'origin_city', 'originCity'))
  const destination = text(field(row, 'destination_city', 'destinationCity'))
  return {
    id: text(field(row, 'id', 'id')),
    waybillNo: text(field(row, 'waybill_no', 'waybillNo')) || '未编号运单',
    route: [origin, destination].filter(Boolean).join(' → ') || '路线待补充',
    status: text(field(row, 'status', 'status')).toLowerCase() || 'unknown',
    freightAmount: optionalNumber(field(row, 'freight_amount', 'freightAmount')),
    plannedUnloadTime: text(field(row, 'planned_unload_time', 'plannedUnloadTime')) || null,
    arrivedAt: text(field(row, 'arrived_at', 'arrivedAt')) || null,
    createTime: text(field(row, 'create_time', 'createTime')) || null
  }
}

function buildRiskWaybill(row: NormalizedWaybill, now: number): CarrierPerformanceWaybill | null {
  const reasons: string[] = []
  let riskScore = 0
  if (row.status === 'cancelled') {
    reasons.push('运单已取消')
    riskScore = 88
  }
  const plannedAt = timestamp(row.plannedUnloadTime)
  const arrivedAt = timestamp(row.arrivedAt)
  if (plannedAt !== null && arrivedAt !== null && arrivedAt > plannedAt) {
    const lateHours = Math.max(1, Math.ceil((arrivedAt - plannedAt) / 3_600_000))
    reasons.push(`晚于计划到达 ${lateHours} 小时`)
    riskScore = Math.max(riskScore, lateHours >= 24 ? 86 : 72)
  }
  if (
    plannedAt !== null &&
    plannedAt < now &&
    arrivedAt === null &&
    !COMPLETED_STATUSES.has(row.status) &&
    row.status !== 'cancelled'
  ) {
    reasons.push('已超过计划到达时间且未登记到达')
    riskScore = Math.max(riskScore, 84)
  }
  if (!reasons.length) return null
  return {
    id: row.id,
    waybillNo: row.waybillNo,
    route: row.route,
    status: row.status,
    freightAmount: row.freightAmount === null ? null : round(row.freightAmount, 2),
    plannedUnloadTime: row.plannedUnloadTime,
    arrivedAt: row.arrivedAt,
    riskScore,
    reasons
  }
}

function riskLevel(score: number): CarrierPerformanceRiskLevel {
  if (score >= 85) return 'critical'
  if (score >= 70) return 'high'
  if (score >= 45) return 'medium'
  return 'low'
}

export function assessCarrierPerformance(
  input: CarrierPerformanceInput,
  options: AssessmentOptions = {}
): CarrierPerformanceAssessment {
  const now = options.now?.getTime() ?? Date.now()
  const carrierId = text(field(input.carrier, 'id', 'id'))
  const carrierCode = text(field(input.carrier, 'carrier_code', 'carrierCode')) || '--'
  const companyName = text(field(input.carrier, 'company_name', 'companyName')) || '未命名承运商'
  const waybills = (input.waybills ?? []).map(normalizeWaybill)
  const costs = input.costs ?? []
  const statements = input.statements ?? []
  const driverCount = Math.max(0, Math.trunc(number(input.driverCount)))
  const vehicleCount = Math.max(0, Math.trunc(number(input.vehicleCount)))
  const completed = waybills.filter((row) => COMPLETED_STATUSES.has(row.status))
  const cancelled = waybills.filter((row) => row.status === 'cancelled')
  const active = waybills.filter((row) => ACTIVE_STATUSES.has(row.status))
  const measurableOnTime = waybills.filter(
    (row) => timestamp(row.plannedUnloadTime) !== null && timestamp(row.arrivedAt) !== null
  )
  const onTimeCount = measurableOnTime.filter(
    (row) => timestamp(row.arrivedAt)! <= timestamp(row.plannedUnloadTime)!
  ).length
  const onTimeRate = measurableOnTime.length
    ? percentage(onTimeCount, measurableOnTime.length)
    : null
  const cancellationRate = percentage(cancelled.length, waybills.length)
  const completionRate = percentage(completed.length, waybills.length)
  const routeCount = new Set(waybills.map((row) => row.route).filter(Boolean)).size
  const freightAccessComplete = waybills.every((row) => row.freightAmount !== null)
  const totalFreightAmount = freightAccessComplete
    ? waybills.reduce((sum, row) => sum + (row.freightAmount ?? 0), 0)
    : null
  const totalCostAmount = costs.reduce(
    (sum, row) => sum + number(field(row, 'amount', 'amount')),
    0
  )
  const costToFreightRate =
    totalFreightAmount !== null && totalFreightAmount > 0
      ? percentage(totalCostAmount, totalFreightAmount)
      : null
  const pendingCostCount = costs.filter((row) => {
    const status = text(field(row, 'audit_status', 'auditStatus')).toLowerCase()
    return status === 'draft' || status === 'submitted' || status === 'pending'
  }).length
  const rejectedCostCount = costs.filter(
    (row) => text(field(row, 'audit_status', 'auditStatus')).toLowerCase() === 'rejected'
  ).length
  const openStatementCount = statements.filter(
    (row) => !CLOSED_STATEMENT_STATUSES.has(text(field(row, 'status', 'status')).toLowerCase())
  ).length
  const latestWaybillAt = Math.max(0, ...waybills.map((row) => timestamp(row.createTime) ?? 0))
  const daysSinceLastWaybill = latestWaybillAt
    ? Math.max(0, Math.floor((now - latestWaybillAt) / DAY_MS))
    : null
  const signals: CarrierPerformanceSignal[] = []
  const recommendedActions: string[] = []
  const hasBusinessLicense = Boolean(
    text(field(input.carrier, 'business_license_no', 'businessLicenseNo'))
  )
  const signedContract = boolean(field(input.carrier, 'signed_contract', 'signedContract'))

  if (!hasBusinessLicense || !signedContract) {
    signals.push({
      type: 'qualification_incomplete',
      severity: !hasBusinessLicense ? 'critical' : 'high',
      title: '合作资质基线不完整',
      detail: '承运商准入资料未形成完整闭环，不宜仅依据历史履约数据扩大合作。',
      evidence: [
        `营业执照号码：${hasBusinessLicense ? '已登记' : '未登记'}`,
        `运输合同：${signedContract ? '已签订' : '未签订'}`
      ]
    })
    recommendedActions.push('先核验营业执照、合同附件和有效期，再决定是否新增运输任务。')
  }

  if (!driverCount || !vehicleCount) {
    signals.push({
      type: 'capacity_baseline_missing',
      severity: 'medium',
      title: '运力基线不足',
      detail: '系统内司机或车辆档案为空，当前无法确认稳定承运能力。',
      evidence: [`登记司机：${driverCount} 人`, `登记车辆：${vehicleCount} 辆`]
    })
    recommendedActions.push('补齐可用司机和车辆档案，并核验对应证照与车辆健康状态。')
  }

  if (waybills.length < 5) {
    signals.push({
      type: 'history_insufficient',
      severity: 'medium',
      title: '履约样本不足',
      detail: '历史运单数量不足以形成稳定的准点率和取消率判断。',
      evidence: [`可分析运单：${waybills.length} 票`, '建议基线：至少 5 票']
    })
    recommendedActions.push('先按小批量、低风险线路试运行，积累至少 5 票有效履约样本。')
  }

  if (waybills.length >= 5 && cancellationRate >= 15) {
    signals.push({
      type: 'cancellation_rate_high',
      severity: cancellationRate >= 30 ? 'high' : 'medium',
      title: '运单取消率偏高',
      detail: '取消会直接占用调度窗口并提高临时补车成本，需要核对取消归因。',
      evidence: [`取消运单：${cancelled.length} 票`, `取消率：${cancellationRate.toFixed(1)}%`]
    })
    recommendedActions.push('逐票复核取消原因，区分客户变更、承运商拒单和内部调度问题。')
  }

  if (measurableOnTime.length >= 3 && onTimeRate !== null && onTimeRate < 85) {
    signals.push({
      type: 'on_time_rate_low',
      severity: onTimeRate < 70 ? 'high' : 'medium',
      title: '准点表现低于建议基线',
      detail: '可计量样本中的准点率偏低，应先改善高频线路的发车与到达记录。',
      evidence: [`准点率：${onTimeRate.toFixed(1)}%`, `可计量样本：${measurableOnTime.length} 票`]
    })
    recommendedActions.push('优先复盘延误运单，核对计划时窗、实际到达和异常上报是否完整。')
  }

  if (pendingCostCount || rejectedCostCount) {
    signals.push({
      type: 'cost_governance_backlog',
      severity: rejectedCostCount ? 'high' : 'medium',
      title: '承运费用存在治理积压',
      detail: '待审核或被驳回费用会降低承运成本与绩效判断的可信度。',
      evidence: [`待处理费用：${pendingCostCount} 条`, `驳回费用：${rejectedCostCount} 条`]
    })
    recommendedActions.push('先完成费用审核与驳回项修正，再比较承运商成本表现。')
  }

  if (openStatementCount) {
    signals.push({
      type: 'settlement_backlog',
      severity: openStatementCount >= 3 ? 'high' : 'medium',
      title: '承运结算尚未闭环',
      detail: '未关闭对账单会影响合作稳定性，也可能掩盖费用争议。',
      evidence: [`未关闭承运对账单：${openStatementCount} 笔`]
    })
    recommendedActions.push('核对未关闭对账单的审核、付款和争议原因，明确下一处理节点。')
  }

  if (daysSinceLastWaybill !== null && daysSinceLastWaybill > 90) {
    signals.push({
      type: 'activity_stale',
      severity: 'medium',
      title: '近期缺少合作活动',
      detail: '距离最近一票运单时间较长，历史履约表现可能已不能代表当前运力。',
      evidence: [`距最近运单：${daysSinceLastWaybill} 天`]
    })
    recommendedActions.push('重新确认联系人、可用运力、服务线路与报价有效性后再恢复合作。')
  }

  const riskWaybills = waybills
    .map((row) => buildRiskWaybill(row, now))
    .filter((row): row is CarrierPerformanceWaybill => Boolean(row))
    .sort((left, right) => right.riskScore - left.riskScore)
    .slice(0, 8)
  const severityScore = Math.max(
    0,
    ...signals.map((signal) =>
      signal.severity === 'critical' ? 94 : signal.severity === 'high' ? 76 : 52
    )
  )
  const riskScore = Math.min(
    100,
    Math.max(
      severityScore,
      cancellationRate >= 30 ? 82 : cancellationRate >= 15 ? 62 : 0,
      onTimeRate !== null && measurableOnTime.length >= 3
        ? onTimeRate < 70
          ? 78
          : onTimeRate < 85
            ? 58
            : 0
        : 0,
      !waybills.length ? 48 : 18
    )
  )
  const level = riskLevel(riskScore)
  const cooperationStrategy: CarrierCooperationStrategy =
    !hasBusinessLicense || !signedContract
      ? 'manual_qualification_review'
      : waybills.length < 5
        ? 'insufficient_evidence'
        : level === 'critical' || level === 'high'
          ? 'conditional_cooperation'
          : level === 'medium'
            ? 'improve_and_monitor'
            : 'preferred_partner'
  const performanceScore = Math.max(0, 100 - riskScore)
  const confidence =
    waybills.length >= 20
      ? 0.94
      : waybills.length >= 10
        ? 0.9
        : waybills.length >= 5
          ? 0.82
          : waybills.length
            ? 0.68
            : 0.55

  if (!recommendedActions.length) {
    recommendedActions.push('保持当前合作节奏，按月复核准点率、取消率、费用审核和结算闭环。')
  }

  const summary = waybills.length
    ? `${companyName} 当前纳入 ${waybills.length} 票履约样本，完成率 ${completionRate.toFixed(1)}%，取消率 ${cancellationRate.toFixed(1)}%${onTimeRate === null ? '；准点样本暂不足' : `，可计量准点率 ${onTimeRate.toFixed(1)}%`}。`
    : `${companyName} 暂无可分析的历史运单，当前结论以准入资料和运力档案完整度为主。`

  return {
    carrierId,
    carrierCode,
    companyName,
    riskLevel: level,
    riskScore,
    performanceScore,
    confidence,
    cooperationStrategy,
    summary,
    signals,
    riskWaybills,
    recommendedActions,
    limitations: [
      '本次评估基于系统内最近最多 200 票运单、300 条费用和 100 笔承运对账单。',
      '准点率只统计同时具备计划到达和实际到达时间的运单，缺失时间不会被推断为准点。',
      ...(!freightAccessComplete ? ['当前用户无权查看全部运费，运费合计与成本运费比未计算。'] : []),
      '结果用于合作复核和数据治理，不会自动停用承运商、修改合同、报价、费用或结算状态。'
    ],
    metrics: {
      waybillCount: waybills.length,
      completedCount: completed.length,
      cancelledCount: cancelled.length,
      activeCount: active.length,
      completionRate,
      cancellationRate,
      onTimeRate,
      onTimeSampleCount: measurableOnTime.length,
      routeCount,
      totalFreightAmount: totalFreightAmount === null ? null : round(totalFreightAmount, 2),
      totalCostAmount: round(totalCostAmount, 2),
      costToFreightRate,
      pendingCostCount,
      rejectedCostCount,
      openStatementCount,
      driverCount,
      vehicleCount,
      daysSinceLastWaybill
    }
  }
}
